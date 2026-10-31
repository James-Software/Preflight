const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
(async () => {
  const root = path.resolve(__dirname, "..");
  fs.mkdirSync(path.join(root, "work"), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(root, "work", "project-delete-ui-"));
  let projects = [{ id: 1, name: "Example" }],
    deletes = 0,
    fail = true,
    server,
    browser,
    child;
  const bridge = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "DELETE") {
      deletes++;
      await new Promise((r) => setTimeout(r, 350));
      if (fail) {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            error: "Fixture connection interrupted. Try again.",
          }),
        );
        return;
      }
      projects = projects.filter(
        (p) => p.id !== Number(req.url.split("/").at(-1)),
      );
      res.end(JSON.stringify({ deleted: true }));
      return;
    }
    res.end(JSON.stringify(projects));
  });
  try {
    await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
    const bridgeUrl = `http://127.0.0.1:${bridge.address().port}`;
    const reserve = http.createServer();
    await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
    const port = reserve.address().port;
    await new Promise((r) => reserve.close(r));
    fs.mkdirSync(path.join(fixture, "app", "api", "projects", "[id]"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "project-delete-browser-fixture", private: true }),
    );
    fs.writeFileSync(
      path.join(fixture, "next.config.mjs"),
      `export default {turbopack:{root:${JSON.stringify(root)}}};`,
    );
    fs.writeFileSync(
      path.join(fixture, "postcss.config.mjs"),
      `export default {plugins:{"@tailwindcss/postcss":{}}};`,
    );
    fs.writeFileSync(
      path.join(fixture, "app", "layout.js"),
      `import ${JSON.stringify(path.relative(path.join(fixture, "app"), path.join(root, "app", "globals.css")))}; export default function Layout({children}) {return <html lang="en"><body>{children}</body></html>}`,
    );
    fs.writeFileSync(
      path.join(fixture, "app", "page.js"),
      `import DeleteProjectButton from ${JSON.stringify(path.relative(path.join(fixture, "app"), path.join(root, "components", "DeleteProjectButton.tsx")))};export default async function Page(){const projects=await(await fetch(${JSON.stringify(bridgeUrl + "/projects")},{cache:'no-store'})).json();return <main className="p-8"><h1 id="projects-heading" tabIndex={-1}>Projects</h1><ul>{projects.map(p=><li key={p.id} data-project={p.id} className="flex items-center justify-between"><a href={'/projects/'+p.id}>{p.name}</a><DeleteProjectButton projectId={p.id} name={p.name}/></li>)}</ul></main>}`,
    );
    fs.writeFileSync(
      path.join(fixture, "app", "api", "projects", "[id]", "route.js"),
      `export async function DELETE(request,{params}){const {id}=await params;const r=await fetch(${JSON.stringify(bridgeUrl)}+'/projects/'+id,{method:'DELETE'});return Response.json(await r.json(),{status:r.status})}`,
    );
    const logs = fs.openSync(path.join(fixture, "server.log"), "w");
    child = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next"),
        "dev",
        fixture,
        "-H",
        "127.0.0.1",
        "-p",
        String(port),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "development",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", logs, logs],
      },
    );
    fs.closeSync(logs);
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw Error("Browser fixture server stopped");
      try {
        const r = await fetch(base);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.ok(ready, "Browser fixture did not start");
    browser = await chromium.launch({
      executablePath: require("./browser-fixture.cjs").chromiumPath,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1100, height: 800 },
    });
    await page.goto(base, { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", {
      name: "Delete Example",
      exact: true,
    });
    await trigger.click();
    await page.getByRole("dialog", { name: "Delete “Example”?" }).waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Cancel",
    );
    assert.equal(new URL(page.url()).pathname, "/");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator("dialog").count(), 1);
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    assert.equal(deletes, 0);
    await trigger.click();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    assert.equal(deletes, 0);
    await trigger.click();
    await page
      .getByRole("button", { name: "Delete project", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("alert").waitFor();
    assert.match(
      await page.getByRole("dialog").getByRole("alert").innerText(),
      /Try again/,
    );
    assert.equal(projects.length, 1);
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    fail = false;
    await page
      .getByRole("button", { name: "Delete project", exact: true })
      .evaluate((button) => {
        button.click();
        button.click();
      });
    await page
      .getByRole("button", { name: "Deleting…", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    assert.equal(
      await page
        .getByRole("button", { name: "Cancel", exact: true })
        .isDisabled(),
      true,
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-project="1"]'),
    );
    assert.equal(deletes, 2);
    assert.equal(projects.length, 0);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "projects-heading",
    );
    projects = [
      { id: 2, name: "A long project name for the mobile confirmation layout" },
    ];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Delete A long project/ }).click();
    const box = await page.getByRole("dialog").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await page.screenshot({
      path: path.join(root, "work", "project-deletion-mobile.png"),
    });
    await page.keyboard.press("Escape");
    console.log(
      JSON.stringify({
        actualProductionComponent: true,
        realChromium: true,
        xDoesNotNavigate: true,
        cancelFocused: true,
        cancelAndEscapeSendNoDelete: true,
        serverErrorKeepsDialogAndProject: true,
        doubleClickSendsOneRequest: true,
        busyCannotDismiss: true,
        successfulDeleteRefreshesList: true,
        keyboardFocusRestored: true,
        mobileDialogFits: true,
      }),
    );
  } finally {
    await browser?.close();
    if (child && !child.killed) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((r) => child.once("exit", r)),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await new Promise((r) => bridge.close(r));
    if (fs.existsSync(path.join(fixture, "server.log")))
      fs.copyFileSync(
        path.join(fixture, "server.log"),
        path.join(root, "work", "project-delete-ui-last.log"),
      );
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

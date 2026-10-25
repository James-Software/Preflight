const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
    ],
  });
  for (const width of [1440, 390])
    for (const mode of ["normal", "reduced", "no-webgl"]) {
      const c = await b.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
        isMobile: width === 390,
        hasTouch: width === 390,
        colorScheme: width === 390 ? "dark" : "light",
      });
      await c.addInitScript(
        (t) => localStorage.setItem("theme", t),
        width === 390 ? "dark" : "light",
      );
      const p = await c.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.addInitScript((mode) => {
        window.__motionDraws = 0;
        if (mode === "no-webgl") {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === "webgl") return null;
            return get.call(this, type, ...args);
          };
        } else {
          const draw = WebGLRenderingContext.prototype.drawArrays;
          WebGLRenderingContext.prototype.drawArrays = function (...args) {
            window.__motionDraws++;
            return draw.apply(this, args);
          };
        }
      }, mode);
      await p.goto(
        process.env.PREFLIGHT_REVIEW_URL || "http://localhost:3066",
        { waitUntil: "networkidle" },
      );
      await p.locator("#top img").evaluate((e) => e.decode());
      await p.waitForFunction(
        (mode) =>
          document.querySelector(".hero-cloud-motion").dataset.motion ===
          (mode === "normal"
            ? "webgl"
            : mode === "reduced"
              ? "static"
              : "fallback"),
        mode,
      );
      const h1 = await p.locator("#top h1").boundingBox();
      await p.mouse.move(width * 0.35, 350);
      await p.waitForTimeout(350);
      await p.screenshot({
        path: `/tmp/preflight-cloud-motion-${width}-${mode}.png`,
      });
      assert.deepEqual(await p.locator("#top h1").boundingBox(), h1);
      if (mode === "normal") {
        const uniform = await p.locator("#top canvas").evaluate((e) => {
          const gl = e.getContext("webgl"),
            program = gl.getParameter(gl.CURRENT_PROGRAM);
          return {
            hover: gl.getUniform(
              program,
              gl.getUniformLocation(program, "u_hover"),
            ),
            cursor: Array.from(
              gl.getUniform(
                program,
                gl.getUniformLocation(program, "u_cursor"),
              ),
            ),
            scroll: gl.getUniform(
              program,
              gl.getUniformLocation(program, "u_scroll"),
            ),
          };
        });
        if (width === 1440) {
          assert.ok(uniform.hover > 0.8);
          assert.ok(uniform.cursor[0] < 0.5);
        } else assert.equal(uniform.hover, 0);
        const before = await p.locator("#top canvas").screenshot();
        await p.mouse.move(width * 0.72, 590);
        await p.waitForTimeout(400);
        const after = await p.locator("#top canvas").screenshot();
        assert.ok(!before.equals(after));
        await p.evaluate(() => scrollTo(0, 220));
        await p.waitForTimeout(300);
        const scrollUniform = await p.locator("#top canvas").evaluate((e) => {
          const gl = e.getContext("webgl"),
            program = gl.getParameter(gl.CURRENT_PROGRAM);
          return gl.getUniform(
            program,
            gl.getUniformLocation(program, "u_scroll"),
          );
        });
        assert.ok(scrollUniform > uniform.scroll + 0.1);
        await p.screenshot({
          path: `/tmp/preflight-cloud-motion-scroll-${width}.png`,
        });
        await p.evaluate(() => scrollTo(0, innerHeight * 1.5));
        await p.waitForTimeout(300);
        const n = await p.evaluate(() => window.__motionDraws);
        await p.waitForTimeout(180);
        assert.equal(await p.evaluate(() => window.__motionDraws), n);
        await p.evaluate(() => scrollTo(0, 0));
        await p.waitForTimeout(250);
        assert.ok((await p.evaluate(() => window.__motionDraws)) > n);
        await p.emulateMedia({ reducedMotion: "reduce" });
        await p.waitForFunction(
          () =>
            document.querySelector(".hero-cloud-motion").dataset.motion ===
            "static",
        );
        const stopped = await p.evaluate(() => window.__motionDraws);
        await p.waitForTimeout(120);
        assert.equal(await p.evaluate(() => window.__motionDraws), stopped);
        await p.emulateMedia({ reducedMotion: "no-preference" });
        await p.waitForFunction(
          () =>
            document.querySelector(".hero-cloud-motion").dataset.motion ===
            "webgl",
        );
        await p
          .locator("#top canvas")
          .evaluate((e) =>
            e
              .getContext("webgl")
              .getExtension("WEBGL_lose_context")
              .loseContext(),
          );
        await p.waitForFunction(
          () =>
            document.querySelector(".hero-cloud-motion").dataset.motion ===
            "fallback",
        );
      } else if (mode === "reduced") {
        assert.equal(await p.evaluate(() => window.__motionDraws), 0);
        assert.equal(
          await p
            .locator("#top img")
            .evaluate((e) => getComputedStyle(e).transform),
          "none",
        );
      }
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          width,
          mode,
          copyStable: true,
          noOverflow: true,
          pageErrors: errors,
          ...(mode === "normal"
            ? {
                gpuRendered: true,
                pixelsRespond: true,
                ...(width === 1440
                  ? { pointerWarpVerified: true }
                  : { touchPointerWarpDisabled: true }),
                scrollUniformVerified: true,
                scrollDepth: true,
                offscreenPaused: true,
                reentryResumed: true,
                liveReducedMotionToggle: true,
                contextLossFallback: true,
              }
            : {}),
        }),
      );
      await c.close();
    }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Start the app, then run: PREFLIGHT_TEST_URL=http://localhost:3000 npm run test:scroll
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const url = process.env.PREFLIGHT_TEST_URL || "http://localhost:3000";
const wait = (page, ms = 700) => page.waitForTimeout(ms);
async function position(page, phase, offset = 0) {
  await page.evaluate(
    ({ phase, offset }) => {
      const root = document.querySelector('[data-ui="annotated-run"]');
      const start = root.getBoundingClientRect().top + scrollY;
      scrollTo({
        top:
          Math.ceil(start + ((root.offsetHeight - innerHeight) * phase) / 7) +
          offset,
        behavior: "instant",
      });
    },
    { phase, offset },
  );
  await wait(page);
  return page.evaluate(() => scrollY);
}
async function y(page) {
  return page.evaluate(() => scrollY);
}
async function swipe(page, session) {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 190, y: 650 }],
  });
  const positions = [];
  for (let i = 1; i <= 8; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 190, y: 650 - i * 30 }],
    });
    await wait(page, 60);
    if (i === 4 || i === 8) positions.push(await y(page));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await wait(page);
  return positions;
}
async function hero(browser, fallback) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });
  await page.addInitScript((fallback) => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, options) {
      if (kind === "webgl" || kind === "experimental-webgl") {
        if (fallback) return null;
        // Keep frame pixels available for an alpha-mask comparison in this test only.
        return original.call(this, kind, {
          ...options,
          preserveDrawingBuffer: true,
        });
      }
      return original.call(this, kind, options);
    };
  }, fallback);
  await page.goto(url, { waitUntil: "networkidle" });
  if (fallback) {
    const panel = page.locator(".plasma-fallback");
    await panel.waitFor();
    const before = await panel.evaluate((e) => ({
      radius: getComputedStyle(e).borderRadius,
      animation: getComputedStyle(e).animationName,
    }));
    await wait(page, 1000);
    assert.deepEqual(
      await panel.evaluate((e) => ({
        radius: getComputedStyle(e).borderRadius,
        animation: getComputedStyle(e).animationName,
      })),
      before,
    );
    assert.equal(before.animation, "none");
    assert.notEqual(before.radius, "0px");
  } else {
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#top canvas")).visibility ===
        "visible",
    );
    const pixels = () =>
      page.evaluate(() => {
        const canvas = document.querySelector("#top canvas"),
          gl = canvas.getContext("webgl");
        const bytes = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bytes,
        );
        let mask = 0,
          color = 0,
          opaque = 0,
          clear = 0;
        for (let i = 0; i < bytes.length; i += 4) {
          mask = (Math.imul(mask, 31) + bytes[i + 3]) | 0;
          color = (Math.imul(color, 31) + bytes[i] + bytes[i + 1] * 3) | 0;
          if (bytes[i + 3] > 128) opaque++;
          if (bytes[i + 3] === 0) clear++;
        }
        return { mask, color, opaque, clear };
      });
    const before = await pixels();
    await wait(page, 1000);
    const after = await pixels();
    assert.ok(
      before.opaque > 10000 && before.clear > 20,
      "valid filled window with transparent rounded corners",
    );
    assert.equal(
      after.mask,
      before.mask,
      "cloud window border stays fixed as time advances",
    );
    assert.notEqual(
      after.color,
      before.color,
      "clouds still move inside the fixed window",
    );
  }
  await page.screenshot({
    path: `/tmp/preflight-cloud-${fallback ? "fallback" : "webgl"}.png`,
  });
  console.log(
    JSON.stringify({
      hero: fallback ? "CSS fallback" : "WebGL",
      fixedRoundedBorder: "pass",
      movingInterior: fallback ? "CSS animation retained" : "pass",
    }),
  );
  await page.close();
}
(async () => {
  const browser = await chromium.launch({
    executablePath: require("./browser-fixture.cjs").chromiumPath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await hero(browser, false);
    await hero(browser, true);
    for (const mobile of [false, true]) {
      const page = await browser.newPage({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-ui="annotated-run"][data-pinned]');
      await page.evaluate(() => {
        window.scrollInputs = [];
        for (const type of ["wheel", "touchmove", "keydown"])
          window.addEventListener(
            type,
            (e) =>
              window.scrollInputs.push({ type, prevented: e.defaultPrevented }),
            { passive: true },
          );
      });
      const stepDistance = await page.evaluate(
        () =>
          (document.querySelector('[data-ui="annotated-run"]').offsetHeight -
            innerHeight) /
          7,
      );
      assert.ok(
        stepDistance > (await page.evaluate(() => innerHeight)),
        "a beat requires more scroll distance than a viewport",
      );
      const start = await position(page, 2.5);
      const positions = [start];
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 120);
        await wait(page, 150);
        positions.push(await y(page));
      }
      assert.ok(
        positions.every((value, i) => i === 0 || value > positions[i - 1] + 20),
        "every wheel input keeps moving; no gesture is consumed",
      );
      await wait(page);
      assert.ok(
        (await y(page)) - start < stepDistance,
        "moderate scrolling stays within one beat",
      );
      const beforeFast = await y(page);
      await page.mouse.wheel(0, 2200);
      await wait(page);
      assert.ok(
        (await y(page)) - beforeFast > 1800,
        "intentional fast scrolling remains unrestricted",
      );
      const beforeReverse = await y(page);
      await page.mouse.wheel(0, -240);
      await wait(page);
      assert.ok(
        (await y(page)) < beforeReverse - 160,
        "reverse scrolling is immediately available",
      );

      const center = await position(page, 2.5);
      await position(page, 2.5, 35);
      assert.ok(
        Math.abs((await y(page)) - center) <= 2,
        "small near-center offsets settle",
      );
      const away = await position(page, 2.5, 150);
      await wait(page);
      assert.ok(
        Math.abs((await y(page)) - away) <= 2,
        "scrolling between centers is not forced to a step",
      );
      await position(page, 2.5);
      await page.evaluate(() =>
        scrollTo({ top: scrollY + 60, behavior: "instant" }),
      );
      await wait(page, 290);
      await page.mouse.wheel(0, 240);
      await wait(page);
      assert.ok(
        (await y(page)) > center + 120,
        "new input never waits for a settling animation",
      );

      const keyboardStart = await position(page, 2.5);
      await page.keyboard.press("PageDown");
      await wait(page);
      assert.ok(
        (await y(page)) > keyboardStart + 200,
        "PageDown uses native scrolling",
      );
      const heldStart = await y(page);
      for (let i = 0; i < 7; i++) {
        await page.keyboard.down("ArrowDown");
        await wait(page, 90);
      }
      await page.keyboard.up("ArrowDown");
      await wait(page);
      assert.ok((await y(page)) > heldStart + 80, "held keys continue moving");

      if (mobile) {
        const touchStart = await position(page, 2.5);
        const session = await page.context().newCDPSession(page);
        const samples = await swipe(page, session);
        assert.ok(
          samples[0] > touchStart + 20 && samples[1] > samples[0] + 20,
          "touch scroll moves throughout the swipe",
        );
      }
      const entry = await position(page, 0, -150);
      await page.mouse.wheel(0, 350);
      await wait(page);
      assert.ok(
        (await y(page)) > entry + 250,
        "entry does not catch or clamp a wheel gesture",
      );
      const exit = await position(page, 7, -150);
      await page.mouse.wheel(0, 350);
      await wait(page);
      assert.ok(
        (await y(page)) > exit + 250,
        "exit does not catch or clamp a wheel gesture",
      );
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.hasAttribute("data-run-pinned"),
        ),
        false,
      );
      assert.equal(
        await page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('nav[aria-label="Main navigation"]'),
            ).visibility,
        ),
        "visible",
      );
      const prevented = await page.evaluate(() =>
        window.scrollInputs.filter((e) => e.prevented),
      );
      assert.deepEqual(
        prevented,
        [],
        "wheel/touch/key inputs are never prevented by the sequence",
      );
      console.log(
        JSON.stringify({
          viewport: mobile ? "390x844" : "1440x900",
          continuousWheel: "pass",
          unrestrictedFastScroll: "pass",
          reverse: "pass",
          proximityOnly: "pass",
          keyboard: "pass",
          touch: mobile ? "pass" : "n/a",
          entryExit: "pass",
          preventedInputs: 0,
        }),
      );
      await page.close();
    }
    for (const fallback of [
      "reduced-motion",
      "short-viewport",
      "no-JavaScript",
    ]) {
      const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: fallback === "short-viewport" ? 500 : 900,
        },
        reducedMotion:
          fallback === "reduced-motion" ? "reduce" : "no-preference",
        javaScriptEnabled: fallback !== "no-JavaScript",
      });
      await page.goto(url, { waitUntil: "networkidle" });
      assert.equal(
        await page.locator('[data-ui="annotated-run"][data-pinned]').count(),
        0,
      );
      await page.locator('[data-ui="annotated-run"]').scrollIntoViewIfNeeded();
      const before = await y(page);
      await page.mouse.wheel(0, 300);
      await wait(page);
      assert.ok((await y(page)) > before + 200, `${fallback}: native scroll`);
      console.log(JSON.stringify({ fallback, nativeScroll: "pass" }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

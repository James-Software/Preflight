// Run against a local server: PREFLIGHT_TEST_URL=http://localhost:3000 npm run test:scroll
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const url = process.env.PREFLIGHT_TEST_URL || "http://localhost:3000";
const anchors = [0, 1.8, 2.5, 3.5, 4.5, 5.5, 7];

async function position(page, phase) {
  await page.evaluate((phase) => {
    const root = document.querySelector('[data-ui="annotated-run"]');
    const start = root.getBoundingClientRect().top + scrollY;
    scrollTo({
      top: Math.ceil(start + ((root.offsetHeight - innerHeight) * phase) / 7),
      behavior: "instant",
    });
  }, phase);
  await page.waitForTimeout(1400);
}
async function expectPhase(page, expected, message) {
  const phase = await page.evaluate(() => {
    const root = document.querySelector('[data-ui="annotated-run"]');
    return (
      (-root.getBoundingClientRect().top / (root.offsetHeight - innerHeight)) *
      7
    );
  });
  assert.ok(
    Math.abs(phase - expected) < 0.02,
    `${message}: expected ${expected}, got ${phase}`,
  );
}
async function wheelBurst(page, direction, long = false) {
  // Native wheel events, including a momentum tail longer than the card transition.
  for (let i = 0; i < (long ? 28 : 5); i++) {
    await page.mouse.wheel(
      0,
      direction * (i < 3 ? 2400 : Math.max(12, 800 - i * 35)),
    );
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1100);
}
async function swipe(page, session, direction) {
  const x = 190,
    y = direction > 0 ? 700 : 150;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 10; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - direction * i * 45 }],
    });
    await page.waitForTimeout(35);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(1200);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
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
      const session = await page.context().newCDPSession(page);
      await position(page, 0);
      const gesture = (direction, long) =>
        mobile
          ? swipe(page, session, direction)
          : wheelBurst(page, direction, long);
      for (let i = 1; i < anchors.length; i++) {
        await gesture(1, i === 1);
        await expectPhase(
          page,
          anchors[i],
          `${mobile ? "touch" : "wheel"} forward ${i}`,
        );
      }
      await gesture(1);
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.hasAttribute("data-run-pinned"),
        ),
        false,
        "release after PR",
      );
      // A large gesture returning from below must land on the last scene first.
      await gesture(-1);
      await expectPhase(page, 7, "re-entry from below");
      for (let i = anchors.length - 2; i >= 0; i--) {
        await gesture(-1, i === 3);
        await expectPhase(
          page,
          anchors[i],
          `${mobile ? "touch" : "wheel"} reverse ${i}`,
        );
      }
      await gesture(-1);
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.hasAttribute("data-run-pinned"),
        ),
        false,
        "release before browser",
      );
      await gesture(1);
      await expectPhase(page, 0, "re-entry from above");
      // A held navigation key does not auto-repeat through multiple scenes.
      await page.keyboard.down("PageDown");
      for (let i = 0; i < 12; i++) {
        await page.keyboard.down("PageDown");
        await page.waitForTimeout(80);
      }
      await page.keyboard.up("PageDown");
      await page.waitForTimeout(1000);
      await expectPhase(page, 1.8, "held PageDown");
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(1400);
      await expectPhase(page, 2.5, "new PageDown");
      await page.keyboard.press("PageUp");
      await page.waitForTimeout(1400);
      await expectPhase(page, 1.8, "PageUp");
      // Small trackpad deltas accumulate rather than being discarded individually.
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, 4);
        await page.waitForTimeout(20);
      }
      await page.waitForTimeout(1400);
      await expectPhase(page, 2.5, "small trackpad deltas");
      await page.screenshot({
        path: `/tmp/preflight-scroll-${mobile ? "mobile" : "desktop"}.png`,
      });
      console.log(
        JSON.stringify({
          viewport: mobile ? "390x844" : "1440x900",
          wheelOrTouch: "pass",
          reverse: "pass",
          boundaries: "pass",
          keyboard: "pass",
          smallDeltas: "pass",
        }),
      );
      await page.close();
    }
    for (const fallback of ["reduced-motion", "short-viewport"]) {
      const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: fallback === "short-viewport" ? 500 : 900,
        },
        reducedMotion:
          fallback === "reduced-motion" ? "reduce" : "no-preference",
      });
      await page.goto(url, { waitUntil: "networkidle" });
      assert.equal(
        await page.locator('[data-ui="annotated-run"][data-pinned]').count(),
        0,
      );
      await page.locator('[data-ui="annotated-run"]').scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(500);
      assert.ok(
        (await page.evaluate(() => scrollY)) > before + 200,
        `${fallback}: native scroll`,
      );
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

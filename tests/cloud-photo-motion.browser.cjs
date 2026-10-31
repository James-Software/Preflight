const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: require("./browser-fixture.cjs").chromiumPath,
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
        window.__cloudResizes = [];
        const Observer = window.ResizeObserver;
        window.ResizeObserver = class extends Observer {
          constructor(callback) {
            super((entries, observer) => {
              callback(entries, observer);
              const layer = document.querySelector(
                '.hero-cloud-motion[data-motion="webgl"]',
              );
              if (
                !layer ||
                !entries.some((entry) => entry.target === layer.parentElement)
              )
                return;
              const surface = layer.querySelector("canvas");
              const gl = surface.getContext("webgl");
              const pixel = new Uint8Array(4);
              // Check synchronously after layout's resize callback, before a
              // later animation frame could hide a cleared/black surface.
              gl.readPixels(
                Math.floor(surface.width / 2),
                Math.floor(surface.height / 2),
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixel,
              );
              window.__cloudResizes.push(Array.from(pixel));
            });
          }
        };
        if (mode === "no-webgl") {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === "webgl") return null;
            return get.call(this, type, ...args);
          };
        } else {
          const upload = WebGLRenderingContext.prototype.texSubImage2D;
          WebGLRenderingContext.prototype.texSubImage2D = function (...args) {
            const pixels = args[8];
            if (pixels instanceof Uint8Array) {
              let energy = 0,
                x = 0,
                y = 0,
                glow = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                const dx = pixels[i] - 128,
                  dy = pixels[i + 1] - 128;
                energy += Math.abs(dx) + Math.abs(dy);
                glow += pixels[i + 2];
                x += dx;
                y += dy;
              }
              window.__cloudFlow = { energy, x, y, glow };
            }
            return upload.apply(this, args);
          };
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
      await p.waitForFunction(() =>
        document
          .querySelector("#top h1")
          .getAnimations()
          .every((animation) => animation.playState === "finished"),
      );
      const h1 = await p.locator("#top h1").boundingBox();
      await p.mouse.move(width * 0.35, 350);
      await p.waitForTimeout(350);
      await p.screenshot({
        path: `/tmp/preflight-cloud-motion-${width}-${mode}.png`,
      });
      assert.deepEqual(await p.locator("#top h1").boundingBox(), h1);
      if (mode === "normal") {
        const retained = await p.locator("#top canvas").evaluate((surface) => {
          const gl = surface.getContext("webgl");
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.floor(surface.width / 2),
            Math.floor(surface.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel,
          );
          return {
            pixel: Array.from(pixel),
            attributes: gl.getContextAttributes(),
          };
        });
        assert.equal(retained.attributes.preserveDrawingBuffer, true);
        assert.equal(retained.attributes.alpha, true);
        assert.ok(
          retained.pixel[0] + retained.pixel[1] + retained.pixel[2] > 100,
          "idle clouds retain their rendered frame",
        );
        const uniform = await p.locator("#top canvas").evaluate((e) => {
          const gl = e.getContext("webgl"),
            program = gl.getParameter(gl.CURRENT_PROGRAM);
          return {
            zoom: gl.getUniform(
              program,
              gl.getUniformLocation(program, "u_zoom"),
            ),
            scroll: gl.getUniform(
              program,
              gl.getUniformLocation(program, "u_scroll"),
            ),
          };
        });
        const baseline = await p.locator("#top canvas").screenshot();
        // Entering/holding the pointer does not create a lens or displacement.
        assert.equal(await p.evaluate(() => window.__cloudFlow.energy), 0);
        await p.mouse.move(width * 0.72, 590, { steps: 16 });
        await p.waitForTimeout(60);
        const trail = await p.evaluate(() => window.__cloudFlow);
        if (width === 1440) {
          assert.ok(trail.energy > 0);
          assert.ok(trail.glow > 0);
          assert.ok(trail.x > 0);
          assert.ok(trail.y < 0);
          await p.screenshot({ path: "/tmp/preflight-cloud-smear-active.png" });
          await p.waitForTimeout(1200);
          const relaxing = await p.evaluate(() => window.__cloudFlow.energy);
          assert.ok(relaxing < trail.energy * 0.5);
          assert.ok(
            (await p.evaluate(() => window.__cloudFlow.glow)) <
              trail.glow * 0.5,
          );
          await p.mouse.move(width - 2, 40);
          await p.waitForTimeout(5000);
          assert.equal(await p.evaluate(() => window.__cloudFlow.energy), 0);
          assert.equal(await p.evaluate(() => window.__cloudFlow.glow), 0);
          const idleDraws = await p.evaluate(() => window.__motionDraws);
          await p.waitForTimeout(150);
          assert.equal(await p.evaluate(() => window.__motionDraws), idleDraws);
          assert.ok(
            baseline.equals(await p.locator("#top canvas").screenshot()),
          );
        } else assert.equal(trail.energy, 0);
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
        const scrollZoom = await p.locator("#top canvas").evaluate((e) => {
          const gl = e.getContext("webgl"),
            program = gl.getParameter(gl.CURRENT_PROGRAM);
          return gl.getUniform(
            program,
            gl.getUniformLocation(program, "u_zoom"),
          );
        });
        assert.ok(scrollZoom > uniform.zoom + 0.01);
        await p.screenshot({
          path: `/tmp/preflight-cloud-motion-scroll-${width}.png`,
        });
        // Mobile browser bars change the visible height as the page scrolls.
        // Force actual host resizes too, so this covers the canvas resize path
        // even when the browser uses stable viewport units for the hero.
        await p.evaluate(() => {
          window.__cloudResizes = [];
        });
        for (const extraHeight of [80, 0, 120, 0]) {
          await p.locator("#top canvas").evaluate((surface, extra) => {
            const host = surface.parentElement.parentElement;
            host.style.flex = "none";
            host.style.height = `${700 + extra}px`;
          }, extraHeight);
          await p.evaluate(() => scrollTo(0, 80));
          await p.waitForTimeout(100);
        }
        const resizedPixels = await p.evaluate(() => window.__cloudResizes);
        assert.ok(
          resizedPixels.length >= 4,
          "observed each cloud window resize",
        );
        for (const pixel of resizedPixels) {
          assert.equal(pixel[3], 255, "resize repaints before the next frame");
          assert.ok(
            pixel[0] + pixel[1] + pixel[2] > 100,
            "resize never leaves a black frame",
          );
        }
        await p.locator("#top canvas").evaluate((surface) => {
          surface.parentElement.parentElement.style.removeProperty("height");
          surface.parentElement.parentElement.style.removeProperty("flex");
          scrollTo(0, 0);
        });
        await p.waitForTimeout(1000);
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
                idleFrameRetained: true,
                resizeRepaintsSynchronously: true,
                directionalFieldRendered: true,
                ...(width === 1440
                  ? {
                      directionalSmearVerified: true,
                      stationaryPointerDoesNotZoom: true,
                      trailRelaxesAndResets: true,
                    }
                  : { touchPointerWarpDisabled: true }),
                scrollUniformVerified: true,
                scrollDepth: true,
                scrollZoom: true,
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

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const { createCloudFlow, stepCloudFlow } = load("lib/cloud-flow.ts", {});
test("cloud smears follow the direction of a stroke and stay local to its path", () => {
  const flow = createCloudFlow();
  stepCloudFlow(flow, 1 / 60, { from: [0.35, 0.5], to: [0.65, 0.5] }, 1.5);
  const center = (24 * 64 + 32) * 2,
    corner = 0;
  assert.ok(flow.values[center] > 0);
  assert.equal(flow.values[center + 1], 0);
  assert.equal(flow.values[corner], 0);
  assert.ok(flow.light[center / 2] > 0);
  assert.equal(flow.light[corner], 0);
  const reverse = createCloudFlow();
  stepCloudFlow(reverse, 1 / 60, { from: [0.65, 0.5], to: [0.35, 0.5] }, 1.5);
  assert.ok(reverse.values[center] < 0);
  const up = createCloudFlow();
  stepCloudFlow(up, 1 / 60, { from: [0.5, 0.35], to: [0.5, 0.65] }, 1.5);
  assert.ok(up.values[center + 1] > 0);
});
test("holding or leaving the pointer relaxes a smear to its exact neutral state", () => {
  const flow = createCloudFlow();
  stepCloudFlow(flow, 1 / 60, { from: [0.3, 0.5], to: [0.7, 0.5] }, 1.5);
  const peak = Math.max(...flow.values);
  for (let i = 0; i < 60; i++) stepCloudFlow(flow, 1 / 60, null, 1.5);
  assert.ok(Math.max(...flow.values) < peak * 0.3);
  for (let i = 0; i < 360; i++) stepCloudFlow(flow, 1 / 60, null, 1.5);
  assert.ok(flow.values.every((v) => v === 0));
  assert.ok(flow.light.every((v) => v === 0));
  for (let i = 0; i < flow.pixels.length; i += 4) {
    assert.equal(flow.pixels[i], 128);
    assert.equal(flow.pixels[i + 1], 128);
    assert.equal(flow.pixels[i + 2], 0);
  }
  const stationary = createCloudFlow();
  stepCloudFlow(stationary, 1, { from: [0.5, 0.5], to: [0.5, 0.5] }, 1.5);
  assert.ok(stationary.values.every((v) => v === 0));
  assert.ok(stationary.light.every((v) => v === 0));
});
test("fast repeated strokes remain bounded for wide and narrow windows", () => {
  for (const aspect of [0.45, 2.5]) {
    const flow = createCloudFlow();
    for (let i = 0; i < 100; i++)
      stepCloudFlow(
        flow,
        1 / 120,
        { from: [0.1, 0.1], to: [0.9, 0.9] },
        aspect,
      );
    for (let i = 0; i < flow.values.length; i += 2)
      assert.ok(
        Math.hypot(flow.values[i] * aspect, flow.values[i + 1]) <= 0.025001,
      );
  }
});

export type CloudStroke = { from: [number, number]; to: [number, number] };
export function createCloudFlow() {
  const width = 64,
    height = 48;
  return {
    width,
    height,
    active: false,
    values: new Float32Array(width * height * 2),
    pixels: new Uint8Array(width * height * 4),
  };
}
/** Directional displacements persist where the pointer passed, then relax to zero. */
export function stepCloudFlow(
  flow: ReturnType<typeof createCloudFlow>,
  dt: number,
  stroke: CloudStroke | null,
  aspect: number,
) {
  const decay = Math.exp(-dt * 1.25);
  flow.active = false;
  const ax = stroke?.from[0] ?? 0,
    ay = stroke?.from[1] ?? 0;
  const dx = stroke ? stroke.to[0] - ax : 0,
    dy = stroke ? stroke.to[1] - ay : 0;
  const lengthSquared = (dx * aspect) ** 2 + dy ** 2;
  // Cap a single fast sweep and accumulated displacement to preserve the photo.
  const gain = Math.min(1, 0.065 / Math.max(Math.sqrt(lengthSquared), 0.00001));
  for (let y = 0; y < flow.height; y++)
    for (let x = 0; x < flow.width; x++) {
      const index = (y * flow.width + x) * 2;
      let push = 0;
      if (lengthSquared > 0.000001) {
        const px = (x / (flow.width - 1) - ax) * aspect;
        const py = y / (flow.height - 1) - ay;
        const t = Math.max(
          0,
          Math.min(1, (px * dx * aspect + py * dy) / lengthSquared),
        );
        const distanceSquared =
          (px - t * dx * aspect) ** 2 + (py - t * dy) ** 2;
        push = Math.exp(-distanceSquared / 0.012) * gain * 0.9;
      }
      const vx = flow.values[index] * decay + dx * push;
      const vy = flow.values[index + 1] * decay + dy * push;
      // Bound physical displacement in screen space, including narrow windows.
      const limit = Math.min(
        1,
        0.055 / Math.max(Math.hypot(vx * aspect, vy), 0.00001),
      );
      flow.values[index] = Math.abs(vx * limit) < 0.0001 ? 0 : vx * limit;
      flow.values[index + 1] = Math.abs(vy * limit) < 0.0001 ? 0 : vy * limit;
      if (flow.values[index] || flow.values[index + 1]) flow.active = true;
      const pixel = index * 2;
      flow.pixels[pixel] = Math.round(128 + (flow.values[index] / 0.08) * 127);
      flow.pixels[pixel + 1] = Math.round(
        128 + (flow.values[index + 1] / 0.08) * 127,
      );
      flow.pixels[pixel + 2] = 0;
      flow.pixels[pixel + 3] = 255;
    }
  return flow.pixels;
}

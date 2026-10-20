"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* PlasmaSquare — the hero square as living fluid energy in the        */
/* classic gradient's blues. Multi-scale domain-warped fBm advected   */
/* upward (large structures drift slowly, fine detail moves faster,    */
/* flow speed varies spatially). The silhouette is a fluid-distorted  */
/* rounded square: dramatic waves roll along the sides, the top edge  */
/* boils gently, and the bottom stays calm.                           */
/*                                                                     */
/* Sizing is bulletproof by construction: the canvas is exactly the    */
/* bubble's box (absolute inset-0), and the fluid bleed lives INSIDE   */
/* the shader as fixed insets — the energy can never escape the box,   */
/* spill past the viewport, or wash over the copy below.               */
/*                                                                     */
/* Perf: 3-octave fBm, resolution capped (~1.8M px, DPR <= 1.25),      */
/* pauses off-screen / when hidden. No WebGL -> animated CSS fallback. */
/* Static frame under prefers-reduced-motion.                          */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/* In-shader bleed (css px): room for waves/wisps inside the canvas. */
const SIDE_BLEED = 26;
const TOP_BLEED = 46;
const BOTTOM_BLEED = 12;

const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_bubble; // min.xy, max.xy in px (y-up)
uniform float u_radius;
uniform float u_sideAmp; // px of side-wave travel

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = hash22(i);
  vec2 b = hash22(i + vec2(1.0, 0.0));
  vec2 c = hash22(i + vec2(0.0, 1.0));
  vec2 d = hash22(i + vec2(1.0, 1.0));
  float na = dot(a - 0.5, f);
  float nb = dot(b - 0.5, f - vec2(1.0, 0.0));
  float nc = dot(c - 0.5, f - vec2(0.0, 1.0));
  float nd = dot(d - 0.5, f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(na, nb, u.x), mix(nc, nd, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = r * p;
    a *= 0.5;
  }
  return v;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

/* Cloud config — how the white clumps form and gather. */
#define CLOUD_COVER 0.55  /* 0..1, how much of the sky is clouds */
#define CLOUD_SOFT 0.15   /* softness of cloud edges */
#define CLOUD_ERODE 0.35  /* fine-detail erosion of cloud edges */
#define CLOUD_RISE_SPEED 0.07 /* canvas heights per second, upward */
#define CLOUD_EVOLVE_SPEED 0.35 /* slow shape changes relative to drift */

void main() {
  vec2 px = gl_FragCoord.xy;
  float t = u_time;

  vec2 center = (u_bubble.xy + u_bubble.zw) * 0.5;
  vec2 halfSize = (u_bubble.zw - u_bubble.xy) * 0.5;
  vec2 q0 = px - center;

  /* Carry both texture scales upward together, so cloud banks drift
     instead of churning in place. WebGL's positive Y points upward. */
  vec2 cloudPx = px - vec2(0.0, t * u_res.y * CLOUD_RISE_SPEED);
  vec2 p1 = cloudPx * 0.0016;
  vec2 p2 = cloudPx * 0.0038;
  float evolve = t * CLOUD_EVOLVE_SPEED;

  vec2 w1 = vec2(
    fbm(p1 + vec2(0.0, evolve * 0.020)),
    fbm(p1 + vec2(5.2, 1.3) - vec2(0.0, evolve * 0.016))
  );
  vec2 w2 = vec2(
    fbm(p2 + vec2(1.7, 9.2) + 1.5 * w1),
    fbm(p2 + vec2(8.3, 2.8) - 1.5 * w1)
  );

  float large = fbm(p1 + 1.8 * w1);
  float fine = fbm(p2 * 1.7 + 2.2 * w2);
  float fil = 1.0 - abs(2.0 * fine - 1.0);
  fil = pow(fil, 3.0);

  float energy = large * 0.55 + fine * 0.30 + fil * 0.45;

  /* Silhouette: top boils, sides roll in dramatic waves, bottom calm. */
  float topness = smoothstep(center.y, u_bubble.w, px.y);
  float vertCalm = smoothstep(u_bubble.y - 30.0, u_bubble.y + 140.0, px.y);
  float wobTop = (fbm(vec2(px.x * 0.006, px.y * 0.004 - t * 0.07)) - 0.5)
    * mix(8.0, 34.0, topness) * mix(0.25, 1.0, vertCalm);
  float sideWave = vnoise(vec2(2.7, px.y * 0.0055 - t * 0.10)) - 0.5;
  sideWave += 0.45 * (vnoise(vec2(9.1, px.y * 0.016 - t * 0.23)) - 0.5);
  float wobSide = sideWave * 2.0 * u_sideAmp * (1.0 - topness) * vertCalm;
  float d = sdRoundBox(q0, halfSize, u_radius) + wobTop + wobSide;

  /* Palette: the classic square gradient — diagonal to top-right,
     more blue. Luminosity comes from energy, not whiteness. */
  vec3 deep = vec3(0.306, 0.184, 0.847); // #4e2fd8
  vec3 mid = vec3(0.416, 0.427, 0.961); // #6a6df5
  vec3 light = vec3(0.541, 0.647, 1.000); // #8aa5ff
  vec3 accent = vec3(0.660, 0.730, 1.000); // bright classic blue, sparse
  float sdiag = clamp((px.x / u_res.x + (1.0 - px.y / u_res.y)) * 0.5, 0.0, 1.0);
  vec3 base = mix(deep, mid, smoothstep(0.0, 0.48, sdiag));
  base = mix(base, light, smoothstep(0.48, 1.0, sdiag));

  /* Interior: blue sky with clouds gathering out of the flow. */
  float aa = 1.5;
  float body = 1.0 - smoothstep(-aa, aa, d);
  vec3 icol = base * (0.70 + 0.60 * energy);
  icol *= 0.85 + 0.30 * large;

  /* Clouds: billowy white clumps gathered from the large-scale field,
     edges eroded by fine detail so they form and dissolve softly. */
  float cdens = large - fine * CLOUD_ERODE;
  float clo = 1.0 - CLOUD_COVER - CLOUD_SOFT;
  float cmask = smoothstep(clo, clo + 2.0 * CLOUD_SOFT, cdens);
  float cshade = smoothstep(clo, clo + 2.0 * CLOUD_SOFT + 0.22, cdens);
  vec3 cloudCol = mix(vec3(0.79, 0.83, 1.0), vec3(1.0), cshade);
  icol = mix(icol, cloudCol, cmask * 0.94);

  /* Faint bright filaments — kept subtle so the clouds own the whites. */
  icol += accent * smoothstep(0.78, 0.97, fil) * 0.18;
  icol += light * 0.10 * smoothstep(u_bubble.y, u_bubble.w, px.y);
  icol += light * exp(-abs(d) * 0.10) * 0.15; // rim light on the fluid edge

  /* Only paint the animated window. The surrounding canvas is layout
     space, so it must stay fully transparent rather than form a halo. */
  gl_FragColor = vec4(icol, body);
}
`;

// Preserve the same filled gradient when a device cannot run WebGL.
const FALLBACK_GRADIENT =
  "linear-gradient(to top right, #4e2fd8 0%, #6a6df5 48%, #8aa5ff 100%)";

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

/** Recreate GPU resources after context restoration without replacing the canvas. */
function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL unavailable");

  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const dispose = () => {
    if (gl.isContextLost()) return;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach((shader) => gl.deleteShader(shader));
  };

  try {
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const fragment = precision?.precision ? FRAG : FRAG.replace("precision highp float;", "precision mediump float;");
    shaders.push(compile(gl, gl.VERTEX_SHADER, VERT));
    shaders.push(compile(gl, gl.FRAGMENT_SHADER, fragment));
    program = gl.createProgram();
    if (!program) throw new Error("program alloc failed");
    shaders.forEach((shader) => gl.attachShader(program!, shader));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program link failed");
    gl.useProgram(program);

    buffer = gl.createBuffer();
    if (!buffer) throw new Error("buffer alloc failed");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uBubble = gl.getUniformLocation(program, "u_bubble");
    const uRadius = gl.getUniformLocation(program, "u_radius");
    const uSideAmp = gl.getUniformLocation(program, "u_sideAmp");

    const draw = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // A smaller drawing buffer keeps the same shader usable on mobile GPUs.
      const compact = window.matchMedia("(max-width: 767px)").matches;
      let scale = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.25);
      const maxPixels = compact ? 900000 : 1800000;
      if (rect.width * rect.height * scale * scale > maxPixels) {
        scale = Math.sqrt(maxPixels / (rect.width * rect.height));
      }
      const width = Math.max(1, Math.floor(rect.width * scale));
      const height = Math.max(1, Math.floor(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, time);
      gl.uniform4f(uBubble, SIDE_BLEED * scale, BOTTOM_BLEED * scale,
        (rect.width - SIDE_BLEED) * scale, (rect.height - TOP_BLEED) * scale);
      const radius = canvas.parentElement
        ? parseFloat(getComputedStyle(canvas.parentElement).borderTopLeftRadius) || 0
        : 0;
      gl.uniform1f(uRadius, Math.max(0, Math.min(radius,
        (rect.width - SIDE_BLEED * 2) / 2,
        (rect.height - TOP_BLEED - BOTTOM_BLEED) / 2)) * scale);
      gl.uniform1f(uSideAmp, Math.min(20, SIDE_BLEED - 6) * scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    draw(0);
    // Some mobile drivers fail to fill the canvas without throwing. Verify
    // an interior pixel once before replacing the filled CSS fallback.
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2),
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR || pixel[3] < 128) {
      throw new Error("initial WebGL draw failed");
    }
    return { draw, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export default function PlasmaSquare() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: ReturnType<typeof createRenderer> | null = null;
    let raf = 0;
    let inView = true;
    let lastFrame = -Infinity;
    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia("(max-width: 767px)");
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const draw = () => {
      renderer?.draw(reduced.matches ? 12 : (performance.now() - start) / 1000);
    };
    const loop = (now: number) => {
      if (!renderer || !inView || document.hidden || reduced.matches) {
        raf = 0;
        return;
      }
      if (now - lastFrame >= (compact.matches ? 1000 / 30 : 1000 / 60)) {
        draw();
        lastFrame = now;
      }
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      stop();
      if (!renderer || !inView || document.hidden) return;
      draw();
      if (!reduced.matches) raf = requestAnimationFrame(loop);
    };
    const initialize = () => {
      stop();
      renderer?.dispose();
      renderer = null;
      try {
        renderer = createRenderer(canvas);
        sync();
        setFallback(false);
      } catch {
        setFallback(true);
      }
    };
    const onLost = (event: Event) => {
      event.preventDefault(); // Allow browsers to restore the context.
      stop();
      renderer = null; // The lost context has already discarded its resources.
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", initialize);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(canvas);
    const resize = new ResizeObserver(sync);
    resize.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    reduced.addEventListener("change", sync);
    compact.addEventListener("change", sync);
    initialize();

    return () => {
      stop();
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
      reduced.removeEventListener("change", sync);
      compact.removeEventListener("change", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", initialize);
      // Delete our resources without forcibly losing a context React may reuse.
      renderer?.dispose();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full bg-transparent"
        style={{ background: "none", border: 0, boxShadow: "none", visibility: fallback ? "hidden" : "visible" }}
      />
      {fallback && (
        <div
          aria-hidden="true"
          className="plasma-fallback pointer-events-none absolute overflow-hidden"
          style={{ inset: `${TOP_BLEED}px ${SIDE_BLEED}px ${BOTTOM_BLEED}px`, backgroundImage: FALLBACK_GRADIENT }}
        />
      )}
    </>
  );
}

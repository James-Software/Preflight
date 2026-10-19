"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* PlasmaSquare — the hero square as living fluid energy. A WebGL       */
/* fragment shader renders the whole square: multi-scale               */
/* domain-warped fBm advected upward (large structures drift slowly,   */
/* fine detail moves faster, flow speed varies spatially), a            */
/* fluid-distorted rounded-rect SDF for the silhouette (top edge the   */
/* most dynamic, wisps stretching above it and dissolving), and the    */
/* square's own purplish-blue palette with luminous near-white         */
/* filaments, rim light and a soft outer glow. The canvas bleeds past  */
/* the square's box so edges and wisps are never hard-clipped.         */
/*                                                                     */
/* Perf: resolution capped (~2.5M px), pauses off-screen / when hidden. */
/* No WebGL -> the original static gradient. Static frame under        */
/* prefers-reduced-motion.                                             */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_bubble; // min.xy, max.xy in px (y-up)
uniform float u_radius;

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
  for (int i = 0; i < 4; i++) {
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

void main() {
  vec2 px = gl_FragCoord.xy;
  float t = u_time;

  vec2 center = (u_bubble.xy + u_bubble.zw) * 0.5;
  vec2 halfSize = (u_bubble.zw - u_bubble.xy) * 0.5;
  vec2 q0 = px - center;

  /* Fluid fields: multi-scale domain-warped fBm, advected upward.
     Large structures drift slowly, fine detail moves faster, and the
     flow speed varies spatially so nothing scrolls uniformly. */
  float flowMod = 0.6 + 0.8 * vnoise(vec2(px.x * 0.0009 + 3.7, t * 0.05));
  vec2 p1 = vec2(px.x * 0.0016, px.y * 0.0016 - t * 0.030);
  vec2 p2 = vec2(px.x * 0.0038, px.y * 0.0038 - t * 0.075 * flowMod);

  vec2 w1 = vec2(
    fbm(p1 + vec2(0.0, t * 0.020)),
    fbm(p1 + vec2(5.2, 1.3) - vec2(0.0, t * 0.016))
  );
  vec2 w2 = vec2(
    fbm(p2 + vec2(1.7, 9.2) + 1.5 * w1),
    fbm(p2 + vec2(8.3, 2.8) - 1.5 * w1)
  );

  float large = fbm(p1 + 1.8 * w1);
  float fine = fbm(p2 * 1.7 + 2.2 * w2);
  float fr = fbm(vec2(px.x * 0.006, px.y * 0.0022 - t * 0.085) + 2.6 * w2);
  float fil = 1.0 - abs(2.0 * fr - 1.0);
  fil = pow(fil, 2.2);

  float energy = large * 0.55 + fine * 0.30 + fil * 0.50;

  /* Silhouette: rounded square SDF with fluid edges — the top edge
     breathes the most, the sides only subtly. */
  float topness = smoothstep(center.y, u_bubble.w, px.y);
  float wob = fbm(vec2(px.x * 0.006, px.y * 0.004 - t * 0.06)) - 0.5;
  float wob2 = vnoise(vec2(px.x * 0.020, px.y * 0.012 - t * 0.15)) - 0.5;
  float wobAmp = mix(6.0, 30.0, topness);
  float d = sdRoundBox(q0, halfSize, u_radius) + wob * wobAmp + wob2 * wobAmp * 0.35;

  /* Palette: the square's own colors. */
  vec3 deep = vec3(0.306, 0.184, 0.847); // #4e2fd8
  vec3 mid = vec3(0.416, 0.427, 0.961); // #6a6df5
  vec3 light = vec3(0.541, 0.647, 1.000); // #8aa5ff
  vec3 hot = vec3(0.945, 0.957, 1.000); // near-white lavender
  float sdiag = clamp((px.x / u_res.x + (1.0 - px.y / u_res.y)) * 0.5, 0.0, 1.0);
  vec3 base = mix(deep, mid, smoothstep(0.0, 0.55, sdiag));
  base = mix(base, light, smoothstep(0.45, 1.0, sdiag));

  /* Interior: gaseous luminous energy, no static regions. */
  float aa = 1.5;
  float body = 1.0 - smoothstep(-aa, aa, d);
  vec3 icol = base * (0.72 + 0.55 * energy);
  icol *= 0.85 + 0.30 * large;
  icol += hot * smoothstep(0.72, 0.95, fil) * 0.9;
  icol += light * 0.12 * smoothstep(u_bubble.y, u_bubble.w, px.y);
  icol += hot * exp(-abs(d) * 0.10) * 0.22; // rim light on the fluid edge

  /* Wisps stretching above the top edge, dissolving as they rise. */
  float aboveH = max(u_res.y - u_bubble.w, 1.0);
  float rise = clamp((px.y - u_bubble.w) / aboveH, 0.0, 1.0);
  vec2 wp = vec2(px.x * 0.010, px.y * 0.0045 - t * 0.11);
  float wf = fbm(wp + 2.0 * w2) - rise * 0.55;
  float wisps = pow(smoothstep(0.40, 0.85, wf), 1.6) * (1.0 - smoothstep(0.10, 1.0, rise));
  float wGate = smoothstep(-14.0, 6.0, d);
  float hEnv = smoothstep(0.0, 0.06, px.x / u_res.x) * (1.0 - smoothstep(0.94, 1.0, px.x / u_res.x));
  float wispA = clamp(wisps * wGate * hEnv, 0.0, 1.0);
  vec3 wcol = mix(hot, light, clamp(rise * 1.6, 0.0, 1.0));

  /* Soft outer glow around the energy. */
  float glow = exp(-max(d, 0.0) * 0.028);

  /* Composite (premultiplied, normal blending). */
  vec3 acc = icol * body;
  float accA = body;
  float wOut = wispA * (1.0 - body);
  acc += wcol * wOut;
  accA += wOut;
  float gOut = glow * 0.30 * (1.0 - body);
  acc += mid * gOut;
  accA += gOut;
  accA = clamp(accA, 0.0, 1.0);
  gl_FragColor = vec4(acc / max(accA, 0.001), accA);
}
`;

// Static gradient fallback (the square's original look) if WebGL fails.
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

export default function PlasmaSquare() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      });
      if (!gl) {
        setFallback(true);
        return;
      }

      const prog = gl.createProgram();
      if (!prog) throw new Error("program alloc failed");
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("program link failed");
      }
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const loc = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const uRes = gl.getUniformLocation(prog, "u_res");
      const uTime = gl.getUniformLocation(prog, "u_time");
      const uBubble = gl.getUniformLocation(prog, "u_bubble");
      const uRadius = gl.getUniformLocation(prog, "u_radius");

      // Bubble rect + corner radius in device px (y-up), derived from the
      // canvas's own negative insets and the parent's border radius, so it
      // tracks responsive breakpoints automatically.
      const updateUniforms = () => {
        const r = canvas.getBoundingClientRect();
        const cs = getComputedStyle(canvas);
        const padL = Math.max(0, -parseFloat(cs.left));
        const padT = Math.max(0, -parseFloat(cs.top));
        const padR = Math.max(0, -parseFloat(cs.right));
        const padB = Math.max(0, -parseFloat(cs.bottom));
        const sx = canvas.width / Math.max(1, r.width);
        const sy = canvas.height / Math.max(1, r.height);
        gl.uniform4f(
          uBubble,
          padL * sx,
          padB * sy,
          (r.width - padR) * sx,
          (r.height - padT) * sy,
        );
        const parent = canvas.parentElement;
        const rad = parent
          ? parseFloat(getComputedStyle(parent).borderTopLeftRadius) || 0
          : 0;
        gl.uniform1f(uRadius, rad * sx);
      };

      const resize = () => {
        const r = canvas.getBoundingClientRect();
        let scale = Math.min(window.devicePixelRatio || 1, 1.5);
        const MAX_PX = 2500000;
        if (r.width * r.height * scale * scale > MAX_PX) {
          scale = Math.sqrt(MAX_PX / (r.width * r.height));
        }
        const w = Math.max(1, Math.floor(r.width * scale));
        const h = Math.max(1, Math.floor(r.height * scale));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
        updateUniforms();
      };
      resize();

      const draw = (t: number) => {
        resize();
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        draw(12.0); // one static, developed frame — no loop
        return;
      }

      let raf = 0;
      let inView = true;
      const t0 = performance.now();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!inView || document.hidden) return;
        draw((performance.now() - t0) / 1000);
      };

      const io = new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting;
        },
        { threshold: 0 },
      );
      io.observe(canvas);
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      raf = requestAnimationFrame(loop);
      return () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch {
      // Never break the page over decoration.
      setFallback(true);
    }
  }, []);

  if (fallback) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[1.75rem] md:rounded-[2.5rem]"
        style={{ backgroundImage: FALLBACK_GRADIENT }}
      />
    );
  }
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-8 -left-4 -right-4 -top-24 md:-left-8 md:-right-8"
    />
  );
}

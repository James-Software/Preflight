"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* PlasmaSquare — the hero "cloud window": living cloudy sky in the    */
/* classic gradient's blues. Multi-scale domain-warped fBm advected    */
/* upward; billowy white clumps gather and dissolve (tunable          */
/* CLOUD_COVER / CLOUD_SOFT / CLOUD_ERODE). The fluid fills the       */
/* bubble's box edge-to-edge — no bleed margin, no background band.    */
/* The container's rounded corners and overflow-hidden shape it.       */
/*                                                                     */
/* Perf: 3-octave fBm, resolution capped (~1.8M px, DPR <= 1.25),      */
/* pauses off-screen / when hidden. No WebGL -> static gradient.       */
/* Static frame under prefers-reduced-motion.                          */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/* No bleed margin: the fluid fills the bubble's box edge-to-edge, so
   there is no band around it at all. The container's rounded corners
   and overflow-hidden shape it. */
const SIDE_BLEED = 0;
const TOP_BLEED = 0;
const BOTTOM_BLEED = 0;

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

void main() {
  vec2 px = gl_FragCoord.xy;
  float t = u_time;

  vec2 center = (u_bubble.xy + u_bubble.zw) * 0.5;
  vec2 halfSize = (u_bubble.zw - u_bubble.xy) * 0.5;
  vec2 q0 = px - center;

  /* Fluid fields: multi-scale domain-warped fBm, advected upward. */
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
  float fil = 1.0 - abs(2.0 * fine - 1.0);
  fil = pow(fil, 3.0);

  float energy = large * 0.55 + fine * 0.30 + fil * 0.45;

  /* Silhouette: the fluid fills the box edge-to-edge. The SDF marks
     the rounded box so the rim light hugs it; the container clips. */
  float d = sdRoundBox(q0, halfSize, u_radius);

  /* Palette: the classic square gradient — diagonal to top-right,
     more blue. Luminosity comes from energy, not whiteness. */
  vec3 deep = vec3(0.306, 0.184, 0.847); // #4e2fd8
  vec3 mid = vec3(0.416, 0.427, 0.961); // #6a6df5
  vec3 light = vec3(0.541, 0.647, 1.000); // #8aa5ff
  vec3 accent = vec3(0.660, 0.730, 1.000); // bright classic blue, sparse
  float sdiag = clamp((px.x / u_res.x + (1.0 - px.y / u_res.y)) * 0.5, 0.0, 1.0);
  vec3 base = mix(deep, mid, smoothstep(0.0, 0.48, sdiag));
  base = mix(base, light, smoothstep(0.48, 1.0, sdiag));

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

  /* Composite: the canvas IS the sky — opaque everywhere, so the page
     background can never show through. The fluid fills the box
     edge-to-edge; the container's rounded corners shape it. */
  vec3 acc = icol;
  gl_FragColor = vec4(acc, 1.0);
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
      const uSideAmp = gl.getUniformLocation(prog, "u_sideAmp");

      // The canvas IS the bubble's box; the SDF rect is inset by the
      // fixed bleed amounts, so the energy can never leave the box.
      const updateUniforms = (s: number) => {
        const r = canvas.getBoundingClientRect();
        gl.uniform4f(
          uBubble,
          SIDE_BLEED * s,
          BOTTOM_BLEED * s,
          (r.width - SIDE_BLEED) * s,
          (r.height - TOP_BLEED) * s,
        );
        const parent = canvas.parentElement;
        const rad = parent
          ? parseFloat(getComputedStyle(parent).borderTopLeftRadius) || 0
          : 0;
        gl.uniform1f(
          uRadius,
          Math.max(
            0,
            Math.min(
              rad,
              (r.width - SIDE_BLEED * 2) / 2,
              (r.height - TOP_BLEED - BOTTOM_BLEED) / 2,
            ),
          ) * s,
        );
        gl.uniform1f(uSideAmp, 0); // edge waves disabled: fluid fills the box
      };

      const resize = () => {
        const r = canvas.getBoundingClientRect();
        let scale = Math.min(window.devicePixelRatio || 1, 1.25);
        const MAX_PX = 1800000;
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
        updateUniforms(scale);
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
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ backgroundImage: FALLBACK_GRADIENT }}
      />
    );
  }
  // CSS dimensions must stay independent of the drawing-buffer resolution.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block h-full w-full rounded-[inherit]"
    />
  );
}

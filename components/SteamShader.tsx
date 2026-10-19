"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* SteamShader — a fluid-shader vapor plume rising off the top edge of */
/* the hero bubble. Domain-warped fBm makes the tendrils curl,         */
/* stretch, split and dissipate like a gassy flame (never like smoke   */
/* particles); the vapor is brightest blue-white at the square's edge  */
/* and cools into transparency as it rises. The canvas sits just above */
/* the bubble with a soft glow hugging the edge, so the vapor reads as */
/* emerging from the square rather than layered on top.                */
/*                                                                     */
/* Perf: DPR capped, pauses when the hero scrolls out of view or the   */
/* tab hides. Renders nothing if WebGL is unavailable. Static frame    */
/* under prefers-reduced-motion.                                       */
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
uniform float u_edge; // y-up UV of the square's top edge

// Hash without sine (Dave Hoskins)
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Gradient noise
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

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float t = u_time;

  // Signed rise: 0 at the square's edge, -> 1 at canvas top, < 0 below edge
  float sd = (uv.y - u_edge) / (1.0 - u_edge);
  float rise = clamp(sd, 0.0, 1.0);

  // Tendril domain: squeezed horizontally so wisps stretch vertically,
  // scrolling upward with time (sampling downward => pattern rises)
  vec2 p = vec2(uv.x * aspect * 4.0, uv.y * 2.0 - t * 0.24);
  // Slow lateral sway, stronger higher up
  p.x += 0.45 * rise * sin(t * 0.5 + uv.y * 9.0 + uv.x * 3.0);

  // Domain warp: the curling, turbulent "gassy fire" motion
  vec2 q = vec2(
    fbm(p + vec2(0.0, t * 0.05)),
    fbm(p + vec2(5.2, 1.3) - vec2(0.0, t * 0.04))
  );
  float f = fbm(p + 2.4 * q);

  // Erode with height so tendrils thin, split and dissipate as they rise
  f -= rise * 0.38;

  // Soft-thresholded wisps
  float wisp = smoothstep(0.36, 0.78, f);
  wisp = pow(wisp, 1.35);

  // Fine detail riding on the wisps
  float d = fbm(p * 2.6 + vec2(3.1, 7.7) + 1.8 * q - vec2(0.0, t * 0.12));
  float detail = smoothstep(0.40, 0.80, d - rise * 0.30);
  wisp *= 0.55 + 0.65 * detail;

  // Uneven emission along the edge: the vapor breathes
  float emit = 0.55 + 0.45 * fbm(vec2(uv.x * aspect * 1.6 + 11.0, t * 0.07));

  // Continuous envelope: peak at the edge, dissolving upward, soft glow
  // hugging the edge below it (no seam at the edge line)
  float env = exp(-pow(max(sd, 0.0) * 2.6, 1.6));
  env += exp(-pow(max(-sd, 0.0) * 9.0, 1.5)) * 0.45;

  // Fade near the canvas sides
  float hEnv = smoothstep(0.0, 0.08, uv.x) * (1.0 - smoothstep(0.92, 1.0, uv.x));

  float vapA = clamp(wisp * emit * hEnv * env, 0.0, 1.0);
  vapA = pow(vapA, 1.25);

  // Smooth luminous band at the edge (no noise): seamless emergence
  float glow = exp(-pow(sd * 5.0, 2.0)) * hEnv;
  glow *= 0.5 + 0.5 * fbm(vec2(uv.x * aspect * 2.0, t * 0.10));

  // Blue-white luminosity: bright at the square, cooler as it rises
  vec3 bright = vec3(0.93, 0.96, 1.00);
  vec3 cool = vec3(0.52, 0.62, 1.00);
  vec3 col = mix(bright, cool, clamp(sd * 1.5, 0.0, 1.0));
  vec3 glowCol = vec3(0.62, 0.70, 1.00);

  float a = clamp(vapA + glow * 0.45, 0.0, 1.0);
  vec3 colOut = (col * vapA + glowCol * glow * 0.38) / max(a, 0.001);
  gl_FragColor = vec4(colOut, a);
}
`;

// Matches the hero bubble's top padding: the canvas starts at the hero's
// top, so the square's edge sits EDGE_PX down the canvas.
const CANVAS_H = 400;
const EDGE_PX = 84;

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

export default function SteamShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      });
      if (!gl) return; // no WebGL: the page is fine without steam

      const prog = gl.createProgram();
      if (!prog) return;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
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
      const uEdge = gl.getUniformLocation(prog, "u_edge");

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
      };
      resize();

      const edge = () => 1 - EDGE_PX / (canvas.clientHeight || CANVAS_H);
      const draw = (t: number) => {
        resize();
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, t);
        gl.uniform1f(uEdge, edge());
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        draw(9.0); // one static, developed frame — no loop
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
      setFailed(true);
    }
  }, []);

  if (failed) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[2vw] top-0 h-[400px]"
    />
  );
}

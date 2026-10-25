"use client";

import { useEffect, useRef, type ReactNode } from "react";

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0., 1.);
}`;
const fragmentSource = `
precision highp float;
uniform sampler2D u_photo;
uniform vec2 u_cover;
uniform vec2 u_cursor;
uniform float u_aspect;
uniform float u_hover;
uniform float u_scroll;
uniform float u_time;
varying vec2 v_uv;
void main() {
  // Overscan makes room for parallax without exposing an edge of the photo.
  vec2 screen = (v_uv - .5) / 1.18 + .5;
  vec2 uv = (screen - .5) * u_cover + vec2(.5, .5 - .05 * (1. - u_cover.y));
  float foreground = 1. - smoothstep(.34, .65, uv.y);
  // The cloud bank travels faster than the distant sky as the page scrolls.
  uv.y -= u_scroll * (.018 + .07 * foreground) * u_cover.y;
  uv.x += sin(u_time * .12) * .003 * u_cover.x;

  vec2 delta = v_uv - u_cursor;
  vec2 metric = delta * vec2(u_aspect, 1.);
  float distance = length(metric);
  float envelope = exp(-dot(metric, metric) * 11.);
  float ripple = sin(distance * 19. - u_time * 1.8) * .012;
  // A localized lens and soft ripples bend the photograph around the cursor.
  uv += delta * envelope * (.17 + ripple) * u_cover * u_hover;
  uv += vec2(sin(metric.y * 12. + u_time), cos(metric.x * 12. - u_time))
      * envelope * .003 * u_cover * u_hover;
  gl_FragColor = texture2D(u_photo, clamp(uv, .001, .999));
}`;

/** The server-rendered photo remains visible if motion or WebGL is unavailable. */
export default function CloudPhotoMotion({
  children,
}: {
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const layer = root.current,
      surface = canvas.current;
    const host = layer?.parentElement;
    const photo = layer?.querySelector("img");
    if (!layer || !surface || !host || !photo) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    let dispose = () => {};
    function configure() {
      dispose();
      layer!.dataset.motion = "static";
      if (reduced.matches) return;
      let gl: WebGLRenderingContext | null = null;
      try {
        gl = surface!.getContext("webgl", {
          alpha: false,
          antialias: false,
          depth: false,
          preserveDrawingBuffer: false,
        });
      } catch {
        /* Photo-only fallback. */
      }
      let program: WebGLProgram | null = null;
      const shaders: WebGLShader[] = [];
      let buffer: WebGLBuffer | null = null,
        texture: WebGLTexture | null = null;
      let gpuReady = false,
        lost = false;
      let uniforms: Record<string, WebGLUniformLocation | null> = {};
      function releaseGpu() {
        if (!gl) return;
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        shaders.forEach((shader) => gl!.deleteShader(shader));
      }
      if (gl) {
        try {
          for (const [type, source] of [
            [gl.VERTEX_SHADER, vertexSource],
            [gl.FRAGMENT_SHADER, fragmentSource],
          ] as const) {
            const shader = gl.createShader(type);
            if (!shader) throw new Error();
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
              throw new Error();
          }
          program = gl.createProgram();
          if (!program) throw new Error();
          shaders.forEach((shader) => gl!.attachShader(program!, shader));
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error();
          gl.useProgram(program);
          buffer = gl.createBuffer();
          texture = gl.createTexture();
          if (!buffer || !texture) throw new Error();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW,
          );
          const attribute = gl.getAttribLocation(program, "a_position");
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          uniforms = Object.fromEntries(
            [
              "u_photo",
              "u_cover",
              "u_cursor",
              "u_aspect",
              "u_hover",
              "u_scroll",
              "u_time",
            ].map((name) => [name, gl!.getUniformLocation(program!, name)]),
          );
        } catch {
          releaseGpu();
          gl = null;
        }
      }
      let frame = 0,
        visible = true,
        last = 0,
        time = 0;
      let width = 1,
        height = 1,
        scroll = 0,
        targetScroll = 0;
      let x = 0.5,
        y = 0.5,
        targetX = 0.5,
        targetY = 0.5,
        hover = 0,
        targetHover = 0;
      function scrollPosition() {
        const bounds = host!.getBoundingClientRect();
        targetScroll = Math.max(
          -1,
          Math.min(1, -bounds.top / Math.max(bounds.height, 1)),
        );
      }
      function resize() {
        const bounds = host!.getBoundingClientRect();
        width = Math.max(bounds.width, 1);
        height = Math.max(bounds.height, 1);
        const ratio = Math.min(
          devicePixelRatio || 1,
          1.5,
          Math.sqrt(1_800_000 / (width * height)),
        );
        surface!.width = Math.round(width * ratio);
        surface!.height = Math.round(height * ratio);
        gl?.viewport(0, 0, surface!.width, surface!.height);
        scrollPosition();
      }
      function upload() {
        if (!gl || lost || !photo!.complete || !photo!.naturalWidth) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGB,
            gl.RGB,
            gl.UNSIGNED_BYTE,
            photo!,
          );
          gpuReady = true;
        } catch {
          gpuReady = false;
        }
      }
      function tick(now: number) {
        frame = 0;
        if (!visible || document.hidden) return;
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
        last = now;
        time += dt;
        const blend = 1 - Math.exp(-dt * 9);
        x += (targetX - x) * blend;
        y += (targetY - y) * blend;
        hover += (targetHover - hover) * blend;
        scroll += (targetScroll - scroll) * blend;
        if (gl && gpuReady && !lost) {
          const imageAspect = photo!.naturalWidth / photo!.naturalHeight,
            aspect = width / height;
          gl.useProgram(program);
          gl.uniform1i(uniforms.u_photo, 0);
          gl.uniform2f(
            uniforms.u_cover,
            Math.min(1, aspect / imageAspect),
            Math.min(1, imageAspect / aspect),
          );
          gl.uniform2f(uniforms.u_cursor, x, y);
          gl.uniform1f(uniforms.u_aspect, aspect);
          gl.uniform1f(uniforms.u_hover, hover);
          gl.uniform1f(uniforms.u_scroll, scroll);
          gl.uniform1f(uniforms.u_time, time);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          layer!.dataset.motion = "webgl";
        } else {
          layer!.dataset.motion = "fallback";
          photo!.style.transform = `scale(1.18) translate3d(${(x - 0.5) * -8 * hover}px,${scroll * height * 0.065}px,0)`;
        }
        frame = requestAnimationFrame(tick);
      }
      function wake() {
        if (visible && !document.hidden && !frame) {
          last = 0;
          frame = requestAnimationFrame(tick);
        } else if ((!visible || document.hidden) && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      }
      function move(event: PointerEvent) {
        if (!finePointer.matches || event.pointerType === "touch") return;
        const bounds = host!.getBoundingClientRect();
        targetX = Math.max(
          0,
          Math.min(1, (event.clientX - bounds.left) / width),
        );
        targetY =
          1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / height));
        targetHover = 1;
      }
      function leave() {
        targetHover = 0;
      }
      function contextLost(event: Event) {
        event.preventDefault();
        lost = true;
        gpuReady = false;
        layer!.dataset.motion = "fallback";
      }
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        wake();
      });
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host!);
      observer.observe(host!);
      host!.addEventListener("pointermove", move, { passive: true });
      host!.addEventListener("pointerleave", leave);
      host!.addEventListener("pointercancel", leave);
      finePointer.addEventListener("change", leave);
      window.addEventListener("scroll", scrollPosition, { passive: true });
      document.addEventListener("visibilitychange", wake);
      photo!.addEventListener("load", upload);
      surface!.addEventListener("webglcontextlost", contextLost);
      resize();
      upload();
      scroll = targetScroll;
      wake();
      dispose = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        resizeObserver.disconnect();
        host!.removeEventListener("pointermove", move);
        host!.removeEventListener("pointerleave", leave);
        host!.removeEventListener("pointercancel", leave);
        finePointer.removeEventListener("change", leave);
        window.removeEventListener("scroll", scrollPosition);
        document.removeEventListener("visibilitychange", wake);
        photo!.removeEventListener("load", upload);
        surface!.removeEventListener("webglcontextlost", contextLost);
        photo!.style.removeProperty("transform");
        releaseGpu();
      };
    }
    configure();
    reduced.addEventListener("change", configure);
    return () => {
      dispose();
      reduced.removeEventListener("change", configure);
    };
  }, []);
  return (
    <div
      ref={root}
      aria-hidden="true"
      className="hero-cloud-motion pointer-events-none absolute inset-0 -z-10"
    >
      {children}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

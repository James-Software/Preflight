"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  createCloudFlow,
  stepCloudFlow,
  type CloudStroke,
} from "@/lib/cloud-flow";

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
uniform sampler2D u_flow;
uniform float u_scroll;
uniform float u_zoom;
varying vec2 v_uv;
void main() {
  // Overscan makes room for parallax without exposing an edge of the photo.
  vec2 screen = (v_uv - .5) / u_zoom + .5;
  vec2 uv = (screen - .5) * u_cover + vec2(.5, .5 - .05 * (1. - u_cover.y));
  float foreground = 1. - smoothstep(.34, .65, uv.y);
  // The cloud bank travels faster than the distant sky as the page scrolls.
  uv.y -= u_scroll * (.018 + .07 * foreground) * u_cover.y;

  // Sample a persistent directional field, never a cursor-centered zoom lens.
  vec3 trail = texture2D(u_flow, v_uv).rgb;
  vec2 flow = (trail.rg * 255. - 128.) / 127. * .08;
  uv -= flow * u_cover / u_zoom;
  vec3 photo = texture2D(u_photo, clamp(uv, .001, .999)).rgb;
  float brightness = dot(photo, vec3(.2126, .7152, .0722));
  float saturation = max(max(photo.r, photo.g), photo.b) - min(min(photo.r, photo.g), photo.b);
  // Light the cloud detail along old strokes, rather than overlaying a cursor halo.
  float cloud = (1. - smoothstep(.40, .68, uv.y))
      * smoothstep(.45, .82, brightness) * (1. - smoothstep(.10, .32, saturation));
  vec3 sunlit = mix(photo, vec3(1., .985, .95), trail.b * cloud * .24);
  gl_FragColor = vec4(sunlit, 1.);
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
          // A cleared/lost surface must reveal the photo underneath, not black.
          alpha: true,
          antialias: false,
          depth: false,
          // We stop drawing while idle. Retain that frame across compositing,
          // including mobile browser chrome expanding/collapsing during scroll.
          preserveDrawingBuffer: true,
        });
      } catch {
        /* Photo-only fallback. */
      }
      let program: WebGLProgram | null = null;
      const shaders: WebGLShader[] = [];
      let buffer: WebGLBuffer | null = null,
        texture: WebGLTexture | null = null,
        flowTexture: WebGLTexture | null = null;
      const flow = createCloudFlow();
      let pointer: [number, number] | null = null;
      let pendingStroke: CloudStroke | null = null;
      let gpuReady = false,
        lost = false;
      let uniforms: Record<string, WebGLUniformLocation | null> = {};
      function releaseGpu() {
        if (!gl) return;
        if (texture) gl.deleteTexture(texture);
        if (flowTexture) gl.deleteTexture(flowTexture);
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
          flowTexture = gl.createTexture();
          if (!flowTexture) throw new Error();
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, flowTexture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            flow.width,
            flow.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            stepCloudFlow(flow, 0, null, 1),
          );
          uniforms = Object.fromEntries(
            ["u_photo", "u_cover", "u_flow", "u_scroll", "u_zoom"].map(
              (name) => [name, gl!.getUniformLocation(program!, name)],
            ),
          );
        } catch {
          releaseGpu();
          gl = null;
        }
      }
      let frame = 0,
        visible = true,
        last = 0;
      let width = 1,
        height = 1,
        scroll = 0,
        targetScroll = 0;
      function scrollPosition() {
        const bounds = host!.getBoundingClientRect();
        targetScroll = Math.max(
          -1,
          Math.min(1, -bounds.top / Math.max(bounds.height, 1)),
        );
        wake();
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
        const pixelWidth = Math.round(width * ratio);
        const pixelHeight = Math.round(height * ratio);
        // Assigning either dimension clears the drawing buffer, even if the
        // value did not change. Repaint real resizes before this callback ends.
        if (surface!.width !== pixelWidth || surface!.height !== pixelHeight) {
          surface!.width = pixelWidth;
          surface!.height = pixelHeight;
          gl?.viewport(0, 0, pixelWidth, pixelHeight);
          cancelAnimationFrame(frame);
          frame = 0;
          tick(performance.now());
        }
        scrollPosition();
      }
      function upload() {
        if (!gl || lost || !photo!.complete || !photo!.naturalWidth) return;
        try {
          gl.activeTexture(gl.TEXTURE0);
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
          wake();
        } catch {
          gpuReady = false;
        }
      }
      function tick(now: number) {
        frame = 0;
        if (!visible || document.hidden) return;
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
        last = now;
        const blend = 1 - Math.exp(-dt * 9);
        scroll += (targetScroll - scroll) * blend;
        const zoom = 1.18 + Math.max(0, scroll) * 0.12;
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
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, flowTexture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            flow.width,
            flow.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            stepCloudFlow(flow, dt, pendingStroke, aspect),
          );
          pendingStroke = null;
          gl.uniform1i(uniforms.u_flow, 1);
          gl.uniform1f(uniforms.u_scroll, scroll);
          gl.uniform1f(uniforms.u_zoom, zoom);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          layer!.dataset.motion = "webgl";
        } else {
          layer!.dataset.motion = "fallback";
          pendingStroke = null;
          flow.active = false;
          photo!.style.transform = `scale(${zoom}) translate3d(0px,${scroll * height * 0.065}px,0)`;
        }
        if (
          flow.active ||
          pendingStroke ||
          Math.abs(targetScroll - scroll) > 0.00001
        )
          frame = requestAnimationFrame(tick);
      }
      function wake() {
        if (visible && !document.hidden && !frame) {
          last = 0;
          frame = requestAnimationFrame(tick);
        } else if ((!visible || document.hidden) && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          leave();
          pendingStroke = null;
          flow.values.fill(0);
          flow.light.fill(0);
        }
      }
      function move(event: PointerEvent) {
        if (!finePointer.matches || event.pointerType === "touch") return;
        const bounds = host!.getBoundingClientRect();
        const point: [number, number] = [
          Math.max(0, Math.min(1, (event.clientX - bounds.left) / width)),
          1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / height)),
        ];
        if (pointer)
          pendingStroke = { from: pendingStroke?.from || pointer, to: point };
        pointer = point;
        wake();
      }
      function leave() {
        pointer = null; // The existing displacement continues relaxing after exit.
      }
      function contextLost(event: Event) {
        event.preventDefault();
        lost = true;
        gpuReady = false;
        layer!.dataset.motion = "fallback";
        wake();
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

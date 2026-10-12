"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Shared flight path: screen % + recession scale + bank/pitch (deg).  */
/* t in [0,1]. Imported by PixelSky so the DOM wrapper and the 3D      */
/* model stay in perfect sync.                                         */
/* ------------------------------------------------------------------ */

export function planeFlight(t: number) {
  const x = 8 + (68 - 8) * t; // 8% -> 68% of hero width
  const y = 66 - 54 * Math.pow(t, 1.5); // 66% -> 12%, accelerating climb
  const scale = 1 - 0.45 * Math.pow(t, 1.4); // 1 -> ~0.55: recedes into distance
  const bank = -15 * Math.sin(Math.PI * t); // gentle roll into the climb
  const pitch = -14 * Math.sin((Math.PI / 2) * t); // nose-up ramp
  return { x, y, scale, bank, pitch };
}

const SIZE = 260; // CSS px, square stage for the model
const D2R = Math.PI / 180;

interface Plane3DProps {
  /** 0..1 scroll progress of the takeoff, owned by PixelSky */
  getScrollP: () => number;
}

/**
 * Procedural paper dart rendered with Three.js (dynamically imported so it
 * never touches the initial bundle or SSR). Folded-paper facets in plain
 * whites, lit with a purple rim light so it feels color-graded into the
 * world.
 *
 * Scroll drives the pose (position comes from the DOM wrapper via
 * planeFlight; bank/pitch/idle sway happen inside the scene). Reduced
 * motion renders one static parked frame and stops.
 */
export default function Plane3D({ getScrollP }: Plane3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let dart: THREE.Group | null = null;
    let visible = true;
    let observer: IntersectionObserver | null = null;

    const dispose = () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (scene) {
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const m = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m.dispose();
          }
        });
      }
      renderer?.dispose();
      host.innerHTML = "";
    };

    const onVis = () => {
      // rAF auto-pauses in hidden tabs; nothing to do beyond the guard.
    };

    const build = async () => {
      const THREE = await import("three");
      if (cancelled) return;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(SIZE, SIZE);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.22;
      host.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0.7, 7.4);
      camera.lookAt(0, 0.05, 0);

      // Lighting: soft sky fill + strong key + visible purple rim (the color grade).
      scene.add(new THREE.HemisphereLight(0xede9fe, 0xffffff, 1.05));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(4, 6, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x8b5cf6, 2.4);
      rim.position.set(-5, 2, -4);
      scene.add(rim);

      // Paper whites with subtle variation — the facet variation IS the
      // paper look. DoubleSide so the keel and wing undersides render.
      const paper = (color: string) =>
        new THREE.MeshStandardMaterial({
          color,
          flatShading: true,
          roughness: 0.85,
          metalness: 0,
          side: THREE.DoubleSide,
        });
      const outerPanel = paper("#ffffff");
      const innerPanel = paper("#f4f2ff");
      const keelMat = paper("#e6e3fb");

      dart = new THREE.Group();

      // Folded paper dart, nose at +X. Each wing is two flat facets joined
      // along a mid-rib crease so the folds catch the light like real paper.
      const tri = (
        a: number[],
        b: number[],
        c: number[],
        m: THREE.Material,
      ) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3),
        );
        g.computeVertexNormals();
        return new THREE.Mesh(g, m);
      };

      const nose: [number, number, number] = [1.15, 0, 0];
      const tailCenter: [number, number, number] = [-1.05, 0.02, 0];
      for (const s of [1, -1]) {
        const rib: [number, number, number] = [0.35, 0.04, 0.55 * s];
        const wingtip: [number, number, number] = [-0.45, 0.1, 1.05 * s];
        dart.add(tri(nose, tailCenter, rib, innerPanel)); // inner panel
        dart.add(tri(rib, wingtip, tailCenter, outerPanel)); // outer panel
      }
      // Keel: the folded-under bottom fin, in the z=0 plane.
      dart.add(
        tri([0.95, -0.02, 0], [-0.85, -0.4, 0], [0.1, -0.05, 0], keelMat),
      );

      scene.add(dart);

      const placeStatic = (t: number) => {
        if (!dart || !renderer || !scene || !camera) return;
        const f = planeFlight(t);
        dart.rotation.set(f.bank * D2R, -0.12, f.pitch * D2R);
        dart.position.set(0, 0, 0);
        renderer.render(scene, camera);
      };

      if (reduced) {
        placeStatic(0);
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0 },
      );
      observer.observe(host);
      document.addEventListener("visibilitychange", onVis);

      let st = 0; // smoothed scroll progress
      const start = performance.now();
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (document.hidden || !visible || !dart || !renderer || !scene || !camera)
          return;
        const target = Math.min(1, Math.max(0, getScrollP()));
        st += (target - st) * 0.22;
        if (Math.abs(target - st) < 0.0004) st = target;
        const f = planeFlight(st);
        const el = (now - start) / 1000;
        // Idle life: gentle sway layered over the scroll pose, always smooth.
        const idleRoll = 2.4 * Math.sin(el * 0.9);
        const idlePitch = 1.6 * Math.sin(el * 0.7 + 1.3);
        const bob = 0.05 * Math.sin(el * 1.1);
        dart.rotation.set(
          (f.bank + idleRoll) * D2R,
          -0.12,
          (f.pitch + idlePitch) * D2R,
        );
        dart.position.set(0, bob, 0);
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);
    };

    build();

    return () => {
      cancelled = true;
      dispose();
    };
  }, [getScrollP]);

  return (
    <div
      ref={hostRef}
      style={{ width: SIZE, height: SIZE }}
      className="pointer-events-none"
      aria-hidden="true"
    />
  );
}

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
  const bank = -10 * Math.sin(Math.PI * t); // gentle roll into the climb
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
 * Procedural low-poly airplane rendered with Three.js (dynamically
 * imported so it never touches the initial bundle or SSR). The model
 * wears the site palette — indigo fuselage, periwinkle wings — lit with
 * a purple rim light so it feels color-graded into the world.
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
    let jet: THREE.Group | null = null;
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
      renderer.toneMappingExposure = 1.12;
      host.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0.7, 7.4);
      camera.lookAt(0, 0.05, 0);

      // Lighting: soft sky fill + warm key + purple rim (the color grade).
      scene.add(new THREE.HemisphereLight(0xede9fe, 0xffffff, 0.85));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(4, 6, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x8b5cf6, 1.2);
      rim.position.set(-5, 2, -4);
      scene.add(rim);

      const mat = (color: string, extra?: Record<string, number>) =>
        new THREE.MeshStandardMaterial({
          color,
          flatShading: true,
          roughness: 0.55,
          metalness: 0.08,
          ...extra,
        });
      const indigo = mat("#4f46e5");
      const deepIndigo = mat("#4338ca");
      const peri = mat("#a5b4fc");
      const periLight = mat("#c7d2fe", { roughness: 0.35, metalness: 0.15 });
      const mid = mat("#818cf8");

      jet = new THREE.Group();

      // Fuselage: capsule along X (flight direction).
      const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.7, 6, 14), indigo);
      fus.rotation.z = Math.PI / 2;
      jet.add(fus);

      // Nose cone.
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 14), deepIndigo);
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 1.08;
      jet.add(nose);

      // Canopy.
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), periLight);
      canopy.scale.set(1.5, 0.72, 0.88);
      canopy.position.set(0.38, 0.3, 0);
      jet.add(canopy);

      // Main wings with a whisper of dihedral.
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.09, 3.3), peri);
      wing.position.set(-0.15, -0.04, 0);
      wing.rotation.x = 0.07;
      jet.add(wing);

      // Tailplane.
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 1.6), mid);
      tail.position.set(-1.02, 0.1, 0);
      jet.add(tail);

      // Vertical fin, swept back.
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.08), indigo);
      fin.position.set(-1.0, 0.44, 0);
      fin.rotation.z = -0.22;
      jet.add(fin);

      scene.add(jet);

      const placeStatic = (t: number) => {
        if (!jet || !renderer || !scene || !camera) return;
        const f = planeFlight(t);
        jet.rotation.set(f.bank * D2R, -0.12, f.pitch * D2R);
        jet.position.set(0, 0, 0);
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
        if (document.hidden || !visible || !jet || !renderer || !scene || !camera)
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
        jet.rotation.set(
          (f.bank + idleRoll) * D2R,
          -0.12,
          (f.pitch + idlePitch) * D2R,
        );
        jet.position.set(0, bob, 0);
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

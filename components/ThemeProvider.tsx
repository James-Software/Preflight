"use client";

import { useEffect } from "react";
import { applyTheme, savedTheme, THEME_STORAGE_KEY } from "./theme";

/** Install theme synchronization once for every route, with or without a toggle. */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => applyTheme(savedTheme() ?? (media.matches ? "light" : "dark"), false);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) sync();
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return children;
}

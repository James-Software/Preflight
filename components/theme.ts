/** Shared theme helpers. The blocking script in layout.tsx sets the initial
    <html class="dark"> before first paint; these keep it in sync at runtime. */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "preflight-theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Apply a theme now; persists to localStorage unless persist=false. */
export function applyTheme(theme: Theme, persist = true): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private mode — the theme just won't persist.
    }
  }
}

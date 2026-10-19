"use client";

import { applyTheme } from "./theme";
import useTheme from "./useTheme";

export function MoonIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function SunIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </svg>
  );
}

/** Uses the same root theme state as the profile menu on every route. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={`pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/70 transition-colors duration-150 hover:bg-ink/5 hover:text-ink dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white ${className}`}
    >
      <SunIcon className="hidden h-[18px] w-[18px] dark:block" />
      <MoonIcon className="h-[18px] w-[18px] dark:hidden" />
    </button>
  );
}

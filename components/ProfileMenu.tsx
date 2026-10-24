"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Avatar, { type ProfileUser } from "./Avatar";
import { MoonIcon, SunIcon } from "./ThemeToggle";
import { applyTheme } from "./theme";
import useTheme from "./useTheme";

export default function ProfileMenu({
  user,
  isAdmin = false,
}: {
  user: ProfileUser;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const position = () => {
      panel.style.translate = "0px";
      const bounds = panel.getBoundingClientRect();
      const offset = Math.max(
        12 - bounds.left,
        Math.min(0, window.innerWidth - 12 - bounds.right),
      );
      panel.style.translate = `${offset}px`;
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        aria-label="Profile and appearance"
        className="flex min-h-10 items-center gap-2 rounded-full p-1 transition-colors duration-150 hover:bg-ink/5 sm:pr-2.5 dark:hover:bg-white/10"
      >
        <Avatar user={user} />
        <span className="hidden max-w-28 truncate text-sm font-medium text-ink sm:inline dark:text-white">
          {user.name?.trim().split(/\s+/)[0] || "Profile"}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`hidden h-3.5 w-3.5 text-muted transition-transform duration-200 sm:block dark:text-muted ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label="Profile and appearance"
          className="absolute right-0 top-[calc(100%+10px)] z-50 max-h-[calc(100dvh-6rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-2 text-ink shadow-[0_8px_30px_rgba(30,27,75,0.14)] dark:text-white dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        >
          <p className="truncate px-3 py-2 text-sm font-medium">
            {user.name || "Your account"}
          </p>
          <p className="px-3 pb-2 pt-1 text-sm font-medium text-muted dark:text-muted">
            Appearance
          </p>
          <div
            role="group"
            aria-label="Color theme"
            className="grid grid-cols-2 gap-1 rounded-xl bg-panel p-1"
          >
            {(["light", "dark"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={theme === choice}
                onClick={() => applyTheme(choice)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium capitalize transition-colors duration-150 ${theme === choice ? "bg-surface text-ink shadow-sm dark:bg-white/15 dark:text-white" : "text-muted hover:text-ink dark:text-muted dark:hover:text-white"}`}
              >
                {choice === "dark" ? (
                  <MoonIcon className="h-3.5 w-3.5" />
                ) : (
                  <SunIcon className="h-3.5 w-3.5" />
                )}
                {choice}
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-line pt-2">
            <a
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-ink/70 hover:bg-panel dark:text-white/70"
            >
              Dashboard
            </a>
            {isAdmin && (
              <>
                <a
                  href="/dashboard/admin/blog"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm hover:bg-panel"
                >
                  Blog posts
                </a>
                <a
                  href="/dashboard/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm hover:bg-panel"
                >
                  Waitlist
                </a>
              </>
            )}
            <a
              href="/"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-ink/70 hover:bg-panel dark:text-white/70"
            >
              Home
            </a>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/" })}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink/70 hover:bg-panel dark:text-white/70"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

export type ProfileUser = { name?: string | null; image?: string | null };

/** Shared presentation for the current user and noninteractive member avatars. */
export default function Avatar({ user, className = "h-8 w-8" }: { user: ProfileUser; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = (user.name?.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("") || "P").toUpperCase();

  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel text-xs font-semibold text-ink ring-1 ring-ink/10 dark:text-white dark:ring-white/20 ${className}`}>
      {user.image && user.image !== failedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="h-full w-full object-cover" onError={() => setFailedSrc(user.image ?? null)} />
      ) : initials}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export default function ProjectLogo({
  appUrl,
  name,
}: {
  appUrl: string | null;
  name: string;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  let hostname = "";
  try {
    const url = new URL(appUrl || "");
    if (["http:", "https:"].includes(url.protocol)) hostname = url.hostname;
  } catch {
    /* Projects without a deployed URL use their initial. */
  }
  const src = hostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
    : null;
  useEffect(() => {
    if (src && image.current?.complete && !image.current.naturalWidth)
      setFailedUrl(src);
  }, [src]);
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface text-lg font-semibold text-muted"
    >
      {src && src !== failedUrl ? (
        // External favicon discovery also handles sites with nonstandard icon paths.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          src={src}
          alt=""
          width={28}
          height={28}
          className="size-7 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        name.split("/").pop()?.slice(0, 1).toUpperCase() || "P"
      )}
    </span>
  );
}

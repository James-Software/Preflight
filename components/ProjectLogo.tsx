"use client";

import { useEffect, useRef, useState } from "react";
import { appIconOrigin, isPreflightOrigin } from "@/lib/site-icons";

export default function ProjectLogo({
  appUrl,
  name,
  projectId,
  imageUrl,
  size = "md",
}: {
  appUrl: string | null;
  name: string;
  projectId: number;
  imageUrl?: string | null;
  size?: "sm" | "md";
}) {
  const image = useRef<HTMLImageElement>(null);
  const origin = appIconOrigin(appUrl);
  const ownSite = !!origin && isPreflightOrigin(origin);
  const [discovery, setDiscovery] = useState<{
    origin: string;
    projectId: number;
    icons: string[];
  } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const icons = imageUrl
    ? [imageUrl]
    : ownSite
      ? ["/icon.png"]
      : origin
        ? [
            ...(discovery?.origin === origin &&
            discovery.projectId === projectId
              ? discovery.icons
              : []),
            `${origin}/favicon.ico`,
          ]
        : [];
  const src = icons.find((icon) => !failed.includes(icon)) || null;
  useEffect(() => {
    if (!origin || ownSite || imageUrl) return;
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/favicon`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted && Array.isArray(data?.icons))
          setDiscovery({
            origin,
            projectId,
            icons: data.icons.filter(
              (icon: unknown) => typeof icon === "string",
            ),
          });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [origin, ownSite, projectId, imageUrl]);
  function failure(url: string) {
    setFailed((previous) =>
      previous.includes(url) ? previous : [...previous, url],
    );
  }
  useEffect(() => {
    if (src && image.current?.complete && !image.current.naturalWidth)
      failure(src);
  }, [src]);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface font-medium text-muted ${size === "sm" ? "size-9 text-sm" : "size-12 text-lg"}`}
    >
      {src ? (
        <img
          key={src}
          ref={image}
          src={src}
          alt=""
          width={size === "sm" ? 20 : 28}
          height={size === "sm" ? 20 : 28}
          className={`${size === "sm" ? "size-5" : "size-7"} object-contain`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => failure(src)}
        />
      ) : (
        name.split("/").pop()?.slice(0, 1).toUpperCase() || "P"
      )}
    </span>
  );
}

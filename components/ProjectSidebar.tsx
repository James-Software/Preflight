"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import ProjectLogo from "@/components/ProjectLogo";

export function ProjectSectionIcon({
  section,
}: {
  section: "runs" | "general" | "database" | "profiles" | "collaboration";
}) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {section === "runs" ? (
        <>
          <path d="m10 8 6 4-6 4V8Z" />
          <circle cx="12" cy="12" r="9" />
        </>
      ) : section === "collaboration" ? (
        <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 15a5 5 0 0 1 6 5" /></>
      ) : section === "profiles" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" />
        </>
      ) : section === "general" ? (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" fill="var(--page)" />
          <circle cx="15" cy="12" r="2" fill="var(--page)" />
          <circle cx="9" cy="18" r="2" fill="var(--page)" />
        </>
      ) : (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
        </>
      )}
    </svg>
  );
}
export default function ProjectSidebar({
  project,
  canManage = true,
  isTestUser = false,
}: {
  project: {
    id: number;
    name: string;
    repo: string;
    appUrl: string | null;
    imageUrl?: string | null;
  };
  canManage?: boolean;
  isTestUser?: boolean;
}) {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && selected && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft += selected.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - selected.offsetWidth) / 2;
    }
  }, [pathname]);
  const base = `/dashboard/projects/${project.id}`;
  const tabs = [
    { section: "runs", label: "Runs", href: base },
    { section: "profiles", label: "Profiles", href: `${base}/profiles` },
    { section: "general", label: "General info", href: `${base}/general` },
    { section: "database", label: "Database", href: `${base}/database` },
    { section: "collaboration", label: "Collaboration", href: `${base}/collaboration` },
  ] as const;
  return (
    <aside className="min-w-0 border-b border-line pb-5 lg:sticky lg:top-24 lg:self-start lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
      <Link
        href="/dashboard"
        className="pressable -ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-panel hover:text-primary"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="m12 5-7 7 7 7M5 12h15" />
        </svg>
        Back to projects
      </Link>
      <div className="mt-4 flex min-w-0 items-center gap-3">
        <ProjectLogo
          projectId={project.id}
          name={project.name}
          appUrl={project.appUrl}
          imageUrl={project.imageUrl}
        />
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{project.name}</p>
          <p className="mt-1 truncate text-xs text-muted" title={project.repo}>
            {project.repo}
          </p>
        </div>
      </div>
      <nav
        ref={navigation}
        aria-label="Project sections"
        className="mt-6 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-2 lg:overflow-visible"
      >
        {tabs.filter((tab) => (canManage || ["runs", "collaboration"].includes(tab.section)) && (!isTestUser || tab.section !== "collaboration")).map((tab) => {
          const selected =
            tab.section === "runs"
              ? pathname === base || pathname.startsWith(`${base}/runs/`)
              : pathname === tab.href;
          return (
            <Link
              key={tab.section}
              href={tab.href}
              prefetch={false}
              aria-current={selected ? "page" : undefined}
              className={`pressable flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-3 text-center text-xs font-medium transition-colors sm:text-sm lg:justify-start lg:px-3 lg:text-left ${selected ? "bg-panel text-primary" : "text-muted hover:bg-panel hover:text-primary"}`}
            >
              <ProjectSectionIcon section={tab.section} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

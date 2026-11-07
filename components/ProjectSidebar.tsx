"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ProjectLogo from "@/components/ProjectLogo";
import { ArrowLeft, CirclePlay, Database, KeyRound, Settings2, UsersRound } from "lucide-react";

const SECTION_ICONS = { runs: CirclePlay, general: Settings2, database: Database, profiles: KeyRound, collaboration: UsersRound };

export function ProjectSectionIcon({
  section,
}: {
  section: "runs" | "general" | "database" | "profiles" | "collaboration";
}) {
  const Icon = SECTION_ICONS[section];
  return <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />;
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
  const router = useRouter();
  const base = `/dashboard/projects/${project.id}`;
  const tabs = [
    { section: "runs", label: "Runs", href: base },
    { section: "profiles", label: "Profiles", href: `${base}/profiles` },
    { section: "general", label: "General info", href: `${base}/general` },
    { section: "database", label: "Database", href: `${base}/database` },
    { section: "collaboration", label: "Collaboration", href: `${base}/collaboration` },
  ] as const;
  const visibleTabs = tabs.filter((tab) =>
    (canManage || ["runs", "collaboration"].includes(tab.section)) &&
    (!isTestUser || tab.section !== "collaboration"),
  );
  const selectedTab = visibleTabs.find((tab) =>
    tab.section === "runs"
      ? pathname === base || pathname.startsWith(`${base}/runs/`)
      : pathname === tab.href,
  );
  return (
    <aside className="project-navigation min-w-0 border-b border-line pb-3 lg:sticky lg:top-24 lg:self-start lg:border-b-0 lg:pb-0 lg:pr-6">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/dashboard"
          aria-label="Back to projects"
          className="pressable -ml-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-panel hover:text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden lg:inline">Back to projects</span>
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold lg:hidden" title={project.repo}>
          {project.name}
        </p>
        <select
          aria-label="Project section"
          value={selectedTab?.href || base}
          onChange={(event) => router.push(event.target.value)}
          className="min-h-11 max-w-[48%] rounded-lg border border-line bg-page px-3 text-sm lg:hidden"
        >
          {visibleTabs.map((tab) => <option key={tab.section} value={tab.href}>{tab.label}</option>)}
        </select>
      </div>
      <div className="mt-4 hidden min-w-0 items-center gap-3 lg:flex">
        <ProjectLogo
          projectId={project.id}
          name={project.name}
          appUrl={project.appUrl}
          imageUrl={project.imageUrl}
          size="sm"
        />
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{project.name}</p>
          <p className="mt-1 truncate text-xs text-muted" title={project.repo}>
            {project.repo}
          </p>
        </div>
      </div>
      <nav
        aria-label="Project sections"
        className="mt-5 hidden flex-col gap-1 lg:flex"
      >
        {visibleTabs.map((tab) => {
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

"use client";
import { findingsPrompt, findingFixParagraph } from "@/lib/finding-prompts";

import { ChevronRight } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { reconnectGithub, githubReconnected } from "@/lib/github-reconnect";
import { useRouter } from "next/navigation";
import type { FindingReport } from "@/lib/schema";
import { BranchIcon, PullRequestIcon } from "@/components/GitIcons";

function safeUrl(raw: string | null, github = false) {
  try {
    const url = new URL(raw || "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      (!github || url.hostname === "github.com")
    )
      return url.href;
  } catch {
    /* Stored artifacts may be absent or invalid. */
  }
}
const pendingGroup = (f: FindingReport) =>
  !!f.pr_group_id && f.pr_group_state !== "open";
const ready = (f: FindingReport) => !f.pr_url && !f.pr_group_id;

function Evidence({ finding: f }: { finding: FindingReport }) {
  const screenshot = safeUrl(f.screenshot_url);
  const network =
    f.network_errors == null ||
    f.network_errors === "" ||
    (Array.isArray(f.network_errors) && !f.network_errors.length)
      ? null
      : typeof f.network_errors === "string"
        ? f.network_errors
        : JSON.stringify(f.network_errors, null, 2);
  return (
    <div className="grid min-w-0 gap-8 py-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        {f.repro_steps && (
          <section>
            <h3 className="font-semibold">How to reproduce</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {f.repro_steps}
            </p>
          </section>
        )}
        {
          <section>
            <h3 className="font-semibold">Issue & suggested fix</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {findingFixParagraph(f)}
            </p>
            {f.confidence && (
              <p className="mt-2 text-sm text-muted">
                Confidence: {f.confidence}
              </p>
            )}
          </section>
        }
        {!f.patch_diff && (
          <p className="text-sm text-muted">
            Opening a PR prepares a code patch from the repository first. Review
            and test the resulting PR before merging.
          </p>
        )}
        {(
          [
            ["Proposed code change", f.patch_diff],
            ["Console logs", f.console_logs],
            ["Network evidence", network],
          ] as const
        ).map(
          ([label, text]) =>
            text && (
              <details key={label}>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                  {label}
                </summary>
                <pre className="mt-2 max-h-80 max-w-full overflow-auto rounded-lg border border-line bg-page p-4 text-xs leading-relaxed">
                  <code>{text}</code>
                </pre>
              </details>
            ),
        )}
      </div>
      {screenshot && (
        <figure className="min-w-0">
          <a
            href={screenshot}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open full screenshot for ${f.title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshot}
              alt={`Browser evidence for ${f.title}`}
              className="h-auto max-h-[28rem] w-full rounded-lg border border-line object-contain object-top"
              loading="lazy"
            />
          </a>
          <figcaption className="mt-2 text-xs text-muted">
            Browser evidence · open for full size
          </figcaption>
        </figure>
      )}
    </div>
  );
}

export default function FixesTable({
  findings,
  projectId,
  runId,
  isGuest = false,
}: {
  findings: FindingReport[];
  projectId: number;
  runId: number;
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [headerHeight, setHeaderHeight] = useState(80);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const observer = new ResizeObserver(() =>
      setHeaderHeight(header.getBoundingClientRect().height),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(
    null,
  );
  const [deleted, setDeleted] = useState<number[]>([]);
  const [opened, setOpened] = useState<
    Record<number, { url: string; number: number }>
  >({});
  const [reserved, setReserved] = useState<Record<number, string>>({});
  const selectAll = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const retryKeys = useRef<Record<string, string>>({});
  const rows = findings
    .filter((f) => !deleted.includes(f.id))
    .map((f) => ({
      ...f,
      ...(opened[f.id]
        ? {
            pr_url: opened[f.id].url,
            pr_number: opened[f.id].number,
            pr_group_state: "open",
          }
        : {}),
      pr_group_id: f.pr_group_id || reserved[f.id] || null,
    }));
  const selectable = rows;
  const selection = rows.filter((f) => selected.includes(f.id));
  const allSelected =
    !!selectable.length && selection.length === selectable.length;
  const selectedGroup = selection[0]?.pr_group_id;
  const canResume =
    !!selectedGroup &&
    selection.every(
      (f) => pendingGroup(f) && f.pr_group_id === selectedGroup,
    ) &&
    selection.length ===
      rows.filter((f) => f.pr_group_id === selectedGroup).length;
  const canOpen = !!selection.length && (selection.every(ready) || canResume);
  const waiting = rows.some((f) => pendingGroup(f) && !f.pr_error);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [waiting, router]);
  useEffect(() => {
    setReserved((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id]) =>
          findings.some((f) => f.id === Number(id) && !!f.pr_group_id),
        ),
      ),
    );
  }, [findings]);
  const preparingNotice = !!notice?.text.startsWith("Preparing code fixes");
  useEffect(() => {
    if (!preparingNotice) return;
    const tracked = findings.filter((f) => reserved[f.id]);
    if (!tracked.length) return;
    if (tracked.some((f) => f.pr_error))
      setNotice({
        text: "Fix preparation needs attention. Review the finding’s message, retry the PR, or copy its prompt.",
      });
    else if (tracked.every((f) => safeUrl(f.pr_url, true)))
      setNotice({
        text: "Your PR is ready for review.",
        url: safeUrl(tracked[0].pr_url, true),
      });
  }, [findings, reserved, preparingNotice]);
  async function copyPrompts(chosen: FindingReport[]) {
    try {
      await navigator.clipboard.writeText(findingsPrompt(chosen));
      setNotice({
        text: `Copied ${chosen.length} bug prompt${chosen.length === 1 ? "" : "s"}.`,
      });
      setError("");
    } catch {
      setError(
        "Could not access the clipboard. Expand a finding and copy its issue and suggested fix.",
      );
    }
  }
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = !!selection.length && !allSelected;
  }, [selection.length, allSelected]);

  const action = async (
    kind: "delete" | "open-pr",
    chosen: FindingReport[],
    existingGroup?: string,
  ) => {
    if (busy || !chosen.length) return;
    setBusy(true);
    setError("");
    setNotice(null);
    const ids = chosen.map((f) => f.id).sort((a, b) => a - b);
    const signature = ids.join(",");
    const groupId =
      existingGroup || retryKeys.current[signature] || crypto.randomUUID();
    retryKeys.current[signature] = groupId;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/runs/${runId}/findings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: kind, findingIds: ids, groupId }),
        },
      );
      const data = await response.json();
      if (
        response.status === 401 &&
        reconnectGithub(window.location.pathname + window.location.search)
      )
        return;
      if (!response.ok) {
        if (data.groupId)
          setReserved((previous) => ({
            ...previous,
            ...Object.fromEntries(ids.map((id) => [id, data.groupId])),
          }));
        throw new Error(
          data.error || "Could not complete the action. Try again.",
        );
      }
      if (data.queued) {
        setReserved((previous) => ({
          ...previous,
          ...Object.fromEntries(ids.map((id) => [id, data.groupId])),
        }));
        setNotice({
          text: "Preparing code fixes and opening your PR. This report updates automatically.",
        });
        setSelected([]);
        return;
      }
      if (kind === "open-pr") githubReconnected();
      if (kind === "delete") {
        setDeleted((previous) => [...previous, ...ids]);
        setNotice({
          text: `${ids.length} finding${ids.length === 1 ? "" : "s"} deleted.`,
        });
      } else {
        const url = safeUrl(data.prUrl, true);
        if (!url || !Number.isSafeInteger(data.prNumber))
          throw new Error(
            "Could not confirm the PR. Refresh the report before retrying.",
          );
        setOpened((previous) => ({
          ...previous,
          ...Object.fromEntries(
            ids.map((id) => [id, { url, number: data.prNumber }]),
          ),
        }));
        setNotice({
          text: `Opened PR #${data.prNumber} with ${ids.length} fix${ids.length === 1 ? "" : "es"}.`,
          url,
        });
      }
      setSelected([]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection lost. Refresh and retry this group.",
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  const secondary =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <section className="mt-6" aria-labelledby="fixes-heading" aria-busy={busy}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="fixes-heading" className="text-base font-semibold">
          {rows.length} finding{rows.length === 1 ? "" : "s"}
        </h2>
        {(rows.length > 1 || selecting) && <button type="button" disabled={busy}
          onClick={() => { setSelecting(!selecting); setSelected([]); }}
          className="min-h-11 px-2 text-sm text-muted hover:text-primary">
          {selecting ? "Done" : "Select"}
        </button>}
      </div>
      {selecting && selection.length > 0 && <div
        style={{ top: headerHeight }}
        className="sticky z-10 mt-6 flex min-h-20 flex-wrap items-center gap-3 border-y border-line bg-page py-3"
      >
        <p className="mr-auto text-sm text-muted" aria-live="polite">
          {selection.length} selected
        </p>
        {!!selection.length && (
          <button
            className="min-h-11 px-2 text-sm text-muted hover:text-primary"
            disabled={busy}
            onClick={() => { setSelected([]); selectAll.current?.focus(); }}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className={secondary}
          disabled={busy || !selection.length}
          onClick={() => void copyPrompts(selection)}
        >
          Copy prompts
        </button>
        <button
          type="button"
          className={secondary}
          disabled={busy || !selection.length || selection.some(pendingGroup)}
          onClick={() => dialog.current?.showModal()}
        >
          Delete selected
        </button>
        <button
          type="button"
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isGuest || busy || !canOpen}
          onClick={() =>
            void action(
              "open-pr",
              selection,
              canResume ? selectedGroup! : undefined,
            )
          }
        >
          <BranchIcon />
          {busy
            ? "Working…"
            : canResume
              ? `${selection.some((f) => f.pr_error) ? "Retry" : "Resume"} PR (${selection.length})`
              : selection.length
                ? `Open PR (${selection.length})`
                : "Open PR"}
        </button>
        {selection.length > 0 && !canOpen && (
          <p className="w-full text-xs text-muted">
            {selection.every((f) => !!f.pr_url)
              ? "These findings already have a PR. Open its link below to review it."
              : "Select all findings from one pending PR group to resume it, or use its Resume/Retry PR button below. Select only ungrouped findings to create a new PR."}
          </p>
        )}
      </div>}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-4 text-sm"
        >
          <span aria-hidden="true">✓</span>
          {notice.text}
          {notice.url && (
            <a
              href={notice.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline underline-offset-4"
            >
              <PullRequestIcon />
              View PR
            </a>
          )}
        </p>
      )}
      <div className="mt-2 border-y border-line">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Findings and proposed fixes</caption>
          <colgroup>
            {selecting && <col className="w-11" />}
            <col />
            <col className="w-24 sm:w-32" />
          </colgroup>
          <thead className={selecting ? "text-xs text-muted" : "sr-only"}>
            <tr>
              {selecting && <th scope="col" className="w-11 py-2">
                <label className="flex min-h-11 items-center">
                  <input ref={selectAll} type="checkbox" aria-label="Select all findings"
                    checked={allSelected} disabled={busy || !selectable.length}
                    className="size-4 cursor-pointer accent-primary"
                    onChange={() => setSelected(allSelected ? [] : selectable.map((f) => f.id))} />
                </label>
              </th>}
              <th scope="col" className="font-medium">Finding</th>
              <th scope="col" className="text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((f) => {
              const pr = safeUrl(f.pr_url, true);
              const isExpanded = expanded === f.id;
              return (
                <Fragment key={f.id}>
                  <tr className={selected.includes(f.id) && selecting ? "bg-panel" : ""}>
                    {selecting && <td className="w-11 py-3 align-top">
                      <label className="flex min-h-11 items-center">
                        <input type="checkbox" checked={selection.some((row) => row.id === f.id)}
                          disabled={busy} aria-label={`Select ${f.title}`}
                          className="size-4 cursor-pointer accent-primary"
                          onChange={(e) => setSelected((previous) => e.target.checked ? [...previous, f.id] : previous.filter((id) => id !== f.id))} />
                      </label>
                    </td>}
                    <th scope="row" className="py-3 pr-4 font-medium">
                      <button type="button" className="flex min-h-11 w-full items-start gap-3 text-left hover:text-primary"
                        aria-expanded={isExpanded} aria-controls={`evidence-${f.id}`}
                        onClick={() => setExpanded(isExpanded ? null : f.id)}>
                        <ChevronRight size={16} aria-hidden="true" className={`mt-0.5 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        <span className="min-w-0 break-words">
                          {f.title}
                          <span className={`mt-1 block text-xs font-normal capitalize ${["critical", "high"].includes(f.severity || "") ? "text-red-700 dark:text-red-300" : "text-muted"}`}>
                            {f.severity || "Unclassified"}
                          </span>
                        </span>
                      </button>
                    </th>
                    <td className="w-24 py-3 text-right align-top sm:w-32">
                      {pr ? (
                        <a className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-primary hover:underline"
                          href={pr} target="_blank" rel="noreferrer"><PullRequestIcon /> PR #{f.pr_number || "opened"}</a>
                      ) : pendingGroup(f) ? (
                        <button type="button" className="inline-flex min-h-11 items-center whitespace-nowrap text-primary disabled:opacity-50"
                          disabled={isGuest || busy}
                          onClick={() => void action("open-pr", rows.filter((row) => row.pr_group_id === f.pr_group_id), f.pr_group_id!)}>
                          {f.pr_error ? "Retry PR" : "Resume PR"}
                        </button>
                      ) : !isGuest && ready(f) ? (
                        <button type="button" className="min-h-11 whitespace-nowrap text-primary disabled:opacity-50"
                          disabled={busy} onClick={() => void action("open-pr", [f])}>Prepare fix</button>
                      ) : null}
                      {f.pr_error && <p className="mt-2 max-w-xs break-words text-xs text-red-700 dark:text-red-300">{f.pr_error}</p>}
                    </td>
                  </tr>
                  <tr id={`evidence-${f.id}`} hidden={!isExpanded}>
                    <td colSpan={selecting ? 3 : 2} className="max-w-0 pb-5 pl-7">
                      {isExpanded && <>
                        <Evidence finding={f} />
                        <div className="flex items-center gap-5 border-t border-line pt-2">
                          <button type="button" className="min-h-11 text-xs text-muted hover:text-primary" disabled={busy} onClick={() => void copyPrompts([f])}>Copy prompt</button>
                          <button type="button" className="min-h-11 text-xs text-muted hover:text-red-600" disabled={busy || pendingGroup(f)}
                            onClick={() => { setSelected([f.id]); dialog.current?.showModal(); }}>Delete finding</button>
                        </div>
                      </>}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {!rows.length && <tr><td colSpan={selecting ? 3 : 2} className="py-8 text-sm text-muted">No findings remaining.</td></tr>}
          </tbody>
        </table>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="delete-findings-title"
        aria-describedby="delete-findings-description"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-black/50 dark:text-white"
      >
        <h2 id="delete-findings-title" className="text-xl font-semibold">
          Delete {selection.length} finding{selection.length === 1 ? "" : "s"}?
        </h2>
        <p
          id="delete-findings-description"
          className="mt-3 text-sm leading-relaxed text-muted"
        >
          This removes the selected findings and their evidence from this
          report. Existing GitHub PRs will stay open.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            autoFocus
            className={secondary}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full bg-red-700 px-5 text-sm font-medium text-white hover:bg-red-800"
            onClick={() => {
              dialog.current?.close();
              void action("delete", selection);
            }}
          >
            Delete findings
          </button>
        </div>
      </dialog>
    </section>
  );
}

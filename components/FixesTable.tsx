"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
const ready = (f: FindingReport) =>
  !!f.patch_diff?.trim() && !f.pr_url && !f.pr_group_id;

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
        {f.root_cause && (
          <section>
            <h3 className="font-semibold">Root cause</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {f.root_cause}
            </p>
            {f.confidence && (
              <p className="mt-2 text-sm text-muted">
                Confidence: {f.confidence}
              </p>
            )}
          </section>
        )}
        {!f.patch_diff && (
          <p className="text-sm text-muted">
            No proposed code change yet. This finding can be reviewed or
            deleted; a PR requires a fix.
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
}: {
  findings: FindingReport[];
  projectId: number;
  runId: number;
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
  const selectable = rows.filter((f) => !pendingGroup(f));
  const selection = rows.filter(
    (f) => selected.includes(f.id) && !pendingGroup(f),
  );
  const allSelected =
    !!selectable.length && selection.length === selectable.length;
  const readyRows = rows.filter(ready);
  const canOpen = !!selection.length && selection.every(ready);
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
    <section className="mt-10" aria-labelledby="fixes-heading" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2
            id="fixes-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Findings & fixes
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Select fixes to group into one PR. Open a finding to review its
            evidence.
          </p>
        </div>
        <button
          type="button"
          className={`${secondary} shrink-0`}
          disabled={busy || !readyRows.length}
          onClick={() => void action("open-pr", readyRows)}
        >
          <PullRequestIcon />
          Open PR for all{readyRows.length ? ` (${readyRows.length})` : ""}
        </button>
      </div>
      <div
        style={{ top: headerHeight }}
        className="sticky z-10 mt-6 flex min-h-20 flex-wrap items-center gap-3 border-y border-line bg-page py-3"
      >
        <p className="mr-auto text-sm text-muted" aria-live="polite">
          {selection.length
            ? `${selection.length} selected`
            : `${readyRows.length} ready for PR`}
        </p>
        {!!selection.length && (
          <button
            className="min-h-11 px-2 text-sm text-muted hover:text-primary"
            disabled={busy}
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className={secondary}
          disabled={busy || !selection.length}
          onClick={() => dialog.current?.showModal()}
        >
          Delete selected
        </button>
        <button
          type="button"
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || !canOpen}
          onClick={() => void action("open-pr", selection)}
        >
          <BranchIcon />
          {busy
            ? "Working…"
            : selection.length
              ? `Open PR (${selection.length})`
              : "Open PR"}
        </button>
        {selection.length > 0 && !canOpen && (
          <p className="w-full text-xs text-muted">
            A new PR can include only fixes marked Ready for PR. Existing PRs
            and findings awaiting a fix are excluded.
          </p>
        )}
      </div>
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
      <div className="mt-4 overflow-x-auto rounded-lg border border-line">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">
            Run findings, proposed fixes and pull requests. Select rows to
            create a grouped PR or delete them.
          </caption>
          <thead className="bg-panel text-xs text-muted">
            <tr>
              <th scope="col" className="w-12 px-3 py-1 sm:w-14 sm:px-4">
                <label className="flex min-h-11 items-center">
                  <input
                    ref={selectAll}
                    type="checkbox"
                    aria-label="Select all findings"
                    checked={allSelected}
                    disabled={busy || !selectable.length}
                    className="size-4 cursor-pointer accent-primary"
                    onChange={() =>
                      setSelected(
                        allSelected ? [] : selectable.map((f) => f.id),
                      )
                    }
                  />
                </label>
              </th>
              <th scope="col" className="px-1 py-4 font-medium sm:px-3">
                Finding
              </th>
              <th
                scope="col"
                className="w-0 p-0 font-medium sm:w-28 sm:px-3 sm:py-4"
              >
                <span className="hidden sm:inline">Severity</span>
              </th>
              <th
                scope="col"
                className="w-28 px-3 py-4 font-medium sm:w-48 sm:px-4"
              >
                Fix status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((f) => {
              const pr = safeUrl(f.pr_url, true);
              const isExpanded = expanded === f.id;
              return (
                <Fragment key={f.id}>
                  <tr
                    className={
                      selected.includes(f.id)
                        ? "bg-panel"
                        : "bg-page hover:bg-panel/50"
                    }
                  >
                    <td className="px-3 py-3 align-top sm:px-4">
                      <label className="flex min-h-11 items-center">
                        <input
                          type="checkbox"
                          checked={selection.some((row) => row.id === f.id)}
                          disabled={busy || pendingGroup(f)}
                          aria-label={`Select ${f.title}`}
                          className="size-4 cursor-pointer accent-primary"
                          onChange={(e) =>
                            setSelected((previous) =>
                              e.target.checked
                                ? [...previous, f.id]
                                : previous.filter((id) => id !== f.id),
                            )
                          }
                        />
                      </label>
                    </td>
                    <th
                      scope="row"
                      className="px-1 py-3 text-left font-medium sm:px-3"
                    >
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-start gap-2 py-2.5 text-left sm:gap-3 hover:text-primary"
                        aria-expanded={isExpanded}
                        aria-controls={`evidence-${f.id}`}
                        onClick={() => setExpanded(isExpanded ? null : f.id)}
                      >
                        <span
                          className="mt-0.5 shrink-0 text-muted"
                          aria-hidden="true"
                        >
                          {isExpanded ? "−" : "+"}
                        </span>
                        <span className="min-w-0 break-words">
                          {f.title}
                          <span className="mt-1 block text-xs font-normal text-muted">
                            #{f.id}
                            <span className="capitalize sm:hidden">
                              {" "}
                              · {f.severity || "Unclassified"}
                            </span>
                          </span>
                        </span>
                      </button>
                    </th>
                    <td className="p-0 align-top capitalize sm:px-3 sm:py-6">
                      <span
                        className={
                          f.severity === "critical" || f.severity === "high"
                            ? "hidden font-medium text-red-700 dark:text-red-300 sm:inline"
                            : "hidden text-muted sm:inline"
                        }
                      >
                        {f.severity || "Unclassified"}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top sm:px-4">
                      {pr ? (
                        <a
                          className="inline-flex min-h-11 items-center gap-2 font-medium text-primary hover:underline"
                          href={pr}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <PullRequestIcon />
                          PR #{f.pr_number || "opened"}
                        </a>
                      ) : pendingGroup(f) ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-2 font-medium text-primary disabled:opacity-50"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              "open-pr",
                              rows.filter(
                                (row) => row.pr_group_id === f.pr_group_id,
                              ),
                              f.pr_group_id!,
                            )
                          }
                        >
                          <BranchIcon />
                          Resume PR
                        </button>
                      ) : (
                        <span className="inline-flex min-h-11 items-center gap-2 text-muted">
                          {ready(f) && <BranchIcon />}
                          {ready(f) ? "Ready for PR" : "Awaiting fix"}
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr id={`evidence-${f.id}`} hidden={!isExpanded}>
                    <td
                      colSpan={4}
                      className="max-w-0 border-t border-line bg-surface px-6 py-4 sm:px-8"
                    >
                      {isExpanded && <Evidence finding={f} />}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-muted">
                  No findings remaining in this report.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Each selection creates one branch and one PR. Open PR for all combines
        every remaining ready fix into a single PR.
      </p>
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

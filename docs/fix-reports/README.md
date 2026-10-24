# Project logos and grouped fix PRs

Projects show a fixed-size favicon next to their repository name on the project
list, project page and run report. Discovery uses Google's favicon service with
only the app hostname, without credentials, URL paths or query strings. A project
without an App URL uses its latest tested deployment's hostname; unavailable
icons fall back to the repository initial. This avoids server-side fetching of
user-supplied URLs. Logo dimensions stay fixed while loading.

The report table supports individual and select-all checkboxes. Click a finding
title to expand its reproduction, diagnosis, screenshot, code patch and logs.
Severity stays visible below the title on phones. The action bar stays below the
actual dashboard header, including when its mobile navigation wraps.

- Select two ready fixes and choose **Open PR (2)** to create one branch and PR.
  Select two other fixes to create a second, independent PR.
- **Open PR for all** groups all remaining ready fixes into one PR. Findings with
  no patch and fixes already assigned to a PR are excluded.
- **Delete selected** requires confirmation. Deletion removes findings from the
  report and run counts, preserving stored diagnosis/PR history. It never closes
  a GitHub PR.
- A failed request exposes **Resume PR** on its reserved rows. This resumes the
  original group even after reloading, rather than creating another branch.

## Backend and deployment

The new owner-scoped POST endpoint is
`/api/projects/[id]/runs/[runId]/findings`. It checks the request origin, session,
project/run ownership and every selected finding before acting. Tokens remain on
the server. The GitHub App must have access to the selected repository with
**Contents: write** and **Pull requests: write** permissions; after changing App
permissions, accept them on the installation and sign in again if necessary.

`ensureSchema()` adds `fix_pr_groups`, finding group/deletion columns and a
short-lived request lease using the existing first-use schema mechanism. No new
environment variables are required. Group reservations lock candidate findings
and require the entire selection to be available, so an overlapping selection
cannot take only some rows. The lease serializes retries for the same group and
expires after a crashed request. Branch names include a durable UUID. GitHub
branch/PR lookups recover from a request whose remote write succeeded before the
response or database save failed.

GitHub's Git Data API creates a tree and commit on a new `preflight/run-…` branch
from the current default branch, followed by a PR. It never updates the default
branch. Text patches are checked against repository contents before publishing.
Independent edits in the same file are combined against the same base; conflicting
or stale edits fail with a clear message. Unsupported binary, rename, mode,
non-UTF-8 and CRLF changes require manual review. Invalid patches release their
reservation so they remain manageable; transient API failures preserve the group
for retry. Existing executable file modes are retained.

**Scope:** this adds report management and PR creation from stored
`diagnoses.patch_diff` values. The current swarm still collects findings only;
it does not automatically diagnose findings or generate code patches. Those
findings correctly display **Awaiting fix** and cannot open an empty PR. No
illustrative landing-page fixes are substituted into real reports.

## Verification

- Production build and 44 unit tests pass. Regression coverage includes four
  fixes in two distinct PRs, retry recovery, same-file patch merging/conflicts,
  invalid patch rejection, ownership/origin gates, deletion and reservation rules.
- Executed the actual schema/helpers against local PGlite (PostgreSQL WASM),
  including repeated migrations, both groups, overlapping selection rejection
  without partial claims, lease exclusion, unauthorized access, report joins,
  soft deletion and updated counts. PGlite was installed outside the project for
  verification; it is not an application dependency. This checks SQL behavior,
  not separate-process Postgres concurrency or the live Neon database.
- Browser checks at 1440, 768 and 390 pixels in both themes: grouping two pairs,
  select-all/indeterminate state, evidence expansion, delete/cancel and no page or
  table overflow. Additional desktop/mobile checks cover Open PR for all,
  transient failure/resume with the same group key, Escape dismissal and favicon
  loading/fallback. Axe reported no WCAG A/AA violations; incomplete checks are
  retained in the evidence rather than reported as passes.
- Browser evidence uses isolated synthetic sessions/data and intercepted action
  responses. GitHub integration tests mock the remote API. No live customer data,
  paid swarm runs or real GitHub branches/PRs were changed by verification.

See [desktop](desktop-light.png), [mobile](mobile-dark.png),
[browser checks](browser-verification.jsonl),
[additional browser checks](additional-browser-verification.jsonl) and
[database checks](database-verification.jsonl).

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
- Selecting every finding in a pending group changes the primary action to
  **Retry PR** or **Resume PR**. When no ungrouped findings remain and exactly one
  pending group exists, the top-level action resumes it too. Mixed selections and
  partial groups cannot create a new group. A fresh request UUID for the exact
  reserved selection resolves to the original group on the server, preserving its
  branch, generated patches and any already-created PR.

## Backend and deployment

The new owner-scoped POST endpoint is
`/api/projects/[id]/runs/[runId]/findings`. It checks the request origin, session,
project/run ownership and every selected finding before acting. Tokens remain on
the server. The GitHub App must have access to the selected repository with
**Contents: write** and **Pull requests: write** permissions; after changing App
permissions, accept them on the installation and sign in again if necessary.

For the hosted PreFlight app, its owner configures these permissions at
[GitHub App settings](https://github.com/settings/apps/preflight-qa/permissions).
Set **Repository permissions → Contents → Read and write**, keeping **Pull
requests → Read and write**, and save. Then open
[installed GitHub Apps](https://github.com/settings/installations), configure
**Preflight QA**, approve the new permissions and ensure the target repository is
included. Organization installations require their organization's approval.
Retry the existing PR group; signing in alone cannot increase App permissions.
GitHub rate-limit errors are reported separately from permission failures.

`node tests/fix-group-retry.integration.cjs` exercises the production table, API
and group helpers with Chromium and PostgreSQL WASM: failed-group retry, fresh
request UUIDs, authorization, mixed/partial selection rejection, original branch
reuse, refresh after PR creation and mobile retry controls. GitHub writes use a
fixture; no live PR is created by the test.

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

**Fix preparation:** findings without a stored patch can now be selected for a PR.
The action queues `prepare-fix-pr` in Trigger.dev, which reads bounded source
files from the saved repository, generates exact validated edits and opens a
**draft** PR. Existing patches retain their current direct PR path; generated
patches remain draft on retries. Each selection stays one group/branch/PR.
Generation failures stay visible beside the finding with a retry action. No empty
PR or illustrative landing-page patch is substituted. Generated changes are not
executed or tested automatically and need review before merging.

Copy Prompt works for selected findings or all visible findings. Each bug gets a
heading and one concise paragraph, with blank lines/separators between bugs.
New findings save an evidence-based issue/fix paragraph; older findings use their
stored diagnosis or a bounded reproduction-based repair prompt. Expanded evidence
shows the same paragraph so it remains manually copyable if clipboard access fails.

See [fix preparation validation](../finding-fix-preparation/README.md).

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

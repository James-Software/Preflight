# Finding prompts, prepared fix PRs and database inspection repair

Unpatched findings are selectable for Open PR and Open PR for all. A selected
group reserves its findings, queues preparation on Trigger.dev and updates the
report while work is in progress. Copy Prompt of selected and Copy Prompt for all
work independently of patch availability. Each bug is a separate section with
one paragraph. New browser findings include a short evidence-based proposed fix;
source-aware preparation updates that paragraph after inspecting code. Older
findings have bounded evidence-based repair prompts, not invented source claims.

## Code preparation

`prepare-fix-pr` verifies the project/run/group, then reads the run's saved GitHub
repository. It enumerates a bounded default-branch tree, asks the existing driver
model to choose up to eight source files, and reads those files at an immutable
SHA (120 KB total). Secret/config, workflow, binary, symlink and vendor paths are
excluded. Up to ten findings can be prepared per group. This feature uses the
existing OPENROUTER_API_KEY and driver model in the worker; the web app needs no
new model key.

The model returns independent whole-line search/replace edits and a paragraph
for every selected bug. Every path must be among the fetched files. Search blocks
must match exactly once; empty/no-op, ambiguous, overlapping and oversized edits
are rejected. Minimal unified hunks validate against the original source before
saving. Existing group merging rejects conflicting changes. Source is rechecked
against the current PR base before creating a branch, so a moving head cannot
silently overwrite newer code. Unsupported fixes remain reviewable/copyable.

Generated changes open a draft PR. No repository scripts execute during this
process, no tests are claimed to have run, and nothing is merged automatically.
Stored generated patches stay draft when a failed PR attempt is resumed. Pending
groups cannot be regrouped/deleted, but their prompts can still be selected/copied.
The report polls pending groups and shows completion or an actionable failure.

## Authorization and retries

The authenticated web request verifies ownership and GitHub access before queuing.
A 15-minute AES-GCM GitHub grant is stored encrypted, bound to group and owner,
using the already shared PROFILE_ENCRYPTION_KEY. No credentials go into Trigger
payloads or model prompts. Workers do not need the web app's AUTH_SECRET. Grants
are cleared when a group completes and after work. Expired/invalid grants require
a renewed request; no automatic fallback uses another account.

Durable group reservations and branch reuse preserve selection boundaries.
Separate token-owned worker leases prevent duplicate queue deliveries from
concurrently generating/opening the same PR; a different worker cannot release
the lease. The task does not retry automatically. Completed-group retries return
the existing PR. Failures keep a message and can be explicitly resumed.

## Database report fix

The inspector aggregated PostgreSQL `name` columns into `name[]`; node-postgres
returns that OID as an unparsed string. It now aggregates `attname::text`, giving
`text[]` and a real JavaScript array. Schema preflight happens once per run;
unavailable inspection is recorded once. Read permission and timeout failures
get sanitized, specific guidance. The report groups historical identical setup
errors and excludes them from assertion totals. Existing setup errors are not
application bugs and cannot prove persistence. Start a new run after the updated
worker deploys to obtain fresh database evidence.

## Validation

- Full automated suite: 145 passing tests. New coverage includes actual pg wire
  parsers, legacy error collapse, compact sections, exact patch generation/merge,
  immutable source selection, queued unpatched groups, draft preparation, failure
  visibility, and encrypted group/owner-bound GitHub grants.
- `storage.jsonl`: actual schema/helpers on PGlite/PostgreSQL, using synthetic
  GitHub/model responses, took three unpatched bugs through two independent PR
  groups. It verified exact selected file changes, paragraphs/patches/report links,
  draft flags, cleared grants, duplicate delivery safety, conditional worker leases,
  and the real PostgreSQL text-array result type (1009).
- `ui.jsonl`: Chromium at 1440px/390px in both themes exercised real clipboard
  copying for all/subsets, paragraph display, enabled PR actions without patches,
  selected/all queue requests, setup deduplication, no overflow/page errors, and
  no Axe accessibility violations. Screenshots contain synthetic test data.
- Production build/typecheck pass. No live GitHub PR, paid model call, browser
  swarm, or customer database was used during validation. Deploy the web app and
  Trigger tasks (including prepare-fix-pr) before testing the new PR workflow.

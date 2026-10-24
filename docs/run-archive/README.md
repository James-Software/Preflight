# Run archiving

Finished (`done`/`completed`), failed and cancelled runs can be archived from the
project list or report. The project page separates **Runs** and **Archived**, with
counts and restore controls. Archived report URLs and finding/PR actions remain
available. Archiving never deletes evidence or changes execution status; active
runs must be stopped before they can be archived.

`ensureSchema()` adds nullable `runs.archived_at`. The owner-scoped, origin-checked
PATCH route `/api/projects/[id]/runs/[runId]/archive` accepts
`{ "archived": true }` or `{ "archived": false }`. The database helper checks
the run/project/owner and terminal status in the update itself. Repeated archive
requests preserve the original archive timestamp. Both list and report paths
are revalidated. List polling discards responses started before a successful
archive/restore so an older response cannot undo the local result.

Verification: production build and 47 unit tests passed. Local PostgreSQL WASM
checks exercised migration, active-run protection, ownership/project boundaries,
idempotent archiving, report access and restore. Synthetic browser checks cover
archive/restore, both view counts, active controls, failed-request recovery and
report access at desktop/mobile widths in both themes. No live customer records
were changed. Evidence: [browser](browser-verification.jsonl),
[database](database-verification.jsonl), [desktop](desktop-light.png),
[mobile](mobile-dark.png).

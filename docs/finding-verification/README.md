# Evidence-gated findings and database workflows

A failed goal or a driver's `report_bug` is a candidate, not a finding. The runner
first checks for provider/OAuth blockers, then independently assesses the facts
as an application defect, blocked test, expected behavior or insufficient evidence.
Only a high-confidence application-defect candidate proceeds to reproduction.

Reproduction uses a fresh browser context and reloads the saved authentication
profile. Only bounded navigation and explicitly safe inspection actions can be
replayed. Submit/create/save/delete/payment/connect actions, Enter submissions,
arbitrary form fills, failed browser commands and external destinations are not
repeated. These candidates remain **Not confirmed**, preserving their observations
in a collapsed coverage section without a human review queue or guessing that
the app is defective. Reproduction requires the same
normalized page, failed requests and page errors, followed by an independent
assessment of both attempts. This deliberately favors review for dynamic pages
and intermittent failures. Model confidence is a screening threshold, not proof
or a guarantee of zero false positives.

Confirmed findings contain observed facts and a fresh-context reproduction;
unverified root causes must remain labeled hypotheses. The driver and step judge
no longer record two findings independently. A unique per-run evidence hash also
prevents duplicate inserts by concurrent agents. Blocked/unconfirmed outcomes
are stored separately in `run_test_results`, shown under Test coverage, and do
not enter fix/PR actions. Verified findings are immediately available for prompts
and PRs; the user reviews proposed code in their normal GitHub workflow.

The normal step judge still determines whether a goal was met. A model/driver
failure cannot establish a defect. Missing or refused candidate assessments
leave an unconfirmed observation. The legacy OpenRouter Decisions adapter lacks a
consistent confidence contract and therefore cannot promote candidates to
confirmed findings; its observations remain available in coverage details.

## Partial completion and report updates

One interrupted agent no longer discards the other agents' completed work.
The parent records missing checks without overwriting completed observations,
continues independent available workflows, and finishes as `partial` when some
checks could not complete. Browser action limits leave an inconclusive check and
any remaining checks uncompleted instead of crashing the assignment. True setup
or worker failures before any results still finish as `failed`. Terminal runs
store a bounded, sanitized interruption reason and finish time; partial runs can
be archived like other finished runs.

For older failed runs that already contain results, report and list presentation
show **Partially completed**. The underlying stored history is preserved. Existing
`needs_review` coverage entries display as **Not confirmed**, not a required
approval step. No unverified observation is promoted to an application bug.

The report retains visibility-aware automatic updates and has no manual Refresh
report button. **Copy run details** copies the displayed run's status, stored
status, saved reason, finding IDs/titles and check summaries. It explicitly omits
session snapshots, credentials, cookies, headers, patches and raw evidence. This
is an optional clipboard action, not an MCP connection or an external message.
Database cleanup still requires the user's explicit Accept/Deny decision.

## Why the database warning appeared

A database connection permits inspection; it does not give a test identity a
GitHub connection or make every workflow accessible. PreFlight's generated test
identity had no GitHub credentials, while New project loaded the GitHub picker.
The old form also had no editable project-name field for the unique marker.
Thus no marked create submission occurred and persistence could not be tested.

New project now has a project-name field. Generated PreFlight identities use an
explicit isolated-workspace path through the real New project server action,
which inserts a real `projects` row owned by `test:<capture ID>`. Its repository
label comes only from the authorized PreFlight provisioning context. Client
repository values are ignored, owner IDs cannot be selected, and no GitHub
credentials or existing owner projects are delegated. Active-session/expiry checks
and a per-identity limit apply. Other auth providers and GitHub-dependent features
still require their own credentials; this flow does not claim those integrations
were tested.

The verifier marks a name/title or email field only after a successful fill with
the exact unique marker or its generated test email. Empty tables are supported
without seed rows. It observes the database before and after an actual successful
browser submit command. A matching committed row confirms persistence. No change
is unverified, not automatically a bug. If no supported submission occurs, the
report describes a blocked workflow rather than implying the database connection
failed. Cleanup only proposes a bounded deletion of newly observed marked rows;
Accept/Deny remains required.

The parent reuses successful automatic verification performed by regular agents;
the dedicated create workflow runs only when none has confirmed persistence.
Identical automatic result rows in existing reports are grouped with an observation
count. Totals still count every recorded assertion, and differing outcomes or
separate configured checks remain visible. Grouping does not remove evidence or
cleanup proposals.

GitHub repository endpoints distinguish an authenticated account with no provider
connection (`409 GITHUB_NOT_CONNECTED`, explicit Connect GitHub) from an existing
GitHub connection requiring renewal (`401`, existing automatic handoff). Neither
response alone demonstrates loss of the application session.

## Validation and deployment

196 unit tests and the production build passed. Regressions cover the reported OAuth/401 false positives, duplicate driver
and judge reports, unsafe replay prevention, low-confidence claims, transient
failures, and a real reproducible failure that still becomes a finding. The
[PostgreSQL integration](postgres-integration.jsonl) uses actual PostgreSQL WASM,
Auth.js cookies/session handlers and the actual New project server action. It
checks isolated project ownership, ignored client repo input, marked-row
persistence, pending cleanup proposals, concurrent deduplication and scoped
reports. Reproduce it with Node 24 and the optional test dependency:

```sh
npm install --no-save --package-lock=false @electric-sql/pglite
node tests/test-user-issuer.integration.cjs
```

[Chromium UI checks](ui.jsonl) use the actual form/report components with an
isolated server-action transport fixture at 1440/390 px in both themes. They
check no GitHub picker/requests for the test form, one submit, no browser errors
or horizontal overflow, and expandable blocked/review observations. They do not
exercise live GitHub, customer databases, paid browsers or model services.

Deploy both web and Trigger workers; migrations are additive. Start a new run
with the generated PreFlight profile and its matching database. Old reports retain
their original stored observations; presentation uses the current status labels.

[Partial-run PostgreSQL checks](partial-run-integration.jsonl) exercise preserved
findings, completed-step protection, saved interruption reasons, archiving and
legacy status presentation with actual database statements. [Report UI checks](report-ui.jsonl)
exercise real components at 1440/390 px in both themes, automatic router refresh,
credential-free clipboard details, collapsed unconfirmed observations and direct
PR selection without a review queue. Transport and browser/model services remain
local fixtures; no paid swarm or production run was launched for validation.

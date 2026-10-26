# Evidence-gated findings and database workflows

A failed goal or a driver's `report_bug` is a candidate, not a finding. The runner
first checks for provider/OAuth blockers, then independently assesses the facts
as an application defect, blocked test, expected behavior or insufficient evidence.
Only a high-confidence application-defect candidate proceeds to reproduction.

Reproduction uses a fresh browser context and reloads the saved authentication
profile. Only bounded navigation and explicitly safe inspection actions can be
replayed. Submit/create/save/delete/payment/connect actions, Enter submissions,
arbitrary form fills, failed browser commands and external destinations are not
repeated. These candidates remain **Needs review**, preserving their observations
without guessing that the app is defective. Reproduction requires the same
normalized page, failed requests and page errors, followed by an independent
assessment of both attempts. This deliberately favors review for dynamic pages
and intermittent failures. Model confidence is a screening threshold, not proof
or a guarantee of zero false positives.

Confirmed findings contain observed facts and a fresh-context reproduction;
unverified root causes must remain labeled hypotheses. The driver and step judge
no longer record two findings independently. A unique per-run evidence hash also
prevents duplicate inserts by concurrent agents. Blocked/unconfirmed outcomes
are stored separately in `run_test_results`, shown under Test coverage, and do
not enter fix/PR actions. Historical reports are not rewritten.

The normal step judge still determines whether a goal was met. A model/driver
failure cannot establish a defect. Missing or refused candidate assessments
leave the candidate for review. The legacy OpenRouter Decisions adapter lacks a
consistent confidence contract and therefore cannot promote candidates to
confirmed findings; its observations remain available for review.

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

The verifier marks a name/title only after a successful fill with the exact
unique marker. It observes the database before and after an actual successful
browser submit command. A matching committed row confirms persistence. No change
is unverified, not automatically a bug. If no supported submission occurs, the
report describes a blocked workflow rather than implying the database connection
failed. Cleanup only proposes a bounded deletion of newly observed marked rows;
Accept/Deny remains required.

GitHub repository endpoints distinguish an authenticated account with no provider
connection (`409 GITHUB_NOT_CONNECTED`, explicit Connect GitHub) from an existing
GitHub connection requiring renewal (`401`, existing automatic handoff). Neither
response alone demonstrates loss of the application session.

## Validation and deployment

182 unit tests and the production build passed. Regressions cover the reported OAuth/401 false positives, duplicate driver
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
the original observations/classification.

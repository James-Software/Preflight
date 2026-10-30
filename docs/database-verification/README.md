# PostgreSQL persistence checks

Database verification automatically inspects uniquely marked test records after
browser actions. No SQL setup is needed for supported create workflows. Optional
advanced checks pair a specific workflow/button with a read-only SQL assertion.
A toast alone never proves persistence, and database evidence does not prove
unrelated effects such as email delivery.

Automatic verification currently supports ordinary `public` tables with a single
numeric or UUID primary key and text columns named `name`, `title`, `slug`,
`label`, `display_name`, `project_name`, `description`, `email` or `email_address`.
Discovery reads PostgreSQL schema catalogs, so empty tables need no seed rows.
Up to 24 tables and six
label columns per table are inspected, with bounded queries/results. The agent
receives only these schema labels and a random per-step test marker, not database
credentials, SQL, customer rows or record fingerprints. It fills a suitable app
field with the marker, or a unique `preflight-…@example.test` email in an email-only
waitlist form; before/after reads correlate changes to that record. Waitlist,
join and subscribe buttons, plus marked Enter submissions, are observed too.
Generic account registration and destructive/payment/security workflows are blocked.
Unsupported schemas, missing workflows and absent observed changes are explicitly
Unverified. They are not automatically classified as app bugs. Use advanced
checks for exact business assertions, other schemas and existing customer data.

See [automatic verification and cleanup](../automatic-database/README.md) for
approval behavior and execution boundaries.

## Setup

1. Open a project → **Database verification** → **Connect database**.
2. Choose Supabase/Neon and select a database from your account, or use **Paste a
   connection URL instead**. Supabase needs its existing database password; Neon
   can retrieve the chosen role's URI. See [account autofill setup](../database-provider-autofill/README.md).
3. Connecting tests a read-only `SELECT 1` and saves the encrypted URI. SQL and
   browser workflows are optional. **Advanced checks** pairs an exact button
   label/workflow with a scalar SELECT and expectation. Test and save validates
   these queries; editing reuses the URI without exposing its password.
4. In Run swarm, **Verify database changes** appears/defaults on when the resolved
   deployment origin has a connected database, including one without advanced
   checks. The toggle can be turned off for a browser-only run. Feature/PR origins
   never borrow another origin's DB. Results describe observed evidence, not a
   guarantee that every button was verified.
5. After the run, review **Cleanup** in its report. Accept or deny each proposed
   one-record deletion. Nothing is automatically removed.

Example create-task check:

- Button label: `Create task`
- Workflow: `Open /tasks, enter {{marker}} as the task title, then click Create task.`
- Query:

```sql
SELECT count(*) AS value
FROM public.tasks
WHERE title = $1
```

- Expectation: **Equals an expected value**, JSON value `1`.

`{{marker}}` is replaced by a per-run/check marker in the workflow. The same value
is bound to `$1` in the query, never interpolated into SQL. This correlates the
observed row with this test rather than another agent's unrelated write. Return
one row and one scalar (boolean, number, null or text up to 512 characters).
Expectations also support **Changes**, **Increases** and **Decreases**. Use
`"{{marker}}"` as an expected JSON string to verify a specific saved field value.

Queries should target the test account/data represented by the selected profile.
For Supabase RLS, the reader role/view must be allowed to see those test rows;
an invisible row can otherwise look like a missing write. Start with a dedicated
read-only role/view scoped to staging/test data. Static-row assertions can be
confused by independent concurrent runs; marker-based checks are preferable.

## Execution and evidence

- Run creation atomically stores the encrypted database snapshot, check count and
  pending report rows. Changing a connection's checks does not change an already
  created run's snapshot.
- Workers preflight the connection, SELECT shapes and observable baseline before
  allocating browser agents. Automatic observation surrounds marked form actions;
  an additional agent attempts a safe create workflow. Advanced configured
  workflows then run sequentially to reduce shared-account interference.
- Immediately before the configured exact button click, the worker rechecks the
  connection grant/cancellation and reads the baseline. It activates that button
  through the real browser and polls the database for approximately five seconds.
  Each statement has its own three-second timeout, so a final query/network
  operation can extend the wall-clock window.
- A deterministic predicate decides the database result. The model cannot turn
  an unchanged database into a pass. A missing expected change produces a finding
  with browser evidence, even if the page displays “Saved”.
- The report shows **Confirmed**, **Not confirmed**, or **Unverified** separately
  from Pending/Checking. An already-matching baseline, query/connection problem,
  or workflow that never activates the configured button is unverified/setup
  failure; it is not converted into an application database bug.
- No SQL, connection credential or raw query result is added to model input, task
  payloads or report summaries. The driver receives only workflow instructions,
  the test marker and button label. Screenshots still show the app's UI normally.
- Cancellation is checked before fan-out/each database workflow and before its
  button action. Late task updates cannot overwrite the cancelled run status.
  Cancellation cannot undo an app action that is already in flight.

## Connection/storage boundaries

The existing **PROFILE_ENCRYPTION_KEY** (base64 32 bytes) must match in Vercel and
Trigger.dev. It encrypts the connection URI and checks with AES-256-GCM, a random
IV and database-specific owner/project/origin authenticated context. Public runs
remain unaffected. Schema updates follow the existing `ensureSchema()` pattern.
`pg` is an application dependency and an external package in Trigger builds.

Connections require publicly reachable DNS hosts, verified TLS certificates and
valid credentials. Private/loopback/reserved addresses and disabling TLS are not
supported. DNS is validated and the TCP destination pinned while TLS verifies the
original hostname. Supported URL options are `sslmode` and `channel_binding`.
Firewall rules must allow both the web server and worker's network access.

The verifier issues only bounded SELECTs inside `BEGIN READ ONLY`, with statement
and lock timeouts, one prepared marker parameter, at most two serialized rows and
at most 4096 bytes per row before validating the scalar. Common write/privileged
statements are rejected as configuration errors. Read-only database credentials
remain the access boundary; the app itself performs writes through its UI.

Disconnect revokes future snapshot loads, including queued checks. Reconnecting
creates a fresh connection grant and does not reactivate old snapshots. Reports
remain available. Editing an active grant intentionally retains already-issued
snapshots until that grant is disconnected. Private-network/tunnel access,
automatic schema/SQL inference and other database engines are not implemented.

## Verification

- Production build/typecheck and **97 unit tests** pass. New coverage includes
  assertion semantics, stale baselines, SQL/parameter restrictions, public address
  validation, verified/pinned TLS configuration, read-only transactions, bounded
  scalar results, sanitized errors, owner/origin gates, secret-free task payloads,
  fail-before-allocation and sequential database workflows.
- [Real Chromium + PostgreSQL WASM action checks](action-verification.jsonl): a
  browser Save with an actual persisted row passes; a fake Saved toast with no
  insert records a finding; a pre-existing expected value remains unverified
  without a duplicate click/write. A write-capable SQL function is rejected by
  the actual read-only transaction, even under the local engine's privileged role.
- [Storage checks](storage-verification.jsonl) exercise actual schema/helpers,
  encrypted configuration, atomic run/check creation, metadata-only outputs,
  editing without password readback, immutable snapshots, owner/project scoping,
  disconnect/reconnect grants, terminal-result/cancellation preservation and public
  runs. PostgreSQL WASM dependencies live outside the application repository.
- [UI checks](ui-verification.jsonl): desktop/phone × light/dark connection setup,
  secret clearing, editing, launch checkbox/payload and three report outcomes, with
  no overflow/page errors. [Accessibility checks](accessibility-verification.jsonl)
  found no WCAG A/AA violations; incomplete checks are retained.
- The action checks use the real browser/worker logic and real SQL engine, with
  the `pg` transport adapted to local PostgreSQL WASM. They do not exercise a live
  Neon/Supabase TLS connection. Dashboard controls use synthetic sessions/data and
  intercepted configuration/run APIs. No live customer credentials or paid swarm
  was used. [GitHub recovery regression](github-recovery-verification.jsonl) also
  passes with the new minimal loading screen.

Views: [settings](settings-desktop.png), [launch](launch-mobile.png),
[report](results-mobile.png), [GitHub loading](github-loading.png).

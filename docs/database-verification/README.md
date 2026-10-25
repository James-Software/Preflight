# PostgreSQL persistence checks

Database verification pairs an owner-configured browser workflow/button with a
read-only SQL assertion. It verifies stored state after that action; it does not
infer every button's database semantics automatically, accept a toast as proof,
or prove unrelated effects such as email delivery.

## Setup

1. Open a project → **Database verification** → **Connect database**.
2. Enter the app origin and a read-only PostgreSQL URL for that environment.
   Neon and Supabase hosted PostgreSQL/session or transaction pooler URLs are
   supported. This does not replace PreFlight's own `DATABASE_URL`.
3. Add a check name, exact accessible button label, browser workflow, scalar
   SELECT query and expectation. **Test and save** checks the connection and SQL
   result shape. Passwords remain hidden after saving. **Edit checks** can reuse
   the stored connection without returning its password to the browser.
4. Open Run swarm, choose the branch/PR and authentication profile, then leave
   **Verify database changes** enabled. It appears/defaults on only when that
   resolved deployment origin has a configured database. It can be switched off
   for a browser-only run. Feature/PR origins never borrow another origin's DB.

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
  allocating browser agents. Normal browser checks finish first; database
  workflows run sequentially to reduce shared-account interference.
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

- Production build/typecheck and **82 unit tests** pass. New coverage includes
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

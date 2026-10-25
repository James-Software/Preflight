# Automatic database verification and cleanup

A connected PostgreSQL database now enables automatic verification by default in
Run swarm. Advanced checks remain optional. The worker reads schema labels and
uses a random 96-bit per-step marker in a safe test workflow through the real app.
Bound read-only queries check the marked rows before and after submitting. The
report distinguishes confirmed changes from unverified workflows. This verifies
persistence of marked records; it does not infer every business rule or validate
arbitrary existing customer data. See [supported schemas](../database-verification/README.md).

## Cleanup approval

The project sidebar has a Cleanup tab with a run selector. Each run report links
directly to its cleanup view. Each proposal shows the table,
record ID, exact parameterized SQL, parameter values, one-row limit and status.
Accept cleanup executes that saved proposal; Deny keeps the record. Controls are
unavailable until the run ends, including failed or cancelled runs. Nothing is
deleted on run completion, page load, refresh or denial. Cancelled runs can still
have in-flight app actions; review unverified workflows manually.

Only rows newly observed with this step's random marker qualify. Cleanup is
limited to ordinary public tables with a single numeric/UUID primary key. Tables
with cascading foreign keys, user-defined triggers, rewrite rules, inheritance,
partitioning or row security are excluded. Restrict/no-action foreign keys may
still prevent deletion, in which case the transaction rolls back. Unsupported
records require manual review; no broad deletion is proposed as a fallback.
Advanced-check workflows do not currently generate cleanup proposals.

For each accepted action, the web server:

1. Checks the authenticated project/run owner, same request Origin and final run
   status. The browser submits only a proposal UUID and Accept/Deny decision;
   supplied SQL is never executed.
2. Atomically claims the pending proposal. Double clicks/concurrent approvals
   cannot execute twice. Denial never opens the customer database.
3. Rechecks the saved connection grant/origin and decrypts the run snapshot.
4. Begins a transaction, sets query/lock timeouts, locks the target table and
   rechecks its schema/side-effect eligibility.
5. Runs generated DELETE SQL bound to the primary key, unique marker and the
   whole-row fingerprint captured after the browser action. Exactly one row must
   be affected; otherwise everything rolls back. Changed records are not deleted.
6. Commits and records the outcome. An uncertain network/commit outcome is never
   automatically retried. Error/executing actions require manual inspection.

Verification always uses read-only transactions. Accepted cleanup needs DELETE
permission on the saved database role; a read-only role can verify but cannot
clean up. Credentials stay encrypted and never reach the browser/model. TLS and
DNS restrictions are shared with the existing PostgreSQL adapter. Keep
PROFILE_ENCRYPTION_KEY stable and identical in web/worker deployments.

## Validation

- `npm test`: automatic marker observation, real browser-action bracketing,
  cleanup transaction sequencing/row limits, repeated decisions, denial without
  database access, request Origin/auth/ownership/run-status gates, and existing
  manual checks.
- `storage.jsonl`: real PostgreSQL via PGlite checked schema discovery, marked
  record reads, bound one-row deletion, rollback, changed-row rejection,
  cascades/triggers/RLS rejection, and preservation of unrelated customer records.
  A second integration used the actual app schema/encrypted snapshots to verify
  a zero-check run, persisted proposals/results, owner scoping, approval execution
  and duplicate-approval rejection.
- `ui.jsonl`: Chromium at 1440px/390px in both themes checked explicit approval,
  SQL/parameters, active-run disabling, accept/deny states, press animation,
  overflow and Axe accessibility. Screenshots show synthetic test data.
- Production build and TypeScript checks. No customer database was modified and
  no paid swarm/model request was made during validation. Deploy both web and
  Trigger workers before testing a live run.

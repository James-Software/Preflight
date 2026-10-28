# Automatic investigation of inconclusive checks

New swarm runs queue every unresolved browser plan step after the main browser and database checks finish. Each check has its own isolated investigation task; at most three are dispatched at a time. Successful checks and confirmed findings are kept. Blocked checks receive source review but are not replayed. Dedicated database submissions are excluded from browser investigation. Per-check claims, unique slots derived from test-result IDs, task idempotency and disabled automatic task retries prevent duplicate work. Each investigation is bounded to 20 minutes and the coordinator to one hour; infrastructure failures or timeouts can still leave checks unresolved. Existing completed runs are not automatically reprocessed.

The `investigate-checks` task selects at most six relevant source files (120 KB total, 40 KB per file) at the run's immutable `target_sha`. It receives browser observations, the test goal and recorded database assertion summaries. It never executes repository code, arbitrary SQL or shell commands. Secret files, dependencies, symlinks and binary files are excluded. Missing pinned source never falls back to today's main branch.

The web-only `/api/internal/investigation-source` broker uses the owner's current saved GitHub connection. It requires an HMAC signed with the existing shared `PROFILE_ENCRYPTION_KEY`, a timestamp within 60 seconds and a live per-check worker grant. Cancelled runs, expired/completed grants, revoked GitHub access, foreign owners and relinked repositories cannot read source. GitHub tokens are not returned to the worker or report. No new environment variables are required; both web and Trigger deployments must be updated.

Code conclusions are hypotheses, expected behavior, missing prerequisites or unresolved. Every non-unresolved conclusion must cite exact complete lines in files actually read. Quotes are checked before accepting citations. A selected branch SHA is not assumed to be the deployed version: the broker checks recent GitHub deployment records, and the report explicitly marks deployment provenance it cannot verify. Code conclusions never create findings or pass browser checks by themselves.

When the original actions were safe to repeat, one fresh browser follows up on that specific step, starting from its original page. Its driver gets at most ten decisions and stops requesting decisions after two minutes. Browser setup, an in-flight decision and independent reproduction can take additional time. The follow-up refuses submissions, form fills other than search/filter, external navigation and destructive actions. Network interception blocks HTTP writes and websocket connections; service workers are disabled. An intercepted application request makes the result inconclusive, not a bug. Completed database writes are not replayed. Workflows needing another write remain unconfirmed.

Findings still require independent assessment, a fresh-context reproduction with matching browser evidence and a second independent assessment. The code agent's hypothesis is not sent to these judges as browser evidence. A later inconclusive result cannot overwrite an already passed or confirmed check. Original observations remain in the investigation record, while the report shows the follow-up result and source citations without adding an approval queue. Cleanup SQL still requires the owner's explicit Accept or Deny decision; partially completed runs now support that existing flow.

## Verification

```sh
npm test
npm run build
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/check-investigation.integration.cjs
```

The optional integration needs Chromium at `/usr/bin/chromium`. It runs real worker logic, signed source routes, PostgreSQL via PGlite and local Chromium. GitHub, model and Browserbase transport boundaries use controlled fixtures. It verifies safe continuation, an independently reproduced failure, blocked real POST requests, preservation of successful checks and original evidence, concurrent delivery within budget, owner/run/grant restrictions, source provenance and partial-run Cleanup availability. It does not use production accounts, databases, paid browsers or model calls.

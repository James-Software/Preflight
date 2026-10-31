# Run review over MCP

The run header's **Copy agent prompt** button creates a 24-hour, revocable grant restricted to that run. It copies a prompt with the real Streamable HTTP endpoint, a bearer credential and an evidence-review workflow. The copy icon transitions to a checkmark after a successful clipboard write. Clipboard-restricted browsers get a selectable text fallback; a failed grant never displays success.

Paste the prompt into Codex. A client with a native PreFlight connection can use its MCP tools. A currently running conversation that cannot hot-load a server can issue the same MCP JSON-RPC calls over HTTP. The prompt explains initialization and headers; it does not substitute static diagnostics for a connection. Browser cookies and the user's GitHub/database credentials are not needed by the agent.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_run` | Page through every finding, test result and database observation, plus saved reviews. Follow `nextOffset` until null. |
| `get_evidence` | Fetch a run-specific evidence key and its current hash. |
| `get_source` | List eligible repository paths or read up to six files (120 KB) at the selected commit. Source/deployment matches remain explicitly unverified. |
| `inspect_database_check` | Owner-only, read-only evaluation of a saved configured query with its original marker. No caller-supplied SQL. A current scalar cannot prove an earlier delta or UI causation. |
| `inspect_cleanup` | Owner-only live check of a proposed record's primary key, marker, whole-row fingerprint, schema dependencies and run/proposal status. |
| `inspect_github_access` | Owner-only, read-only comparison of registered App permissions, approved installation permissions and this repository's inclusion. Reports endpoint status/request IDs without credentials or test writes. Unavailable for guest/test identities. |
| `record_review` | Save a bounded assessment tied to current evidence and actual source lines read through this connection. Does not alter original findings/check statuses or approve deletion. |

Assessments appear in the run report, and cleanup assessments also appear beside the existing Accept/Deny controls. A “safe to cleanup” assessment is accepted only after a fresh deterministic inspection passes and the supplied evidence hash still matches. Changes to a row or proposal invalidate that hash. Existing Cleanup execution still rechecks safeguards under its original table lock after explicit owner approval.

No MCP tool executes cleanup, accepts arbitrary SQL, opens PRs or edits source. Project members can review run evidence and authorized source, but cannot inspect owner-managed cleanup or live database checks. Removing membership invalidates their access; rejoining cannot revive grants issued under the old membership.

## Transport and authorization

- `POST https://www.trypreflight.dev/api/mcp` implements stateless Streamable HTTP with JSON-RPC 2.0 and JSON responses. `GET`/`DELETE` return 405; this endpoint offers no persistent SSE stream or session affinity.
- Initialize with a supported protocol version (`2025-11-25`, `2025-06-18` or `2025-03-26`), then send `notifications/initialized`. Subsequent calls use `MCP-Protocol-Version`.
- Send `Authorization: Bearer <run token>`, `Content-Type: application/json`, and `Accept: application/json, text/event-stream`.
- This is a run-grant bearer connection, not an OAuth login flow. Codex supports authenticated Streamable HTTP servers. If configuring a persistent native connection, use `url` and `bearer_token_env_var` in its MCP settings; keep the credential out of repositories and URLs. The copied prompt's HTTP fallback works without changing persistent client configuration.
- Grants are created only through an authenticated, origin-checked run API. Raw tokens are returned once, stored only as SHA-256 hashes, and never included in server-rendered page markup. Responses use `private, no-store`. MCP accepts no cookie-based authentication.
- Every MCP request checks expiry, revocation, run/project identity and current membership. Data-returning tool calls recheck access after network work. Review writes check access in their SQL statement. Owners can revoke all agent access for a run; members can revoke their own.
- Source reads use the owner's saved GitHub connection, pin immutable commits, exclude secret files/symlinks/binaries, and preserve project delegation checks. Repository credentials are not returned.
- Target database tools use actual read-only transactions and the saved encrypted run connection. They do not expose connection strings, saved sessions, global tokens, arbitrary rows or arbitrary query access.

No new production environment variables or application dependencies are needed. Both the web and worker schema deployments should be current.

## Verification

```sh
npm test
npm run build
PGLITE_MODULE=/path/to/@electric-sql/pglite \
MCP_SDK_ROOT=/path/to/@modelcontextprotocol/sdk/dist/cjs \
node tests/run-mcp.integration.cjs
```

The optional integration connects the official MCP SDK client to real Next route handlers over local HTTP and uses two real PostgreSQL databases via PGlite. It exercises scoped grants, protocol negotiation, evidence/source review, checked source citations, owner-only live database inspection, stale evidence/changed row rejection, schema dependency safeguards, saved assessments and revocation. No production accounts, paid models or live target databases are used. UI checks cover desktop/mobile in both themes, native clipboard success, copy/check feedback, delayed access responses, revocation, failed requests and clipboard denial fallback.

References: [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Codex MCP configuration](https://developers.openai.com/codex/mcp).

# Judge pilot security changes

Per-user run limits are intentionally not enabled. Provider balances and any
account-level provider controls remain the operator's responsibility.

## Public deployment requests

`lib/public-http.ts` rejects local/private/reserved destinations, embedded URL
credentials, non-HTTP protocols and nonstandard ports. It checks every resolved
address, pins a validated address to the actual connection, preserves TLS/Host
verification, and bounds time, request bytes, response bytes and decompression.
The planner bounds redirects and requires the final configured app origin.
Authentication-session probes use the same pinned connection boundary.

New projects verify repository access on the server. App URL validation also
runs on settings changes and run creation. Custom App URLs are explicitly chosen
by the owner; these checks do not constitute independent domain ownership proof.
Users must have authorization to test the configured application.

## Browser actions and cancellation

Every agent context blocks service workers and WebSockets and handles HTTP
requests through the public, pinned connection boundary. Navigation, including
frames and popups, stays on the configured origin. Public read-only resource
requests can load third-party assets. HTTP redirect chains never bypass request
policy: same-origin navigation redirects become fresh guarded GET navigations;
unsupported API redirects are blocked. Next.js action responses without an HTTP
Location header retain their normal application-level redirect behavior.

Destructive, payment, registration, messaging, account/security and edit/update
actions are blocked by runtime policy. Writes default to blocked. A safe create
button/marked Enter submission can authorize a short-lived same-origin POST
containing the exact per-step marker. PUT, PATCH and DELETE remain blocked.
Account, profile and settings endpoints remain restricted even when a generic
Save button submits the marker. Sign-in/authorization POSTs are also blocked;
read-only session inspection and sign-in page discovery remain available.
Advanced database checks cannot bypass that policy. Blocked requests produce a
blocked test result, not a confirmed application bug. These boundaries cannot
infer every business effect of a customer's server handler; use disposable test
accounts, preview deployments and database branches for write testing.

The live run/profile grant is checked before browser allocation, model decisions,
actions and requests, and after requests before delivery. An active watcher
aborts requests and closes contexts/sessions when the run stops. Cancellation
prevents future actions; already-issued requests and model calls cannot be undone.

## Private screenshot evidence

New JPEGs are stored in `run_screenshots` in the existing private database, with a
2 MB limit. There is no new storage credential or public upload. The image API
requires current project ownership/membership or an active bearer grant for that
exact run. Invalid bearer credentials do not fall back to cookie authentication.
Responses are private/no-store, JPEG-only and never accept caller-supplied URLs.

Legacy Blob migration is **paused by default**, including manual task retries:
`privatizeLegacyScreenshots()` returns `paused: true` before any database or Blob
access unless the Trigger.dev worker has `ENABLE_LEGACY_BLOB_MIGRATION=true`.
Leave this unset while Blob quota is exhausted. Routine runs save screenshots in
the database and daily retention only touches the database, so default operation
makes **zero Blob requests**, regardless of run count.

The production `privatize-screenshots` schedule now runs once daily at 10:00 UTC,
with task retries disabled. Deploy the Trigger.dev worker (the GitHub integration
tracks `main`) for the schedule and guard to take effect; a Vercel-only deployment
does not update Trigger.dev. Existing public images and the durable migration
cursor/deletion outbox are preserved while paused.

After quota recovers, explicitly opt in to resume the legacy migration. Each
scheduled invocation lists at most one page: 30 listings per 30 days before SDK
transport retries. Legacy reads and deletions consume separate operations; manual
invocations and other applications using the store add their own usage. Unset the
flag again when migration is complete to avoid empty-store polling.

When enabled, it moves
old public images into private storage, rewrites finding links atomically and
uses `retired_screenshot_blobs` as a durable deletion outbox. Failed deletions are
retried. It also paginates the old screenshot Blob prefix to privatize orphaned
uploads. Images with no surviving run remain in a private vault, never another
user's project. Daily retention removes old private evidence using the project's
retention setting (21 days by default); unowned vault images expire after 21 days
once their public object has been deleted.

Keep the legacy worker `BLOB_READ_WRITE_TOKEN` until the migration has retired all
public objects. Read-only operational checks:

```sql
SELECT count(*) FROM findings
WHERE screenshot_url LIKE 'https://%.public.blob.vercel-storage.com/preflight/runs/%';

SELECT count(*) FROM retired_screenshot_blobs WHERE deleted_at IS NULL;
```

Migration progress is resumable; preserve the migration/outbox tables. Never
rotate shared encryption keys as part of this change.

## Dependencies and verification

Next.js is updated to 16.4.3, Trigger SDK/build to 4.8.3 and Blob to 2.8.2.
Scoped overrides patch vulnerable `deepmerge-ts` and Zod transitive dependencies
without downgrading the Vercel SDKs. The release uses the committed lockfile.

Run `npm test`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev` and:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/browser-security.integration.cjs
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/private-evidence.integration.cjs
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/automatic-database.integration.cjs
```

The browser security test executes real Chromium against disposable local
fixtures and real PostgreSQL cancellation state with controlled model responses.
The network unit tests separately verify DNS/IP pinning and private-address,
redirect and buffering rejection. Evidence tests use actual SQL and JPEG bytes
with controlled Blob transport to verify access, migration, deletion retries,
orphan handling and retention. These checks are not a guarantee of zero security
defects in all customer applications or third-party services.

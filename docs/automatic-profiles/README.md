# Automatic authentication profiles

Open **Project → Profiles → New profile → Generate profile**. A Trigger worker
opens the app's sign-up flow, creates one test account, signs in and saves an
origin-scoped, encrypted profile. The run setup links to the same profile flow;
returning to run setup selects the new profile. No database connection, cookies,
protected-page path, verification-text configuration or new auth-provider admin
key is required. Manual browser sign-in and cookie/header import remain available.

By default, the account gets a unique `preflight-…@example.com` address and a
strong random password. That address has **no inbox**. If the app requires email
verification, expand **Use a test inbox** and supply a dedicated address you can
open. The agent pauses for email verification, CAPTCHA, invitations and external
OAuth; **Open browser** lets the owner finish, and **I've finished — continue**
resumes setup with the original account. We do not fabricate verification codes,
collect mail-provider credentials or bypass an app's sign-up restrictions.

## Deployment

Deploy the web app and Trigger workers together, including `generate-auth-profile`,
`release-profile-browser`, and the `expire-profile-setups` schedule.

The web app needs `DATABASE_URL`, the shared `PROFILE_ENCRYPTION_KEY`, and the
correct environment's `TRIGGER_SECRET_KEY`. It only reserves a setup and enqueues
IDs; it does not import Playwright, open a browser or call Browserbase.

The Trigger worker uses `DATABASE_URL`, that same `PROFILE_ENCRYPTION_KEY`,
`BROWSERBASE_API_KEY`, optional `BROWSERBASE_PROJECT_ID`, and `OPENROUTER_API_KEY`.
These are the existing worker credentials used by swarm runs. Browserbase must
support private keep-alive sessions. The separate manual **Sign in with browser**
option still requires Browserbase credentials in Vercel. Schema changes are
additive and run through existing `ensureSchema`.

## Verification and lifecycle

- Profiles and temporary setup grants remain owner/project scoped. The database
  permits only one active manual or automatic browser per project. A worker
  atomically claims a queued setup; duplicate deliveries cannot repeat sign-up.
  Automatic retries are disabled, and the action budget is 18 with a 540-second
  worker limit. Individual model calls have a 20-second timeout and no retries.
- The model receives visible text and numbered controls, never input values,
  generated passwords, cookies, storage state, API keys or database credentials.
  Fill actions reference server-held `email`, `password`, `name`, or `username`
  handles. Password handles may only fill password inputs. App text is treated as
  data, and navigation/click guards restrict the agent to account setup on the
  selected app origin. External sign-in is handed to the owner.
- Temporary credentials are encrypted with owner/origin/setup-specific binding.
  Trigger payloads contain only owner, project and setup IDs. Recording and
  browser console logging are disabled. No screenshots are uploaded. Live-view
  access links are encrypted in temporary setup metadata with a separate owner/origin/setup binding, returned only to the owner with no-store, and never persisted in local storage. They are erased on save, cancellation and expiry.
- Before saving, the candidate must replay in a fresh authenticated browser.
  A separate signed-out browser must be gated, or lack an exact Sign out/Log out
  marker that appears in the replay. Analytics cookies and public-page text
  cannot establish authentication. Saving performs another replay, then
  atomically consumes the capture, stores encrypted app-only cookies/storage,
  links the source capture and erases temporary account credentials.
- Cancel checks the grant before further actions, queues browser release in Trigger and
  erases temporary credentials and the encrypted live link. A worker that finishes
  allocating a browser after cancellation releases it without acting. It does not undo an account already created.
  Browserbase's timeout is capped to the setup grant's remaining time (at most 10 minutes), releasing abandoned sessions. A 15-minute
  sweep expires abandoned grants and clears their remaining encrypted passwords.
  Saved auth profiles are unchanged by that sweep. Generated accounts are not
  automatically deleted from the customer's app/database.
- A profile is a saved session, not permanent access: app session expiry still
  requires a fresh profile/sign-in. Session storage, IndexedDB and client
  certificates remain unsupported. Query/hash-dependent verification routes,
  unusual/custom sign-up widgets and apps that block cloud browsers may require
  manual setup. Email and MFA challenges require a human-accessible test account.

## Validation

Production build/typecheck and **159 tests** passed. [Integration checks](integration.jsonl)
use the actual schema/helpers/worker with PostgreSQL WASM and real Chromium,
synthetic sign-up/verification pages and deterministic model decisions. Browserbase
transport is adapted to local contexts; no real customer account, paid browser,
external email or paid model call is used. The checks exercise account creation,
fresh replay vs anonymous access, encrypted usable profiles, no model/password
exposure, cross-owner/project rejection, manual-save bypass prevention, duplicate
workers, email handoff/resume (including a callback in a new tab), cancellation during a model wait, expiry and secret
cleanup. They also reject public-page state as authentication and diagnose a shared-key mismatch before model calls or account creation.

[UI checks](ui.jsonl) exercise generated-profile setup in 1440px and 390px Chromium
viewports, both themes, using synthetic API/live-browser responses. They cover
optional inbox entry, failed-start retry, handoff, completion, returning to run
setup with the new ID, reload restoration, cancellation, no overflow and zero
Axe WCAG A/AA violations. This is not a live-provider production smoke test.

## Status-response recovery

The status data path previously ran the complete migration sequence three times
per read (156 database statements), including every poll. `ensureSchema` now
shares one initialization promise per server process, coalesces concurrent calls,
and clears a failed initialization for retry. Ownership/data reads remain fresh.
The recorded comparison measured 54 statements for the first read before the
latest schema additions; warm reads need only three data queries. These counts exclude the surrounding authentication layer. See the
[actual PostgreSQL comparison](status-storage.jsonl).

Status reads no longer initialize Playwright or the Trigger SDK. Authentication
failures stay inside the JSON response boundary. Browserbase create/debug/release
requests have individual timeouts so an unresponsive provider cannot hang them
indefinitely.

The client validates responses before using them. Empty, malformed or HTML error
responses produce a readable error with the HTTP status instead of a JSON parser
exception. Startup reads retry up to three times, with a manual **Retry status**
after persistent failure. Poll errors preserve the existing setup. An uncertain
start/resume/cancel result triggers a status read, never an automatic repeat of
that mutation; a successfully queued job can therefore resume without creating
another account.

Production build and **157 unit tests** pass. [Recovery UI checks](response-ui.jsonl)
cover desktop/phone viewports with injected empty 200/502/504 responses at startup,
polling and all mutation boundaries, including recovery without duplicate writes.
The existing actual PostgreSQL/Chromium account-creation, verification, handoff,
cancellation and shared-key integration checks still pass. The live production
endpoint could not be inspected through this environment's network proxy, so these
checks do not establish the original production response status or timing.

## Worker-owned browser startup

Automatic setup now reserves only encrypted account details on the web request.
The worker validates its keys, allocates the private browser, conditionally links
it to the still-active grant, then starts sign-up. No browser key is required in
Vercel for automatic profiles. The production Generate API file trace contains
zero Playwright/browser-runtime files. This avoids browser startup and navigation
inside Vercel's request deadline and keeps browser credentials in the working
swarm environment.

[Updated worker integration](worker-start.jsonl) covers reservation with no browser
allocation, worker-led sign-up, fresh session replay, encrypted live-link handoff,
resuming the original account, cancellation during allocation/model waiting,
owner-scoped release of a paused browser, missing worker keys before allocation,
and shared-key diagnostics. It uses real PostgreSQL WASM and Chromium with local
transport/model adapters, without paid services or customer accounts.

Web errors include a safe stage code such as `PROFILE_RESERVE/42P18`; known Trigger
configuration errors retain their explicit recovery instructions. Unexpected
errors log only stage, PostgreSQL code and error name, excluding credentials and
raw provider/database messages. This helps diagnose a live failure without
exposing secrets or replacing it with the former generic setup message.

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

Deploy the web app and Trigger workers together, including `generate-auth-profile`
and the `expire-profile-setups` schedule. They use existing `DATABASE_URL`,
`BROWSERBASE_API_KEY`, optional `BROWSERBASE_PROJECT_ID`, and the same
`PROFILE_ENCRYPTION_KEY`. The web app also needs the existing correct environment's
`TRIGGER_SECRET_KEY`. The worker uses `OPENROUTER_API_KEY` and the configured driver
model; the web app needs no model key. Browserbase must support private keep-alive
sessions. Schema changes are additive and run through existing `ensureSchema`.

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
  access links are owner-only, no-store and never persisted in local storage.
- Before saving, the candidate must replay in a fresh authenticated browser.
  A separate signed-out browser must be gated, or lack an exact Sign out/Log out
  marker that appears in the replay. Analytics cookies and public-page text
  cannot establish authentication. Saving performs another replay, then
  atomically consumes the capture, stores encrypted app-only cookies/storage,
  links the source capture and erases temporary account credentials.
- Cancel checks the grant before further actions, requests browser release and
  erases temporary credentials. It does not undo an account already created.
  Browserbase's hard 10-minute timeout releases abandoned sessions. A 15-minute
  sweep expires abandoned grants and clears their remaining encrypted passwords.
  Saved auth profiles are unchanged by that sweep. Generated accounts are not
  automatically deleted from the customer's app/database.
- A profile is a saved session, not permanent access: app session expiry still
  requires a fresh profile/sign-in. Session storage, IndexedDB and client
  certificates remain unsupported. Query/hash-dependent verification routes,
  unusual/custom sign-up widgets and apps that block cloud browsers may require
  manual setup. Email and MFA challenges require a human-accessible test account.

## Validation

Production build/typecheck and **152 tests** passed. [Integration checks](integration.jsonl)
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

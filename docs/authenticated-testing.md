# Authentication profiles and run setup

Run swarm opens a modal to choose a branch or open PR and an optional saved
profile. Branch/PR tabs have independent search, the default branch is listed
first, and the resolved deployment URL is shown before starting. A missing
preview prevents launch. Create profile opens `/dashboard/projects/:id/profiles` with the selected origin;
returning restores the selection and selects the saved profile. Each project has
a permanent Profiles sidebar tab. The old `/dashboard/profiles` route is a project
chooser and preserves old run-setup deep links.

## Deployment

The web app and workers must share **PROFILE_ENCRYPTION_KEY**, a base64-encoded
32-byte random key. Generate it locally with `openssl rand -base64 32`, then add
that exact value to Vercel and the matching Trigger.dev environment. Deploy both
the web app and workers with this code. Public runs do not require this key.
Keep the key stable; changing it without migrating existing encrypted data makes
old profiles unreadable. No key or real session was committed or used in testing.

Schema updates run through `ensureSchema()`: `auth_profiles` stores owner- and project-scoped
metadata, encrypted state and revocation time. Runs store the chosen profile ID,
name, encrypted configuration snapshot, target ref and head SHA. Reports show the
branch/PR and profile name. List/create responses never include encrypted or
plaintext credentials; Trigger payloads carry IDs/URLs rather than credentials.

## Profile behavior

- Import a cookie JSON array or Playwright storage state with cookies and local
  storage, and/or a JSON object of authentication headers.
- A profile belongs to one project and one exact origin. Another project cannot
  list, revoke or select it, even when both projects use the same domain.
  Imported cookies must match that app
  and are narrowed to its hostname, preserving path, expiry, HttpOnly, Secure
  and SameSite. Headers are injected only for the exact origin. A zero-redirect
  request/fulfill step prevents header overrides following cross-origin redirects.
- Session state uses AES-256-GCM with a random IV, authenticated against owner ID
  and origin. Stored profile values cannot be viewed after saving. To refresh
  credentials, create a replacement profile and remove the old one.
- Fields remain disabled until initialization and the native form method is POST,
  preventing browser fallback from putting credentials in a GET URL.
- Choose a protected signed-in page and optional visible text marker. Each agent
  gets an isolated context, checks access before collecting evidence, then starts
  at that page. HTTP errors, known login redirects, password forms or a missing
  configured marker fail setup rather than producing an application finding.
  A text marker/protected path is needed for a reliable application-specific check;
  the default root check alone cannot prove authentication on a public homepage.
- Selected profiles are checked before parent planning/browser allocation and
  loaded again by each agent. Revocation blocks future profile loads, including
  queued runs. It does not invalidate a session already loaded by a running agent
  or revoke the account's session at its auth provider.
- Authenticated Browserbase sessions disable provider recording/logging. Known
  credential strings are redacted from text observations/logs before model input
  or storage. Screenshots still depict the app, so use test accounts. Browserbase
  cleanup now uses the documented POST `REQUEST_RELEASE` API.
- Authenticated plans skip the anonymous server HTML fetch and instead exercise
  the configured signed-in page, navigation and a non-destructive interaction.

Interactive OAuth/MFA capture, IndexedDB/session-storage imports, automatic session
refresh and account pools are not implemented. IndexedDB imports are rejected
rather than silently discarded. Browser isolation still shares the underlying
account/data; use separate profiles/accounts when parallel mutations require it.
Auth-header requests use Playwright's request/fulfill transport, which can have a
different outbound IP from browser-native requests; IP-bound authentication may
require a future provider-specific integration.

## Deployment selection

The default branch uses the configured App URL when present. This is an explicit
project setting, not independent proof that the URL serves the selected SHA.
Other branches/PRs (and default without an App URL) require a successful GitHub
Deployment for the exact current head SHA. The latest deployment status must be
success and supply a valid HTTP(S) environment URL. There is no fallback from an
unavailable feature/PR deployment to production. If a hosting integration doesn't
publish GitHub Deployment URLs, it needs a provider-specific resolver later.
A moving head is re-resolved at launch, so a changed preview/profile origin can
require a matching profile. The picker currently lists up to 100 branches and
100 most recently updated open PRs and displays that limit when reached.

## Verification

Unit tests cover encrypted-state tampering/ownership, input scope/expiry,
secret-free worker payloads, exact-SHA resolution, missing previews, setup failures
without findings, redaction, provider cleanup and pre-initialization POST safety.
Local PostgreSQL WASM exercised the actual migrations/helpers, metadata-only
responses, encrypted snapshots, owner scoping, worker decryption and revocation.

Real Chromium against local test servers exercised HttpOnly cookies, local
storage, isolated contexts, auth headers and cross-origin redirects/resources
without credential leakage. Local-network access checks were disabled for that
local-server test because intercepted navigation responses have no remote address;
this was not an internet auth-provider integration test.

Synthetic dashboard checks exercised the entire create-profile/return/start flow,
branch/PR filtering, preview failure, exact launch payload, and the new cloud
insets at 1440/390 pixels in both themes. Accessibility/keyboard and no-JavaScript
checks are recorded in [run setup review](run-setup/README.md). No paid swarm,
real GitHub deployment or real customer authentication was exercised.

References: [Playwright authentication](https://playwright.dev/docs/auth),
[Browserbase session API types](https://github.com/browserbase/sdk-node/blob/main/src/resources/sessions/sessions.ts).

Project isolation, legacy migration and browser validation are documented in
[project profiles and cleanup](project-profiles/README.md).

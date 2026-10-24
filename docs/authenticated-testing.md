# Authenticated testing: proposed architecture

This is a proposal, not an enabled authentication feature. Agents currently start
in a fresh Playwright context and cannot import a customer's session. Run
archiving is implemented separately.

## Recommendation

Add **Authentication** to project settings, with named profiles such as
“Staging customer” and “Staging admin”. A run chooses public access or a profile.
Authenticate the browser as a normal test user. Cloning/modifying application
code and accessing its database are not required for ordinary session reuse.

| Setup method | Use |
| --- | --- |
| Connect test account | Recommended: user signs in interactively in a short-lived cloud browser, including OAuth/MFA, then saves the session. Avoid storing passwords. |
| Import session | Import browser cookies or a Playwright storage-state JSON file. Preserve cookie domain/path, expiry, Secure, HttpOnly and SameSite fields. Support local storage and IndexedDB when needed. |
| Auth headers / HTTP Basic | Advanced option for apps or preview environments that accept these methods. Inject credentials only for configured origins, never globally across arbitrary navigation. |

The browser sends session cookies or tokens; the application's own authentication
system validates them. These are not database connection credentials. Importing
only a cookie's name/value can fail when the cookie scope or companion tokens
are missing. A Playwright storage-state file is the more complete import format.
Session storage, device-bound credentials and provider-specific restrictions can
require additional handling; cookie reuse is not universal authentication support.

## Run lifecycle

1. Save a project-scoped profile containing its environment/origin, role,
   encrypted session state, status and verification check. Keep the secret state
   out of normal API responses. Display only metadata and masked cookie names.
2. Send only the profile ID to Trigger. Workers resolve ownership/run access and
   decrypt state just before use. Keep secrets out of task payloads, model input,
   reproduction steps and application/provider recordings or logs. Session
   capture should have recording/logging disabled or appropriately controlled.
3. For each agent, explicitly create an isolated context using the saved state
   before opening the target page. Do not rely on `browser.newPage()` inheriting
   a Browserbase persisted/default context: it creates its own context.
4. Verify access using an agreed signed-in UI marker or authenticated endpoint
   on the target origin. HTTP 200 alone is insufficient because login pages
   often return 200. An expired/rejected session should produce **Authentication
   expired — reconnect**, rather than a product finding about the login redirect.
5. Close each agent's context/session after the run. Make profiles revocable and
   bound to specific origins; a cookie for one preview hostname will not
   automatically authenticate a different deployment hostname.

Playwright's `storageState({ indexedDB: true })` captures cookies, local storage
and IndexedDB. Browserbase also supports persistent contexts through
`browserSettings.context: { id, persist }`. A persistent context is useful for
interactive session capture; isolated storage-state copies are a straightforward
starting point for agents. Confirm the provider's concurrency semantics before
letting multiple sessions write back to the same persistent context.

Browser isolation does not isolate application data. Two agents using one
account can still change the same cart, settings or database rows. Start with
coordinated/read-only tests for a shared account; use a pool of seeded test
accounts for independent parallel mutations. Rotating refresh tokens can also
invalidate simultaneous copies: refresh a canonical session under a lock or use
separate accounts where the provider requires it.

## When application changes help

For dependable unattended runs, optionally integrate a test-session bootstrap
endpoint or the auth provider's supported test helpers. It should create a real,
short-lived session for a seeded test account in a controlled test environment.
This is useful when sessions expire often or every preview has a new hostname.
It is an optional integration, not a production authentication bypass and not a
reason to clone/rewrite the app for every run. Private-network access and hosting
deployment protection are separate layers from application sign-in.

## Suggested delivery order

1. Encrypted cookie/storage-state import, origin scoping, access verification,
   profile selection and reconnect/revoke controls.
2. Interactive “Connect test account” to replace manual imports and handle normal
   OAuth/MFA setup.
3. Multiple roles, account pools and provider-specific bootstrap integrations.

References: [Playwright authentication](https://playwright.dev/docs/auth),
[Browserbase session context API types](https://github.com/browserbase/sdk-node/blob/main/src/resources/sessions/sessions.ts).
The installed Playwright types and current Browserbase SDK types were checked
for the storage-state/context capabilities described here; this proposal has
not been exercised with a live authenticated customer app.

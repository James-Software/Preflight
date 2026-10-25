# Browser-assisted authentication profiles

Open **Dashboard → Profiles → New profile → Sign in with browser**. Enter a name,
the app's HTTPS URL, a protected page (for example `/dashboard`), and text shown
only on that page after signing in. Open the browser, sign in with a dedicated
test account (including MFA), then choose **Verify and save profile**. The saved
profile can be selected immediately when returning to run setup.

This is an assisted sign-in flow, not automatic user provisioning: no database
connection is required and the read-only database integration cannot create auth
users. The app's protected page handles its own sign-in/provider redirect. An
agent does not receive passwords or inspect the sign-in DOM. Existing cookie and
header import remains under **Advanced: import cookies or headers**.

## Deployment

The web app now needs `BROWSERBASE_API_KEY` and, when explicitly configured,
`BROWSERBASE_PROJECT_ID` in Vercel, in addition to its existing `DATABASE_URL` and
`PROFILE_ENCRYPTION_KEY`. The encryption key must still match the Trigger worker's
key. No new encryption secret is required. Interactive sessions use Browserbase
`keepAlive` (a plan supporting that feature is required) with a 600-second provider
timeout. API fields and live-view URLs were checked against the
[Browserbase Node SDK](https://github.com/browserbase/sdk-node/blob/main/src/resources/sessions/sessions.ts).

## Boundaries and lifecycle

- Session recording and browser console logging are disabled. Sign-in happens in
  an interactive Browserbase live view; the CDP URL/API key stays server-side.
  Live-view URLs are sensitive access links: they are returned only to the owner,
  never stored in local storage, with no-store responses and no iframe referrer.
- A server-side, owner-scoped capture grant lasts ten minutes. Only one active
  grant per owner can be allocated. Reloading Profiles restores an active browser.
  Cancelling or saving requests browser release; abandoned browsers expire at the
  provider. Expired grants can be reclaimed. Provider calls failing during cleanup
  rely on the hard provider timeout.
- Save atomically claims the grant, captures cookies/local storage, filters out
  other origins/provider cookies, and verifies a replay in a fresh browser context.
  The protected page must load successfully on the app origin, avoid a sign-in
  form/route, and show the configured text. Empty/expired state or failed replay
  creates no profile and allows another sign-in/save attempt until expiry.
- Encrypted profile insertion and grant consumption share one SQL statement. No
  raw cookies, tokens or headers are returned in the result. Saved profiles retain
  the existing owner/origin binding, encryption, revocation and run checks.
- Only cookies and local storage are captured. Session storage, IndexedDB,
  client certificates, passkeys tied to the user's local device, and automatically
  inferred authentication headers are not supported. Apps/providers that block
  cloud-browser sign-in can use the existing manual import. The flow does not
  automatically renew expired app sessions or create accounts.
- Authentication proof relies on choosing a truly protected page and a marker
  absent when signed out. It does not infer that a public page is protected.

## Validation

- Production build/typecheck and 90 unit tests pass, including owner/CSRF gates,
  private allocation, single-owner reservation, capture filtering, encrypted
  atomic save, sanitized failed verification and cancellation.
- [Integration](integration.jsonl) uses real Chromium and a real local PostgreSQL
  WASM engine with the actual schema and capture helpers. It exercises a rejected
  unauthenticated replay, successful cookie/local-storage replay after sign-in,
  encryption, owner isolation, consumed/expired grants, resume and cancellation.
  Browserbase transport/live URLs are adapted locally; no paid browser or real
  customer credentials were used.
- [UI](ui.jsonl) uses synthetic sessions/APIs and an embedded browser placeholder,
  at desktop/phone sizes in light/dark themes. It checks failed-save retry, reload
  restoration, return-to-run profile selection, manual import and no overflow.
  Axe found no WCAG A/AA violations in the tested live-view screens. These checks
  do not replace a live-provider OAuth/MFA smoke test after deployment.

Views: [setup](setup-desktop.png), [mobile browser](browser-mobile.png).

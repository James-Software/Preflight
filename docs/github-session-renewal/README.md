# Background GitHub credential renewal

PreFlight's app session and GitHub's API credentials have different lifetimes.
Previously the OAuth callback retained only the access token, so a valid app
session could outlive its GitHub connection. The refresh token/expiry metadata
were discarded, and the run panel displayed an error requiring a manual retry.

The OAuth callback now stores access/refresh tokens and both expirations in
`github_connections`. Tokens are encrypted with AES-256-GCM using a domain-separated
key derived from the existing **AUTH_SECRET**, authenticated against the app
owner. They are not returned in session/API JSON or copied into new session JWTs.
No new environment variable is needed: the web app already has AUTH_SECRET,
AUTH_GITHUB_ID and AUTH_GITHUB_SECRET. The table creates itself on first use.
Keep AUTH_SECRET stable; web deployments sharing this database must use the same
secret. A changed key requires reconnecting; it does not expose the old tokens.

## Renewal and concurrency

`getGithubContext()` resolves the server-side connection and silently refreshes
an expiring access token 60 seconds before its deadline. Non-expiring OAuth grants
remain supported. Refresh uses GitHub's token endpoint and stores **both** newly
issued tokens because the old refresh token is single-use. A shared database
lease and conditional writes coordinate simultaneous requests/serverless
instances and prevent a late refresh overwriting a newer OAuth login. The lease
expires after a crashed request. API calls that see a 401 can retry once with a
token another request has just rotated.

Transient provider/network/configuration errors preserve credentials for retry
and do not trigger an OAuth loop. Expired/revoked refresh grants require reconnect
and clear the unusable stored credentials. A refresh request processed by GitHub
but lost before its replacement tokens are persisted may also require reconnect;
there is no way to reconstruct a consumed refresh token.

Legacy sessions can still use their encrypted JWT access token until it fails.
Because their refresh token was never saved, they may need **one automatic OAuth
handoff** after this deployment. Subsequent expiring grants renew on the server.
GitHub may still require user interaction for login/consent/revocation; automatic
navigation cannot bypass GitHub's authorization requirements.

## Automatic recovery UI

The run panel sends 401s through `/login?reauth=github`, preserving its target and
profile and reopening setup on return. This explicit mode bypasses the normal
signed-in `/login` shortcut. `LoginHandoff` starts OAuth automatically and labels
this case “Reconnecting GitHub”. The repository picker and fix-PR action also
initiate automatic recovery. Safe internal return URLs, an OAuth-return marker
and a short retry guard prevent endless redirects. A genuinely failed reconnect
leaves an explicit retry rather than navigating forever. No swarm is launched
just because OAuth completed; an already-attempted run is not duplicated.

Auth.js in this repository creates a random default user ID on OAuth sign-in.
A persistent provider-ID-to-owner link now keeps the app owner stable across
future logins. On the first connection, a valid current legacy session for the
same GitHub identity retains its existing owner ID so projects, profiles and their
encryption bindings do not change. A different GitHub account does not inherit
that owner. This does not reconstruct historical owner IDs from already-expired,
unmapped legacy sessions or merge separate historical identities automatically.

## Other products

A common integration pattern separates the app's own login session from its
provider credentials and renews short-lived credentials on the server. Vercel
has a [GitHub App](https://github.com/apps/vercel) for repository integration;
installation-token workflows can likewise mint replacement credentials on the
server. Vercel's exact private session implementation was not inspected here.
This change implements GitHub **user-token refresh**, not installation-token
minting, and keeps the existing repository ownership checks.

GitHub documents that expiring GitHub App user tokens last eight hours and refresh
tokens last six months; each successful refresh replaces both. Sources:
[GitHub documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
[documentation source verified during implementation](https://github.com/github/docs/blob/main/content/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens.md).
The public GitHub App API also confirms Vercel's App identity.

## Verification

- Production build, typecheck and 71 unit tests pass. New cases cover encrypted
  storage, rotation, six simultaneous requests sharing one refresh, reusing the
  replacement refresh token, temporary failure recovery, invalid grants, late
  refresh vs new OAuth, stable/legacy ownership, cross-account separation,
  session response privacy, a rotated-token API retry, safe reconnect URLs,
  redirect guards and permanent-vs-temporary API statuses.
- [PostgreSQL WASM checks](database-verification.jsonl) exercise the actual SQL,
  encrypted state, shared lease, concurrent callers, provider-owner uniqueness,
  existing project ownership, conditional writes and clearing revoked credentials.
  This does not establish multi-instance timing on the live Neon service.
- [Browser checks](browser-verification.jsonl) at desktop/phone widths exercise
  automatic OAuth, the valid-app-session login shortcut bypass, target/profile
  restoration, expiry at launch, duplicate-run prevention and loop protection.
  These use synthetic sessions and intercepted GitHub/OAuth responses. They do
  not sign in to a real GitHub account or consume a live refresh token.
- No paid swarm, real GitHub authorization or live customer data was used for
  verification. This is a web-app change; no additional worker secret is needed.

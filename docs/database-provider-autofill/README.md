# Optional Supabase / Neon account autofill

Open a project → **Database verification → Connect database**. Choose Supabase or
Neon, connect the account once, and select the database for this app origin.
Accounts can be reused across the owner's projects. **Paste a connection URL
instead** preserves manual setup and other PostgreSQL providers.

- **Neon:** choose project, branch, database and existing role. Personal API keys
  automatically discover the user's organizations and list projects with the
  required `org_id`; organization keys continue using their inferred scope.
  Multiple organizations are shown in project labels. PreFlight retrieves
  the selected role's pooled connection URI server-side. Database and role lists
  with a single option fill themselves in; multiple options require a choice.
- **Supabase:** choose the project and enter its existing database password.
  PreFlight uses the provider's primary pooler connection details, preferring
  session mode. A Supabase project has the standard `postgres` database. Supabase
  cannot return an existing database password through its management API.
- Connecting needs no workflows, SQL or expectations. A read-only `SELECT 1`
  validates a connection with no checks. Automatic verification is ready immediately; advanced checks are optional.
  Connections with zero checks are excluded from Run swarm's database-verification
  checkbox and cannot be submitted as a verified run. Connecting is not evidence
  that arbitrary app buttons have been verified.
- Existing checks are preserved and tested when replacing an origin's URI through
  autofill. No provider account API creates/modifies projects, branches, roles,
  users or database schema. Account import only uses management GET requests.

## One-time OAuth app setup

These are PreFlight operator settings, not per-customer setup steps. The code does
not register or publish provider OAuth apps. Without configured OAuth credentials,
the UI offers an encrypted account API/access token with a link to its provider's
token settings. It never presents an unavailable OAuth button.

**Supabase:** register an OAuth app in the organization's OAuth Apps settings.
Enable `projects:read` and `database:read` scopes. Set web-app environment variables
`SUPABASE_OAUTH_CLIENT_ID` and `SUPABASE_OAUTH_CLIENT_SECRET`. Register the callback
exactly as:

```
https://trypreflight.dev/api/database-providers/supabase/callback
```

Use the actual deployment origin for local/staging callbacks and register them
with the provider. Scopes belong to the Supabase OAuth app; they are not sent as
a deprecated scope query parameter. Database/password autofill does not use
Supabase anon/service-role project keys.

**Neon:** their documented OAuth program requires an approved commercial partner
relationship. Until that is available, the API-key option works without an OAuth
app. After registration/approval, configure `NEON_OAUTH_CLIENT_ID` and
`NEON_OAUTH_CLIENT_SECRET`, with callback:

```
https://trypreflight.dev/api/database-providers/neon/callback
```

The app requests `openid offline offline_access urn:neoncloud:projects:read`.
Provider permissions must allow connection URI retrieval for the selected role.

Both use the existing shared `PROFILE_ENCRYPTION_KEY` (base64 32 bytes). Do not
replace PreFlight's own `DATABASE_URL` with a customer database. See `.env.example`.

## Storage and access boundaries

Management tokens and refresh tokens are encrypted with AES-256-GCM and random
IVs, authenticated to their owner, provider and purpose. OAuth uses random state,
PKCE S256 and a ten-minute encrypted HttpOnly/Secure/SameSite=Lax cookie, then
checks the signed-in owner, project ownership, expiry and returned state. The
cookie is cleared on callback; token exchange happens only server-side. Callback
redirects contain only a provider result, with no authorization codes/errors.

Token refresh uses an atomic, bounded database lease and compares the encrypted
token version to prevent parallel refreshes or reviving a disconnected/replaced
account. Token expiry or revoked permissions produce a reconnect message.

Every endpoint requires the signed-in owner and project ownership; POSTs validate
Origin. Provider resource choices are checked server-side before obtaining the
URI. Role/password fields from list APIs are stripped; only IDs/names reach the
picker. Provider fetches use fixed HTTPS endpoints, reject redirects and use
15-second timeouts. Responses are no-store. Credentials stay out of model/task
inputs, public metadata and error messages.

Database URIs are saved using the existing owner/project/origin-bound encryption,
public-host/DNS validation, verified TLS, bounded SQL and read-only transactions.
Use an existing read-only role when available; selecting a provider owner role
does not turn that credential into a read-only database role. Supabase password
entry is encrypted as part of the saved URI and cleared from the UI on success.

**Disconnect account** removes PreFlight's stored management token grant. Saved
PostgreSQL connections are separate and remain usable until **Disconnect** is
selected for those origins. To revoke at the provider too, remove PreFlight's
integration or revoke the supplied API token in the provider account settings.
Account tokens are never sent to Trigger workers; existing encrypted database
snapshots remain the worker access path.

## Verification

- Build/typecheck and **112 unit tests** pass, including provider URL/password
  construction, stripped DTOs, owner/CSRF gates, OAuth cookie/state/PKCE/expiry,
  encrypted owner/provider/purpose separation and sanitized provider errors.
- [Integration](integration.jsonl) uses the real PostgreSQL WASM schema and actual
  API/helpers with provider HTTP and PostgreSQL transport adapted locally. It
  verifies encrypted token storage, forged role/foreign owner rejection, zero-check
  connections and run exclusion, checks added later, preservation on autofill,
  concurrency-safe refresh rotation and independent account/database disconnect.
- [UI](ui.jsonl) covers both providers at desktop/phone sizes in both themes, token
  and simulated OAuth return, picker selection, no mandatory SQL setup, secret
  clearing, adding checks later, no overflow/page errors and zero Axe WCAG A/AA
  violations in the tested picker screens. [Neon picker](neon-picker.png).
- No live OAuth app, customer database/password, paid swarm or production provider
  account was used. Live authorization and hosted database connectivity still need
  smoke testing after the operator configures the OAuth apps/credentials.

Provider references checked during implementation:

- [Supabase integration and password limitations](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration)
- [Supabase OAuth scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)
- [Supabase management API spec](https://github.com/supabase/supabase/blob/master/apps/docs/spec/api_v1_openapi.json)
- [Neon OAuth availability and protocol](https://neon.com/docs/guides/oauth-integration)
- Neon API client `@neondatabase/api-client@2.7.3` bundled OpenAPI specification,
  checked for project/branch/database/role listing and connection URI endpoints.

Personal-key organization scoping follows [Neon's personal vs organization key
requirements](https://neon.com/docs/manage/orgs-api). Account API/access-token
fields are plain text with autocomplete, capitalization, autocorrect and
spellcheck disabled, plus password-manager ignore hints. They are not new-password
fields and are cleared on successful connection. Existing database passwords stay
masked and no longer advertise themselves as new passwords either.

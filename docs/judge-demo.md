# Judge guest demo

A judge invitation is an unguessable `/demo/<code>` link. Opening it creates a
private project for that browser from the explicitly authorized
`James-Software/Preflight-Example` template. It does not start a paid run until the
judge clicks Start. Returning through the same link reuses the guest project.

The encrypted Auth.js JWT lives in a separate HttpOnly, Secure, SameSite=Lax,
host-only `__Host-preflight-guest` cookie. It contains the guest identity and
project ID, never GitHub or database credentials. Both the cookie and database
grant expire within 30 days. Existing GitHub cookies are preserved; leaving the
demo clears only the guest cookie. The session API exposes `user.isGuest`.

Each guest is a member of their own project, with a fresh run history. The real
template owner remains the owner, so guest sessions cannot change settings,
connections or collaborators. The database connection is decrypted and resealed
on the server with the new project ID before project/membership/connection/session
creation is committed atomically. The example database remains shared; it is the
intentionally broken waitlist app, whose submission does not insert anything.

Guests test only the example's main branch. Repository reads are delegated to the
owner and scoped to that repository with membership and expiry rechecked on every
request. Guest GitHub writes and PR creation are blocked. Run-specific agent
prompts work; their bearer grants also check the live guest invitation and session.
Guest projects do not expose the original project's runs, profiles or screenshots.

Invitation codes are random 32-byte base64url values. Only their SHA-256 hash is
stored in `guest_demo_links`, with the template project ID and expiry. The link is
not added to the sitemap or public discovery documents. It sends no-store,
no-referrer and noindex headers. Router prefetches do not create guest sessions.

To revoke a link, set its `guest_demo_links.revoked_at`; to revoke one browser,
set its `guest_demo_sessions.revoked_at`. A new request immediately loses access,
including any issued guest agent bearer. This does not undo an already queued run.
No per-user run quota is introduced.

Verify with the usual suite/build and:

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/guest-demo.integration.cjs
```

The integration test uses real Postgres semantics and real Auth.js encryption,
including isolated projects, resealed connection state, resumed sessions, existing
GitHub identity preservation, invalid cookies, revoked invitations and scoped agent
access. Live verification should additionally open the invitation in a fresh
browser, configure its main-branch run, and confirm database verification is selected.

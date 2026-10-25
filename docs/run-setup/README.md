# Run setup review

The Run swarm action opens one setup dialog: searchable Branches/Pull requests,
resolved deployment URL, authentication profile, Create profile link, and a clear
Start swarm action. The default branch is preselected. A missing deployment keeps
launch disabled; the selected target is rechecked on the server when starting.
The existing blue gradient and glow-free primary button treatment are retained.

`/dashboard/profiles` provides named cookie/local-storage/header profiles with
origin scoping, optional protected-page/text verification and confirmed removal.
Creating a profile returns to the original run setup and preselects the saved
profile while preserving the branch/PR. Stored secret values are not displayed.
The profile form uses POST for native fallback and stays disabled before
initialization, protecting against session values appearing in a URL.

The hero's left/right gutters increased from 8px to `calc(8px + 0.5vw)`, narrowing
the cloud window by 1vw overall. Its height, fixed rounded outline, 12px corners
and 8px bottom gutter are retained.

## Evidence

- [Desktop panel](panel-desktop.png), [phone panel](panel-mobile.png),
  [profiles](profiles.png).
- [Browser verification](browser-verification.jsonl): 1440×1000 and 390×844,
  light/dark; branch and PR filtering, missing deployment, profile creation,
  return with selection, launch payload, no overflow/page errors, measured cloud
  edges. The desktop edge is 15.1875px and phone edge 9.9375px (CSS pixel rounding).
- [Accessibility/keyboard verification](accessibility-verification.jsonl): modal
  focus behavior, Escape returning focus to the trigger, profile forms and
  no-JavaScript POST/disabled controls. Axe found no WCAG A/AA violations;
  incomplete contrast/attribute checks remain recorded rather than called passes.
- [Authentication browser verification](authentication-browser-verification.jsonl):
  actual Chromium/local HTTP servers, HttpOnly cookies, local storage, scoped
  auth headers, isolated agent contexts, no supplied credentials at cross-origin
  resources/redirects, and rejected sessions failing setup. Local-network access
  checks were disabled only in that loopback test because intercepted navigation
  has no remote address. Production browser behavior was not changed for it.
- [Database verification](database-verification.jsonl): actual schema/helpers on
  PostgreSQL WASM, repeated migrations, encryption at rest, metadata-only outputs,
  ownership, run snapshots, worker decryption and revocation. Tool-only database
  dependencies were installed outside the repository.
- Production build, typecheck and **58 unit tests** pass. These cover profile
  validation/encryption, exact-SHA deployments, secret-free task payloads,
  authentication failures without findings, text redaction, provider cleanup,
  and the existing swarm/fix/archive regressions.

Dashboard browser evidence uses synthetic sessions/data and intercepted
GitHub/profile/run API responses; it does not establish live provider access.
The local auth browser and database checks exercise the real helpers without paid
services. No real session, customer record, GitHub PR or paid swarm was used.

Configure the shared **PROFILE_ENCRYPTION_KEY** in Vercel and Trigger.dev and
redeploy both before using saved profiles. Public runs remain available without
it. See [authentication setup and limitations](../authenticated-testing.md).

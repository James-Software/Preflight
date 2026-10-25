# Project workspace

Each project has a sidebar with icon links in this order:

| Section | URL | Purpose |
| --- | --- | --- |
| Runs | `/dashboard/projects/:id` | Default landing page, swarm launch, run history and archive |
| Profiles | `/dashboard/projects/:id/profiles` | Project-specific test sessions and browser sign-in |
| General info | `/dashboard/projects/:id/general` | Display name, uploaded image, app URL and GitHub repository |
| Database | `/dashboard/projects/:id/database` | Database connections, verification checks and cleanup approval |

The sidebar includes **Back to projects**, a project logo/name, and a selected
section state. Run reports also keep the sidebar and select Runs. Below the
desktop breakpoint, the links become a compact horizontal tab row. Links use
visible focus, hover and press feedback. Existing profile/run-configuration links
still return to the project's default Runs route.

## General info

Settings save through an origin-checked, authenticated and owner-scoped PATCH
endpoint. Image/name/URL edits do not require reauthorizing GitHub. A changed
repository is verified again server-side using the existing GitHub ownership and
push-permission checks; a picker result alone cannot authorize a change. The
picker preserves the General info return destination during GitHub reconnect.

Images accept static PNG/JPG/WebP files up to 2 MB and 4096 × 4096 pixels. Sharp
decodes and re-encodes the image as a metadata-free WebP thumbnail, at most 256 ×
256, preserving aspect ratio. The small sanitized data URI is stored in the project
record; no new blob-storage configuration is required. **Use site favicon** clears
the custom image. Identity changes appear in the sidebar, report logo and project
list. Empty display names use the repository fallback. Empty app URLs keep the
existing default-branch-preview behavior.

Changing the repository does not retarget historical fixes. The schema adds a
repository snapshot to each run, backfills older runs before editing, and saves
the server-resolved repository when starting a run. An in-flight request keeps
its resolved repository even if the project settings change meanwhile. Fix PRs
and report metadata use that snapshot. Latest-preview hints are scoped to the
current repository so an old run's environment is not borrowed after a switch.
Database connections/auth profiles keep their existing origin scopes.

## Database navigation

Database settings are expanded on their own page. Provider OAuth callbacks return
to that page and keep the selected provider. Database saves invalidate the new
page. Account autofill, manual URL entry and optional checks retain their current
behavior.

## Verification

- Production build/typecheck and **120 unit tests** pass. Coverage includes owner
  and Origin checks, image decoding/limits, field validation, GitHub verification,
  sidebar order/active report state, deep-link sign-in, and original-repository
  fix PR routing.
- [PostgreSQL integration](storage.jsonl) uses the actual schema/helpers with a
  local PostgreSQL WASM engine: identity persistence, denied foreign edits, image
  reset, legacy run backfill, old/new run repositories, in-flight selection and
  current-repository preview hints. No customer database was modified.
- [Browser checks](ui.jsonl) cover desktop/phone × light/dark: default Runs, side
  navigation, saving/reloading general settings, actual image upload/reset,
  repository picking/save, separate expanded Database settings, updated origins,
  report navigation, Back to projects and display names in the project list.
  There were no horizontal overflow/page errors; Axe WCAG A/AA checks on the
  report screens found no violations.
- Browser checks use an isolated synthetic-session/data fixture. Settings/image
  validation and UI run as implemented; GitHub authorization is adapted locally.
  Unit tests independently cover denied and accepted repository verification.
  No live GitHub repository was changed or paid swarm run started for validation.

[Runs](runs-desktop.png) · [General info](general-desktop.png) · [Mobile Database](database-mobile.png)

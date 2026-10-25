# Project profiles and cleanup navigation

Projects now have Runs (default), Profiles, Cleanup, General info and Database
sidebar tabs with icons. On small screens the tabs scroll horizontally without
widening the page. Global navigation no longer offers an account-wide Profiles
manager. The old `/dashboard/profiles` URL presents a project chooser; old
return-to-run links redirect to the selected project's Profiles page.

## Authentication profiles

Profile metadata and browser capture grants include `project_id`. Listing,
creating, moving, revoking and selecting a profile require an owned project.
The run-setup picker fetches only that project's profiles and still filters by
exact deployment origin. Run launch and worker replay enforce the same project
binding, so sharing a domain does not allow a profile to cross projects.

Browser sign-in start, restore, save and cancel are also owner/project scoped.
Only one active capture per owner/project is permitted; different projects can
have independent sessions. Existing abandoned unassigned capture grants expire
under the existing ten-minute provider TTL. No cookies or passwords are copied
between projects. Encryption remains stable and owner/origin authenticated;
project isolation is additionally enforced by the database grant queries.

Existing unassigned profiles migrate automatically only when origin/history
identify one owned project. Ambiguous profiles remain unassigned: a project’s
Profiles page offers **Move an existing profile** to explicitly bind one. Moving
is atomic and does not permit sharing it between projects. No session is deleted
or reencrypted during migration. Runs with a still-unassigned legacy grant retain
their prior snapshot; assigning it to a different project prevents future replay
in the old project. Historical reports remain available.

## Cleanup

`/dashboard/projects/:id/cleanup` lists only database-enabled runs belonging to
that project/owner. JSON-null snapshots from browser-only runs are excluded.
The default selection favors a run with pending review, then the latest run.
`?run=:id` deep links are validated against the project's run list; foreign runs
return not found. A run selector switches the review component and its state.
Run reports link to this page instead of embedding duplicate approval controls.
Accept/Deny, Origin/auth/ownership/final-status checks and one-record transaction
limits remain unchanged. No cleanup action happens during navigation.

## Validation

- Full automated suite: 131 tests, including project-bound profile CRUD/run
  selection, capture grants, API guards, sidebar state and foreign cleanup links.
- `storage.jsonl`: actual PostgreSQL via PGlite exercises two projects sharing an
  origin, cross-project selection/revocation/worker rejection, foreign owners,
  legacy migration and explicit move, capture cancellation/restore, project
  capture uniqueness, and owner/project-bound cleanup run lists.
- `ui.jsonl`: real Chromium at 1440px/390px in light/dark mode exercises per-project
  lists, scoped manual creation, sidebar selection, cleanup run switching,
  active-run handling, denial and report links, with no page overflow/errors or
  Axe violations. API actions use synthetic responses; no live session was used.
- Production build and TypeScript checks pass. No paid browser/model run or real
  customer database was used. Deploy both web and workers together.

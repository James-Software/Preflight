# UI audit fixes

This branch fixes the site-wide review against TASTE.md on top of merged landing PR #4. It keeps the approved plasma hero, centered scroll sequence, card dimensions, robot summaries, theme support and animation-only snapping.

## Changes

- Run rows constrain long URLs and stack actions on phones. Each row links to an owner-scoped report with stored reproduction steps, screenshots, console/network evidence, diagnosis, proposed code change and a GitHub PR when recorded. Active reports refresh while agents work; empty/ended runs use honest empty states. Initial history loads finding counts in the same query rather than hard-coding zero or querying once per run.
- Blog management gives titles and URLs room above the status/actions on phones. Deleting a post asks for confirmation naming the post and shows a pending state. Saving/publishing disables the form, names the action, preserves values on failure, and returns a result banner. Preview includes title and description. Unsaved edits trigger the browser’s leave warning.
- New-project errors return form state instead of redirecting and erasing selections. Native post-action resets are prevented so checked repository/publication choices survive validation errors. Repository selection uses real radio controls, and failed repository loading has a Retry control.
- App URL can be edited from the project, giving failed preview resolution an actionable recovery path. Updates check project ownership again in the server action and SQL.
- Shared headers and profile menus expose role-gated Projects, Waitlist and Blog navigation. Admin pages/actions still enforce their own authorization. Invitation sharing follows the main project task; manual SQL instructions sit behind a disclosure.
- Shared secondary text tokens replace low-opacity text in both themes. Purple actions use darker gradient stops for white-label contrast and drop their resting glow. Real code keeps monospace styling; public blog dates use the reading face.
- Login preserves a validated internal return URL and offers retry after a stalled handoff. Only an explicitly recorded access request shows waitlist confirmation; generic sign-in failures offer recovery. Missing pages, articles, projects and runs have useful destinations.
- Legal body text is 16px, with an accessible contents disclosure and anchored headings. Invite eyebrows and redundant blog-list dividers are removed.

## Review images

These are local synthetic users, projects, posts and findings, not production data or published articles.

| Surface | Before | After |
| --- | --- | --- |
| Mobile run history | [View](screenshots/before-17-project-runs-390-light.png) | [Light](screenshots/17-project-runs-390-light.png) · [Dark](screenshots/17-project-runs-390-dark.png) |
| Mobile blog management | [View](screenshots/before-21-admin-blog-390-light.png) | [Light](screenshots/21-admin-blog-390-light.png) · [Dark](screenshots/21-admin-blog-390-dark.png) |
| Run report | — | [Phone](screenshots/30-run-report-390-light.png) · [Desktop dark](screenshots/30-run-report-1440-dark.png) |
| No recorded findings | — | [View](screenshots/32-run-empty-390-light.png) |
| Full article preview | — | [View](screenshots/24-editor-preview-1440-light.png) |
| Disabled pending save | — | [View](screenshots/action-saving-390-light.png) |
| Preserved invalid URL and selected repository | — | [View](screenshots/action-project-preserved-390-light.png) |
| Login retry | — | [View](screenshots/action-login-retry-390-light.png) |
| Explicit waitlist confirmation | — | [View](screenshots/35-waitlisted-390-light.png) |

The preserved landing sequence: [desktop](screenshots/landing-pr-1440-dark.png) · [phone](screenshots/landing-pr-390-dark.png).

## Validation

- `npm test`: seven regression tests for safe login return destinations, report authentication, invalid IDs, project ownership, query scoping and initial finding counts. DB/session boundaries are supplied by the tests; they do not require credentials or make remote requests.
- `npm run typecheck` and `npm run build` pass. No dependencies were added.
- 37 UI states at 1440×900, 768×1024 and 390×844, in light and dark modes: **222 captures, zero horizontal document overflows**. The original mobile run case measured 504px at a 390px viewport; the updated version measures 390px. See [verification.jsonl](verification.jsonl).
- **54 axe WCAG 2 A/AA and 2.1 AA checks, zero violations**, including the new reports and recovery screens. Incomplete checks are retained in the measurements; this is not a full accessibility conformance claim. The preceding audit had contrast violations on 31 of its 38 checked states.
- Functional browser checks at phone/light and desktop/dark cover retained URL and checked repository after server validation, initial run counts, report navigation/artifacts, app-URL save and reload, full article preview, disabled pending submission, draft save, delete confirmation and cancellation, publishing/unpublishing, and unsaved-edit warnings. Additional checks verify login timeout/retry, deep-link return, member/admin navigation separation and denied access to another owner’s report/API. See [functional.jsonl](functional.jsonl).
- Pinned-sequence captures cover browser, fan, screenshot, console, network, diagnosis and PR in both themes at desktop and phone sizes, plus release and no-JavaScript fallback. All 28 pinned states keep navigation hidden and avoid horizontal overflow. See [motion.jsonl](motion.jsonl).
- The browser checks run against an isolated production build with local in-memory data and substituted auth/external-service boundaries. No fixture authentication, fake artifacts or data hooks are included in application source. No production posts, users, projects, runs or settings were changed. Live GitHub OAuth, Neon, task execution and real publication were not exercised in this environment.

The new report reads existing tables; no schema migration or new service configuration is needed. Admin editor: `/dashboard/admin/blog/new` for the configured `james-software` GitHub account.

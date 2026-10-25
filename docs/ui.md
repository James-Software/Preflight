# Shared UI

Public routes use `components/PublicLayout.tsx`; dashboard routes use
`app/dashboard/layout.tsx`. These layouts own their headers. PublicLayout also
owns the footer. Pages should render their content inside one `main`, without
adding another header or footer. Dashboard pages and server actions must keep
their own authorization and ownership checks; a layout is not a security boundary.

Use `ProfileMenu` for the signed-in account control. It owns the avatar trigger,
appearance choices, account navigation, and sign out. Use `Avatar` alone when
showing someone else, such as a waitlist member. `Brand` owns the plane logo and
wordmark, and `ThemeToggle` is the signed-out appearance control.

The root provider installs OS and cross-tab theme synchronization once for all
routes. `useTheme()` reads it with a hydration-safe server snapshot. To change
the theme, call `applyTheme("light")` or `applyTheme("dark")`; do not add local
appearance state or storage listeners to individual pages. The initial script in
`app/layout.tsx` sets the theme before first paint. An explicit saved preference
wins over the OS setting. Without a valid preference, the site follows the OS.

Shared Tailwind colors are defined in `app/globals.css`:

- `bg-page`: the page background.
- `bg-surface`: elevated panels, profile menus, and cards.
- `bg-panel`: quieter inset surfaces and selected controls.
- `border-line`: standard borders in either mode.
- `text-primary`: the theme-aware accent color.
- `text-muted`: tested secondary text in both themes; use it for dates and helpers instead of low-opacity ink or white.

Use `btn-primary` for the original blue gradient primary actions: `#8aa5ff` →
`#6a6df5` → `#4e2fd8`, with pill corners and inset highlights only—no outer glow or drop shadow.
This exact treatment is an explicit user preference; preserve it during style
refinements. The later dark-purple stops (`#6259d5` / `#5141c7` / `#4323b8`)
are not the requested original gradient.
Use neutral surfaces and readable charcoal text outside the brand artwork. Keep
navigation opaque and shadow-free; shadows belong to floating menus and dialogs.
Choose lists for projects and articles; reserve panels for grouped form controls,
empty states and evidence. The plasma hero and pinned evidence sequence are the
signature visuals. Native controls inherit the document's color scheme.

## Compact feedback animations

For icon changes such as copy → check, follow the requested Emil Kowalski-inspired
pattern: a short opacity/scale crossfade with `filter: blur(3px)` on the outgoing
icon, easing out over 180ms. Reuse `IconSwap` so future controls stay consistent.
Use `.pressable` for a `scale(0.97)` press response. Animate explicit properties,
not `transition: all`, and switch icons immediately under reduced motion.

Use `CopyButton` for clipboard actions. It owns the copy/check icons, accessible
labels and status, success reset, repeat-click timing, and timeout cleanup.

Admin navigation is derived from `isAdminLogin` on the server and passed as a boolean to shared headers and profile menus. UI links are not authorization: pages, reports, and actions still check sessions and ownership. Run reports use stored artifacts; no illustrative landing data enters dashboard reports.

Use `ProjectLogo` for project favicons and the repository-initial fallback. Run
reports use `FixesTable`: selection checkboxes group ready code patches into one
PR per action; finding titles expand evidence. Keep existing PRs, pending groups
and findings awaiting patches visually distinct. Use the shared Git icons for
branch creation and PR links. See [grouped fix reports](fix-reports/README.md).

Use `RunArchiveButton` for archiving/restoring finished runs. Archive state is
separate from execution status, and reports remain accessible. The runs list
provides current/archived views; active runs must be stopped before archiving.

## Landing motion

The cloud window is a regular rounded rectangle with 12px corners. It fills the space below the 80px navigation with side gutters of `calc(8px + 0.5vw)` and an 8px bottom gutter; do not add extra shader or fallback insets. Clouds can move inside it; the outline must stay fixed in both WebGL and the CSS fallback.

The evidence sequence preserves native wheel, touch and keyboard scrolling. Make accidental skips less likely with enough scroll distance between beats. Do not consume gestures, discard momentum, prevent input defaults or enforce a per-step cooldown. Settling is proximity-only, confined to the animation, and has no running page-scroll tween that can catch new input; reduced motion and short viewports keep normal document flow.

## Run configuration

`RunSwarmButton` owns the native setup dialog, deployment filters/search and
profile selection. Keep its primary action disabled until a deployment resolves.
`ProfilesManager` owns cookie/header import and revocation at `/dashboard/profiles`.
Credential fields wait for initialization and use POST even for native submission;
never let a fallback form place session values in a URL. Secret values are not
returned after saving. See [authenticated testing](authenticated-testing.md).

GitHub credential expiry is handled on the server through background token
renewal. If reconnect is required, use `reconnectGithub` and preserve the user's
internal return path. The run panel restores its target/profile on return.
Explicit `/login?reauth=github` must bypass the signed-in shortcut; bound automatic
retries so a rejected OAuth connection cannot loop. See
[GitHub session renewal](github-session-renewal/README.md).

## Database verification

Project `DatabaseSettings` pairs read-only PostgreSQL queries with browser
workflows and exact button labels. Saved credentials are never returned. Run setup
shows a database checkbox only for the matching deployment origin; reports use
`DatabaseCheckResults` to separate confirmed, failed and unverified outcomes.
Never label an ordinary success toast as proof of a persisted database change.
See [database verification](database-verification/README.md).

The GitHub handoff has no public layout/navigation/footer/card/buttons. Its black
viewport contains only white “Connecting to Github...” text while OAuth begins.
Transient launch failures retry automatically; terminal failures use the existing
access-denied route. Keep normal loading minimal in both themes.

### Browser-assisted profile setup

`/dashboard/profiles` defaults to an interactive sign-in browser instead of JSON
fields. Ask for an app URL and explicit protected-page/text evidence, then verify
a fresh replay before saving. Keep manual imports in the Advanced disclosure.
Offer an external-tab live-view fallback, preserve active sign-in across reloads,
and select the saved profile when returning to run setup. Never send sign-in DOM,
passwords or session credentials to a model or include them in visible results.

### Optional database account autofill

Project database setup starts with provider selection and account authorization,
then a database picker. Keep direct URL entry available in a disclosure. Do not
require SQL/workflow assertions just to save a connection: offer Add checks later,
and exclude zero-check connections from Run swarm's verification toggle. Use plain, no-autofill inputs for account API/access tokens; mask actual database
passwords and clear credentials after connecting; return only project/branch/database/role names to
the client. Supabase's existing-password requirement and Neon's OAuth availability
must be explained at the relevant step, without offering non-working OAuth CTAs.

### Project sections

Project pages share a left sidebar: **Runs** first/default, **General info**, then
**Database**, with line icons and a Back to projects link. On phones, use a tab row.
Keep run launch/history on the root route; settings belong on their own routes.
General info saves a display name, safe uploaded logo, app URL and verified GitHub
repository. A custom logo can be reset to favicon detection. Existing run reports
and fix PRs remain tied to their saved repository when the project repo changes.
See [workspace validation and previews](project-workspace/README.md).

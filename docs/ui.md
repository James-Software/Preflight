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

Use `btn-primary` for solid purple primary actions with an 8px corner radius.
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

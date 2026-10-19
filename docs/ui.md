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

Keep the existing rounded panels, pill buttons, `btn-gradient` primary actions,
and short color transitions. Native controls inherit the document's color scheme.

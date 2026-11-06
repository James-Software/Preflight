# Shared PreFlight design

The rest of the website now uses the landing page’s Instrument Sans headings, ivory and navy palette, flat actions and generous spacing. Shared theme tokens cover public pages, auth states, settings, admin and reporting screens. The landing composition and cloud image remain intact.

Projects and runs use square-cornered rows with black horizontal dividers in light mode. Pale dividers provide the same separation in dark mode. The dashboard and header now share a wider frame, project navigation is narrower, and invitations use an open layout rather than a competing panel.

## Previews

[Projects desktop light](dashboard-1440-light.png) · [Projects desktop dark](dashboard-1440-dark.png) · [Projects mobile light](dashboard-390-light.png) · [Projects mobile dark](dashboard-390-dark.png) · [Runs](runs-1440-dark.png) · [Settings](general-1440-light.png) · [Blog](blog-1440-light.png) · [Sign-in handoff](login-390-dark.png)

## Verification

- TypeScript and final production build passed.
- All 261 existing unit tests passed.
- 17 screens at 1440px and 390px in both themes: 68 combinations, no horizontal page overflow, no browser page errors and no Axe WCAG A/AA violations. See [browser details](browser-checks.json).
- Screens cover home, blog index/article, privacy, terms, access error, invitation, projects, runs, general settings, profiles, database, collaboration, project creation, admin waitlist, blog editor and run report.
- Verified square row corners and divider colors from computed styles.
- Project navigation, deletion-dialog cancel/Escape, appearance switching, run filters and settings input work on desktop and mobile.
- Sign-in handoff colors and rendering checked in both themes on mobile.

Authenticated screenshots use an isolated local copy of the actual components with synthetic data and mocked authentication/API responses. No production auth, database configuration or API behavior was changed. OAuth, live AI runs, payments, email and production mutations were not exercised. Automatic accessibility checks do not establish full compliance.

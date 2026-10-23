# Annotated landing-page run

The separate run demo and numbered feature grid now form one annotated sample run. Browser, evidence, diagnosis and diff panes demonstrate each claim; PR #436 ends with the human merge decision. Evidence tabs support click, Left/Right, Home/End and standard Tab navigation. Code wraps on narrow screens. The diff uses a file toolbar, line-number gutter and highlighted additions/removals; timestamped logs use terminal panes with severity labels. Checkout screenshots sit inside Chrome-style window tabs, navigation controls and an address bar. Network evidence has a matching inspector pane. The hero copy and mobile scale, early-access typography and scroll-stable nav are also corrected.

Inter and Space Grotesk are self-hosted from Fontsource 5.3.0 with their OFL licenses in `app/fonts`. This preserves the existing font families without build-time Google Fonts requests, which this environment denies. No dependencies or lockfiles changed.

The run now animates on scroll: a sticky header tracks Browser → Evidence → Diagnosis → Review, with a continuous progress line and staggered pane/annotation entrances. Branch icons identify `main` and `fix/checkout`, and the payoff uses a pull-request icon. Animations use transform and opacity, run once per pane, and are disabled for reduced motion; content remains visible without JavaScript.

## Screenshots

Full-page Chromium screenshots, reduced motion, explicit saved theme. Before images use the original landing components with the same local fonts (Google Fonts was inaccessible); development tooling is hidden. After images use the production build.

| Viewport | Light before / after | Dark before / after |
| --- | --- | --- |
| 1440 × 900 | [Before](before/1440-light.png) · [After](after/1440-light.png) | [Before](before/1440-dark.png) · [After](after/1440-dark.png) |
| 768 × 1024 | [Before](before/768-light.png) · [After](after/768-light.png) | [Before](before/768-dark.png) · [After](after/768-dark.png) |
| 390 × 844 | [Before](before/390-light.png) · [After](after/390-light.png) | [Before](before/390-dark.png) · [After](after/390-dark.png) |

## Validation

- `npm ci`, `npm run typecheck`, `npm run build`, and `git diff --check` pass. No lint or test scripts exist in package.json.
- Production-server browser checks pass at all six viewport/theme combinations: no document overflow, no code overflow, all h1/h2 headings at most two lines, nav width and x-position unchanged after scrolling, mouse tab selection and keyboard selection work.
- Scroll checks at 390px and 1440px verify stage changes, increasing progress, sticky header placement, normal-motion entrance animations, reduced-motion suppression and keyboard focus clearing the header. A JavaScript-disabled check verifies all panes and the PR remain visible. See scroll-verification.jsonl.
- Mobile h1 measures approximately 48px; section headings measure 30px.
- Axe WCAG A/AA checks cover the new section in both themes and every evidence tab, including 4.5:1 normal-text contrast. See accessibility.jsonl for exact results.
- CTA hrefs remain `#early-access`, `#how-it-works` and `/login`. Privacy, Terms and the For agents destination return 200. Blog href is unchanged; `/blog` returns 500 without DATABASE_URL, an existing integration requirement. OAuth and waitlist submission were not exercised without credentials.
- The illustrative sample is not a claim that an actual run occurred. Team should confirm the console error, absent checkout request, stale useCallback diagnosis, dependency-list fix and PR title. All panes use agent-2, /checkout, Pro, Pay now, app/checkout/page.tsx, run #128 and PR #436 consistently.

Only landing-page components, requested copy corrections, shared font transport and these review artifacts are changed. Auth, routes, waitlist handlers and legal content are unchanged.

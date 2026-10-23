# Pinned sample run

Four minimal scenes share the center of the viewport: browser → evidence → diagnosis → fix. The scene stays pinned while scrolling through the sequence and releases after the PR. Scroll position selects the step; native page scrolling is preserved. The floating run toolbar is removed, and the site nav is hidden during the pinned sequence and restored on release.

Each step has one short heading, one sentence and its product visual. The final diff is shorter, with the branch and human merge decision below it. Browser chrome, code blocks, logs, evidence tabs and both themes are retained. Reduced motion, JavaScript-disabled browsers and viewports too short for the visuals show all steps in natural document flow.

## Pinned scenes

Each link shows the actual viewport at that step, with ordinary motion enabled.

| Viewport / theme | Browser | Evidence | Diagnosis | PR |
| --- | --- | --- | --- | --- |
| 1440 × 900 / light | [View](pinned/1440-light-0.png) | [View](pinned/1440-light-1.png) | [View](pinned/1440-light-2.png) | [View](pinned/1440-light-3.png) |
| 1440 × 900 / dark | [View](pinned/1440-dark-0.png) | [View](pinned/1440-dark-1.png) | [View](pinned/1440-dark-2.png) | [View](pinned/1440-dark-3.png) |
| 768 × 1024 / light | [View](pinned/768-light-0.png) | [View](pinned/768-light-1.png) | [View](pinned/768-light-2.png) | [View](pinned/768-light-3.png) |
| 768 × 1024 / dark | [View](pinned/768-dark-0.png) | [View](pinned/768-dark-1.png) | [View](pinned/768-dark-2.png) | [View](pinned/768-dark-3.png) |
| 390 × 844 / light | [View](pinned/390-light-0.png) | [View](pinned/390-light-1.png) | [View](pinned/390-light-2.png) | [View](pinned/390-light-3.png) |
| 390 × 844 / dark | [View](pinned/390-dark-0.png) | [View](pinned/390-dark-1.png) | [View](pinned/390-dark-2.png) | [View](pinned/390-dark-3.png) |

## Full-page comparison

These after images show the reduced-motion stacked fallback. Before images use the original landing components with the same local fonts, because Google Fonts was inaccessible. Development tooling is hidden; after images use the production build.

| Viewport | Light before / after | Dark before / after |
| --- | --- | --- |
| 1440 × 900 | [Before](before/1440-light.png) · [After](after/1440-light.png) | [Before](before/1440-dark.png) · [After](after/1440-dark.png) |
| 768 × 1024 | [Before](before/768-light.png) · [After](after/768-light.png) | [Before](before/768-dark.png) · [After](after/768-dark.png) |
| 390 × 844 | [Before](before/390-light.png) · [After](after/390-light.png) | [Before](before/390-dark.png) · [After](after/390-dark.png) |

## Verification

- Installation, typecheck, production build and diff checks pass. The repository has no lint or test scripts.
- At 1440×900, 768×1024 and 390×844, both themes: each of the four scenes stays within 2px of the viewport's vertical center; exactly one scene is active; the sequence releases after its last scene; no document or code overflow; evidence tabs work by mouse and keyboard. The floating site nav stays hidden while pinned and returns afterward. See pinned-verification.jsonl.
- Reduced motion and JavaScript-disabled checks verify all four steps remain visible without pinning. Short viewports use this same natural-flow fallback.
- Axe WCAG A/AA checks, including normal-text contrast, cover every evidence tab and all scene visuals in both themes using the reduced-motion fallback. See accessibility.jsonl.
- CTA destinations remain `#early-access`, `#how-it-works` and `/login`. Privacy, Terms and For agents return 200. Blog needs DATABASE_URL and returns 500 without it; the link is unchanged. OAuth and waitlist submission remain untested without credentials.

All content is illustrative. Confirm the console error, missing POST /api/checkout, stale useCallback diagnosis and dependency-list fix before presenting it as actual evidence. Fonts remain self-hosted with OFL licenses; no dependencies or lockfiles changed. Auth, routes, waitlist handlers and legal content are unchanged.

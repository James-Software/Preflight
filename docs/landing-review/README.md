# Scroll-driven evidence fan

The evidence step now shows three portrait cards instead of tabs: Screenshot, Console and Network. They unfold into a left/center/right fan. Continued scrolling brings each card into the center at full size while the others sit behind it, smaller and rotated. No glow, tint or highlight marks the selected card. The heading stays anchored; the three cards share a fixed-height stage.

The browser, evidence, diagnosis and PR still form one centered pinned sequence. Evidence gets four scroll beats: fan opening, screenshot forward, console forward and network forward. The page releases after the PR. Native scrolling remains in place, and the floating site nav is hidden during the sequence.

Reduced motion, JavaScript-disabled browsers and short viewports show the three cards in natural document flow, fully readable without animation. The code/logs and browser frame are built as HTML rather than squeezing wide screenshots into narrow cards.

## Evidence sequence

| Viewport / theme | Fan opens | Screenshot forward | Console forward | Network forward |
| --- | --- | --- | --- | --- |
| 1440 × 900 / light | [View](fan/1440-light-0.png) | [View](fan/1440-light-1.png) | [View](fan/1440-light-2.png) | [View](fan/1440-light-3.png) |
| 1440 × 900 / dark | [View](fan/1440-dark-0.png) | [View](fan/1440-dark-1.png) | [View](fan/1440-dark-2.png) | [View](fan/1440-dark-3.png) |
| 768 × 1024 / light | [View](fan/768-light-0.png) | [View](fan/768-light-1.png) | [View](fan/768-light-2.png) | [View](fan/768-light-3.png) |
| 768 × 1024 / dark | [View](fan/768-dark-0.png) | [View](fan/768-dark-1.png) | [View](fan/768-dark-2.png) | [View](fan/768-dark-3.png) |
| 390 × 844 / light | [View](fan/390-light-0.png) | [View](fan/390-light-1.png) | [View](fan/390-light-2.png) | [View](fan/390-light-3.png) |
| 390 × 844 / dark | [View](fan/390-dark-0.png) | [View](fan/390-dark-1.png) | [View](fan/390-dark-2.png) | [View](fan/390-dark-3.png) |

## Full-page comparison

These after images show the reduced-motion stacked fallback. Before images use the original landing components with the same local fonts, because Google Fonts was inaccessible. Development tooling is hidden; after images use the production build.

| Viewport | Light before / after | Dark before / after |
| --- | --- | --- |
| 1440 × 900 | [Before](before/1440-light.png) · [After](after/1440-light.png) | [Before](before/1440-dark.png) · [After](after/1440-dark.png) |
| 768 × 1024 | [Before](before/768-light.png) · [After](after/768-light.png) | [Before](before/768-dark.png) · [After](after/768-dark.png) |
| 390 × 844 | [Before](before/390-light.png) · [After](after/390-light.png) | [Before](before/390-dark.png) · [After](after/390-dark.png) |

## Verification

- Installation, typecheck, production build and diff checks pass. The repository has no lint or test scripts.
- All three viewport sizes in both themes: fan opens; each card grows and comes forward in order; caption position stays fixed; front-card content is not clipped; no horizontal overflow; the pinned sequence releases afterward. See fan-verification.jsonl.
- Reduced motion and JavaScript-disabled checks confirm all three cards remain readable without transforms or pinning.
- Axe WCAG A/AA checks, including text contrast, pass in both themes with no violations or incomplete checks. The stacked fallback exposes all three cards to the audit. See accessibility.jsonl.
- CTA destinations remain `#early-access`, `#how-it-works` and `/login`. Privacy, Terms and For agents work. Blog and authenticated flows require external credentials; those integrations remain untested here.

All content is illustrative. Confirm the console error, missing POST /api/checkout, stale useCallback diagnosis and dependency-list fix before presenting it as actual evidence. Fonts remain self-hosted with OFL licenses; no dependencies or lockfiles changed. Auth, routes, waitlist handlers and legal content are unchanged.

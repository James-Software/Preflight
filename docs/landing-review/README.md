# Scroll-driven evidence fan

The evidence step now shows three portrait cards instead of tabs: Screenshot, Console and Network. They unfold with Screenshot centered and unrotated, Console on the left, and Network on the right. Screenshot is also stacked above the other two, so the first expansion starts in place. Continued scrolling morphs the selected card from playing-card proportions into its own browser or tool-window dimensions. The browser targets a 960×600 desktop window (16:10), Console 640×300, and Network 720×360. On narrower screens the windows fit the available width and retain enough height for readable content, instead of filling the viewport. Other cards retain their playing-card proportions and move to the viewport edges. Reverse scrolling returns to the fan. No glow, tint or highlight marks the selected card. The heading stays anchored; the three cards share a fixed-height stage.

The browser, evidence, diagnosis and PR still form one centered pinned sequence. Evidence gets four scroll beats: fan opening, screenshot forward, console forward and network forward. The page releases after the PR. Native scrolling remains in place, and the floating site nav is hidden during the sequence.

Reduced motion, JavaScript-disabled browsers and short viewports show the three cards in natural document flow, fully readable without animation. The code/logs and browser frame are built as HTML rather than squeezing wide screenshots into narrow cards.

## Evidence sequence

| Viewport / theme | Fan opens | Browser window | Console window | Network window |
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
- All three viewport sizes in both themes: each card expands to its actual window dimensions; windows stay centered and inside the viewport; other cards park at the sides in playing-card proportions; reverse scrolling restores the fan; no clipped window content or horizontal document overflow. The initial screenshot placement is also checked. See balanced-verification.jsonl.
- Width, height and transform animate together over 700ms. The heading fades while a window is expanded so it stays out of the way. The pinned stage keeps its reserved height during the expansion.
- Reduced motion and JavaScript-disabled checks confirm all three cards remain readable without transforms or pinning.
- Axe WCAG A/AA checks, including text contrast, pass in both themes with no violations or incomplete checks. The stacked fallback exposes all three cards to the audit. See accessibility.jsonl.
- CTA destinations remain `#early-access`, `#how-it-works` and `/login`. Privacy, Terms and For agents work. Blog and authenticated flows require external credentials; those integrations remain untested here.

All content is illustrative. Confirm the console error, missing POST /api/checkout, stale useCallback diagnosis and dependency-list fix before presenting it as actual evidence. Fonts remain self-hosted with OFL licenses; no dependencies or lockfiles changed. Auth, routes, waitlist handlers and legal content are unchanged.

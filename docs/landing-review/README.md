# Scroll-driven evidence fan

The evidence step now shows three portrait cards instead of tabs: Screenshot, Console and Network. They unfold with Screenshot centered and unrotated, Console on the left, and Network on the right. Screenshot is also stacked above the other two, so the first expansion starts in place. Continued scrolling morphs the selected card from playing-card proportions into its own browser or tool-window dimensions. The browser targets a 960×600 desktop window (16:10), Console 640×300, and Network 720×360. On narrower screens the windows fit the available width and retain enough height for readable content, instead of filling the viewport. Other cards retain their playing-card proportions and move to the viewport edges. Reverse scrolling returns to the fan.

Each expanded evidence window has a dismissible agent overview that follows 16px above and to the right of the cursor. It clamps at the viewport edges and flips below when there is no room above. It keeps following when the pointer passes over the panel. There is no close button; Escape dismisses the overview. Touch input keeps a corner fallback. The icon is a local SVG rendition of the supplied robot reference (`public/agent-robot.svg`).

Agent summaries also appear on the opening checkout scene and the final fix scene. The final summary confirms the sample action with an animated checkmark on the robot and a green “Opened PR” receipt for #436, while leaving the merge decision with the user. The final scene’s PR caption also says “Opened PR”.

The browser, evidence, diagnosis and PR still form one centered pinned sequence. Evidence gets four scroll beats: fan opening, screenshot forward, console forward and network forward. The page releases after the PR. Wheel, trackpad, touch and keyboard input now remain native: no gesture is consumed, no input is prevented and no per-step lock is applied. The runway is longer (1000svh), giving each beat more scroll distance and making accidental skips less likely. After 260ms idle, the page settles only when already within 80px (or 10% of a viewport, whichever is smaller) of a beat center. The small settle happens without an ongoing page-scroll animation that could catch the next gesture. Movement between centers stays where the user left it; fresh input cancels pending settling. Snapping remains restricted to the pinned range and disabled during touch contact, reduced motion and short-viewport fallbacks. The floating site nav stays hidden during the sequence.

The hero cloud window now has a fixed rounded-rectangle outline in both WebGL and the CSS fallback. Only its interior clouds move; no edge displacement or border-radius morph runs. [WebGL view](fixed-cloud-window.png) · [CSS fallback](fixed-cloud-fallback.png).

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

## Opening and completed-action summaries

| Viewport / theme | Checkout issue | Opened PR |
| --- | --- | --- |
| 1440 × 900 / light | [View](pinned/1440-light-0.png) | [View](pinned/1440-light-3.png) |
| 1440 × 900 / dark | [View](pinned/1440-dark-0.png) | [View](pinned/1440-dark-3.png) |
| 768 × 1024 / light | [View](pinned/768-light-0.png) | [View](pinned/768-light-3.png) |
| 768 × 1024 / dark | [View](pinned/768-dark-0.png) | [View](pinned/768-dark-3.png) |
| 390 × 844 / light | [View](pinned/390-light-0.png) | [View](pinned/390-light-3.png) |
| 390 × 844 / dark | [View](pinned/390-dark-0.png) | [View](pinned/390-dark-3.png) |

## Full-page comparison

These after images show the reduced-motion stacked fallback. Before images use the original landing components with the same local fonts, because Google Fonts was inaccessible. Development tooling is hidden; after images use the production build.

| Viewport | Light before / after | Dark before / after |
| --- | --- | --- |
| 1440 × 900 | [Before](before/1440-light.png) · [After](after/1440-light.png) | [Before](before/1440-dark.png) · [After](after/1440-dark.png) |
| 768 × 1024 | [Before](before/768-light.png) · [After](after/768-light.png) | [Before](before/768-dark.png) · [After](after/768-dark.png) |
| 390 × 844 | [Before](before/390-light.png) · [After](after/390-light.png) | [Before](before/390-dark.png) · [After](after/390-dark.png) |

## Verification

- Current browser regression: `PREFLIGHT_TEST_URL=http://localhost:3000 npm run test:scroll` (with a local server and Chromium installed; set `CHROMIUM_PATH` if needed). Checks cover the fixed WebGL alpha mask while cloud colors change, a static fallback outline, continuous native wheel/touch/keyboard movement, deliberate fast/reverse scrolling, gentle proximity-only settling and interruption, unimpeded entry/exit, and reduced-motion/short-viewport/no-JavaScript fallbacks. [Current results](native-scroll-verification.jsonl). Earlier one-step gesture and nearest-beat checks below describe the superseded behavior.

- Installation, typecheck, production build and diff checks pass. The repository has no lint script; the subsequent site-wide UI fixes add regression checks through `npm test`.
- All three viewport sizes in both themes: each card expands to its actual window dimensions; windows stay centered and inside the viewport; other cards park at the sides in playing-card proportions; reverse scrolling restores the fan; no clipped window content or horizontal document overflow. The initial screenshot placement is also checked. See balanced-verification.jsonl.
- Width, height and transform animate together over 700ms. The heading fades while a window is expanded so it stays out of the way. The pinned stage keeps its reserved height during the expansion.
- Reduced motion and JavaScript-disabled checks confirm all three cards remain readable without transforms or pinning.
- Agent-tour checks at all three sizes in both themes verify continued tracking while the cursor enters the actual popup, summaries for the opening browser and all three evidence cards, the completed PR receipt/checkmark, Escape dismissal, and no popup after release. Mobile audits cover all five overview states in both themes with zero violations. See agent-tour-verification.jsonl.
- Cursor/theme/snap checks at all three sizes in both themes verify upper-right placement, edge clamping, keyboard dismissal, and actual theme-toggle changes on Console, Network, code and log surfaces. They also verify snapping inside the sequence, no snapping before/after it, and touch/reduced-motion fallbacks. See cursor-theme-snap-verification.jsonl.
- Console, Network, code, logs, metadata, removed/added lines and borders now use shared light/dark palette tokens instead of fixed dark colors. Parked edge previews remain decorative while a window is expanded; the stacked fallback restores all cards.
- Axe WCAG A/AA checks, including text contrast, pass in both themes with no violations or incomplete checks. The stacked fallback exposes all three cards to the audit. See accessibility.jsonl.
- CTA destinations remain `#early-access`, `#how-it-works` and `/login`. Privacy, Terms and For agents work. Blog and authenticated flows require external credentials; those integrations remain untested here.

All content is illustrative. Confirm the console error, missing POST /api/checkout, stale useCallback diagnosis and dependency-list fix before presenting it as actual evidence. Fonts remain self-hosted with OFL licenses; no dependencies or lockfiles changed. Auth, routes, waitlist handlers and legal content are unchanged.

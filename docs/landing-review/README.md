# Scroll-driven evidence fan

The evidence step now shows three portrait cards instead of tabs: Screenshot, Console and Network. They unfold with Screenshot centered and unrotated, Console on the left, and Network on the right. Screenshot is also stacked above the other two, so the first expansion starts in place. Continued scrolling morphs the selected card from playing-card proportions into its own browser or tool-window dimensions. The browser targets a 960×600 desktop window (16:10), Console 640×300, and Network 720×360. On narrower screens the windows fit the available width and retain enough height for readable content, instead of filling the viewport. Other cards retain their playing-card proportions and move to the viewport edges. Reverse scrolling returns to the fan.

Each expanded evidence window has a dismissible agent overview that follows 16px above and to the right of the cursor. It clamps at the viewport edges and flips below when there is no room above. It keeps following when the pointer passes over the panel. There is no close button; Escape dismisses the overview. Touch input keeps a corner fallback. The icon is a local SVG rendition of the supplied robot reference (`public/agent-robot.svg`).

Agent summaries also appear on the opening checkout scene and the final fix scene. The final summary confirms the sample action with an animated checkmark on the robot and a green “Opened PR” receipt for #436, while leaving the merge decision with the user. The final scene’s PR caption also says “Opened PR”.

The browser, evidence, diagnosis and PR still form one centered pinned sequence. Evidence gets four scroll beats: fan opening, screenshot forward, console forward and network forward. The page releases after the PR. Wheel, trackpad, touch and keyboard input now remain native: no gesture is consumed, no input is prevented and no per-step lock is applied. The runway is longer (1000svh), giving each beat more scroll distance and making accidental skips less likely. After 260ms idle, the page settles only when already within 80px (or 10% of a viewport, whichever is smaller) of a beat center. The small settle happens without an ongoing page-scroll animation that could catch the next gesture. Movement between centers stays where the user left it; fresh input cancels pending settling. Snapping remains restricted to the pinned range and disabled during touch contact, reduced motion and short-viewport fallbacks. The floating site nav stays hidden during the sequence.

The hero cloud window now has a fixed rounded-rectangle outline in both WebGL and the CSS fallback. It fills the space below the navigation with side gutters of `calc(8px + 0.5vw)`, an 8px bottom gutter and 12px corners, with no extra renderer insets. The blue primary buttons retain inset highlights but have no outer glow. [Earlier six viewport/theme checks](wide-cloud-verification.jsonl) cover the previous 8px side spacing; the [run setup review](../run-setup/README.md) verifies the additional 0.5vw on each side. Only its interior clouds move; no edge displacement or border-radius morph runs. WebGL view · CSS fallback.

Reduced motion, JavaScript-disabled browsers and short viewports show the three cards in natural document flow, fully readable without animation. The code/logs and browser frame are built as HTML rather than squeezing wide screenshots into narrow cards.

## Evidence sequence

| Viewport / theme | Fan opens | Browser window | Console window | Network window |
| --- | --- | --- | --- | --- |
| 1440 × 900 / light | View | View | View | View |
| 1440 × 900 / dark | View | View | View | View |
| 768 × 1024 / light | View | View | View | View |
| 768 × 1024 / dark | View | View | View | View |
| 390 × 844 / light | View | View | View | View |
| 390 × 844 / dark | View | View | View | View |

## Opening and completed-action summaries

| Viewport / theme | Checkout issue | Opened PR |
| --- | --- | --- |
| 1440 × 900 / light | View | View |
| 1440 × 900 / dark | View | View |
| 768 × 1024 / light | View | View |
| 768 × 1024 / dark | View | View |
| 390 × 844 / light | View | View |
| 390 × 844 / dark | View | View |

## Full-page comparison

These after images show the reduced-motion stacked fallback. Before images use the original landing components with the same local fonts, because Google Fonts was inaccessible. Development tooling is hidden; after images use the production build.

| Viewport | Light before / after | Dark before / after |
| --- | --- | --- |
| 1440 × 900 | Before · After | Before · After |
| 768 × 1024 | Before · After | Before · After |
| 390 × 844 | Before · After | Before · After |

## Verification

- The checkout walkthrough and its `test:scroll` regression were retired when the landing page switched to a single product overview. The scroll verification artifacts here document the earlier implementation; they do not describe the current landing page.

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

# Rehearsal: Preflight finding walkthrough

Gold: Stageshow `hero-demo`, copied before adaptation. Kept its pinned browser with bottom bleed, measured cursor targets, foreground result and held payoff. Replaced the dashboard annotation story with Preflight browser checks, an address-save failure, request evidence and a source diff. Compact uses an app detail sheet, rather than another desktop window.

Installed with `npx skills add benjitaylor/skills --skill stageshow --agent codex --yes`. Source: https://github.com/benjitaylor/skills. The installed skill lives in `.agents/skills/stageshow` (ignored as a local development tool); `skills-lock.json` records its source. The portable runtime and its license/notices live beside this component. Only required runtime modules are imported so unrelated phone and messaging styles do not ship.

Beats: completed run → selected failed check → screenshot and failed POST → proposed fix → held diff. Once in view; Replay begins a new story. The reduced-motion poster is the completed diff. All content is illustrative; no requests are sent to test an app or create a PR.

Captured: actual marketing page at 1280px and 390px, light and dark, reduced-motion posters; desktop and mobile native-clock contact sheets; marked opening, finding selection, evidence, fix press and held result. Evidence is in `/workspace/preflight-stageshow/` (outside the application). Final visual review frames: `last-review-{1280,390}-{light,dark}.png`. Mobile final marked states: `mobile-states-final.png`; desktop: `wide-states-final.png`.

Film results: desktop and mobile motion runs, marked-state sheets and mobile dark poster report `rehearsal passed` for the never-intentional gate. Native-clock coverage remains **inconclusive** because the headless browser missed sampling intervals; this is not a complete frame-by-frame approval. The checker also flags the intentionally nested screenshot inset relative to its parent tab, and half-pixel icon centering in title bars. Frames were reviewed rather than marking those elements to suppress the findings. No kit geometry was changed.

Review: independent fresh-eye reviewer found and then confirmed fixes for partial mobile background labels, the preview's missing logo, and inherited dark text. Final review returned no remaining composition findings across four actual-page posters and the final mobile dark capture.

Browser verification: Chromium `/usr/bin/chromium`, actual Next.js page, desktop and phone viewport emulation. No page errors or horizontal overflow. Replay restarts the scene; stopping during playback reaches the complete result; resizing switches to compact; reduced motion remains on the finished result after Replay. Existing suite: 260/260 passing. Typecheck and production build pass.

Capture notes: the separate Stageshow playground imports this exact component with the host font/tokens and serves the host public assets. Its recordings avoid the unrelated WebGL cloud hero and viewport-height feedback in the filming tool. Actual-page posters and interactions were checked separately. Local filming compatibility changes preserve the hero's measured height, recognize the kit-owned CSS layer in Next's bundled styles, and distinguish the recorder's pre-hydration data attribute warning from application errors.

Not checked: physical phones, Safari/Firefox, exhaustive 40–80ms press/transition coverage, hidden-tab/offscreen resume behavior, or deployed production. No deployment was requested or performed.

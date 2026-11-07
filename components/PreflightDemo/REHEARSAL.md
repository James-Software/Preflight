# Rehearsal: rebuilt Preflight landing demo

Gold: Stageshow `hero-demo`, originally copied before the first adaptation and re-filmed for this revision. Continued from that existing component and installed kit rather than adding another runtime. Kept measured cursor targets, a foreground finding surface, a bottom fade and a held payoff. Replaced the rebuilt landing page's static `LandingTestFlight` and removed its unused stylesheet rules.

Look: the rebuilt landing page's cream/navy surfaces, secondary text, status colors and Inter UI typography map to the kit tokens. Desktop is 1000 × 500; compact is 358 × 438, with a tighter crop, larger small text and an app sheet instead of a second desktop window. No caption or Show result control; Replay remains.

Beats: completed checks → select failed address save → screenshot and failed request → proposed source fix → held diff. About 11 seconds, once in view; Replay starts again. Reduced motion shows the finished fix. The demo never calls a testing service or creates a PR.

Captured: actual Next.js landing page at 1440, 768, 390 and 320px in light mode; 1440 and 390px in dark mode. Final stills and supporting artifacts are outside the repository at `/workspace/preflight-new-demo/`. Relevant frames: `section-1440-light.png`, `demo-{1440,390}-{light,dark}.png`, `demo-320-light.png`, `final-wide-film.png`, `final-mobile-states.png`, `final-mobile-dark.png` and `review-final-fix-slow.png`.

Film: wide motion, compact marked states and compact dark motion ended `rehearsal passed`. The final isolated playground imports this exact component with the host tokens and fonts, avoiding the unrelated WebGL hero. Actual-page playback was checked separately. Native motion scans remain inconclusive because of sampling gaps (recorded in the JSON reports), not a frame-by-frame approval. Remaining checker candidates concern the intentional inset of the screenshot inside its own bordered card and a slightly tighter evidence-note inset on desktop; no meaningful words are clipped. The host layout scan checked no supported controls and is inconclusive; Replay fit and focus were checked in the browser instead.

Fresh-eye review: initial findings were a tall compact browser, excess space below the fix, cramped mobile title-bar insets and overlapping outgoing/incoming text. Reduced the browser/panel heights, normalized title-bar spacing and separated the evidence fade-out from the patch entrance. Independent recheck of the four final themed stills, final wide film, compact states and a slowed 40–50ms fix transition returned nothing remaining.

Browser verification: Chromium `/usr/bin/chromium`, actual local Next.js page. Full story and mark order, evidence, final diff, Replay, toggling reduced motion, responsive resize and the completed poster after Replay passed at desktop light and mobile dark. Scoped axe WCAG A/AA checks found no violations. No page errors, horizontal overflow or mutation requests. Production build and all 262 tests passed. No new dependency or kit geometry change.

Not checked: physical phones, Safari/Firefox, exhaustive 40–80ms coverage of every beat, hidden-tab/offscreen resume, or the deployed production page. Git push is the requested delivery; no separate deployment command was run.

Source: https://github.com/benjitaylor/skills, installed locally at `.agents/skills/stageshow`; `skills-lock.json` records it. The runtime license/notices remain beside this component. Unrelated phone, messaging and other kit modules are not imported.

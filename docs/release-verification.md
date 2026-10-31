# Release verification

## Evidence recorded on October 31, 2026

The public source repository is [James-Software/Preflight](https://github.com/James-Software/Preflight).
The production application is [www.trypreflight.dev](https://www.trypreflight.dev).
Build and test status is independently visible in [GitHub Actions](https://github.com/James-Software/Preflight/actions).

Local verification passed 249 unit tests, TypeScript checking and a production
build. The integration suite exercises real Chromium and embedded Postgres,
including guest isolation, cookie encryption, OAuth transitions, action/network
restrictions, database persistence and source investigation. These tests do not
substitute for production provider verification.

The persistence test covers a broken signup, a working signup, a rejected signup
and a stale success toast. A confirmed persistence bug requires the submitted
unique marker, a newly displayed success message, a failed database expectation,
and the same failure in a fresh browser context with a new marker. Rejected input
and old notifications do not establish a persistence bug.

A redacted gitleaks scan of the complete available commit history found no
credentials after one exact fingerprint exclusion for ordinary prose. Production
npm dependency audit reported zero known vulnerabilities at the time checked.
This is evidence from specific checks, not a guarantee that no defects exist.

## Infrastructure and availability

The public landing page is generated statically. User navigation is restored by a
private session request after rendering. `/api/health` performs a bounded database
read and returns a degraded response on failure without revealing configuration.
The uptime workflow checks the public page and health endpoint every 15 minutes.
A new monitor provides future evidence; it does not establish historical uptime
or an SLA. Sub-second loading must be evaluated for a stated location, device,
network and metric rather than promised universally.

The live browser test identified Browserbase HTTP 402 refusing allocation. A
fallback uses isolated Vercel Sandbox VMs with outbound access denied; app requests
remain subject to the worker's existing pinned-address HTTP policy. The VM has no
production database, GitHub or model credentials. Authenticated CDP bridge tests
and blocked-egress tests passed in the cloud VM. Production run #29 completed the homepage check and confirmed the waitlist
persistence bug after two independent accepted submissions failed their database
expectations. Both fallback VMs closed afterward. A subsequent live run #30 finished
automatically as `done`, with one passed check, one confirmed finding, zero
unresolved checks and no failure reason. All four test VMs were independently
verified stopped in Vercel. The clean runtime was pinned to
a snapshot without expiration before test execution. The demo database still
contained zero records after the run.

A completion-count bug initially labeled this fully evaluated run partial. The
aggregation now counts a failed database assertion as a completed observation,
while unresolved browser checks and database/provider errors remain incomplete.
The saved run status was corrected only after checking all stored outcomes; the
underlying findings and observations were preserved.

## Performance measurement

A public HTTPS availability probe observed a 117 ms homepage response and 306 ms
health response from the cloud workspace. These are samples, not service-level
guarantees. Browser loading varies with location, network, GPU and device; measured
first-paint results must be reported with that context.

Five fresh, foreground Chromium contexts at 1440×1000 in the cloud workspace,
without network throttling, measured a median first contentful paint of **1,184 ms**
(range 1,148–1,676 ms) and median time to first byte of **196 ms** (137–572 ms).
The homepage paints static HTML before its optional WebGL initialization, but
these samples do **not** establish a strict sub-second full-page loading claim.
That acceptance criterion still needs representative-device optimization and
measurement. Reproduce with `node scripts/measure-public-load.cjs`; the dated
[sample data](/submission/performance.json) is public.

## Explicit remaining gates

The payment-account connection and genuine checkout/webhook verification are not
complete. Proposed prices and economics are documented assumptions. Judges are
not charged and no per-user run limits have been introduced.

A [3:09 product video](/videos/preflight-demo.mp4) shows the real deployed app,
private guest flow, confirmed run #29 and architecture. It is 1920×1080, with
synthetic technical narration, captions and a transcript. Waiting between chapters
is shortened; outcomes are not fabricated. Recording notes identify the voice
model and data-source license.

# Release verification

## Evidence recorded on October 31, 2026

The public source repository is [James-Software/Preflight](https://github.com/James-Software/Preflight).
The production application is [www.trypreflight.dev](https://www.trypreflight.dev).
Build and test status is independently visible in [GitHub Actions](https://github.com/James-Software/Preflight/actions).

Local verification passed 248 unit tests, TypeScript checking and a production
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
and blocked-egress tests passed in the cloud VM. End-to-end production fallback
verification remains a release gate until a real run completes.

## Explicit remaining gates

The payment-account connection and genuine checkout/webhook verification are not
complete. Proposed prices and economics are documented assumptions. Judges are
not charged and no per-user run limits have been introduced.

The required 2–5 minute product video must show actual execution. It is not
represented as complete before its recording and final playback checks.

# PreFlight — executive briefing

## Problem and customer

A web build can compile while a deployed user workflow still fails. A page may
announce success even though no record is saved. Manual release checks consume
developer time and are repeated inconsistently; source analysis alone cannot
prove what a deployed browser and database experienced.

The initial buyer is a founder or a 2–10-person web product team shipping frequently,
especially Next.js on Vercel with Neon or Supabase Postgres. Agencies maintaining
several such apps are a secondary cohort. Start with explicitly authorized
previews and disposable test accounts, not unrestricted production writes.

**Illustrative problem size, not market research:** five developers spending two
hours/week repeating release checks at an assumed loaded cost of $75/hour implies
$750/week, or $3,000 over four weeks. Saving 20% represents $600/month. These
inputs require customer validation; they are not measured PreFlight savings or a
market-size claim.

## Product and differentiation

PreFlight drives real browsers, records actions and relevant console/network
observations, checks configured database expectations and presents private
evidence. Source investigation pins the selected commit; source-only results are
labeled separately. Owners can request fix PRs and retain merge control.

The distinguishing workflow is **browser claim → independent data observation →
fresh-context reproduction → inspectable report**. The prepared waitlist app
clears an email and displays success without saving. A persistence finding requires
two accepted marked submissions that fail their configured SQL expectation. A
toast, missing prerequisite or model opinion alone is insufficient.

This complements scripted E2E tests and static analysis. It does not replace all
deterministic tests, security review or domain knowledge. Unsupported cases remain
explicit rather than being marked passed to improve a score.

## Implemented foundation

Public HTTPS deployment and GitHub source/history; real accounts and persistent
projects/runs/findings; isolated guest invitations; browser and SQL execution;
pinned-source review; private evidence; collaboration; cancellation; and
owner-controlled PR creation. Automated unit, type, build, integration, dependency
and secret-history checks provide repeatable validation.

Commercial pricing is proposed in the financial model. Payment-account activation
and verified checkout/webhooks are a separate launch gate; unimplemented billing
is not claimed as shipped.

## Distribution and validation

1. Recruit five design partners among independent SaaS developers and small
   agencies. Test known broken cases and working controls in disposable previews.
2. Publish the real execution video, architecture and reproducible test suite.
   Show actual accepted submissions and database evidence, not invented reports.
3. Use guest examples and GitHub onboarding to reduce activation friction, then
   offer founder-supported paid pilots once payment and costs are validated.
4. Test tutorials, integration partnerships and team referrals after reliability
   is established. This plan does not imply outreach already happened or customers
   have signed up.

Measure time to first completed run, completion rate, owner-accepted findings,
false positives and false negatives on controlled cases, time saved per release,
repeat use, paid conversion and retention. Raw finding counts are not a quality KPI.

## Scalability roadmap

**Next 30 days:** validate working/broken controls and provider failures, capture
latency/cost distributions, activate the payment account and interview partners.
Retain the no-quota judge pilot while monitoring shared provider capacity.

**30–90 days:** expand workflow coverage with isolation tests, improve replay
reliability, validate team billing and introduce spending controls only after an
explicit product decision. Revisit access and retention as usage expands.

**Beyond 90 days:** increase funded browser capacity, isolate high-volume
workloads, reduce unnecessary source/model transfer and validate enterprise needs
before promising SSO, SLAs or compliance certifications. Those are not shipped claims.

## Evidence versus assumptions

The founder reported $0.44 in OpenRouter and less than $0.01 in OpenAI charges
across 11 earlier swarms: under approximately $0.041/run for those model charges
alone. This excludes browsers, orchestration, hosting, database, sandbox, retries,
support and payment fees. It is not an audited unit-cost benchmark.

Repository code, release checks and the recorded execution provide technical
evidence. Conversion, willingness to pay, savings and retention remain hypotheses
until measured with customers.

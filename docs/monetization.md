# Commercial model and financial architecture

## Activation status

The judge pilot has no per-user run limits. Persistent run state and the existing
`credit_ledger` table do not establish a payment gateway. Stripe activation and a
verified checkout/webhook flow require the owner's payment account. Until that is
complete, prices below are a blueprint, not live billing claims.

## Proposed offer

| Offer | Proposed price | Customer | Value metric |
|---|---:|---|---|
| Judge/design-partner pilot | Free by invitation | Evaluators and partners | Reviewable test workflows |
| Starter | $19/month | Individual developer | Small recurring workflow allowance |
| Team | $79/month | Product team or agency | Shared projects and a larger allowance |
| Additional usage | After cost measurement | Variable release volumes | Clearly defined browser/agent usage credits |
| Enterprise | After discovery | Larger organizations | Contracted isolation, support and requirements |

Set allowances and credit conversion from measured cost percentiles before paid
launch. Runs vary in actions, minutes and retries; a run is not assumed to have a
fixed cost. SSO, an SLA and compliance certification are not represented as shipped.

## Payment architecture to activate

Use Stripe-hosted Checkout so card details never enter PreFlight. Server-side
checkout must use allowlisted price IDs and the authenticated account. A client
price or owner ID cannot authorize a purchase or credit grant.

Verify signatures against raw webhook bodies, deduplicate events, validate account,
amount, currency and product mapping, and update entitlement/ledger state atomically.
A success redirect alone must not grant credits. Delayed payments, refunds and
subscription changes require explicit handling. Use the customer portal for
billing management. Guests must never charge the sponsor's payment account.

The pilot's no-limit preference remains in force. Checkout activation does not
authorize per-user run quotas or silently charging current judges. Paid gating
and overage rules need a separate product decision.

## Illustrative unit economics

This scenario is not actual revenue, cost or customer data.

| Team-plan monthly assumption | Amount |
|---|---:|
| Revenue/account | $79.00 |
| Models and retries | $5.00 |
| Cloud browsers | $12.00 |
| Worker, hosting, database and sandbox allocation | $6.00 |
| Payment-fee allowance | $3.00 |
| Variable support allocation | $5.00 |
| Total assumed variable cost | $31.00 |
| Contribution | $48.00 (60.8%) |

A 50% contribution target permits $39.50 variable cost, leaving $8.50 of headroom
in this scenario. Doubling browser cost to $24 drops contribution to $36, or 45.6%,
below target. A 70% margin would require cost at or below $23.70, which this model
does not achieve. Measure browser minutes, retries and support; model charges alone
are not the full cost of a run.

Assuming $120 acquisition cost and $48 monthly contribution implies 2.5-month
payback. At assumed 5% monthly churn, a simple 20-month lifetime gives $960
contribution LTV, or 8× CAC. At 10% churn LTV falls to $480. These assumptions omit
fixed costs, taxes and financing and are unsupported by real cohorts so far.
They must not be presented as validated traction or certain forecasts.

## Measurement and release gates

Track browser minutes, model usage/currency where returned, worker and sandbox
duration, storage, retries and support. Reconcile provider invoices with per-run
estimates and report p50/p95 costs and duration. Measure activation, checkout
conversion, revenue retention, refunds, support and CAC by channel. Define a
customer-understandable billable unit before selling credits.

Before paid launch: activate the owner-controlled Stripe account; execute genuine
test-mode checkout and signed webhooks; verify duplicate delivery, entitlements
and refund handling; review receipt/tax settings; publish exact prices and
cancellation terms; and validate representative workload costs. A mocked payment
or pricing page is not sufficient evidence.

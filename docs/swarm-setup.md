# Swarm deployment and model credentials

The web app and Trigger.dev workers are separate deployments. Updating Vercel's environment variables does not populate the workers' environment, and updating a variable requires a new deployment of the affected app/worker.

## Web app → worker routing

Use the Trigger.dev project in `trigger.config.ts` (`proj_ljxajhpzdvjlpkplggit`). In that project's dashboard, confirm `run-swarm`, `generate-test-plan` and `browser-agent` are deployed in the environment you intend to use.

| Web app | Vercel/server variable | Required Trigger.dev deployment |
| --- | --- | --- |
| Live production site | `TRIGGER_SECRET_KEY`: this project's **Production** key (`tr_prod_…`), scoped to Vercel Production | Production tasks |
| Vercel preview | `TRIGGER_SECRET_KEY`: this project's **Preview** key (`tr_preview_…`), scoped to Vercel Preview | Tasks deployed for the same branch as `VERCEL_GIT_COMMIT_REF`; `TRIGGER_PREVIEW_BRANCH` can explicitly select another deployed preview branch |
| Local development | `TRIGGER_SECRET_KEY`: this project's **Development** key (`tr_dev_…`) | Running Trigger.dev development worker; optional `TRIGGER_DEV_BRANCH` selects a named dev branch, while empty/`default` selects the root dev environment |

The SDK can infer a worker branch from `VERCEL_GIT_COMMIT_REF`. PreFlight now passes explicit, per-request routing: Production has no worker branch; Development uses only `TRIGGER_DEV_BRANCH`; Preview uses the explicit preview branch or the Vercel branch. It does not change the SDK's global configuration or silently send a failed preview request to Production.

**“No matching branch env”** means Trigger.dev could not resolve the requested worker branch. It occurs before any browser session or model request starts. It is unrelated to the target repository's default branch, the project's App URL, or model keys.

For the live site, copy the Production key from the Trigger.dev project into Vercel's **Production** `TRIGGER_SECRET_KEY`, remove stale preview-only settings from the Production scope, and redeploy Vercel. Confirm a successful Production worker deployment in Trigger.dev. For a preview, deploy the matching worker branch and use the Preview key. Do not replace a preview key with a Production key merely to bypass a missing preview environment: they can have different databases and credentials.

`/api/health/keys` is admin-only. Its Trigger check validates configuration without starting a task; it does not prove a worker deployment exists or is healthy.

## Worker credentials

Set these in the **matching Trigger.dev environment**, then deploy the workers:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Read/write projects, plans, run status, agents and findings in Neon/Postgres. It must match the web app's intended database. |
| `OPENAI_API_KEY` | Authenticate the default judge directly to OpenAI's Decisions API. The key/project must have access to the endpoint and `gpt-6-luna`. Worker-only; never a `NEXT_PUBLIC_` variable. |
| `OPENROUTER_API_KEY` | Authenticate the browser driver to OpenRouter. Requires access and sufficient credit for the configured driver model. |
| `BROWSERBASE_API_KEY` | Start and close real cloud-browser sessions. |
| `BROWSERBASE_PROJECT_ID` | Select the Browserbase project when required by the account. |
| `BLOB_READ_WRITE_TOKEN` | Upload finding screenshots to Vercel Blob. Without it screenshot upload fails; other finding data can still be recorded. |

## OpenAI Decisions setup

The default judge now calls `POST https://api.openai.com/v1/decisions` directly, authenticated with a regular OpenAI API key in `OPENAI_API_KEY`. It does not send that key to OpenRouter. The contract is verified against the [official OpenAI SDK source](https://github.com/openai/openai-node/blob/21a056dc61ceca96aceda58a845353b3c1b13efc/src/resources/decisions.ts) and [official API schema](https://github.com/openai/openai-openapi/blob/master/openapi.yaml), checked October 23, 2026. The current contract supports only `gpt-6-luna` for Decisions.

In Trigger.dev, select the worker environment matching the web app's key (Production for the live site). Add the private OpenAI key as `OPENAI_API_KEY`. Remove old judge overrides or set these explicitly:

```dotenv
JUDGE_PROVIDER=openai-decisions
JUDGE_MODEL=gpt-6-luna
```

Retain `OPENROUTER_API_KEY` for the browser driver. Its default is still `openai/gpt-5.6-luna`; `DRIVER_MODEL` can override it. The judge's direct OpenAI model ID has no `openai/` prefix. Deploy the workers with the code change after adding the environment variables. Do not paste keys into chat or commit them. A key being present does not prove account/model access; an authorized live run is required to verify that.

Each step sends one named `predicate` question and reads its probability: `p >= 0.5` is pass, otherwise fail. Confidence is the probability of the selected verdict (`max(p, 1-p)`). Bug triage sends one named `choice` question with low, medium, high and critical options, preserving OpenAI's returned confidence. API requests use `{model, input, questions: [...]}`; responses contain an ordered `answers` array. This is a separate contract from the old OpenRouter alpha adapter's `state`/question-map format.

Missing/invalid worker configuration fails the parent run before planning or browser allocation. Refusals, missing/malformed answers and API failures cannot become passes or completed agent runs. Responses are bounded by a 20-second timeout per attempt; 429/5xx responses retry up to three attempts. Authentication errors do not retry. Raw provider error bodies are not included in errors because they may echo private input. The parent checks failed child-task results before marking the swarm complete.

The judge answers two bounded questions: “Did this test step succeed?” and “How severe is this finding?” The browser driver chooses clicks, fills and navigation. Decisions evaluates recorded actions and console/network observations. Current pricing and total-run savings are not established by the API schema, so the implementation makes no cost guarantee.

An explicit chat fallback remains available with `JUDGE_PROVIDER=openrouter-chat` and `JUDGE_MODEL=openai/gpt-4o-mini`; this uses `OPENROUTER_API_KEY`. The legacy `openrouter-decisions` adapter is retained for compatibility but is unverified and is not the OpenAI integration. No automatic provider fallback occurs when an OpenAI request fails.

Regression tests verify the documented request/response contract, endpoint and key separation, probability/choice parsing, invalid answers/refusals, retries, credential validation, and child-to-parent failure propagation. External responses are mocked; the tests do not spend credits or verify the user's key. The web app's `/api/health/keys` checks do not validate worker-only credentials. Live verification requires the configured worker deployment and an authorized test run.

## Runner failures versus application findings

A driver error such as `Unexpected non-whitespace character after JSON` is an internal model-response parsing failure, not evidence that the target route is broken. The driver now requests strict `json_schema` output, routes only to providers supporting the requested parameters, and allows one repair attempt. Repeated invalid JSON or unusable actions fail the browser agent before judging or creating a finding for that step. The parent already propagates failed child tasks to a failed run. A run cannot silently complete after exhausting the step or overall action budget.

Driver history, judge observations and finding reproduction/console/network evidence are scoped to the current step. Initial navigation evidence remains available for the first step. The judge also receives the current URL and a bounded accessibility snapshot of the final page, rather than relying only on the driver's action descriptions.

Regression coverage reproduces the reported login → `/terms` sequence and verifies that a parsing failure produces no `/terms` finding or severity request. Other checks cover structured-output routing, one repair attempt, concatenated responses, invalid action fields, genuine findings, isolated per-step evidence, action budgets and cloud-session cleanup. A local production build renders `/terms` with HTTP 200 and no page errors at desktop/phone sizes in both themes. The live domain could not be independently fetched from this workspace because its network proxy rejected the request; this does not establish the deployed route's health. No paid swarm was launched for verification. Deploy the updated workers before retrying a real run.

## Saved authentication profiles

Set the same **PROFILE_ENCRYPTION_KEY** (base64-encoded 32 random bytes) in Vercel
and the matching Trigger.dev worker environment, then deploy both. Generate it
locally with `openssl rand -base64 32`; keep it private and stable. The profile UI
will report unavailable storage until configured. Public runs still work without
this key. `/dashboard/profiles` stores encrypted cookie/local-storage/header
profiles. The Run swarm panel chooses a profile and resolves the selected branch
or PR deployment. See [authentication profiles](authenticated-testing.md) for
supported formats, deployment resolution, origin scoping and verification limits.

## GitHub connection renewal

GitHub access/refresh credentials now live encrypted in `github_connections` and
renew on the web server before access expiry. This uses existing Vercel
**AUTH_SECRET**, **AUTH_GITHUB_ID** and **AUTH_GITHUB_SECRET**; no worker variable
is needed. Legacy sessions may make one automatic GitHub round trip because their
refresh token was previously discarded. Run setup preserves the chosen target and
profile. See [renewal behavior and verification](github-session-renewal/README.md).

## Customer database verification

Connect a project's read-only PostgreSQL URL in its **Database verification**
settings; do not replace PreFlight's own `DATABASE_URL`. Configure a browser
workflow/button and a scalar SELECT expectation, then enable database checks in
Run swarm. The existing **PROFILE_ENCRYPTION_KEY** must match in Vercel and
Trigger.dev. Deploy the web app and workers together; `pg` is kept external in
the Trigger build. The web server and workers both need network access to the
customer DB. See [setup, boundaries and verification](database-verification/README.md).

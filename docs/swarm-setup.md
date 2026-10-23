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
| `OPENROUTER_API_KEY` | Authenticate both the browser driver and the current judge to OpenRouter. Requires access and sufficient credit for the configured models. |
| `BROWSERBASE_API_KEY` | Start and close real cloud-browser sessions. |
| `BROWSERBASE_PROJECT_ID` | Select the Browserbase project when required by the account. |
| `BLOB_READ_WRITE_TOKEN` | Upload finding screenshots to Vercel Blob. Without it screenshot upload fails; other finding data can still be recorded. |

Optional model overrides: `DRIVER_MODEL`, `JUDGE_MODEL`, `JUDGE_PROVIDER`. The actual defaults live in `lib/model-config.ts`: driver `openai/gpt-5.6-luna`, judge `openai/gpt-4o-mini`, both using OpenRouter chat completions. Provider/model availability is a separate live check; these defaults are not proof of account access.

## Is the Decisions API connected?

There is an **optional, unverified adapter** in `lib/models.ts`. It is selected only with `JUDGE_PROVIDER=openrouter-decisions`. The default is `openrouter-chat`, so Decisions is not needed to run a swarm. An OpenAI-hosted Decisions endpoint or separate OpenAI Decisions key is not configured anywhere in this code.

The optional adapter targets `https://openrouter.ai/api/alpha/decisions` for Jev/TypeSafe decisions and authenticates with the same `OPENROUTER_API_KEY`. The originally planned model/access was not verified; the configuration intentionally keeps the chat judge as the default. Do not enable the adapter without confirming the provider's current endpoint, model, request/response schema and your account's access. Setting a separate Decisions key in Trigger.dev would not activate it.

The judge answers two bounded questions: “Did this test step succeed?” and “How severe is this finding?” The browser driver chooses the next click/fill/navigation action; the judge evaluates the recorded actions and console/network observations. A specialized decisions service could eventually replace those chat requests with typed verdicts. That is an optional implementation choice, not a requirement for testing an app, and its cost or reliability benefit has not been measured here.

Local regression tests mock external responses and verify worker-routing headers against the installed Trigger SDK and the default judge's OpenRouter request. They do not enqueue paid swarms or verify production credentials. Live verification requires deploying the configured workers and starting an authorized test run.

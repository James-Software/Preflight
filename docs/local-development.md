# Reproducing PreFlight

## Local verification without cloud secrets

```sh
nvm use
npm ci
npx playwright-core install --with-deps chromium
npm test
npm run typecheck
npm run build
npm run test:integration
```

Use Node.js 24. PGlite and the official MCP test client are declared development
dependencies. The browser helper chooses `CHROMIUM_PATH`, system Chromium when
available, or Playwright's installed browser. Fixtures use disposable local
databases, HTTP servers and browsers; no production Neon, customer credentials,
paid models, mail or real PR writes are involved.

The persistence suite executes the production worker against broken persistence,
working persistence, rejected inputs and a stale success message. Only the broken,
accepted case produces a finding after independent replay. Other suites cover
guest switching/isolation, shared access, cancellation, public-network boundaries,
private evidence and durable retirement. External provider boundaries are
controlled fixtures and are labeled as such.

## Web app

Copy `.env.example` to `.env.local`. Use your own **development Neon branch** and
GitHub OAuth app. Set `NEXT_PUBLIC_APP_URL` and `AUTH_URL` to
`http://localhost:3000`, and the GitHub callback to
`http://localhost:3000/api/auth/callback/github`. Configure web variables from the
root README, then run `npm run dev`.

`lib/schema.ts` initializes active tables on first use. The Supabase scaffold is
legacy, not current app auth/storage. The default owner is in `lib/access.ts`;
update it for your fork. Public pages build without live secrets; authenticated
database operations need their corresponding configuration.

## Complete cloud path

Cloud browsers cannot reach localhost. Deploy a public preview with your own Neon
development branch and Trigger project. Set the same public `NEXT_PUBLIC_APP_URL`,
application database and stable `PROFILE_ENCRYPTION_KEY` in web and worker
environments. Web handles GitHub/Auth.js credentials; workers get their model and
browser credentials. Source/regression work uses the signed web broker, and no
production credentials enter generated tests or disposable sandboxes.

Set your project in `trigger.config.ts`, deploy tasks and follow
`docs/swarm-setup.md` for worker environment routing. Use authorized app URLs,
disposable accounts and database branches. Local/private targets remain blocked;
do not disable the guard to work around provider networking.

To issue a guest invitation for your own deployment, store a random 32-byte
base64url code's SHA-256 hash in `guest_demo_links` with the authorized template
project and expiry. Share the raw capability separately. Do not copy the live
PreFlight invitation into public source, documentation or recordings.

require("node:module").registerHooks({
  resolve(specifier, context, next) {
    return next(
      /^next\/(server|headers|navigation)$/.test(specifier)
        ? specifier + ".js"
        : specifier,
      context,
    );
  },
});
const assert = require("node:assert/strict"),
  { randomBytes, randomUUID } = require("node:crypto");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const { load } = require("./load-module.cjs");
const { NextRequest } = require("next/server");
(async () => {
  process.env.PROFILE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.AUTH_SECRET = randomBytes(32).toString("base64");
  const jwt = await import("next-auth/jwt");
  const db = new PGlite();
  const sql = async (parts, ...v) => {
    let q = parts[0];
    v.forEach((_, i) => (q += `$${i + 1}` + parts[i + 1]));
    return (await db.query(q, v)).rows;
  };
  const deps = { "@/lib/db": { getSql: () => sql } },
    schema = load("lib/schema.ts", deps),
    state = load("lib/auth-profile-state.ts", {});
  const issuerBoundary = {};
  const profiles = load("lib/auth-profiles.ts", {
    "@/lib/test-user-issuer": issuerBoundary,
    ...deps,
    "@/lib/schema": schema,
    "@/lib/auth-profile-state": state,
  });
  const gen = load("lib/profile-generation.ts", {
    ...deps,
    "@/lib/schema": schema,
    "@/lib/auth-profile-state": state,
    "@/lib/auth-profiles": profiles,
  });
  const site = { SITE_URL: "https://www.trypreflight.dev" };
  const issuer = load("lib/test-user-issuer.ts", {
    ...deps,
    "@/lib/schema": schema,
    "@/lib/auth-profile-state": state,
    "@/lib/profile-generation": gen,
    "@/lib/site": site,
    "next-auth/jwt": jwt,
  });
  Object.assign(issuerBoundary, issuer);
  const route = load("app/api/profiles/issue/route.ts", {
    "@/lib/test-user-issuer": issuer,
  });
  let callbacks, authConfig;
  load("auth.ts", {
    "next-auth": {
      default: (c) => {
        callbacks = c.callbacks;
        authConfig = c;
        return {};
      },
    },
    "next-auth/providers/github": await import("next-auth/providers/github"),
    "next/headers": {},
    "next-auth/jwt": jwt,
    "@/lib/test-user-issuer": issuer,
    "@/lib/github-credentials": {},
    "@/lib/access": {},
    "@/lib/invites": {},
  });
  try {
    const project = await schema.createProject(
      "real-owner",
      site.SITE_URL,
      "James-Software/Preflight",
    );
    const capture = await gen.startProfileGeneration(
        "real-owner",
        project.id,
        {},
      ),
      workToken = randomUUID();
    await sql`UPDATE profile_captures SET automation_status='running',automation_token=${workToken}::uuid WHERE id=${capture.id}::uuid`;
    const input = {
      captureId: capture.id,
      owner: "real-owner",
      projectId: project.id,
      workToken,
      timestamp: Date.now(),
    };
    const req = (data, signed = true) => {
      const body = JSON.stringify(data);
      return new NextRequest(site.SITE_URL + "/api/profiles/issue", {
        method: "POST",
        headers: {
          "x-preflight-issuer-signature": signed
            ? issuer.signTestUserRequest(body)
            : "",
          "content-type": "application/json",
        },
        body,
      });
    };
    assert.equal((await route.POST(req(input, false))).status, 403);
    for (const patch of [
      { owner: "other" },
      { projectId: 999 },
      { workToken: randomUUID() },
      { timestamp: Date.now() - 120000 },
    ])
      assert.equal((await route.POST(req({ ...input, ...patch }))).status, 403);
    assert.equal((await db.query("SELECT * FROM test_users")).rows.length, 0);
    const response = await route.POST(req(input));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const authentication = (await response.json()).state;
    const decoded = await jwt.decode({
      token: authentication.cookies[0].value,
      secret: process.env.AUTH_SECRET,
      salt: issuer.TEST_USER_COOKIE,
    });
    assert.equal(decoded.sub, "test:" + capture.id);
    assert.equal(decoded.preflightTestIdentity, true);
    assert.equal(decoded.githubLogin, undefined);
    assert.equal(await issuer.validateTestUserSession(decoded.sub), true);
    const checked = await callbacks.jwt({
      token: {
        ...decoded,
        githubLogin: "james-software",
        githubAccessToken: "never-delegate",
      },
    });
    assert.equal(checked.githubLogin, undefined);
    assert.equal(checked.githubAccessToken, undefined);
    const session = await callbacks.session({
      session: { user: { name: decoded.name, email: decoded.email } },
      token: checked,
    });
    assert.equal(session.user.githubId, decoded.sub);
    assert.equal(session.user.githubLogin, undefined);
    assert.equal(await schema.getProject(project.id, decoded.sub), null);
    let githubReads = 0;
    const github = load("lib/github.ts", {
      "next-auth/jwt": { getToken: async () => decoded },
      "@/lib/github-credentials": {
        loadGithubCredentials: async () => {
          githubReads++;
          throw new Error("must not borrow credentials");
        },
        GithubReconnectRequired: class extends Error {},
      },
    });
    assert.equal(await github.getGithubContext(req(input)), null);
    assert.equal(githubReads, 0);
    await route.POST(req(input));
    assert.equal((await db.query("SELECT * FROM test_users")).rows.length, 1);
    console.log(
      JSON.stringify({
        actualPostgresWasm: true,
        realAuthJsJwe: true,
        unsignedAndForeignGrantsRejected: true,
        expiredSignatureRejected: true,
        databaseTestUserCreated: true,
        identityIsolatedFromOwner: true,
        noAdminLogin: true,
        noGithubCredentialDelegation: true,
        issuerRetryNoDuplicateUser: true,
      }),
    );
    const saved = await profiles.createAuthProfile(
      "real-owner",
      {
        name: "Test",
        origin: site.SITE_URL,
        session: JSON.stringify(authentication),
        headers: "{}",
        verificationPath: "/api/auth/session",
      },
      project.id,
    );
    await sql`UPDATE auth_profiles SET source_capture_id=${capture.id}::uuid WHERE id=${saved.id}`;
    await sql`UPDATE profile_captures SET status='completed' WHERE id=${capture.id}::uuid`;
    assert.equal(await issuer.validateTestUserSession(decoded.sub), true);
    await profiles.revokeAuthProfile("real-owner", saved.id, project.id);
    assert.equal(await issuer.validateTestUserSession(decoded.sub), false);
    assert.equal(await callbacks.jwt({ token: decoded }), null);
    const normal = { sub: "real-owner", githubLogin: "james-software" };
    assert.deepEqual(await callbacks.jwt({ token: normal }), normal);
    console.log(
      JSON.stringify({
        sessionRemainsValidAfterProfileSave: true,
        profileRevocationInvalidatesTestSession: true,
        normalGithubSessionsUnchanged: true,
      }),
    );
    // Exercise hostname migration and the real worker/issuer/session pipeline.
    const config = load("lib/database-check-config.ts", {});
    const connections = load("lib/database-connections.ts", {
      ...deps,
      "@/lib/schema": schema,
      "@/lib/auth-profile-state": state,
      "@/lib/database-check-config": config,
      "@/lib/postgres-verification": {
        parsePostgresUrl: () => ({}),
        postgresReader: async () => ({
          read: async () => [],
          close: async () => {},
        }),
      },
    });
    const generation = load("lib/profile-generation.ts", {
      ...deps,
      "@/lib/schema": schema,
      "@/lib/auth-profile-state": state,
      "@/lib/auth-profiles": profiles,
      "@/lib/database-connections": connections,
    });
    const self = await schema.createProject(
      "real-owner",
      "https://trypreflight.dev/dashboard",
      "James-Software/Preflight",
    );
    const connectionString =
      "postgresql://synthetic:synthetic@db.example.test/preflight";
    await connections.saveProjectDatabase(self.id, "real-owner", {
      origin: "https://trypreflight.dev",
      connectionString,
      checks: [],
    });
    const before = await connections.databaseForRun(
      self.id,
      "real-owner",
      "https://trypreflight.dev",
    );
    const oldRun = await schema.createRun(self.id, "https://trypreflight.dev", {
      database: before,
    });
    const auto = await generation.startProfileGeneration(
      "real-owner",
      self.id,
      {},
    );
    assert.equal(
      (
        await db.query("SELECT origin FROM profile_captures WHERE id=$1", [
          auto.id,
        ])
      ).rows[0].origin,
      site.SITE_URL,
    );
    assert.equal(
      (await schema.getProject(self.id, "real-owner")).app_url,
      site.SITE_URL + "/dashboard",
    );
    assert.equal(
      await connections.profileProvisioningDatabase(
        "real-owner",
        self.id,
        site.SITE_URL,
      ),
      connectionString,
    );
    assert.equal(
      (await connections.runDatabaseConfig(oldRun.id)).connectionString,
      connectionString,
    );
    await sql`UPDATE profile_captures SET automation_github_grant='synthetic-grant' WHERE id=${auto.id}::uuid`;
    const source = load("lib/profile-provisioning.ts", {
      "@/lib/github": {},
      "@/lib/auth-profile-state": state,
      "@/lib/database-provider-accounts": {},
      "@/lib/database-provider-api": {},
    });
    let wrongDatabase = false,
      issuerCalls = 0,
      sessionCalls = 0;
    const pg = {
      query: async (q, values) => {
        const text = typeof q === "string" ? q : q.text,
          params = typeof q === "string" ? values : q.values;
        if (wrongDatabase && text.startsWith("SELECT automation_token"))
          return { rows: [{ token: randomUUID() }] };
        return db.query(text, params);
      },
      end: async () => {},
    };
    const worker = load("src/trigger/generate-auth-profile.ts", {
      ...deps,
      "@trigger.dev/sdk": { task: (x) => x },
      "@/lib/schema": schema,
      "@/lib/auth-profiles": profiles,
      "@/lib/auth-profile-state": state,
      "@/lib/profile-generation": generation,
      "@/lib/fix-github-grant": { openFixGithubGrant: () => ({}) },
      "@/lib/database-connections": connections,
      "@/lib/postgres-verification": { postgresClient: async () => pg },
      "@/lib/profile-provisioning": {
        ...source,
        inspectAuthSource: async () => ({
          sha: "immutable-current-source",
          files: {
            "auth.ts": require("node:fs").readFileSync(
              require("node:path").join(__dirname, "..", "auth.ts"),
              "utf8",
            ),
          },
        }),
      },
      "@/lib/database-check-config": config,
      "@/lib/test-user-issuer": issuer,
      "@/lib/site": site,
    }).generateAuthProfile;
    const actualAuth = (await import("next-auth")).default({
      ...authConfig,
      trustHost: true,
      secret: process.env.AUTH_SECRET,
    });
    const realFetch = global.fetch;
    const renewalRoute = load("app/api/profiles/renew/route.ts", {
      "@/lib/test-user-issuer": issuer,
    });
    global.fetch = async (url, init) => {
      if (new URL(url).pathname === "/api/profiles/renew")
        return renewalRoute.POST(new NextRequest(String(url), init));
      const path = new URL(url).pathname;
      if (path === "/api/profiles/issue") {
        issuerCalls++;
        return route.POST(new NextRequest(String(url), init));
      }
      assert.equal(path, "/api/auth/session");
      sessionCalls++;
      return actualAuth.handlers.GET(
        new NextRequest(String(url), { headers: init.headers }),
      );
    };
    try {
      assert.equal(
        (
          await worker.run({
            owner: "real-owner",
            projectId: self.id,
            captureId: auto.id,
          })
        ).status,
        "completed",
      );
      assert.equal(issuerCalls, 1);
      assert.equal(sessionCalls, 1);
      const generated = await generation.getProfileGeneration(
        "real-owner",
        self.id,
        auto.id,
      );
      assert.equal(generated.status, "completed");
      assert.equal(generated.profile.origin, site.SITE_URL);
      assert.equal(generated.profile.verification_path, "/dashboard");
      const record = (
        await db.query("SELECT * FROM auth_profiles WHERE id=$1", [
          generated.profile.id,
        ])
      ).rows[0];
      const stored = state.decryptProfile(
        record.encrypted_state,
        "real-owner",
        site.SITE_URL,
      );
      const minted = await jwt.decode({
        token: stored.cookies[0].value,
        secret: process.env.AUTH_SECRET,
        salt: issuer.TEST_USER_COOKIE,
      });
      assert.equal(minted.sub, "test:" + auto.id);
      assert.equal(await issuer.validateTestUserSession(minted.sub), true);
      assert.equal(
        (
          await worker.run({
            owner: "real-owner",
            projectId: self.id,
            captureId: auto.id,
          })
        ).status,
        "unavailable",
      );
      const workspace = load("lib/test-workspace.ts", {
        ...deps,
        "@/lib/test-user-issuer": issuer,
        "@/lib/auth-profile-state": state,
        "@/lib/site": site,
      });
      const snapshot = await profiles.profileForRun(
        "real-owner",
        generated.profile.id,
        site.SITE_URL,
        self.id,
      );
      const database = await connections.databaseForRun(
        self.id,
        "real-owner",
        site.SITE_URL,
      );
      const run = await schema.createRun(self.id, site.SITE_URL, {
        profile: snapshot,
        database,
      });
      const verificationClient = {
        query: async (q, values) => {
          const text = typeof q === "string" ? q : q.text,
            params = typeof q === "string" ? values : q.values;
          // PGlite has one connection for both the app writer and the reader.
          // The real reader opens its own read-only connection; this fixture
          // preserves observeRecords' actual BEGIN READ ONLY transactions.
          if (text === "SET default_transaction_read_only = on")
            return { rows: [] };
          return db.query(text, params);
        },
        end: async () => {},
      };
      const records = load("lib/database-records.ts", {
        "@/lib/database-check-config": config,
      });
      const automatic = load("lib/automatic-database.ts", {
        ...deps,
        "@/lib/database-check-config": config,
        "@/lib/database-connections": connections,
        "@/lib/postgres-verification": {
          postgresClient: async () => verificationClient,
        },
        "@/lib/database-records": records,
      });
      const verifier = await automatic.automaticDatabase(run.id, 0, 0);
      assert.equal(verifier.supported, true);
      const beforeCreate = await verifier.before();
      let formType = function TestForm() {};
      const requestAuth = async () => {
        const response = await actualAuth.handlers.GET(
          new NextRequest(site.SITE_URL + "/api/auth/session", {
            headers: {
              cookie: issuer.TEST_USER_COOKIE + "=" + stored.cookies[0].value,
            },
          }),
        );
        return response.json();
      };
      const projectPage = load("app/dashboard/projects/new/page.tsx", {
        "@/auth": { auth: requestAuth },
        "next/navigation": {
          redirect: (url) => {
            throw Object.assign(new Error("redirect"), { destination: url });
          },
        },
        "@/lib/schema": schema,
        "@/lib/test-workspace": workspace,
        "@/lib/auth-profile-state": state,
        "@/components/NewProjectForm": { default: formType },
      });
      const tree = await projectPage.default({
        searchParams: Promise.resolve({}),
      });
      const findForm = (node) =>
        Array.isArray(node)
          ? node.map(findForm).find(Boolean)
          : node && typeof node === "object"
            ? node.type === formType
              ? node.props
              : findForm(node.props?.children)
            : null;
      const form = findForm(tree);
      assert.equal(form.testAccount, true);
      const data = new FormData();
      data.set("name", verifier.marker);
      data.set("repo", "someone-else/private-repo");
      let destination;
      try {
        await form.action(null, data);
      } catch (error) {
        destination = error.destination;
      }
      assert.match(destination, /^\/dashboard\/projects\/\d+$/);
      const createdId = Number(destination.split("/").at(-1));
      const created = await schema.getProject(createdId, minted.sub);
      assert.equal(created.display_name, verifier.marker);
      assert.equal(created.owner_github_id, minted.sub);
      assert.equal(created.repo_full_name, "James-Software/Preflight");
      assert.equal(await schema.getProject(createdId, "real-owner"), null);
      assert.equal(
        (await verifier.after(beforeCreate, "Create project")).passed,
        true,
      );
      const checks = (
        await db.query("SELECT * FROM run_database_checks WHERE run_id=$1", [
          run.id,
        ])
      ).rows;
      assert.equal(checks[0].status, "passed");
      const proposals = (
        await db.query("SELECT * FROM run_database_cleanup WHERE run_id=$1", [
          run.id,
        ])
      ).rows;
      assert.equal(proposals.length, 1);
      assert.equal(proposals[0].status, "pending");
      assert.equal(proposals[0].proposal.record.value, String(createdId));
      assert.ok(await schema.getProject(createdId, minted.sub)); // proposal never executes DELETE
      await assert.rejects(
        workspace.createTestWorkspaceProject("real-owner", "fake", null),
        /no longer available/,
      );
      const fingerprint = "a".repeat(64),
        finding = {
          runId: run.id,
          agentId: null,
          severity: "medium",
          title: "fixture",
          reproSteps: null,
          screenshotUrl: null,
          consoleLogs: null,
          networkErrors: [],
          evidenceKey: fingerprint,
        };
      const duplicateResults = await Promise.all([
        schema.createFinding(finding),
        schema.createFinding(finding),
      ]);
      assert.equal(duplicateResults.filter(Boolean).length, 1);
      await schema.recordTestResult(run.id, 0, {
        step_id: "blocked",
        title: "Provider unavailable",
        status: "blocked",
        summary: "GitHub connection required.",
      });
      const report = await schema.getRunReport(self.id, run.id, "real-owner");
      assert.equal(report.findings.length, 1);
      assert.equal(report.testResults[0].status, "blocked");
      assert.equal(
        await schema.getRunReport(self.id, run.id, "other-owner"),
        null,
      );
      await verifier.close();
      console.log(
        JSON.stringify({
          actualPostgresWasm: true,
          realNextAuthSession: true,
          actualNewProjectServerAction: true,
          isolatedProjectCreated: true,
          untrustedRepositoryIgnored: true,
          markedProjectReadBack: true,
          persistenceCheckPassed: true,
          cleanupProposedNotExecuted: true,
          concurrentFindingsDeduplicated: true,
          blockedResultsSeparateFromFindings: true,
          ownerScopedReport: true,
        }),
      );

      // Reproduce an old saved profile whose account deadline and cookie expired.
      const expiryBefore = (
        await db.query("SELECT expires_at FROM test_users WHERE id=$1", [
          minted.sub,
        ])
      ).rows[0].expires_at;
      assert.equal(expiryBefore, null);
      const expiredState = structuredClone(stored);
      expiredState.cookies[0].value = await jwt.encode({
        secret: process.env.AUTH_SECRET,
        salt: issuer.TEST_USER_COOKIE,
        maxAge: -60,
        token: {
          sub: minted.sub,
          name: minted.name,
          email: minted.email,
          preflightTestIdentity: true,
          preflightSessionExpiresAt: Date.now() - 60000,
        },
      });
      expiredState.cookies[0].expires = Date.now() / 1000 - 60;
      const expiredCipher = state.encryptProfile(
        expiredState,
        "real-owner",
        site.SITE_URL,
      );
      await sql`UPDATE test_users SET expires_at=NOW()-INTERVAL '2 hours' WHERE id=${minted.sub}`;
      await sql`UPDATE auth_profiles SET encrypted_state=${expiredCipher} WHERE id=${generated.profile.id}`;
      assert.equal(await issuer.validateTestUserSession(minted.sub), false);
      const recovered = await profiles.profileForRun(
        "real-owner",
        generated.profile.id,
        site.SITE_URL,
        self.id,
      );
      const recoveredState = state.decryptProfile(
        recovered.snapshot.encrypted_state,
        "real-owner",
        site.SITE_URL,
      );
      const recoveredToken = await jwt.decode({
        token: recoveredState.cookies[0].value,
        secret: process.env.AUTH_SECRET,
        salt: issuer.TEST_USER_COOKIE,
      });
      assert.equal(recoveredToken.sub, minted.sub);
      assert.ok(recoveredToken.exp > Date.now() / 1000);
      assert.equal(
        (
          await db.query("SELECT expires_at FROM test_users WHERE id=$1", [
            minted.sub,
          ])
        ).rows[0].expires_at,
        null,
      );
      assert.equal(await issuer.validateTestUserSession(minted.sub), true);
      assert.equal(
        await issuer.refreshTestUserProfile(
          "other-owner",
          self.id,
          generated.profile.id,
        ),
        null,
      );
      const renew = load("lib/run-authentication.ts", {
        ...deps,
        "@/lib/auth-profile-state": state,
        "@/lib/test-user-issuer": issuer,
        "@/lib/site": site,
      });
      const runSnapshot = {
        ...recovered.snapshot,
        encrypted_state: expiredCipher,
      };
      await sql`UPDATE runs SET auth_profile_snapshot=${JSON.stringify(runSnapshot)}::jsonb,plan=${JSON.stringify([{ id: "page", title: "Signed-in page", detail: "Inspect dashboard" }])}::jsonb,status='queued' WHERE id=${run.id}`;
      await sql`UPDATE auth_profiles SET encrypted_state=${expiredCipher} WHERE id=${generated.profile.id}`;
      let failWorker = false;
      const parent = load("src/trigger/run-swarm.ts", {
        "@/lib/run-details": load("lib/run-details.ts", {}),
        ...deps,
        "@trigger.dev/sdk": {
          task: (x) => x,
          tasks: {
            batchTriggerAndWait: async () => {
              const auth = await profiles.getRunAuthentication(run.id);
              const response = await actualAuth.handlers.GET(
                new NextRequest(site.SITE_URL + "/api/auth/session", {
                  headers: {
                    cookie:
                      issuer.TEST_USER_COOKIE +
                      "=" +
                      auth.state.cookies[0].value,
                  },
                }),
              );
              const session = await response.json();
              assert.equal(session.user.githubId, minted.sub);
              assert.equal(session.user.githubLogin, undefined);
              assert.equal(session.user.isTestUser, true);
              return {
                runs: failWorker
                  ? [
                      {
                        ok: false,
                        error: { message: "OpenAI Decisions API error 403" },
                      },
                    ]
                  : [{ ok: true }],
              };
            },
          },
        },
        "@/lib/automatic-database": {
          preflightAutomaticDatabase: async () => false,
        },
        "@/lib/database-verification": {
          preflightRunDatabase: async () => [],
          databaseVerificationError: load("lib/database-verification.ts", {...deps,
            "@/lib/database-connections": connections,
            "@/lib/postgres-verification": {},
            "@/lib/database-check-config": config,
          }).databaseVerificationError,
        },
        "@/lib/auth-profiles": profiles,
        "@/lib/run-authentication": renew,
        "@/lib/schema": schema,
        "@/lib/model-config": { assertSwarmModelConfig: () => {} },
      }).runSwarm;
      assert.equal((await parent.run({ runId: run.id })).runId, run.id);
      assert.equal(
        (await db.query("SELECT status FROM runs WHERE id=$1", [run.id]))
          .rows[0].status,
        "partial",
      );
      const renewedSnapshot = (
        await db.query("SELECT auth_profile_snapshot FROM runs WHERE id=$1", [
          run.id,
        ])
      ).rows[0].auth_profile_snapshot;
      assert.notEqual(renewedSnapshot.encrypted_state, expiredCipher);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS c FROM test_users WHERE id=$1",
            [minted.sub],
          )
        ).rows[0].c,
        1,
      );
      // A later failed worker must preserve completed results and their status.
      await schema.recordTestResult(run.id, 0, {
        step_id: "page",
        title: "Signed-in page",
        status: "passed",
        summary: "Page loaded.",
      });
      await sql`UPDATE runs SET status='queued' WHERE id=${run.id}`;
      failWorker = true;
      assert.equal((await parent.run({ runId: run.id })).status, "partial");
      assert.equal(
        (
          await db.query(
            "SELECT status FROM run_test_results WHERE run_id=$1 AND agent_index=0 AND step_id='page'",
            [run.id],
          )
        ).rows[0].status,
        "passed",
      );
      assert.match(
        (
          await db.query("SELECT failure_reason FROM runs WHERE id=$1", [
            run.id,
          ])
        ).rows[0].failure_reason,
        /HTTP 403/,
      );
      assert.equal(
        await schema.setRunArchived(run.id, self.id, "real-owner", true),
        true,
      );
      await schema.setRunArchived(run.id, self.id, "real-owner", false);
      await sql`UPDATE runs SET status='failed' WHERE id=${run.id}`;
      assert.equal(
        (await schema.listRuns(self.id)).find((r) => r.id === run.id).status,
        "partial",
      );
      assert.equal(
        (await db.query("SELECT status FROM runs WHERE id=$1", [run.id]))
          .rows[0].status,
        "failed",
      );
      console.log(
        JSON.stringify({
          partialRunPreservesFindings: true,
          completedChecksNotOverwritten: true,
          interruptionReasonSaved: true,
          partialRunsArchivable: true,
          legacyFailedReportsWithResultsReadAsPartial: true,
          storedHistoryPreserved: true,
        }),
      );
      const beforeDenied = (
        await db.query(
          "SELECT encrypted_state FROM auth_profiles WHERE id=$1",
          [generated.profile.id],
        )
      ).rows[0].encrypted_state;
      for (const status of ["done", "partial", "failed", "cancelled"]) {
        await sql`UPDATE runs SET status=${status} WHERE id=${run.id}`;
        await assert.rejects(issuer.refreshRunTestUser(run.id), /cannot renew/);
      }
      await sql`UPDATE runs SET status='queued' WHERE id=${run.id}`;
      await sql`UPDATE test_users SET revoked_at=NOW() WHERE id=${minted.sub}`;
      await assert.rejects(issuer.refreshRunTestUser(run.id), /revoked/);
      assert.equal(
        (
          await db.query(
            "SELECT encrypted_state FROM auth_profiles WHERE id=$1",
            [generated.profile.id],
          )
        ).rows[0].encrypted_state,
        beforeDenied,
      );
      await sql`UPDATE test_users SET revoked_at=NULL WHERE id=${minted.sub}`;
      await profiles.revokeAuthProfile(
        "real-owner",
        generated.profile.id,
        self.id,
      );
      await assert.rejects(
        issuer.refreshRunTestUser(run.id),
        /supported automatic/,
      );
      assert.equal(await issuer.validateTestUserSession(minted.sub), false);
      console.log(
        JSON.stringify({
          actualPostgresWasm: true,
          persistentIdentityAfterSave: true,
          expiredSavedProfileRecovered: true,
          sameTestIdentityReused: true,
          webLaunchSessionRenewed: true,
          queuedRunSnapshotRenewed: true,
          actualParentPreflightRenewal: true,
          realAuthJsSessionAccepted: true,
          revokedIdentityCannotRenew: true,
          revokedProfileCannotRenew: true,
          finishedFailedAndCancelledRunsCannotRenew: true,
          noDuplicateTestUser: true,
          noGithubDelegation: true,
        }),
      );

      wrongDatabase = true;
      const foreign = await generation.startProfileGeneration(
        "real-owner",
        self.id,
        {},
      );
      await sql`UPDATE profile_captures SET automation_github_grant='synthetic-grant' WHERE id=${foreign.id}::uuid`;
      assert.equal(
        (
          await worker.run({
            owner: "real-owner",
            projectId: self.id,
            captureId: foreign.id,
          })
        ).status,
        "error",
      );
      assert.equal(issuerCalls, 1);
      assert.equal(
        (
          await db.query("SELECT * FROM test_users WHERE capture_id=$1", [
            foreign.id,
          ])
        ).rows.length,
        0,
      );
      assert.match(
        (
          await generation.getProfileGeneration(
            "real-owner",
            self.id,
            foreign.id,
          )
        ).message,
        /not this PreFlight/,
      );
      console.log(
        JSON.stringify({
          actualPostgresWasm: true,
          canonicalHostnameMigration: true,
          databaseEncryptionPreserved: true,
          existingRunSnapshotStillDecrypts: true,
          workerIssuedRealAuthJsJwe: true,
          realNextAuthSessionHandlerAcceptedCookie: true,
          appSessionVerified: true,
          encryptedProfileSaved: true,
          duplicateDeliveryExcluded: true,
          foreignDatabaseRejectedBeforeIssuing: true,
          noBrowserOrModelUsed: true,
        }),
      );
    } finally {
      global.fetch = realFetch;
    }
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
  const profiles = load("lib/auth-profiles.ts", {
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
    global.fetch = async (url, init) => {
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

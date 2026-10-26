const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
function api(extra = {}) {
  return load("lib/profile-provisioning.ts", {
    "@/lib/github": {},
    "@/lib/auth-profile-state": { profileKey: () => Buffer.alloc(32, 4) },
    "@/lib/database-provider-accounts": {},
    "@/lib/database-provider-api": {},
    ...extra,
  });
}
const source = {
  sha: "immutable-sha",
  files: {
    "auth.ts":
      'import { PrismaAdapter } from "@auth/prisma-adapter"; export const auth=NextAuth({adapter: PrismaAdapter(db),session:{strategy:"database"}});',
    "prisma/schema.prisma":
      "model User {\n id String @id\n email String @unique\n name String?\n emailVerified DateTime?\n}\nmodel Session {\n id String @id\n sessionToken String @unique\n userId String\n expires DateTime\n}",
    "package.json": '{"dependencies":{"next-auth":"^5.0.0"}}',
  },
};
test("auth inspection distinguishes database sessions from signed JWT and external-only auth", () => {
  const a = api();
  assert.equal(a.detectProvisioning(source).kind, "authjs");
  for (const code of [
    "NextAuth({providers:[GitHub]})",
    'NextAuth({adapter:PrismaAdapter(db),session:{strategy:"jwt"}})',
  ])
    assert.throws(
      () =>
        a.detectProvisioning({
          ...source,
          files: { ...source.files, "auth.ts": code },
        }),
      /signed token/,
    );
});
test("Supabase detection requires actual auth use, not just a database client", () => {
  const a = api();
  assert.equal(
    a.detectProvisioning({
      sha: "sha",
      files: {
        "supabase.ts":
          'import {createBrowserClient} from "@supabase/ssr"; const client=createBrowserClient(url,key); client.auth.getUser()',
      },
    }).kind,
    "supabase",
  );
  assert.throws(() =>
    a.detectProvisioning({
      sha: "sha",
      files: {
        "supabase.ts":
          'import {createClient} from "@supabase/supabase-js"; createClient(url,key).from("tasks")',
      },
    }),
  );
});
test("source mappings cannot inject SQL and custom auth cookies are rejected", () => {
  const a = api();
  assert.throws(
    () =>
      a.detectProvisioning({
        ...source,
        files: {
          ...source.files,
          "auth.ts": source.files["auth.ts"] + "; cookies: {sessionToken:{}}",
        },
      }),
    /cookies/,
  );
  assert.equal(
    a.detectProvisioning({
      ...source,
      files: {
        ...source.files,
        "prisma/schema.prisma": source.files["prisma/schema.prisma"].replace(
          "model User {",
          'model User {\n @@map("users")',
        ),
      },
    }).user,
    "users",
  );
});
test("custom required user fields and triggers block direct writes", async () => {
  const a = api(),
    plan = a.detectProvisioning(source);
  const fields = Object.entries({
    User: plan.userFields,
    Session: plan.sessionFields,
  }).flatMap(([table_name, cols]) =>
    Object.values(cols).map((column_name) => ({
      table_name,
      column_name,
      data_type: "text",
      is_nullable: "YES",
      column_default: null,
    })),
  );
  await assert.rejects(
    a.inspectAuthTables(
      {
        query: async () => ({
          rows: [
            ...fields,
            {
              table_name: "User",
              column_name: "tenant_id",
              is_nullable: "NO",
              column_default: null,
            },
          ],
        }),
      },
      plan,
    ),
    /custom fields|membership/,
  );
  let n = 0;
  await assert.rejects(
    a.inspectAuthTables(
      {
        query: async () => ({
          rows: ++n === 1 ? fields : [{ relname: "User" }],
        }),
      },
      plan,
    ),
    /triggers/,
  );
});
test("failed inserts roll back without issuing a profile or executing arbitrary SQL", async () => {
  const a = api(),
    plan = a.detectProvisioning(source),
    calls = [];
  await assert.rejects(
    a.provisionDatabaseSession(
      {
        query: async (q) => {
          calls.push(typeof q === "string" ? q : q.text);
          if (typeof q !== "string") throw new Error("read permission denied");
          return { rows: [] };
        },
      },
      plan,
      { email: "qa@example.com", name: "QA" },
      "12345678-1234-1234-1234-123456789abc",
      "owner",
      "https://app.test",
    ),
  );
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.ok(!calls.some((q) => /DELETE|UPDATE|ALTER|DROP/.test(q)));
});

test("Supabase provisions one identity through its admin API, then stores only user tokens", async (t) => {
  const secret = "private-service-role",
    calls = [];
  t.mock.method(global, "fetch", async (url, init) => {
    calls.push({ url, init });
    return Response.json(
      calls.length === 1
        ? { id: "new-user" }
        : {
            access_token: "user-access",
            refresh_token: "user-refresh",
            expires_in: 3600,
            user: { id: "new-user" },
          },
    );
  });
  const a = api({
    "@/lib/database-provider-accounts": {
      providerAccessToken: async () => "management-token",
    },
    "@/lib/database-provider-api": {
      providerRequest: async (_provider, token, path) => {
        assert.equal(token, "management-token");
        assert.equal(path, "/projects/testref/api-keys");
        return [{ name: "service_role", api_key: secret }];
      },
    },
  });
  const result = await a.provisionSupabase(
    "owner",
    "postgresql://postgres:synthetic@db.testref.supabase.co/postgres",
    { email: "qa@example.com", password: "generated-password", name: "QA" },
    "capture",
    true,
    "https://app.example.com",
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.init.method === "POST"));
  assert.equal(
    JSON.parse(calls[0].init.body).user_metadata.preflight_setup_id,
    "capture",
  );
  assert.ok(!JSON.stringify(result.state).includes(secret));
  assert.ok(JSON.stringify(result.state).includes("user-access"));
  assert.equal(result.state.cookies[0].name, "sb-testref-auth-token");
});

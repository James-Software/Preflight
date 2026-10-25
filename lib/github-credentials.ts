import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getSql } from "@/lib/db";

export class GithubReconnectRequired extends Error {}
export class GithubRenewalUnavailable extends Error {
  constructor() {
    super(
      "GitHub connection renewal is temporarily unavailable. Please try again shortly.",
    );
  }
}
type Credentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  refreshExpiresAt: number | null;
};
type Connection = {
  owner_github_id: string;
  login: string;
  encrypted_tokens: string | null;
  reauth_required: boolean;
  refresh_lease_id: string | null;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new GithubRenewalUnavailable();
  return createHash("sha256")
    .update(`preflight:github-credentials:v1:${secret}`)
    .digest();
}
function seal(owner: string, credentials: Credentials) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(Buffer.from(owner));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(".");
}
function unseal(owner: string, encrypted: string): Credentials {
  const key = secretKey();
  try {
    const [version, iv, tag, data] = encrypted.split(".");
    if (version !== "v1") throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(owner));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new GithubReconnectRequired();
  }
}
async function ensureConnections() {
  await getSql()`CREATE TABLE IF NOT EXISTS github_connections (
    owner_github_id TEXT PRIMARY KEY, provider_github_id TEXT UNIQUE NOT NULL, login TEXT NOT NULL, encrypted_tokens TEXT,
    reauth_required BOOLEAN NOT NULL DEFAULT FALSE, refresh_lease_id UUID,
    refresh_lease_until TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}
/** OAuth sign-in saves rotating credentials on the server, never in a session response. */
export async function savedGithubOwner(
  providerId: string,
): Promise<string | null> {
  await ensureConnections();
  const rows =
    await getSql()`SELECT owner_github_id FROM github_connections WHERE provider_github_id = ${providerId}`;
  return Array.isArray(rows) && rows.length
    ? String((rows[0] as { owner_github_id: string }).owner_github_id)
    : null;
}
export async function saveGithubCredentials(
  owner: string,
  login: string,
  credentials: Credentials,
  providerId = owner,
): Promise<string> {
  await ensureConnections();
  const encrypted = seal(owner, credentials);
  const rows =
    await getSql()`INSERT INTO github_connections (owner_github_id, provider_github_id, login, encrypted_tokens)
    VALUES (${owner},${providerId},${login},${encrypted}) ON CONFLICT (provider_github_id) DO UPDATE SET
      login = EXCLUDED.login, encrypted_tokens = EXCLUDED.encrypted_tokens, reauth_required = FALSE,
      refresh_lease_id = NULL, refresh_lease_until = NULL, updated_at = NOW()
    WHERE github_connections.owner_github_id = EXCLUDED.owner_github_id RETURNING owner_github_id`;
  if (!Array.isArray(rows) || !rows.length) {
    // If another login won the identity mapping, encrypt for that canonical owner.
    const canonical = await savedGithubOwner(providerId);
    if (!canonical || canonical === owner) throw new GithubRenewalUnavailable();
    return saveGithubCredentials(canonical, login, credentials, providerId);
  }
  return owner;
}
async function connection(owner: string): Promise<Connection | null> {
  const rows =
    await getSql()`SELECT owner_github_id, login, encrypted_tokens, reauth_required, refresh_lease_id
    FROM github_connections WHERE owner_github_id = ${owner}`;
  return Array.isArray(rows) ? (rows[0] as Connection) || null : null;
}
async function reconnect(
  owner: string,
  encrypted: string,
  lease: string | null,
) {
  await getSql()`UPDATE github_connections SET reauth_required = TRUE, encrypted_tokens = NULL,
    refresh_lease_id = NULL, refresh_lease_until = NULL, updated_at = NOW()
    WHERE owner_github_id = ${owner} AND encrypted_tokens = ${encrypted}
      AND (refresh_lease_id IS NOT DISTINCT FROM ${lease}::uuid)`;
}

/** Shared DB lease coordinates rotation across requests and serverless instances. */
export async function loadGithubCredentials(
  owner: string,
): Promise<{ accessToken: string; login: string } | null> {
  await ensureConnections();
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const row = await connection(owner);
    if (!row) return null; // Legacy JWTs may still hold a usable access token.
    if (row.reauth_required || !row.encrypted_tokens)
      throw new GithubReconnectRequired();
    const current = unseal(owner, row.encrypted_tokens);
    if (current.expiresAt === null || current.expiresAt > Date.now() + 60_000)
      return { accessToken: current.accessToken, login: row.login };
    if (
      !current.refreshToken ||
      (current.refreshExpiresAt !== null &&
        current.refreshExpiresAt <= Date.now())
    ) {
      await reconnect(owner, row.encrypted_tokens, row.refresh_lease_id);
      throw new GithubReconnectRequired();
    }
    const lease = randomUUID();
    const claimed =
      await getSql()`UPDATE github_connections SET refresh_lease_id = ${lease}::uuid,
      refresh_lease_until = NOW() + INTERVAL '30 seconds'
      WHERE owner_github_id = ${owner} AND encrypted_tokens = ${row.encrypted_tokens} AND reauth_required = FALSE
        AND (refresh_lease_until IS NULL OR refresh_lease_until < NOW()) RETURNING owner_github_id`;
    if (!Array.isArray(claimed) || !claimed.length) {
      await delay(150);
      continue;
    }
    try {
      const clientId = process.env.AUTH_GITHUB_ID,
        clientSecret = process.env.AUTH_GITHUB_SECRET;
      if (!clientId || !clientSecret) throw new GithubRenewalUnavailable();
      let response: Response;
      try {
        response = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: current.refreshToken,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        throw new GithubRenewalUnavailable();
      }
      const data = await response.json().catch(() => null);
      if (
        [
          "bad_refresh_token",
          "expired_refresh_token",
          "invalid_grant",
        ].includes(data?.error)
      ) {
        await reconnect(owner, row.encrypted_tokens, lease);
        // A concurrent OAuth sign-in can replace the connection while refresh is in flight.
        const latest = await connection(owner);
        if (
          latest &&
          !latest.reauth_required &&
          latest.encrypted_tokens !== row.encrypted_tokens
        )
          continue;
        throw new GithubReconnectRequired();
      }
      if (
        !response.ok ||
        data?.error ||
        typeof data?.access_token !== "string" ||
        !data.access_token ||
        typeof data.refresh_token !== "string" ||
        !data.refresh_token ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0 ||
        !Number.isFinite(data.refresh_token_expires_in) ||
        data.refresh_token_expires_in <= 0
      )
        throw new GithubRenewalUnavailable();
      const encrypted = seal(owner, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        refreshExpiresAt: Date.now() + data.refresh_token_expires_in * 1000,
      });
      const saved =
        await getSql()`UPDATE github_connections SET encrypted_tokens = ${encrypted},
        refresh_lease_id = NULL, refresh_lease_until = NULL, updated_at = NOW()
        WHERE owner_github_id = ${owner} AND refresh_lease_id = ${lease}::uuid AND encrypted_tokens = ${row.encrypted_tokens}
        RETURNING owner_github_id`;
      if (Array.isArray(saved) && saved.length)
        return { accessToken: data.access_token, login: row.login };
    } finally {
      await getSql()`UPDATE github_connections SET refresh_lease_id = NULL, refresh_lease_until = NULL
        WHERE owner_github_id = ${owner} AND refresh_lease_id = ${lease}::uuid`;
    }
  }
  throw new GithubRenewalUnavailable();
}

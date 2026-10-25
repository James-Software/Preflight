import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { profileKey } from "@/lib/auth-profile-state";
import {
  DatabaseCheckError,
  DatabaseProviderReconnectRequired,
} from "@/lib/database-check-config";
import {
  exchangeProviderTokens,
  type DatabaseProvider,
  type ProviderTokens,
} from "@/lib/database-provider-api";

export function sealProvider(
  value: unknown,
  owner: string,
  provider: DatabaseProvider,
  purpose = "account",
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", profileKey(), iv);
  cipher.setAAD(
    Buffer.from(
      `preflight:database-provider:v1:${purpose}:${owner}:${provider}`,
    ),
  );
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function unsealProvider<T>(
  raw: string,
  owner: string,
  provider: DatabaseProvider,
  purpose = "account",
): T {
  try {
    const [iv, tag, data] = raw.split(".");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      profileKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(
      Buffer.from(
        `preflight:database-provider:v1:${purpose}:${owner}:${provider}`,
      ),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new DatabaseProviderReconnectRequired(
      "Could not unlock this provider account. Enter its API key or sign in again to reconnect.",
    );
  }
}
export async function providerAccountConnected(
  owner: string,
  provider: DatabaseProvider,
) {
  await ensureSchema();
  const rows =
    await getSql()`SELECT encrypted_tokens FROM database_provider_accounts WHERE owner_github_id=${owner} AND provider=${provider}`;
  if (!Array.isArray(rows) || !rows.length) return false;
  try {
    const tokens = unsealProvider<ProviderTokens>(
      (rows[0] as { encrypted_tokens: string }).encrypted_tokens,
      owner,
      provider,
    );
    return typeof tokens.accessToken === "string" && !!tokens.accessToken;
  } catch (error) {
    if (error instanceof DatabaseProviderReconnectRequired) return false;
    throw error;
  }
}
export async function saveProviderAccount(
  owner: string,
  provider: DatabaseProvider,
  tokens: ProviderTokens,
) {
  const encrypted = sealProvider(tokens, owner, provider);
  await ensureSchema();
  await getSql()`INSERT INTO database_provider_accounts(owner_github_id,provider,encrypted_tokens) VALUES (${owner},${provider},${encrypted}) ON CONFLICT(owner_github_id,provider) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,refresh_until=NULL,updated_at=NOW()`;
}
export async function disconnectProviderAccount(
  owner: string,
  provider: DatabaseProvider,
) {
  await ensureSchema();
  await getSql()`DELETE FROM database_provider_accounts WHERE owner_github_id=${owner} AND provider=${provider}`;
}
export async function providerAccessToken(
  owner: string,
  provider: DatabaseProvider,
) {
  await ensureSchema();
  const sql = getSql();
  const rows =
    await sql`SELECT encrypted_tokens FROM database_provider_accounts WHERE owner_github_id=${owner} AND provider=${provider}`;
  const row = Array.isArray(rows)
    ? (rows[0] as { encrypted_tokens: string } | undefined)
    : null;
  if (!row)
    throw new DatabaseProviderReconnectRequired(
      "Connect your provider account first.",
    );
  const tokens = unsealProvider<ProviderTokens>(
    row.encrypted_tokens,
    owner,
    provider,
  );
  if (!tokens.expiresAt || tokens.expiresAt > Date.now() + 60_000)
    return tokens.accessToken;
  if (!tokens.refreshToken)
    throw new DatabaseProviderReconnectRequired(
      "Account authorization expired. Connect it again.",
    );
  const lock =
    await sql`UPDATE database_provider_accounts SET refresh_until=NOW()+INTERVAL '30 seconds' WHERE owner_github_id=${owner} AND provider=${provider} AND encrypted_tokens=${row.encrypted_tokens} AND (refresh_until IS NULL OR refresh_until < NOW()) RETURNING provider`;
  if (!Array.isArray(lock) || !lock.length)
    throw new DatabaseCheckError(
      "Account authorization is being renewed. Try again in a moment.",
    );
  try {
    const refreshed = await exchangeProviderTokens(provider, {
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    const encrypted = sealProvider(
      {
        ...refreshed,
        refreshToken: refreshed.refreshToken || tokens.refreshToken,
      },
      owner,
      provider,
    );
    const updated =
      await sql`UPDATE database_provider_accounts SET encrypted_tokens=${encrypted},refresh_until=NULL,updated_at=NOW() WHERE owner_github_id=${owner} AND provider=${provider} AND encrypted_tokens=${row.encrypted_tokens} RETURNING provider`;
    if (!Array.isArray(updated) || !updated.length)
      throw new DatabaseCheckError(
        "This provider account changed. Connect it again.",
      );
    return refreshed.accessToken;
  } finally {
    await sql`UPDATE database_provider_accounts SET refresh_until=NULL WHERE owner_github_id=${owner} AND provider=${provider} AND encrypted_tokens=${row.encrypted_tokens}`;
  }
}

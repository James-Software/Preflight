import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { profileKey } from "@/lib/auth-profile-state";
import { getSql } from "@/lib/db";
import type { GithubContext } from "@/lib/github";
export function sealFixGithubGrant(
  group: string,
  owner: string,
  ctx: GithubContext,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", profileKey(), iv);
  cipher.setAAD(Buffer.from(`preflight:fix-github:v1:${group}:${owner}`));
  const data = Buffer.concat([
    cipher.update(
      JSON.stringify({
        login: ctx.login,
        accessToken: ctx.accessToken,
        expiresAt: Date.now() + 15 * 60_000,
      }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function openFixGithubGrant(
  raw: string,
  group: string,
  owner: string,
): GithubContext {
  try {
    const [iv, tag, data] = raw.split("."),
      decipher = createDecipheriv(
        "aes-256-gcm",
        profileKey(),
        Buffer.from(iv, "base64url"),
      );
    decipher.setAAD(Buffer.from(`preflight:fix-github:v1:${group}:${owner}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const value = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      typeof value.login !== "string" ||
      !value.login ||
      typeof value.accessToken !== "string" ||
      !value.accessToken ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now()
    )
      throw new Error();
    return { login: value.login, accessToken: value.accessToken };
  } catch {
    throw new Error(
      "The GitHub authorization for this PR expired or could not be unlocked. Confirm PROFILE_ENCRYPTION_KEY matches in Vercel and Trigger.dev, then reconnect GitHub and retry.",
    );
  }
}
export async function saveFixGithubGrant(
  group: string,
  owner: string,
  ctx: GithubContext,
) {
  const encrypted = sealFixGithubGrant(group, owner, ctx);
  await getSql()`UPDATE fix_pr_groups SET github_grant=${encrypted} WHERE id=${group}::uuid AND state='pending'`;
}
export async function clearFixGithubGrant(group: string, encrypted: string) {
  await getSql()`UPDATE fix_pr_groups SET github_grant=NULL WHERE id=${group}::uuid AND github_grant=${encrypted}`;
}

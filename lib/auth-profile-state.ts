import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type ProfileState = {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    secure: boolean;
    httpOnly: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }[];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
  headers: Record<string, string>;
};
export class ProfileError extends Error {}
export function profileKey(): Buffer {
  const key = Buffer.from(process.env.PROFILE_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32)
    throw new ProfileError(
      "Secure connection storage is not configured. Ask your PreFlight administrator to finish setup.",
    );
  return key;
}
export function profileOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ProfileError(
      "Enter an app origin starting with https:// or http://.",
    );
  }
}
export function parseProfileState(
  origin: string,
  rawState: string,
  rawHeaders: string,
): ProfileState {
  if (rawState.length + rawHeaders.length > 150_000)
    throw new ProfileError("Session data must be smaller than 150 KB.");
  let input: any, headers: any;
  try {
    input = JSON.parse(rawState || "[]");
    headers = JSON.parse(rawHeaders || "{}");
  } catch {
    throw new ProfileError("Cookies/session and headers must be valid JSON.");
  }
  const cookies = Array.isArray(input) ? input : input?.cookies;
  const origins = Array.isArray(input) ? [] : input?.origins || [];
  if (
    !Array.isArray(cookies) ||
    cookies.length > 200 ||
    !Array.isArray(origins) ||
    !headers ||
    Array.isArray(headers) ||
    typeof headers !== "object"
  )
    throw new ProfileError(
      "Import a cookie array or Playwright storage-state object, and a JSON object for headers.",
    );
  const hostname = new URL(origin).hostname;
  const state: ProfileState = {
    cookies: [],
    origins: [],
    headers: Object.create(null),
  };
  for (const c of cookies) {
    const domain =
      typeof c?.domain === "string"
        ? c.domain.replace(/^\./, "").toLowerCase()
        : hostname;
    if (
      !c ||
      typeof c.name !== "string" ||
      !c.name ||
      typeof c.value !== "string" ||
      /[\x00-\x20;=]/.test(c.name) ||
      /[\x00-\x1f\x7f]/.test(c.value) ||
      !(hostname === domain || hostname.endsWith(`.${domain}`)) ||
      (hostname !== domain && !domain.includes("."))
    )
      throw new ProfileError(
        "Each cookie needs a name, value and domain matching the app.",
      );
    const path = c.path ?? "/";
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      /[\x00-\x1f]/.test(path)
    )
      throw new ProfileError("Cookie paths must start with /.");
    const expires = c.expires ?? c.expirationDate ?? -1;
    if (
      typeof expires !== "number" ||
      !Number.isFinite(expires) ||
      (expires !== -1 && expires <= Date.now() / 1000)
    )
      throw new ProfileError(
        "An imported cookie has expired. Export a fresh session.",
      );
    const sameSite = (
      {
        strict: "Strict",
        lax: "Lax",
        none: "None",
        no_restriction: "None",
        unspecified: "Lax",
      } as const
    )[String(c.sameSite || "lax").toLowerCase() as "lax"];
    if (!["Strict", "Lax", "None"].includes(sameSite))
      throw new ProfileError("Cookie SameSite must be Strict, Lax or None.");
    // Narrow imported cookies to this host, even when the original used a parent domain.
    state.cookies.push({
      name: c.name,
      value: c.value,
      domain: hostname,
      path,
      expires,
      httpOnly: !!c.httpOnly,
      secure: c.secure === undefined ? origin.startsWith("https:") : !!c.secure,
      sameSite,
    });
  }
  for (const entry of origins) {
    if (
      entry?.origin !== origin ||
      !Array.isArray(entry.localStorage) ||
      entry.indexedDB
    )
      throw new ProfileError(
        "Storage origins must match the app exactly. IndexedDB imports are not supported yet.",
      );
    if (
      entry.localStorage.some(
        (item: any) =>
          !item ||
          typeof item.name !== "string" ||
          typeof item.value !== "string",
      )
    )
      throw new ProfileError(
        "Local storage entries need string names and values.",
      );
    state.origins.push({
      origin,
      localStorage: entry.localStorage.map((item: any) => ({
        name: item.name,
        value: item.value,
      })),
    });
  }
  const blocked =
    /^(cookie|host|content-length|connection|proxy-authorization|proxy-connection|transfer-encoding|upgrade|origin|referer|sec-.*)$/i;
  if (Object.keys(headers).length > 30)
    throw new ProfileError("Use at most 30 authentication headers.");
  for (const [name, value] of Object.entries(headers)) {
    if (
      !/^[!#$%&'*+.^_`|~\w-]+$/.test(name) ||
      blocked.test(name) ||
      typeof value !== "string" ||
      /[\r\n\x00]/.test(value)
    )
      throw new ProfileError(
        "Use valid authentication headers. Import cookies in the session field instead of a Cookie header.",
      );
    state.headers[name.toLowerCase()] = value;
  }
  if (
    !state.cookies.length &&
    !state.origins.some((o) => o.localStorage.length) &&
    !Object.keys(state.headers).length
  )
    throw new ProfileError(
      "Add cookies, local storage or an authentication header.",
    );
  return state;
}
export function encryptProfile(
  state: ProfileState,
  owner: string,
  origin: string,
): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", profileKey(), iv);
  cipher.setAAD(Buffer.from(`${owner}\n${origin}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptProfile(
  raw: string,
  owner: string,
  origin: string,
): ProfileState {
  const key = profileKey();
  try {
    const [version, iv, tag, data] = raw.split(".");
    if (version !== "v1") throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`${owner}\n${origin}`));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new ProfileError(
      "Could not unlock this profile. Check the profile encryption key or create a fresh profile.",
    );
  }
}

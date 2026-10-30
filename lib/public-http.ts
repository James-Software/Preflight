import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { publicDatabaseAddress } from "@/lib/postgres-verification";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

export class TargetAccessError extends Error {
  constructor(message: string) { super(message); this.name = "TargetAccessError"; }
}

export function publicHttpUrl(raw: string | URL) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new TargetAccessError("Enter a public HTTP or HTTPS deployment URL."); }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !host.includes(".") && !isIP(host) || /(?:^|\.)(?:localhost|local|internal)$/.test(host) ||
    (isIP(host) && !publicDatabaseAddress(host)))
    throw new TargetAccessError("Use a publicly reachable HTTP or HTTPS deployment on port 80 or 443, without embedded credentials.");
  url.hash = "";
  return url;
}

export async function publicHttpAddress(url: URL, signal: AbortSignal) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  const resolved = isIP(host) ? [{ address: host, family: isIP(host) }] :
    await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
      const abort = () => reject(new TargetAccessError("Deployment lookup timed out."));
      signal.addEventListener("abort", abort, { once: true });
      void lookup(host, { all: true, verbatim: true }).then(resolve, () => reject(new TargetAccessError("Could not resolve this public deployment.")))
        .finally(() => signal.removeEventListener("abort", abort));
    });
  signal.throwIfAborted();
  if (!resolved.length || resolved.some(a => !publicDatabaseAddress(a.address)))
    throw new TargetAccessError("Private, local and reserved network destinations cannot be tested.");
  return resolved.find(a => a.family === 4) || resolved[0];
}

export type PublicResponse = { status: number; headers: Record<string, string | string[]>; body: Buffer; url: string };

export function decodedPublicBody(response: Pick<PublicResponse, "headers" | "body">, maxBytes = 2_097_152) {
  if (response.body.length > maxBytes) throw new TargetAccessError("The deployment response exceeds the test size limit.");
  const encoding = response.headers["content-encoding"];
  if (!encoding || encoding === "identity") return response.body;
  try {
    if (encoding === "gzip") return gunzipSync(response.body, { maxOutputLength: maxBytes });
    if (encoding === "deflate") return inflateSync(response.body, { maxOutputLength: maxBytes });
    if (encoding === "br") return brotliDecompressSync(response.body, { maxOutputLength: maxBytes });
  } catch { throw new TargetAccessError("The compressed deployment response exceeds the test limit or is invalid."); }
  throw new TargetAccessError("The deployment returned an unsupported response encoding.");
}

/** One public connection. Pin the validated IP; preserve Host and TLS verification.
 * Redirects are returned to the caller and must pass this boundary again. */
export async function publicHttpRequest(raw: string | URL, options: {
  method?: string; headers?: Record<string, string>; body?: Buffer | null;
  signal?: AbortSignal; maxBytes?: number;
} = {}): Promise<PublicResponse> {
  const url = publicHttpUrl(raw);
  const signal = options.signal || AbortSignal.timeout(15_000);
  if ((options.body?.length || 0) > 1_048_576) throw new TargetAccessError("Test requests must be smaller than 1 MB.");
  const address = await publicHttpAddress(url, signal);
  return new Promise((resolve, reject) => {
    const headers = { ...options.headers };
    for (const key of Object.keys(headers)) if (/^(host|connection|proxy-authorization|proxy-connection|transfer-encoding|upgrade)$/i.test(key)) delete headers[key];
    // The browser may advertise codecs unavailable in the worker runtime.
    for (const key of Object.keys(headers)) if (/^accept-encoding$/i.test(key)) delete headers[key];
    headers["accept-encoding"] = "identity";
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: options.method || "GET", headers, agent: false, signal,
      family: address.family,
      lookup: (_hostname, _opts, callback) => callback(null, address.address, address.family),
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      const max = options.maxBytes ?? 2_097_152;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > max) {
          response.destroy(new TargetAccessError("The deployment response exceeds the test size limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode || 502,
        headers: Object.fromEntries(Object.entries(response.headers).filter((pair): pair is [string, string | string[]] => pair[1] !== undefined)),
        body: Buffer.concat(chunks), url: url.href }));
      response.on("error", reject);
      response.on("aborted", () => reject(new TargetAccessError("The deployment response was interrupted.")));
    });
    request.on("error", error => reject(error instanceof TargetAccessError ? error : new TargetAccessError("The public deployment request could not complete.")));
    request.end(options.body || undefined);
  });
}

export async function publicHtml(raw: string) {
  let url = publicHttpUrl(raw);
  const origin = url.origin, signal = AbortSignal.timeout(15_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const result = await publicHttpRequest(url, { signal, headers: { Accept: "text/html", "Accept-Encoding": "identity" } });
    const location = result.headers.location;
    if ([301, 302, 303, 307, 308].includes(result.status) && typeof location === "string") {
      url = publicHttpUrl(new URL(location, url));
      if (url.origin !== origin) throw new TargetAccessError("The app redirects to another origin. Set the project's App URL to the final deployment URL.");
      continue;
    }
    return { status: result.status, html: decodedPublicBody(result).toString("utf8") };
  }
  throw new TargetAccessError("The deployment exceeded the redirect limit.");
}

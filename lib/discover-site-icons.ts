import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { publicDatabaseAddress } from "@/lib/postgres-verification";
import { declaredSiteIcons } from "@/lib/site-icons";

async function publicAddress(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some((a) => !publicDatabaseAddress(a.address))
  )
    throw new Error("Non-public site");
  return addresses[0];
}
async function pageHead(url: URL, signal: AbortSignal) {
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Unsupported site URL");
  const address = await publicAddress(url.hostname);
  signal.throwIfAborted();
  return new Promise<{ html: string; redirect?: string }>((resolve, reject) => {
    // Pin DNS for this connection, while preserving the original Host and TLS name.
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        family: address.family,
        agent: false,
        headers: {
          Accept: "text/html",
          "Accept-Encoding": "identity",
          "User-Agent": "PreFlight-Favicon/1.0",
        },
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
          response.headers.location
        ) {
          resolve({ html: "", redirect: response.headers.location });
          response.destroy();
          return;
        }
        if (
          response.statusCode !== 200 ||
          !/text\/html|application\/xhtml\+xml/i.test(
            response.headers["content-type"] || "",
          )
        ) {
          response.destroy();
          reject(new Error("No HTML document"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          const remaining = 128_000 - size;
          chunks.push(chunk.subarray(0, remaining));
          size += Math.min(chunk.length, remaining);
          if (size >= 128_000) {
            resolve({ html: Buffer.concat(chunks).toString("utf8") });
            response.destroy();
          }
        });
        response.on("end", () =>
          resolve({ html: Buffer.concat(chunks).toString("utf8") }),
        );
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
}
export async function discoverSiteIcons(origin: string) {
  const signal = AbortSignal.timeout(5000);
  let page = new URL("/", origin);
  // A deadline also bounds DNS, which does not accept an AbortSignal.
  const work = async () => {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const result = await pageHead(page, signal);
      if (result.redirect) {
        page = new URL(result.redirect, page);
        continue;
      }
      return [
        ...new Set([
          ...declaredSiteIcons(result.html, page.href),
          new URL("/favicon.ico", page).href,
        ]),
      ];
    }
    return [];
  };
  return new Promise<string[]>((resolve) => {
    const abort = () => resolve([]);
    signal.addEventListener("abort", abort, { once: true });
    void work()
      .then(resolve, () => resolve([]))
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

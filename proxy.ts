import { NextRequest, NextResponse } from "next/server";
import { isPublicContentPath } from "./lib/content/paths";
import { prefersMarkdown } from "./lib/content/negotiation";
import { DISCOVERY_LINKS, SITE_URL, markdownPath } from "./lib/site";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!isPublicContentPath(path) || !["GET", "HEAD"].includes(request.method)) return NextResponse.next();
  const markdown = !request.headers.has("rsc") && !request.headers.has("next-action") && prefersMarkdown(request.headers.get("accept"));
  const destination = request.nextUrl.clone();
  destination.pathname = markdownPath(path);
  destination.search = "";
  const response = markdown ? NextResponse.rewrite(destination) : NextResponse.next();
  response.headers.append("Vary", "Accept");
  // App Router may replace Vary on HTML responses. Neither representation
  // may enter a shared cache, even if an intermediary ignores Accept.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Link", `${DISCOVERY_LINKS}, <${SITE_URL}${path}>; rel="canonical", <${SITE_URL}${markdownPath(path)}>; rel="alternate"; type="text/markdown"`);
  response.headers.set("Content-Signal", "search=yes, ai-input=yes");
  return response;
}

// Authenticated pages, APIs, assets, and login flows never enter negotiation.
export const config = { matcher: ["/", "/privacy", "/terms", "/blog/:path*"] };

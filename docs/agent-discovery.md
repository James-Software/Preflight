# Public discovery for crawlers and agents

The normal website still serves HTML. Public pages also support
`Accept: text/markdown`, with Markdown alternates at `/markdown`,
`/markdown/privacy`, `/markdown/terms`, `/markdown/blog`, and
`/markdown/blog/{slug}`. Negotiation is limited to those public page paths and
GET/HEAD requests. HTML wins an explicit equal-quality tie. RSC navigation and
server actions are not converted. Both negotiated representations use `no-store`.
Markdown advertises `Vary: Accept`; App Router controls the final HTML Vary header
and can replace custom values, so shared-cache isolation never relies on Vary alone.

Only the existing published-post database queries are used for blog output.
Draft posts are never exposed. Database failures return 503 without database
error details. Public Markdown does not use a session, render a profile, or set
cookies. No user-agent string grants extra access.

## Discovery endpoints

- `/robots.txt`: allows public crawling, excludes dashboard, API, login, invitation,
  and access-denied paths, and points to the sitemap. Its wildcard user-agent block
  declares `Content-Signal: ai-train=no, search=yes, ai-input=yes`: no model
  training, with search indexing and AI input/retrieval allowed. This policy shares
  a constant with the public HTML and Markdown response headers in `lib/site.ts`.
  Content Signals express preferences; they do not enforce access. Robots rules are advisory;
  existing session, ownership, and admin checks still enforce access.
- `/sitemap.xml`: public pages and published posts. Only real post modification
  timestamps are advertised, rather than pretending every page changes on each request.
- `/llms.txt` and `/llms-full.txt`: agent-oriented product references.
- `/auth.md`: describes actual interactive GitHub sign-in and current limitations.
- `/.well-known/api-catalog`: RFC 9727/RFC 9264 linkset for the public content API.
- `/openapi.json`: OpenAPI 3.1 description of actual read-only public endpoints.

Public HTML and discovery responses use `Link` headers to expose the catalog,
API description, agent guide, and authentication help. HTML metadata adds a
canonical URL and a Markdown alternate. Homepage and published blog pages include
JSON-LD based on actual public product/post data, without fabricated prices or ratings.
The legal HTML and Markdown representations share their section data.

## Cloudflare settings and deployment

Code in the repository cannot change a Cloudflare zone, its WAF, robots policies,
or the deployment currently attached to the domain. After the deployment is live:

1. Check **both** the apex domain and `www`, following redirects. `/robots.txt`,
   `/sitemap.xml`, `/llms.txt`, `/auth.md`, and `/.well-known/api-catalog` must return
   the actual resource with 200, not a challenge page, login redirect, 404, or SPA HTML.
   The canonical host is `https://www.trypreflight.dev`.
2. In AI Crawl Control, review whether the desired search/retrieval crawlers are
   blocked by the zone policy. Review Bot Preference Sync / managed robots too:
   Cloudflare can prepend directives to the origin's robots file. Do not disable
   WAF, account protection, or authentication to make a score pass.
3. Review cache rules so they do not ignore `Vary: Accept` or override origin
   `no-store` on the negotiated public pages and Markdown endpoints. Do not add
   a blanket Cache Everything rule. Remove stale cached 404/challenge responses
   for the affected discovery URLs if present.
4. The origin already serves Markdown, so Cloudflare's Markdown for Agents toggle
   is optional. If using it, scope conversion to public paths. Cloudflare documents
   Pro/Business/Enterprise availability; native origin delivery does not require
   upgrading the plan. Origin Content-Signal headers and `/robots.txt` explicitly
   allow search and AI input and disallow model training. Keep any Cloudflare
   managed Content Signals aligned with that policy; discovery is separate from
   model training.
5. Re-run Cloudflare's scan against the canonical live URL after deployment.
   A local check or Git push cannot establish a new Cloudflare score or crawler traffic.

Cloudflare references:
- https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
- https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/

## Which checklist items need an actual integration?

Technical Groundwork's API Catalog, Link Headers, and Auth.md have origin-side
implementations here. Public Markdown, robots, canonical URLs, sitemap, and
structured data improve discovery without adding user-facing steps.

Advanced Integration is separate product work:

| Check | Requirement before advertising it |
| --- | --- |
| OAuth Discovery / Protected Resource | A supported external-agent authorization/resource flow; the existing GitHub OAuth client is not an authorization server. |
| A2A Agent Card | A real, authenticated A2A service with supported operations. |
| Skills Index | A real supported skills distribution format and maintained skill implementations. |
| MCP Server Card | A functioning MCP server with scoped access and consent. |
| Web Bot Auth / DNS-AID | Verified signing identities and DNS records for outbound agents. |
| WebMCP | Purpose-built browser tools, with consent and the same authorization as the UI. |

Commerce's ACP, AP2, MPP, UCP, and x402 checks are optional payment/product
integrations. They are not prerequisites for search crawlers to read public pages.
Do not publish dummy manifests, fake checkout capabilities, or payment endpoints
just to mark those checks complete.

## Local checks

```bash
curl -i http://localhost:3001/robots.txt
curl -i http://localhost:3001/.well-known/api-catalog
curl -i http://localhost:3001/auth.md
curl -i -H 'Accept: text/markdown' http://localhost:3001/
curl -i -H 'Accept: text/html' http://localhost:3001/
curl -i http://localhost:3001/markdown/privacy
curl -i http://localhost:3001/markdown/dashboard # must not expose private content
```

Blog integration checks need a configured database with published and draft posts.
Use an isolated mocked public-post repository for local validation when no database
credentials are available; never make a draft public or weaken auth as a test shortcut.

# PreFlight authentication

Canonical website: https://www.trypreflight.dev/

## Public information: no authentication

The home page, public policies, agent guides, API catalog, and published blog
posts can be read without a session. Request a public page with
`Accept: text/markdown`, or use the Markdown URLs documented in
https://www.trypreflight.dev/openapi.json.

## Accounts: interactive GitHub sign-in

PreFlight is currently invite-only. A person can start sign-in at
https://www.trypreflight.dev/login, which redirects to GitHub. GitHub handles
consent and returns the person to PreFlight. Approved accounts can use the
dashboard; other requests join the waitlist. A valid referral invitation can
also grant access through the existing invitation flow.

Authentication uses an encrypted, HTTP-only session cookie. Keep passwords,
session cookies, OAuth codes, and tokens private. Never put them into URLs or
public documents, and do not ask users to paste session cookies into an agent.

## External agent access

External agents can use an explicit, run-scoped review grant.
PreFlight is an OAuth client of GitHub, not an OAuth
authorization server for third-party agents. Run review is available through
the authenticated run page's **Copy agent prompt** action. It issues a revocable,
24-hour run-scoped bearer grant for the Streamable HTTP MCP endpoint at
`https://www.trypreflight.dev/api/mcp`. Agents can review recorded evidence and
pinned source, perform owner-authorized read-only database inspection, and save
assessments. Cleanup still requires the owner's Accept/Deny decision. This is
not a general OAuth service. No A2A or agent checkout
endpoint is advertised by this website.

The public OpenAPI document describes read-only content only. Dashboard APIs
remain session-protected and enforce project membership, ownership and administrative checks.
Access to public content does not grant permission to trigger test runs,
change a repository, approve users, or make payments.

Contact hello@trypreflight.dev for integration questions.

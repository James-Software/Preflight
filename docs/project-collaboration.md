# Project collaboration

Project owners invite teammates from **Project → Collaboration**. Accepted projects appear in the teammate's dashboard with a “Shared with you” label. Invitations are specific to one project; connecting an unrelated repository still requires its owner's authorization.

| Capability | Owner | Invited member |
| --- | --- | --- |
| View runs, reports and findings | Yes | Yes |
| Start, cancel, archive and restore runs | Yes | Yes |
| Use the project's saved profiles and database verification | Yes | Yes, without exposing connection credentials |
| Copy prompts, manage findings and open fix PRs | Yes | Yes |
| Manage app/repository settings, profiles and database connections | Yes | No |
| Approve database Cleanup | Yes | No |
| Invite, revoke invitations and remove members | Yes | No |

Invited members do not need to own or independently connect the repository. The server uses the project owner's saved GitHub connection, scoped to that exact project and repository. Every delegated GitHub request rechecks current membership. Encrypted PR worker grants retain that scope, so removing a member also blocks subsequent requests from queued work. GitHub tokens, saved cookies and database connection strings are never returned to collaborators.

## Email setup: Resend free plan

Resend currently offers 3,000 emails per month with a 100-email daily limit on its free plan: <https://resend.com/pricing>. Invitations usually require one email; recipients whose GitHub email cannot be verified also receive a confirmation code.

1. Add your sending domain in Resend and add its specified verification records in Cloudflare DNS. Preserve existing email records unless Resend explicitly requires a change. A sending subdomain is also supported.
2. Create a Resend sending API key and add these variables to the **web app's Production environment in Vercel**:

   ```text
   RESEND_API_KEY=<your sending API key>
   INVITE_FROM_EMAIL=PreFlight <james@trypreflight.dev>
   ```

3. Use an address on the domain verified in Resend, then redeploy the web app. These variables are not needed in Trigger.dev. Both web and worker deployments need the collaboration code for shared PR workers.

Missing configuration or rejected email delivery produces an explicit error. The UI does not claim an email was sent when the provider rejects it.

## Acceptance and revocation

Invitations expire after seven days. Only a hash of each random invitation token is stored; resending rotates the token and revoking invalidates it. A link can bootstrap GitHub sign-in past the beta waitlist, but it does **not** create project membership.

Acceptance requires a matching email verified by GitHub, or a six-digit code delivered to the invited address. Codes expire after ten minutes, are bound to the signed-in account and invitation, and have attempt and sending limits. Accepting consumes the invitation atomically. Removing access also revokes accepted invitations, so old links cannot restore membership. Dedicated test identities cannot invite or join.

Existing owner-only settings boundaries are preserved: `getProject()` defaults to owner access. Shared reads explicitly request member access. Run creation, archive changes and finding actions also enforce membership in their SQL statements. Shared runs reuse the owner's encrypted snapshots server-side, rather than re-encrypting or exposing them to the collaborator.

## Verification

```sh
npm test
npm run build
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/project-collaboration.integration.cjs
```

The optional integration uses real PostgreSQL via PGlite, actual API handlers, invitation/email verification, encrypted profile snapshots and scoped GitHub grants. External mail, GitHub and Trigger calls use controlled transport fixtures; no real invitations are sent. It checks foreign-project denial, owner-only settings, shared run/profile/report/PR access, revoked worker grants, expired invitations and delivery failures.

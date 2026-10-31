# Deleting a project

Owners can use the X on a dashboard project row. A confirmation dialog names the
project and explains the scope. Cancel and Escape do not send a deletion request.
A pending request disables repeated confirmation and dismissal; failures keep the
project and dialog visible for retry. Success refreshes the dashboard.

`DELETE /api/projects/:id` requires the authenticated owner and matching Origin.
Members, guests and unrelated accounts cannot delete a project. Authorization is
rechecked inside a serializable Neon transaction. The transaction locks the root,
collects derived guest and managed test workspaces, and removes project-scoped
runs (including archives), findings, diagnosis/PR metadata, private screenshots,
checks, grants/reviews, profiles/captures, connections, invitations and memberships.
Foreign-key failures roll back the whole operation. Serialization conflicts retry
at most twice. Managed test identities cannot leave orphaned test workspaces.

Account credit history survives with its deleted run reference cleared. Legacy
public screenshots enter the existing durable blob-deletion queue; their retained
private pixels are cleared immediately. Active managed browser/capture resources
are closed after commit. Running agents also observe that their run was removed;
Sandbox sessions have a hard timeout as a fallback.

Deletion removes PreFlight records. It does not delete a GitHub repository, a
hosting deployment, or records in the application's connected database. Re-import
creates a new project ID with no inherited runs, profiles or connections.

Verification uses real Postgres semantics (including forced rollback and every
related table), an actual Neon transaction with disposable verification records,
and the production confirmation component in Chromium. The browser suite checks
focus, Cancel/Escape, server errors, repeated clicks, successful refresh and mobile
layout. It uses controlled local service boundaries and no provider credentials.

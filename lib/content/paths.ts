/** Explicit allowlist: no dashboards, accounts, invitations, or private APIs. */
export function isPublicContentPath(path: string): boolean {
  return ["/", "/privacy", "/terms", "/blog"].includes(path) || /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}

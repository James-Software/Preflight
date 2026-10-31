/** Explicit allowlist: no dashboards, accounts, invitations, or private APIs. */
export function isPublicContentPath(path: string): boolean {
  return ["/", "/privacy", "/terms", "/blog", "/submission", "/submission/briefing", "/submission/architecture", "/submission/economics", "/submission/development", "/submission/verification"].includes(path) || /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}

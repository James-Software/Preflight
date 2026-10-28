import type { AgentAction } from "@/lib/models";
import { safeReplayAction } from "@/lib/finding-evidence";

export type SourceCitation = { path: string; start: number; end: number };
export type CheckInvestigation = {
  state: string;
  conclusion?: string;
  summary?: string;
  source_sha?: string | null;
  deployment_verified?: boolean;
  citations?: SourceCitation[];
  retest_status?: string | null;
};

/** Extra browser time is for observation, never repeating a submission. */
export function retryActionAllowed(action: AgentAction, origin: string) {
  return ["done", "report_bug"].includes(action.action) ||
    safeReplayAction(action, origin);
}
export function retryRequestAllowed(method: string, rawUrl: string, origin: string) {
  try {
    const url = new URL(rawUrl);
    return ["GET", "HEAD", "OPTIONS"].includes(method) &&
      !/\b(?:delete|remove|logout|signout|unsubscribe|revoke|disconnect)\b/i.test(url.pathname) &&
      !Array.from(url.searchParams.keys()).some((key) => /^(action|delete|remove|logout|signout|revoke)$/i.test(key)) &&
      (url.origin === origin || /\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico)$/i.test(url.pathname));
  } catch { return false; }
}

export function investigationSourcePath(path: string) {
  return typeof path === "string" && path.length <= 250 &&
    !/[\s\\\x00-\x1f]/.test(path) &&
    !path.split("/").some((p) => !p || p === "." || p === ".." || p.startsWith(".")) &&
    !/(^|\/)(?:node_modules|vendor|dist|build|coverage|public|fixtures)(\/|$)/i.test(path) &&
    !/(?:secret|credential|private[-_]?key|\.env)/i.test(path) &&
    /\.(?:[cm]?[jt]sx?|css|html|vue|svelte|py|go|rb|php|rs|prisma|sql|json)$/i.test(path) &&
    !/(?:lock|service[-_]?account|token)\.json$/i.test(path);
}

/** A citation must refer to actual, complete lines read at the pinned commit. */
export function validateCodeReview(raw: any, files: Record<string, string>) {
  if (!raw || !["bug_hypothesis", "expected_behavior", "blocked", "unresolved"].includes(raw.conclusion) ||
    typeof raw.summary !== "string" || !raw.summary.trim() || raw.summary.length > 1000 ||
    !Array.isArray(raw.citations) || raw.citations.length > 6 ||
    typeof raw.retestGuidance !== "string" || raw.retestGuidance.length > 1000)
    throw new Error("Invalid code investigation result.");
  const citations: SourceCitation[] = raw.citations.map((c: any) => {
    if (!c || typeof c.path !== "string" || !Object.hasOwn(files, c.path) ||
      !Number.isSafeInteger(c.start) || !Number.isSafeInteger(c.end) ||
      c.start < 1 || c.end < c.start || c.end > files[c.path].split("\n").length ||
      c.end - c.start > 30 || typeof c.quote !== "string" ||
      files[c.path].split("\n").slice(c.start - 1, c.end).join("\n") !== c.quote)
      throw new Error("The code agent cited source it did not read.");
    return { path: c.path, start: c.start, end: c.end };
  });
  if (raw.conclusion !== "unresolved" && !citations.length)
    throw new Error("A code conclusion requires source citations.");
  return {
    conclusion: raw.conclusion as string,
    summary: raw.summary.trim(), citations,
    retestGuidance: raw.retestGuidance.trim(),
  };
}

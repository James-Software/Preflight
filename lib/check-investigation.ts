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
  failure_stage?: string | null;
  regression?: { outcome: string; summary: string; output: string; test: string; loadedPaths: string[]; exitCode: number } | null;
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

/** The model selects source blocks; the server supplies exact lines and quotes. */
export function sourceCitationCatalog(files: Record<string, string>) {
  const blocks: Record<string, { path: string; start: number; end: number; quote: string }> = {};
  for (const [path, source] of Object.entries(files)) {
    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index += 20) {
      const end = Math.min(index + 20, lines.length);
      blocks[`${path}:${index + 1}`] = { path, start: index + 1, end, quote: lines.slice(index, end).join("\n") };
    }
  }
  return blocks;
}

export async function reviewWithSourceCitations(
  files: Record<string, string>,
  generate: (catalog: ReturnType<typeof sourceCitationCatalog>, correction: unknown) => Promise<any>,
  active: () => Promise<boolean>,
) {
  const catalog = sourceCitationCatalog(files);
  let correction: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await active())) throw new Error("Source review is no longer active.");
    const raw = await generate(catalog, correction);
    try {
      const citations = raw?.citations?.map((citation: any) => {
        if (typeof citation?.id !== "string") return citation;
        if (!Object.hasOwn(catalog, citation.id)) throw new Error("Select only citation IDs provided in the source catalog.");
        return catalog[citation.id];
      });
      return validateCodeReview({ ...raw, citations }, files);
    } catch (error) {
      if (attempt === 1) throw error;
      correction = { response: raw, error: error instanceof Error ? error.message : "Invalid source review" };
    }
  }
  throw new Error("Source review could not be validated.");
}

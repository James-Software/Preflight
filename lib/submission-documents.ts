import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const SUBMISSION_DOCUMENTS = [
  { slug: "briefing", title: "Project briefing", file: "executive-briefing.md", description: "Problem, customer, differentiation, distribution and roadmap." },
  { slug: "architecture", title: "System architecture", file: "architecture.md", description: "Trust boundaries, browser evidence and persistent state." },
  { slug: "economics", title: "Commercial model", file: "monetization.md", description: "Proposed pricing, cost assumptions and payment activation status." },
  { slug: "development", title: "Run locally", file: "local-development.md", description: "Dependencies, environment setup and reproducible checks." },
  { slug: "verification", title: "Release verification", file: "release-verification.md", description: "Checks performed and the limits of current evidence." },
] as const;
export async function readSubmissionDocument(slug: string) {
  const item = SUBMISSION_DOCUMENTS.find(item => item.slug === slug);
  return item ? { ...item, body: await readFile(join(process.cwd(), "docs", item.file), "utf8") } : null;
}

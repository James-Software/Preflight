import type { FindingReport } from "@/lib/schema";
export function compactParagraph(text: string, limit = 900) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > limit
    ? `${value.slice(0, limit - 1).trimEnd()}…`
    : value;
}
export function findingFixParagraph(
  finding: Pick<
    FindingReport,
    "id" | "title" | "fix_summary" | "root_cause" | "repro_steps"
  >,
) {
  const summary = finding.fix_summary || finding.root_cause;
  return summary
    ? compactParagraph(summary)
    : `Fix this observed issue: ${compactParagraph(finding.title, 180)}. ${finding.repro_steps ? `Reproduction: ${compactParagraph(finding.repro_steps, 320)}. ` : ""}Inspect the responsible route or interaction handler, correct the behavior described above, and add a focused regression check that reproduces the failure and confirms the expected result. Verify the cause in the source before changing code.`;
}
export function findingPrompt(
  finding: Parameters<typeof findingFixParagraph>[0],
) {
  return `### Bug ${finding.id}: ${compactParagraph(finding.title, 160)}\n\n${findingFixParagraph(finding)}`;
}
export const findingsPrompt = (
  findings: Parameters<typeof findingPrompt>[0][],
) => findings.map(findingPrompt).join("\n\n---\n\n");

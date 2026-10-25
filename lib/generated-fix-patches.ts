import { applyPatch, parsePatch } from "@/lib/fix-patches";
export type SourceEdit = { path: string; search: string; replace: string };
/** Whole-line edits create minimal hunks against an immutable base. Never fuzz. */
export function editsToPatch(
  sources: Map<string, string>,
  edits: SourceEdit[],
) {
  if (!edits.length || edits.length > 12)
    throw new Error(
      "The proposed fix did not include a supported code change.",
    );
  const grouped = new Map<
    string,
    { start: number; old: string[]; replacement: string[] }[]
  >();
  for (const edit of edits) {
    const source = sources.get(edit.path);
    if (
      source === undefined ||
      typeof edit.search !== "string" ||
      typeof edit.replace !== "string" ||
      !edit.search ||
      edit.search === edit.replace
    )
      throw new Error(
        "The proposed fix referenced an unavailable file or empty change.",
      );
    const lines = source.replace(/\n$/, "").split("\n"),
      old = edit.search.replace(/\n$/, "").split("\n");
    const matches = lines
      .map((_, i) => i)
      .filter((i) => old.every((line, j) => lines[i + j] === line));
    if (matches.length !== 1)
      throw new Error(
        `The proposed edit in ${edit.path} is ambiguous or does not match the source. Copy the fix prompt for manual review.`,
      );
    const list = grouped.get(edit.path) || [];
    list.push({
      start: matches[0],
      old,
      replacement: edit.replace
        ? edit.replace.replace(/\n$/, "").split("\n")
        : [],
    });
    grouped.set(edit.path, list);
  }
  let diff = "";
  for (const [path, items] of grouped) {
    items.sort((a, b) => a.start - b.start);
    let delta = 0,
      end = 0;
    const source = sources.get(path)!;
    diff += `--- a/${path}\n+++ b/${path}\n`;
    for (const edit of items) {
      if (edit.start < end)
        throw new Error(`The proposed edits overlap in ${path}.`);
      end = edit.start + edit.old.length;
      const start = edit.start + delta;
      diff += `@@ -${edit.start + 1},${edit.old.length} +${start + (edit.replacement.length ? 1 : 0)},${edit.replacement.length} @@\n`;
      diff +=
        edit.old.map((line) => `-${line}\n`).join("") +
        edit.replacement.map((line) => `+${line}\n`).join("");
      if (!source.endsWith("\n") && end === source.split("\n").length)
        diff += "\\ No newline at end of file\n";
      delta += edit.replacement.length - edit.old.length;
    }
  }
  if (diff.length > 150_000)
    throw new Error("The generated fix is too large for automatic review.");
  for (const file of parsePatch(diff))
    applyPatch(sources.get(file.path)!, file);
  return diff;
}

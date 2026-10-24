export type PatchFile = {
  path: string;
  before: string | null;
  after: string | null;
  hunks: string[];
};

function patchPath(raw: string): string | null {
  const value = raw.split("\t")[0];
  if (value === "/dev/null") return null;
  const path = value.replace(/^[ab]\//, "");
  if (
    !path ||
    /[\s\\\x00-\x1f]/.test(path) ||
    path.startsWith("/") ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
  )
    throw new Error("The proposed patch contains an unsupported file path.");
  return path;
}

/** Accept ordinary unified text diffs; fail closed for binary/rename/mode changes. */
export function parsePatch(diff: string): PatchFile[] {
  if (
    diff.length > 1_000_000 ||
    /^(?:GIT binary patch|Binary files |rename |copy |old mode |new mode |new file mode (?!100644)|deleted file mode (?!100644))/m.test(
      diff,
    )
  )
    throw new Error(
      "This patch needs manual review before it can be opened as a PR.",
    );
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  const files: PatchFile[] = [];
  let current: PatchFile | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ")) {
      const before = patchPath(line.slice(4));
      const after = patchPath(lines[++i].slice(4));
      if ((!before && !after) || (before && after && before !== after))
        throw new Error("Renamed files need manual review.");
      current = { path: (after || before)!, before, after, hunks: [] };
      files.push(current);
    } else if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      /^(new|deleted) file mode 100644$/.test(line)
    ) {
      current = null;
    } else if (
      current &&
      /^(?:@@| |\+|-|\\ No newline at end of file)/.test(line)
    ) {
      current.hunks.push(line);
    } else if (line !== "") {
      throw new Error("The proposed change must be a unified text diff.");
    }
  }
  if (
    !files.length ||
    files.length > 30 ||
    files.some((f) => !f.hunks[0]?.startsWith("@@"))
  )
    throw new Error("No supported code changes were found in this patch.");
  return files;
}

export function applyPatch(
  original: string | null,
  file: PatchFile,
): string | null {
  if ((original === null) !== (file.before === null))
    throw new Error(
      `The base file changed: ${file.path}. Regenerate this fix.`,
    );
  if (original?.includes("\r\n"))
    throw new Error(`The line endings in ${file.path} require manual review.`);
  const source =
    original === null || original === ""
      ? []
      : original.replace(/\n$/, "").split("\n");
  const output: string[] = [];
  let cursor = 0;
  let newline = original === null || original === "" || original.endsWith("\n");
  for (let i = 0; i < file.hunks.length; ) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(
      file.hunks[i++],
    );
    if (!match) throw new Error(`Invalid patch hunk in ${file.path}.`);
    const oldCount = Number(match[2] ?? 1),
      newCount = Number(match[4] ?? 1);
    const start = Number(match[1]) - (oldCount === 0 ? 0 : 1);
    if (start < cursor || start > source.length)
      throw new Error(
        `The patch no longer applies to ${file.path}. Regenerate this fix.`,
      );
    output.push(...source.slice(cursor, start));
    cursor = start;
    if (output.length !== Number(match[3]) - (newCount === 0 ? 0 : 1))
      throw new Error(`Invalid patch position in ${file.path}.`);
    let removed = 0,
      added = 0;
    let previous = "";
    while (i < file.hunks.length && !file.hunks[i].startsWith("@@")) {
      const line = file.hunks[i++];
      const kind = line[0];
      if (line === "\\ No newline at end of file") {
        if (!previous)
          throw new Error(`Invalid newline marker in ${file.path}.`);
        if (previous === "+" || previous === " ") newline = false;
        continue;
      }
      if (kind === " " || kind === "-") {
        if (cursor >= source.length || source[cursor++] !== line.slice(1))
          throw new Error(
            `The patch no longer applies to ${file.path}. Regenerate this fix.`,
          );
        removed++;
      }
      if (kind === " " || kind === "+") {
        output.push(line.slice(1));
        added++;
        newline = true;
      }
      previous = kind;
    }
    if (removed !== oldCount || added !== newCount)
      throw new Error(`Invalid patch line counts in ${file.path}.`);
  }
  if (cursor < source.length) newline = !!original?.endsWith("\n");
  output.push(...source.slice(cursor));
  if (!file.after) {
    if (output.length)
      throw new Error(`The deletion patch for ${file.path} is incomplete.`);
    return null;
  }
  return output.join("\n") + (output.length && newline ? "\n" : "");
}

/** Merge independent fixes against the same base, rejecting conflicting edits. */
export function mergePatches(
  original: string | null,
  files: PatchFile[],
): string | null {
  const results = files.map((file) => applyPatch(original, file));
  if (files.length === 1) return results[0];
  if (results.every((result) => result === results[0])) return results[0];
  if (original === null || results.some((result) => result === null))
    throw new Error(
      `The selected fixes conflict in ${files[0].path}. Open them separately.`,
    );
  type Edit = { start: number; end: number; lines: string[]; newline: boolean };
  const edits: Edit[] = [];
  const source = original === "" ? [] : original.replace(/\n$/, "").split("\n");
  files.forEach((file, index) => {
    let position = 0;
    let edit: Edit | null = null;
    const flush = () => {
      if (edit) edits.push(edit);
      edit = null;
    };
    for (const line of file.hunks) {
      if (line.startsWith("@@")) {
        flush();
        const match = /^@@ -(\d+)(?:,(\d+))?/.exec(line)!;
        position = Number(match[1]) - (Number(match[2] ?? 1) === 0 ? 0 : 1);
      } else if (line[0] === " ") {
        flush();
        position++;
      } else if (line[0] === "-" || line[0] === "+") {
        if (!edit)
          edit = {
            start: position,
            end: position,
            lines: [],
            newline: !!results[index]?.endsWith("\n"),
          };
        if (line[0] === "-") {
          position++;
          edit.end = position;
        } else edit.lines.push(line.slice(1));
      }
    }
    flush();
  });
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  const combined: Edit[] = [];
  for (const edit of edits) {
    const previous = combined[combined.length - 1];
    if (
      previous &&
      previous.start === edit.start &&
      previous.end === edit.end &&
      previous.newline === edit.newline &&
      JSON.stringify(previous.lines) === JSON.stringify(edit.lines)
    )
      continue;
    if (
      previous &&
      (edit.start < previous.end || edit.start === previous.start)
    )
      throw new Error(
        `The selected fixes conflict in ${files[0].path}. Open them separately.`,
      );
    combined.push(edit);
  }
  let newline = original.endsWith("\n");
  const output: string[] = [];
  let cursor = 0;
  for (const edit of combined) {
    output.push(...source.slice(cursor, edit.start), ...edit.lines);
    cursor = edit.end;
    if (edit.end === source.length) newline = edit.newline;
  }
  output.push(...source.slice(cursor));
  return output.join("\n") + (output.length && newline ? "\n" : "");
}

import { randomUUID } from "node:crypto";

export type Scalar = string | number | boolean | null;
export type DatabaseCheck = {
  id: string;
  title: string;
  instructions: string;
  buttonLabel: string;
  query: string;
  operator: "equals" | "changes" | "increases" | "decreases";
  expected: Scalar;
};
export class DatabaseCheckError extends Error {}
export class DatabaseConnectionLocked extends DatabaseCheckError {}
export class DatabaseProviderReconnectRequired extends DatabaseCheckError {}

export function scalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.length <= 512) ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value)))
  );
}
export function checkedQuery(raw: string): string {
  const query = raw.trim().replace(/;\s*$/, "");
  if (
    !query ||
    query.length > 4000 ||
    !/^(select|with)\b/i.test(query) ||
    query.includes("\0")
  )
    throw new DatabaseCheckError(
      "Use a single SELECT query of up to 4,000 characters.",
    );
  const code = query.replace(
    /'(?:''|[^'])*'|\$([a-zA-Z_][a-zA-Z0-9_]*)?\$[\s\S]*?\$\1\$|--[^\n]*|\/\*[\s\S]*?\*\//g,
    " ",
  );
  if (
    /;|\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|copy|execute|call|do|into|set|reset|set_config|nextval|setval|pg_sleep|pg_notify|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink|pg_advisory_lock)\b/i.test(
      code,
    ) ||
    /\$(?:[02-9]|1\d)\d*/.test(code)
  )
    throw new DatabaseCheckError(
      "Checks support read-only SELECT queries with only $1 as an optional test-marker parameter.",
    );
  return query;
}
export function parseDatabaseChecks(input: unknown): DatabaseCheck[] {
  if (!Array.isArray(input) || !input.length || input.length > 10)
    throw new DatabaseCheckError("Add between 1 and 10 database checks.");
  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object")
        throw new DatabaseCheckError("Complete each database check.");
      for (const [field, max] of [
        ["title", 100],
        ["instructions", 1500],
        ["buttonLabel", 100],
        ["query", 4000],
      ] as const)
        if (
          typeof raw[field] !== "string" ||
          !raw[field].trim() ||
          raw[field].length > max
        )
          throw new DatabaseCheckError(
            `Complete the ${field === "buttonLabel" ? "button label" : field} for each check (up to ${max} characters).`,
          );
      if (
        !["equals", "changes", "increases", "decreases"].includes(raw.operator)
      )
        throw new DatabaseCheckError("Choose a database expectation.");
      if (raw.operator === "equals" && !scalar(raw.expected))
        throw new DatabaseCheckError(
          "The expected value must be a JSON string, number, true, false or null.",
        );
      const query = checkedQuery(raw.query);
      if (
        (query.includes("$1") ||
          (typeof raw.expected === "string" &&
            raw.expected.includes("{{marker}}"))) &&
        !raw.instructions.includes("{{marker}}")
      )
        throw new DatabaseCheckError(
          "Include {{marker}} in the browser instructions when the query or expected value uses the test marker.",
        );
      return {
        id:
          typeof raw.id === "string" && /^[0-9a-f-]{36}$/i.test(raw.id)
            ? raw.id
            : randomUUID(),
        title: raw.title.trim(),
        instructions: raw.instructions.trim(),
        buttonLabel: raw.buttonLabel.trim(),
        query,
        operator: raw.operator,
        expected: raw.operator === "equals" ? raw.expected : null,
      };
    })
    .map((check, index, checks) => {
      if (checks.findIndex((c) => c.id === check.id) !== index)
        throw new DatabaseCheckError("Each check needs a unique ID.");
      return check;
    });
}
export function checkMarker(runId: number, checkId: string) {
  return `preflight-${runId}-${checkId.slice(0, 8)}`;
}
export function expectedValue(check: DatabaseCheck, marker: string): Scalar {
  return typeof check.expected === "string"
    ? check.expected.replaceAll("{{marker}}", marker)
    : check.expected;
}
function equal(actual: Scalar, expected: Scalar) {
  return typeof expected === "number" &&
    typeof actual === "string" &&
    /^[-+]?\d+(?:\.\d+)?$/.test(actual)
    ? Number(actual) === expected
    : actual === expected;
}
export function checkObservable(
  check: DatabaseCheck,
  before: Scalar,
  marker: string,
) {
  if (
    check.operator === "equals" &&
    equal(before, expectedValue(check, marker))
  )
    throw new DatabaseCheckError(
      "The expected value is already present before the click. Use {{marker}} or a different expectation so this action can be verified.",
    );
  if (
    ["increases", "decreases"].includes(check.operator) &&
    (typeof before !== "number" || !Number.isFinite(before))
  )
    throw new DatabaseCheckError(
      "Increase/decrease checks must return a number. Cast the result to a numeric type.",
    );
}
export function checkPassed(
  check: DatabaseCheck,
  before: Scalar,
  after: Scalar,
  marker: string,
): boolean {
  if (check.operator === "equals")
    return equal(after, expectedValue(check, marker));
  if (check.operator === "changes") return after !== before;
  if (typeof before !== "number" || typeof after !== "number")
    throw new DatabaseCheckError(
      "Increase/decrease checks must return a number.",
    );
  return check.operator === "increases" ? after > before : after < before;
}

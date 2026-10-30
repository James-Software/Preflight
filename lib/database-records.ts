import type { Client } from "pg";
import { DatabaseCheckError } from "@/lib/database-check-config";

export type RecordTarget = { table: string; key: string; columns: string[] };
export type ObservedRecord = RecordTarget & {
  value: string;
  fingerprint: string;
};
export const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

// Only ordinary public tables with a single numeric/UUID primary key. Read
// labels and marked test emails, never arbitrary rows or credential columns.
// Discover from catalogs, so empty tables work without seed data.
export async function recordTargets(client: Client): Promise<RecordTarget[]> {
  const result = await client.query(`
    SELECT c.relname AS table, pk.attname AS key,
      array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary AND i.indnatts=1
    JOIN pg_attribute pk ON pk.attrelid=c.oid AND pk.attnum=i.indkey[0]
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='public' AND c.relkind='r'
      AND pk.atttypid IN ('int2'::regtype,'int4'::regtype,'int8'::regtype,'uuid'::regtype)
      AND a.atttypid IN ('text'::regtype,'varchar'::regtype)
      AND a.attname ~* '^(name|title|slug|label|display_name|project_name|description|email|email_address)$'
      AND has_table_privilege(c.oid,'SELECT')
    GROUP BY c.relname,pk.attname ORDER BY c.relname LIMIT 24`);
  return result.rows.map((row) => {
    if (
      !Array.isArray(row.columns) ||
      row.columns.some((column: unknown) => typeof column !== "string")
    )
      throw new DatabaseCheckError(
        "Database schema metadata could not be decoded. Update the PreFlight worker and retry.",
      );
    return { ...row, columns: row.columns.slice(0, 6) };
  });
}

export function markerPredicate(target: RecordTarget) {
  return target.columns
    .map((column) => `strpos(t.${identifier(column)}::text, $1) > 0`)
    .join(" OR ");
}

export async function observeRecords(
  client: Client,
  targets: RecordTarget[],
  marker: string,
) {
  const records: ObservedRecord[] = [];
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '2s'");
    for (const target of targets) {
      const result = await client.query({
        text: `SELECT t.${identifier(target.key)}::text AS value, md5(row_to_json(t)::text) AS fingerprint FROM ONLY public.${identifier(target.table)} t WHERE (${markerPredicate(target)}) LIMIT 11`,
        values: [marker],
      });
      if (result.rows.length > 10)
        throw new DatabaseCheckError(
          "Too many test records matched. Automatic verification was stopped.",
        );
      records.push(...result.rows.map((row) => ({ ...target, ...row })));
      if (records.length > 10)
        throw new DatabaseCheckError(
          "Too many test records matched. Automatic verification was stopped.",
        );
    }
    await client.query("COMMIT");
    return records;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof DatabaseCheckError) throw error;
    const code =
      typeof error === "object" && error && "code" in error ? error.code : null;
    if (code === "42501")
      throw new DatabaseCheckError(
        "The database role cannot SELECT from the test tables. Grant read access and start a new run.",
      );
    if (code === "57014")
      throw new DatabaseCheckError(
        "Database inspection timed out. Use a smaller test dataset or an indexed advanced check.",
      );
    throw new DatabaseCheckError(
      "Could not inspect uniquely marked test records. Check database permissions or add an advanced verification check.",
    );
  }
}

// Reject triggers, rewrite rules, inheritance, cascading foreign keys into this table and
// RLS. A one-row DELETE must not silently affect unrelated records via cascades
// or user-defined database behavior. Recheck under a table lock at execution.
export async function cleanupEligible(client: Client, target: RecordTarget) {
  const { rows } = await client.query({
    text: `
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary AND i.indnatts=1
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=i.indkey[0]
    WHERE n.nspname='public' AND c.relname=$1 AND c.relkind='r'
      AND a.attname=$2 AND a.atttypid IN ('int2'::regtype,'int4'::regtype,'int8'::regtype,'uuid'::regtype)
      AND NOT c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)
      AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid=c.oid AND contype='f' AND confdeltype NOT IN ('a','r'))
      AND NOT EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_inherits WHERE inhparent=c.oid OR inhrelid=c.oid)`,
    values: [target.table, target.key],
  });
  return rows.length === 1;
}

export function cleanupStatement(record: ObservedRecord) {
  return `DELETE FROM ONLY public.${identifier(record.table)} AS t\nWHERE t.${identifier(record.key)}::text = $2\n  AND (${markerPredicate(record)})\n  AND md5(row_to_json(t)::text) = $3;`;
}

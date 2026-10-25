import { Client } from "pg";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  checkedQuery,
  scalar,
  DatabaseCheckError,
  type Scalar,
} from "@/lib/database-check-config";

export function parsePostgresUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.includes(".") ||
      isIP(url.hostname) ||
      url.hash ||
      !url.username ||
      !url.password ||
      url.pathname.length < 2
    )
      throw new Error();
    if (
      url.searchParams.has("sslmode") &&
      !["require", "verify-full", "verify-ca"].includes(
        url.searchParams.get("sslmode")!,
      )
    )
      throw new Error();
    for (const key of url.searchParams.keys())
      if (!["sslmode", "channel_binding"].includes(key)) throw new Error();
    const port = Number(url.port || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
    return {
      hostname: url.hostname,
      port,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  } catch {
    throw new DatabaseCheckError(
      "Use a hosted PostgreSQL URL with a database, username and password. TLS is required; sslmode and channel_binding are the supported URL options.",
    );
  }
}
export function publicDatabaseAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const [first, second] = address
      .split(":")
      .map((part) => parseInt(part || "0", 16));
    return (
      first >= 0x2000 &&
      first < 0x4000 &&
      first !== 0x2002 &&
      first !== 0x3fff &&
      !(
        first === 0x2001 &&
        (second === 0 ||
          second === 2 ||
          second === 0xdb8 ||
          (second >= 0x10 && second <= 0x2f))
      )
    );
  }
  return false;
}
export async function postgresClient(connectionString: string) {
  const config = parsePostgresUrl(connectionString);
  let addresses;
  try {
    addresses = await lookup(config.hostname, { all: true, verbatim: true });
  } catch {
    throw new DatabaseCheckError(
      "Could not resolve the PostgreSQL hostname. Check the connection URL.",
    );
  }
  if (
    !addresses.length ||
    addresses.some((a) => !publicDatabaseAddress(a.address))
  )
    throw new DatabaseCheckError(
      "Use a publicly reachable hosted PostgreSQL database. Private, loopback and reserved addresses are not supported.",
    );
  const address = addresses.find((a) => a.family === 4) || addresses[0];
  // Pin the validated address while verifying TLS against the original hostname.
  const client = new Client({
    host: address.address,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: { servername: config.hostname, rejectUnauthorized: true },
    enableChannelBinding: true,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    application_name: "PreFlight read-only verification",
  });
  client.on("error", () => {});
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => {});
    throw new DatabaseCheckError(
      "Could not connect to PostgreSQL. Check the read-only credentials, TLS and network access.",
    );
  }
  return client;
}

export async function postgresReader(connectionString: string) {
  const client = await postgresClient(connectionString);
  return {
    async read(raw: string, marker: string): Promise<Scalar> {
      const query = checkedQuery(raw);
      try {
        await client.query("BEGIN READ ONLY");
        await client.query("SET LOCAL statement_timeout = '3s'");
        await client.query("SET LOCAL lock_timeout = '1s'");
        // A bound marker forces the extended protocol: stacked statements cannot execute.
        // Limit row count and serialized result size before data leaves the database.
        const result = await client.query({
          text: `WITH __preflight_marker AS (SELECT $1::text AS marker) SELECT left(row_to_json(__preflight_row)::text, 4097) AS payload FROM (${query}) AS __preflight_row LIMIT 2`,
          values: [marker],
        });
        await client.query("COMMIT");
        if (
          result.rows.length !== 1 ||
          typeof result.rows[0].payload !== "string" ||
          result.rows[0].payload.length > 4096
        )
          throw new DatabaseCheckError(
            "The check must return one row with one small scalar column.",
          );
        const values = Object.values(JSON.parse(result.rows[0].payload));
        if (values.length !== 1 || !scalar(values[0]))
          throw new DatabaseCheckError(
            "Return one boolean, number, null or short text value from this check.",
          );
        return values[0];
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error instanceof DatabaseCheckError
          ? error
          : new DatabaseCheckError(
              "Could not read this check. Confirm the SELECT query and the database user’s read-only permissions.",
            );
      }
    },
    async close() {
      await client.end().catch(() => {});
    },
  };
}

import { neon } from "@neondatabase/serverless";

/* ------------------------------------------------------------------ */
/* Serverless Postgres (Neon). The connection string lives in the      */
/* DATABASE_URL environment variable, set in Vercel: project →        */
/* Settings → Environment Variables. Never commit it to the repo.     */
/* ------------------------------------------------------------------ */

type SqlClient = ReturnType<typeof neon>;

let client: SqlClient | null = null;

export function getSql(): SqlClient {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add it in Vercel: project → Settings → Environment Variables.",
      );
    }
    client = neon(url);
  }
  return client;
}

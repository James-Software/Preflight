import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/waitlist — join the early-access list.
 * Body: { email: string }
 *
 * The table creates itself on first hit (idempotent), so there is no
 * manual migration step: point DATABASE_URL at Neon and it just works.
 * Duplicate emails are treated as success — no existence oracle.
 */
export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    const rows = (await sql`
      INSERT INTO waitlist (email) VALUES (${email})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `) as { id: number }[];
    return NextResponse.json({ ok: true, duplicate: rows.length === 0 });
  } catch (err) {
    console.error("waitlist signup failed", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

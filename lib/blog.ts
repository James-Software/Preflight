import { getSql } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Blog. Posts live in Neon; the table creates itself on first use     */
/* (same pattern as the rest of the schema). Only published posts are  */
/* ever visible publicly — drafts stay behind the admin gate.          */
/* ------------------------------------------------------------------ */

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  markdown: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export async function ensureBlogTables(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      markdown TEXT NOT NULL DEFAULT '',
      published BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/** Normalize a slug: lowercase, hyphens, URL-safe. */
export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function listPublishedPosts(): Promise<BlogPost[]> {
  await ensureBlogTables();
  const rows = await getSql()`
    SELECT id, slug, title, description, markdown, published, created_at, updated_at FROM blog_posts
    WHERE published = TRUE
    ORDER BY created_at DESC
  `;
  return (Array.isArray(rows) ? rows : []) as BlogPost[];
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  await ensureBlogTables();
  const rows = await getSql()`
    SELECT id, slug, title, description, markdown, published, created_at, updated_at FROM blog_posts
    WHERE slug = ${slug} AND published = TRUE
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0
    ? (rows[0] as BlogPost)
    : null;
}

/* ------------------------- admin (gated) ------------------------- */

export async function listAllPosts(): Promise<BlogPost[]> {
  await ensureBlogTables();
  const rows = await getSql()`
    SELECT id, slug, title, description, markdown, published, created_at, updated_at FROM blog_posts
    ORDER BY created_at DESC
  `;
  return (Array.isArray(rows) ? rows : []) as BlogPost[];
}

export async function getPostById(id: number): Promise<BlogPost | null> {
  await ensureBlogTables();
  const rows = await getSql()`
    SELECT id, slug, title, description, markdown, published, created_at, updated_at FROM blog_posts WHERE id = ${id} LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0
    ? (rows[0] as BlogPost)
    : null;
}

export async function createPost(input: {
  slug: string;
  title: string;
  description: string;
  markdown: string;
  published: boolean;
}): Promise<BlogPost> {
  await ensureBlogTables();
  const slug = normalizeSlug(input.slug || input.title);
  if (!slug) throw new Error("Slug is empty after normalization.");
  if (!input.title.trim()) throw new Error("Title is required.");
  const rows = await getSql()`
    INSERT INTO blog_posts (slug, title, description, markdown, published)
    VALUES (${slug}, ${input.title.trim()}, ${input.description.trim() || null},
            ${input.markdown}, ${input.published})
    RETURNING id, slug, title, description, markdown, published, created_at, updated_at
  `;
  return (rows as BlogPost[])[0];
}

export async function updatePost(
  id: number,
  input: {
    slug: string;
    title: string;
    description: string;
    markdown: string;
    published: boolean;
  },
): Promise<BlogPost> {
  await ensureBlogTables();
  const slug = normalizeSlug(input.slug || input.title);
  if (!slug) throw new Error("Slug is empty after normalization.");
  if (!input.title.trim()) throw new Error("Title is required.");
  const rows = await getSql()`
    UPDATE blog_posts
    SET slug = ${slug},
        title = ${input.title.trim()},
        description = ${input.description.trim() || null},
        markdown = ${input.markdown},
        published = ${input.published},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, slug, title, description, markdown, published, created_at, updated_at
  `;
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("Post not found.");
  return (rows as BlogPost[])[0];
}

export async function deletePost(id: number): Promise<void> {
  await ensureBlogTables();
  await getSql()`DELETE FROM blog_posts WHERE id = ${id}`;
}

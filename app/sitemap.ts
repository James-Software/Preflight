import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listPublishedPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;

  let posts: { slug: string; updated_at: string }[] = [];
  try {
    posts = await listPublishedPosts();
  } catch {
    posts = [];
  }

  return [
    {
      url: base,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/blog`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...posts.map((p) => ({
      url: `${base}/blog/${encodeURIComponent(p.slug)}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${base}/privacy`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}

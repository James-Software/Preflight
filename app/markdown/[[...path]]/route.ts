import { getPostBySlug, listPublishedPosts } from "@/lib/blog";
import { frontmatter, staticDocument, type PublicDocument } from "@/lib/content/public-markdown";
import { isPublicContentPath } from "@/lib/content/paths";
import { CONTENT_SIGNALS, DISCOVERY_LINKS, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: segments = [] } = await params;
  if (segments.some(segment => !segment || /[\\/]/.test(segment) || segment === "." || segment === "..")) {
    return new Response("Not found\n", { status: 404 });
  }
  const path = segments.length ? `/${segments.join("/")}` : "/";
  if (!isPublicContentPath(path)) return new Response("Not found\n", { status: 404 });
  let document: PublicDocument | null = staticDocument(path);
  try {
    if (path === "/blog") {
      const posts = (await listPublishedPosts()).filter(post => post.published === true);
      document = { path, title: "PreFlight Blog", body: `# Blog\n\nNotes on AI testing, agent swarms, and shipping software that is ready to fly.\n\n${posts.length ? posts.map(post => `## [${post.title.replace(/[\[\]\n\r]/g, " ")}](${SITE_URL}/blog/${encodeURIComponent(post.slug)})\n\n${post.description ?? ""}`).join("\n\n") : "No posts yet. Check back soon."}` };
    } else if (path.startsWith("/blog/")) {
      const post = await getPostBySlug(segments[1]);
      // Reuse the public query, which excludes every unpublished draft.
      if (!post || post.published !== true) return new Response("Not found\n", { status: 404, headers: { "Cache-Control": "no-store" } });
      document = { path, title: post.title, description: post.description ?? undefined,
        body: `# ${post.title}\n\nPublished: ${new Date(post.created_at).toISOString()}\nUpdated: ${new Date(post.updated_at).toISOString()}\n\n${post.description ? `${post.description}\n\n` : ""}${post.markdown}` };
    }
  } catch {
    return new Response("Public content is temporarily unavailable. Please try again later.\n", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  if (!document) return new Response("Not found\n", { status: 404 });
  return new Response(frontmatter(document), { headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Accept",
    "X-Content-Type-Options": "nosniff",
    "Content-Signal": CONTENT_SIGNALS,
    "Link": `${DISCOVERY_LINKS}, <${SITE_URL}${path}>; rel="canonical"`,
  } });
}

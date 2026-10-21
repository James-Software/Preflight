import type { Metadata } from "next";
import { publicAlternates } from "@/lib/site";
import { listPublishedPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  alternates: publicAlternates("/blog"),
  description:
    "Notes on AI testing, agent swarms, and shipping software that is ready to fly.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts();

  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-3xl px-6 pb-20 pt-32 md:pb-28 md:pt-36">
        <a
          href="/"
          className="text-sm font-medium text-ink/50 transition-colors duration-150 hover:text-ink dark:text-white/50 dark:hover:text-white"
        >
          &larr; Back to PreFlight
        </a>
        <h1 className="font-sans mt-8 text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">
          Blog
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink/60 dark:text-white/60">
          Notes on AI testing, agent swarms, and what it takes to ship
          software that is ready to fly.
        </p>

        <div className="mt-12">
          {posts.length === 0 ? (
            <p className="rounded-xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-ink/40 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/40">
              No posts yet. Check back soon.
            </p>
          ) : (
            <ul className="divide-y divide-ink/10 border-y border-ink/10 dark:divide-white/10 dark:border-white/10">
              {posts.map((post) => (
                <li key={post.id}>
                  <a href={`/blog/${post.slug}`} className="group block py-7">
                    <p className="font-mono text-xs text-ink/40 dark:text-white/40">
                      {formatDate(post.created_at)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink transition-colors duration-150 group-hover:text-primary dark:text-white">
                      {post.title}
                    </h2>
                    {post.description ? (
                      <p className="mt-2 text-base leading-relaxed text-ink/60 dark:text-white/55">
                        {post.description}
                      </p>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPostBySlug } from "@/lib/blog";
import Markdown from "@/components/Markdown";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Not found | PreFlight" };
  return {
    title: `${post.title} | PreFlight`,
    description: post.description ?? undefined,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="min-h-screen bg-page">
      <article className="mx-auto max-w-3xl px-6 pb-20 pt-32 md:pb-28 md:pt-36">
        <a
          href="/blog"
          className="text-sm font-medium text-ink/50 transition-colors duration-150 hover:text-ink dark:text-white/50 dark:hover:text-white"
        >
          &larr; All posts
        </a>
        <p className="mt-8 font-mono text-xs text-ink/40 dark:text-white/40">
          {formatDate(post.created_at)}
        </p>
        <h1 className="font-sans mt-3 text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl dark:text-white">
          {post.title}
        </h1>
        {post.description ? (
          <p className="mt-4 text-lg leading-relaxed text-ink/60 dark:text-white/60">
            {post.description}
          </p>
        ) : null}
        <div className="mt-10 border-t border-ink/10 pt-2 dark:border-white/10">
          <Markdown content={post.markdown} />
        </div>
      </article>
    </main>
  );
}

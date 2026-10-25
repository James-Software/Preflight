import { serializeJsonLd } from "@/lib/structured-data";
import type { Metadata } from "next";
import { publicAlternates, SITE_URL, SITE_PREVIEW_IMAGE } from "@/lib/site";
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
    title: post.title,
    alternates: publicAlternates(`/blog/${encodeURIComponent(slug)}`),
    openGraph: {
      type: "article",
      images: [SITE_PREVIEW_IMAGE],
      title: post.title,
      publishedTime: new Date(post.created_at).toISOString(),
      modifiedTime: new Date(post.updated_at).toISOString(),
    },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            ...(post.description ? { description: post.description } : {}),
            datePublished: new Date(post.created_at).toISOString(),
            dateModified: new Date(post.updated_at).toISOString(),
            mainEntityOfPage: `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`,
            publisher: {
              "@type": "Organization",
              name: "PreFlight",
              url: SITE_URL,
            },
          }),
        }}
      />
      <article className="mx-auto max-w-3xl px-6 pb-20 pt-32 md:pb-28 md:pt-36">
        <a
          href="/blog"
          className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
        >
          &larr; All posts
        </a>
        <h1 className="mt-10 text-balance text-4xl font-medium leading-[1.1] tracking-tight text-ink md:text-5xl dark:text-white">
          {post.title}
        </h1>
        <time
          dateTime={new Date(post.created_at).toISOString()}
          className="mt-5 block text-sm text-muted"
        >
          {formatDate(post.created_at)}
        </time>
        {post.description ? (
          <p className="mt-4 text-lg leading-relaxed text-muted dark:text-muted">
            {post.description}
          </p>
        ) : null}
        <div className="mt-12">
          <Markdown content={post.markdown} />
        </div>
      </article>
    </main>
  );
}

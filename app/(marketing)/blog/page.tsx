import type { Metadata } from "next";
import { publicAlternates } from "@/lib/site";
import { listPublishedPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  alternates: publicAlternates("/blog"),
  description:
    "Notes on building PreFlight: browser testing, bugs and the evidence behind a fix.",
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
    <main className="min-h-[calc(100svh-7rem)] bg-page">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-36 md:pt-44">
        <h1 className="max-w-4xl text-balance text-4xl font-medium leading-[1.05] tracking-[-0.04em] text-ink md:text-6xl dark:text-white">
          Notes from the build.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
          What we're testing, what broke, and what we're learning while building
          PreFlight.
        </p>

        <div className="mt-14 md:mt-20">
          {posts.length === 0 ? (
            <div className="max-w-2xl rounded-lg bg-panel px-6 py-8 md:px-8">
              <p className="text-xl font-medium">No posts yet.</p>
              <a
                href="/#how-it-works"
                className="mt-4 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-primary"
              >
                See how PreFlight works
              </a>
            </div>
          ) : (
            <ul className="space-y-8 md:space-y-12">
              {posts.map((post) => (
                <li key={post.id}>
                  <a
                    href={`/blog/${post.slug}`}
                    className="group grid max-w-5xl gap-4 py-2 md:grid-cols-[160px_minmax(0,1fr)] md:gap-10"
                  >
                    <time
                      dateTime={new Date(post.created_at).toISOString()}
                      className="text-sm leading-relaxed text-muted md:pt-1.5"
                    >
                      {formatDate(post.created_at)}
                    </time>
                    <div>
                      <h2 className="max-w-2xl text-2xl font-medium leading-tight tracking-tight text-ink decoration-primary underline-offset-[6px] group-hover:underline md:text-4xl dark:text-white">
                        {post.title}
                      </h2>
                      {post.description ? (
                        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
                          {post.description}
                        </p>
                      ) : null}
                    </div>
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

export default function PostNotFound() {
  return (
    <main className="flex min-h-svh items-center bg-page px-6 pb-20 pt-32">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight">
          Post not found.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
          This article may have moved or is no longer published. You can find
          the latest posts on the blog.
        </p>
        <a
          href="/blog"
          className="pressable btn-gradient mt-8 inline-flex min-h-11 items-center rounded-full px-6 py-3 text-sm font-medium text-white"
        >
          All blog posts
        </a>
      </div>
    </main>
  );
}

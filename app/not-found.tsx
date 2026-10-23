import Brand from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col bg-page px-6 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <Brand />
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center py-16">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Page not found.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          The link may have changed. Head home or read the latest from
          PreFlight.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <a
            href="/"
            className="pressable btn-gradient inline-flex min-h-11 items-center rounded-full px-6 py-3 text-sm font-medium text-white"
          >
            Back to home
          </a>
          <a
            href="/blog"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            Read the blog
          </a>
        </div>
      </div>
    </main>
  );
}

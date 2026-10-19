export default function Footer() {
  return (
    <footer className="border-t border-ink/10 dark:border-white/10 bg-page">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
        <p className="font-display text-sm font-bold tracking-tight text-ink dark:text-white">
          PreFlight
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <a
            href="/privacy"
            className="text-sm text-ink/45 transition-colors duration-150 hover:text-ink dark:text-white/45 dark:hover:text-white"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="text-sm text-ink/45 transition-colors duration-150 hover:text-ink dark:text-white/45 dark:hover:text-white"
          >
            Terms of Service
          </a>
          <a
            href="/blog"
            className="text-sm text-ink/45 transition-colors duration-150 hover:text-ink dark:text-white/45 dark:hover:text-white"
          >
            Blog
          </a>
          <a
            href="/llms.txt"
            className="text-sm text-ink/45 transition-colors duration-150 hover:text-ink dark:text-white/45 dark:hover:text-white"
          >
            For agents
          </a>
        </div>
        <p className="text-sm text-ink/45 dark:text-white/45">&copy; 2026</p>
      </div>
    </footer>
  );
}

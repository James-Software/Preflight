export default function Footer() {
  return (
    <footer className="bg-page">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-6 py-10 sm:flex-row">
        <p className="font-display text-sm font-bold tracking-tight text-ink dark:text-white">
          PreFlight
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <a
            href="/privacy"
            className="text-sm text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="text-sm text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
          >
            Terms of Service
          </a>
          <a
            href="/blog"
            className="text-sm text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
          >
            Blog
          </a>
          <a
            href="/llms.txt"
            className="text-sm text-muted transition-colors duration-150 hover:text-ink dark:text-muted dark:hover:text-white"
          >
            For agents
          </a>
        </div>
        <p className="text-sm text-muted dark:text-muted">&copy; 2026 PreFlight</p>
      </div>
    </footer>
  );
}

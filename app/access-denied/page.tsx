export default function AccessDenied() {
  return (
    <main className="flex min-h-svh items-center justify-center pb-16 pt-28 px-6 bg-page">
      <div className="max-w-sm text-center">
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink dark:text-white">
          You are on the waitlist
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/60 dark:text-white/60">
          PreFlight is invite-only right now. If you were expecting access,
          email{" "}
          <a
            href="mailto:hello@trypreflight.dev"
            className="font-medium text-ink underline underline-offset-2 transition-colors duration-150 hover:text-ink/70 dark:text-white dark:hover:text-white/70"
          >
            hello@trypreflight.dev
          </a>
          .
        </p>
        <a
          href="/"
          className="pressable btn-gradient mt-8 inline-block rounded-full px-6 py-3 text-sm font-medium text-white"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}

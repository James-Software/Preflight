export default function EarlyAccess() {
  return (
    <section id="early-access" className="bg-[#fafafa] py-24 md:py-32 dark:bg-[#05060a]">
      <div className="mx-auto max-w-xl px-6 text-center">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary">
          EARLY ACCESS
        </p>
        <h2 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink md:text-4xl dark:text-white">
          Be first in line for takeoff.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink/60 dark:text-white/60">
          PreFlight is in final approach. Join the waitlist with GitHub. Every
          request is reviewed by hand.
        </p>
        <a
          href="/login"
          className="pressable btn-gradient mt-8 inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-medium text-white"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          Join the waitlist with GitHub
        </a>
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-ink/40 dark:text-white/40">
          By joining the waitlist, you agree to our{" "}
          <a
            href="/terms"
            className="underline underline-offset-2 transition-colors duration-150 hover:text-ink dark:hover:text-white"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="underline underline-offset-2 transition-colors duration-150 hover:text-ink dark:hover:text-white"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </section>
  );
}

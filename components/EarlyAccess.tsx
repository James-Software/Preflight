export default function EarlyAccess() {
  return (
    <section id="early-access" className="scroll-mt-20 bg-[#fafafa] px-[2vw] pb-16 dark:bg-[#05060a]">
      <div className="mx-auto max-w-6xl rounded-[1.75rem] bg-[linear-gradient(to_top_right,#4e2fd8_0%,#6a6df5_48%,#8aa5ff_100%)] px-6 py-20 text-center md:rounded-[2.5rem] md:py-24">
        <p className="text-xs font-semibold tracking-[0.22em] text-white/75">
          EARLY ACCESS
        </p>
        <h2 className="mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Find the bugs before your users do.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/80 md:text-lg">
          A fresh set of eyes on every journey. Join the early-access waitlist
          with GitHub. Every request is reviewed by hand.
        </p>
        <a
          href="/login"
          className="pressable mt-8 inline-flex items-center justify-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-8px_rgba(20,16,80,0.3)] transition-colors hover:bg-white/90"
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
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-white/75">
          By joining the waitlist, you agree to our{" "}
          <a
            href="/terms"
            className="underline underline-offset-2 transition-colors duration-150 hover:text-white"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="underline underline-offset-2 transition-colors duration-150 hover:text-white"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </section>
  );
}

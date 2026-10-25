/** One logo and wordmark across public pages and the application. */
export default function Brand({
  href = "/",
  scrolled = true,
}: {
  href?: string;
  scrolled?: boolean;
}) {
  return (
    <a
      href={href}
      className="flex min-w-0 shrink-0 items-center gap-2.5"
      aria-label="PreFlight home"
    >
      <span
        className="relative block h-[26px] w-16 sm:w-[92px] md:h-[30px] md:w-[106px]"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          className={`absolute inset-0 m-auto h-[26px] w-auto md:h-[30px] ${scrolled ? "dark:hidden" : ""}`}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-white.png"
          alt=""
          className={`absolute inset-0 m-auto hidden h-[26px] w-auto md:h-[30px] ${scrolled ? "dark:block" : ""}`}
        />
      </span>
      <span className="brand-wordmark hidden font-display text-lg font-bold tracking-tight text-ink sm:inline dark:text-white">
        PreFlight
      </span>
    </a>
  );
}

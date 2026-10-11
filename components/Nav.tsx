import { PixelSprite, PLANE_MAP, PLANE_PALETTE } from "./pixel-art";

export default function Nav() {
  return (
    <nav className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        {/* logo slot: wordmark for now — James is making the logo */}
        <a href="#top" className="flex items-center gap-2.5">
          <PixelSprite map={PLANE_MAP} palette={PLANE_PALETTE} pixel={1.4} />
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            Preflight
          </span>
        </a>
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#how-it-works"
            className="text-sm font-medium text-ink/60 transition-colors duration-150 hover:text-ink"
          >
            How it works
          </a>
        </div>
        <a
          href="#early-access"
          className="pressable rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-deep"
        >
          Get early access
        </a>
      </div>
    </nav>
  );
}

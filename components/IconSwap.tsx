import type { ReactNode } from "react";

/** Shared blur/scale crossfade for compact, reversible icon feedback. */
export default function IconSwap({
  active,
  idleIcon,
  activeIcon,
}: {
  active: boolean;
  idleIcon: ReactNode;
  activeIcon: ReactNode;
}) {
  return (
    <span aria-hidden="true" className="icon-swap pointer-events-none inline-grid h-4 w-4 place-items-center">
      <span className="icon-swap__icon" data-visible={!active}>{idleIcon}</span>
      <span className="icon-swap__icon" data-visible={active}>{activeIcon}</span>
    </span>
  );
}

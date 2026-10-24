"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingLabel,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      disabled={pending}
      aria-busy={pending}
      className={`min-h-11 cursor-pointer disabled:cursor-wait disabled:opacity-60 ${className ?? "pressable btn-gradient rounded-full px-5 py-2 text-sm font-medium text-white"}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

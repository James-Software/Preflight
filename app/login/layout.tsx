import type { Metadata } from "next";
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-svh bg-black text-white">{children}</div>;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

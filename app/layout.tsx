import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preflight",
  description:
    "Preflight allows an agent swarm to automatically review your application to confirm it is ready for takeoff.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

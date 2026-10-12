import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Preflight — Cleared for takeoff",
  description:
    "Preflight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as fix.",
};

export const viewport: Viewport = {
  themeColor: "#4a7cff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${sans.variable} font-sans bg-white text-ink antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

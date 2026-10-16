import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

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
  metadataBase: new URL("https://www.trypreflight.dev"),
  title: {
    default: "PreFlight — AI Agents That Test Your App Like Real Users",
    template: "%s | PreFlight",
  },
  description:
    "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as fix.",
  openGraph: {
    title: "PreFlight — AI Agents That Test Your App Like Real Users",
    description:
      "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as fix.",
    url: "https://www.trypreflight.dev",
    siteName: "PreFlight",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PreFlight — AI Agents That Test Your App Like Real Users",
    description:
      "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as fix.",
  },
  robots: {
    index: true,
    follow: true,
  },
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

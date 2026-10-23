import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/components/Providers";
import { SITE_URL } from "@/lib/site";

const display = localFont({
  src: [
    { path: "./fonts/space-grotesk-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/space-grotesk-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/space-grotesk-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
});

const sans = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PreFlight: AI Agents That Test Your App Like Real Users",
    template: "%s | PreFlight",
  },
  description:
    "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as a fix.",
  openGraph: {
    title: "PreFlight: AI Agents That Test Your App Like Real Users",
    description:
      "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as a fix.",
    url: SITE_URL,
    siteName: "PreFlight",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PreFlight: AI Agents That Test Your App Like Real Users",
    description:
      "PreFlight sends a swarm of AI agents to test your app like real users. Every bug they find comes back as a fix.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#4a7cff",
};

// Runs before first paint: picks the theme from the saved choice, else the
// OS setting, else dark (the brand default). Setting the class this early
// means no flash of the wrong theme.
const THEME_SCRIPT = `(function(){var el=document.documentElement;try{var s=localStorage.getItem("preflight-theme");var theme=s==="light"||s==="dark"?s:window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";el.classList.toggle("dark",theme==="dark");el.style.colorScheme=theme}catch(e){var dark=!window.matchMedia("(prefers-color-scheme: light)").matches;el.classList.toggle("dark",dark);el.style.colorScheme=dark?"dark":"light"}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${display.variable} ${sans.variable} font-sans bg-page text-ink antialiased dark:text-white`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

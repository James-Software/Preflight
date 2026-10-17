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

// Runs before first paint: picks the theme from the saved choice, else the
// OS setting, else dark (the brand default). Setting the class this early
// means no flash of the wrong theme.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("preflight-theme");var dark=s==="dark"||(!s&&!window.matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.classList.toggle("dark",dark)}catch(e){document.documentElement.classList.add("dark")}})();`;

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
        className={`${display.variable} ${sans.variable} font-sans bg-[#fafafa] text-ink antialiased dark:bg-[#05060a] dark:text-white`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

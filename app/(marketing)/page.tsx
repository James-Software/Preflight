import { serializeJsonLd } from "@/lib/structured-data";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { publicAlternates, SITE_URL, SITE_DESCRIPTION } from "@/lib/site";
import Hero from "@/components/Hero";
import ProductOverview from "@/components/ProductOverview";
import EarlyAccess from "@/components/EarlyAccess";
import "@/components/landing.css";

const flight = localFont({
  src: "../fonts/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-flight",
  display: "swap",
});

export const metadata: Metadata = { alternates: publicAlternates("/") };

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "PreFlight", url: SITE_URL, email: "james@trypreflight.dev" },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "PreFlight", url: SITE_URL, publisher: { "@id": `${SITE_URL}/#organization` } },
    { "@type": "SoftwareApplication", name: "PreFlight", url: SITE_URL, applicationCategory: "DeveloperApplication", operatingSystem: "Web", description: SITE_DESCRIPTION, publisher: { "@id": `${SITE_URL}/#organization` } },
  ],
};

export default function Home() {
  return (
    <main className={`${flight.variable} flight-page`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <Hero />
      <ProductOverview />
      <EarlyAccess />
    </main>
  );
}

import { serializeJsonLd } from "@/lib/structured-data";
import type { Metadata } from "next";
import { publicAlternates, SITE_URL, SITE_DESCRIPTION } from "@/lib/site";
import Hero from "@/components/Hero";
import ProofChapter from "@/components/ProofChapter";
import Capabilities from "@/components/Capabilities";
import EarlyAccess from "@/components/EarlyAccess";

export const metadata: Metadata = { alternates: publicAlternates("/") };

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "PreFlight", url: SITE_URL, email: "hello@trypreflight.dev" },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "PreFlight", url: SITE_URL, publisher: { "@id": `${SITE_URL}/#organization` } },
    { "@type": "SoftwareApplication", name: "PreFlight", url: SITE_URL, applicationCategory: "DeveloperApplication", operatingSystem: "Web", description: SITE_DESCRIPTION, publisher: { "@id": `${SITE_URL}/#organization` } },
  ],
};

export default function Home() {
  return (
    <main className="bg-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <Hero />
      <ProofChapter />
      <Capabilities />
      <EarlyAccess />
    </main>
  );
}

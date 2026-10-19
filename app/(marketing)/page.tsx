import Hero from "@/components/Hero";
import ProofChapter from "@/components/ProofChapter";
import Capabilities from "@/components/Capabilities";
import EarlyAccess from "@/components/EarlyAccess";

export default function Home() {
  return (
    <main className="bg-page">
      <Hero />
      <ProofChapter />
      <Capabilities />
      <EarlyAccess />
    </main>
  );
}

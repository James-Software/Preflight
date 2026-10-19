import { auth } from "@/auth";
import Hero from "@/components/Hero";
import PixelRain from "@/components/PixelRain";
import ProofChapter from "@/components/ProofChapter";
import Capabilities from "@/components/Capabilities";
import EarlyAccess from "@/components/EarlyAccess";
import Footer from "@/components/Footer";

export default async function Home() {
  // Session is resolved server-side so the nav renders the right buttons
  // in the first paint — no client-side session fetch, no empty nav.
  const session = await auth();
  return (
    <main className="bg-[#fafafa] dark:bg-[#05060a]">
      <Hero user={session?.user ?? null} />
      <div className="relative">
        <PixelRain />
        <ProofChapter />
        <Capabilities />
        <EarlyAccess />
        <Footer />
      </div>
    </main>
  );
}

import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import SwarmDemo from "@/components/SwarmDemo";
import EarlyAccess from "@/components/EarlyAccess";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="bg-white">
      <Hero />
      <HowItWorks />
      <SwarmDemo />
      <EarlyAccess />
      <Footer />
    </main>
  );
}

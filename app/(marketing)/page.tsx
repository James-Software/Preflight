import Hero from "@/components/Hero";
import SwarmDemo from "@/components/SwarmDemo";
import EarlyAccess from "@/components/EarlyAccess";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="bg-white">
      <Hero />
      <SwarmDemo />
      <EarlyAccess />
      <Footer />
    </main>
  );
}

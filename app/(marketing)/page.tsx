import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import WhyStrip from "@/components/WhyStrip";
import EarlyAccess from "@/components/EarlyAccess";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="bg-white">
      <Hero />
      <HowItWorks />
      <WhyStrip />
      <EarlyAccess />
      <Footer />
    </main>
  );
}

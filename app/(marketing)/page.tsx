import { auth } from "@/auth";
import Hero from "@/components/Hero";
import SwarmDemo from "@/components/SwarmDemo";
import EarlyAccess from "@/components/EarlyAccess";
import Footer from "@/components/Footer";

export default async function Home() {
  // Session is resolved server-side so the nav renders the right buttons
  // in the first paint — no client-side session fetch, no empty nav.
  const session = await auth();
  return (
    <main className="bg-white">
      <Hero user={session?.user ?? null} />
      <SwarmDemo />
      <EarlyAccess />
      <Footer />
    </main>
  );
}

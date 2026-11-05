import Image from "next/image";
import { ArrowUpRight, Github } from "lucide-react";
import clouds from "@/public/images/pero-kalimero-clouds.webp";

export default function EarlyAccess() {
  return (
    <section id="early-access" className="flight-access" aria-labelledby="flight-access-title">
      <div className="flight-access-copy">
        <h2 id="flight-access-title">Ship with<br />your eyes open.</h2>
        <div className="flight-access-bottom">
          <div>
            <p>Put your next release through its paces.</p>
            <p>Sign in with GitHub to request early access.<br />We review each request before granting access.</p>
          </div>
          <div className="flight-access-action">
            <a href="/login" className="flight-button flight-button-navy"><Github size={19} aria-hidden="true" /> Join the waitlist <ArrowUpRight size={19} aria-hidden="true" /></a>
            <p>By joining, you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
          </div>
        </div>
      </div>
      <div className="flight-access-photo"><Image src={clouds} alt="Sunlit clouds beneath a clear blue sky" fill sizes="(max-width: 760px) 100vw, 32vw" placeholder="blur" /></div>
    </section>
  );
}

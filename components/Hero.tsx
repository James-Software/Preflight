import Image from "next/image";
import { ArrowDown, ArrowDownRight, ArrowUpRight, Check, CircleAlert } from "lucide-react";
import CloudPhotoMotion from "./CloudPhotoMotion";
import clouds from "@/public/images/pero-kalimero-clouds.webp";

export default function Hero() {
  return (
    <section id="top" className="flight-hero" aria-labelledby="flight-title">
      <CloudPhotoMotion>
        <Image src={clouds} alt="" fill preload sizes="100vw" placeholder="blur" className="hero-cloud-photo flight-cloud-photo" />
      </CloudPhotoMotion>
      <div className="flight-hero-content">
        <h1 id="flight-title" className="flight-title">
          <span>Looks ready.</span>
          <span>Let’s find out.</span>
        </h1>
        <div className="flight-hero-bottom">
          <div className="flight-hero-intro">
            <p>AI agents test your app in real browsers. Find the failures before your users do.</p>
            <a href="#early-access" className="flight-button flight-button-navy">
              Get early access <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          </div>
          <a href="#how-it-works" className="flight-peek" aria-label="Explore a sample test finding">
            <div className="flight-peek-heading"><span>A little off the happy path.</span><ArrowDownRight size={20} aria-hidden="true" /></div>
            <div className="flight-peek-row"><Check size={15} aria-hidden="true" /><span>Sign in</span><span>Passed</span></div>
            <div className="flight-peek-row"><Check size={15} aria-hidden="true" /><span>Browse products</span><span>Passed</span></div>
            <div className="flight-peek-row flight-peek-failed"><CircleAlert size={15} aria-hidden="true" /><span>Save delivery address</span><span>500</span></div>
            <div className="flight-peek-caption">Sample run <span>Follow the finding <ArrowUpRight size={13} aria-hidden="true" /></span></div>
          </a>
        </div>
      </div>
      <div className="flight-hero-foot">
        <a href="#how-it-works" className="flight-scroll"><ArrowDown size={16} aria-hidden="true" /> There’s more below the surface.</a>
        <p>Photo by <a href="https://unsplash.com/@pericakalimerica" target="_blank" rel="noopener noreferrer">Pero Kalimero</a> / <a href="https://unsplash.com/photos/nimbus-clouds-and-blue-calm-sky-9BJRGlqoIUk" target="_blank" rel="noopener noreferrer">Unsplash</a></p>
      </div>
    </section>
  );
}

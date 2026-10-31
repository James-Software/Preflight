import Image from "next/image";
import localFont from "next/font/local";
import CloudPhotoMotion from "./CloudPhotoMotion";
import clouds from "@/public/images/pero-kalimero-clouds.webp";

const headline = localFont({
  src: "../app/fonts/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  display: "swap",
});

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col overflow-x-clip"
    >
      <div className="flex min-w-0 flex-1 px-[calc(8px+0.5vw)] pb-2 pt-20">
        <div className="relative isolate flex min-w-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-[#b7d7e8]">
          <CloudPhotoMotion>
            <Image
              src={clouds}
              alt=""
              fill
              preload
              sizes="100vw"
              placeholder="blur"
              className="hero-cloud-photo object-cover object-[50%_55%]"
            />
          </CloudPhotoMotion>

          <div className="relative min-w-0 w-full px-5 pb-24 pt-20 text-center sm:px-16 sm:pb-24 sm:pt-24 md:px-12 md:pb-32 md:pt-20">
            <h1
              className={`${headline.className} hero-headline mx-auto max-w-[60rem] text-balance leading-[1.04] font-medium tracking-[-0.045em] text-[#142b42]`}
            >
              <span className="block">Your build passed.</span>{" "}
              <span className="block">Now test the app.</span>
            </h1>
            <p
              className="animate-hero-rise mx-auto mt-5 max-w-[30ch] text-base leading-relaxed text-pretty text-[#142b42] sm:mt-6 sm:max-w-xl sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              Run AI agents through your app in real browsers. Review findings
              with screenshots, console logs and network traces.
            </p>
            <div
              className="animate-hero-rise mx-auto mt-7 flex w-full max-w-xs flex-col items-center justify-center gap-3 sm:mt-9 sm:max-w-none sm:flex-row"
              style={{ animationDelay: "240ms" }}
            >
              <a
                href="#early-access"
                className="pressable flex min-h-12 w-full items-center justify-center rounded-lg bg-white/90 px-5 py-3.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-white/90 sm:w-auto sm:px-7"
              >
                Get early access
              </a>
              <a
                href="#how-it-works"
                className="pressable flex min-h-12 w-full items-center justify-center rounded-lg underline decoration-[#142b42]/40 underline-offset-[6px] px-5 py-3.5 text-sm font-semibold text-[#142b42] transition-colors duration-150 hover:bg-white/25 sm:w-auto sm:px-7"
              >
                See how it works
              </a>
            </div>
          </div>
          <p className="absolute bottom-4 right-5 left-5 text-center text-[11px] leading-relaxed text-[#142b42] sm:left-auto sm:text-right">
            Photo by{" "}
            <a
              href="https://unsplash.com/@pericakalimerica"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:decoration-2"
            >
              Pero Kalimero
            </a>{" "}
            on{" "}
            <a
              href="https://unsplash.com/photos/nimbus-clouds-and-blue-calm-sky-9BJRGlqoIUk"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:decoration-2"
            >
              Unsplash
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

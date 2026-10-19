/* ------------------------------------------------------------------ */
/* PixelRain — square purplish-blue dots drifting down like pixel rain  */
/* through the gutters between the window edges and the centered page   */
/* content, below the hero bubble. Decorative only: rendered on xl      */
/* screens and up (that's where gutters exist), frozen as static dots  */
/* under prefers-reduced-motion.                                        */
/* ------------------------------------------------------------------ */

function Gutter({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 z-[1] hidden w-[calc(50%-38rem)] xl:block ${
        side === "left" ? "left-0" : "right-0"
      }`}
      style={{
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 120px)",
        maskImage: "linear-gradient(to bottom, transparent, black 120px)",
      }}
    >
      <div
        className="pixel-rain-strip rain-a absolute inset-y-0 left-[12%] w-12 opacity-80"
        style={{ animationDuration: "9s" }}
      />
      <div
        className="pixel-rain-strip rain-b absolute inset-y-0 left-[52%] w-16 opacity-70"
        style={{ animationDuration: "14s" }}
      />
      <div
        className="pixel-rain-strip rain-c absolute inset-y-0 left-[82%] w-10 opacity-80"
        style={{ animationDuration: "6s" }}
      />
    </div>
  );
}

export default function PixelRain() {
  return (
    <>
      <Gutter side="left" />
      <Gutter side="right" />
    </>
  );
}

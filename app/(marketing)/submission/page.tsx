import type { Metadata } from "next";
import Link from "next/link";
import { SUBMISSION_DOCUMENTS } from "@/lib/submission-documents";
import { publicAlternates } from "@/lib/site";
export const metadata: Metadata = {title:"Submission resources — PreFlight", description:"Product demonstration, architecture, project briefing and verification evidence.", alternates:publicAlternates("/submission")};
export default function Submission() {
 return <main className="mx-auto max-w-5xl px-6 pb-24 pt-36 text-ink dark:text-white">
  <p className="text-sm font-semibold uppercase tracking-widest text-primary">PreFlight · Product and technical review</p>
  <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">Evidence behind the demo.</h1>
  <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">PreFlight runs browser agents against a deployed app and connects visible behavior with database checks. A success toast is only one piece of evidence: the configured persistence expectation must hold too.</p>
  <section className="mt-12" aria-labelledby="demo-heading"><h2 id="demo-heading" className="text-2xl font-semibold">Product demonstration</h2>
   <p className="mt-4 text-muted">The deliberately broken waitlist at <a className="text-primary underline" href="https://preflight-example.vercel.app/">Preflight Example</a> accepts an email and shows a success message while leaving its database empty. Judges receive a separate invitation to an isolated guest workspace.</p>
   <video className="mt-6 w-full rounded-2xl border border-ink/15 bg-black dark:border-white/20" width={1920} height={1080} controls preload="metadata" poster="/submission/demo-poster.webp" aria-label="PreFlight product demonstration, 3 minutes 9 seconds">
    <source src="/videos/preflight-demo.mp4" type="video/mp4"/>
    <track kind="captions" src="/videos/preflight-demo.en.vtt" srcLang="en" label="English" default/>
    Your browser does not support embedded video. <a href="/videos/preflight-demo.mp4">Download the demonstration.</a>
   </video>
   <p className="mt-4 text-sm text-muted">3:09 · 1080p · Real application screens with synthetic technical narration. Cloud processing wait is shortened. <a className="text-primary underline" href="/videos/preflight-demo-transcript.md">Read the transcript</a> or <a className="text-primary underline" href="/videos/preflight-demo.mp4" download>download the video</a>. <a className="text-primary underline" href="/videos/CREDITS.md">Recording notes and credits</a>.</p>
  </section>
  <section className="mt-12 grid gap-5 md:grid-cols-2" aria-label="Submission documents">{SUBMISSION_DOCUMENTS.map(item=><Link key={item.slug} href={`/submission/${item.slug}`} className="rounded-2xl border border-ink/15 p-6 transition hover:border-primary dark:border-white/20"><h2 className="text-xl font-semibold">{item.title} <span aria-hidden>↗</span></h2><p className="mt-3 leading-relaxed text-muted">{item.description}</p></Link>)}</section>
  <section className="mt-12"><h2 className="text-2xl font-semibold">Source and operation</h2><div className="mt-4 flex flex-wrap gap-6"><a className="text-primary underline" href="https://github.com/James-Software/Preflight">Public GitHub repository</a><a className="text-primary underline" href="https://github.com/James-Software/Preflight/actions">Build and verification history</a><a className="text-primary underline" href="/api/health">Live health check</a></div></section>
 </main>;
}

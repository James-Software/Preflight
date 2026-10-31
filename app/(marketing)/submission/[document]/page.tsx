import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "@/components/Markdown";
import { readSubmissionDocument, SUBMISSION_DOCUMENTS } from "@/lib/submission-documents";
import { publicAlternates } from "@/lib/site";
export const dynamicParams = false;
export function generateStaticParams() { return SUBMISSION_DOCUMENTS.map(item=>({document:item.slug})); }
export async function generateMetadata({params}:{params:Promise<{document:string}>}):Promise<Metadata> {
 const {document}=await params;const item=SUBMISSION_DOCUMENTS.find(item=>item.slug===document);
 return item?{title:`${item.title} — PreFlight`,description:item.description,alternates:publicAlternates(`/submission/${item.slug}`)}:{};
}
export default async function Document({params}:{params:Promise<{document:string}>}) {
 const {document}=await params;const item=await readSubmissionDocument(document);if(!item)notFound();
 return <main className="mx-auto max-w-4xl px-6 pb-24 pt-32"><Link href="/submission" className="text-sm text-primary underline">← Submission resources</Link><article className="mt-10"><Markdown content={item.body}/></article></main>;
}

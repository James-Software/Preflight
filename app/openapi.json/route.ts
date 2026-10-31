import { SUBMISSION_DOCUMENTS } from "@/lib/submission-documents";
import { SITE_URL } from "@/lib/site";

const textResponse = (description: string, mediaType = "text/markdown") => ({ description, content: { [mediaType]: { schema: { type: "string" } } } });
const publicContent = (summary: string, operationId: string) => ({ get: {
  summary, operationId, security: [], responses: { "200": textResponse(summary) },
} });

export function GET() {
  return Response.json({
    openapi: "3.1.0", info: { title: "PreFlight Public Content", version: "1.0.0",
      description: "Read-only public documentation and published blog content. This specification does not expose accounts, repositories, test runs, admin functions, or payments." },
    servers: [{ url: SITE_URL }], security: [],
    externalDocs: { url: `${SITE_URL}/llms.txt`, description: "Public agent guide" },
    paths: {
      "/markdown": publicContent("Product overview in Markdown", "getProductOverview"),
      "/markdown/privacy": publicContent("Public privacy policy", "getPrivacyPolicy"),
      "/markdown/terms": publicContent("Public terms of service", "getTermsOfService"),
      "/markdown/submission": publicContent("Submission resources in Markdown", "getSubmissionResources"),
      "/markdown/submission/{document}": { get: { summary:"Read a submission document", operationId:"getSubmissionDocument", security:[],
        parameters:[{name:"document",in:"path",required:true,schema:{type:"string",enum:SUBMISSION_DOCUMENTS.map(item=>item.slug)}}],
        responses:{"200":textResponse("Public submission document"),"404":textResponse("Document not found","text/plain"),"503":textResponse("Document temporarily unavailable","text/plain")},
      } },
      "/markdown/blog": { get: { summary: "List published blog posts", operationId: "listPublishedBlogPosts", security: [], responses: {
        "200": textResponse("Published post links and descriptions"), "503": textResponse("Public blog temporarily unavailable", "text/plain"),
      } } },
      "/markdown/blog/{slug}": { get: { summary: "Read a published blog post", operationId: "getPublishedBlogPost", security: [],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } }],
        responses: { "200": textResponse("Published post in Markdown"), "404": textResponse("Post not found or not published", "text/plain"), "503": textResponse("Public blog temporarily unavailable", "text/plain") },
      } },
    },
  }, { headers: { "Content-Type": "application/vnd.oai.openapi+json", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — PreFlight",
  description:
    "The terms governing your use of PreFlight: testing, GitHub integration, credits, and payments.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Acceptance of these terms",
    body: [
      "By creating an account, joining our waitlist, or using PreFlight in any way, you agree to these Terms of Service and to our Privacy Policy. If you do not agree, do not use PreFlight. If you are using PreFlight on behalf of a company or organization, you represent that you have the authority to bind it to these terms.",
    ],
  },
  {
    heading: "2. What PreFlight does",
    body: [
      "PreFlight sends a swarm of AI agents to test your web application like real users: driving real browsers, reporting UI, frontend, and backend issues, diagnosing root causes from your repository code and test output, and proposing fixes as pull requests. A human merge gate always applies — PreFlight never merges code into your branches on its own.",
    ],
  },
  {
    heading: "3. Eligibility",
    body: [
      "You must be at least 13 years old to use PreFlight. If you are under 18, you may only use PreFlight with the permission of a parent or guardian, and paid plans must be purchased by someone 18 or older.",
    ],
  },
  {
    heading: "4. Accounts",
    body: [
      "You are responsible for keeping your account credentials confidential and for everything that happens under your account. Tell us promptly if you believe your account has been compromised. We may suspend or terminate accounts that violate these terms.",
    ],
  },
  {
    heading: "5. GitHub integration",
    body: [
      "If you install our GitHub App or connect a repository, you grant us the access scopes you approve so we can read the code needed for diagnosis and open fix pull requests. Every fix arrives as a pull request for your review — nothing is pushed directly to your branches, and nothing merges without a human approving it. You can revoke our access at any time from your GitHub settings, which immediately stops our access to your repositories.",
    ],
  },
  {
    heading: "6. Authorized testing only",
    body: [
      "You may only use PreFlight to test applications and environments that you own or that you are explicitly authorized to test. You must not use PreFlight against anyone else's systems, to probe for vulnerabilities without permission, to generate abusive traffic, or for any unlawful purpose. You are responsible for making sure your testing targets comply with your own contracts and policies.",
    ],
  },
  {
    heading: "7. Credits, plans, and payments",
    body: [
      "PreFlight is billed in credits, with free allowances, paid plans, and top-ups as described on our pricing page. Payments are processed by Stripe; by purchasing, you also agree to Stripe's terms. Fees are non-refundable except where required by law. We may change pricing for future billing periods with reasonable notice, and we may suspend service for unpaid amounts.",
    ],
  },
  {
    heading: "8. Acceptable use",
    body: [
      "Beyond authorized testing, you agree not to: abuse, disrupt, or attempt to gain unauthorized access to PreFlight or our infrastructure; resell or white-label the service without our written permission; use test results to harm third parties; or misrepresent PreFlight's output as human work where that would be deceptive.",
    ],
  },
  {
    heading: "9. Intellectual property",
    body: [
      "You keep all rights to your code, your applications, and your data. We keep all rights to PreFlight itself, including the swarm, the site, and our branding. The fixes our agents propose to your repositories are yours once merged. If you send us feedback or suggestions, you grant us a perpetual, worldwide license to use them to improve PreFlight.",
    ],
  },
  {
    heading: "10. Disclaimers",
    body: [
      "PreFlight is provided “as is” and “as available,” without warranties of any kind, express or implied — including that every bug will be found, that every diagnosis will be correct, or that the service will be uninterrupted or error-free. AI-generated findings and fixes are proposals: you are responsible for reviewing pull requests before merging, and for deciding what ships to your users.",
    ],
  },
  {
    heading: "11. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, PreFlight and its operators will not be liable for indirect, incidental, consequential, or punitive damages, or for loss of profits, revenue, data, or goodwill. Our total liability for any claim relating to the service is limited to the amounts you paid us in the twelve months before the claim arose — or, if you used only the free tier, one hundred US dollars.",
    ],
  },
  {
    heading: "12. Indemnification",
    body: [
      "You agree to indemnify and hold us harmless from claims, damages, and expenses (including reasonable attorneys' fees) arising from your use of PreFlight, your violation of these terms, or your testing of applications you were not authorized to test.",
    ],
  },
  {
    heading: "13. Termination",
    body: [
      "You may stop using PreFlight and delete your account at any time. We may suspend or terminate your access if you violate these terms or if we discontinue the service. Sections that by their nature should survive — including intellectual property, disclaimers, limitation of liability, and indemnification — survive termination.",
    ],
  },
  {
    heading: "14. Changes to these terms",
    body: [
      "We may update these terms as PreFlight evolves. If the changes are material, we will notify you by email before they take effect. Continuing to use PreFlight after the changes take effect means you accept the updated terms.",
    ],
  },
  {
    heading: "15. Governing law",
    body: [
      "These terms are governed by the laws of the State of California, without regard to conflict-of-law rules. Disputes will be resolved in the state or federal courts located in California.",
    ],
  },
  {
    heading: "16. Contact",
    body: [
      "Questions about these terms? Email us at hello@apreflight.vercel.app.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <a
          href="/"
          className="text-sm font-medium text-ink/50 transition-colors duration-150 hover:text-ink"
        >
          &larr; Back to PreFlight
        </a>
        <h1 className="font-display mt-8 text-4xl font-bold tracking-tight text-ink md:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-ink/50">Effective October 12, 2026</p>
        <p className="mt-8 text-base leading-relaxed text-ink/70">
          These terms govern your use of PreFlight — the agent swarm that
          tests your app like real users and proposes fixes as pull
          requests. Please read them carefully.
        </p>
        <div className="mt-12 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-ink/70">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

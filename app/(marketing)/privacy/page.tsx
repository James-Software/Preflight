import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — PreFlight",
  description:
    "How PreFlight collects, uses, and protects your data across waitlist, testing, GitHub integration, and payments.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Information you give us",
    body: [
      "Waitlist and contact. When you join our waitlist or contact us, we collect your email address so we can notify you at launch and respond to you.",
      "Account. When you create an account, we collect your name and email address. Login credentials are handled by our authentication provider; we never see your password.",
      "Projects. The URLs of the applications you ask us to test, along with your project settings and preferences.",
      "Payment. Payments are processed directly by Stripe. We never see or store your card numbers — Stripe handles all payment details under its own privacy policy. We store only your plan, credit balance, and billing status.",
    ],
  },
  {
    heading: "2. Information from connected services",
    body: [
      "GitHub. If you install our GitHub App or connect a repository, GitHub grants us the access scopes you approve — typically read access to the repositories you select, and permission to open pull requests. We access your source code solely to diagnose test failures and generate proposed fixes. We do not sell your code, use it for advertising, or share it beyond what is needed to operate the service. The exact scopes are shown by GitHub when you install the app, and you can review or revoke our access at any time in your GitHub settings.",
    ],
  },
  {
    heading: "3. Information from test runs",
    body: [
      "When the agent swarm tests your application, it acts like a real user in a real browser. We collect what the test produces: the pages visited, screenshots, console output, network request metadata, and the findings it reports. The swarm only touches the URLs and environments you configure — nothing else.",
      "To diagnose failures, relevant portions of your repository code and test output are transmitted to our AI service providers. They process this data only to perform the diagnosis; we do not permit them to use it for any other purpose.",
    ],
  },
  {
    heading: "4. Information collected automatically",
    body: [
      "We use cookies and similar technologies for sign-in sessions, security, and basic product analytics (such as which features are used) so we can improve PreFlight. You can control cookies through your browser settings, though some features require them to work.",
    ],
  },
  {
    heading: "5. How we use information",
    body: [
      "We use the information we collect to operate PreFlight: running your tests, diagnosing failures, opening fix pull requests, managing credits and billing, communicating with you about launches, updates, and support, keeping the service secure and preventing abuse, and complying with legal obligations.",
    ],
  },
  {
    heading: "6. How we share information",
    body: [
      "Service providers. We share data with the providers that run PreFlight: hosting (Vercel), database (Neon), payments (Stripe), authentication, AI diagnosis (our model providers), and GitHub (to open pull requests). Each processes data only as needed to provide its service to us.",
      "We do not sell your personal information or your code. We will disclose information if required by law or to protect the rights, safety, and security of PreFlight, our users, or others.",
    ],
  },
  {
    heading: "7. Data retention",
    body: [
      "We keep your data for as long as your account is active or as needed to provide the service. Test artifacts such as screenshots and logs are retained with your project history. You may request deletion of your data at any time (see Your rights below), and we will delete or de-identify it unless we are required to keep it for legal reasons.",
    ],
  },
  {
    heading: "8. Security",
    body: [
      "We use reasonable technical and organizational measures to protect your data, including encrypted connections and scoped access controls — for example, our GitHub App requests only the repository permissions it needs, and fixes are proposed as pull requests so nothing merges without your approval. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "9. Your rights and choices",
    body: [
      "You may request access to, correction of, or deletion of your personal data at any time by contacting us. You can revoke our GitHub access whenever you like from your GitHub settings, and you can unsubscribe from marketing emails with the link in any message. We will respond to requests within a reasonable timeframe.",
    ],
  },
  {
    heading: "10. Children's privacy",
    body: [
      "PreFlight is built for development teams and is not directed at children under 13. We do not knowingly collect personal information from children under 13; if we learn that we have, we will delete it.",
    ],
  },
  {
    heading: "11. Changes to this policy",
    body: [
      "If we change this policy in a material way, we will post the updated version here and notify you by email before the changes take effect. The effective date at the top always reflects the current version.",
    ],
  },
  {
    heading: "12. Contact",
    body: [
      "Questions about this policy or your data? Email us at hello@trypreflight.dev and we will get back to you.",
    ],
  },
];

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-ink/50">
          Effective October 12, 2026
        </p>
        <p className="mt-8 text-base leading-relaxed text-ink/70">
          PreFlight (&ldquo;we&rdquo;, &ldquo;us&rdquo;) sends a swarm of AI
          agents to test your application like real users, diagnoses what
          they find from your code, and proposes fixes as pull requests.
          This policy explains what data we collect across the whole
          product — waitlist, accounts, testing, GitHub integration, and
          payments — why we collect it, and what we do with it.
        </p>
        <div className="mt-12 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-relaxed text-ink/70"
                  >
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

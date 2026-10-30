// Public legal copy shared by the website and its Markdown representations.

export const PRIVACY_SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Information you give us",
    body: [
      "Waitlist and contact. PreFlight is currently invite-only. When you sign in with GitHub to request access, we save your GitHub profile: your username, name, and avatar, so we can review your request. If you email us, we keep your message and address so we can reply.",
      "Account. When you sign in with GitHub, we save your GitHub profile: your username, name, and avatar, so we can recognize you and control access. Login credentials are handled by our authentication provider; we never see your password.",
      "Projects. The URLs of the applications you ask us to test, along with your project settings and preferences.",
      "Payment. Payments are processed directly by Stripe. We never see or store your card numbers. Stripe handles all payment details under its own privacy policy. We store only your plan, credit balance, and billing status.",
    ],
  },
  {
    heading: "2. Information from connected services",
    body: [
      "GitHub. If you install our GitHub App or connect a repository, GitHub grants us the access scopes you approve: typically read access to the repositories you select, and permission to open pull requests. We access your source code solely to diagnose test failures and generate proposed fixes. We do not sell your code, use it for advertising, or share it beyond what is needed to operate the service. The exact scopes are shown by GitHub when you install the app, and you can review or revoke our access at any time in your GitHub settings.",
    ],
  },
  {
    heading: "3. Information from test runs",
    body: [
      "When the agent swarm tests your application, it acts like a real user in a real browser. We collect pages visited, screenshots, console output, network request metadata, and findings. Automated navigation is restricted to the configured app origin. The app may load public third-party resources. Use test accounts and preview deployments; authorized marked create workflows can create real test records.",
      "To drive the browser and investigate failures, screenshots, page content, relevant repository code and test output are transmitted to our AI service providers. Processing and retention are governed by the applicable provider terms and settings configured for PreFlight. Saved screenshot evidence requires current project access or an authorized, expiring run-scoped agent credential.",
    ],
  },
  {
    heading: "4. Information collected automatically",
    body: [
      "We use cookies and similar technologies for sign-in sessions, security, and basic product analytics (such as which features are used) so we can improve PreFlight. You can control cookies through your browser settings, though some features require them to work.",
      "Guest demos use a separate encrypted, HttpOnly session cookie to remember your guest identity and example project for up to 30 days. Guest access does not require a GitHub account. Leaving the demo clears that guest cookie; deleting cookies or using another browser creates a separate demo workspace.",
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
      "Service providers. We share data with providers that operate PreFlight, including Vercel (hosting and isolated execution), Neon (database and private evidence), Browserbase (browsers), Trigger.dev (background jobs), OpenRouter and OpenAI (AI requests), authentication providers, and GitHub (repository access and pull requests). Each receives the information needed for its role in the service.",
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
      "We use reasonable technical and organizational measures to protect your data, including encrypted connections and scoped access controls. For example, our GitHub App requests only the repository permissions it needs, and fixes are proposed as pull requests so nothing merges without your approval. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.",
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
      "Questions about this policy or your data? Email us at james@trypreflight.dev and we will get back to you.",
    ],
  },
];

export const TERMS_SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Acceptance of these terms",
    body: [
      "By creating an account, joining our waitlist, or using PreFlight in any way, you agree to these Terms of Service and to our Privacy Policy. If you do not agree, do not use PreFlight. If you are using PreFlight on behalf of a company or organization, you represent that you have the authority to bind it to these terms.",
    ],
  },
  {
    heading: "2. What PreFlight does",
    body: [
      "PreFlight sends a swarm of AI agents to test your web application like real users: driving real browsers, reporting UI, frontend, and backend issues, diagnosing root causes from your repository code and test output, and proposing fixes as pull requests. A human merge gate always applies. PreFlight never merges code into your branches on its own.",
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
      "If you install our GitHub App or connect a repository, you grant us the access scopes you approve so we can read the code needed for diagnosis and open fix pull requests. Every fix arrives as a pull request for your review. Nothing is pushed directly to your branches, and nothing merges without a human approving it. You can revoke our access at any time from your GitHub settings, which immediately stops our access to your repositories.",
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
      "PreFlight is provided “as is” and “as available,” without warranties of any kind, express or implied, including that every bug will be found, that every diagnosis will be correct, or that the service will be uninterrupted or error-free. AI-generated findings and fixes are proposals: you are responsible for reviewing pull requests before merging, and for deciding what ships to your users.",
    ],
  },
  {
    heading: "11. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, PreFlight and its operators will not be liable for indirect, incidental, consequential, or punitive damages, or for loss of profits, revenue, data, or goodwill. Our total liability for any claim relating to the service is limited to the amounts you paid us in the twelve months before the claim arose, or one hundred US dollars if you used only the free tier.",
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
      "You may stop using PreFlight and delete your account at any time. We may suspend or terminate your access if you violate these terms or if we discontinue the service. Sections that by their nature should survive, including intellectual property, disclaimers, limitation of liability, and indemnification, survive termination.",
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
      "Questions about these terms? Email us at james@trypreflight.dev.",
    ],
  },
];

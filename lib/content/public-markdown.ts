import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "./legal";
import { SITE_URL } from "../site";

export type PublicDocument = { title: string; description?: string; path: string; body: string };

export function frontmatter(document: PublicDocument): string {
  return ["---", `title: ${JSON.stringify(document.title)}`, `url: ${JSON.stringify(`${SITE_URL}${document.path}`)}`,
    ...(document.description ? [`description: ${JSON.stringify(document.description)}`] : []), "---", "", document.body, ""].join("\n");
}

export function staticDocument(path: string): PublicDocument | null {
  if (path === "/") return {
    path, title: "PreFlight: AI Agents That Test Your App Like Real Users",
    body: `# Your build passed. Now test the app.

Run AI agents through your app in real browsers. Review findings with screenshots, console logs and network traces.

## How it works

Follow an illustrative checkout bug through the browser, the evidence and a proposed change.

1. Connect your application and a GitHub repository you own.
2. Run agents against your deployed application in real browsers.
3. Review findings with screenshots, console logs, and network traces.
4. Review proposed fix pull requests. Humans decide what to merge.

## Built like a tester, not a script

- **Real browsers:** Every agent drives its own real browser and uses your app like a person would.
- **Evidence with every bug:** Screenshots, console logs, and network traces attached to each finding.
- **Root-cause diagnosis:** Agents pair what they saw in the browser with your source code to explain why it broke.
- **Fix pull requests:** Confident fixes open as PRs with the diff. Nothing ever merges without you.

## Early access

Sign in with GitHub to join the waitlist. We review each request before granting access.

[Join the waitlist with GitHub](${SITE_URL}/login)

## Public resources

- [Blog](${SITE_URL}/blog)
- [Privacy Policy](${SITE_URL}/privacy)
- [Terms of Service](${SITE_URL}/terms)
- [Agent guide](${SITE_URL}/llms.txt)
- [Authentication instructions](${SITE_URL}/auth.md)

Contact: hello@trypreflight.dev`,
  };
  if (path === "/privacy" || path === "/terms") {
    const privacy = path === "/privacy";
    const title = privacy ? "Privacy Policy" : "Terms of Service";
    const sections = privacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
    const intro = privacy
      ? "PreFlight (“we”, “us”) sends a swarm of AI agents to test your application like real users, diagnoses what they find from your code, and proposes fixes as pull requests. This policy explains what data we collect across the whole product (waitlist, accounts, testing, GitHub integration, and payments), why we collect it, and what we do with it."
      : "These terms govern your use of PreFlight, the agent swarm that tests your app like real users and proposes fixes as pull requests. Please read them carefully.";
    return { path, title, body: [`# ${title}`, "Effective October 12, 2026", intro,
      ...sections.map(section => `## ${section.heading}\n\n${section.body.join("\n\n")}`)].join("\n\n") };
  }
  return null;
}

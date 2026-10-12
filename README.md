# PreFlight

PreFlight allows an agent swarm to automatically review your application to confirm it is ready for takeoff.

A swarm of AI agents acts as real users against your app — clicking through the UI,
exercising functionality, and catching UX, frontend, and backend bugs. When a bug is
found, our cloud agent diagnoses the root cause from your code and captured terminal
output, then opens a pull request with the fix on your connected GitHub repo. You
merge; one click re-runs the swarm to verify.

Built for the Galuxium Nexus V2 hackathon (deadline Oct 31, 2026).

## Architecture

- **Web app + dashboard** — Next.js 16 (App Router) on Vercel, React 19, TypeScript,
  Tailwind CSS v4.
- **Database + auth** — Supabase (Postgres with RLS on every table). Schema lives in
  `supabase/schema.sql`.
- **Test swarm** — Playwright on cloud browsers (Browserbase). An LLM drives each
  browser agent as a real user through generated test plans.
- **Decision layer** — Jev (TypeSafe's Decisions API): cheap, typed pass/fail and
  routing judgments on every test step, keeping inference costs near zero.
- **Fix agent** — a GitHub App (least privilege: contents + PRs on repos you pick).
  Diagnoses root cause from repo code plus captured console/network output, fixes in
  a sandbox, and opens a PR. Humans merge — never direct pushes.
- **Monetization** — credits (1 credit = 1 agent test-step) sold in packs via Stripe,
  plus flat-rate enterprise plans (SSO, audit logs, scheduled runs). Target: 50%
  margin, enforced by pricing every run at 2x its infra cost.

## 20-day milestones

- **By Oct 14** — Scaffold: Next.js + Supabase auth, DB schema, GitHub App created.
- **By Oct 19** — Swarm v1: single-agent journey, Jev pass/fail, report page with
  screenshots and captured errors.
- **By Oct 23** — Multi-agent swarm, diagnosis cards, Stripe credit packs live.
- **By Oct 27** — Fix-agent-to-PR flow, verify re-run, pricing page, README +
  architecture docs.
- **By Oct 30** — Landing page design pass, 2–5 min demo video, executive briefing +
  fiscal architecture docs, buffer.
- **Oct 31, 4:30 AM PT** — Submission deadline (everything done the night of Oct 30).

## Getting started

```bash
cp .env.example .env.local   # then fill in your Supabase values
npm install
npm run dev
```

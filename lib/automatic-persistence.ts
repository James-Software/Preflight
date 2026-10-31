import type { Page } from "playwright-core";
import type { AgentAction } from "@/lib/models";
import type { RecordTarget } from "@/lib/database-records";
import type { automaticDatabase } from "@/lib/automatic-database";

type Verifier = NonNullable<Awaited<ReturnType<typeof automaticDatabase>>>;
const notices = '[role="status"], [role="alert"], [data-sonner-toast]';
export function automaticStepCanWrite(id?: string) {
  return (
    ![
      "homepage-load",
      "homepage-status",
      "signed-in-page",
      "signed-in-navigation",
    ].includes(id || "") && !id?.startsWith("visit-")
  );
}
export function emailPersistenceTarget(targets: RecordTarget[]) {
  const candidates = targets.filter(
    (t) =>
      /(?:^|_)(?:waitlist|subscribers?|newsletter|mailing)(?:_|$)/i.test(
        t.table,
      ) &&
      t.columns.filter((c) => /^(?:email|email_address)$/i.test(c)).length ===
        1,
  );
  return candidates.length === 1 ? candidates[0] : null;
}
export function acceptedEmailNotice(text: string) {
  return (
    text.length <= 500 &&
    !/\b(?:not|error|invalid|failed|unable|pending|queued|verify|verification|confirm|already)\b/i.test(
      text,
    ) &&
    /\b(?:waitlist|newsletter|subscribed|subscription|mailing list)\b/i.test(
      text,
    ) &&
    /\b(?:entered|joined|added|subscribed|success|successfully|welcome)\b|you(?:'re| are) on/i.test(
      text,
    )
  );
}
export async function visibleNotices(page: Page) {
  return page.locator(notices).evaluateAll((nodes) =>
    nodes
      .filter((node) =>
        (node as HTMLElement).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        }),
      )
      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}
export async function markedEmailSubmission(
  page: Page,
  action: AgentAction,
  verifier: Verifier,
) {
  if (
    !verifier.emailTarget ||
    action.action !== "click" ||
    action.role.toLowerCase() !== "button" ||
    !/waitlist|subscrib|newsletter|mailing list/i.test(action.name)
  )
    return false;
  return page
    .getByRole("button", { name: action.name, exact: true })
    .evaluate((node, email) => {
      const form = (node as HTMLButtonElement).form;
      if (!form || !form.checkValidity()) return false;
      return [
        ...form.querySelectorAll<HTMLInputElement>('input[type="email"]'),
      ].some(
        (input) =>
          input.name &&
          input.value === email &&
          new FormData(form).get(input.name) === email,
      );
    }, verifier.email)
    .catch(() => false);
}
export async function newlyAccepted(page: Page, previous: string[]) {
  for (let i = 0; i < 20; i++) {
    const fresh = (await visibleNotices(page)).find(
      (text) => !previous.includes(text) && acceptedEmailNotice(text),
    );
    if (fresh) return fresh;
    await page.waitForTimeout(100);
  }
  return null;
}
/** Replay actual marked actions; an AI verdict never substitutes for these facts. */
export async function confirmAutomaticPersistence(input: {
  first: Verifier;
  checkId: string;
  firstNotice: string;
  startUrl: string;
  actions: { action: AgentAction; result: string }[];
  createVerifier: () => Promise<Verifier | null>;
  newPage: () => Promise<Page>;
  policy: {
    blocked: string;
    reset(): void;
    checkAction(
      page: Page,
      action: AgentAction,
      marked: boolean,
    ): Promise<void>;
    permitCreate(marker: string, action: AgentAction): void;
  };
  execute(page: Page, action: AgentAction): Promise<string>;
  confirmed(page: Page, evidence: string): Promise<void>;
}) {
  let verifier: Verifier | null = null,
    page: Page | null = null;
  try {
    verifier = await input.createVerifier();
    if (
      !verifier?.emailTarget ||
      JSON.stringify(verifier.emailTarget) !==
        JSON.stringify(input.first.emailTarget)
    )
      return false;
    input.policy.reset();
    page = await input.newPage();
    const go: AgentAction = {
      action: "goto",
      value: input.startUrl,
      reasoning: "Independent marked persistence replay",
    };
    await input.policy.checkAction(page, go, false);
    if ((await input.execute(page, go)).startsWith("Action failed:"))
      return false;
    for (const prior of input.actions) {
      let action = { ...prior.action } as AgentAction;
      if (action.action === "done" || action.action === "report_bug") continue;
      if (action.action === "fill")
        action = {
          ...action,
          value: action.value.replaceAll(input.first.marker, verifier.marker),
        };
      await verifier.assertActive();
      await input.policy.checkAction(page, action, true);
      if (await markedEmailSubmission(page, action, verifier)) {
        const previous = await visibleNotices(page);
        if (previous.includes(input.firstNotice)) return false;
        const before = await verifier.before();
        input.policy.permitCreate(verifier.marker, action);
        if ((await input.execute(page, action)).startsWith("Action failed:"))
          return false;
        const accepted = await newlyAccepted(page, previous);
        const observation = await verifier.after(
          before,
          action.action === "click" ? action.name : "Enter",
          false,
        );
        await verifier.assertActive();
        if (
          input.policy.blocked ||
          accepted !== input.firstNotice ||
          observation.passed
        )
          return false;
        const evidence = `Two fresh browser contexts submitted different uniquely marked emails through a valid waitlist/subscription form and newly displayed “${accepted}”. The automatically matched table ${verifier.emailTarget.table} contained neither submitted email after each read-only observation window (4.8 seconds). The inference is scoped to this form and matched table; no model opinion establishes the defect.\nFirst marker: ${input.first.marker}\nIndependent marker: ${verifier.marker}`;
        await input.confirmed(page, evidence);
        await input.first.confirmMissing(
          input.checkId,
          "Confirmed twice: the waitlist accepted different marked emails but neither appeared in the automatically matched database table within either observation window.",
        );
        return true;
      }
      if (
        (await input.execute(page, action)).startsWith("Action failed:") ||
        input.policy.blocked
      )
        return false;
    }
    return false;
  } finally {
    await verifier?.close().catch(() => {});
    await page
      ?.context()
      .close()
      .catch(() => {});
  }
}

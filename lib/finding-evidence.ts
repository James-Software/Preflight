import { createHash } from "node:crypto";
import type { AgentAction } from "@/lib/models";

export type NetworkEvidence = {
  url: string;
  status?: number;
  failure?: string;
};
export type AttemptedAction = { action: AgentAction; result: string };
const destructive =
  /\b(create|save|add|submit|update|delete|remove|confirm|publish|send|pay|purchase|buy|checkout|connect|install|disconnect|revoke|logout|sign\s*out|log\s*out|finish|register|sign\s*up)\b/i;

export function accessBlocker(
  origin: string,
  url: string,
  network: NetworkEvidence[],
) {
  try {
    const current = new URL(url);
    if (
      current.origin !== origin &&
      /(?:login|sign[-_]?in|oauth|authorize)/i.test(current.href)
    )
      return "This workflow requires an external sign-in or provider connection unavailable to the test account. The app session has not been shown to be lost.";
    if (
      network.some((n) => {
        const u = new URL(n.url);
        return (
          u.origin === origin &&
          /^\/api\/github\//.test(u.pathname) &&
          [401, 403, 409].includes(n.status || 0)
        );
      })
    )
      return "The test account has no usable GitHub connection for this workflow. A GitHub API authorization response does not establish that the app session was lost.";
  } catch {
    return "The current page could not be inspected reliably.";
  }
  return null;
}

export function safeReplayAction(action: AgentAction, origin: string) {
  if (action.action === "goto") {
    try {
      const url = new URL(action.value);
      return (
        url.origin === origin &&
        !url.username &&
        !url.password &&
        !/\/(?:api|auth|logout|signout|delete|remove|unsubscribe)(?:\/|$)/i.test(
          url.pathname,
        )
      );
    } catch {
      return false;
    }
  }
  if (action.action === "click")
    return (
      !destructive.test(action.name) &&
      (action.role === "link" ||
        action.role === "tab" ||
        (action.role === "button" &&
          /^(open|show|view|toggle|search|filter|back|next|previous|close|menu)\b/i.test(
            action.name,
          )))
    );
  if (action.action === "press")
    return [
      "Tab",
      "Escape",
      "ArrowDown",
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
    ].includes(action.key);
  if (action.action === "fill") return /search|filter/i.test(action.name);
  return ["wait", "scroll"].includes(action.action);
}

export function replayEligible(actions: AttemptedAction[], origin: string) {
  // A failed locator/automation command is not evidence that the app broke.
  return (
    actions.length > 0 &&
    actions.length <= 12 &&
    actions.every(
      (a) =>
        !a.result.startsWith("Action failed:") &&
        safeReplayAction(a.action, origin),
    ) &&
    actions.some((a) => ["goto", "click", "press"].includes(a.action.action))
  );
}

function normalized(value: string) {
  return value
    .replace(/preflight-\d+-[\w-]+/g, "<test-marker>")
    .replace(/\s+/g, " ")
    .trim();
}
export function failureSignature(
  url: string,
  tree: string,
  network: NetworkEvidence[],
  console: string[],
) {
  const path = (value: string) => {
    try {
      const u = new URL(value);
      return u.origin + u.pathname;
    } catch {
      return value;
    }
  };
  const failures = network
    .filter((n) => (n.status || 0) >= 400)
    .map((n) => `${n.status}:${path(n.url)}`)
    .sort();
  const errors = console
    .filter((s) => s.startsWith("[pageerror]"))
    .map(normalized)
    .sort();
  return JSON.stringify({
    url: path(url),
    failures: [...new Set(failures)],
    errors: [...new Set(errors)],
    tree: normalized(tree).slice(0, 6000),
  });
}
export function findingEvidenceKey(
  signature: string,
  actions: AttemptedAction[],
) {
  const trigger = [...actions]
    .reverse()
    .find((a) => ["click", "press", "goto"].includes(a.action.action))?.action;
  const { reasoning: _reason, ...target } = trigger || { reasoning: "" };
  return createHash("sha256")
    .update(signature)
    .update(normalized(JSON.stringify(target)))
    .digest("hex");
}

/* ------------------------------------------------------------------ */
/* Model configuration — the one file to edit when swapping models.    */
/*                                                                    */
/* Defaults are PAID OpenRouter models. Free models require opting    */
/* into model-improvement data sharing; with privacy set to "no       */
/* training" they 402. Env vars override the file without a code      */
/* change (useful in Vercel).                                          */
/*                                                                    */
/* Current stack (2026-10-16, est. ~$0.15-0.30 per 3-agent run):      */
/*   driver:  openai/gpt-5.6-luna      (OpenRouter chat completions)   */
/*   judge:   openai/gpt-4o-mini       (OpenRouter chat completions)   */
/*                                                                    */
/* Note: typesafe/jev-1.13 (the planned Decisions-API judge) was not  */
/* found on OpenRouter, so the judge stays on chat completions for    */
/* now. Revisit if it becomes available.                              */
/*                                                                    */
/* Rate-limit note: the agent loop backs off and retries on 429s. If  */
/* a model misbehaves, swap the id — no other code changes needed.    */
/* ------------------------------------------------------------------ */

export type JudgeProvider = "openrouter-chat" | "openrouter-decisions";

export const MODEL_CONFIG = {
  driver: {
    provider: "openrouter-chat" as const,
    // Needs vision + JSON output.
    model: process.env.DRIVER_MODEL || "openai/gpt-5.6-luna",
  },
  judge: {
    // "openrouter-chat": JSON verdicts via chat completions.
    // "openrouter-decisions": Jev typed decisions (fractions of a cent).
    provider: (process.env.JUDGE_PROVIDER ||
      "openrouter-chat") as JudgeProvider,
    model: process.env.JUDGE_MODEL || "openai/gpt-4o-mini",
  },
};

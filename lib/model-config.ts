/* ------------------------------------------------------------------ */
/* Model configuration — the one file to edit when swapping models.    */
/*                                                                    */
/* Defaults are FREE OpenRouter models: $0 to iterate. Env vars       */
/* override the file without a code change (useful in Vercel).        */
/*                                                                    */
/* Premium stack (when ready — just swap the ids below):              */
/*   driver:  openai/gpt-5.6-luna      (OpenRouter chat completions)   */
/*   judge:   typesafe/jev-1.13        (OpenRouter Decisions API)      */
/*                                                                    */
/* Free-tier note: OpenRouter free models are rate-limited (~20        */
/* req/min). The agent loop backs off and retries on 429s. If a free  */
/* model misbehaves, swap the id — no other code changes needed.      */
/* ------------------------------------------------------------------ */

export type JudgeProvider = "openrouter-chat" | "openrouter-decisions";

export const MODEL_CONFIG = {
  driver: {
    provider: "openrouter-chat" as const,
    // Needs vision + JSON output. Free default; premium: "openai/gpt-5.6-luna".
    model: process.env.DRIVER_MODEL || "google/gemma-4-31b-it:free",
  },
  judge: {
    // "openrouter-chat": JSON verdicts via chat completions (free).
    // "openrouter-decisions": Jev typed decisions (fractions of a cent).
    provider: (process.env.JUDGE_PROVIDER ||
      "openrouter-chat") as JudgeProvider,
    // Free default; premium: "typesafe/jev-1.13" (needs the decisions provider).
    model: process.env.JUDGE_MODEL || "nvidia/nemotron-3.5-lightning:free",
  },
};

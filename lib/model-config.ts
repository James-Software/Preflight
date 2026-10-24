import {
  assertOpenAIDecisionsConfig,
  OPENAI_DECISIONS_MODEL,
} from "@/lib/openai-decisions";

/** Browser actions use OpenRouter; typed QA judgments use OpenAI Decisions. */
export type JudgeProvider =
  | "openai-decisions"
  | "openrouter-chat"
  | "openrouter-decisions";
const judgeProvider = (process.env.JUDGE_PROVIDER ||
  "openai-decisions") as JudgeProvider;

export const MODEL_CONFIG = {
  driver: {
    provider: "openrouter-chat" as const,
    model: process.env.DRIVER_MODEL || "openai/gpt-5.6-luna",
  },
  judge: {
    provider: judgeProvider,
    model:
      process.env.JUDGE_MODEL ||
      (judgeProvider === "openai-decisions"
        ? OPENAI_DECISIONS_MODEL
        : "openai/gpt-4o-mini"),
  },
};

/** Fail before allocating paid browsers when worker credentials/config are missing. */
export function assertSwarmModelConfig(): void {
  if (
    !["openai-decisions", "openrouter-chat", "openrouter-decisions"].includes(
      MODEL_CONFIG.judge.provider,
    )
  ) {
    throw new Error(
      "JUDGE_PROVIDER must be openai-decisions, openrouter-chat, or openrouter-decisions",
    );
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set in the Trigger.dev worker environment; the browser driver needs it.",
    );
  }
  if (MODEL_CONFIG.judge.provider === "openai-decisions") {
    assertOpenAIDecisionsConfig(MODEL_CONFIG.judge.model);
  }
}

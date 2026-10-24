import { setTimeout as delay } from "node:timers/promises";

// Contract: https://github.com/openai/openai-node/blob/21a056dc61ceca96aceda58a845353b3c1b13efc/src/resources/decisions.ts
const ENDPOINT = "https://api.openai.com/v1/decisions";
export const OPENAI_DECISIONS_MODEL = "gpt-6-luna";

type Question = {
  name: string;
  instructions: string;
} & (
  | { type: "predicate" }
  | { type: "choice"; choices: { value: string; description: string }[] }
);
type PredicateAnswer = { type: "predicate"; probability: number };
type ChoiceAnswer = { type: "choice"; choice: string; confidence: number };
type Request = { model: string; input: string; question: Question };

export function assertOpenAIDecisionsConfig(model: string): string {
  if (model !== OPENAI_DECISIONS_MODEL) {
    throw new Error(
      `OpenAI Decisions supports ${OPENAI_DECISIONS_MODEL}. Set JUDGE_MODEL=${OPENAI_DECISIONS_MODEL} or remove the old JUDGE_MODEL override.`,
    );
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set in the Trigger.dev worker environment. Add it and redeploy the workers.",
    );
  }
  return key;
}

function probability(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      "OpenAI Decisions returned an invalid probability/confidence",
    );
  }
  return value;
}

export function askOpenAIDecision(
  args: Request & { question: Question & { type: "predicate" } },
): Promise<PredicateAnswer>;
export function askOpenAIDecision(
  args: Request & { question: Question & { type: "choice" } },
): Promise<ChoiceAnswer>;
export async function askOpenAIDecision({
  model,
  input,
  question,
}: Request): Promise<PredicateAnswer | ChoiceAnswer> {
  const key = assertOpenAIDecisionsConfig(model);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: input.slice(0, 30000),
        questions: [question],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) break;
    if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
      await response.body?.cancel();
      await delay(500 * 2 ** attempt);
      continue;
    }
    // Don't include response bodies: they can echo private test input or credentials.
    await response.body?.cancel();
    throw new Error(`OpenAI Decisions API error ${response.status}`);
  }
  const data: unknown = await response!.json();
  const answers =
    data && typeof data === "object" && "answers" in data ? data.answers : null;
  if (
    !Array.isArray(answers) ||
    answers.length !== 1 ||
    !answers[0] ||
    typeof answers[0] !== "object" ||
    answers[0].name !== question.name
  ) {
    throw new Error("OpenAI Decisions returned no matching answer");
  }
  const answer = answers[0];
  if (answer.type === "refusal")
    throw new Error("OpenAI Decisions declined to judge this input");
  if (question.type === "predicate" && answer.type === "predicate") {
    return { type: "predicate", probability: probability(answer.probability) };
  }
  if (
    question.type === "choice" &&
    answer.type === "choice" &&
    question.choices.some((option) => option.value === answer.choice)
  ) {
    return {
      type: "choice",
      choice: answer.choice,
      confidence: probability(answer.confidence),
    };
  }
  throw new Error("OpenAI Decisions returned an invalid answer type or choice");
}

import type { ProfileGeneration } from "@/lib/profile-generation";

export class ProfileSetupResponseError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

/** Gateways can return empty/HTML responses before our JSON handler runs. */
export async function readProfileSetupResponse(
  response: Response,
): Promise<{ generation: ProfileGeneration | null }> {
  const retryable =
    response.status >= 500 || [408, 429].includes(response.status);
  let data: unknown;
  try {
    data = JSON.parse(await response.text());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ProfileSetupResponseError(
      `Profile setup did not return a usable response (HTTP ${response.status}). Retry the status check.`,
      response.status,
      retryable || response.ok,
    );
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error.slice(0, 500)
        : `Could not complete profile setup (HTTP ${response.status}). Try again.`;
    throw new ProfileSetupResponseError(message, response.status, retryable);
  }
  if (!data || typeof data !== "object" || !("generation" in data))
    throw new ProfileSetupResponseError(
      "Profile setup returned an incomplete response. Retry the status check.",
      response.status,
      true,
    );
  const generation = data.generation;
  if (
    generation !== null &&
    (!generation ||
      typeof generation !== "object" ||
      !("id" in generation) ||
      typeof generation.id !== "string" ||
      !("status" in generation) ||
      ![
        "queued",
        "running",
        "waiting",
        "completed",
        "cancelled",
        "expired",
        "error",
      ].includes(String(generation.status)) ||
      !("expiresAt" in generation) ||
      typeof generation.expiresAt !== "number" ||
      !Number.isFinite(generation.expiresAt) ||
      !("message" in generation) ||
      typeof generation.message !== "string")
  )
    throw new ProfileSetupResponseError(
      "Profile setup returned an incomplete response. Retry the status check.",
      response.status,
      true,
    );
  return { generation: generation as ProfileGeneration | null };
}

export function profileSetupErrorMessage(error: unknown) {
  return error instanceof ProfileSetupResponseError
    ? error.message
    : "Could not reach profile setup. Check your connection and try again.";
}

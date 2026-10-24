import type { ApiClientConfiguration } from "@trigger.dev/sdk";

/** Select the worker environment without inheriting an unrelated Vercel branch. */
export function getTriggerClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiClientConfiguration {
  const accessToken = env.TRIGGER_SECRET_KEY?.trim();
  if (!accessToken) {
    throw new Error(
      "TRIGGER_SECRET_KEY is missing from the web app environment.",
    );
  }
  const preview = accessToken.startsWith("tr_preview_");
  const dev = accessToken.startsWith("tr_dev_");
  if (env.VERCEL_ENV === "production" && (preview || dev)) {
    throw new Error(
      "The live app needs this project's Production TRIGGER_SECRET_KEY in Vercel. A Preview or Development key is configured instead. Update the Production environment variable and redeploy the web app.",
    );
  }
  let branch = "";
  if (preview) {
    branch =
      env.TRIGGER_PREVIEW_BRANCH?.trim() ||
      env.VERCEL_GIT_COMMIT_REF?.trim() ||
      "";
    if (!branch) {
      throw new Error(
        "The Trigger.dev Preview key needs TRIGGER_PREVIEW_BRANCH (or VERCEL_GIT_COMMIT_REF) matching a deployed Trigger.dev branch environment.",
      );
    }
  } else if (dev) {
    branch = env.TRIGGER_DEV_BRANCH?.trim() || "";
    if (branch === "default") branch = "";
  }
  // Empty string explicitly suppresses the SDK's VERCEL_GIT_COMMIT_REF fallback.
  // Pass this per request; changing the global SDK config can mix concurrent calls.
  return { accessToken, previewBranch: branch };
}

export function swarmStartError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/no matching branch env/i.test(message)) {
    return "Could not start the swarm: Trigger.dev has no matching worker branch environment. For the live site, configure this project's Production TRIGGER_SECRET_KEY in Vercel and redeploy. For a preview, deploy the matching branch in Trigger.dev and use its Preview key. Do not change the project's App URL to fix this.";
  }
  return `Could not start the swarm: ${message.slice(0, 500)}`;
}

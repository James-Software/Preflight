import { auth } from "@/auth";

/** An app session and a GitHub connection are separate prerequisites. */
export async function githubConnectionStatus() {
  const session = await auth();
  if (
    session?.user?.githubId &&
    session.user.githubLogin &&
    !session.user.isTestUser
  )
    return {
      status: 401,
      body: {
        code: "GITHUB_REAUTH_REQUIRED",
        error: "Your GitHub connection needs renewal.",
        tokenExpired: true,
      },
    };
  return session?.user?.githubId
    ? {
        status: 409,
        body: {
          code: "GITHUB_NOT_CONNECTED",
          error:
            "GitHub is not connected to this account. Connect GitHub to choose a repository.",
        },
      }
    : {
        status: 401,
        body: {
          code: "APP_SESSION_REQUIRED",
          error: "Sign in to continue.",
          tokenMissing: true,
        },
      };
}

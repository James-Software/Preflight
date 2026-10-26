import { task } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { profileProject } from "@/lib/auth-profiles";
import { closeBrowserSession } from "@/lib/browserbase";

export const releaseProfileBrowser = task({
  id: "release-profile-browser",
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async (payload: {
    owner: string;
    projectId: number;
    captureId: string;
  }) => {
    await profileProject(payload.owner, payload.projectId);
    const rows =
      await getSql()`SELECT session_id FROM profile_captures WHERE id=${payload.captureId}::uuid AND owner_github_id=${payload.owner} AND project_id=${payload.projectId} AND automation_status IS NOT NULL AND status IN ('cancelled','expired','error','completed')`;
    const sessionId = (rows as { session_id: string | null }[])[0]?.session_id;
    if (sessionId) {
      try {
        await closeBrowserSession(sessionId);
      } catch {
        throw new Error(
          "Could not release the private browser. The provider timeout remains active.",
        );
      }
    }
  },
});

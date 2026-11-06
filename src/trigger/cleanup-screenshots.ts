import { schedules } from "@trigger.dev/sdk";
import { expirePrivateScreenshots, privatizeLegacyScreenshots } from "@/lib/screenshot-retention";

// Legacy migration is paused by default; explicitly opt in only after Blob
// quota recovers. Keep the existing task ID so deployment replaces its schedule.
export const privatizeScreenshots = schedules.task({
  id: "privatize-screenshots",
  cron: { pattern: "0 10 * * *", environments: ["PRODUCTION"] },
  maxDuration: 600,
  queue: { name: "private-screenshot-migration", concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => privatizeLegacyScreenshots(),
});

export const cleanupScreenshots = schedules.task({
  id: "cleanup-screenshots",
  cron: { pattern: "0 11 * * *", environments: ["PRODUCTION"] },
  maxDuration: 600,
  run: async () => {
    const privateDeleted = await expirePrivateScreenshots();
    return { privateDeleted };
  },
});

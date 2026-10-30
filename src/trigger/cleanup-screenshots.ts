import { schedules } from "@trigger.dev/sdk";
import { expirePrivateScreenshots, privatizeLegacyScreenshots } from "@/lib/screenshot-retention";

// Keep retiring legacy public URLs until every preserved image has been deleted
// from Blob. The durable outbox survives worker failures and deployment retries.
export const privatizeScreenshots = schedules.task({
  id: "privatize-screenshots",
  cron: { pattern: "*/5 * * * *", environments: ["PRODUCTION"] },
  maxDuration: 600,
  queue: { name: "private-screenshot-migration", concurrencyLimit: 1 },
  run: async () => privatizeLegacyScreenshots(),
});

export const cleanupScreenshots = schedules.task({
  id: "cleanup-screenshots",
  cron: { pattern: "0 11 * * *", environments: ["PRODUCTION"] },
  maxDuration: 600,
  run: async () => {
    const migration = await privatizeLegacyScreenshots();
    const privateDeleted = await expirePrivateScreenshots();
    return { ...migration, privateDeleted };
  },
});

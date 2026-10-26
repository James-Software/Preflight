import { schedules } from "@trigger.dev/sdk";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

export const expireProfileSetups = schedules.task({
  id: "expire-profile-setups",
  cron: "*/15 * * * *",
  maxDuration: 60,
  run: async () => {
    await ensureSchema();
    // Provider timeout has already released these private browsers. Discard
    // abandoned test passwords; never modify the app's test accounts or data.
    await getSql()`UPDATE profile_captures SET automation_credentials=NULL,automation_live_url=NULL,automation_token=NULL,status=CASE WHEN status IN ('active','saving') THEN 'expired' ELSE status END
      WHERE automation_status IS NOT NULL AND expires_at<=NOW() AND (automation_credentials IS NOT NULL OR automation_live_url IS NOT NULL OR status IN ('active','saving'))`;
  },
});

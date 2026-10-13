import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_ljxajhpzdvjlpkplggit",
  dirs: ["./src/trigger"],
  // Swarm runs are long-lived; allow up to 1h per task run.
  maxDuration: 3600,
});

import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_ljxajhpzdvjlpkplggit",
  dirs: ["./src/trigger"],
  // Swarm runs are long-lived; allow up to 1h per task run.
  maxDuration: 3600,
  build: {
    // playwright-core can't be bundled by esbuild (its internal
    // chromium-bidi imports don't resolve); keep it external so it's
    // loaded from node_modules at runtime instead.
    external: ["playwright-core", "pg"],
  },
});

// Deploys run automatically via the Trigger.dev GitHub integration on push to main.

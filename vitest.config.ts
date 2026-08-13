import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/core/test/**/*.test.ts", "apps/worker/test/**/*.test.ts"],
    passWithNoTests: false,
  },
});

import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const resolveConfig = {
  alias: { c3r: resolve(import.meta.dirname, "packages/c3r/src/C3R.ts") },
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: resolveConfig,
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["packages/*/test/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts"],
        },
      },
      {
        resolve: resolveConfig,
        publicDir: "examples/public",
        test: {
          name: "browser",
          include: ["packages/*/test/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            viewport: { width: 1000, height: 400 },
          },
        },
      },
    ],
  },
});

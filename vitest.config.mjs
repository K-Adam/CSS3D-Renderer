import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: { c3r: resolve(import.meta.dirname, "packages/c3r/src/C3R.ts") },
    },
    test: { environment: "happy-dom" },
});

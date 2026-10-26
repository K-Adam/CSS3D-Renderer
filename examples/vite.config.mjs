import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const here = (path) => resolve(import.meta.dirname, path);

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      c3r: here("../packages/c3r/src/C3R.ts"),
      "c3r-three": here("../packages/c3r-three/src/C3RRenderer.ts"),
    },
  },
  build: {
    rolldownOptions: {
      input: readdirSync(import.meta.dirname)
        .filter((file) => file.endsWith(".html"))
        .map(here),
    },
  },
});

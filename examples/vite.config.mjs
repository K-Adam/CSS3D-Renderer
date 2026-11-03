import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { demos } from "./demos.mjs";

const here = (path) => resolve(import.meta.dirname, path);

export default defineConfig({
  base: "./",
  plugins: [demos()],
  resolve: {
    alias: {
      c3r: here("../packages/c3r/src/C3R.ts"),
      "c3r-three": here("../packages/c3r-three/src/C3RRenderer.ts"),
    },
  },
  build: {
    rolldownOptions: {
      input: [
        "index.html",
        ...["standalone", "threejs"].flatMap((dir) =>
          readdirSync(here(dir))
            .filter((file) => file.endsWith(".html"))
            .map((file) => `${dir}/${file}`),
        ),
      ].map(here),
    },
  },
});

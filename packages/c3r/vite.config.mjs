import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "vite";

const license = (title, file) =>
  `/**\n * @license ${title}\n` +
  readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => ` * ${line}`.trimEnd())
    .join("\n") +
  "\n */";

const postBanner = license("C3R", "LICENSE");
const glMatrixLicense = createRequire(import.meta.url).resolve(
  "gl-matrix/LICENSE.md",
);

// Two passes, because gl-matrix is external in the ESM build and bundled in the browser one
export default defineConfig(({ mode }) => ({
  build: {
    lib: { entry: "src/C3R.ts" },
    minify: false,
    emptyOutDir: mode !== "min",
    rolldownOptions:
      mode === "min"
        ? {
            output: [
              {
                format: "umd",
                name: "C3R",
                entryFileNames: "c3r.min.js",
                minify: true,
                comments: false,
                postBanner:
                  postBanner + "\n" + license("gl-matrix", glMatrixLicense),
              },
            ],
          }
        : {
            external: ["gl-matrix"],
            output: [{ format: "es", entryFileNames: "c3r.js", postBanner }],
          },
  },
}));

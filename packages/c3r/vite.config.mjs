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
const glMatrixLicense = createRequire(import.meta.url).resolve("gl-matrix/LICENSE.md");
const umd = { format: "umd", name: "C3R", globals: { "gl-matrix": "glMatrix" }, postBanner };
const min = { minify: true, comments: false };

// Two passes, because gl-matrix is external in one and bundled in the other
export default defineConfig(({ mode }) => ({
    build: {
        lib: { entry: "src/C3R.ts" },
        minify: false,
        emptyOutDir: mode !== "standalone",
        rolldownOptions:
            mode === "standalone"
                ? {
                      output: [
                          {
                              ...umd,
                              ...min,
                              entryFileNames: "C3R.standalone.js",
                              postBanner: postBanner + "\n" + license("gl-matrix", glMatrixLicense),
                          },
                      ],
                  }
                : {
                      external: ["gl-matrix"],
                      output: [
                          { format: "es", entryFileNames: "C3R.mjs", postBanner },
                          { ...umd, entryFileNames: "C3R.js" },
                          { ...umd, ...min, entryFileNames: "C3R.min.js" },
                      ],
                  },
    },
}));

import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const license = (title, file) =>
    `/**\n * @license ${title}\n` +
    readFileSync(file, "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => ` * ${line}`.trimEnd())
        .join("\n") +
    "\n */";

const postBanner = license("c3r-three", "LICENSE");

export default defineConfig({
    build: {
        lib: { entry: "src/CSS3DRenderer.js" },
        minify: false,
        rolldownOptions: {
            external: ["three", "c3r", "gl-matrix"],
            output: [
                { format: "es", entryFileNames: "c3r-three.module.js", postBanner },
                {
                    format: "umd",
                    name: "THREE",
                    extend: true,
                    globals: { three: "THREE", c3r: "C3R", "gl-matrix": "glMatrix" },
                    entryFileNames: "c3r-three.js",
                    postBanner,
                },
            ],
        },
    },
});

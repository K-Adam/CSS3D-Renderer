import { readFileSync } from "node:fs";

const license = (title, file) =>
    `/**\n * @license ${title}\n` +
    readFileSync(file, "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => ` * ${line}`.trimEnd())
        .join("\n") +
    "\n */";

const banner = license("c3r-three", "LICENSE");

export default {
    input: "src/CSS3DRenderer.js",
    external: ["three", "c3r", "gl-matrix"],
    output: [
        { file: "dist/c3r-three.module.js", format: "es", banner },
        {
            file: "dist/c3r-three.js",
            format: "umd",
            name: "THREE",
            extend: true,
            globals: { three: "THREE", c3r: "C3R", "gl-matrix": "glMatrix" },
            interop: "esModule",
            banner,
        },
    ],
};

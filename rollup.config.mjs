import { readFileSync } from "node:fs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

const license = (title, file) =>
    `/**\n * @license ${title}\n` +
    readFileSync(file, "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => ` * ${line}`.trimEnd())
        .join("\n") +
    "\n */";

const banner = license("C3R", "LICENSE");
const umd = { format: "umd", name: "C3R", globals: { "gl-matrix": "glMatrix" }, banner };

export default [
    {
        input: "src/C3R.js",
        external: ["gl-matrix"],
        output: [
            { file: "build/C3R.module.js", format: "es", banner },
            { ...umd, file: "build/C3R.js" },
            { ...umd, file: "build/C3R.min.js", plugins: [terser()] },
        ],
    },
    {
        input: "src/C3R.js",
        plugins: [nodeResolve()],
        output: {
            ...umd,
            file: "build/C3R.standalone.js",
            banner: banner + "\n" + license("gl-matrix", "node_modules/gl-matrix/LICENSE.md"),
            plugins: [terser()],
        },
    },
];

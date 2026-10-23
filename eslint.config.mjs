import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["**/dist/", "examples/"] },
    js.configs.recommended,
    { languageOptions: { globals: globals.browser } },
];

import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["build/", "examples/"] },
    js.configs.recommended,
    { languageOptions: { globals: globals.browser } },
];

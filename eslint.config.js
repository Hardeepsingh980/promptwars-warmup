import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "server.js", "shared/**/*.js", "test/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser, AudioWorkletProcessor: "readonly", registerProcessor: "readonly" } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_|^request$|^response$|^next$", ignoreRestSiblings: true }],
      "no-console": "off",
      eqeqeq: "error",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  { ignores: ["node_modules/**", "data/**"] },
];

import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

// ESLint 9 flat config. Scope: the TypeScript source under src/.
// Mirrors web/eslint.config.mjs (non-type-checked recommended preset, fast, needs
// no tsconfig "project") but built from the split @typescript-eslint packages
// already in devDependencies, with Node globals instead of browser.
export default [
  { ignores: ["dist"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
];

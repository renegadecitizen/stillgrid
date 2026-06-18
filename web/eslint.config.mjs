import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// ESLint 9 flat config. Scope: the TypeScript/React source under src/.
// Uses the non-type-checked typescript-eslint recommended preset (fast, needs no
// tsconfig "project") plus the React Hooks rules the codebase relies on — note the
// intentional `// eslint-disable-next-line react-hooks/exhaustive-deps` pragmas in
// App.tsx, which are only meaningful if exhaustive-deps is actually enabled.
export default tseslint.config(
  { ignores: ["dist"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);

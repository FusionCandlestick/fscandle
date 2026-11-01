import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Lint scope kept deliberately light. Type checking is `npm run typecheck`;
// this catches unused symbols, stray `any`, and React hook misuse, including
// the stale-closure and missing-dependency bugs that hooks rules find.
export default tseslint.config(
  { ignores: ["dist/**", ".test-build/**", "tests/performance/.artifacts/**", "node_modules/**"] },
  tseslint.configs.base,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);

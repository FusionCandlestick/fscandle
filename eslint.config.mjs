import tseslint from "typescript-eslint";

// Lint scope kept deliberately light — the same posture as the pre-split
// config (which layered a single rule over eslint-config-next). Type checking
// is `npm run typecheck`; this catches unused symbols and stray `any`.
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
);

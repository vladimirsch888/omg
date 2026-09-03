// Flat config: TypeScript + React hooks rules for both apps. Kept deliberately
// close to the recommended sets — the point is catching real mistakes
// (unused vars, hook deps), not enforcing a house style; Prettier does that.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "apps/api/src/generated/**", "apps/api/prisma/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      // compactMoney() deliberately puts a non-breaking space between the
      // number and «тыс»/«млн» so axis ticks never wrap.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true }],
    },
  }
);

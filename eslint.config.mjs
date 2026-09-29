import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// The former .eslintrc.json ({"extends": ["next/core-web-vitals",
// "next/typescript"]}) in flat config, run by `eslint .` (Next 16 removed
// `next lint`).
export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react-hooks 7 (eslint-config-next 16) adds the React
    // Compiler rules to its recommended set. The app doesn't use the
    // compiler; keep the hooks rules it was linted with before
    // (rules-of-hooks, exhaustive-deps) until they are adopted on purpose.
    rules: {
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",
    },
  },
  {
    // Plain Node (CommonJS) maintenance scripts.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

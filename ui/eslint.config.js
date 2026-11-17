import tseslint from "typescript-eslint";
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  { ignores: ["vite.config.mts", "vite-env.d.ts", "build", "public"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      react.configs.flat.recommended,
      importPlugin.flatConfigs.recommended,
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      // tsconfig.test.json covers app and test files, which the type-aware rules below need.
      parserOptions: { project: "./tsconfig.test.json", tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      react: {
        version: "19.3",
      },
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.app.json", "./tsconfig.test.json"],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      "no-console": "warn",
      "react/button-has-type": "error",
      "react/react-in-jsx-scope": ["off"],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      // tsc (yarn typecheck) already checks these, and they misread Vite query imports such as `?worker`.
      // https://typescript-eslint.io/troubleshooting/typed-linting/performance#eslint-plugin-import
      "import/named": "off",
      "import/namespace": "off",
      "import/default": "off",
      "import/no-named-as-default-member": "off",
      // The build rewrites `import { X } from "antd"` to per-component paths (vite/antdSubpathImports.ts).
      // Default and namespace imports would bypass it and pull every component into the first load.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "antd",
              importNames: ["default"],
              message: "Import components by name: import { Button } from \"antd\".",
            },
          ],
        },
      ],
      // `_` marks a deliberately unused parameter or destructured binding.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      // `as const` stays allowed; every other assertion needs a type guard or a documented exception.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  }
);

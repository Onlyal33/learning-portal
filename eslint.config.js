// @ts-check

const eslint = require("@eslint/js");
const angular = require("angular-eslint");
const prettier = require("eslint-config-prettier");
const jasmine = require("eslint-plugin-jasmine");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: [
      "projects/**/*",
      "dist/**/*",
      "serverless-single-page-app-plugin/**/*",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Angular 22 adds Eager explicitly to preserve pre-v22 behavior. Moving the
      // application to OnPush is a separate runtime change, not a lint migration.
      "@angular-eslint/prefer-on-push-component-change-detection": "off",
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
  {
    files: ["**/*.spec.ts"],
    plugins: { jasmine },
    languageOptions: { globals: globals.jasmine },
    rules: jasmine.configs.recommended.rules,
  },
  prettier,
);

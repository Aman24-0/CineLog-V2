// eslint.config.js
//
// ESLint v9 flat config for CineLog V2.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 3 — ESLINT v8 → v9 UPGRADE
// ─────────────────────────────────────────────────────────────────────
// Replaces the legacy .eslintrc.cjs (RC config) with the new flat
// config format. ESLint v9 dropped support for .eslintrc.* entirely —
// flat config is the only supported format.
//
// Concurrent upgrades:
//   • eslint                v8.57.0 → v9.39.5
//   • @typescript-eslint/*  v7.8.0  → v8.66.0 (via typescript-eslint
//                                     meta-package)
//
// The `typescript-eslint` meta-package bundles the parser + plugin and
// exposes a `config()` helper that returns the recommended ruleset as
// an array of flat-config objects. We spread it and then layer on the
// Solid-specific rules + our project-specific overrides.
// ─────────────────────────────────────────────────────────────────────

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid";

export default tseslint.config(
  // ── Base JS recommended rules ───────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript-eslint recommended rules (type-aware OFF for speed) ─
  // We use the non-type-checked recommended config — the type-checked
  // variants require a tsconfig.json path and are much slower. The
  // project's type safety is enforced by `tsc --noEmit`, not ESLint.
  ...tseslint.configs.recommended,

  // ── Solid (SolidJS) plugin — typescript variant ────────────────────
  // The flat-config variant of `plugin:solid/typescript` from .eslintrc.
  // Enables Solid-specific rules (reactivity, no-destructure, prefer-for).
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { solid },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      },
      globals: {
        // Browser globals — the app runs in the browser.
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        HTMLElement: "readonly",
        Event: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        requestIdleCallback: "readonly",
        cancelIdleCallback: "readonly",
        history: "readonly",
        location: "readonly",
        // Node/SolidStart SSR globals — server entry points + API routes
        // run on Node.
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        // jsdom globals — used by Vitest test files.
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly"
      }
    },
    rules: {
      // Solid-specific rules — same as the old .eslintrc.cjs.
      "solid/prefer-for": "warn",
      "solid/reactivity": "warn",
      "solid/no-destructure": "error",
      // Allow _-prefixed identifiers to be intentionally unused — the
      // codebase already follows this convention (e.g. _mediaType, _event).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },

  // ── Test files — relax a few rules that conflict with test patterns ─
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "test/**/*.{ts,tsx}"],
    rules: {
      // Tests often use `any` for mock data + fixtures.
      "@typescript-eslint/no-explicit-any": "off",
      // Tests often assign to read-only globals (e.g. mocking window).
      "no-global-assign": "off"
    }
  },

  // ── Generated / vendored files — skip entirely ─────────────────────
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".vinxi/**",
      ".output/**",
      "coverage/**",
      "src/lib/supabase/database.types.ts",
      "package-lock.json"
    ]
  }
);

// Flat ESLint config for Fabricate.
//
// Goals: maintainability, testability, ease of change, and a predictable file
// structure. Rules are introduced staged-by-path — `npm run lint` (the CI gate)
// only targets the `.js` paths that are green today; `.svelte` files and any
// not-yet-clean `.js` paths are linted by the non-gating `lint:all` /
// `lint:svelte` scripts until follow-ups fold them into the gate. See
// CONTRIBUTING.md.
//
// Block order matters in flat config: later blocks override earlier ones, and
// `eslint-config-prettier` MUST stay last so it can switch off the stylistic
// rules Prettier owns.

import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

// FoundryVTT injects these at runtime; declaring them readonly stops `no-undef`
// from flagging legitimate Foundry API access. Kept intentionally broad —
// over-declaring a readonly global is harmless, under-declaring is a false
// positive. The codebase mostly reaches Foundry via `globalThis.foundry?.…`
// (see src/ui/svelte/util/foundryBridge.js), but bare references also occur.
const foundryGlobals = {
  game: 'readonly',
  ui: 'readonly',
  Hooks: 'readonly',
  CONFIG: 'readonly',
  CONST: 'readonly',
  canvas: 'readonly',
  foundry: 'readonly',
  fromUuid: 'readonly',
  fromUuidSync: 'readonly',
  getDocumentClass: 'readonly',
  loadTemplates: 'readonly',
  renderTemplate: 'readonly',
  CanvasAnimation: 'readonly',
  Roll: 'readonly',
  Dialog: 'readonly',
  Application: 'readonly',
  FormApplication: 'readonly',
  ChatMessage: 'readonly',
  TextEditor: 'readonly',
  Color: 'readonly',
  PIXI: 'readonly',
  Handlebars: 'readonly',
  jQuery: 'readonly',
  $: 'readonly',
  socketlib: 'readonly',
};

export default [
  // 1. Global ignores — build output, deps, generated docs/site, lockfile.
  {
    ignores: ['dist/', 'node_modules/', 'docs/', 'coverage/', '**/*.min.js', 'package-lock.json'],
  },

  // 2. Correctness baseline for every JS file.
  js.configs.recommended,

  // 3. Import hygiene + modern-idiom rules, scoped to JS (the recommended sets
  //    are otherwise file-agnostic; .svelte gets its own parser/plugin below).
  { ...importX.flatConfigs.recommended, files: ['**/*.js', '**/*.mjs'] },
  { ...unicorn.configs.recommended, files: ['**/*.js', '**/*.mjs'] },

  // 4. Project-wide language options + the opinionated rule layer.
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // --- Maintainability / predictability -------------------------------
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'always'],
      eqeqeq: ['error', 'smart'],
      'no-param-reassign': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          // Allow the destructure-to-omit idiom: `const { drop, ...rest } = obj`
          // pulls `drop` out solely to strip it from `rest`. Renaming it would
          // change which key is stripped, so the extracted sibling is exempt.
          ignoreRestSiblings: true,
        },
      ],

      // --- Import structure (ease of change + predictable layout) ---------
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/order': [
        'error',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        },
      ],
      // Explicit `.js` extensions are required for native ESM resolution.
      'import-x/extensions': ['error', 'ignorePackages'],

      // --- Curated unicorn: disable the high-churn / poor-fit rules -------
      // Renaming every abbreviation (opts, args, doc, btn, …) is unjustified churn.
      'unicorn/prevent-abbreviations': 'off',
      // The codebase and the Foundry API use `null` deliberately.
      'unicorn/no-null': 'off',
      // `reduce` is idiomatic here; banning it hurts more than it helps.
      'unicorn/no-array-reduce': 'off',
      // Foundry binds `this` in hook/wrapper callbacks outside any class — this
      // rule would force breaking those bindings.
      'unicorn/no-this-outside-of-class': 'off',
      // `.toSorted()` is a non-mutating copy; auto-swapping `.sort()` for it
      // silently changes in-place-sort semantics.
      'unicorn/no-array-sort': 'off',
      // structuredClone throws on functions/DOM nodes; the codebase uses
      // `JSON.parse(JSON.stringify())` as a deliberate forgiving fallback.
      'unicorn/prefer-structured-clone': 'off',
      // Stylistic import-shape and micro-optimisation rules with low value /
      // high manual churn for this codebase.
      'unicorn/import-style': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/prefer-set-has': 'off',
      'unicorn/consistent-function-scoping': 'off',
      // Source files are camelCase (foundryBridge.js), PascalCase (Recipe.js,
      // CraftingEngine.js), and kebab-case (test/spec files) by design.
      'unicorn/filename-case': [
        'error',
        { cases: { camelCase: true, pascalCase: true, kebabCase: true } },
      ],
    },
  },

  // 5. Browser + Foundry runtime globals for shipped module code.
  {
    files: ['src/**/*.js', 'main.js'],
    languageOptions: {
      globals: { ...globals.browser, ...foundryGlobals },
    },
  },

  // 6. Node tooling (build/release scripts and root config files). These are
  //    CLI entry points, so process control and console output are expected.
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'unicorn/no-process-exit': 'off',
      'no-console': 'off',
    },
  },

  // 7. Tests run under `node --test` with a happy-dom DOM, and dynamically
  //    import shipped code — so they see both Node and browser globals. Relax
  //    the rules that punish test ergonomics.
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...foundryGlobals },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'unicorn/no-useless-undefined': 'off',
      'unicorn/consistent-function-scoping': 'off',
      // Test fixtures build DOM imperatively and invoke handlers directly (e.g.
      // `el.oninput = fn; …; el.oninput(evt)`). The unicorn DOM-modernisation
      // rules rewrite these into forms that change fixture behaviour (handlers
      // no longer directly callable, `CSS.escape` which happy-dom lacks, etc.),
      // so they are off for tests — they carry no value in throwaway fixtures.
      'unicorn/prefer-add-event-listener': 'off',
      'unicorn/no-incorrect-query-selector': 'off',
      'unicorn/better-dom-traversing': 'off',
      'unicorn/prefer-dom-node-append': 'off',
      'unicorn/dom-node-dataset': 'off',
      'unicorn/require-css-escape': 'off',
      'unicorn/no-this-assignment': 'off',
      'unicorn/no-object-as-default-parameter': 'off',
      // Test mocks are often static-only classes passed where production code
      // expects a constructor (`typeof X === 'function'`); converting them to
      // plain objects breaks those `typeof`/`new` call sites.
      'unicorn/no-static-only-class': 'off',
    },
  },

  // 8. Svelte components (Svelte 5 runes). Wired up so `lint:svelte` works, but
  //    intentionally NOT part of the gated `lint` script yet — folded into the
  //    required check in a follow-up once findings are triaged.
  ...svelte.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.svelte'],
  })),
  {
    files: ['**/*.svelte'],
    languageOptions: {
      globals: { ...globals.browser, ...foundryGlobals },
    },
  },

  // 9. Prettier compatibility — disables formatting rules Prettier owns. LAST.
  prettier,
];

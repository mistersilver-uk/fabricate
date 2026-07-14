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

      // --- Curated unicorn (v67): disable rules that would rewrite deliberate
      //     patterns, restructure control flow, or change semantics -----------
      // The `_`-prefix convention for "private" members is intentional and
      // pervasive; converting to true `#` fields breaks test/sibling access and
      // changes instance enumeration/serialisation (models persist to Foundry flags).
      'unicorn/prefer-private-class-fields': 'off',
      // Renaming predicates/booleans (including exported functions) is high-churn,
      // and the autofix only rewrites in-file references — risking cross-module breakage.
      'unicorn/consistent-boolean-name': 'off',
      // Flags common `for (const … of Object.entries(…))` / chained-iterable headers;
      // non-autofixable stylistic churn against an idiomatic pattern used throughout.
      'unicorn/no-unreadable-for-of-expression': 'off',
      // Would force extracting nested loops into functions purely to avoid
      // `break`/`continue`; a behaviour-restructuring refactor, not a fix.
      'unicorn/no-break-in-nested-loop': 'off',
      // Mechanical class-member reordering with no correctness value.
      'unicorn/consistent-class-member-order': 'off',
      // The `key in obj` operator is used deliberately for plain-object map
      // membership; auto-swapping to `Object.hasOwn` changes prototype-chain semantics.
      'unicorn/no-computed-property-existence-check': 'off',
      // `[...iterator]` is clearer than `Iterator#toArray()` here; stylistic,
      // non-autofixable, and `toArray()` is not universally available at runtime.
      'unicorn/prefer-iterator-to-array': 'off',
      // Stylistic ternary reshaping the plugin declines to autofix; hand-rewrites
      // risk changing meaning for low value.
      'unicorn/prefer-minimal-ternary': 'off',
      // Declaration-ordering churn with no correctness value.
      'unicorn/no-declarations-before-early-exit': 'off',
      // `Number.isSafeInteger()` narrows the accepted range vs `Number.isInteger()`;
      // swapping would change validation semantics.
      'unicorn/prefer-number-is-safe-integer': 'off',
      // `Number()` differs from `Number.parseInt/parseFloat` on trailing
      // non-numeric characters; swapping would change parsing semantics.
      'unicorn/prefer-number-coercion': 'off',
      // Rewriting recursion into loops is a behaviour-restructuring refactor the
      // plugin cannot verify equivalent; keep the readable recursive form.
      'unicorn/no-useless-recursion': 'off',
      // Replacement values here are trusted numeric context values, not
      // user-authored patterns; the `$&`/`$1` special-pattern risk does not apply.
      'unicorn/no-unsafe-string-replacement': 'off',
      // `!(x > 0)` is deliberately NaN-safe (true for NaN) in numeric early-exit
      // guards; the opposite comparison `x <= 0` is false for NaN — not equivalent.
      'unicorn/no-negated-comparison': 'off',
      // A `.catch(() => fallback)` returning a fallback value is an idiomatic,
      // readable pattern; forcing `try`/`await` only adds nesting.
      'unicorn/prefer-await': 'off',
      // Call-nesting depth is a subjective style limit; extracting temporaries
      // purely to satisfy it adds noise without clarifying the expression.
      'unicorn/max-nested-calls': 'off',
      // `globalThis`-qualified Foundry globals (`Hooks`, `game`, `canvas`, …) are a
      // deliberate defensive access: an unguarded bare reference throws a
      // `ReferenceError` when the global is absent (e.g. a default param evaluated
      // under the `node --test` harness, which has no Foundry globals), whereas the
      // `globalThis.`-qualified form evaluates to `undefined`.
      'unicorn/no-unnecessary-global-this': 'off',
      // The plugin declines to autofix these (multi-line branches); an explicit
      // if/else reads better than a long ternary here.
      'unicorn/prefer-ternary': 'off',
      // Adjacent guards over a discriminant (mode/type) are intentionally flat;
      // chaining them into else-if restructures large blocks for no behaviour gain.
      'unicorn/prefer-else-if': 'off',
      // Explicit class/base references in static methods are clearer here, and
      // swapping to `this`/`super` changes subclass-dispatch semantics for classes
      // not designed for it (including Foundry `RegionBehaviorType` extension).
      'unicorn/class-reference-in-static-methods': 'off',
      // The comparator sorts strings by codepoint (`<`/`>`); the plugin's "simple"
      // alternative (`localeCompare`) changes ordering and would alter generated
      // signature keys (persisted data).
      'unicorn/prefer-simple-sort-comparator': 'off',
      // A deliberate module-scoped fallback sequence counter for id generation.
      'unicorn/no-top-level-assignment-in-function': 'off',
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
  //
  //    This block CONFIGURES every `scripts/` file, but the gated `lint` (and
  //    `format:check`) script only passes it the release publish path — the
  //    semver/release-tag/publish-guard libs, `release-s3.js`, and the tag-validator
  //    CLI — named one by one. That is deliberate: `scripts/lib/zip.js` has lint
  //    errors and fails Prettier, and its autofixes would land on the Windows
  //    `Compress-Archive` path that builds the published artefact — with no test
  //    coverage to catch a regression. Add new script files to the gate as they land;
  //    do NOT widen the gate to `scripts/lib/**` until zip.js is cleaned up and
  //    covered.
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

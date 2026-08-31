// Flat ESLint config for Fabricate.
//
// Goals: maintainability, testability, ease of change, and a predictable file
// structure. Rules are introduced staged-by-path. Two scripts gate in CI:
// `npm run lint` targets the `.js` paths that are green today, and
// `npm run lint:svelte` targets every `.svelte` file under `src/` — both run as
// separate steps of the required `lint` job. The remaining not-yet-clean `.js`
// paths are linted only by the non-gating `lint:all` script until follow-ups
// fold them into the gate. See CONTRIBUTING.md.
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
  // Deprecated but still reachable, and reached under a `typeof` guard in the manager app's
  // export path. Declaring it is exactly what this map is for.
  saveDataToFile: 'readonly',
};

// Svelte 5 RUNES. In a `.svelte.js` module these are compiler-provided, so ESLint sees bare
// identifiers and reports `no-undef` on every one - measured, 147 of them across the fourteen
// rune modules, from TWO names (`$state` 80, `$derived` 67); the 148th report in that baseline
// is `saveDataToFile` above, not a rune. Without declaring them the whole `.svelte.js` class -
// including the 1577-line GM manager app and the base mixin of every V2 application - is
// checked by NOTHING, which is the gap `tests/main-undefined-identifiers.test.js` exists to
// close.
//
// SCOPED TO `**/*.svelte.js` ALONE, and unlike `foundryGlobals` above the scope is load-bearing
// rather than tidy. "Over-declaring a readonly global is harmless" holds for a Foundry global,
// which really is present at runtime everywhere the code runs. A rune is NOT: outside a rune
// module `$state(...)` is a genuine defect - it compiles to nothing and fails silently at
// runtime - and `no-undef` is what catches it today. Declaring these repo-wide would retire
// that check to buy a convenience.
const svelteRuneGlobals = {
  $state: 'readonly',
  $derived: 'readonly',
  $effect: 'readonly',
  $props: 'readonly',
  $bindable: 'readonly',
  $inspect: 'readonly',
  $host: 'readonly',
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

  // 4b. Svelte 5 rune globals, for rune modules ONLY. A separate block rather than a wider
  //     spread because ESLint MERGES `globals` across every block whose `files` match, so a
  //     `.svelte.js` file gets browser + Foundry + runes while a plain `.js` file keeps
  //     `no-undef` on a rune used where no compiler will process it.
  {
    files: ['**/*.svelte.js'],
    languageOptions: {
      globals: { ...svelteRuneGlobals },
    },
  },

  // 5. Browser + Foundry runtime globals for shipped module code.
  {
    files: ['src/**/*.js', 'main.js'],
    languageOptions: {
      globals: { ...globals.browser, ...foundryGlobals },
    },
  },

  // 5b. The Scoped Entity Definitions dependency boundary (issue 1358).
  //
  //     `scopedDefinitions.js` is the generic three-layer primitive; `componentScope.js`,
  //     `essenceScope.js` and `toolScope.js` CONFIGURE it with their own section names and
  //     field-level rules. The dependency runs one way only — the three scope modules import the
  //     primitive, never the reverse — because the primitive is what the store, the migration, the
  //     export upcast and the GM screens all have to agree with, and a primitive that reached back
  //     into one entity's rules would make the other two entities' answers depend on it.
  //
  //     A cycle here would also be invisible to `import-x/no-cycle` for as long as the reverse edge
  //     is the only one: an edge that no module completes is not a cycle yet, it is a cycle waiting
  //     for the next caller. So the boundary is stated rather than inferred.
  //
  //     Belt AND braces: `tests/scoped-definitions.test.js` pins the same boundary by PARSING the
  //     file's real import specifiers, because a lint rule is only enforced where lint is run and
  //     the glob patterns below cannot see an indirection through a barrel re-export.
  //
  //     TWO SPELLINGS ARE LISTED PER MODULE, with and without the `.js` extension. Node's ESM
  //     resolver rejects an extensionless relative specifier, but the bundler and the editor do
  //     not, and `no-restricted-imports` matches the SPECIFIER TEXT rather than a resolved path —
  //     so `'./componentScope'` slips a single-spelling pattern entirely.
  //
  //     THIS RULE DOES NOT SEE `import()` AT ALL — not a string-literal one, and not a
  //     template-literal one. That is a limitation of the rule, not of the patterns, so the
  //     DYNAMIC half of this boundary is enforced only by the parsing test, which extracts both
  //     literal forms and additionally fails a computed specifier it cannot read.
  {
    files: ['src/systems/scopedDefinitions.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/componentScope.js',
                '**/essenceScope.js',
                '**/toolScope.js',
                '**/componentScope',
                '**/essenceScope',
                '**/toolScope',
              ],
              message:
                'scopedDefinitions.js is the generic primitive: the three scope modules import it, never the reverse.',
            },
          ],
        },
      ],
    },
  },

  // 6. Node tooling (build/release scripts and root config files). These are
  //    CLI entry points, so process control and console output are expected.
  //
  //    This block CONFIGURES every `scripts/` file, but the gated `lint` (and
  //    `format`/`format:check`) scripts only pass it a subset — the release publish
  //    path, the smoke-harness libs, and a few others — named one by one.
  //
  //    That narrowness is measured, not habitual. ESLint over `scripts/**/*.{js,mjs}`
  //    reports 993 findings across 15 of 33 files, and 844 of them are in
  //    `scripts/foundry-test-run.mjs` alone — the Foundry smoke harness, whose Phase D0
  //    pins selectors by class, `.nth(N)` index and visible button text with no unit
  //    coverage over any of them. THAT is the blocker for a `scripts/**` glob, by two
  //    orders of magnitude; `scripts/lib/zip.js` (6 findings, fails Prettier, autofixes
  //    landing on the Windows `Compress-Archive` path that builds the published
  //    artefact, also untested) is a real but secondary one.
  //
  //    Add new script files to the gate as they land — and note that this is now
  //    ENFORCED rather than merely requested: `tests/scripts-lint-gate-coverage.test.js`
  //    parses the paths out of the `lint` script and fails `npm test` on any ungated
  //    `scripts/**` file that is not recorded as acknowledged debt in
  //    `tests/scripts-known-ungated.js`, a baseline that may only shrink and whose
  //    length is capped. Do NOT widen the gate to `scripts/lib/**` or `scripts/**` on
  //    the strength of that guard; it tracks the debt, it does not clear it.
  //
  //    The `files` glob below and that test's `LINTED_EXTENSIONS` must name the same
  //    extensions, or a newly configured file becomes invisible to the ratchet instead
  //    of gated by it. That is not left to prose: the test PARSES this glob and fails
  //    if it names an extension the enumeration would miss. `cjs` is listed because
  //    this repository is `"type": "module"`, so `.cjs` is how CommonJS gets written
  //    here — without it such a file would be forced into the `lint` list by the
  //    ratchet and then fail `no-undef` on `require`, having missed this block's
  //    Node globals.
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'unicorn/no-process-exit': 'off',
      'no-console': 'off',
    },
  },

  // 6b. Harness scripts that ship code INTO a browser page.
  //
  //     A Playwright `page.evaluate(fn)` serialises `fn` and runs it inside Foundry's page, so the
  //     body legitimately references `document`, `HTMLElement`, `game` and friends — none of which
  //     exist in the Node process that wrote them. Without these globals `no-undef` fires on
  //     perfectly correct in-page code, and the only ways to silence it are worse than declaring
  //     them: a file-level disable, or `globalThis.`-qualifying every DOM reference (which changes
  //     what a `page.evaluate` body reads like for no benefit inside a page that always has a DOM).
  //
  //     Scoped to the two files that actually do this rather than to `scripts/**`: over-declaring
  //     browser globals across the whole harness would hide a real `document` typo in Node code.
  {
    files: [
      'scripts/lib/foundryBrowserBoot.js',
      'scripts/foundry-version-assert.mjs',
      // The Checks Studio parity extractor (issue 1096): its whole measurement pass is one
      // `page.evaluate` body reading `getComputedStyle` inside the prototype's page.
      'scripts/checks-studio-parity-extract.mjs',
      // The Foundry perf profile (issue 1073): its scenarios and its seeding are almost entirely
      // `page.evaluate` bodies driving `game`, `Actor` and the rendered DOM.
      'scripts/lib/foundryPerfScenarios.js',
      'scripts/foundry-perf-run.mjs',
    ],
    languageOptions: {
      globals: { ...globals.browser, ...foundryGlobals },
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

  // 8. Svelte components (Svelte 5 runes). This block IS gated: `npm run
  //    lint:svelte` runs it over every `.svelte` file under `src/` as its own
  //    step of the required `lint` CI job, so a new finding here fails the
  //    build. It runs with `--max-warnings=0`, which matters because
  //    `svelte.configs.recommended` ships two WARN-level rules
  //    (`svelte/no-at-debug-tags`, `svelte/no-inspect`) — without the flag a
  //    stray `{@debug}` tag or a leftover `$inspect()` would report and the job
  //    would still exit 0.
  //
  //    `svelte/no-unused-svelte-ignore` (from the recommended set) makes the
  //    gate bidirectional: a `svelte-ignore` comment that no longer suppresses
  //    anything is itself a failure, so suppressions must be removed once they
  //    stop being needed.
  //
  //    A finding has three legitimate dispositions — fix the code, tune the
  //    config here, or suppress with a stated rationale. Suppressions use
  //    `eslint-disable-next-line` only (never a file-level disable) and carry a
  //    one-line rationale; markup sites need the HTML-comment form
  //    `<!-- eslint-disable-next-line <rule> -->`, since a `//` in markup
  //    renders as literal on-screen text.
  //
  //    Note this gate covers the script and markup of a component only. Prettier
  //    now formats `.svelte` too — `prettier-plugin-svelte` is registered in
  //    `.prettierrc.json` and `format:check` covers `src/**/*.svelte`. Svelte
  //    COMPILER warnings are gated separately as of issue 924 — `onwarn` in
  //    `svelte.config.js` fails `npm run build`, and `npm run lint:svelte:warnings`
  //    sweeps every component graph-independently as its own step of this same CI
  //    job — so a11y and `css_unused_selector` findings are ESLint's business no
  //    more than they were, but they no longer pass unnoticed either. Stylelint
  //    (scoped `<style>` blocks) still excludes `.svelte`.
  ...svelte.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.svelte'],
  })),
  {
    files: ['**/*.svelte'],
    // LOAD-BEARING, and pinned rather than left to ESLint's default. The ~42
    // `eslint-disable-next-line` directives in these components are position-
    // sensitive: they sit on the line above the code they suppress, and a
    // reformat (Prettier now owns `.svelte` layout) moves lines. That is safe
    // only because BOTH failure shapes are caught. If a directive slips off its
    // violation, the violation resurfaces as an unsuppressed error. If it lands
    // somewhere suppressing nothing, this option reports it AS AN ERROR and the
    // job exits 1 on its own — at `'error'` the reporting does not go through
    // `--max-warnings=0`, unlike ESLint's `'warn'` default. Leaving the second
    // half to that implicit default would let an unrelated config change silently
    // drop it with no test announcing the loss.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: {
      globals: { ...globals.browser, ...foundryGlobals },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // 9. Prettier compatibility — disables formatting rules Prettier owns. LAST.
  prettier,
];

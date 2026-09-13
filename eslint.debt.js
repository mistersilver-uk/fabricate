/**
 * ESLINT_DEBT / ESLINT_TESTS_DEBT — the ratchet baseline for tests/lint-coverage.test.js.
 *
 * `npm run lint` is a GLOB now (issue #1660). It was an allowlist of about eighty hand-written
 * paths, and the trap that list carried is the one issue #933 was filed about: a file nobody
 * remembered to add was linted by nothing, and the miss surfaced at the slowest possible point —
 * SonarCloud, after push. A glob inverts that. A new file is gated the moment it lands, and going
 * ungated costs a deliberate, reviewable edit to this file.
 *
 * WHY RULES ARE DISABLED PER FILE RATHER THAN THE FILE IGNORED
 * -----------------------------------------------------------
 * An `ignores` entry is the cheaper thing to write and the wrong thing to ship. It takes the file
 * out of ESLint's reach entirely, so the file loses every rule — including the ones it passes
 * today. `src/main.js` is the example that settles it: it is not in the old gate, yet
 * `tests/main-undefined-identifiers.test.js` exists precisely because a `ReferenceError` shipped in
 * it past lint, tests and build, and that test runs `no-undef` over it by hand. Ignoring it here
 * would have deleted that coverage while the file-count went UP, which reads as progress in a diff
 * and is a regression in fact.
 *
 * So each entry names the rules that file violates TODAY, and nothing else. Every other rule stays
 * armed on it from the moment this lands. The debt then shrinks along two axes rather than one: a
 * file leaves when its last rule is fixed, and a rule leaves a file when that rule is fixed.
 *
 * `no-undef` MUST NEVER APPEAR HERE. It is the rule whose absence cost this repository a shipped
 * runtime error, and it is clean across every file below. `tests/lint-coverage.test.js` asserts
 * that rather than trusting this sentence.
 *
 * HOW THE COUNTS WORK
 * -------------------
 * Each group pins its file count and its (file, rule) pair count EXACTLY, not as a ceiling — the
 * same shape, and for the same reason, as ACKNOWLEDGED_UNGATED_COUNT in
 * `tests/scripts-lint-gate-coverage.test.js`. A `<=` ceiling banks a free slot on every debt
 * payment: fix a file, drop its entry, and the next author can append instead of fixing and still
 * pass. Pinning exactly makes both directions a visible edit to a number.
 *
 * The groups are segmented rather than flattened so the numbers keep their meaning. `scripts` is
 * 15 files, and 15 is a number a reviewer of this repository has been trained to read — it is the
 * same fifteen `KNOWN_UNGATED_SCRIPTS` has carried since issue #933, and `scripts/foundry-test-run.mjs`
 * is still the reason it is not smaller. Folded into one ~89-entry total, a `scripts/` regression
 * would be invisible.
 *
 * Paths are POSIX always; `tests/lint-coverage.test.js` normalises before comparing.
 */
export const ESLINT_DEBT = {
  scripts: {
    'scripts/foundry-fetch-systems.mjs': [
      'import-x/order',
      'unicorn/catch-error-name',
      'unicorn/prefer-top-level-await',
    ],
    'scripts/foundry-setup-data.mjs': ['import-x/order', 'no-unused-vars'],
    'scripts/foundry-test-down.mjs': ['unicorn/catch-error-name', 'unicorn/prefer-top-level-await'],
    'scripts/foundry-test-run.mjs': [
      'import-x/order',
      'no-unused-vars',
      'preserve-caught-error',
      'unicorn/catch-error-name',
      'unicorn/consistent-existence-index-check',
      'unicorn/consistent-optional-chaining',
      'unicorn/dom-node-dataset',
      'unicorn/explicit-length-check',
      'unicorn/logical-assignment-operators',
      'unicorn/no-array-reverse',
      'unicorn/no-for-each',
      'unicorn/no-global-object-property-assignment',
      'unicorn/no-invalid-argument-count',
      'unicorn/no-negated-array-predicate',
      'unicorn/no-negated-condition',
      'unicorn/no-return-array-push',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/no-useless-template-literals',
      'unicorn/numeric-separators-style',
      'unicorn/prefer-array-from-map',
      'unicorn/prefer-dom-node-text-content',
      'unicorn/prefer-global-number-constants',
      'unicorn/prefer-global-this',
      'unicorn/prefer-includes-over-repeated-comparisons',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-single-call',
      'unicorn/prefer-split-limit',
      'unicorn/prefer-spread',
      'unicorn/prefer-string-replace-all',
      'unicorn/prefer-top-level-await',
      'unicorn/prefer-type-error',
      'unicorn/require-css-escape',
    ],
    'scripts/foundry-test-up.mjs': [
      'no-unused-vars',
      'unicorn/catch-error-name',
      'unicorn/prefer-top-level-await',
    ],
    'scripts/foundry-test.mjs': [
      'import-x/order',
      'unicorn/catch-error-name',
      'unicorn/no-invalid-argument-count',
      'unicorn/prefer-top-level-await',
    ],
    'scripts/foundry/create-mythwright-dnd5e.js': [
      'no-unused-vars',
      'unicorn/no-duplicate-loops',
      'unicorn/no-global-object-property-assignment',
      'unicorn/no-negated-condition',
      'unicorn/no-unnecessary-nested-ternary',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/no-useless-spread',
      'unicorn/prefer-array-from-map',
      'unicorn/prefer-direct-iteration',
      'unicorn/prefer-spread',
      'unicorn/prefer-string-replace-all',
      'unicorn/prefer-type-error',
    ],
    'scripts/latest-module-versions.mjs': [
      'import-x/order',
      'unicorn/no-exports-in-scripts',
      'unicorn/prefer-switch',
      'unicorn/prefer-top-level-await',
    ],
    'scripts/lib/zip.js': [
      'import-x/order',
      'no-param-reassign',
      'unicorn/prefer-string-raw',
      'unicorn/prefer-string-replace-all',
    ],
    'scripts/release.js': [
      'import-x/order',
      'no-unused-vars',
      'unicorn/catch-error-name',
      'unicorn/prefer-top-level-await',
      'unicorn/require-array-sort-compare',
    ],
    'scripts/setup-dev-module.mjs': ['unicorn/catch-error-name', 'unicorn/switch-case-braces'],
    'scripts/ui-pr-screenshot-evidence.mjs': [
      'import-x/order',
      'preserve-caught-error',
      'unicorn/consistent-existence-index-check',
      'unicorn/explicit-length-check',
      'unicorn/no-exports-in-scripts',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-early-return',
      'unicorn/prefer-includes-over-repeated-comparisons',
      'unicorn/prefer-string-raw',
      'unicorn/prefer-string-replace-all',
      'unicorn/prefer-top-level-await',
      'unicorn/prefer-unicode-code-point-escapes',
    ],
    'scripts/validate-agent-bindings.mjs': [
      'no-useless-escape',
      'unicorn/consistent-existence-index-check',
      'unicorn/explicit-length-check',
      'unicorn/no-exports-in-scripts',
      'unicorn/prefer-at',
      'unicorn/prefer-string-raw',
      'unicorn/prefer-string-replace-all',
    ],
    'scripts/verify-manager-chunk-split.mjs': ['import-x/order'],
    'scripts/vite-foundry-proxy.js': [
      'import-x/order',
      'unicorn/no-return-array-push',
      'unicorn/text-encoding-identifier-case',
    ],
  },

  srcUi: {
    'src/ui/InteractableBrowserApp.svelte.js': [
      'import-x/order',
      'unicorn/catch-error-name',
      'unicorn/no-top-level-side-effects',
    ],
    'src/ui/InteractableConfigApp.svelte.js': [
      'import-x/order',
      'unicorn/catch-error-name',
      'unicorn/no-top-level-side-effects',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-optional-catch-binding',
    ],
    'src/ui/InteractablesManagerApp.svelte.js': [
      'import-x/order',
      'no-unused-vars',
      'no-useless-assignment',
      'unicorn/catch-error-name',
      'unicorn/no-top-level-side-effects',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-optional-catch-binding',
    ],
    'src/ui/InteractionPromptApp.svelte.js': [
      'import-x/order',
      'unicorn/no-static-only-class',
      'unicorn/no-top-level-side-effects',
      'unicorn/prefer-dom-node-append',
      'unicorn/prefer-dom-node-remove',
      'unicorn/prefer-export-from',
      'unicorn/prefer-optional-catch-binding',
    ],
    'src/ui/SvelteCraftingSystemManagerApp.svelte.js': [
      'import-x/order',
      'no-unused-vars',
      'no-useless-assignment',
      'unicorn/catch-error-name',
      'unicorn/consistent-optional-chaining',
      'unicorn/no-top-level-side-effects',
      'unicorn/prefer-array-from-map',
      'unicorn/prefer-dom-node-append',
      'unicorn/prefer-dom-node-remove',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-spread',
    ],
    'src/ui/SvelteFabricateApp.svelte.js': ['import-x/order', 'unicorn/no-top-level-side-effects'],
    'src/ui/compendiumDirectoryContext.js': ['unicorn/prefer-string-replace-all'],
    'src/ui/foundryCompat.js': [
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/prefer-optional-catch-binding',
    ],
    'src/ui/interactableConfigView.js': ['unicorn/prefer-includes-over-repeated-comparisons'],
    'src/ui/itemsDirectoryButtons.js': ['unicorn/prefer-dom-node-append', 'unicorn/prefer-spread'],
    'src/ui/managerExtensions.js': ['import-x/order', 'unicorn/no-for-each'],
    'src/ui/navTabBadgeStore.js': [
      'unicorn/no-useless-collection-argument',
      'unicorn/no-useless-spread',
      'unicorn/prefer-short-arrow-method',
    ],
    'src/ui/playerExtensions.js': ['import-x/order', 'unicorn/no-for-each'],
    'src/ui/recipeAvailability.js': [
      'unicorn/no-useless-switch-case',
      'unicorn/switch-case-braces',
    ],
    'src/ui/svelte/SvelteApplicationMixin.svelte.js': ['import-x/order'],
    'src/ui/svelte/SvelteApplicationMixinCore.js': [
      'no-unused-vars',
      'unicorn/no-negated-condition',
      'unicorn/prefer-early-return',
    ],
    'src/ui/svelte/actions/anchoredPopover.js': ['unicorn/prefer-add-event-listener-options'],
    'src/ui/svelte/actions/dismissOnOutsideClick.js': ['unicorn/prefer-add-event-listener-options'],
    'src/ui/svelte/actions/dragDrop.js': ['unicorn/prefer-classlist-toggle'],
    'src/ui/svelte/actions/portal.js': ['unicorn/prefer-dom-node-append'],
    'src/ui/svelte/apps/manager/checks/checksReadiness.js': ['unicorn/no-useless-boolean-cast'],
    'src/ui/svelte/apps/manager/component/salvageDcPresets.js': [
      'unicorn/prefer-includes-over-repeated-comparisons',
    ],
    'src/ui/svelte/apps/manager/downtime/routeChromeChannel.js': ['unicorn/no-useless-undefined'],
    'src/ui/svelte/apps/manager/environment/environmentReadiness.js': ['no-unused-vars'],
    'src/ui/svelte/apps/manager/knowledge/knowledgeMutations.js': ['unicorn/catch-error-name'],
    'src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js': ['import-x/order'],
    'src/ui/svelte/apps/manager/recipe/recipeReadiness.js': [
      'unicorn/consistent-existence-index-check',
      'unicorn/no-useless-boolean-cast',
    ],
    'src/ui/svelte/apps/manager/scoped/componentScoped.js': [
      'unicorn/consistent-existence-index-check',
      'unicorn/no-negated-array-predicate',
    ],
    'src/ui/svelte/apps/manager/scoped/essenceScoped.js': [
      'no-useless-assignment',
      'unicorn/escape-case',
      'unicorn/prefer-at',
      'unicorn/prefer-string-replace-all',
      'unicorn/prefer-unicode-code-point-escapes',
    ],
    'src/ui/svelte/apps/manager/tools/toolStudio.js': [
      'import-x/order',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-switch',
    ],
    'src/ui/svelte/apps/manager/validationAnnouncement.js': ['unicorn/require-css-escape'],
    'src/ui/svelte/apps/manager/validationFocus.js': ['unicorn/prefer-string-replace-all'],
    'src/ui/svelte/stores/actorBarStore.svelte.js': ['unicorn/no-negated-array-predicate'],
    'src/ui/svelte/stores/adminComponentRowProjection.js': [
      'unicorn/prefer-optional-catch-binding',
    ],
    'src/ui/svelte/stores/adminRecipeRowProjection.js': [
      'unicorn/no-for-loop',
      'unicorn/no-negated-array-predicate',
      'unicorn/no-new-array',
      'unicorn/prefer-array-from-map',
      'unicorn/prefer-direct-iteration',
      'unicorn/prefer-spread',
    ],
    'src/ui/svelte/stores/adminStore.js': [
      'import-x/order',
      'no-unused-vars',
      'no-useless-assignment',
      'unicorn/logical-assignment-operators',
      'unicorn/no-negated-array-predicate',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-array-some',
      'unicorn/prefer-default-parameters',
      'unicorn/prefer-includes-over-repeated-comparisons',
    ],
    'src/ui/svelte/stores/adminStoreInternals.js': ['unicorn/prefer-string-replace-all'],
    'src/ui/svelte/stores/adminSystemInspectorProjection.js': [
      'import-x/order',
      'unicorn/prefer-native-coercion-functions',
      'unicorn/prefer-optional-catch-binding',
    ],
    'src/ui/svelte/stores/alchemyStore.svelte.js': [
      'unicorn/catch-error-name',
      'unicorn/no-negated-array-predicate',
      'unicorn/prefer-includes-over-repeated-comparisons',
    ],
    'src/ui/svelte/stores/craftingSourcesStore.svelte.js': ['unicorn/prefer-default-parameters'],
    'src/ui/svelte/stores/craftingStore.svelte.js': [
      'import-x/order',
      'unicorn/catch-error-name',
      'unicorn/no-useless-fallback-in-spread',
    ],
    'src/ui/svelte/stores/inventoryStore.svelte.js': [
      'import-x/order',
      'unicorn/catch-error-name',
      'unicorn/explicit-length-check',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/no-useless-switch-case',
      'unicorn/switch-case-braces',
    ],
    'src/ui/svelte/stores/journalStore.svelte.js': ['unicorn/catch-error-name'],
    'src/ui/svelte/stores/worldScopeActions.js': ['unicorn/no-negated-array-predicate'],
    'src/ui/svelte/stores/worldScopeProjection.js': ['unicorn/prefer-export-from'],
    'src/ui/svelte/util/alchemyTabAvailability.js': ['unicorn/prefer-spread'],
    'src/ui/svelte/util/autoFillResolver.js': ['no-unused-vars'],
    'src/ui/svelte/util/componentEditorSave.js': ['unicorn/no-useless-undefined'],
    'src/ui/svelte/util/dropUtils.js': ['unicorn/prefer-at'],
    'src/ui/svelte/util/formatDuration.js': ['unicorn/numeric-separators-style'],
    'src/ui/svelte/util/foundryBridge.js': [
      'no-useless-assignment',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-split-limit',
    ],
    'src/ui/svelte/util/foundryIconVocabulary.js': ['unicorn/no-negated-array-predicate'],
    'src/ui/svelte/util/gatheringFormat.js': ['unicorn/no-negated-condition'],
    'src/ui/svelte/util/importFolderGroups.js': ['unicorn/prefer-spread'],
    'src/ui/svelte/util/recipeGraphBuilder.js': [
      'no-unused-vars',
      'unicorn/no-for-loop',
      'unicorn/prefer-at',
      'unicorn/prefer-spread',
    ],
    'src/ui/svelte/util/recipeImageIcons.js': [
      'unicorn/prefer-export-from',
      'unicorn/prefer-spread',
    ],
    'src/ui/svelte/util/sceneImages.js': ['unicorn/no-useless-undefined', 'unicorn/prefer-spread'],
    'src/ui/svelte/util/sceneRegions.js': [
      'no-useless-assignment',
      'unicorn/numeric-separators-style',
      'unicorn/prefer-global-number-constants',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-spread',
    ],
    'src/ui/svelte/util/shoppingListAggregator.js': [
      'unicorn/logical-assignment-operators',
      'unicorn/prefer-array-from-map',
      'unicorn/prefer-spread',
    ],
    'src/ui/theme.js': ['unicorn/no-immediate-mutation'],
  },

  srcRoot: {
    'src/gatheringBootstrapAdapters.js': [
      'unicorn/prefer-includes-over-repeated-comparisons',
      'unicorn/prefer-spread',
    ],
    'src/gatheringResultCreation.js': [
      'unicorn/catch-error-name',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-spread',
    ],
    'src/gatheringToolRuntime.js': ['import-x/order', 'no-unused-vars', 'unicorn/prefer-spread'],
    'src/main.js': [
      'import-x/order',
      'no-param-reassign',
      'no-unused-vars',
      'no-useless-assignment',
      'unicorn/catch-error-name',
      'unicorn/no-global-object-property-assignment',
      'unicorn/no-invalid-argument-count',
      'unicorn/no-negated-condition',
      'unicorn/no-top-level-side-effects',
      'unicorn/no-undeclared-class-members',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-array-from-map',
      'unicorn/prefer-class-fields',
      'unicorn/prefer-dom-node-append',
      'unicorn/prefer-early-return',
      'unicorn/prefer-global-this',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-spread',
      'unicorn/prefer-string-replace-all',
    ],
  },

  examples: {
    'examples/macros/01-list-recipes.js': ['unicorn/no-for-each'],
    'examples/macros/02-available-recipes.js': [
      'unicorn/no-for-each',
      'unicorn/no-negated-condition',
    ],
    'examples/macros/03-get-item-uuids.js': [
      'no-unused-vars',
      'unicorn/no-for-each',
      'unicorn/no-negated-condition',
    ],
    'examples/macros/04-create-simple-recipe.js': ['unicorn/catch-error-name'],
    'examples/macros/05-craft-item.js': ['unicorn/no-for-each', 'unicorn/no-negated-condition'],
    'examples/macros/06-tag-items.js': ['unicorn/no-negated-condition'],
    'examples/macros/07-export-recipes.js': [
      'no-unused-vars',
      'unicorn/catch-error-name',
      'unicorn/prefer-dom-node-append',
      'unicorn/prefer-dom-node-remove',
      'unicorn/prefer-optional-catch-binding',
    ],
    'examples/macros/08-import-recipes.js': ['unicorn/catch-error-name'],
  },

  rootConfig: {
    'eslint.config.js': [
      'import-x/default',
      'import-x/namespace',
      'import-x/no-named-as-default',
      'import-x/no-named-as-default-member',
      'import-x/order',
    ],
    'vite.config.js': ['import-x/order', 'unicorn/prefer-node-protocol'],
  },
};

/**
 * The rules `tests/**` does not pass yet, disabled across that tree as one list.
 *
 * Per-file entries are right for the 89 files above and wrong here: 887 of the 1,040 test files
 * report something, so a per-file baseline would be a thousand-entry table that nobody reads and
 * every new test edits. A single rule list is the honest shape for a tree that the old gate did
 * not lint AT ALL.
 *
 * What this buys, and it is not nothing: every rule NOT on this list is now enforced across
 * `tests/**` for the first time — `no-undef` among them, which is absent here because the tree is
 * already clean of it. The list only shrinks.
 */
export const ESLINT_TESTS_DEBT = [
  'import-x/default',
  'import-x/no-duplicates',
  'import-x/order',
  'no-dupe-keys',
  'no-param-reassign',
  'no-regex-spaces',
  'no-sparse-arrays',
  'no-unused-vars',
  'no-useless-assignment',
  'no-useless-escape',
  'object-shorthand',
  'prefer-const',
  'unicorn/catch-error-name',
  'unicorn/consistent-compound-words',
  'unicorn/consistent-existence-index-check',
  'unicorn/escape-case',
  'unicorn/explicit-length-check',
  'unicorn/logical-assignment-operators',
  'unicorn/new-for-builtins',
  'unicorn/no-array-reverse',
  'unicorn/no-array-splice',
  'unicorn/no-duplicate-loops',
  'unicorn/no-for-each',
  'unicorn/no-for-loop',
  'unicorn/no-global-object-property-assignment',
  'unicorn/no-immediate-mutation',
  'unicorn/no-incorrect-template-string-interpolation',
  'unicorn/no-invalid-argument-count',
  'unicorn/no-lonely-if',
  'unicorn/no-negated-array-predicate',
  'unicorn/no-negated-condition',
  'unicorn/no-new-array',
  'unicorn/no-return-array-push',
  'unicorn/no-subtraction-comparison',
  'unicorn/no-top-level-side-effects',
  'unicorn/no-typeof-undefined',
  'unicorn/no-undeclared-class-members',
  'unicorn/no-unnecessary-nested-ternary',
  'unicorn/no-unreadable-array-destructuring',
  'unicorn/no-unreadable-object-destructuring',
  'unicorn/no-unused-array-method-return',
  'unicorn/no-useless-boolean-cast',
  'unicorn/no-useless-collection-argument',
  'unicorn/no-useless-fallback-in-spread',
  'unicorn/no-useless-promise-resolve-reject',
  'unicorn/no-useless-spread',
  'unicorn/no-useless-template-literals',
  'unicorn/no-zero-fractions',
  'unicorn/numeric-separators-style',
  'unicorn/prefer-array-find',
  'unicorn/prefer-array-flat',
  'unicorn/prefer-array-flat-map',
  'unicorn/prefer-array-from-map',
  'unicorn/prefer-array-some',
  'unicorn/prefer-at',
  'unicorn/prefer-class-fields',
  'unicorn/prefer-code-point',
  'unicorn/prefer-direct-iteration',
  'unicorn/prefer-dom-node-remove',
  'unicorn/prefer-dom-node-text-content',
  'unicorn/prefer-early-return',
  'unicorn/prefer-export-from',
  'unicorn/prefer-global-number-constants',
  'unicorn/prefer-global-this',
  'unicorn/prefer-includes',
  'unicorn/prefer-includes-over-repeated-comparisons',
  'unicorn/prefer-logical-operator-over-ternary',
  'unicorn/prefer-native-coercion-functions',
  'unicorn/prefer-number-properties',
  'unicorn/prefer-object-define-properties',
  'unicorn/prefer-object-iterable-methods',
  'unicorn/prefer-optional-catch-binding',
  'unicorn/prefer-query-selector',
  'unicorn/prefer-scoped-selector',
  'unicorn/prefer-short-arrow-method',
  'unicorn/prefer-single-call',
  'unicorn/prefer-split-limit',
  'unicorn/prefer-spread',
  'unicorn/prefer-string-raw',
  'unicorn/prefer-string-repeat',
  'unicorn/prefer-string-replace-all',
  'unicorn/prefer-switch',
  'unicorn/prefer-top-level-await',
  'unicorn/prefer-type-error',
  'unicorn/prefer-uint8array-base64',
  'unicorn/prefer-unicode-code-point-escapes',
  'unicorn/relative-url-style',
  'unicorn/require-array-sort-compare',
  'unicorn/switch-case-braces',
];

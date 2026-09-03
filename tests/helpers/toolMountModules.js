/**
 * The dependency manifest the mounted TOOL suites compile against (issue 1373, epic 1357).
 *
 * WHY THIS EXISTS. `createMountedComponentHarness` copies a declared set of raw `.js` modules
 * and compiles a declared set of `.svelte` modules into a temp tree. A component that reaches
 * for something absent from those lists does not FAIL the suite, it HANGS, and the run reports
 * `# cancelled` rather than `# fail`. Three tool suites - the world catalogue, the world entry
 * and the system rules inspector - all mount a tree rooted in the same Tool model closure, so
 * before this file existed each of them restated it. That is a manifest a new dependency has to
 * be added to in three places, where the suite that misses the edit goes silently unrunnable.
 *
 * It is also what the SonarCloud duplication gate reads: `tests/**` is counted exactly like
 * `src/**`, and three near-identical manifests of twenty-odd string literals are duplicated
 * lines even though every one of them is a legitimate dependency. Same reasoning, and the same
 * shape, as `checksHarnessModules.js` and `componentEditViewModules.js`.
 *
 * `tests/helpers/**` is outside the `npm test` glob, so this file adds no test count.
 *
 * IMPORT IT; DO NOT RE-TYPE IT. A copy defeats the whole point - the copy would go on naming a
 * deleted module while this one moved on.
 *
 * COMPOSE, DO NOT PRUNE. Each suite spreads the tier(s) it needs and then names its OWN extras
 * inline. A tier therefore only ever holds modules EVERY one of its consumers declares: the
 * harness's closure validator throws for a module the tree imports and the manifest omits, but
 * it says NOTHING about a declared module the tree does not import, so an over-broad tier would
 * be invisible rather than self-reporting.
 *
 * These lists were lifted from the three suites verbatim and each suite's resolved membership is
 * unchanged set-for-set. This is a de-duplication, not an audit of the closures.
 */

/**
 * The Tool model closure, declared by every mounted tool suite.
 *
 * `toolStudio.js` is the projection all three trees render a Tool through, and it imports
 * `Tool.js`, `matchTypes.js` and `toolDisplay.js` - the layering-neutral leaf the studio
 * delegates a Tool's display precedence to (issue 1119). `Tool.js` reaches `flags.js` and
 * `IngredientGroup.js` -> `Ingredient.js`, which adds the shared omitted-when-default machinery
 * in `reconstructibleDefaults.js`. `foundryBridge.js` is the localization and dialog seam; all
 * three page components import it directly.
 *
 * `overlayHost.js` arrives TRANSITIVELY and through no tool file: both Tool editors render
 * `ToolReplacementTarget.svelte` (issue 1373), which renders `SearchablePopover.svelte`, which
 * issue 1466 made import the shared portal-host resolver. Neither change is wrong on its own and
 * neither branch's suites failed; the closure only became incomplete once both landed, which is
 * why it is stated here rather than in one suite - every mounted tool tree reaches it.
 *
 * @type {ReadonlyArray<string>}
 */
export const TOOL_TREE_RAW_MODULES = Object.freeze([
  'src/config/flags.js',
  'src/models/Ingredient.js',
  'src/models/IngredientGroup.js',
  'src/models/Tool.js',
  'src/models/match/matchTypes.js',
  'src/models/reconstructibleDefaults.js',
  'src/models/toolDisplay.js',
  'src/ui/svelte/apps/manager/tools/toolStudio.js',
  // The repair block's plain-language readback (issue 1373, maintainer round 5). It is a pure
  // module rather than four lines in the component precisely so it can be one copy across the
  // two scopes that render the block, which is what puts it in EVERY mounted tool tree.
  'src/ui/svelte/apps/manager/tools/toolRepairSummary.js',
  // The ONE ingredient-kind table (issue 1373, round 8). Every tool tree renders the repair
  // block, which renders `RecipeIngredientGroupCard` -> `RecipeIngredientOption`, and both read
  // their kind glyph, tint class and one-word name from it.
  'src/ui/svelte/apps/manager/recipe/ingredientKindMeta.js',
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/overlayHost.js',
]);

/**
 * The `.svelte` primitives every mounted tool tree renders.
 *
 * The manager's ONE chip (issue 883), the shared icon fact row a tool's facts are stated on,
 * and THE labelled push-button (issue 1096) every tool action is rendered through. A `.svelte`
 * the tree renders but the harness omits HANGS the suite; it does not fail it.
 *
 * @type {ReadonlyArray<string>}
 */
export const TOOL_TREE_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
]);

/**
 * The WORLD SCOPE closure, spread on top of `TOOL_TREE_RAW_MODULES`.
 *
 * The two world tool screens - the catalogue and the entry - both build their rows from the
 * REAL projection rather than a hand-built `scope`, so both declare the whole scope stack:
 * `worldScopeProjection.js`, which imports the migration module owning the ONE list of lifted
 * identity fields plus the three per-entity scopes and `scopedDefinitions.js`, and the two
 * studios over it, `worldToolStudio.js` and the shared `scopedStudio.js`.
 *
 * The system rules inspector renders from a system's own tool row and declares none of this.
 *
 * @type {ReadonlyArray<string>}
 */
export const WORLD_TOOL_SCOPE_RAW_MODULES = Object.freeze([
  'src/migration/worldScopeEntityGrouping.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/scopedDefinitionStore.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/toolScope.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/apps/manager/scoped/worldToolStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // The shared list frame's LIFTED VIEW-STATE (issue 1438), reached through
  // `EntityCatalogueShell` -> `EntityListInspectorFrame`. Declared here because omitting a
  // module the tree imports throws in `before()`, and node reports that as `# cancelled`
  // rather than `# fail` - a silent hang with no message.
  'src/utils/managerBrowserViewState.js',
]);

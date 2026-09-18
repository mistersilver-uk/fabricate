// Shared harness for mounted Svelte component tests.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { createClassComponent } from 'svelte/legacy';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from './svelte-dom.js';
import { rewriteClientImports } from './rewriteClientImports.js';

const STATIC_IMPORT_PATTERN = /(?:^|[;\n])\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function toRepoPath(repoRoot, absolutePath) {
  return relative(repoRoot, absolutePath).replaceAll('\\', '/');
}

function resolveLocalModule(repoRoot, importerPath, specifier) {
  const absolutePath = resolve(repoRoot, dirname(importerPath), specifier);
  const candidates = [
    absolutePath,
    `${absolutePath}.js`,
    `${absolutePath}.svelte`,
    `${absolutePath}.svelte.js`,
    join(absolutePath, 'index.js'),
    join(absolutePath, 'index.svelte')
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ? toRepoPath(repoRoot, match) : null;
}

function declarationListFor(modulePath) {
  if (modulePath.endsWith('.svelte.js')) return 'runeModules';
  if (modulePath.endsWith('.svelte')) return 'compiledModules';
  return 'rawModules';
}

function formatImporterChain(importerChain) {
  return importerChain.join(' -> ');
}

function validateMountedComponentDependencies({ repoRoot, rawModules, runeModules, compiledModules, componentPath }) {
  const declaredModules = new Set([...rawModules, ...runeModules, ...compiledModules, componentPath]);
  const pending = [
    ...[...declaredModules]
      .filter((modulePath) => modulePath !== componentPath)
      .map((modulePath) => ({ modulePath, importerChain: [modulePath] })),
    { modulePath: componentPath, importerChain: [componentPath] }
  ];
  const visited = new Set();
  const missing = [];

  while (pending.length > 0) {
    const { modulePath: importerPath, importerChain } = pending.pop();
    if (visited.has(importerPath)) continue;
    visited.add(importerPath);

    const sourcePath = resolve(repoRoot, importerPath);
    if (!existsSync(sourcePath)) {
      missing.push(`declared module ${importerPath} does not exist`);
      continue;
    }

    const source = readFileSync(sourcePath, 'utf8');
    for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;

      const importedPath = resolveLocalModule(repoRoot, importerPath, specifier);
      if (!importedPath) {
        missing.push(`${importerPath} imports ${specifier}, but no local module resolves from it`);
        continue;
      }
      if (!declaredModules.has(importedPath)) {
        missing.push(
          `${formatImporterChain([...importerChain, importedPath])}; ${importerPath} imports ${specifier} (${importedPath}); add it to ${declarationListFor(importedPath)}`
        );
        continue;
      }
      pending.push({ modulePath: importedPath, importerChain: [...importerChain, importedPath] });
    }
  }

  if (missing.length > 0) {
    throw new Error(`Mounted Svelte harness dependency closure is incomplete:\n- ${missing.join('\n- ')}`);
  }
}

/**
 * Re-exported from its own leaf so mount suites keep importing it from here, while store suites
 * reach it without pulling in `svelte/legacy` and happy-dom.
 */
export { rewriteClientImports };

/**
 * Guard the whole CLIENT/SERVER split every mounted suite depends on. Svelte's exports are
 * condition-mapped: the `browser` condition selects the real client build and every other condition
 * (including Node's default) selects a server build. `npm test` passes `--conditions=browser`; a
 * bare `node --test <file>` does not, and `svelte/reactivity` is the canary for the whole set.
 *
 * @throws {Error} when the process did not resolve `svelte/reactivity` under `browser`.
 */
export function assertClientSvelteReactivity() {
  const packagePath = fileURLToPath(import.meta.resolve('svelte/package.json'));
  const browserTarget = JSON.parse(readFileSync(packagePath, 'utf8')).exports?.['./reactivity']?.browser;
  if (!browserTarget) {
    throw new Error(
      "The installed Svelte no longer declares a 'browser' condition for 'svelte/reactivity'; "
        + 'the vacuous-pass guard in tests/helpers/svelte-component-harness.js needs updating.'
    );
  }
  const expected = resolve(dirname(packagePath), browserTarget);
  const actual = fileURLToPath(import.meta.resolve('svelte/reactivity'));
  if (actual !== expected) {
    throw new Error(
      `'svelte/reactivity' resolved to ${actual}, not the client build ${expected}. `
        + 'Without the browser export condition, SvelteSet IS globalThis.Set and every '
        + 'reactivity assertion passes vacuously. Run the suite via `npm test` (which passes '
        + '--conditions=browser), or add --conditions=browser to a bare `node --test` run.'
    );
  }
}

/**
 * Install the minimal Foundry/DOM globals that mounted component tests rely on.
 * Call after `setupDOM()` so `document` exists.
 */
export function installComponentTestGlobals() {
  assertClientSvelteReactivity();
  globalThis.Text = document.createTextNode('').constructor;
  globalThis.Comment = document.createComment('').constructor;
  const labels = {
    'FABRICATE.App.Crafting.Detail.Duration': 'Duration',
    'FABRICATE.App.Crafting.Detail.TotalDuration': 'Total duration'
  };
  globalThis.game = {
    i18n: {
      localize: (key) => labels[key] ?? key,
      format: (key, data) => `${key}:${JSON.stringify(data)}`
    }
  };
}

/**
 * Build the compile/write helpers bound to a repo root and a (lazily read) temp dir. `getTempRoot`
 * is a thunk so callers can declare the temp dir up front and assign it inside `before()`.
 */
export function createSvelteCompiler(repoRoot, getTempRoot) {
  function writeCompiledSvelte(sourcePath) {
    const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
    const compiled = compile(source, { filename: sourcePath, generate: 'client', dev: true, css: 'injected' });
    const destination = join(getTempRoot(), `${sourcePath}.js`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rewriteClientImports(compiled.js.code));
  }

  function writeRawModule(modulePath) {
    const destination = join(getTempRoot(), modulePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(resolve(repoRoot, modulePath), 'utf8'));
  }

  // Compile a runes `.svelte.js` store/module (which cannot run un-compiled) into
  // the SAME temp tree as the mounted component, so a real store instance shares
  // the component's Svelte signal runtime.
  function writeCompiledModule(modulePath) {
    const source = readFileSync(resolve(repoRoot, modulePath), 'utf8');
    const compiled = compileModule(source, { filename: modulePath, generate: 'client', dev: true });
    const destination = join(getTempRoot(), `${modulePath}.js`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rewriteClientImports(compiled.js.code));
  }

  return { writeCompiledSvelte, writeRawModule, writeCompiledModule };
}

// The raw `.js` modules + compiled `.svelte` modules a `SearchablePopover`-based picker needs in a
// mounted test. Shared so picker test files do not each repeat the dependency list verbatim.
export const SEARCHABLE_POPOVER_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/foundryBridge.js',
  // The listbox cursor's arithmetic (issue 1503).
  'src/ui/svelte/util/listboxNavigation.js',
  'src/ui/svelte/util/listReorderAnnouncement.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/overlayHost.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/util/overlayBounds.js'
]);

// The compiled `.svelte` modules `SearchablePopover` ITSELF needs when it is the component under
// test — the three primitives it renders, plus itself (issue 1371).
export const SEARCHABLE_POPOVER_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte'
]);

// THE APP'S ONE SELECT, plus `Field` (its labelled-form wrapper) and the popover closure above —
// the whole compiled graph a `<Select>` composes (issue 1504).
export const SELECT_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Select.svelte',
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte'
]);

// THE ONE TONE MAP the retired status pill's call sites read (issue 1506). THE QUANTITY READINGS
// RIDE WITH IT (issue 1506).
export const STATUS_TONE_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/statusChipTone.js',
  'src/ui/svelte/util/craftingQuantityReading.js'
]);

// THE MARKS AND NOTICES the design-system pass of issue 1505 closed, as ONE closure.
export const MARKS_AND_NOTICES_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/StatBox.svelte',
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
]);

// THE SHARED PRIMITIVES THE PLAYER WINDOW'S TREES RENDER, as ONE closure (issue 1514).
export const PLAYER_APP_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/apps/PlayerViewState.svelte',
  'src/ui/svelte/components/Avatar.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Notice.svelte',
]);

// The raw `.js` modules the player Crafting tab tree needs in a mounted test.
export const CRAFTING_APP_RAW_MODULES = Object.freeze([
  // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`, spread
  // from the roster above rather than copied so the two cannot drift.
  ...SEARCHABLE_POPOVER_RAW_MODULES,
  'src/ui/svelte/util/craftingImageDefaults.js',
  // The art decision the retired `CraftingThumb` owned (issue 1506), now a pure leaf every
  // converted tile reads.
  'src/ui/svelte/util/craftingArtResolution.js',
  'src/ui/svelte/util/essenceIcons.js',
  // The essence colour fold (issue 1036).
  'src/ui/svelte/util/essenceTint.js',
  'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/craftingRecipeStatus.js',
  // THE ONE TONE MAP (issue 1506), spread from its own roster rather than copied.
  ...STATUS_TONE_RAW_MODULES,
  // Issue 1648: the authority-refusal wording `craftingStore` falls back to when a craft is refused
  // with a `reason` and no `message`.
  'src/ui/svelte/util/journalRunReasons.js',
  'src/ui/svelte/util/ingredientOptionStatus.js',
  // The requirement rail's pure slot/consumption-plan projection (issue 917).
  'src/ui/svelte/util/requirementSlots.js',
  // RecipeDetailHeader surfaces the recipe's authored craft duration pre-craft (issue 846) via this
  // formatter.
  'src/ui/svelte/util/recipeDuration.js',
  'src/systems/characterLibraries.js',
  'src/systems/CraftingListingBuilder.js',
  // Same rule, issue 1091: the browse-status vocabulary and its precedence rule moved out of the
  // builder into an import-free leaf so #1091's summary projection can share them without pulling
  // the builder in.
  'src/systems/craftingBrowseStatus.js',
  // Same rule, issue 1055: the builder resolves the displayed check formula through the
  // SAME check-modifier context the engine rolls, so it imports the resolver.
  'src/systems/checkModifierResolver.js',
  // …and issue 1094 gave that resolver its first two imports, so one entry no longer suffices.
  'src/systems/toolCheckBonus.js',
  'src/utils/craftingCheckExpression.js',
  // …and issue 1118 a FOURTH: the resolver ranks a rolling modifier by the deterministic average
  // this import-free leaf computes, which is also what tells it that a modifier rolls at all.
  'src/utils/rollExpressionAverage.js',
  'src/utils/rollFormulaRollability.js',
  // Issue 1095 gave it a third: `resolveActiveSalvageCheckFormula` delegates to the ONE salvage
  // `(mode, checkUsable)` derivation rather than re-deriving the pair.
  'src/systems/salvageCheckUsability.js',
  'src/utils/checkModifierPicks.js',
  // Same rule, issue 917: the builder now shares its step->recipe view projection and
  // its active-run step read with CraftingEngine through this import-free leaf, so it
  // must be copied alongside the builder.
  'src/systems/stepRecipeView.js',
  // Same rule, issue 1075: the builder's SUMMARY phase projects each browsable recipe through
  // #1091's canonical summary, which reads held quantities from #1077's per-pass inventory
  // snapshot.
  'src/systems/summaryProjection.js',
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/systems/inventorySnapshot.js',
  'src/config/flags.js',
  'src/systems/itemStackQuantity.js',
  'src/config/stackQuantityPathPresets.js',
  'src/utils/objectPath.js',
  // Same rule, issue 1228: the builder no longer calls `buildInventorySnapshot` directly.
  'src/systems/passInventorySnapshot.js',
  'src/utils/sourceUuid.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  // CraftingListingBuilder imports these category helpers (issue 514); the builder is already in
  // the mounted graph, so this transitive dep must be copied too or the mounted crafting tests hang
  // (# cancelled).
  'src/utils/recipeCategories.js',
  // Same rule, issue 651: the builder now derives each progressive stage's cumulative "reached at
  // >=N" threshold through this helper.
  'src/utils/progressiveStageThresholds.js',
  // The player's stored stage order is reconciled against the authored list here.
  'src/utils/progressiveResultOrder.js',
  // Same rule, issue 1286: both progressive read-models attach each stage's player complication
  // forecast through this leaf, and `inventoryStore` marks the fired tense with its sibling export.
  'src/utils/progressiveStageComplications.js',
  'src/utils/complicationPlan.js',
  'src/utils/componentComplications.js',
  // Same rule, issue 1370: `CraftingListingBuilder` and `inventorySnapshot` no longer read
  // `system.components` directly.
  'src/systems/scopedEntityReads.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/worldScopeEntityGrouping.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js'
]);

// Every transitive `.svelte` module in the player Crafting tab tree (plus the shared Pagination
// component RecipeBrowser reuses).
export const CRAFTING_APP_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Pagination.svelte',
  // Select's own compiled closure (issue 1504), spread rather than copied: `Pagination`'s page-size
  // control is a `<Select>` now, so this PLAYER-app list reaches `Select`, `Field`,
  // `SearchablePopover`, the `ManagerButton` `SearchablePopover` renders its trigger through (issue
  // 1371), and the `Chip`/`EmptyState` pair the popover's list renders — the same route
  // `IconButton` below arrives by.
  ...SELECT_COMPILED_MODULES,
  // The manager's icon-only push-button (issue 1422).
  'src/ui/svelte/components/IconButton.svelte',
  // The shared numeric stepper the essence pool's per-carrier rows are built on (issue 917).
  'src/ui/svelte/components/Stepper.svelte',
  // The two marks this tree reaches (issue 1505): the eyebrow nine `detail/` components render, and
  // the figure box the Shopping list's summary cards are, which composes that eyebrow.
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/StatBox.svelte',
  // The ONE art tile (issue 1506).
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
  'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
  'src/ui/svelte/apps/crafting/CraftButton.svelte',
  'src/ui/svelte/apps/crafting/RecipeDetailHeader.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
  'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte',
  'src/ui/svelte/apps/crafting/detail/IoTable.svelte',
  // IoTable is the requirement surface's composition root (issue 917) and renders all four of
  // these.
  'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte',
  'src/ui/svelte/apps/crafting/detail/RequirementTile.svelte',
  'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
  'src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte',
  // The one "N Radiant" contribution chip both of the two panels above render. They
  // are already listed, so omitting this HANGS every mounted crafting suite.
  'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte',
  'src/ui/svelte/apps/crafting/detail/OutcomeTierTable.svelte',
  'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte',
  'src/ui/svelte/apps/crafting/detail/RecipeBodyShell.svelte',
  'src/ui/svelte/apps/crafting/detail/SimpleRecipeBody.svelte',
  // SimpleRecipeBody renders this for an explicit multi-step recipe (issue 765).
  'src/ui/svelte/apps/crafting/detail/StepRequirementsList.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientRoutedBody.svelte',
  'src/ui/svelte/apps/crafting/detail/RoutedByCheckBody.svelte',
  'src/ui/svelte/apps/crafting/detail/ProgressiveBody.svelte',
  // ProgressiveBody's stage list (issue 651).
  'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
  // The per-stage complication band (issue 1286).
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
  'src/ui/svelte/apps/crafting/ShoppingList.svelte',
  'src/ui/svelte/apps/crafting/RunSummaryPanel.svelte',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
  // The ONE not-yet-ready chrome the five player views draw (issue 1514). `CraftingView` below
  // renders the composition, so this roster is where the crafting suites acquire it.
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/PlayerViewState.svelte',
  // The four the Crafting tab reaches as of issue 1514's crafting phase, each written FLAT for the
  // reason `SELECT_COMPILED_MODULES` records above — the static guard in
  // `mounted-harness-primitive-allowlist.test.js` reads this array's own source text for quoted
  // literals, and a nested `...NAME` is not one.
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/components/Avatar.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/apps/crafting/CraftingView.svelte'
]);

/**
 * Full lifecycle harness for a single mounted Svelte component test file.
 *
 * @param {string} args.tmpPrefix mkdtemp prefix (e.g. 'fabricate-x-')
 * @param {string[]} [args.rawModules] repo-relative `.js` modules copied verbatim
 * @param {string[]} [args.compiledModules] repo-relative `.svelte` modules to compile
 * @param {string} args.componentPath repo-relative `.svelte` of the component under test
 * @param {string} [args.rootClass] application root class the mount target carries, for a component
 * whose production host is not the manager (see `mount()` below)
 */
export function createMountedComponentHarness({ repoRoot, tmpPrefix, rawModules = [], compiledModules = [], runeModules = [], componentPath, rootClass = 'fabricate-manager' }) {
  let tempRoot = null;
  let mounted = null;
  let target = null;
  let Component = null;
  const { writeCompiledSvelte, writeRawModule, writeCompiledModule } = createSvelteCompiler(repoRoot, () => tempRoot);

  return {
    async setup() {
      validateMountedComponentDependencies({ repoRoot, rawModules, runeModules, compiledModules, componentPath });
      setupDOM();
      installComponentTestGlobals();
      tempRoot = mkdtempSync(join(tmpdir(), tmpPrefix));
      symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
      for (const modulePath of rawModules) writeRawModule(modulePath);
      for (const runeModule of runeModules) writeCompiledModule(runeModule);
      for (const componentModule of compiledModules) writeCompiledSvelte(componentModule);
      const imported = await import(pathToFileURL(join(tempRoot, `${componentPath}.js`)).href);
      Component = imported.default;
    },
    // Import a compiled runes `.svelte.js` module from the harness temp tree so a test can build a
    // REAL store that shares the mounted component's signal runtime.
    async loadRuneModule(modulePath) {
      return import(pathToFileURL(join(tempRoot, `${modulePath}.js`)).href);
    },
    teardown() {
      if (mounted) { mounted.$destroy(); mounted = null; }
      if (target) { target.remove(); target = null; }
      teardownDOM();
      if (tempRoot) { rmSync(tempRoot, { recursive: true, force: true }); tempRoot = null; }
    },
    async mount(props = {}) {
      // Cross a macrotask boundary BEFORE building the next tree.
      await new Promise((resolve) => setImmediate(resolve));
      target = document.createElement('div');
      // THE MOUNT TARGET IS AN APPLICATION ROOT (issue 1466).
      target.className = rootClass;
      document.body.appendChild(target);
      mounted = createClassComponent({ component: Component, target, props });
      flushSync();
      await tick();
      flushSync();
      return target;
    },
    async setProps(props) {
      if (!mounted) throw new Error('Cannot update props before mounting a component');
      mounted.$set(props);
      flushSync();
      await tick();
      flushSync();
      return target;
    },
    remount() {
      if (mounted) { mounted.$destroy(); mounted = null; }
      if (target) { target.remove(); target = null; }
    },
    get target() { return target; },
    // The mounted instance, so a suite can call a component's `export function` — the seam an
    // application shell reaches for when it must act while the mount target is still connected
    // (`disposeBeforeRemoval`).
    get component() { return mounted; }
  };
}

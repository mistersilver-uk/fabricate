// Shared harness for mounted Svelte component tests. Compiling each `.svelte`
// into a temp dir and rewriting its client imports is identical across every
// component test, so it lives here rather than being copy-pasted per file.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { createClassComponent } from 'svelte/legacy';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from './svelte-dom.js';

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
 * Rewrite a compiled component's imports so they resolve against the temp dir:
 * point bare `svelte` at the client runtime and append `.js` to `.svelte`
 * specifiers (the temp dir holds the compiled `.svelte.js` siblings).
 */
export function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

/**
 * Guard the whole CLIENT/SERVER split every mounted suite depends on.
 *
 * Svelte's exports are condition-mapped: the `browser` condition selects the real client
 * build and every other condition (including Node's default) selects a server build.
 * `npm test` passes `--conditions=browser`; a bare `node --test <file>` does not. The
 * split is not confined to one subpath — `svelte` itself (`.`) and `svelte/legacy` are
 * mapped the same way, so under the wrong condition set the `createClassComponent` this
 * harness mounts with comes from `legacy-server.js` and the components under test are
 * driven by a server runtime that never updates the DOM. Checking `svelte/reactivity` is
 * therefore a canary for the whole set, not a check about one export: the subpath is the
 * cheapest one to state a target for, and it happens to carry the sharpest vacuous pass
 * (its server `SvelteSet` is literally `globalThis.Set`, so an assertion that a component
 * uses `SvelteSet` rather than `Set` cannot fail — and no suite asserts that today, which
 * is exactly why the guard must not be read as existing only for `SvelteSet`).
 *
 * The check compares what the specifier actually resolves to against the `browser` target
 * the installed Svelte declares for that subpath, so it states the condition rather than
 * hard-coding a filename, and keeps working across Svelte releases that rename the build.
 * `import.meta.resolve` is synchronous and does not evaluate the module, so this adds no
 * second copy of the client runtime to a mounted suite.
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
 * Build the compile/write helpers bound to a repo root and a (lazily read) temp
 * dir. `getTempRoot` is a thunk so callers can declare the temp dir up front and
 * assign it inside `before()`.
 *
 * @param {string} repoRoot
 * @param {() => string} getTempRoot
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

// The raw `.js` modules + compiled `.svelte` modules a `SearchablePopover`-based
// picker needs in a mounted test. Shared so picker test files do not each repeat
// the dependency list verbatim.
export const SEARCHABLE_POPOVER_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js'
]);

// The raw `.js` modules the player Crafting tab tree needs in a mounted test.
// Hoisted (mirroring SEARCHABLE_POPOVER_RAW_MODULES) so every crafting component
// test references one source of truth — a component referencing a `.svelte`/`.js`
// missing from the allowlist does not fail, it HANGS (reported as `# cancelled`).
export const CRAFTING_APP_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/craftingImageDefaults.js',
  'src/ui/svelte/util/essenceIcons.js',
  'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
  'src/ui/svelte/util/craftingRecipeStatus.js',
  'src/ui/svelte/util/ingredientOptionStatus.js',
  // RecipeDetailHeader surfaces the recipe's authored craft duration pre-craft (issue
  // 846) via this formatter. RecipeDetailHeader is already in the compiled graph, so
  // omitting this raw dep HANGS every mounted crafting test (# cancelled). It imports
  // only foundryBridge.js (already listed above), so this single entry suffices.
  'src/ui/svelte/util/recipeDuration.js',
  'src/systems/CraftingListingBuilder.js',
  // CraftingListingBuilder imports these category helpers (issue 514); the builder
  // is already in the mounted graph, so this transitive dep must be copied too or
  // the mounted crafting tests hang (# cancelled). recipeCategories.js has no
  // imports of its own, so this single entry suffices.
  'src/utils/recipeCategories.js',
  // Same rule, issue 651: the builder now derives each progressive stage's cumulative
  // "reached at >=N" threshold through this helper. Both of these are deliberately
  // import-free leaves, so one entry each suffices.
  'src/utils/progressiveStageThresholds.js',
  // The player's stored stage order is reconciled against the authored list here.
  'src/utils/progressiveResultOrder.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js'
]);

// Every transitive `.svelte` module in the player Crafting tab tree (plus the
// shared Pagination component RecipeBrowser reuses). A mounted test compiles the
// whole set and imports only its component under test, so any crafting component
// can be mounted from one shared list.
export const CRAFTING_APP_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
  'src/ui/svelte/apps/crafting/CraftingEssenceThumb.svelte',
  'src/ui/svelte/apps/crafting/QuantityTag.svelte',
  'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
  'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
  'src/ui/svelte/apps/crafting/CraftButton.svelte',
  'src/ui/svelte/apps/crafting/RecipeDetailHeader.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
  'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte',
  'src/ui/svelte/apps/crafting/detail/IoTable.svelte',
  'src/ui/svelte/apps/crafting/detail/OutcomeTierTable.svelte',
  'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte',
  'src/ui/svelte/apps/crafting/detail/RecipeBodyShell.svelte',
  'src/ui/svelte/apps/crafting/detail/SimpleRecipeBody.svelte',
  // SimpleRecipeBody renders this for an explicit multi-step recipe (issue 765).
  // SimpleRecipeBody is already listed, so omitting this HANGS every mounted crafting
  // test (# cancelled), not just the step-list one.
  'src/ui/svelte/apps/crafting/detail/StepRequirementsList.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientRoutedBody.svelte',
  'src/ui/svelte/apps/crafting/detail/RoutedByCheckBody.svelte',
  'src/ui/svelte/apps/crafting/detail/ProgressiveBody.svelte',
  // ProgressiveBody's stage list (issue 651). ProgressiveBody is already listed above and
  // renders this, so omitting it HANGS every mounted crafting test (# cancelled), not
  // just the stage-list one.
  'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
  'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
  'src/ui/svelte/apps/crafting/ShoppingList.svelte',
  'src/ui/svelte/apps/crafting/RunSummaryPanel.svelte',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
  'src/ui/svelte/apps/crafting/CraftingView.svelte'
]);

/**
 * Full lifecycle harness for a single mounted Svelte component test file. Wraps
 * the temp-dir + node_modules symlink + DOM/globals setup, writes the requested
 * raw `.js` modules and compiled `.svelte` modules, imports the component, and
 * exposes `mount`/`setProps`/`remount` + a `target` getter. This removes the per-file
 * `before`/`after`/`mount`/`remount` boilerplate that was duplicated across the
 * component test suite.
 *
 * @param {object} args
 * @param {string} args.repoRoot
 * @param {string} args.tmpPrefix       mkdtemp prefix (e.g. 'fabricate-x-')
 * @param {string[]} [args.rawModules]  repo-relative `.js` modules copied verbatim
 * @param {string[]} [args.compiledModules] repo-relative `.svelte` modules to compile
 * @param {string} args.componentPath   repo-relative `.svelte` of the component under test
 * @returns {{ setup: () => Promise<void>, teardown: () => void, mount: (props?: object) => Promise<HTMLElement>, setProps: (props: object) => Promise<HTMLElement>, remount: () => void, readonly target: HTMLElement|null }}
 */
export function createMountedComponentHarness({ repoRoot, tmpPrefix, rawModules = [], compiledModules = [], runeModules = [], componentPath }) {
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
    // Import a compiled runes `.svelte.js` module from the harness temp tree so a
    // test can build a REAL store that shares the mounted component's signal
    // runtime. Only valid for a module listed in `runeModules`.
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
      target = document.createElement('div');
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
    get target() { return target; }
  };
}

// Shared harness for mounted Svelte component tests. Compiling each `.svelte`
// into a temp dir and rewriting its client imports is identical across every
// component test, so it lives here rather than being copy-pasted per file.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from './svelte-dom.js';

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
 * Install the minimal Foundry/DOM globals that mounted component tests rely on.
 * Call after `setupDOM()` so `document` exists.
 */
export function installComponentTestGlobals() {
  globalThis.Text = document.createTextNode('').constructor;
  globalThis.Comment = document.createComment('').constructor;
  globalThis.game = {
    i18n: {
      localize: (key) => key,
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
  'src/ui/svelte/util/craftingRecipeStatus.js',
  'src/systems/CraftingListingBuilder.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js'
]);

// Every transitive `.svelte` module in the player Crafting tab tree (plus the
// shared Pagination component RecipeBrowser reuses). A mounted test compiles the
// whole set and imports only its component under test, so any crafting component
// can be mounted from one shared list.
export const CRAFTING_APP_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
  'src/ui/svelte/apps/crafting/QuantityTag.svelte',
  'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
  'src/ui/svelte/apps/crafting/RecipeRecents.svelte',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
  'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
  'src/ui/svelte/apps/crafting/CraftButton.svelte',
  'src/ui/svelte/apps/crafting/RecipeDetailHeader.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte',
  'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte',
  'src/ui/svelte/apps/crafting/detail/IoTable.svelte',
  'src/ui/svelte/apps/crafting/detail/OutcomeTierTable.svelte',
  'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte',
  'src/ui/svelte/apps/crafting/detail/RecipeBodyShell.svelte',
  'src/ui/svelte/apps/crafting/detail/SimpleRecipeBody.svelte',
  'src/ui/svelte/apps/crafting/detail/IngredientRoutedBody.svelte',
  'src/ui/svelte/apps/crafting/detail/RoutedByCheckBody.svelte',
  'src/ui/svelte/apps/crafting/detail/ProgressiveBody.svelte',
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
 * exposes `mount`/`remount` + a `target` getter. This removes the per-file
 * `before`/`after`/`mount`/`remount` boilerplate that was duplicated across the
 * component test suite.
 *
 * @param {object} args
 * @param {string} args.repoRoot
 * @param {string} args.tmpPrefix       mkdtemp prefix (e.g. 'fabricate-x-')
 * @param {string[]} [args.rawModules]  repo-relative `.js` modules copied verbatim
 * @param {string[]} [args.compiledModules] repo-relative `.svelte` modules to compile
 * @param {string} args.componentPath   repo-relative `.svelte` of the component under test
 * @returns {{ setup: () => Promise<void>, teardown: () => void, mount: (props?: object) => Promise<HTMLElement>, remount: () => void, readonly target: HTMLElement|null }}
 */
export function createMountedComponentHarness({ repoRoot, tmpPrefix, rawModules = [], compiledModules = [], runeModules = [], componentPath }) {
  let tempRoot = null;
  let mounted = null;
  let target = null;
  let Component = null;
  const { writeCompiledSvelte, writeRawModule, writeCompiledModule } = createSvelteCompiler(repoRoot, () => tempRoot);

  return {
    async setup() {
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
      if (mounted) { unmount(mounted); mounted = null; }
      if (target) { target.remove(); target = null; }
      teardownDOM();
      if (tempRoot) { rmSync(tempRoot, { recursive: true, force: true }); tempRoot = null; }
    },
    async mount(props = {}) {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, { target, props });
      flushSync();
      await tick();
      flushSync();
      return target;
    },
    remount() {
      if (mounted) { unmount(mounted); mounted = null; }
      if (target) { target.remove(); target = null; }
    },
    get target() { return target; }
  };
}

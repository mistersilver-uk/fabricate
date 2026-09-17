/**
 * The ONE compiled manager tree the thirteen `manager-mounted.test.js` route modules mount
 * against, plus the helpers more than one of them needs (issue 1690).
 *
 * `node --test` runs a process per `*.test.js`, so the route modules are plain `.js` imported by
 * that single entry: one process, one compile of the manager root. The compile is memoised here
 * rather than repeated in each module's `before`, and `disposeManagerSuite` runs once, from the
 * entry, after every module's cases have.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { flushSync, tick } from 'svelte';

import { VIEW_LAB_CASES } from '../../scripts/lib/viewLabCases.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import {
  MANAGER_ROOT,
  assertCompiledSvelteClosure,
  compileManagerTree,
  importCompiledComponent,
} from '../helpers/manager/managerCompile.js';
import { identityLocalize } from '../helpers/manager/managerLocalization.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let preparing;

async function prepareManagerSuite() {
  setupDOM();
  globalThis.Text = document.createTextNode('').constructor;
  globalThis.Comment = document.createComment('').constructor;
  globalThis.game = {
    i18n: {
      localize: identityLocalize,
      format: (key) => key,
    },
  };
  tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-manager-'));
  const dependencyRoot = existsSync(resolve(repoRoot, 'node_modules'))
    ? resolve(repoRoot, 'node_modules')
    : resolve(repoRoot, '../../..', 'node_modules');
  symlinkSync(dependencyRoot, join(tempRoot, 'node_modules'), 'junction');
  const compiledSveltePaths = compileManagerTree(tempRoot);
  // BEFORE the first import, so an omission is a thrown error naming the file rather than a
  // hang reported as `# cancelled`.
  assertCompiledSvelteClosure(compiledSveltePaths);
  const load = (sourcePath) => importCompiledComponent(tempRoot, sourcePath);
  return {
    Component: await load(MANAGER_ROOT),
    EnvironmentEditViewComponent: await load(
      'src/ui/svelte/apps/manager/EnvironmentEditView.svelte'
    ),
    ChecksRightMenuComponent: await load('src/ui/svelte/apps/manager/checks/ChecksRightMenu.svelte'),
    CraftingCheckEditorComponent: await load(
      'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte'
    ),
    SimpleCraftingCheckEditorComponent: await load(
      'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte'
    ),
    ProgressiveCraftingCheckEditorComponent: await load(
      'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte'
    ),
    RecipeOverviewTabComponent: await load(
      'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte'
    ),
    SystemEditViewComponent: await load('src/ui/svelte/apps/manager/SystemEditView.svelte'),
    CraftingSettingsViewComponent: await load(
      'src/ui/svelte/apps/manager/CraftingSettingsView.svelte'
    ),
    ToolsBrowserViewComponent: await load('src/ui/svelte/apps/manager/ToolsBrowserView.svelte'),
    ChecksViewComponent: await load('src/ui/svelte/apps/manager/checks/ChecksView.svelte'),
  };
}

/**
 * The compiled components, compiled on the first call and shared by every route module after it.
 *
 * @returns {Promise<object>} The components, under the names the route modules bind.
 */
export function managerComponents() {
  preparing ??= prepareManagerSuite();
  return preparing;
}

/** Drop the compiled tree and the DOM, once, after every route module's cases have run. */
export function disposeManagerSuite() {
  rmSync(tempRoot, { recursive: true, force: true });
  teardownDOM();
  delete globalThis.game;
}

/** Restore the localizer and yield, after each route module has torn its own mount down. */
export async function settleBetweenTests() {
  // Restore the identity localizer unconditionally. A test that swaps in the shipped
  // strings and then FAILS would otherwise leak its localizer into every later test,
  // turning one failure into a cascade that hides its own cause.
  globalThis.game.i18n.localize = identityLocalize;
  // Yield to a NEW event-loop turn before the next test mounts. Happy DOM memoizes
  // `querySelector`/`querySelectorAll` results behind `WeakRef`s, and V8 keeps a WeakRef's
  // target strongly reachable for the remainder of the job that read it
  // (`weak_refs_keep_during_job`). Tests here run back-to-back inside one turn whenever they
  // never await anything real, so every unmounted manager DOM tree — and, through its
  // listeners, its whole Svelte component graph — stays pinned until some macrotask boundary
  // finally arrives. That is retention, not a leak: it is reclaimable, but not before the
  // suite has stacked up hundreds of trees. Without this line the file needs >2 GB of heap;
  // with it the whole suite runs green under `--max-old-space-size=768`.
  await new Promise((settled) => setImmediate(settled));
}

// The selectors are READ FROM THE REGISTRY rather than restated, because a restated copy
// is the drift this pins against: it would keep passing after the case it mirrors changed.
// The mounted root renders `.fabricate-manager`, so each case's selector runs verbatim.
export const labCaseSelector = (id) => {
  const viewCase = VIEW_LAB_CASES.find((entry) => entry.id === id);
  assert.ok(Boolean(viewCase), `no View Lab case "${id}" — was it renamed?`);
  assert.equal(typeof viewCase.expectSelector, 'string', `case "${id}" asserts no selector`);
  return viewCase.expectSelector;
};

export async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await tick();
  flushSync();
}

// Drain the route-exit cascade. It is a chain of promise-returning guards and the Save
// branch adds several more `await`s inside the store call, so a fixed handful of
// `Promise.resolve()`s is not enough for every branch — and a too-short drain would make
// "the GM stayed put" pass for a route exit that simply had not finished yet. The
// navigate-away positive control in `manager-checks-mounted.js` is what proves this drain
// is long enough.
export async function settleRouteExit() {
  for (let i = 0; i < 24; i += 1) await Promise.resolve();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

// Projected recipe-item fixtures (issue 511, PR-B). The router forwards
// `selectedSystem.recipeItemDefinitions` straight to BooksScrollsView, so these
// carry the enriched projection fields the surface reads (resolvedName,
// derivedType, recipes[], caps).
export const booksScrollsFixtures = [
  {
    id: 'ri1',
    name: 'Alchemist Cook Book',
    resolvedName: 'Alchemist Cook Book',
    resolvedImg: 'icons/sundries/books/book-worn-brown.webp',
    derivedType: 'Book',
    originItemUuid: 'Compendium.fabricate.items.cook-book',
    enabled: true,
    description: 'A well-thumbed book of potion recipes.',
    recipes: [{ id: 'r1', name: 'Healing Draught', category: 'potions' }],
    learnedByCount: 2,
    linkMissing: false,
    caps: { learn: { limitLearning: true, learningMode: 'once' } },
  },
  {
    id: 'ri2',
    name: 'Scroll of Elixirs',
    resolvedName: 'Scroll of Elixirs',
    resolvedImg: 'icons/sundries/scrolls/scroll-bound-brown.webp',
    derivedType: 'Scroll',
    originItemUuid: '',
    enabled: true,
    description: '',
    recipes: [],
    learnedByCount: 0,
    linkMissing: false,
    caps: { learn: { limitLearning: false } },
  },
];

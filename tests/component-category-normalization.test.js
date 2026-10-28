/**
 * Issue 676 — `Component.category` + `CraftingSystem.componentCategories` normalization, and the
 * decision-8(a) salvage-enable clamp that enforces Component Requirement 5.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { defineStructureContract } from './helpers/structureContract.js';

// Minimal stubs so the module can load without a Foundry runtime
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined,
  },
};
// `updateItem` calls `_assertGM`, so the stub user must be a GM.
globalThis.game = { user: { isGM: true } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// A manager holding real, normalized systems with `save()` stubbed — the house pattern
// (`buildManager` in compendium-drop.test.js).
function makeLoadedManager(systems = []) {
  const manager = makeManager();
  for (const system of systems) {
    manager.systems.set(system.id, manager._normalizeSystem(system));
  }
  manager.initialized = true;
  manager.save = async () => {};
  return manager;
}

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// Component.category

test('component.category defaults to general with no migration', () => {
  const manager = makeManager();
  // The decision-3 "default for existing components": an existing component that has
  // never heard of `category` normalizes into the reserved bucket on read.
  assert.equal(manager._normalizeComponent({ id: 'c1', name: 'Iron Ore' }).category, 'general');
  assert.equal(manager._normalizeComponent({ id: 'c1', category: '' }).category, 'general');
  assert.equal(manager._normalizeComponent({ id: 'c1', category: '  ' }).category, 'general');
  assert.equal(manager._normalizeComponent({ id: 'c1', category: 'General' }).category, 'general');
});

test('component.category round-trips a custom token verbatim through renormalization', () => {
  const manager = makeManager();
  const once = manager._normalizeComponent({ id: 'c1', category: ' Reagent ' });
  assert.equal(once.category, 'Reagent');
  assert.equal(manager._normalizeComponent(once).category, 'Reagent');
});

// CraftingSystem.componentCategories — the sibling vocabulary

test('componentCategories normalizes to unique trimmed strings and never persists general', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    componentCategories: ['Reagent', ' Metal ', 'Reagent', 'general', 'General', ''],
  });
  assert.deepEqual(system.componentCategories, ['Reagent', 'Metal']);
});

test('componentCategories defaults to an empty array', () => {
  const manager = makeManager();
  assert.deepEqual(manager._normalizeSystem({ id: 'sys-1' }).componentCategories, []);
});

test('componentCategories and categories stay independent vocabularies (AC7)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    categories: ['Potions'],
    componentCategories: ['Reagent'],
  });
  // Neither vocabulary may be cross-populated by the other — this is the property
  // decision 5 bought, and the one a "just reuse system.categories" refactor breaks.
  assert.deepEqual(system.categories, ['Potions']);
  assert.deepEqual(system.componentCategories, ['Reagent']);
  assert.ok(!system.categories.includes('Reagent'));
  assert.ok(!system.componentCategories.includes('Potions'));
});

test('componentCategories survives a re-normalization round trip', () => {
  const manager = makeManager();
  const once = manager._normalizeSystem({ id: 'sys-1', componentCategories: ['Reagent'] });
  assert.deepEqual(manager._normalizeSystem(once).componentCategories, ['Reagent']);
});

// Decision 8(a) — the normalizer clamp. AC10(c).

const GROUP = { id: 'g1', name: 'Scraps', results: [{ id: 'r1', componentId: 'c2', quantity: 1 }] };

test('AC10(c): _normalizeSalvage clamps enabled to false when resultGroups is empty', () => {
  const manager = makeManager();
  // This is the assertion that covers import, copy-mode and migration — none of which touch the UI.
  const clamped = manager._normalizeSalvage({ enabled: true, resultGroups: [] });
  assert.equal(clamped.enabled, false);
  assert.deepEqual(clamped.resultGroups, []);

  // Same through the component normalizer, which is the path every writer takes.
  const component = manager._normalizeComponent({
    id: 'c1',
    salvage: { enabled: true, resultGroups: [] },
  });
  assert.equal(component.salvage.enabled, false);
});

test('AC10(c): the clamp also fires when every authored group is dropped as invalid', () => {
  const manager = makeManager();
  // `_normalizeSalvageResultGroup` filters unusable groups, so `resultGroups` can normalize to
  // empty even when the INPUT array was not.
  const clamped = manager._normalizeSalvage({ enabled: true, resultGroups: [null, undefined] });
  assert.deepEqual(clamped.resultGroups, []);
  assert.equal(clamped.enabled, false);
});

test('the clamp only ever turns enabled OFF — it never seeds it on (decision 6)', () => {
  const manager = makeManager();
  // A component with authored results but no explicit `enabled` must read DISABLED.
  const absent = manager._normalizeSalvage({ resultGroups: [GROUP] });
  assert.equal(absent.enabled, false);

  const explicitFalse = manager._normalizeSalvage({ enabled: false, resultGroups: [GROUP] });
  assert.equal(explicitFalse.enabled, false);
});

test('enabled survives normalization when at least one result group exists', () => {
  const manager = makeManager();
  const salvage = manager._normalizeSalvage({ enabled: true, resultGroups: [GROUP] });
  assert.equal(salvage.enabled, true);
  assert.equal(salvage.resultGroups.length, 1);
});

// updateItem's shallow spread — the Scope-out assertion the delta requires

test('a save payload that omits category preserves it (the REAL updateItem)', async () => {
  // A component-editor draft (`saveComponentEditorDraft`) does not author `category`; it stays
  // safe only because `updateItem` spreads `{...existing, ...updates}`, so an omitted key survives.
  const manager = makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      items: [{ id: 'c1', name: 'Iron Ore', category: 'Metal', tags: ['metal'] }],
    },
  ]);

  const updated = await manager.updateItem('sys1', 'c1', { tags: ['ore'] });

  assert.equal(updated.category, 'Metal', 'an omitted category survives the save');
  assert.deepEqual(updated.tags, ['ore'], 'and the authored field is applied');
  assert.equal(manager.getSystem('sys1').components[0].category, 'Metal', 'persisted, not just returned');
});

test('updateItem applies an explicitly authored category', async () => {
  const manager = makeLoadedManager([
    { id: 'sys1', name: 'System One', items: [{ id: 'c1', name: 'Iron Ore', category: 'Metal' }] },
  ]);
  const updated = await manager.updateItem('sys1', 'c1', { category: 'Reagent' });
  assert.equal(updated.category, 'Reagent');
});

// Per-category icons (issue 689)

test('categoryIcons / componentCategoryIcons round-trip only for existing categories', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys1',
    name: 'System One',
    categories: ['Potions'],
    categoryIcons: { Potions: 'fas fa-flask', gone: 'fas fa-ghost' },
    componentCategories: ['Reagent'],
    componentCategoryIcons: { reagent: 'fas fa-leaf', general: 'fas fa-folder' },
  });
  // Keyed by lowercased name; an icon for a category that no longer exists is dropped.
  assert.deepEqual(system.categoryIcons, { potions: 'fas fa-flask' });
  assert.deepEqual(system.componentCategoryIcons, {
    reagent: 'fas fa-leaf',
    general: 'fas fa-folder',
  });
});

test('updateSystem REPLACES the whole icon map (removal persists without -=)', async () => {
  const manager = makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      categories: ['Potions', 'Elixirs'],
      categoryIcons: { potions: 'fas fa-flask', elixirs: 'fas fa-vial' },
    },
  ]);
  await manager.updateSystem('sys1', {
    categories: ['Elixirs'],
    categoryIcons: { elixirs: 'fas fa-vial' },
  });
  const persisted = manager.getSystem('sys1');
  assert.deepEqual(persisted.categories, ['Elixirs']);
  assert.deepEqual(persisted.categoryIcons, { elixirs: 'fas fa-vial' });
});

// The MANAGER root's hop is one forwarded argument no mounted case can see — `ComponentEditView`
// states the baseline and the store consumes it, and both halves are driven behaviourally, but the
// verb BETWEEN them is structure (issue 1371). Foundry integrator round 8, finding 1(b).
const MANAGER_ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';

defineStructureContract(
  '1371 r22: the manager root hands the editor save to the baseline-accepting seam',
  MANAGER_ROOT,
  { gives: [{ at: 'ComponentEditView', attribute: 'onSave', is: 'saveComponentEdit' }] }
);

defineStructureContract(
  '1371 r22: which forwards the editor’s stated baseline to the override-aware store verb',
  { file: MANAGER_ROOT, fn: 'saveComponentEdit' },
  {
    takes: ['itemId, updates, { baseline } = {}'],
    contains: ['const result = await store.updateComponent?.(itemId, merged, { baseline });'],
  }
);

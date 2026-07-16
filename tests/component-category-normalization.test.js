/**
 * Issue 676 — `Component.category` + `CraftingSystem.componentCategories` normalization,
 * and the decision-8(a) salvage-enable clamp that enforces Component Requirement 5.
 *
 * Covers AC6 (partly), AC7, AC9 and AC10(c).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

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
// (`buildManager` in compendium-drop.test.js). Needed to exercise the REAL `updateItem`
// rather than a hand-rebuilt imitation of it.
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

// ---------------------------------------------------------------------------
// Component.category
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CraftingSystem.componentCategories — the sibling vocabulary
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Decision 8(a) — the normalizer clamp. AC10(c).
// ---------------------------------------------------------------------------

const GROUP = { id: 'g1', name: 'Scraps', results: [{ id: 'r1', componentId: 'c2', quantity: 1 }] };

test('AC10(c): _normalizeSalvage clamps enabled to false when resultGroups is empty', () => {
  const manager = makeManager();
  // This is the assertion that covers import, copy-mode and migration — none of which
  // touch the UI. `CraftingSystemExporter` has no salvage handling at all, so without
  // the clamp an imported `{enabled: true, resultGroups: []}` lands verbatim and
  // violates Component Requirement 5 with no GM surface involved.
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
  // `_normalizeSalvageResultGroup` filters unusable groups, so `resultGroups` can
  // normalize to empty even when the INPUT array was not. Clamping against the raw
  // input rather than the normalized local would miss this.
  const clamped = manager._normalizeSalvage({ enabled: true, resultGroups: [null, undefined] });
  assert.deepEqual(clamped.resultGroups, []);
  assert.equal(clamped.enabled, false);
});

test('the clamp only ever turns enabled OFF — it never seeds it on (decision 6)', () => {
  const manager = makeManager();
  // A component with authored results but no explicit `enabled` must read DISABLED.
  // This is the deliberate, user-confirmed decision-6 consequence; a clamp that
  // "helpfully" enabled it would flip every component in every world.
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

// ---------------------------------------------------------------------------
// updateItem's shallow spread — the Scope-out assertion the delta requires
// ---------------------------------------------------------------------------

test('a save payload that omits category preserves it (the REAL updateItem)', async () => {
  // The standalone `SvelteComponentEditorApp` (ComponentEditorRoot.svelte) does not
  // author `category` and is deliberately out of scope for issue 676. It stays safe
  // ONLY because `updateItem` spreads `{...existing, ...updates}`, so an omitted key is
  // preserved rather than dropped. The delta said "asserted, not assumed".
  //
  // This calls the REAL `updateItem`. An earlier version hand-rebuilt the spread inline
  // and so asserted JS spread semantics rather than Fabricate's: mutating updateItem to
  // `{ ...updates, id: itemId }` — dropping the existing-spread, which is exactly the
  // regression the Scope-out fears — left it green.
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

/**
 * Issue 676 — `Component.category` + `CraftingSystem.componentCategories` normalization,
 * and the decision-8(a) salvage-enable clamp that enforces Component Requirement 5.
 *
 * Covers AC6 (partly), AC7, AC9 and AC10(c).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  // That app no longer reaches `updateItem` directly for its ESSENCE axis — see the
  // r19-store2 block at the foot of this file — but it still reaches it for everything
  // else, so this contract is unchanged and still load-bearing for it.
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

// ---------------------------------------------------------------------------
// Per-category icons (issue 689)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The standalone component editor's SAVE, and the essence override rule
// (issue 1371 r19-store2)
// ---------------------------------------------------------------------------
//
// `SvelteComponentEditorApp` used to call `manager.updateItem(...)` directly, so a GM editing a
// component's essences from an item sheet wrote a map the read union SHADOWS for every pair whose
// `inherit.essences` switch is on — which, after the `1.32.0` election, is every component in a
// one-system world. The manager's own store had been put on the flag-before-values order; this
// second entry point had not, and two entry points that disagree about what a write means is the
// defect this closes.
//
// The app's save now delegates to `svelte/util/componentEditorSave.js`, which is what these tests
// drive. The app module itself is not importable in a plain unit test — it builds a Foundry
// `ApplicationV2` subclass at import time and statically imports a `.svelte` component, the same
// reason `tests/import-folder-drop-wiring.test.js` gives for its sibling app — so the delegation
// itself is pinned as SOURCE below, and the behaviour is driven for real through the seam.

const { overrideAwareComponentWrite, saveComponentEditorDraft } = await import(
  '../src/ui/svelte/util/componentEditorSave.js'
);
const { createComponentScopeStore } = await import('../src/systems/worldScopeStores.js');
const { membershipKey } = await import('../src/systems/scopedDefinitions.js');

/**
 * A REAL component scope store over an in-memory setting, holding one world component whose
 * `essences` section `sys1` INHERITS — the state the `1.32.0` pass leaves behind.
 *
 * @param {object} [inherit] the membership record's inherit map.
 * @returns {{store: object, persisted: () => object}}
 */
function makeInheritingScopeStore(inherit = {}) {
  let persisted = {
    entities: { ingot: { id: 'ingot', name: 'Iron Ingot' } },
    defaults: { ingot: { id: 'ingot', essences: { fire: 3 } } },
    membership: {
      [membershipKey('ingot', 'sys1')]: { entityId: 'ingot', systemId: 'sys1', inherit },
    },
  };
  const store = createComponentScopeStore({
    getSetting: (key) => (key === 'componentScope' ? persisted : undefined),
    setSetting: async (_key, next) => {
      persisted = next;
    },
  });
  store.load();
  return { store, persisted: () => persisted };
}

/**
 * The manager the app writes through, with the read union wired the way the shipped one is.
 *
 * @param {object} scopeStore
 * @param {object} [essences] the in-system row's own map.
 * @returns {{manager: object, calls: object[]}}
 */
function makeEditorManager(scopeStore, essences = { iron: 2 }) {
  const manager = makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      features: { essences: true },
      essenceDefinitions: [
        { id: 'fire', name: 'Fire' },
        { id: 'iron', name: 'Iron' },
      ],
      items: [{ id: 'ingot', name: 'Iron Ingot', essences }],
    },
  ]);
  manager._componentScopeStore = scopeStore;
  const calls = [];
  const updateItem = manager.updateItem.bind(manager);
  manager.updateItem = async (systemId, itemId, updates) => {
    calls.push({
      systemId,
      itemId,
      updates,
      // The pair's switch AS IT WAS when the values arrived — which is what "flag before values"
      // is an assertion about.
      switchOnArrival: scopeStore
        .corpus()
        .membership.find((record) => record.entityId === itemId)?.inherit?.essences,
    });
    return updateItem(systemId, itemId, updates);
  };
  return { manager, calls };
}

/**
 * The draft the editor hands its save: one essence stepper, in `buildComponentEditorUpdates`'
 * contract.
 *
 * @param {number} quantity
 * @returns {object}
 */
function essenceDraft(quantity) {
  return {
    showEssences: true,
    essenceOptions: [
      { id: 'fire', quantity: 3 },
      { id: 'iron', quantity },
    ],
  };
}

test('1371 r19: the editor save flips the essence switch BEFORE the values land on an inheriting pair', async () => {
  const { store, persisted } = makeInheritingScopeStore();
  const { manager, calls } = makeEditorManager(store);
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const saved = await saveComponentEditorDraft(essenceDraft(4), {
    systemId: 'sys1',
    componentId: 'ingot',
    writeComponent,
  });

  assert.equal(saved, true);
  assert.equal(calls.length, 1, 'the values were written exactly once');
  assert.equal(
    calls[0].switchOnArrival,
    false,
    'the switch was ALREADY off when the values arrived — flag before values'
  );
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    false,
    'and the override is persisted, so the union answers what the GM staged'
  );
  assert.deepEqual(manager.getSystem('sys1').components[0].essences, { fire: 3, iron: 4 });
});

test('1371 r19: a save that only RESTATES the resolved map writes no essences at all', async () => {
  // The editor sends its essence axis on every save. Restating what the system already resolves
  // has authored nothing, so it must not flip a switch the GM never touched, nor overwrite the
  // system's dormant own map — the map an inheriting system falls back to if the world section is
  // later cleared.
  const { store, persisted } = makeInheritingScopeStore();
  const { manager, calls } = makeEditorManager(store);
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const saved = await saveComponentEditorDraft(
    { showEssences: true, essenceOptions: [{ id: 'fire', quantity: 3 }] },
    { systemId: 'sys1', componentId: 'ingot', writeComponent }
  );

  assert.equal(saved, true);
  assert.deepEqual(calls, [], 'no write at all: the only staged axis had nothing to say');
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    undefined,
    'the switch is left exactly where it was'
  );
  assert.deepEqual(
    manager.getSystem('sys1').components[0].essences,
    { iron: 2 },
    'and the dormant in-system map survives'
  );
});

test('1371 r19: an OVERRIDING pair is written with no flag write, and a non-member unchanged', async () => {
  const { store, persisted } = makeInheritingScopeStore({ essences: false });
  const { manager, calls } = makeEditorManager(store);
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  await saveComponentEditorDraft(essenceDraft(4), {
    systemId: 'sys1',
    componentId: 'ingot',
    writeComponent,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].switchOnArrival, false, 'already overriding, so nothing had to move');
  assert.equal(persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences, false);
});

test('1371 r19: a REFUSED flag write refuses the whole editor save, and writes no values', async () => {
  // A refused world-setting write REJECTS rather than answering false, so the stop must catch.
  const { store } = makeInheritingScopeStore();
  const { manager, calls } = makeEditorManager(store);
  store.save = async () => {
    throw new Error('The requested Setting update was refused');
  };
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const saved = await saveComponentEditorDraft(essenceDraft(4), {
    systemId: 'sys1',
    componentId: 'ingot',
    writeComponent,
  });

  assert.equal(saved, false, 'the app reports the failure rather than closing over it');
  assert.deepEqual(calls, [], 'and no values were written');
});

test('1371 r19: an empty draft writes nothing and is not a failure', async () => {
  const { store } = makeInheritingScopeStore();
  const { manager, calls } = makeEditorManager(store);
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const saved = await saveComponentEditorDraft({}, {
    systemId: 'sys1',
    componentId: 'ingot',
    writeComponent,
  });

  assert.equal(saved, true);
  assert.deepEqual(calls, []);
});

// The app's own branch, pinned as source. The module cannot be imported (ApplicationV2 at import
// time, plus a static `.svelte` import), so a mirror here would keep passing however the real
// method is written — which is exactly how the direct `manager.updateItem` call survived.
const EDITOR_APP_SOURCE = readFileSync(
  new URL('../src/ui/SvelteComponentEditorApp.svelte.js', import.meta.url),
  'utf8'
);

test('1371 r19: the editor app delegates its save and never writes a component itself', () => {
  assert.ok(
    EDITOR_APP_SOURCE.includes('saveComponentEditorDraft('),
    'the save must delegate to the shared seam'
  );
  assert.ok(
    !EDITOR_APP_SOURCE.includes('manager.updateItem('),
    'and must not reach the manager write directly — that is the shadowed write this closed'
  );
  assert.ok(
    EDITOR_APP_SOURCE.includes('overrideAwareComponentWrite('),
    'the no-store path applies the override rule'
  );
  assert.ok(
    EDITOR_APP_SOURCE.includes('store.updateComponent(componentId, updates)'),
    'and the parent-store path routes through the override-aware store verb'
  );
});

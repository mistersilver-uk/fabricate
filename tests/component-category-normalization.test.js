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
  // The component-editor screen (`ComponentEditorRoot.svelte`) does not author `category` and is
  // deliberately out of scope for issue 676. It stays safe ONLY because `updateItem` spreads
  // `{...existing, ...updates}`, so an omitted key is preserved rather than dropped.
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

// The standalone component editor's SAVE, and the essence override rule (issue 1371 r19-store2).
// The standalone editor window used to call `manager.updateItem(...)` directly, so a GM editing a
// component's essences through it wrote a map the read union SHADOWS for every pair whose
// `inherit.essences` switch is on — which, after the `1.32.0` election, is every component in a
// one-system world.

const { overrideAwareComponentWrite, saveComponentEditorDraft } = await import(
  '../src/ui/svelte/util/componentEditorSave.js'
);
const { buildComponentEditorState } = await import('../src/ui/svelte/util/componentEditor.js');
const { resolvedComponentEssencesFor } = await import(
  '../src/systems/resolvedComponentEssences.js'
);
const { createComponentScopeStore } = await import('../src/systems/worldScopeStores.js');
const { membershipKey } = await import('../src/systems/scopedDefinitions.js');

/**
 * A REAL component scope store over an in-memory setting, holding one world component whose
 * `essences` section `sys1` INHERITS — the state the `1.32.0` pass leaves behind.
 *
 * @param {object} [inherit] the membership record's inherit map.
 */
function makeInheritingScopeStore(inherit = {}, worldEssences = { fire: 3 }) {
  let persisted = {
    entities: { ingot: { id: 'ingot', name: 'Iron Ingot' } },
    defaults: { ingot: { id: 'ingot', essences: worldEssences } },
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
 * @param {object} [essences] the in-system row's own map.
 * @param {object[]} [essenceDefinitions] this system's roster.
 */
function makeEditorManager(
  scopeStore,
  essences = { iron: 2 },
  essenceDefinitions = [
    { id: 'fire', name: 'Fire' },
    { id: 'iron', name: 'Iron' },
  ]
) {
  const manager = makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      features: { essences: true },
      essenceDefinitions,
      items: [{ id: 'ingot', name: 'Iron Ingot', essences, tags: [] }],
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
  // The editor sends its essence axis on every save.
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

// The SEED the editor was opened on, and the write it may make from it (issue 1371 r20-store3,
// reviewer round 6 findings 1 and 2). The cases above hand-build the draft, which is how the defect
// survived: they stage maps seeded from the resolved world map, and the app could not produce one
// for an inheriting pair.

/**
 * The component-editor screen's own seed, transcribed: the persisted record with its essence map
 * overlaid from the read union, through `buildComponentEditorState`.
 *
 * @returns {object} the editor state.
 */
function appEditorState(manager) {
  const system = manager.getSystem('sys1');
  const item = system.components.find((component) => component.id === 'ingot');
  const resolved = resolvedComponentEssencesFor(manager, 'sys1', 'ingot');
  return buildComponentEditorState(system, resolved === undefined ? item : { ...item, essences: resolved });
}

/**
 * A save from that state with the rows exactly as they were drawn and ONE tag ticked — the "changed
 * something else" save every finding here is about.
 */
function saveWithOnlyATagTouched(state, writeComponent) {
  return saveComponentEditorDraft(
    {
      showTags: state.showTags,
      showEssences: state.showEssences,
      tagOptions: state.tagOptions.map((option, index) =>
        index === 0 ? { ...option, checked: true } : option
      ),
      essenceOptions: state.essenceOptions,
    },
    {
      systemId: 'sys1',
      componentId: 'ingot',
      carriedEssences: state.carriedEssences,
      baseline: state.baselineEssences,
      writeComponent,
    }
  );
}

test('1371 r20: the app-seeded editor saves a tag change with NO essence write and NO flag write', async () => {
  const { store, persisted } = makeInheritingScopeStore();
  const { manager, calls } = makeEditorManager(store);
  manager.updateSystem('sys1', { itemTags: ['bar'] });
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const state = appEditorState(manager);
  assert.deepEqual(
    state.baselineEssences,
    { fire: 3 },
    'the steppers are seeded from what the system RESOLVES, not from its dormant own row'
  );

  const saved = await saveWithOnlyATagTouched(state, writeComponent);

  assert.equal(saved, true);
  assert.equal(calls.length, 1, 'the tag change still lands');
  assert.deepEqual(calls[0].updates, { tags: ['bar'] }, 'and it carries NO essence key');
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    undefined,
    'the switch is exactly where the GM left it'
  );
  assert.deepEqual(
    manager.getSystem('sys1').components[0].essences,
    { iron: 2 },
    'and the dormant in-system map is untouched'
  );
});

test('1371 r20: an essence the world map carries and this system does not define SURVIVES a save', async () => {
  // `data-models`, `### Component scope`: a world map is NOT narrowed to the ids a given system
  // holds.
  const { store, persisted } = makeInheritingScopeStore({}, { fire: 3, moss: 1 });
  const { manager, calls } = makeEditorManager(store);
  manager.updateSystem('sys1', { itemTags: ['bar'] });
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const state = appEditorState(manager);
  assert.deepEqual(state.carriedEssences, { moss: 1 }, 'the foreign id is carried, not rendered');
  assert.deepEqual(
    state.essenceOptions.map((option) => option.id),
    ['fire', 'iron'],
    'and it is NOT offered, because this system has no name, icon or control for it'
  );

  await saveWithOnlyATagTouched(state, writeComponent);
  assert.deepEqual(calls[0].updates, { tags: ['bar'] }, 'an untouched save writes no essences');
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    undefined,
    'and moves no switch'
  );

  // Now the GM really does author an essence quantity.
  await saveComponentEditorDraft(
    {
      showTags: true,
      showEssences: true,
      tagOptions: state.tagOptions,
      essenceOptions: state.essenceOptions.map((option) =>
        option.id === 'fire' ? { ...option, quantity: 5 } : option
      ),
    },
    {
      systemId: 'sys1',
      componentId: 'ingot',
      carriedEssences: state.carriedEssences,
      baseline: state.baselineEssences,
      writeComponent,
    }
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls[1].updates.essences,
    { moss: 1, fire: 5 },
    'the authored change lands AND the foreign id survives it'
  );
  assert.equal(calls[1].switchOnArrival, false, 'flag before values, as ever');
});

test('1371 r20: a value write that THROWS puts the switch it flipped back', async () => {
  const { store, persisted } = makeInheritingScopeStore();
  const { manager } = makeEditorManager(store);
  manager.updateItem = async () => {
    throw new Error('the setting write was refused');
  };
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  await assert.rejects(
    () =>
      saveComponentEditorDraft(essenceDraft(4), {
        systemId: 'sys1',
        componentId: 'ingot',
        writeComponent,
      }),
    /refused/
  );
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    true,
    'the flip is rolled back, so the pair still follows the world map it never left'
  );
});

// The editor APP's own branch was pinned here as source until issue 1520. The application it read —
// `src/ui/SvelteComponentEditorApp.svelte.js` — was orphaned (its only constructor call was a
// manager service nothing consumed) and has been deleted, so the pin and its `readFileSync` went
// with it: a top-level read of a deleted file throws at MODULE LOAD and fails this whole suite, not
// one test.

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

// Foundry integrator round 7, finding 2. Both are facts about the RENDER, and the window registers
// no hooks — so anything re-derived at save time is a different world's answer.
defineStructureContract(
  '1371 r21: the editor root emits the seed’s two facts WITH the rows it drew',
  { file: 'src/ui/svelte/apps/ComponentEditorRoot.svelte', fn: 'handleSave' },
  {
    contains: [
      `onSave?.({
        showTags: editorState.showTags,
        showEssences: editorState.showEssences,
        tagOptions: tagDraft,
        essenceOptions: essenceDraft,
        carriedEssences: editorState.carriedEssences,
        baselineEssences: editorState.baselineEssences,
      })`,
    ],
  }
);

// The BASELINE is a fact about the RENDER (issue 1371 r21-store4). Round 6 gave the rule a stated
// baseline; round 7 found that both hops carrying it were unproven (quality N1 — every fixture's
// baseline EQUALLED the resolved map, so unwiring either hop changed nothing) and that the app
// re-derived it at SAVE time (Foundry integrator finding 2), which is a different world's answer
// the moment a replicated `componentScope` write lands while the window is open.

/**
 * The draft `ComponentEditorRoot.handleSave` emits from a rendered state, with one tag ticked.
 *
 * @param {object} state the rendered editor state.
 */
function rootEmittedDraft(state) {
  return {
    showTags: state.showTags,
    showEssences: state.showEssences,
    tagOptions: state.tagOptions.map((option, index) =>
      index === 0 ? { ...option, checked: true } : option
    ),
    essenceOptions: state.essenceOptions,
    carriedEssences: state.carriedEssences,
    baselineEssences: state.baselineEssences,
  };
}

test('1371 r21: a FRACTIONAL world quantity does not turn an untouched save into an override', async () => {
  // Quality N1, and the case that makes both `{baseline}` hops falsifiable.
  const { store, persisted } = makeInheritingScopeStore({}, { fire: 2.5 });
  const { manager, calls } = makeEditorManager(store);
  manager.updateSystem('sys1', { itemTags: ['bar'] });
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const state = appEditorState(manager);
  assert.deepEqual(state.baselineEssences, { fire: 2 }, 'the rendered rows are clamped');
  assert.deepEqual(
    resolvedComponentEssencesFor(manager, 'sys1', 'ingot'),
    { fire: 2.5 },
    'while the resolved map the rule would otherwise fall back to is not'
  );

  const saved = await saveWithOnlyATagTouched(state, writeComponent);

  assert.equal(saved, true);
  assert.deepEqual(calls[0].updates, { tags: ['bar'] }, 'the essence key is dropped');
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    undefined,
    'and no durable world-setting write was spent on a save that authored nothing'
  );
});

test('1371 r21: a world edit landing WHILE the editor is open does not flip an untouched save', async () => {
  // Foundry integrator finding 2. The window registers no hooks, so the GM is still looking at
  // `{fire: 3}` when the world map becomes `{fire: 3, water: 4}`.
  const { store, persisted } = makeInheritingScopeStore();
  const { manager, calls } = makeEditorManager(store);
  manager.updateSystem('sys1', { itemTags: ['bar'] });
  const writeComponent = overrideAwareComponentWrite({
    getCraftingSystemManager: () => manager,
    getComponentScopeStore: () => store,
  });

  const rendered = appEditorState(manager);
  assert.deepEqual(rendered.baselineEssences, { fire: 3 }, 'what the GM is looking at');

  await store.save({
    ...store.get(),
    defaults: { ingot: { id: 'ingot', essences: { fire: 3, water: 4 } } },
  });
  const atSaveTime = appEditorState(manager);
  assert.notDeepEqual(atSaveTime.baselineEssences, rendered.baselineEssences, 'the world moved');

  // The app hands over what it can re-derive NOW; the draft carries what was DRAWN, and the draft
  // wins. This is exactly the pair of arguments `_saveEditorState` supplies.
  const saved = await saveComponentEditorDraft(rootEmittedDraft(rendered), {
    systemId: 'sys1',
    componentId: 'ingot',
    carriedEssences: atSaveTime.carriedEssences,
    baseline: atSaveTime.baselineEssences,
    writeComponent,
  });

  assert.equal(saved, true);
  assert.equal(calls.length, 1, 'the tag change still lands');
  assert.deepEqual(calls[0].updates, { tags: ['bar'] }, 'and carries NO essence key');
  assert.equal(
    persisted().membership[membershipKey('ingot', 'sys1')].inherit.essences,
    undefined,
    'so the pair is not silently opted out of the world map it is still following'
  );
});

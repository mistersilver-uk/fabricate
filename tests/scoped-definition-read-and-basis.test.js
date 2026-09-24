/**
 * THE TWO UNIONS, and the Valid Id Basis that stops anything pruning against a corpus it cannot see
 * (issue 1359, part of epic 1357).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { resolve } from 'node:path';

import { Fabricate } from '../src/bootstrap/Fabricate.js';
import { defineStructureContract } from './helpers/structureContract.js';

globalThis.foundry = {
  utils: { randomID: () => `rnd-${Math.random().toString(36).slice(2)}` },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { advanceDefinitionRevision } = await import('../src/utils/definitionIndex.js');
const { SETTING_KEYS } = await import('../src/config/settings.js');
const { createComponentScopeStore, createEssenceScopeStore, createToolScopeStore } =
  await import('../src/systems/worldScopeStores.js');
const { scopedDefinitionCorpus, corpusWithEmptied, SCOPED_CORPUS_FLOORS } =
  await import('./helpers/scopedDefinitionCorpus.js');

const GOLDEN = JSON.parse(
  readFileSync(new URL('./fixtures/scopedDefinitionNormalize.golden.json', import.meta.url), 'utf8')
);


/** A manager with NO world stores at all — the unmigrated client every player boots as. */
function unwiredManager() {
  return new CraftingSystemManager(
    { getRecipes: () => [] },
    { componentScopeStore: null, essenceScopeStore: null, toolScopeStore: null }
  );
}

/** A `Map`-backed settings seam. */
function settingsSeam(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
      return value;
    },
  };
}

/**
 * `JSON.parse(JSON.stringify(...))`, because the golden is JSON and `JSON.stringify` DROPS an
 * `undefined` value.
 */
const asStored = (value) => JSON.parse(JSON.stringify(value));

// Criterion 1 — equivalence with the pre-#1359 tree, and the enumerated divergences

describe('with every world setting unwritten', () => {
  it('the fixture is not vacuous', () => {
    const corpus = scopedDefinitionCorpus();
    assert.ok(corpus.components.length >= SCOPED_CORPUS_FLOORS.components);
    assert.ok(corpus.essenceDefinitions.length >= SCOPED_CORPUS_FLOORS.essences);
    assert.ok(corpus.tools.length >= SCOPED_CORPUS_FLOORS.tools);
    assert.ok(corpus.componentCategories.length >= SCOPED_CORPUS_FLOORS.componentCategories);
    assert.ok(corpus.categories.length >= SCOPED_CORPUS_FLOORS.recipeCategories);
    assert.ok(
      Object.keys(corpus.componentCategoryIcons).length >=
        SCOPED_CORPUS_FLOORS.componentCategoryIcons
    );
    assert.ok(Object.keys(corpus.categoryIcons).length >= SCOPED_CORPUS_FLOORS.categoryIcons);
    // And the golden really did come from a run over THIS corpus.
    assert.equal(GOLDEN.baseline.components.length, corpus.components.length);
    assert.equal(GOLDEN.baseline.tools.length, corpus.tools.length);
  });

  it('_normalizeSystem is byte-for-byte what the pre-#1359 tree emitted', () => {
    assert.deepEqual(asStored(unwiredManager()._normalizeSystem(scopedDefinitionCorpus())), {
      ...GOLDEN.baseline,
    });
  });

  it('every mutation-time bypass site agrees with it too', () => {
    // "Every consumer" means `_normalizeSystem` plus the six `_scopeBasis` sites.
    const manager = unwiredManager();
    const system = manager._normalizeSystem(scopedDefinitionCorpus());
    const { essenceIds } = manager._scopeBasis(system);
    const viaBypass = scopedDefinitionCorpus().components.map((raw) =>
      manager._normalizeComponent(raw, {
        validEssenceIds: essenceIds,
        ...manager._salvageNormalizationContext(system),
      })
    );
    assert.deepEqual(asStored(viaBypass), GOLDEN.baseline.components);
  });
});

describe('the enumerated UNKNOWN-basis divergences', () => {
  /**
   * Each case is an in-system array that is EMPTY while a record elsewhere still references an id
   * of that type — the state the epic's migration produces on a client whose world setting has not
   * replicated. `origin/main` prunes; this change retains.
   */
  const divergence = (key) => ({
    golden: GOLDEN[key],
    now: asStored(
      unwiredManager()._normalizeSystem(
        corpusWithEmptied(
          {
            emptyEssenceDefinitions: 'essenceDefinitions',
            emptyComponents: 'components',
            emptyComponentCategories: 'componentCategories',
            emptyCategories: 'categories',
          }[key]
        )
      )
    ),
  });

  it('retains component essence quantities against an EMPTY essenceDefinitions', () => {
    const { golden, now } = divergence('emptyEssenceDefinitions');
    assert.deepEqual(golden.components[0].essences, {}, 'origin/main pruned every quantity');
    assert.deepEqual(
      now.components[0].essences,
      { 'ess-fire': 2, 'ess-earth': 1 },
      'an unknown basis prunes NOTHING'
    );
  });

  it("retains an essence's authored source uuid against an EMPTY components array", () => {
    const { golden, now } = divergence('emptyComponents');
    const goldenEssence = golden.essenceDefinitions.find((def) => def.id === 'ess-water');
    const nowEssence = now.essenceDefinitions.find((def) => def.id === 'ess-water');
    assert.equal(goldenEssence.sourceItemUuid, null, 'origin/main resolved it away');
    assert.equal(nowEssence.sourceItemUuid, 'Compendium.world.materials.Item.ashsalt00000001');
    assert.equal(nowEssence.sourceComponentId, 'cmp-ash-salt', 'and the id itself never moved');
  });

  // Criterion 10: the two icon maps are asserted SEPARATELY, because they are gated by DIFFERENT
  // vocabularies.
  it('retains componentCategoryIcons against an EMPTY componentCategories', () => {
    const { golden, now } = divergence('emptyComponentCategories');
    assert.deepEqual(golden.componentCategoryIcons, {}, 'origin/main deleted every authored icon');
    assert.deepEqual(now.componentCategoryIcons, {
      ore: 'fas fa-gem',
      ingot: 'fas fa-bars',
      reagent: 'fas fa-flask',
    });
    assert.deepEqual(
      now.categoryIcons,
      golden.categoryIcons,
      'and the OTHER map, whose own vocabulary is intact, is pruned exactly as before'
    );
  });

  it('retains categoryIcons against an EMPTY categories', () => {
    const { golden, now } = divergence('emptyCategories');
    assert.deepEqual(golden.categoryIcons, {}, 'origin/main deleted every authored icon');
    assert.deepEqual(now.categoryIcons, { smithing: 'fas fa-hammer', alchemy: 'fas fa-flask' });
    assert.deepEqual(
      now.componentCategoryIcons,
      golden.componentCategoryIcons,
      'and the OTHER map is pruned exactly as before'
    );
  });

  it('still prunes an icon whose vocabulary is KNOWN and does not carry it', () => {
    // The gate is UNKNOWN-vs-KNOWN, never "never prune".
    const normalized = unwiredManager()._normalizeSystem(
      scopedDefinitionCorpus({
        componentCategoryIcons: { ore: 'fas fa-gem', ghost: 'fas fa-ghost' },
      })
    );
    assert.deepEqual(normalized.componentCategoryIcons, { ore: 'fas fa-gem' });
  });
});

// Criterion 2 (second half) — when the basis is null

describe('the Valid Id Basis', () => {
  const seededStore = (create, key, value) => create(settingsSeam({ [key]: value }));

  it('is null only when the store is UNSEEDED and the in-system array is EMPTY', () => {
    const unseeded = seededStore(createEssenceScopeStore, SETTING_KEYS.ESSENCE_SCOPE, {});
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      { essenceScopeStore: unseeded }
    );
    assert.equal(manager._scopeBasis({ essenceDefinitions: [] }).essenceIds, null);
    assert.ok(
      manager._scopeBasis({ essenceDefinitions: [{ id: 'legacy' }] }).essenceIds instanceof Set,
      'a NON-EMPTY legacy array is a basis on its own'
    );
  });

  it('counts the world half on isSeeded("entities") ALONE, never the aggregate', () => {
    // The aggregate ORs across sub-keys, so a payload carrying only `membership` would report
    // seeded and hand the basis a real, empty, PRUNABLE id set drawn from a sub-key that is simply
    // absent.
    const siblingOnly = seededStore(createEssenceScopeStore, SETTING_KEYS.ESSENCE_SCOPE, {
      membership: {},
    });
    assert.equal(siblingOnly.isSeeded(), true, 'the aggregate says yes');
    assert.equal(siblingOnly.isSeeded('entities'), false, 'the roster says no');
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      { essenceScopeStore: siblingOnly }
    );
    assert.equal(
      manager._scopeBasis({ essenceDefinitions: [] }).essenceIds,
      null,
      'so the basis stays UNKNOWN'
    );
  });

  it('UNIONS a seeded world roster with a surviving legacy array', () => {
    const store = seededStore(createEssenceScopeStore, SETTING_KEYS.ESSENCE_SCOPE, {
      entities: [{ id: 'world-ess' }],
    });
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      { essenceScopeStore: store }
    );
    const { essenceIds } = manager._scopeBasis({ essenceDefinitions: [{ id: 'legacy-ess' }] });
    assert.deepEqual([...essenceIds].sort(), ['legacy-ess', 'world-ess']);
  });

  it('is UNKNOWN when the store getter itself throws', () => {
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      {
        essenceScopeStore: () => {
          throw new Error('game.fabricate is not ready');
        },
      }
    );
    assert.equal(manager._scopeBasis({ essenceDefinitions: [] }).essenceIds, null);
  });

  it('honours a GM who deliberately emptied the world roster', () => {
    // "Written empty" is a real, empty, PRUNABLE basis. Without this the mechanism would refuse to
    // ever prune again, which is the opposite failure and just as wrong.
    const store = seededStore(createEssenceScopeStore, SETTING_KEYS.ESSENCE_SCOPE, {
      entities: [],
    });
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      { essenceScopeStore: store }
    );
    const { essenceIds } = manager._scopeBasis({ essenceDefinitions: [] });
    assert.ok(essenceIds instanceof Set);
    assert.equal(essenceIds.size, 0);
  });

  it('answers all THREE entity legs, each from its OWN store and its OWN legacy array', () => {
    // Every case above drives the ESSENCE leg, because that is the only one epic 1357's consumer
    // sweep has reached; `componentIds` is pinned once more by the READ-vs-BASIS pair below.
    const seam = settingsSeam({
      [SETTING_KEYS.COMPONENT_SCOPE]: { entities: [{ id: 'w-comp' }] },
      [SETTING_KEYS.ESSENCE_SCOPE]: { entities: [{ id: 'w-ess' }] },
      [SETTING_KEYS.TOOL_SCOPE]: { entities: [{ id: 'w-tool' }] },
    });
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      {
        componentScopeStore: createComponentScopeStore(seam),
        essenceScopeStore: createEssenceScopeStore(seam),
        toolScopeStore: createToolScopeStore(seam),
      }
    );
    const basis = manager._scopeBasis({
      id: 'sys-a',
      components: [{ id: 'legacy-comp' }],
      essenceDefinitions: [{ id: 'legacy-ess' }],
      tools: [{ id: 'legacy-tool' }],
    });

    assert.deepEqual([...basis.componentIds].sort(), ['legacy-comp', 'w-comp']);
    assert.deepEqual([...basis.essenceIds].sort(), ['legacy-ess', 'w-ess']);
    assert.deepEqual([...basis.toolIds].sort(), ['legacy-tool', 'w-tool']);
  });

  it('gives the TOOL leg the same UNKNOWN gate the essence leg gets', () => {
    // `null` means prune nothing, and it is the whole safety property.
    const unseeded = new CraftingSystemManager(
      { getRecipes: () => [] },
      { toolScopeStore: seededStore(createToolScopeStore, SETTING_KEYS.TOOL_SCOPE, {}) }
    );
    assert.equal(unseeded._scopeBasis({ tools: [] }).toolIds, null);

    const emptied = new CraftingSystemManager(
      { getRecipes: () => [] },
      {
        toolScopeStore: seededStore(createToolScopeStore, SETTING_KEYS.TOOL_SCOPE, {
          entities: [],
        }),
      }
    );
    const { toolIds } = emptied._scopeBasis({ tools: [] });
    assert.ok(toolIds instanceof Set);
    assert.equal(toolIds.size, 0);
  });
});

// Criterion 6 — the two unions, asserted as a PAIR on one fixture

describe('the READ union and the BASIS union', () => {
  const SYSTEM_ID = 'sys-a';

  function pairFixture() {
    const seam = settingsSeam({
      [SETTING_KEYS.COMPONENT_SCOPE]: {
        entities: [
          { id: 'w-member', name: 'World Member' },
          { id: 'w-stranger', name: 'World Stranger' },
          { id: 'shared', name: 'World Shared' },
        ],
        defaults: {
          'w-member': { id: 'w-member', category: 'ore' },
          shared: { id: 'shared', category: 'ingot' },
        },
        membership: {
          'w-member|sys-a': { entityId: 'w-member', systemId: SYSTEM_ID, inherit: {} },
          'shared|sys-a': { entityId: 'shared', systemId: SYSTEM_ID, inherit: {} },
          // A member of a DIFFERENT system. Membership is per `(entity, system)`, so this must not
          // leak `w-stranger` into `sys-a`'s read union.
          'w-stranger|sys-b': { entityId: 'w-stranger', systemId: 'sys-b', inherit: {} },
        },
      },
    });
    const store = createComponentScopeStore(seam);
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      { componentScopeStore: store }
    );
    const system = {
      id: SYSTEM_ID,
      components: [
        { id: 'legacy-only', name: 'Legacy Only', category: 'reagent' },
        { id: 'shared', name: 'Legacy Shared', category: 'general' },
        // A member whose in-system record carries identity but authors no `category`, so the world
        // default is still observable through it (issue 1370).
        { id: 'w-member', name: 'Legacy Member' },
      ],
    };
    return { manager, store, system };
  }

  it('answers only MEMBERS, resolved — while the basis answers EVERY world id', () => {
    const { manager, system } = pairFixture();

    const read = manager.resolveScopedComponents(system);
    assert.deepEqual(
      read.map((entry) => entry.id).sort(),
      ['legacy-only', 'shared', 'w-member'],
      'membership-FILTERED: `w-stranger` is a member of sys-b, so sys-a never sees it'
    );
    assert.deepEqual(
      read.map((entry) => entry.id),
      system.components.map((entry) => entry.id),
      'and the ROW SET and ORDER are the in-system array’s, not the world roster’s'
    );

    const { componentIds } = manager._scopeBasis(system);
    assert.deepEqual(
      [...componentIds].sort(),
      ['legacy-only', 'shared', 'w-member', 'w-stranger'],
      'NOT membership-filtered: an absent record is a REFUSAL, never a PRUNE, so a reference to ' +
        '`w-stranger` must survive normalization and be refused at use'
    );

    // The pair, stated as one fact: a world entity with no record for S is ABSENT from the read
    // union and PRESENT in the basis. One function serving both cannot satisfy this.
    assert.equal(
      read.some((entry) => entry.id === 'w-stranger'),
      false
    );
    assert.equal(componentIds.has('w-stranger'), true);
  });

  it('returns RESOLVED values, never raw world entities', () => {
    const { manager, system } = pairFixture();
    const member = manager.resolveScopedComponents(system).find((e) => e.id === 'w-member');
    assert.equal(member.category, 'ore', 'the world DEFAULT, resolved through the inherit map');
    assert.equal(member.name, 'Legacy Member', 'while identity still comes from the in-system row');
    assert.equal(member.member, true);
    // BOTH component sections, since `essences` joined at issue 1371 r18-store (M31).
    assert.deepEqual(member.inherited, { category: true, essences: true });
    assert.equal('enabled' in member, false, 'a component carries no enabled flag at all');
  });

  it('lets the IN-SYSTEM record win an id collision on IDENTITY', () => {
    // INVERTED at issue 1370, and issue 1372 kept the identity half verbatim.
    const { manager, system } = pairFixture();
    const shared = manager.resolveScopedComponents(system).filter((e) => e.id === 'shared');
    assert.equal(shared.length, 1, 'one entry, not two');
    assert.equal(shared[0].name, 'Legacy Shared');
    assert.equal(shared[0].member, true, 'and the membership facts the record cannot carry remain');
  });

  it('and lets the WORLD DEFAULT win a SECTION the membership record inherits', () => {
    // THE OTHER HALF, and the one issue 1372 moved.
    const { manager, system } = pairFixture();
    const shared = manager.resolveScopedComponents(system).find((e) => e.id === 'shared');
    assert.equal(shared.category, 'ingot');
    assert.deepEqual(
      shared.inherited,
      { category: true, essences: true },
      'and the row says so about itself'
    );
  });

  it('while an OVERRIDING section keeps the in-system value', () => {
    // The compatibility half, on the same fixture: `buildMembershipRecord` writes exactly this
    // switch for every pair the `1.30.0` migration creates, so this is the state every migrated
    // world is in and the reason no existing world moves.
    const { manager, store, system } = pairFixture();
    const payload = store.get();
    payload.membership['shared|sys-a'].inherit = { category: false };
    store.save(payload);
    const shared = manager.resolveScopedComponents(system).find((e) => e.id === 'shared');
    assert.equal(shared.category, 'general');
  });

  it('does not RESURRECT a world entity the in-system array no longer carries', () => {
    // `_deleteComponentSet` removes the in-system record and leaves the world entity and its
    // membership behind, so a row-set rule taken from the world roster would hand the component
    // back beside the recipes that same delete disabled.
    const { manager, system } = pairFixture();
    system.components = system.components.filter((entry) => entry.id !== 'w-member');
    advanceDefinitionRevision(system.components);
    const read = manager.resolveScopedComponents(system);
    assert.equal(
      read.some((entry) => entry.id === 'w-member'),
      false
    );
    assert.deepEqual(
      read.map((entry) => entry.id),
      ['legacy-only', 'shared']
    );
  });

  it('answers the surviving legacy array alone when no world corpus exists', () => {
    const manager = unwiredManager();
    const system = { id: SYSTEM_ID, components: [{ id: 'legacy-only' }] };
    assert.deepEqual(
      manager.resolveScopedComponents(system).map((entry) => entry.id),
      ['legacy-only'],
      'the union is BOUNDED by the migration: before it, the in-system array IS the corpus'
    );
  });

  it('is wired for essences and tools too', () => {
    const seam = settingsSeam({
      [SETTING_KEYS.ESSENCE_SCOPE]: {
        entities: [{ id: 'w-ess', name: 'World Essence' }],
        defaults: { 'w-ess': { id: 'w-ess', macro: 'Macro.world' } },
        membership: { 'w-ess|sys-a': { entityId: 'w-ess', systemId: SYSTEM_ID, inherit: {} } },
      },
      [SETTING_KEYS.TOOL_SCOPE]: {
        entities: [{ id: 'w-tool', name: 'World Tool' }],
        defaults: { 'w-tool': { id: 'w-tool', breakage: { mode: 'none' } } },
        membership: {
          'w-tool|sys-a': { entityId: 'w-tool', systemId: SYSTEM_ID, inherit: {}, enabled: false },
        },
      },
    });
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      {
        essenceScopeStore: createEssenceScopeStore(seam),
        toolScopeStore: createToolScopeStore(seam),
      }
    );
    const system = {
      id: SYSTEM_ID,
      essenceDefinitions: [{ id: 'w-ess', name: 'Legacy Essence' }],
      tools: [{ id: 'w-tool', name: 'Legacy Tool' }],
    };
    const [essence] = manager.resolveScopedEssences(system);
    assert.equal(essence.macro, 'Macro.world');
    assert.equal(essence.enabled, true, 'a record that authored none defaults to on');
    const [tool] = manager.resolveScopedTools(system);
    assert.deepEqual(tool.breakage, { mode: 'none' });
    assert.equal(tool.enabled, false, 'a disabled tool is a MEMBER that is off');
  });
});

// Criterion 12 — the memo is invalidated by BOTH edits, asserted on resolved CONTENT

describe('the resolved-union memo', () => {
  function memoFixture() {
    const seam = settingsSeam({
      [SETTING_KEYS.COMPONENT_SCOPE]: {
        entities: [{ id: 'w1', name: 'Before' }],
        defaults: { w1: { id: 'w1', category: 'ore' } },
        membership: { 'w1|sys-a': { entityId: 'w1', systemId: 'sys-a', inherit: {} } },
      },
    });
    const store = createComponentScopeStore(seam);
    const manager = new CraftingSystemManager(
      { getRecipes: () => [] },
      { componentScopeStore: store }
    );
    const system = {
      id: 'sys-a',
      components: [
        { id: 'l1', name: 'Legacy Before' },
        { id: 'w1', name: 'System W1' },
      ],
    };
    return { manager, store, system };
  }

  it('serves the same array while nothing has changed', () => {
    const { manager, system } = memoFixture();
    assert.equal(manager.resolveScopedComponents(system), manager.resolveScopedComponents(system));
  });

  // Asserted on CONTENT rather than on index-build counts, because a caching bug that skips a
  // rebuild looks like an IMPROVEMENT to a count-based assertion while serving wrong data.
  it('is invalidated by a WORLD-scope edit', async () => {
    // Asserted on `category` rather than on `name`: `name` is a LIFTED IDENTITY field, so the
    // in-system record decides it outright while requirement 36 holds, and a world edit to it is
    // (correctly) invisible. `category` is resolved behaviour and is the world half's to move.
    const { manager, store, system } = memoFixture();
    assert.equal(manager.resolveScopedComponents(system).find((e) => e.id === 'w1').category, 'ore');

    await store.save({
      entities: [{ id: 'w1', name: 'After' }],
      defaults: { w1: { id: 'w1', category: 'ingot' } },
      membership: { 'w1|sys-a': { entityId: 'w1', systemId: 'sys-a', inherit: {} } },
    });

    const resolved = manager.resolveScopedComponents(system).find((e) => e.id === 'w1');
    assert.equal(resolved.name, 'System W1', 'the in-system identity is unmoved by a world edit');
    assert.equal(resolved.category, 'ingot');
  });

  it('is invalidated by an IN-PLACE edit to the system own array', () => {
    const { manager, system } = memoFixture();
    assert.equal(
      manager.resolveScopedComponents(system).find((e) => e.id === 'l1').name,
      'Legacy Before'
    );

    // Replace an element rather than push one: the length clause would catch a push on its own, so
    // a same-length in-place rewrite is the only edit that actually exercises the revision clause.
    system.components[0] = { id: 'l1', name: 'Legacy After' };
    advanceDefinitionRevision(system.components);

    assert.equal(
      manager.resolveScopedComponents(system).find((e) => e.id === 'l1').name,
      'Legacy After'
    );
  });

  it('does not alias two systems that share a component id', () => {
    // Copy-imported systems deliberately share ids, which is why `definitionIndex` refuses to key
    // anything on a system id.
    const { manager, system } = memoFixture();
    const twin = { id: 'sys-b', components: [{ id: 'l1', name: 'Twin' }] };
    assert.equal(
      manager.resolveScopedComponents(system).find((e) => e.id === 'l1').name,
      'Legacy Before'
    );
    assert.equal(manager.resolveScopedComponents(twin).find((e) => e.id === 'l1').name, 'Twin');
  });
});

// Criterion 8 — the census

const MANAGER = 'src/systems/CraftingSystemManager.js';
const ITEM_SOURCES = 'src/systems/manager/itemSources.js';
const BULK_EDITS = 'src/systems/manager/bulkEdits.js';
// Every `manager/` cluster module (issue 1923), so a site moved into one the census has not named
// yet still fails it.
const MANAGER_MODULES = readdirSync(new URL('../src/systems/manager/', import.meta.url))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `src/systems/manager/${name}`);

/** The five prune sites that BYPASS `_normalizeSystem`, each deriving its own basis, by home. */
const BYPASS_SITES = {
  [MANAGER]: ['createItem', 'updateItem'],
  [ITEM_SOURCES]: ['addItemFromUuid', 'replaceItemSource'],
  [BULK_EDITS]: ['applyBulkEditToComponents'],
};

describe('the _scopeBasis call sites', () => {
  // A seventh site added later fails here until it is named — which is the point: five of these
  // six BYPASS `_normalizeSystem` entirely, so "the normalizer handles it" has already been an
  // untrue assumption once, at issue 1308. And the whole mechanism is one `new Set()` away from a
  // no-op that reads as a guard.
  defineStructureContract('are exactly the six named prune sites, none defaulting the basis', MANAGER, {
    callers: [['_scopeBasis', ['_normalizeSystem', ...BYPASS_SITES[MANAGER]]]],
    fallsBackNo: [['_scopeBasis', 'Set']],
  });
  // A cluster module reaches the same `_scopeBasis` through its `io.scopeBasis` thunk.
  for (const file of MANAGER_MODULES) {
    defineStructureContract(`${file} derives the basis only at its named sites, undefaulted`, file, {
      fnCallers: [['scopeBasis', BYPASS_SITES[file] ?? []]],
      fallsBackNo: [['scopeBasis', 'Set']],
    });
  }
  for (const [file, sites] of Object.entries(BYPASS_SITES)) {
    const [scope, basis] = file === MANAGER ? ['member', '_scopeBasis'] : ['fn', 'scopeBasis'];
    for (const site of sites) {
      defineStructureContract(`${site} takes its basis from ${basis} alone`, { file, [scope]: site }, {
        calls: [basis],
        readsNo: ['system.essenceDefinitions'],
      });
    }
  }
  // Named as a prune site by the delta, and it IS one — it loops `addItemFromUuid` per item.
  defineStructureContract(
    'addItemsFromPack reaches the basis through addItemFromUuid',
    { file: MANAGER, member: 'addItemsFromPack' },
    { calls: ['addItemFromUuid'], callsNo: ['_scopeBasis'] }
  );
});

// Criterion 7 — construction order in the composition root, observed from a real boot by
// `tests/bootstrap/fabricate-boot-contract.test.js`: `compositionLog` orders `registerSettings()`
// and `_runMigrations()` before the four stores, and `worldStoreOrder` orders each store's load
// before the drift audit's corpus reads, both before either manager, with no setting written
// between. `tests/setting-change-bridge.test.js` hands all four stores to the bridge, and
// `tests/world-scope-consumer-sweep.test.js` gates the audit on the ACTIVE GM, off the migration.

describe('the scope store accessors', () => {
  // The manager resolves these lazily during `initialize()` and its call site guards with optional
  // chaining, which absorbs an absent accessor but NOT a throw.
  it('answer before the module is ready, unlike the gated accessors', () => {
    const facade = new Fabricate();
    const stores = {
      componentScopeStore: 'getComponentScopeStore',
      essenceScopeStore: 'getEssenceScopeStore',
      toolScopeStore: 'getToolScopeStore',
      // Issue 1392. Its NAME is fixed by `adminStore`'s read and write legs.
      worldVocabularyStore: 'getVocabularyScopeStore',
    };
    for (const [field, accessor] of Object.entries(stores)) {
      facade[field] = { field };
      assert.equal(facade.ready, false, 'the premise: startup has not finished');
      assert.deepEqual(facade[accessor](), { field }, `${accessor} must not throw on a not-ready module`);
    }
    assert.throws(() => facade.getGatheringRealmStore(), 'a gated accessor throws before ready');
  });
});

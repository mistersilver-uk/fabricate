/**
 * THE TWO UNIONS, and the Valid Id Basis that stops anything pruning against a corpus it cannot
 * see (issue 1359, part of epic 1357).
 *
 * ## Why this suite exists
 *
 * `CraftingSystemManager` PRUNES references — a component's essence quantities, an essence's source
 * component, and each category icon map against its vocabulary. While those corpora lived on the
 * crafting system the basis was always at hand. Epic 1357 lifts them to world scope, and a pass
 * that derives its basis from an absent or unwritten world setting sees an EMPTY set and deletes
 * every reference in the world. `DOMAIN.md`'s Valid Id Basis rule names this exact shape: a pass
 * handed an empty set for an entity class prunes every key scoped to that class on every run,
 * reached by an omitted ARGUMENT rather than by an incomplete corpus.
 *
 * ## THERE ARE TWO UNIONS AND THEY ARE NOT THE SAME UNION
 *
 * The READ union (`resolveComponentScope` and its siblings) is membership-FILTERED and returns
 * RESOLVED values. The BASIS union (`_scopeBasis`) is deliberately NOT membership-filtered, because
 * an absent membership record is a REFUSAL and never a PRUNE. A single function used for both
 * guarantees one of the two behaviours is wrong, so the decisive case asserts them as a PAIR on one
 * fixture.
 *
 * ## The equivalence bar, and why it needs a recorded golden
 *
 * The acceptance bar for the additive half of this change is the ABSENCE of change. Diffing
 * `_normalizeSystem` against another call path inside the same new code proves nothing —
 * `resolveComponentScope` does not exist on `origin/main` — so `tests/fixtures/
 * scopedDefinitionNormalize.golden.json` was RECORDED FROM THE PRE-#1359 TREE (via `git archive`
 * of the assigned base) and is compared against verbatim, with stated corpus floors so a fixture
 * that silently shrank could not pass by coincidence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

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

const MANAGER_SOURCE = readFileSync(
  new URL('../src/systems/CraftingSystemManager.js', import.meta.url),
  'utf8'
);
const MAIN_SOURCE = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

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
 * `undefined` value. `_normalizeSystem` legitimately emits `difficulty: undefined` for a component
 * that authored none, so a raw `deepEqual` against the golden would report four phantom
 * differences that no persisted byte can carry.
 */
const asStored = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------------------------
// Criterion 1 — equivalence with the pre-#1359 tree, and the enumerated divergences
// ---------------------------------------------------------------------------------------------

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
    // "Every consumer" means `_normalizeSystem` plus the six `_scopeBasis` sites. Those five run
    // `_normalizeComponent` against the SAME basis, so the component this normalizer emits and the
    // component `createItem` emits for the same input must not differ.
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
  // vocabularies. A fixture that empties only one proves only one gate, and an implementer who
  // gated only the component map would pass a combined criterion vacuously.
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
    // The gate is UNKNOWN-vs-KNOWN, never "never prune". A non-empty vocabulary is a real basis,
    // so an icon outside it still drops — which is what makes the four cases above a narrowing
    // rather than a disabling.
    const normalized = unwiredManager()._normalizeSystem(
      scopedDefinitionCorpus({
        componentCategoryIcons: { ore: 'fas fa-gem', ghost: 'fas fa-ghost' },
      })
    );
    assert.deepEqual(normalized.componentCategoryIcons, { ore: 'fas fa-gem' });
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 2 (second half) — when the basis is null
// ---------------------------------------------------------------------------------------------

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
    // `toolIds` was pinned by NOTHING: it is computed on every call and is what a later PR will
    // prune tool references against, so replacing it with a bare `null` left all four related
    // suites green — a half of the basis that could not be wrong is a half nothing holds.
    //
    // Three DISJOINT rosters and three DISJOINT legacy arrays, so a leg wired to the wrong store
    // or reading the wrong in-system array cannot answer correctly by coincidence.
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
    // `null` means prune nothing, and it is the whole safety property. An unseeded tool store
    // with an empty in-system array must be UNKNOWN rather than a real, empty, prunable set;
    // a written-empty roster must be the prunable one.
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

// ---------------------------------------------------------------------------------------------
// Criterion 6 — the two unions, asserted as a PAIR on one fixture
// ---------------------------------------------------------------------------------------------

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
        // A member whose in-system record carries identity but authors no `category`, so the
        // world default is still observable through it (issue 1370). It has to exist in the
        // in-system array at all: the read union's ROW SET is that array's row set while
        // `## CraftingSystem` requirement 36 holds.
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
    assert.equal(member.member, true);
    assert.deepEqual(member.inherited, { category: true });
    assert.equal('enabled' in member, false, 'a component carries no enabled flag at all');
  });

  it('lets the IN-SYSTEM record win an id collision while requirement 36 holds', () => {
    // INVERTED at issue 1370. `1363` had the world entity win `name` and the resolved section win
    // `category`, which reverts the GM's own edit: every shipped identity writer writes the
    // in-system copy and nothing writes the world entity.
    const { manager, system } = pairFixture();
    const shared = manager.resolveScopedComponents(system).filter((e) => e.id === 'shared');
    assert.equal(shared.length, 1, 'one entry, not two');
    assert.equal(shared[0].name, 'Legacy Shared');
    assert.equal(shared[0].category, 'general');
    assert.equal(shared[0].member, true, 'and the membership facts the record cannot carry remain');
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

// ---------------------------------------------------------------------------------------------
// Criterion 12 — the memo is invalidated by BOTH edits, asserted on resolved CONTENT
// ---------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------
// Criterion 8 — the census
// ---------------------------------------------------------------------------------------------

describe('the _scopeBasis call sites', () => {
  /**
   * Every method of `CraftingSystemManager` that calls `this._scopeBasis(`.
   *
   * Parsed by walking the file and tracking the most recent class-body method declaration, which is
   * enough because the class is written one method per two-space indent level and the guard's job
   * is to fail when a SEVENTH site appears, not to be a JavaScript parser.
   */
  function scopeBasisCallSites(source) {
    const sites = new Set();
    let current = null;
    for (const line of source.split('\n')) {
      const declaration = /^ {2}(?:async )?([A-Za-z_][\w$]*)\(/.exec(line);
      if (declaration) current = declaration[1];
      if (line.includes('this._scopeBasis(')) sites.add(current);
    }
    return [...sites].sort();
  }

  it('are exactly the six named prune sites and no others', () => {
    // A seventh site added later fails here until it is named — which is the point: five of these
    // six BYPASS `_normalizeSystem` entirely, so "the normalizer handles it" has already been an
    // untrue assumption once, at issue 1308.
    assert.deepEqual(scopeBasisCallSites(MANAGER_SOURCE), [
      '_normalizeSystem',
      'addItemFromUuid',
      'applyBulkEditToComponents',
      'createItem',
      'replaceItemSource',
      'updateItem',
    ]);
  });

  it('the census can see a site (it is not vacuously empty)', () => {
    assert.equal(
      scopeBasisCallSites('  createItem(a) {\n    const x = this._scopeBasis(a);\n  }\n').length,
      1
    );
  });

  it('addItemsFromPack reaches the basis through addItemFromUuid', () => {
    // Named as a prune site by the delta, and it IS one — it just does not derive its own basis,
    // because it loops `addItemFromUuid` per item. A basis of its own would be a second derivation
    // of the same fact.
    assert.match(MANAGER_SOURCE, /async addItemsFromPack\(/);
    const body = MANAGER_SOURCE.slice(MANAGER_SOURCE.indexOf('async addItemsFromPack('));
    assert.match(body.slice(0, 4000), /await this\.addItemFromUuid\(/);
  });

  it('no site defaults the basis to an empty Set', () => {
    // The whole mechanism is one `new Set()` away from being a no-op that reads as a guard.
    assert.equal(
      /_scopeBasis\([^)]*\)[^;]*\?\?\s*new Set\(\)/.test(MANAGER_SOURCE),
      false,
      'a `?? new Set()` anywhere on this path re-arms the exact failure it exists to prevent'
    );
    assert.equal(
      MANAGER_SOURCE.includes('new Set((system.essenceDefinitions || []).map'),
      false,
      'and no site rebuilds the in-system-only basis by hand'
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 7 — construction order in src/main.js
//
// THIS DESCRIBE NOW CARRIES CRITERION 7 FOR TWO PRs. Issue 1363's criterion 7 is the three
// world-scope stores' position; issue 1370's criterion 7(a) is the world identity drift audit's
// position and its active-GM gate, and its 8(b) is the absence of a repair write between the
// audit and its notice. They share this describe because they share one fact — the exact point in
// `initialize()` at which the three stores are loaded and nothing has yet read the union — and
// splitting them across two files would let the two halves of that fact drift apart.
// ---------------------------------------------------------------------------------------------

describe('src/main.js construction order', () => {
  /**
   * Source-order assertions, the idiom `tests/migration-runner-corpus-writeback.test.js` and
   * `tests/setting-change-bridge.test.js` already use, because `src/main.js` is not otherwise
   * reachable by a unit test — and because a mis-ordering here is SILENT: reading an unregistered
   * key throws inside `ClientSettings##assertSetting`, but `load()` is guarded, so the store simply
   * stays unseeded forever with nothing in the console.
   */
  const at = (needle) => {
    const index = MAIN_SOURCE.indexOf(needle);
    assert.notEqual(index, -1, `src/main.js no longer contains \`${needle}\``);
    return index;
  };

  for (const store of ['componentScopeStore', 'essenceScopeStore', 'toolScopeStore']) {
    it(`constructs and loads ${store} after settings and migrations, before both managers`, () => {
      const construction = at(`this.${store} = create`);
      const load = at(`this.${store}.load();`);
      assert.ok(at('this.registerSettings();') < construction, 'settings must be registered first');
      assert.ok(at('await this._runMigrations();') < construction, 'migrations run before stores');
      assert.ok(construction < load, 'constructed, then loaded');
      assert.ok(load < at('this.recipeManager = new RecipeManager('), 'before the recipe manager');
      assert.ok(
        load < at('this.craftingSystemManager = new CraftingSystemManager('),
        'and before the crafting system manager, which derives its basis from these stores'
      );
    });
  }

  it('publishes an UNGATED accessor for each store', () => {
    // Copy `getCharacterLibrariesStore`, NOT `getGatheringRealmStore`: the manager resolves these
    // lazily during `initialize()` and its call site guards with optional chaining, which absorbs
    // an absent accessor but NOT a throw.
    for (const accessor of [
      'getComponentScopeStore',
      'getEssenceScopeStore',
      'getToolScopeStore',
    ]) {
      const body = MAIN_SOURCE.slice(at(`  ${accessor}() {`), at(`  ${accessor}() {`) + 200);
      assert.equal(
        body.includes('_requireReady()'),
        false,
        `${accessor} must not throw on a not-yet-ready module`
      );
    }
  });

  it('hands all three stores to the setting-change bridge', () => {
    // Without this the legs receive `undefined` and NO-OP silently.
    for (const store of ['componentScopeStore', 'essenceScopeStore', 'toolScopeStore']) {
      assert.match(MAIN_SOURCE, new RegExp(`${store}: fabricate\\.${store},`));
    }
  });

  // -------------------------------------------------------------------------------------------
  // Issue 1370 criterion 7(a) — the world identity drift audit's position and its gate
  // -------------------------------------------------------------------------------------------

  it('runs the world identity drift audit after the three loads and before either manager', () => {
    const audit = at('reportWorldIdentityDrift(readPersistedCraftingSystems(');
    assert.ok(at('this.toolScopeStore.load();') < audit, 'after the LAST of the three loads');
    assert.ok(
      audit < at('this.recipeManager = new RecipeManager('),
      'and before the recipe manager, which is the first thing that can read the union'
    );
    assert.ok(audit < at('this.craftingSystemManager = new CraftingSystemManager('));
  });

  it('gates the audit on the ACTIVE GM, not on isGM', () => {
    // `User#isGM` is `hasRole(ASSISTANT)` and `SETTINGS_MODIFY.defaultRole` is ASSISTANT, so an
    // `isGM` gate posts this notice once for the full GM AND once per assistant.
    const audit = at('reportWorldIdentityDrift(readPersistedCraftingSystems(');
    const gate = MAIN_SOURCE.lastIndexOf(
      'game.users?.activeGM?.id === game.user?.id',
      audit
    );
    assert.notEqual(gate, -1, 'the audit must sit under an active-GM gate');
    assert.ok(
      MAIN_SOURCE.slice(gate, audit).includes('{'),
      'and the gate must OPEN a block the audit is inside, not merely precede it'
    );
    assert.equal(
      MAIN_SOURCE.slice(gate, audit).includes('game.user?.isGM'),
      false,
      'an isGM gate would run the audit on every assistant GM as well'
    );
  });

  // -------------------------------------------------------------------------------------------
  // Issue 1370 criterion 8(b) — the audit REPORTS, and repairs nothing
  // -------------------------------------------------------------------------------------------

  it('sites the audit OUTSIDE _runMigrations and off the migration report guard', () => {
    const audit = at('reportWorldIdentityDrift(readPersistedCraftingSystems(');
    assert.ok(
      audit < at('  async _runMigrations() {'),
      'the audit is inside initialize(), which is declared before _runMigrations()'
    );
    const line = MAIN_SOURCE.slice(MAIN_SOURCE.lastIndexOf('\n', audit) + 1, audit);
    assert.equal(
      line.includes('worldScopeEntityReport'),
      false,
      'drift is not a migration event: guarding on the migration report would silence the audit ' +
        'on every session after the one the migration ran in'
    );
  });

  it('writes NOTHING between the audit and its notice dispatch', () => {
    // 8(a) calls the detector twice to prove it is pure, and that only reds if a repair went
    // INSIDE the detector — the least likely placement. A repair would land HERE, at the call
    // site, which no unit test can execute. So the absence is asserted by source text.
    const audit = at('reportWorldIdentityDrift(readPersistedCraftingSystems(');
    const dispatch = at('ui.notifications?.info?.(driftNotice)');
    assert.ok(audit < dispatch, 'the notice is dispatched after the audit');
    const between = MAIN_SOURCE.slice(audit, dispatch);
    assert.equal(between.includes('setSetting'), false, 'the audit must not write a setting');
    assert.equal(between.includes('.save('), false, 'nor persist a store');
    assert.equal(
      between.includes('ui.notifications?.warn'),
      false,
      'and the notice is INFO: nothing is wrong, and a permanent warning would redden every ' +
        'View Lab capture, which runs this path on every build'
    );
  });
});

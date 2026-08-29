/**
 * The world-scope projection and write path (issue 1362, epic 1357).
 *
 * The projection and the actions are tested from ONE fixture corpus, because the properties
 * that matter are relationships between them: what the projection says a component carries has
 * to be what the actions are able to write, and the three shapes a screen must not infer -
 * a component's single section, its absent `enabled` flag, and the additive tag set - are
 * assertions about both halves at once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPONENT_SECTIONS } from '../src/systems/componentScope.js';
import { ESSENCE_SECTIONS } from '../src/systems/essenceScope.js';
import { TOOL_SECTIONS } from '../src/systems/toolScope.js';
import { createScopedDefinitionStore } from '../src/systems/scopedDefinitionStore.js';
import {
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
} from '../src/systems/componentScope.js';
import {
  normalizeEssenceMemberships,
  normalizeEssenceWorldDefaults,
} from '../src/systems/essenceScope.js';
import { normalizeToolMemberships, normalizeToolWorldDefaults } from '../src/systems/toolScope.js';
import {
  createWorldScopeActions,
  createWorldScopeEntityActions,
} from '../src/ui/svelte/stores/worldScopeActions.js';
import {
  buildWorldScopeState,
  emptyWorldScopeState,
  emptyWorldVocabularyState,
  projectWorldScopeEntity,
  projectWorldVocabulary,
  WORLD_SCOPE_DESCRIPTORS,
  WORLD_SCOPE_ENTITY_TYPES,
  WORLD_VOCABULARY_KINDS,
} from '../src/ui/svelte/stores/worldScopeProjection.js';

const NORMALIZERS = {
  component: {
    normalizeDefaults: normalizeComponentWorldDefaults,
    normalizeMemberships: normalizeComponentMemberships,
  },
  essence: {
    normalizeDefaults: normalizeEssenceWorldDefaults,
    normalizeMemberships: normalizeEssenceMemberships,
  },
  tool: {
    normalizeDefaults: normalizeToolWorldDefaults,
    normalizeMemberships: normalizeToolMemberships,
  },
};

/**
 * A real `ScopedDefinitionStore` over an in-memory setting, so the actions run against the
 * shipped read/normalize/persist path rather than a fake that would accept anything.
 *
 * @param {string} entityType
 * @param {unknown} [seed]
 * @returns {{store: object, read: () => unknown}}
 */
function storeFor(entityType, seed = undefined) {
  let value = seed;
  const store = createScopedDefinitionStore({
    settingKey: `fabricate.${entityType}Scope`,
    getSetting: () => value,
    setSetting: async (_key, next) => {
      value = next;
    },
    ...NORMALIZERS[entityType],
  });
  store.load();
  return { store, read: () => value };
}

const SYSTEMS = [
  { id: 'sys-forge', name: 'Mythwright Forge' },
  { id: 'sys-alchemy', name: 'Alchemy' },
];

test('the descriptor states a component has exactly one section and no enabled flag', () => {
  assert.deepEqual([...COMPONENT_SECTIONS], ['category']);
  assert.deepEqual([...WORLD_SCOPE_DESCRIPTORS.component.sections], ['category']);
  assert.equal(WORLD_SCOPE_DESCRIPTORS.component.enableable, false);
  assert.equal(WORLD_SCOPE_DESCRIPTORS.component.taggable, true);
  assert.deepEqual([...WORLD_SCOPE_DESCRIPTORS.essence.sections], [...ESSENCE_SECTIONS]);
  assert.deepEqual([...WORLD_SCOPE_DESCRIPTORS.tool.sections], [...TOOL_SECTIONS]);
  assert.equal(WORLD_SCOPE_DESCRIPTORS.essence.taggable, false);
  assert.equal(WORLD_SCOPE_DESCRIPTORS.tool.taggable, false);
});

test('the empty state carries all three entity types with an UNKNOWN corpus', () => {
  const { worldScope } = emptyWorldScopeState();
  // The three entity types PLUS the World Vocabulary, which is a sibling key rather than a
  // fourth entity type: it has no sections, no membership and no per-system rows, and
  // `WORLD_SCOPE_ENTITY_TYPES` deliberately does not name it.
  assert.deepEqual(Object.keys(worldScope), [...WORLD_SCOPE_ENTITY_TYPES, 'vocabulary']);
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    assert.equal(worldScope[entityType].available, false);
    assert.deepEqual(worldScope[entityType].seeded, {
      entities: false,
      defaults: false,
      membership: false,
    });
    assert.deepEqual(worldScope[entityType].entries, []);
  }
});

test('the projection publishes the WORLD corpus, per-system rows and inherit counts', () => {
  const corpus = {
    entities: [
      { id: 'ash-salt', name: 'Ash Salt' },
      { id: 'cold-iron', name: 'Cold Iron Nail' },
    ],
    defaults: [{ id: 'ash-salt', category: 'reagent', tags: ['mineral'] }],
    membership: [
      { entityId: 'ash-salt', systemId: 'sys-forge', inherit: { category: true } },
      { entityId: 'ash-salt', systemId: 'sys-alchemy', inherit: { category: false } },
    ],
  };
  const state = projectWorldScopeEntity({
    entityType: 'component',
    corpus,
    seeded: { entities: true, defaults: true, membership: false },
    systems: SYSTEMS,
  });

  assert.equal(state.available, true);
  assert.deepEqual(state.seeded, { entities: true, defaults: true, membership: false });
  assert.equal(state.entries.length, 2);

  const ash = state.entries[0];
  assert.equal(ash.id, 'ash-salt');
  assert.equal(ash.membershipCount, 2);
  assert.deepEqual(ash.inheritCounts, { category: 1 });
  assert.deepEqual(
    ash.systems.map((row) => [row.systemId, row.systemName, row.member, row.inherited.category]),
    [
      ['sys-forge', 'Mythwright Forge', true, true],
      ['sys-alchemy', 'Alchemy', true, false],
    ]
  );

  const iron = state.entries[1];
  assert.equal(iron.membershipCount, 0);
  assert.deepEqual(iron.inheritCounts, { category: 0 });
  assert.ok(iron.systems.every((row) => row.member === false));
});

test('a component row carries NO enabled key, an essence and tool row do', () => {
  const componentRow = projectWorldScopeEntity({
    entityType: 'component',
    corpus: {
      entities: [{ id: 'ash-salt' }],
      defaults: [],
      membership: [{ entityId: 'ash-salt', systemId: 'sys-forge' }],
    },
    systems: SYSTEMS,
  }).entries[0].systems[0];
  assert.equal('enabled' in componentRow, false, 'a component membership carries no enabled flag');

  for (const entityType of ['essence', 'tool']) {
    const row = projectWorldScopeEntity({
      entityType,
      corpus: {
        entities: [{ id: 'ember' }],
        defaults: [],
        membership: [{ entityId: 'ember', systemId: 'sys-forge', enabled: false }],
      },
      systems: SYSTEMS,
    }).entries[0].systems;
    assert.equal(row[0].enabled, false, `${entityType} keeps a disabled member`);
    assert.equal(row[1].enabled, false, `${entityType} non-member is not enabled`);
    assert.equal(row[1].member, false);
  }
});

test('a non-member system still produces a row, so membership is the gate', () => {
  const state = projectWorldScopeEntity({
    entityType: 'tool',
    corpus: { entities: [{ id: 'hammer' }], defaults: [], membership: [] },
    systems: SYSTEMS,
  });
  assert.equal(state.entries[0].systems.length, 2);
  assert.deepEqual(
    state.entries[0].systems.map((row) => row.member),
    [false, false]
  );
});

test('buildWorldScopeState reads all three stores and answers a NEW object each time', () => {
  const stores = {
    component: storeFor('component', { entities: { 'ash-salt': { id: 'ash-salt' } } }).store,
    essence: storeFor('essence').store,
    tool: storeFor('tool').store,
  };
  const first = buildWorldScopeState({ stores, systems: SYSTEMS });
  const second = buildWorldScopeState({ stores, systems: SYSTEMS });
  assert.notEqual(first.worldScope, second.worldScope, 'a fresh object per publish');
  assert.deepEqual(first.worldScope, second.worldScope, 'with identical content');
  assert.equal(first.worldScope.component.entries.length, 1);
  assert.equal(first.worldScope.component.seeded.entities, true);
  assert.equal(first.worldScope.component.seeded.membership, false);
  assert.equal(first.worldScope.essence.available, true);
  assert.equal(first.worldScope.essence.entries.length, 0);
});

test('an absent or throwing store degrades to an UNKNOWN corpus rather than throwing', () => {
  const throwing = {
    corpus() {
      throw new Error('unreadable');
    },
  };
  const { worldScope } = buildWorldScopeState({
    stores: { component: throwing, essence: null, tool: undefined },
    systems: SYSTEMS,
  });
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    assert.equal(worldScope[entityType].available, false);
    assert.equal(worldScope[entityType].seeded.entities, false);
  }
});

// ── The write path ────────────────────────────────────────────────────────────────────────

function actionsFor(entityType, seed) {
  const { store, read } = storeFor(entityType, seed);
  return {
    store,
    read,
    actions: createWorldScopeEntityActions({ entityType, getStore: () => store }),
  };
}

test('setEnabled is ABSENT on the component type and present on the other two', () => {
  const component = createWorldScopeEntityActions({
    entityType: 'component',
    getStore: () => null,
  });
  assert.equal('setEnabled' in component, false, 'not "exists and refuses" — structurally absent');
  assert.equal('setWorldTags' in component, true);
  assert.equal('setMutedTags' in component, true);

  for (const entityType of ['essence', 'tool']) {
    const actions = createWorldScopeEntityActions({ entityType, getStore: () => null });
    assert.equal('setEnabled' in actions, true);
    assert.equal('setWorldTags' in actions, false);
    assert.equal('setMutedTags' in actions, false);
  }
});

test('every section-taking action REFUSES a name the scope does not declare', async () => {
  const { actions, store } = actionsFor('component');
  await actions.createEntity({ id: 'ash-salt', name: 'Ash Salt' });
  await actions.addToSystem('ash-salt', 'sys-forge');

  // Every one of these is a real component field that is NOT a section. The normalizer would
  // silently discard each on the next load, so the action has to refuse rather than accept.
  for (const section of ['salvage', 'difficulty', 'essences', 'complications', 'tags']) {
    assert.equal(await actions.updateWorldDefaultSection('ash-salt', section, {}), false, section);
    assert.equal(
      await actions.updateMembershipSection('ash-salt', 'sys-forge', section, {}),
      false,
      section
    );
    assert.equal(
      await actions.setSectionInherited('ash-salt', 'sys-forge', section, false),
      false,
      section
    );
  }
  const record = store.listMemberships()[0];
  assert.deepEqual(Object.keys(record).sort(), ['entityId', 'inherit', 'systemId']);
});

test('a section VALUE is opaque and survives a round trip through the store', async () => {
  const { actions, store } = actionsFor('tool');
  await actions.createEntity({ id: 'hammer' });
  const breakage = { mode: 'dice', formula: '1d20', below: 3, nested: { deep: [1, 2] } };
  assert.equal(await actions.updateWorldDefaultSection('hammer', 'breakage', breakage), true);
  assert.deepEqual(store.listDefaults()[0].breakage, breakage);
});

test('adding a TOOL to a system seeds repairRequirements as a structural COPY', async () => {
  const { actions, store } = actionsFor('tool');
  await actions.createEntity({ id: 'hammer' });
  await actions.updateWorldDefaultSection('hammer', 'breakage', { mode: 'uses' });
  // The world defaults carry the seed list; `updateWorldDefaultSection` cannot write it,
  // because `repairRequirements` is not a section. Seed the setting directly, exactly as the
  // migration and an import do.
  const raw = store.get();
  raw.defaults.hammer.repairRequirements = [{ id: 'group-1', options: [{ componentId: 'iron' }] }];
  await store.save(raw);

  assert.equal(await actions.addToSystem('hammer', 'sys-forge'), true);
  const record = store.listMemberships()[0];
  assert.deepEqual(record.repairRequirements, [
    { id: 'group-1', options: [{ componentId: 'iron' }] },
  ]);
  assert.notEqual(
    record.repairRequirements,
    store.listDefaults()[0].repairRequirements,
    'the seed is a copy, not the world list itself'
  );
  assert.notEqual(
    record.repairRequirements[0],
    store.listDefaults()[0].repairRequirements[0],
    'and a deep copy, so a later system edit cannot reach back into the world'
  );
});

test('adding a COMPONENT or ESSENCE seeds no repair list and inherits everything', async () => {
  for (const entityType of ['component', 'essence']) {
    const { actions, store } = actionsFor(entityType);
    await actions.createEntity({ id: 'ember' });
    assert.equal(await actions.addToSystem('ember', 'sys-forge'), true);
    const record = store.listMemberships()[0];
    assert.equal('repairRequirements' in record, false);
    assert.deepEqual(record.inherit, {});
    if (entityType === 'essence') assert.equal(record.enabled, true);
    else assert.equal('enabled' in record, false);
  }
});

test('re-inheriting RETAINS the dormant override against a distinguishable fixture', async () => {
  const { actions, store } = actionsFor('essence');
  await actions.createEntity({ id: 'ember' });
  // World and local are DIFFERENT non-empty values, so retention and re-seed are separable.
  await actions.updateWorldDefaultSection('ember', 'macro', 'Macro.world-default');
  await actions.addToSystem('ember', 'sys-forge');

  // Switch off: the local block is SEEDED from the world value.
  assert.equal(await actions.setSectionInherited('ember', 'sys-forge', 'macro', false), true);
  assert.equal(store.listMemberships()[0].macro, 'Macro.world-default');

  // Author a different local value.
  await actions.updateMembershipSection('ember', 'sys-forge', 'macro', 'Macro.local-edit');
  assert.equal(store.listMemberships()[0].macro, 'Macro.local-edit');

  // Switch back on: the switch flips, the override stays.
  assert.equal(await actions.setSectionInherited('ember', 'sys-forge', 'macro', true), true);
  const retained = store.listMemberships()[0];
  assert.equal(retained.inherit.macro, true);
  assert.equal(retained.macro, 'Macro.local-edit', 'the dormant override is RETAINED');
  assert.notEqual(retained.macro, 'Macro.world-default', 'and is not the world default');

  // Switch off again: the retained value is RESTORED rather than re-seeded from the world.
  assert.equal(await actions.setSectionInherited('ember', 'sys-forge', 'macro', false), true);
  assert.equal(store.listMemberships()[0].macro, 'Macro.local-edit');
});

test('the seed is a structural copy rather than an alias of the world value', async () => {
  const { actions, store } = actionsFor('tool');
  await actions.createEntity({ id: 'hammer' });
  await actions.updateWorldDefaultSection('hammer', 'onBreak', { mode: 'replace', repl: 'iron' });
  await actions.addToSystem('hammer', 'sys-forge');
  await actions.setSectionInherited('hammer', 'sys-forge', 'onBreak', false);
  const membership = store.listMemberships()[0];
  assert.deepEqual(membership.onBreak, { mode: 'replace', repl: 'iron' });
  assert.notEqual(
    membership.onBreak,
    store.listDefaults()[0].onBreak,
    'the store round trip clones, so the seed cannot alias the world block'
  );
});

test('component tags are additive with per-tag muting and never a section', async () => {
  const { actions, store } = actionsFor('component');
  await actions.createEntity({ id: 'ash-salt' });
  assert.equal(await actions.setWorldTags('ash-salt', ['mineral', ' reagent ', 'mineral']), true);
  assert.deepEqual(store.listDefaults()[0].tags, ['mineral', 'reagent']);

  await actions.addToSystem('ash-salt', 'sys-forge');
  assert.equal(await actions.setMutedTags('ash-salt', 'sys-forge', ['mineral']), true);
  assert.deepEqual(store.listMemberships()[0].mutedTags, ['mineral']);
  assert.equal('inherit' in store.listMemberships()[0], true);
  assert.deepEqual(store.listMemberships()[0].inherit, {}, 'tags carry no inherit switch');
});

test('setEnabled keeps the record and its overrides — disabled is not absent', async () => {
  const { actions, store } = actionsFor('tool');
  await actions.createEntity({ id: 'hammer' });
  await actions.addToSystem('hammer', 'sys-forge');
  await actions.updateMembershipSection('hammer', 'sys-forge', 'breakage', { mode: 'chance' });
  assert.equal(await actions.setEnabled('hammer', 'sys-forge', false), true);
  const record = store.listMemberships()[0];
  assert.equal(record.enabled, false);
  assert.deepEqual(record.breakage, { mode: 'chance' });
});

test('removeFromSystem deletes only that record; deleteEntity sweeps every one', async () => {
  const { actions, store } = actionsFor('component');
  await actions.createEntity({ id: 'ash-salt' });
  await actions.createEntity({ id: 'cold-iron' });
  await actions.addToSystem('ash-salt', 'sys-forge');
  await actions.addToSystem('ash-salt', 'sys-alchemy');
  await actions.addToSystem('cold-iron', 'sys-forge');
  await actions.updateWorldDefaultSection('ash-salt', 'category', 'reagent');

  assert.equal(await actions.removeFromSystem('ash-salt', 'sys-forge'), true);
  assert.equal(store.listMemberships().length, 2);
  assert.equal(store.listEntities().length, 2);

  assert.equal(await actions.deleteEntity('ash-salt'), true);
  assert.deepEqual(
    store.listMemberships().map((record) => `${record.entityId}|${record.systemId}`),
    ['cold-iron|sys-forge']
  );
  assert.deepEqual(
    store.listDefaults().map((record) => record.id),
    []
  );
});

test('copyMembership clones sections independently and stamps NO provenance key', async () => {
  const { actions, store } = actionsFor('tool');
  await actions.createEntity({ id: 'hammer' });
  await actions.addToSystem('hammer', 'sys-forge');
  await actions.setSectionInherited('hammer', 'sys-forge', 'breakage', false);
  await actions.updateMembershipSection('hammer', 'sys-forge', 'breakage', { mode: 'uses', n: 3 });

  assert.equal(await actions.copyMembership('hammer', 'sys-forge', ['sys-alchemy']), true);
  const copy = store.listMemberships().find((record) => record.systemId === 'sys-alchemy');
  const source = store.listMemberships().find((record) => record.systemId === 'sys-forge');
  assert.deepEqual(copy.breakage, { mode: 'uses', n: 3 });
  assert.equal(copy.inherit.breakage, false);
  assert.notEqual(copy.breakage, source.breakage, 'the copy is independent');
  assert.equal('from' in copy, false, 'the normalizer would discard a provenance key');
  assert.equal('copiedFromSystemId' in copy, false);
});

// ── The COMPOSITION, which is the thing `adminStore` actually calls ───────────────────────
//
// `createWorldScopeEntityActions` had every property below asserted of it and the composition
// over it had NONE, so `createWorldScopeActions` could have returned `{}` and shipped green.
// That is the shape this repository keeps paying for: a covered leaf under an uncovered
// composition root, where the root is the only thing production reaches. PRs 6a-c build
// directly on `store.worldScope`, so it is asserted here as its own subject.

test('the composition builds all three entity types and wires each to its own store', async () => {
  const stores = {
    component: storeFor('component'),
    essence: storeFor('essence'),
    tool: storeFor('tool'),
  };
  const actions = createWorldScopeActions({
    getStores: {
      component: () => stores.component.store,
      essence: () => stores.essence.store,
      tool: () => stores.tool.store,
    },
  });

  assert.deepEqual(Object.keys(actions).sort(), ['component', 'essence', 'tool']);

  // EACH IS WIRED TO ITS OWN STORE, and that is the half a shape check cannot see: three
  // action families all pointed at one store would satisfy every key assertion while writing
  // every component into `fabricate.essenceScope`.
  await actions.component.createEntity({ id: 'ash-salt' });
  await actions.essence.createEntity({ id: 'ember' });
  await actions.tool.createEntity({ id: 'hammer' });
  assert.deepEqual(
    stores.component.store.listEntities().map((entry) => entry.id),
    ['ash-salt']
  );
  assert.deepEqual(
    stores.essence.store.listEntities().map((entry) => entry.id),
    ['ember']
  );
  assert.deepEqual(
    stores.tool.store.listEntities().map((entry) => entry.id),
    ['hammer']
  );
});

test('the composition preserves each type\'s KEY SET, which is part of the contract', () => {
  const actions = createWorldScopeActions({ getStores: {} });
  // The structural absences survive composition. A composition that built every type from one
  // descriptor would hand the component path a `setEnabled` the normalizer drops, and the
  // essence and tool paths tag writes neither carries.
  assert.equal('setEnabled' in actions.component, false);
  assert.equal('setWorldTags' in actions.component, true);
  assert.equal('setMutedTags' in actions.component, true);
  for (const entityType of ['essence', 'tool']) {
    assert.equal('setEnabled' in actions[entityType], true, entityType);
    assert.equal('setWorldTags' in actions[entityType], false, entityType);
    assert.equal('setMutedTags' in actions[entityType], false, entityType);
  }
  assert.deepEqual(
    ['component', 'essence', 'tool'].map((entityType) => actions[entityType].entityType),
    ['component', 'essence', 'tool'],
    'each family reports the type it writes'
  );
});

test('the composition tolerates an absent getStores map without throwing', async () => {
  // `adminStore` builds this at construction time, before `services` can resolve anything, so
  // a missing seam must degrade to a refusing action family rather than take the store down.
  const actions = createWorldScopeActions({});
  assert.equal(await actions.tool.createEntity({ id: 'hammer' }), false);
  assert.equal(await actions.component.addToSystem('ash-salt', 'sys-forge'), false);
});

test('every action answers false rather than throwing when there is no store', async () => {
  const actions = createWorldScopeEntityActions({ entityType: 'tool', getStore: () => null });
  assert.equal(await actions.createEntity({ id: 'hammer' }), false);
  assert.equal(await actions.addToSystem('hammer', 'sys-forge'), false);
  assert.equal(await actions.setEnabled('hammer', 'sys-forge', true), false);
  assert.equal(await actions.deleteEntity('hammer'), false);
});

test('the first createEntity SEEDS the setting and flips isSeeded per sub-key', async () => {
  const { actions, store, read } = actionsFor('component');
  assert.equal(store.isSeeded('entities'), false);
  assert.equal(read(), undefined);
  await actions.createEntity({ id: 'ash-salt' });
  assert.equal(store.isSeeded('entities'), true);
  assert.equal(store.isSeeded('membership'), true);
  assert.deepEqual(Object.keys(read()).sort(), ['defaults', 'entities', 'membership']);
});

// ── The World Vocabulary leg (issue 1362) ────────────────────────────────────────────────────
//
// It is the fourth leg of a projection whose other three are scoped-entity corpora, and it
// exists NOW for a one-way-door reason: `adminStore.js` and `CraftingSystemManagerRoot.svelte`
// are two of the five gateway files `### GM World Scoped Entity Routes` requirement 7 closes to
// PR 7, so neither the store leg nor the badge that reads it could be added later.
//
// `total` IS THE ASSERTION, not a convenience. The consumer reads `worldScope.vocabulary.total`
// and nothing else pins the name: a producer that published `count`, or left the caller to read
// `entries.length`, would leave the badge on 0 forever with every other test in this repository
// still green.

test('the vocabulary projection sums all three vocabularies into `total`', () => {
  const state = projectWorldVocabulary({
    componentCategories: [{ id: 'metal' }, { id: 'herb' }],
    componentTags: [{ id: 'rare' }],
    recipeCategories: [{ id: 'smithing' }, { id: 'alchemy' }, { id: 'cooking' }],
  });
  assert.equal(state.available, true);
  assert.equal(state.total, 6, 'the badge counts the WHOLE vocabulary, not one of its three');
  assert.deepEqual(
    WORLD_VOCABULARY_KINDS.map((kind) => state[kind].length),
    [2, 1, 3],
    'and each vocabulary is carried through under its own name'
  );
});

test('a partial vocabulary corpus counts what is there and defaults the rest to empty', () => {
  // The shape PR 7 ships first is unlikely to be all three at once, and a missing key must
  // read as an empty vocabulary rather than take the publish down.
  const state = projectWorldVocabulary({ componentTags: [{ id: 'rare' }, { id: 'cursed' }] });
  assert.equal(state.total, 2);
  assert.deepEqual(state.componentCategories, []);
  assert.deepEqual(state.recipeCategories, []);
});

test('an absent vocabulary store publishes an UNAVAILABLE zero rather than an absent key', () => {
  // `?? 0` in the consumer would absorb an absent key too, which is exactly why the producer
  // must not rely on it: the difference between "no vocabulary" and "no projection" is what
  // tells a later reader whether the badge is truthful or broken.
  const empty = emptyWorldVocabularyState();
  assert.equal(empty.available, false);
  assert.equal(empty.total, 0);
  assert.deepEqual(projectWorldVocabulary(null), empty);
  assert.deepEqual(projectWorldVocabulary('nonsense'), empty);
  assert.deepEqual(emptyWorldScopeState().worldScope.vocabulary, empty);
});

test('buildWorldScopeState reads the OPTIONAL fourth store leg and publishes vocabulary.total', () => {
  // The producer half of requirement 7's closure. `adminStore._worldScopeStores` hands this
  // function a `vocabulary` leg read through `services.getVocabularyScopeStore?.() ?? null`, so
  // PR 7 registers a store and a service accessor — neither of them a gateway path — and never
  // reopens `adminStore.js`.
  const withoutStore = buildWorldScopeState({ stores: {}, systems: [] });
  assert.equal(withoutStore.worldScope.vocabulary.total, 0);
  assert.equal(withoutStore.worldScope.vocabulary.available, false);

  const vocabularyStore = {
    corpus: () => ({
      componentCategories: [{ id: 'metal' }],
      componentTags: [{ id: 'rare' }, { id: 'cursed' }],
      recipeCategories: [{ id: 'smithing' }],
    }),
  };
  const withStore = buildWorldScopeState({ stores: { vocabulary: vocabularyStore }, systems: [] });
  assert.equal(withStore.worldScope.vocabulary.total, 4);
  assert.equal(withStore.worldScope.vocabulary.available, true);
  // And the three entity legs are untouched by it: the vocabulary is not a scoped-entity
  // corpus and must not appear among the entity types.
  assert.equal(WORLD_SCOPE_ENTITY_TYPES.includes('vocabulary'), false);
});

test('a THROWING vocabulary store degrades to zero rather than taking the publish down', () => {
  const exploding = {
    corpus() {
      throw new Error('setting unreadable');
    },
  };
  const state = buildWorldScopeState({ stores: { vocabulary: exploding }, systems: [] });
  assert.equal(state.worldScope.vocabulary.total, 0);
  assert.equal(state.worldScope.vocabulary.available, false);
  assert.equal(state.worldScope.component.available, false, 'and the rest still projects');
});

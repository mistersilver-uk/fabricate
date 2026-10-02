/** Issue 1364 (epic 1357, PR 4) — world-scope entity import/export, schema 6. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { installFoundryUtilsEnv } from './helpers/foundryEnv.js';
import { destinationWorld, emptySeededScope } from './helpers/worldScopeImportHarness.js';


installFoundryUtilsEnv();

const { buildExportPayload, prepareForImport, validateImportData } = await import(
  '../src/systems/CraftingSystemExporter.js'
);
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { FABRICATE_EXPORT_SCHEMA_VERSION } = await import('../src/systems/authoringExport.js');
const { reportWorldIdentityDrift } = await import('../src/systems/worldIdentityDrift.js');
const { REFERENCE_KINDS } = await import('../src/systems/importReferenceResolver.js');
const { buildWorldScopeGrouping } = await import(
  '../src/systems/worldScopeEntityGrouping.js'
);
const { migrateWorldScopeEntities } = await import(
  '../src/migration/migrateWorldScopeEntities.js'
);
const { resolveComponentScope } = await import('../src/systems/componentScope.js');
const { CompendiumImporter, scopeStoreDelegate } = await import(
  '../src/systems/CompendiumImporter.js'
);
const { bindFabricateGlobal } = await import('../src/bootstrap/publicApi.js');
const { createManagerServices } = await import('../src/ui/managerServices.js');

const SOURCE_SYSTEM_ID = 'sys-source';

// Fixtures — one builder per shape, reused rather than re-authored per test

/** A minimal in-system component carrying only MODERN source spellings. */
function component(id, overrides = {}) {
  return { id, name: `Component ${id}`, originItemUuid: `Item.${id}`, ...overrides };
}

/** An export envelope, hand-assembled so a test can author a slice the exporter cannot produce. */
function envelope({ system, componentScope, essenceScope, toolScope, schemaVersion } = {}) {
  return {
    schemaVersion: schemaVersion ?? FABRICATE_EXPORT_SCHEMA_VERSION,
    fabricateVersion: '9.9.9',
    runtimeStateIncluded: false,
    system: {
      id: SOURCE_SYSTEM_ID,
      name: 'Source System',
      components: [],
      essenceDefinitions: [],
      tools: [],
      ...system,
    },
    recipes: [],
    gatheringEnvironments: [],
    gatheringConfig: { system: {}, shared: {} },
    ...(componentScope ? { componentScope } : {}),
    ...(essenceScope ? { essenceScope } : {}),
    ...(toolScope ? { toolScope } : {}),
  };
}

/** An envelope-shaped slice, in the ARRAY form a real bundle carries. */
function slice({ entities = [], defaults = [], membership = [] } = {}) {
  return { entities, defaults, membership };
}

/** A world-scope membership record in the envelope's array form. */
function membershipRecord(entityId, systemId, extra = {}) {
  return { entityId, systemId, ...extra };
}

/** A world entirely unmigrated: none of the three settings has ever been written. */
function unmigratedWorld() {
  return destinationWorld();
}

/** A world that has migrated but holds nothing yet — the round trip's destination. */
function seededEmptyWorld() {
  return destinationWorld({
    componentScope: emptySeededScope(),
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });
}

/** Run the whole composition, exactly as `game.fabricate.importSystemFromFile` does. */
async function runImport(world, payload, { mode = 'keep', overwriteExisting = true } = {}) {
  const packData = prepareForImport(payload, mode, { worldEntityIndex: world.worldEntityIndex() });
  const summary = await world.importer.importFromPackData(packData, { overwriteExisting });
  return { packData, summary };
}

/** Every world-scope report entry of one kind. */
function reported(summary, kind) {
  return summary.unresolvedReferences.filter((entry) => entry.kind === kind);
}

// Criterion 4 — the upcast DERIVES without STRIPPING

test('4(a): the upcast derives a world entity WITHOUT rewriting the in-system record', () => {
  // The divergence arm, and the reason the discard of the shared transform's returned `systems` is
  // LOAD-BEARING rather than defensive.
  const legacy = {
    fabricateVersion: '1.0.0',
    system: {
      id: SOURCE_SYSTEM_ID,
      name: 'Legacy',
      components: [{ id: 'legacy1', name: 'Legacy One', sourceUuid: 'Item.leg1' }],
      essenceDefinitions: [],
      tools: [],
    },
    recipes: [],
  };

  const migrated = migrateExportPayload(legacy);

  assert.ok(
    !('aliasItemUuids' in migrated.system.components[0]),
    'the in-system record must NOT acquire an aliasItemUuids key it never had'
  );
  assert.equal(migrated.system.components[0].sourceUuid, 'Item.leg1', 'and keeps its own spelling');
  assert.deepEqual(
    migrated.componentScope.entities[0].aliasItemUuids,
    ['Item.leg1'],
    'while the DERIVED world entity has canonicalised the legacy spelling'
  );
});

test('4(b): no key is removed from the three in-system arrays, and no carried value changes', () => {
  // The no-strip arm, stated ONE-DIRECTIONALLY because "deep-equal to the input" is false for a
  // schema-1 payload independently of this change: `upcastLegacyTools` already ADDS keys to a
  // component-linked tool.
  const authored = {
    components: [
      component('c1', { category: 'ore', tags: ['metal'], essences: { fire: 2 } }),
      { id: 'c2', name: 'Bare', sourceUuid: 'Item.legacy' },
    ],
    essenceDefinitions: [{ id: 'fire', name: 'Fire', sourceComponentId: 'c1' }],
    tools: [{ id: 't1', name: 'Hammer', componentId: 'c1', breakage: { mode: 'never' } }],
  };

  for (const schemaVersion of [undefined, 5, FABRICATE_EXPORT_SCHEMA_VERSION]) {
    const input = envelope({ system: structuredClone(authored), schemaVersion });
    if (schemaVersion === undefined) delete input.schemaVersion;
    const before = structuredClone(input.system);
    const migrated = migrateExportPayload(input);

    for (const field of ['components', 'essenceDefinitions', 'tools']) {
      for (const [index, record] of before[field].entries()) {
        const after = migrated.system[field][index];
        for (const [key, value] of Object.entries(record)) {
          assert.ok(key in after, `schema ${schemaVersion}: ${field}[${index}].${key} was REMOVED`);
          assert.deepEqual(
            after[key],
            value,
            `schema ${schemaVersion}: ${field}[${index}].${key} was CHANGED`
          );
        }
      }
    }
  }
});

// Criterion 5 — a colliding pair is REFUSED rather than silently emptied

test('5(a): an ordinary bundle emits one world entity per in-system record, under its own id', () => {
  // THE POSITIVE STATEMENT, and it has NO REACHABLE REDDENING MUTATION — it does not pretend
  // otherwise.
  const migrated = migrateExportPayload(
    envelope({ system: { components: [component('c1'), component('c2')] } })
  );
  assert.deepEqual(
    migrated.componentScope.entities.map((entity) => entity.id),
    ['c1', 'c2'],
    'one world entity per in-system component, each under that component’s own id'
  );
});

test('5(b): a colliding pair yields an EMPTY slice AND a reported refusal', () => {
  // The ordinary component-plus-variant shape: two components in ONE system sharing a
  // `registeredItemUuid`.
  const payload = envelope({
    system: {
      components: [
        { id: 'c1', name: 'Ingot', registeredItemUuid: 'Item.shared' },
        { id: 'c2', name: 'Ingot variant', registeredItemUuid: 'Item.shared' },
      ],
    },
  });

  const migrated = migrateExportPayload(payload);
  assert.deepEqual(migrated.componentScope.entities, [], 'a refused pair emits an EMPTY slice');
  assert.deepEqual(migrated.componentScope.membership, [], 'and no membership records');

  const prepared = prepareForImport(payload, 'keep');
  assert.deepEqual(
    prepared.worldScopeRefusals.map((refusal) => [refusal.entityType, refusal.reason]),
    [['components', 'outputIdCollision']],
    'the refusal reaches the prepared payload — an empty slice must never be silent'
  );
});

// Criterion 6 — the derivation is BRANCH-INDEPENDENT

test('6: the derivation runs on the current-schema branch AND the legacy branch', () => {
  // REDDENS WHEN: the derivation call is removed from the early-return branch (the schema-6 arm
  // fails); and INDEPENDENTLY when it is removed from the main path (the schema-1 arm fails).
  const alreadyCurrent = migrateExportPayload(
    envelope({
      system: { components: [component('c1')] },
      componentScope: slice(),
      essenceScope: slice(),
      toolScope: slice(),
    })
  );
  assert.deepEqual(
    alreadyCurrent.componentScope.entities.map((entity) => entity.id),
    ['c1'],
    'a payload already stamped schema 6 with empty slices still derives them'
  );

  const legacy = migrateExportPayload({
    fabricateVersion: '1.0.0',
    system: { id: SOURCE_SYSTEM_ID, name: 'Legacy', components: [component('c1')] },
    recipes: [],
  });
  assert.deepEqual(
    legacy.componentScope.entities.map((entity) => entity.id),
    ['c1'],
    'and so does a schema-1 payload'
  );
});

// Criterion 7 — the per-pair lift guard, ON THE ARRAY FORM

test('7: a hand-edited membership record survives the upcast BYTE-IDENTICAL, from the array form', () => {
  // THE ARRAY FORM IS NOT OPTIONAL IN THIS FIXTURE.
  const handEdited = membershipRecord('c1', SOURCE_SYSTEM_ID, {
    inherit: { category: true },
    category: 'hand-edited',
  });
  const migrated = migrateExportPayload(
    envelope({
      system: { components: [component('c1'), component('c2')] },
      componentScope: slice({ membership: [structuredClone(handEdited)] }),
    })
  );

  const byEntity = new Map(
    migrated.componentScope.membership.map((record) => [record.entityId, record])
  );
  assert.deepEqual(
    byEntity.get('c1'),
    // The `1.30.0` leg preserves the record verbatim; the `1.32.0` leg that follows it (issue
    // 1371 r18-store, M31) adds EXACTLY ONE key, the `essences` switch, decided by equality with
    // the bundled system's own row — `c1` carries no essences and no world map is elected, so it
    // inherits. Everything the hand edit authored is untouched.
    { ...handEdited, inherit: { ...handEdited.inherit, essences: true } },
    'the record already present is preserved — `inherit.category` stays TRUE, which is ' +
      'the opposite of what `buildMembershipRecord` writes — and gains only the essences switch'
  );
  assert.ok(byEntity.has('c2'), 'while the missing pair is derived');
});

// Criterion 8 — the map/array conversion round-trips

test('8(a): the membership key is derived with the shipped separator, so one pair is ONE record', () => {
  // REDDENS WHEN: the separator is written as anything but the shipped `MEMBERSHIP_KEY_SEPARATOR`.
  const migrated = migrateExportPayload(
    envelope({
      system: { components: [component('c1')] },
      componentScope: slice({
        membership: [membershipRecord('c1', SOURCE_SYSTEM_ID, { inherit: { category: true } })],
      }),
    })
  );
  assert.equal(
    migrated.componentScope.membership.filter(
      (record) => record.entityId === 'c1' && record.systemId === SOURCE_SYSTEM_ID
    ).length,
    1,
    'exactly one membership record for the pair'
  );
});

test('8(b): the key is derived FROM THE RECORD, so a disagreeing carried key cannot duplicate it', () => {
  // The map form is also accepted on read, and requirement 13 DISCARDS the carried key and
  // re-derives it.
  const migrated = migrateExportPayload(
    envelope({
      system: { components: [component('c1')] },
      componentScope: {
        entities: [],
        defaults: {},
        membership: {
          'nonsense|key': membershipRecord('c1', SOURCE_SYSTEM_ID, { inherit: { category: true } }),
        },
      },
    })
  );
  assert.equal(migrated.componentScope.membership.length, 1, 'one record, keyed from the record');
  assert.equal(migrated.componentScope.membership[0].entityId, 'c1');
});

test('8(c): two upcasts of one payload share no object, and the input is never reached', () => {
  // NO REACHABLE REDDENING MUTATION, and it does not pretend to have one.
  const raw = envelope({
    system: { components: [component('c1')] },
    componentScope: slice({ membership: [membershipRecord('c1', SOURCE_SYSTEM_ID)] }),
  });
  const first = migrateExportPayload(raw);
  const second = migrateExportPayload(raw);

  first.componentScope.membership[0].entityId = 'mutated';
  assert.equal(second.componentScope.membership[0].entityId, 'c1', 'two calls, two clones');
  assert.equal(raw.componentScope.membership[0].entityId, 'c1', 'the raw input is untouched');
});

// Criterion 1 — the round trip, per layer

test('1: keep mode round-trips all three layers into a SEEDED but empty destination', async () => {
  // REDDENS WHEN: one layer's merge is dropped, or the `entities` merge is made to win over
  // `membership` — the destination ends with entities and no memberships, so every component is a
  // NON-MEMBER and nothing the read union answers is that system's.
  const world = await seededEmptyWorld();
  const payload = envelope({
    system: {
      components: [component('c1'), component('c2')],
      essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
      tools: [{ id: 't1', name: 'Hammer', originItemUuid: 'Item.t1' }],
    },
  });

  const { summary } = await runImport(world, payload);

  const persisted = world.persisted('components');
  assert.deepEqual(
    persisted.entities.map((entity) => entity.id).sort(),
    ['c1', 'c2'],
    'LAYER 1 — the world entity roster landed'
  );
  assert.deepEqual(
    Object.keys(persisted.membership).sort(),
    [`c1|${summary.system.id}`, `c2|${summary.system.id}`],
    'LAYER 3 — a membership record per component, under the DESTINATION system id'
  );
  for (const entityType of ['essences', 'tools']) {
    const slicePersisted = world.persisted(entityType);
    assert.equal(
      slicePersisted.entities.length,
      1,
      `the ${entityType} roster landed independently of the component one`
    );
    assert.equal(Object.keys(slicePersisted.membership).length, 1);
  }
});

test('14: the three layers merge INDEPENDENTLY, with all three destination sub-keys present', async () => {
  // ALL THREE MUST BE NON-EMPTY IN THE DESTINATION FIXTURE: an ABSENT sub-key makes an object-level
  // merge pass by accident, which is precisely the shape this guards against.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'dest-1', name: 'Destination One', originItemUuid: 'Item.dest1' }],
      defaults: { 'dest-1': { id: 'dest-1', category: 'kept' } },
      membership: {
        'dest-1|dest-sys': membershipRecord('dest-1', 'dest-sys', { inherit: { category: false } }),
      },
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

  const payload = envelope({
    system: { components: [component('c1', { category: 'ore' })] },
    componentScope: slice({
      entities: [{ id: 'c1', name: 'Component c1', originItemUuid: 'Item.c1' }],
      defaults: [{ id: 'c1', category: 'ore' }],
      membership: [
        membershipRecord('c1', SOURCE_SYSTEM_ID, { inherit: { category: false }, category: 'ore' }),
      ],
    }),
  });

  const { summary } = await runImport(world, payload);
  const persisted = world.persisted('components');

  assert.deepEqual(
    persisted.entities.map((entity) => entity.id),
    ['dest-1', 'c1'],
    'the destination roster is never reordered and the incoming record is appended'
  );
  assert.deepEqual(
    Object.keys(persisted.defaults).sort(),
    ['c1', 'dest-1'],
    'the defaults layer merged on its own — an object-level merge would have kept only the ' +
      "destination's"
  );
  assert.deepEqual(Object.keys(persisted.membership).sort(), [
    `c1|${summary.system.id}`,
    'dest-1|dest-sys',
  ]);
  assert.deepEqual(
    persisted.defaults['dest-1'],
    { id: 'dest-1', category: 'kept' },
    'and the DESTINATION wins its own id, never re-examined'
  );
});

test('14: the DEFAULTS and MEMBERSHIP destination-wins guards, with a COLLIDING incoming record', async () => {
  // THE ARM THE TEST ABOVE CANNOT CARRY.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'c1', name: 'Destination c1', originItemUuid: 'Item.c1' }],
      defaults: { c1: { id: 'c1', category: 'destination-cat' } },
      membership: {
        [`c1|${SOURCE_SYSTEM_ID}`]: membershipRecord('c1', SOURCE_SYSTEM_ID, {
          inherit: { category: false },
          category: 'destination-member',
        }),
      },
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
    // The destination already runs a system under the payload's own id, so the resolved system id
    // equals it and the incoming membership record lands on the SAME `(entityId, systemId)` key.
    systems: [{ id: SOURCE_SYSTEM_ID, name: 'Source System', components: [] }],
  });

  const { summary } = await runImport(
    world,
    envelope({
      system: {
        components: [
          component('c1', { name: 'Incoming c1', category: 'incoming-cat' }),
          component('c2', { name: 'Incoming c2', category: 'other-cat' }),
        ],
      },
    })
  );
  assert.equal(summary.system.id, SOURCE_SYSTEM_ID, 'the import landed in the destination system');

  const persisted = world.persisted('components');
  assert.equal(
    persisted.defaults.c1.category,
    'destination-cat',
    'a COLLIDING defaults record loses to the destination and is never re-examined'
  );
  assert.equal(
    persisted.membership[`c1|${SOURCE_SYSTEM_ID}`].category,
    'destination-member',
    "a COLLIDING membership record loses to the destination, hand edits and all"
  );

  // The positive half, so neither assertion above can pass because the merge simply did nothing.
  assert.equal(persisted.defaults.c2.category, 'other-cat', 'the NON-colliding default landed');
  assert.ok(
    persisted.membership[`c2|${SOURCE_SYSTEM_ID}`],
    'and so did the non-colliding membership record'
  );
});

test('the merge REPORTS a default and a membership record naming an absent world entity', async () => {
  // `worldEntityMissing` at BOTH emission sites — the defaults leg and the membership leg — each of
  // which survives being disabled on its own.
  const world = await seededEmptyWorld();
  const { summary } = await runImport(
    world,
    envelope({
      system: { components: [component('c1', { category: 'ore' })] },
      componentScope: slice({
        entities: [],
        defaults: [{ id: 'ghost-default', category: 'x' }],
        membership: [membershipRecord('ghost-member', SOURCE_SYSTEM_ID)],
      }),
    })
  );

  assert.deepEqual(
    reported(summary, REFERENCE_KINDS.WORLD_ENTITY_MISSING)
      .map((entry) => entry.referenceValue)
      .sort(),
    ['ghost-default', 'ghost-member'],
    'both the dangling world default and the dangling membership record are reported'
  );
});

test('the merge REPORTS a keep-mode world entity id collision on a disjoint tool', async () => {
  // `reportWorldEntityCollision`'s output reaching the import summary.
  const world = await destinationWorld({
    componentScope: emptySeededScope(),
    essenceScope: emptySeededScope(),
    toolScope: {
      entities: [{ id: 't1', name: 'Destination hammer', registeredItemUuid: 'Item.dest' }],
      defaults: {},
      membership: {},
    },
  });

  const { summary } = await runImport(
    world,
    envelope({
      system: {
        tools: [{ id: 't1', name: 'Source hammer', registeredItemUuid: 'Item.src' }],
      },
    })
  );

  const collisions = reported(summary, REFERENCE_KINDS.WORLD_ENTITY_COLLISION);
  assert.deepEqual(
    collisions.map((entry) => [entry.ownerType, entry.referenceValue]),
    [['tool', 't1']],
    'the colliding tool id is reported against the tool owner type'
  );
});

// Criterion 2 — an already-configured destination is deliberately NOT identity

test('2: the destination wins world identity, and the shipped drift detector SEES it', async () => {
  // The first exercised consumer of a detector the migration ships unused.
  const identity = {
    originItemUuid: 'Item.c1',
    registeredItemUuid: 'Item.c1',
    aliasItemUuids: [],
    img: 'icons/svg/item-bag.svg',
  };
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'c1', name: 'Destination Name', description: '', ...identity }],
      defaults: {},
      membership: {},
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

  const payload = envelope({
    system: {
      components: [{ id: 'c1', name: 'Source Name', description: '', ...identity }],
    },
  });
  const { summary } = await runImport(world, payload);

  const drift = reportWorldIdentityDrift(world.settings.get('craftingSystems'), {
    components: world.persisted('components'),
    essences: world.persisted('essences'),
    tools: world.persisted('tools'),
  });

  // A LITERAL expectation, never one derived from `WORLD_IDENTITY_FIELDS` — both sides would then
  // move together and the assertion would say nothing.
  assert.deepEqual(drift, [
    {
      systemId: summary.system.id,
      entityType: 'components',
      entityId: 'c1',
      field: 'name',
      systemValue: 'Source Name',
      worldValue: 'Destination Name',
    },
  ]);
});

// Criterion 3 — an UNMIGRATED destination is untouched

test('3(a): an import into an UNMIGRATED destination writes none of the three settings', async () => {
  // REDDENS WHEN: the seeding gate is removed.
  const world = await unmigratedWorld();
  await runImport(
    world,
    envelope({
      system: {
        components: [component('c1')],
        essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
        tools: [{ id: 't1', name: 'Hammer', originItemUuid: 'Item.t1' }],
      },
    })
  );

  for (const entityType of ['components', 'essences', 'tools']) {
    assert.equal(world.persisted(entityType), undefined, `${entityType} scope stayed ABSENT`);
    assert.equal(
      world.stores[entityType].isSeeded('entities'),
      false,
      `${entityType} scope is still UNSEEDED, so its Valid Id Basis is still UNKNOWN`
    );
  }
});

test('3(b): a hand-authored slice cannot prune an unmigrated world’s essence quantities', async () => {
  // THE DESTRUCTIVE ARM, aimed at the ONE genuinely pruning basis.
  const world = await unmigratedWorld();
  const payload = envelope({
    system: {
      components: [component('c1', { essences: { ghost: 1 } })],
      essenceDefinitions: [],
    },
    essenceScope: slice({ entities: [{ id: 'fire', name: 'Fire' }] }),
  });

  const { summary } = await runImport(world, payload);
  const persistedSystem = world.settings
    .get('craftingSystems')
    .find((system) => system.id === summary.system.id);

  assert.equal(
    persistedSystem.components[0].essences.ghost,
    1,
    'an unknown basis prunes NOTHING — the quantity survives the first save'
  );
});

// Criterion 12 — the entities merge runs BEFORE createSystem

test('12: the roster merge lands BEFORE the system is created, so no essence quantity is pruned', async () => {
  // A REAL ORDERING TEST rather than a call-order spy, and aimed at the essence basis because that
  // is the only basis that prunes.
  const world = await seededEmptyWorld();
  const payload = envelope({
    system: {
      components: [component('c1', { essences: { fire: 3 } })],
      essenceDefinitions: [],
    },
    essenceScope: slice({
      entities: [{ id: 'fire', name: 'Fire' }],
      membership: [membershipRecord('fire', SOURCE_SYSTEM_ID, { inherit: {} })],
    }),
  });

  const { summary } = await runImport(world, payload);
  const persistedSystem = world.settings
    .get('craftingSystems')
    .find((system) => system.id === summary.system.id);

  assert.equal(
    persistedSystem.components[0].essences.fire,
    3,
    'the world roster the basis needs was already written when the system was created'
  );
});

// Criterion 13 — every written membership record names the DESTINATION system

test('13: every membership record the import writes names the DESTINATION system id', async () => {
  // Three arms: copy mode, keep mode with a matching payload id, and a keep-mode overwrite where
  // the existing system is resolved BY NAME under a different id.
  const payload = () => envelope({ system: { components: [component('c1')] } });

  for (const mode of ['keep', 'copy']) {
    const world = await seededEmptyWorld();
    const { summary } = await runImport(world, payload(), { mode });
    const records = Object.values(world.persisted('components').membership);
    assert.ok(records.length > 0, `${mode}: the import wrote a membership record`);
    for (const record of records) {
      assert.equal(record.systemId, summary.system.id, `${mode}: record names the destination`);
    }
    // Only the two arms whose destination id DIFFERS from the payload's can carry the stronger
    // claim; keep mode into an empty world legitimately creates the system under the payload's own
    // id, so asserting the negation there would fail against correct behaviour.
    if (mode === 'copy') {
      assert.equal(
        records.filter((record) => record.systemId === SOURCE_SYSTEM_ID).length,
        0,
        'copy: ZERO records name the pre-import id'
      );
    }
  }

  // The NAME-resolved overwrite: the destination already holds a system of the same NAME under a
  // different id, so `_findExistingSystem` falls through to the name match and `updateSystem` runs
  // against an id the payload never carried.
  const world = await destinationWorld({
    componentScope: emptySeededScope(),
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
    systems: [{ id: 'dest-sys', name: 'Source System', components: [] }],
  });
  const { summary } = await runImport(world, payload());
  assert.equal(summary.system.id, 'dest-sys', 'the overwrite resolved the system by NAME');
  const overwritten = Object.values(world.persisted('components').membership);
  assert.ok(overwritten.length > 0, 'the overwrite wrote a membership record');
  for (const record of overwritten) {
    assert.equal(record.systemId, 'dest-sys', 'the record follows the RESOLVED id, not the payload');
  }
  assert.equal(
    overwritten.filter((record) => record.systemId === SOURCE_SYSTEM_ID).length,
    0,
    'ZERO records are stranded at the payload id the destination never used'
  );
});

// Criterion 15 — the tool-breakage authority is a PAIR

test('15(a): an incoming world tool-breakage authority is dropped BY THE UPCAST, and reported', async () => {
  // ASSERTED ON THE UPCAST'S OWN OUTPUT, not only on the import summary, because the export
  // assembler is not on a hand-edited payload's path at all and `readScopePayload` PRESERVES the
  // key through its extras spread.
  const payload = envelope({
    system: { components: [component('c1')], tools: [{ id: 't1', name: 'Hammer' }] },
    toolScope: { ...slice(), toolBreakage: { authority: 'checkDriven' } },
  });

  const migrated = migrateExportPayload(payload);
  assert.deepEqual(
    Object.keys(migrated.toolScope).sort(),
    ['defaults', 'entities', 'membership'],
    'the upcast emits the three sub-keys and nothing else'
  );

  const world = await seededEmptyWorld();
  const { summary } = await runImport(world, payload);
  const dropped = reported(summary, REFERENCE_KINDS.WORLD_TOOL_BREAKAGE_DROPPED);
  assert.equal(dropped.length, 1, 'the drop is reported rather than silent');
  assert.equal(dropped[0].ownerType, 'unknown', 'the one ownerless entry takes the shipped type');
  assert.equal(dropped[0].referenceValue, 'checkDriven');
});

test('15(b): the DESTINATION’s own tool-breakage authority survives the merge verbatim', async () => {
  // REDDENS WHEN: the merge base is built as `{ entities, defaults, membership }` instead of
  // `store.get()`.
  const world = await destinationWorld({
    componentScope: emptySeededScope(),
    essenceScope: emptySeededScope(),
    toolScope: { ...emptySeededScope(), toolBreakage: { authority: 'checkDriven' } },
  });

  await runImport(
    world,
    envelope({ system: { tools: [{ id: 't1', name: 'Hammer', originItemUuid: 'Item.t1' }] } })
  );

  assert.deepEqual(
    world.persisted('tools').toolBreakage,
    { authority: 'checkDriven' },
    'an import that merges records must not erase an authority a destination GM authored'
  );
});

// Criteria 9, 17, 18, 19 — copy mode's match-or-mint rule

/**
 * The six-spelling fixture. Each linked component carries EXACTLY ONE source spelling and no modern
 * one, because the point is that the match runs on the MIGRATION's six-spelling rule rather than
 * the narrower three-field one.
 */
function sixSpellingSystem() {
  return {
    components: [
      { id: 'modern-origin', name: 'Modern origin', originItemUuid: 'Item.m1' },
      { id: 'modern-registered', name: 'Modern registered', registeredItemUuid: 'Item.m2' },
      { id: 'modern-alias', name: 'Modern alias', aliasItemUuids: ['Item.m3'] },
      { id: 'legacy-source-uuid', name: 'Legacy sourceUuid', sourceUuid: 'Item.l1' },
      { id: 'legacy-source-item', name: 'Legacy sourceItemUuid', sourceItemUuid: 'Item.l2' },
      { id: 'legacy-fallback', name: 'Legacy fallbackItemIds', fallbackItemIds: ['Item.l3'] },
      { id: 'unlinked-a', name: 'Unlinked A' },
      { id: 'unlinked-b', name: 'Unlinked B' },
    ],
  };
}

const LINKED_IDS = [
  'modern-origin',
  'modern-registered',
  'modern-alias',
  'legacy-source-uuid',
  'legacy-source-item',
  'legacy-fallback',
];

test('9 + 17: a second copy binds every LINKED component and mints only the unlinked ones', async () => {
  // THE SEEDING QUALIFIER IS REQUIRED.
  const world = await seededEmptyWorld();
  const origin = () => envelope({ system: sixSpellingSystem() });

  const first = await runImport(world, origin(), { mode: 'copy' });
  const firstRoster = world.persisted('components').entities;
  assert.equal(firstRoster.length, 8, 'the first copy mints a world entity per component');

  const second = await runImport(world, origin(), { mode: 'copy' });
  const secondRoster = world.persisted('components').entities;

  const idOf = (packData, sourceId) => {
    const index = sixSpellingSystem().components.findIndex((entry) => entry.id === sourceId);
    return packData.system.components[index].id;
  };
  for (const sourceId of LINKED_IDS) {
    assert.equal(
      idOf(second.packData, sourceId),
      idOf(first.packData, sourceId),
      `${sourceId} is LINKED, so the second copy binds to the world entity the first minted`
    );
  }
  for (const sourceId of ['unlinked-a', 'unlinked-b']) {
    assert.notEqual(
      idOf(second.packData, sourceId),
      idOf(first.packData, sourceId),
      `${sourceId} is UNLINKED, so it mints a disjoint id on every import`
    );
  }

  // CRITERION 17 — a MATCHED entity adds no world entity, and its incoming roster record does not
  // survive; the roster grows by exactly one per UNMATCHED component.
  assert.equal(secondRoster.length, 10, 'the roster grew by exactly one per unlinked component');

  const rosterIds = new Set(secondRoster.map((entity) => entity.id));
  for (const sourceId of sixSpellingSystem().components.map((entry) => entry.id)) {
    assert.ok(!rosterIds.has(sourceId), `no merged world entity carries the pre-import id`);
  }
  for (const record of Object.values(world.persisted('components').membership)) {
    assert.ok(
      rosterIds.has(record.entityId),
      `every membership record names an entity IN the merged roster: ${record.entityId}`
    );
  }
});

test('18: after a copy import, no defaults or membership record holds a pre-import id', async () => {
  // The reference positions are exactly what the shared walk visits for a SECTION-SHAPED record,
  // and the four option-level fields are named INDIVIDUALLY because "options[] with its recursive
  // alternatives" omits three of them and an assertion written from that phrase would miss them.
  const world = await seededEmptyWorld();
  const payload = envelope({
    system: {
      components: [component('c1'), component('c2')],
      essenceDefinitions: [{ id: 'fire', name: 'Fire', sourceComponentId: 'c1' }],
      tools: [
        {
          id: 't1',
          name: 'Hammer',
          originItemUuid: 'Item.t1',
          breakage: { mode: 'never' },
          onBreak: {
            replacementComponentId: 'c1',
            replacementTarget: { type: 'component', componentId: 'c2' },
          },
          repairRequirements: [
            {
              id: 'g1',
              options: [
                {
                  componentId: 'c1',
                  systemItemId: 'c2',
                  match: { componentId: 'c1', systemItemId: 'c2' },
                  alternatives: [{ componentId: 'c2', match: { componentId: 'c1' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  const { packData } = await runImport(world, payload, { mode: 'copy' });
  const preImport = new Set(['c1', 'c2']);

  const walk = (node, path, seen) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`, seen));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && preImport.has(value)) seen.push(`${path}.${key}=${value}`);
      else walk(value, `${path}.${key}`, seen);
    }
  };

  const stale = [];
  for (const entityType of ['components', 'essences', 'tools']) {
    const key = { components: 'componentScope', essences: 'essenceScope', tools: 'toolScope' }[
      entityType
    ];
    walk(packData[key].defaults, `${key}.defaults`, stale);
    walk(packData[key].membership, `${key}.membership`, stale);
  }
  assert.deepEqual(stale, [], 'no slice record holds a pre-import component id anywhere');

  // The positive half: the records DO still carry the references, re-keyed rather than blanked, so
  // an empty walk cannot pass for the wrong reason.
  const essenceDefault = packData.essenceScope.defaults.find((record) => record.id === 'fire');
  assert.ok(
    essenceDefault?.effectSource?.sourceComponentId,
    'the essence world DEFAULT still names a component — this is the record the shipped ' +
      'migration does not walk'
  );
  const mergedIds = new Set(world.persisted('components').entities.map((entity) => entity.id));
  assert.ok(mergedIds.has(essenceDefault.effectSource.sourceComponentId), 'and it resolves');

  const toolDefault = packData.toolScope.defaults.find((record) => record.id === 't1');
  const option = toolDefault.repairRequirements[0].options[0];
  for (const value of [
    option.componentId,
    option.systemItemId,
    option.match.componentId,
    option.match.systemItemId,
    option.alternatives[0].componentId,
    option.alternatives[0].match.componentId,
  ]) {
    assert.ok(mergedIds.has(value), `every option-level field resolves after the re-key: ${value}`);
  }
});

test('19: a multi-match binds to the largest intersection, reports the losers, and is stable', async () => {
  // REDDENS WHEN: the tie-break is removed or made order-dependent on an unsorted roster iteration
  // — the two-run determinism assertion fails; or when the ambiguous case MINTS instead, so the
  // destination acquires a third entity for one item.
  const world = await destinationWorld({
    componentScope: {
      entities: [
        { id: 'dest-narrow', name: 'Narrow', aliasItemUuids: ['Item.x'] },
        { id: 'dest-wide', name: 'Wide', aliasItemUuids: ['Item.x', 'Item.y'] },
      ],
      defaults: {},
      membership: {},
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

  const payload = () =>
    envelope({
      system: {
        components: [
          { id: 'incoming', name: 'Incoming', originItemUuid: 'Item.x', aliasItemUuids: ['Item.y'] },
        ],
      },
    });

  const index = world.worldEntityIndex();
  const first = prepareForImport(payload(), 'copy', { worldEntityIndex: index });
  const second = prepareForImport(payload(), 'copy', { worldEntityIndex: index });

  assert.equal(
    first.system.components[0].id,
    'dest-wide',
    'the LARGEST intersection wins — two shared references beat one'
  );
  assert.equal(
    second.system.components[0].id,
    first.system.components[0].id,
    'two runs of the same import choose the SAME candidate'
  );

  const ambiguity = first.worldScopeReferences.filter(
    (entry) => entry.kind === REFERENCE_KINDS.WORLD_ENTITY_COLLISION
  );
  assert.deepEqual(
    ambiguity.map((entry) => entry.referenceValue),
    ['dest-narrow'],
    'the ambiguity is reported naming the LOSING candidate'
  );

  // The tie-break itself: equal intersections resolve by ROSTER POSITION, first wins.
  const tied = prepareForImport(
    envelope({
      system: { components: [{ id: 'incoming', name: 'Incoming', originItemUuid: 'Item.x' }] },
    }),
    'copy',
    { worldEntityIndex: index }
  );
  assert.equal(tied.system.components[0].id, 'dest-narrow', 'a tie resolves to roster position');
});

test('19: a LOSING candidate is reported even when another record has already claimed it', () => {
  // THE BRANCH NEITHER NEIGHBOUR REACHES. Test 19 above exercises `beaten` with an EMPTY `claimed`
  // and criterion 9a's `beaten` is always empty, so before this fixture the false path never ran in
  // either direction.
  const worldEntityIndex = {
    components: [
      { id: 'dest-ay', name: 'Destination ay', registeredItemUuid: 'Item.ay' },
      { id: 'dest-bee', name: 'Destination bee', registeredItemUuid: 'Item.bee' },
    ],
    essences: [],
    tools: [],
  };
  const packData = prepareForImport(
    envelope({
      system: {
        components: [
          // Bound FIRST, and it has exactly ONE candidate — so it claims `dest-bee` silently.
          { id: 'sole-bee', name: 'Sole bee', registeredItemUuid: 'Item.bee' },
          // Bound SECOND, and it matches BOTH: `dest-ay`, which wins a size tie on roster
          // position, and `dest-bee`, which `sole-bee` has just taken.
          {
            id: 'first-bee',
            name: 'First bee',
            registeredItemUuid: 'Item.ay',
            aliasItemUuids: ['Item.bee'],
          },
        ],
      },
    }),
    'copy',
    { worldEntityIndex }
  );

  const boundIds = Object.fromEntries(
    ['Sole bee', 'First bee'].map((name) => [
      name,
      packData.system.components.find((entry) => entry.name === name).id,
    ])
  );
  assert.deepEqual(
    boundIds,
    { 'Sole bee': 'dest-bee', 'First bee': 'dest-ay' },
    'the precondition: `dest-bee` really is CLAIMED by the time the second record is bound'
  );

  assert.deepEqual(
    packData.worldScopeReferences
      .filter((entry) => entry.kind === REFERENCE_KINDS.WORLD_ENTITY_COLLISION)
      .map((entry) => [entry.ownerId, entry.referenceValue]),
    [['first-bee', 'dest-bee']],
    'the losing candidate is reported against the record whose references named it, once'
  );
});

test('19: a NON-intersecting destination entity is not a candidate at all', () => {
  // THE ZERO-INTERSECTION FLOOR, and it is now the SOLE guard rather than one of two. The roster
  // must be NON-EMPTY, and that is the whole trick: an empty roster mints whatever the floor does,
  // so it would pass either way.
  const packData = prepareForImport(
    envelope({
      system: {
        components: [{ id: 'c1', name: 'Silver bar', registeredItemUuid: 'Item.silver' }],
      },
    }),
    'copy',
    {
      worldEntityIndex: {
        components: [{ id: 'D1', name: 'Iron bar', registeredItemUuid: 'Item.iron' }],
        essences: [],
        tools: [],
      },
    }
  );

  const boundId = packData.system.components[0].id;
  assert.notEqual(boundId, 'D1', 'a component sharing NO reference with the roster MINTS');
  assert.deepEqual(
    packData.componentScope.entities.map((entity) => entity.id),
    [boundId],
    'and its own world entity record SURVIVES, under the minted id — a false match would have ' +
      'dropped it as already held by the destination'
  );
});

// Criterion 9a — the copy-mode binding is INJECTIVE, through the ID-CLAIM LADDER

/**
 * A destination scope built by the SHIPPED `1.30.0` migration over an ordinary two-system corpus,
 * NOT by hand — which is the whole point of the fixture.
 *
 * @returns {object} the persisted `componentScope` value.
 */
function widenedDestinationScope() {
  const systems = [
    {
      id: 'world-a',
      name: 'World A',
      components: [
        {
          id: 'W9',
          name: 'Iron ingot',
          registeredItemUuid: 'Item.iron',
          aliasItemUuids: ['Item.bar'],
        },
      ],
      essenceDefinitions: [],
      tools: [],
    },
    {
      id: 'world-b',
      name: 'World B',
      components: [
        {
          id: 'B1',
          name: 'Steel ingot',
          registeredItemUuid: 'Item.steel',
          aliasItemUuids: ['Item.bar'],
        },
      ],
      essenceDefinitions: [],
      tools: [],
    },
  ];
  assert.deepEqual(
    buildWorldScopeGrouping(systems).refusals,
    [],
    'the destination corpus is ACCEPTED WHOLE — it is an ordinary corpus, not a refusal case'
  );
  const migrated = migrateWorldScopeEntities({ systems, recipes: [], gatheringConfig: {} });
  return migrated.componentScope;
}

/** Two incoming components that share NOTHING with each other, plus a recipe that names both. */
function disjointPairPayload() {
  return {
    ...envelope({
      system: {
        components: [
          { id: 'c1', name: 'Iron ingot', registeredItemUuid: 'Item.iron' },
          { id: 'c2', name: 'Steel ingot', registeredItemUuid: 'Item.steel' },
        ],
      },
    }),
    recipes: [
      {
        id: 'r1',
        name: 'Alloy',
        craftingSystemId: SOURCE_SYSTEM_ID,
        ingredientSets: [
          {
            id: 'set-1',
            ingredientGroups: [
              { id: 'g1', options: [{ id: 'o1', componentId: 'c1', quantity: 1 }] },
              { id: 'g2', options: [{ id: 'o2', componentId: 'c2', quantity: 1 }] },
            ],
          },
        ],
      },
    ],
  };
}

test('9a: two incoming components intersecting ONE destination entity keep TWO ids', async () => {
  // THE BINDING MUST BE INJECTIVE.
  const scope = widenedDestinationScope();
  assert.equal(scope.entities.length, 1, 'the two source systems produced ONE world entity');
  const contestedId = scope.entities[0].id;

  const world = await destinationWorld({
    componentScope: scope,
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

  const first = await runImport(world, disjointPairPayload(), { mode: 'copy' });
  const boundIds = first.packData.system.components.map((entry) => entry.id);

  // (i) The two components keep two DISTINCT ids.
  assert.equal(new Set(boundIds).size, 2, 'the two incoming components hold two DISTINCT ids');
  assert.ok(boundIds.includes(contestedId), 'and one of them is the destination entity they share');

  // (ii) The recipe's two ingredient groups still name two DIFFERENT components.
  const groups = first.packData.recipes[0].ingredientSets[0].ingredientGroups;
  assert.equal(
    new Set(groups.map((group) => group.options[0].componentId)).size,
    2,
    'the recipe still distinguishes its two ingredient groups'
  );

  // (iii) The read union over the MERGED destination answers TWO records, not one.
  const union = resolveComponentScope(
    world.stores.components.corpus(),
    first.summary.system.id,
    first.packData.system.components
  );
  assert.equal(union.length, 2, 'the merged destination resolves TWO components for this system');

  // (iv) The contention is REPORTED, naming the contested destination id and BOTH owners.
  const contended = reported(first.summary, REFERENCE_KINDS.WORLD_ENTITY_COLLISION).filter(
    (entry) => entry.referenceValue === contestedId
  );
  assert.deepEqual(
    [...new Set(contended.map((entry) => entry.ownerId))].sort(),
    ['c1', 'c2'],
    'the contested destination id is reported against BOTH incoming records'
  );

  // (v) A re-run adds ZERO further world entities — the record that minted last time binds to the
  // entity it minted, which is what the middle rung buys and an immediate mint does not.
  const rosterAfterFirst = world.persisted('components').entities.map((entity) => entity.id);
  assert.equal(rosterAfterFirst.length, 2, 'the first copy minted exactly one entity');
  await runImport(world, disjointPairPayload(), { mode: 'copy' });
  assert.deepEqual(
    world.persisted('components').entities.map((entity) => entity.id),
    rosterAfterFirst,
    're-running the same copy import adds NO further world entity'
  );

  // (vi) Reversing the destination roster does not change the map.
  const naturalIndex = world.worldEntityIndex();
  const reversedIndex = {
    ...naturalIndex,
    components: [...naturalIndex.components].reverse(),
  };
  const natural = prepareForImport(disjointPairPayload(), 'copy', {
    worldEntityIndex: naturalIndex,
  });
  const reversed = prepareForImport(disjointPairPayload(), 'copy', {
    worldEntityIndex: reversedIndex,
  });
  assert.deepEqual(
    natural.system.components.map((entry) => entry.id).sort(),
    [...rosterAfterFirst].sort(),
    'both records bind to the merged roster rather than minting'
  );
  assert.deepEqual(
    reversed.system.components.map((entry) => entry.id),
    natural.system.components.map((entry) => entry.id),
    'reversing the destination roster does not change the map'
  );
});

// Criterion 10 — copy mode without an index FAILS rather than minting

test('10: a copy-mode call with no worldEntityIndex throws, and the throw is the GUARD’S OWN', async () => {
  // REDDENS WHEN: the explicit guard is deleted — either nothing throws, or a destructuring
  // `TypeError` throws whose message does not match, which a BARE `assert.throws` would have
  // accepted.
  const payload = () => envelope({ system: { components: [component('c1')] } });

  assert.throws(() => prepareForImport(payload(), 'copy'), /worldEntityIndex/);
  assert.throws(() => prepareForImport(payload(), 'copy', undefined), /worldEntityIndex/);
  assert.throws(() => prepareForImport(payload(), 'copy', null), /worldEntityIndex/);
  assert.throws(() => prepareForImport(payload(), 'copy', {}), /worldEntityIndex/);

  // KEEP mode does not need one — it never re-keys anything, so there is nothing to bind.
  assert.ok(prepareForImport(payload(), 'keep'), 'keep mode is unaffected');
});

// Criterion 11 — both import call sites, in source AND in behaviour

test('11: the index the call sites build has CONTENTS, and the contents are what bind', async () => {
  // THE BEHAVIOURAL ARM, and it exists because the source regexes above are satisfied by `{}`.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'dest-1', name: 'Held', registeredItemUuid: 'Item.held' }],
      defaults: {},
      membership: {},
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });
  const payload = () =>
    envelope({
      system: {
        components: [{ id: 'incoming', name: 'Incoming', originItemUuid: 'Item.held' }],
      },
    });

  const index = world.worldEntityIndex();
  assert.deepEqual(
    index.components.map((entity) => entity.id),
    ['dest-1'],
    'the index the call sites build carries the destination roster'
  );
  const bound = prepareForImport(payload(), 'copy', { worldEntityIndex: index });
  assert.equal(bound.system.components[0].id, 'dest-1', 'a linked component BINDS to it');

  const minted = prepareForImport(payload(), 'copy', {
    worldEntityIndex: { components: [], essences: [], tools: [] },
  });
  assert.notEqual(minted.system.components[0].id, 'dest-1', 'an EMPTY index mints instead');
});

/** What each import call site hands the shared importer, captured instead of imported. */
async function captureImport(run) {
  const { importFromPackData } = CompendiumImporter.prototype;
  const captured = [];
  CompendiumImporter.prototype.importFromPackData = async function capture(packData) {
    captured.push({ packData, seams: this._scopeStoreSeams });
    return null;
  };
  try {
    await run();
  } finally {
    CompendiumImporter.prototype.importFromPackData = importFromPackData;
  }
  return captured;
}

/** A seeded scope holding one world entity. */
const heldScope = (entity) => ({ entities: [entity], defaults: {}, membership: {} });

/**
 * The destination the two call sites read, and a file carrying one component linked into it plus an
 * essence and a tool that collide with its world entities by id, each on distinct refs.
 */
async function linkedImport() {
  const world = await destinationWorld({
    componentScope: heldScope({ id: 'dest-1', name: 'Held', registeredItemUuid: 'Item.held' }),
    essenceScope: heldScope({ id: 'e1', name: 'Held essence', sourceItemUuid: 'Item.dest-e' }),
    toolScope: heldScope({ id: 't1', name: 'Held tool', registeredItemUuid: 'Item.dest-t' }),
  });
  const text = JSON.stringify(
    envelope({
      system: {
        components: [{ id: 'incoming', name: 'Incoming', originItemUuid: 'Item.held' }],
        essenceDefinitions: [{ id: 'e1', name: 'Essence', sourceItemUuid: 'Item.src-e' }],
        tools: [{ id: 't1', name: 'Tool', registeredItemUuid: 'Item.src-t' }],
      },
    })
  );
  const accessors = {
    getComponentScopeStore: () => world.stores.components,
    getEssenceScopeStore: () => world.stores.essences,
    getToolScopeStore: () => world.stores.tools,
  };
  return { world, text, accessors };
}

test('11: both import call sites bind against the destination index their accessors build', async () => {
  // `prepareForImport` DEFAULTS its options, so a call site that drops the index mints instead.
  const { world, text, accessors } = await linkedImport();
  const published = await captureImport(async () => {
    bindFabricateGlobal({ ...accessors, compendiumImporter: world.importer }, {});
    await globalThis.game.fabricate.importSystemFromFile(text, { copyMode: true });
  });

  globalThis.game.fabricate = {
    ...accessors,
    getCraftingSystemManager: () => world.systemManager,
    getRecipeManager: () => world.recipeManager,
    getGatheringEnvironmentStore: () => null,
  };
  globalThis.foundry.applications = {
    api: { DialogV2: { prompt: async () => ({ file: { text: async () => text }, conflictMode: 'copy' }) } },
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error: (message) => assert.fail(message) } };
  const manager = await captureImport(() =>
    createManagerServices({ adminStore: () => ({ refresh: async () => {} }) }).renderSystemImportDialog()
  );

  // Each leg against its OWN store: the ids are disjoint across kinds, so a dropped or cross-wired
  // essence or tool leg loses its collision entry.
  for (const [site, [{ packData }]] of [['the public API', published], ['the Manager', manager]]) {
    assert.deepEqual(
      packData.system.components.map((entry) => entry.id),
      ['dest-1'],
      `${site} binds the linked component to the destination entity`
    );
    assert.deepEqual(
      packData.worldScopeReferences
        .filter((entry) => entry.kind === REFERENCE_KINDS.WORLD_ENTITY_COLLISION)
        .map((entry) => [entry.ownerType, entry.referenceValue]),
      [
        ['essence', 'e1'],
        ['tool', 't1'],
      ],
      `${site} reports the essence and the tool colliding with the destination by id`
    );
  }
  // THE MERGE'S ONLY PRODUCTION WIRING, and it fails CLOSED: an absent seam SKIPS the merge and
  // reports nothing. The composition root's lazy seams are the boot contract's `importerSeams`.
  assert.deepEqual(manager[0].seams, {
    components: world.stores.components,
    essences: world.stores.essences,
    tools: world.stores.tools,
  });
});

test('11: an importer WITHOUT the scope seams merges nothing, and the seamed one merges', async () => {
  // THE BEHAVIOURAL ARM, and it exists because the source contract above is satisfied by a seam
  // wired to something inert.
  const world = await seededEmptyWorld();
  const payload = () => envelope({ system: { components: [component('c1')] } });
  const prepare = () =>
    prepareForImport(payload(), 'keep', { worldEntityIndex: world.worldEntityIndex() });

  const unseamed = new CompendiumImporter(world.systemManager, world.recipeManager, {
    getSetting: world.getSetting,
    setSetting: world.setSetting,
    isGM: () => true,
    reportProgress: () => {},
  });
  const priorFabricate = globalThis.game.fabricate;
  globalThis.game.fabricate = {
    ...priorFabricate,
    getComponentScopeStore: () => world.stores.components,
    getEssenceScopeStore: () => world.stores.essences,
    getToolScopeStore: () => world.stores.tools,
  };
  try {
    await unseamed.importFromPackData(prepare(), { overwriteExisting: true });
  } finally {
    globalThis.game.fabricate = priorFabricate;
  }
  assert.deepEqual(
    world.persisted('components').entities,
    [],
    'no seam, no merge — the importer fails CLOSED and never reaches around its caller for a store'
  );

  await world.importer.importFromPackData(prepare(), { overwriteExisting: true });
  assert.deepEqual(
    world.persisted('components').entities.map((entity) => entity.id),
    ['c1'],
    'and the SAME import through the seamed importer lands the world entity'
  );
});

test('11: the SHIPPED delegator is fail-closed on an unassigned field and resolves LATE', async () => {
  // THE SHAPE PRODUCTION ACTUALLY WIRES, now that both call sites always hand over a seam object.
  const world = await seededEmptyWorld();
  const payload = () => envelope({ system: { components: [component('c1')] } });
  const prepare = () =>
    prepareForImport(payload(), 'keep', { worldEntityIndex: world.worldEntityIndex() });

  // An owner that has not reached its store construction yet — exactly the state a seam captured
  // eagerly at the top of a long `initialize()` would freeze forever.
  const owner = { componentScopeStore: null, essenceScopeStore: null, toolScopeStore: null };
  const importer = new CompendiumImporter(world.systemManager, world.recipeManager, {
    getSetting: world.getSetting,
    setSetting: world.setSetting,
    isGM: () => true,
    reportProgress: () => {},
    componentScopeStore: scopeStoreDelegate(() => owner.componentScopeStore),
    essenceScopeStore: scopeStoreDelegate(() => owner.essenceScopeStore),
    toolScopeStore: scopeStoreDelegate(() => owner.toolScopeStore),
  });

  await importer.importFromPackData(prepare(), { overwriteExisting: true });
  assert.deepEqual(
    world.persisted('components').entities,
    [],
    'an unassigned field is indistinguishable from an unmigrated world — the merge is SKIPPED'
  );

  // The other half, and the reason a delegator is worth having at all: the SAME seam merges once
  // the owner assigns the field. A seam that resolved once at construction would still be empty.
  owner.componentScopeStore = world.stores.components;
  await importer.importFromPackData(prepare(), { overwriteExisting: true });
  assert.deepEqual(
    world.persisted('components').entities.map((entity) => entity.id),
    ['c1'],
    'and the same seam merges once the field is assigned, because it resolves on every call'
  );
});

// Criterion 16 — the destination re-check of a carried world default

/** A tool default fixture whose sections are authored one at a time by each arm. */
function toolDefault(sections) {
  return { id: 't1', ...sections };
}

test('16(a): an essence default naming a component the MERGED roster lacks is declined', async () => {
  // REDDENS WHEN: the addressability check is bound to the SOURCE roster — the incoming slice's own
  // `entities` alone — instead of the merged destination roster.
  const world = await seededEmptyWorld();
  const { summary } = await runImport(
    world,
    envelope({
      system: { essenceDefinitions: [{ id: 'fire', name: 'Fire' }] },
      essenceScope: slice({
        entities: [{ id: 'fire', name: 'Fire' }],
        defaults: [{ id: 'fire', effectSource: { sourceComponentId: 'absent-component' } }],
        membership: [membershipRecord('fire', SOURCE_SYSTEM_ID, { inherit: {} })],
      }),
    })
  );

  const persisted = world.persisted('essences');
  assert.equal(persisted.defaults.fire, undefined, 'the record was left id-only and NOT written');
  assert.deepEqual(
    persisted.entities.map((entity) => entity.id),
    ['fire'],
    'while the world ENTITY still lands — decline is per section, never per entity'
  );
  assert.equal(
    Object.keys(persisted.membership).length,
    1,
    'and so does its membership record — nothing about membership is withheld'
  );
  assert.deepEqual(
    reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).map((e) => e.referenceValue),
    ['absent-component'],
    'the decline is REPORTED, naming the offending reference'
  );
});

test('16(a) positive: a component the DESTINATION holds is addressable, so the section LANDS', async () => {
  // THE DISCRIMINATING ARM, and without it the negative arm above is green under the very mutation
  // it names: a component absent from the destination AND from the incoming slice is declined
  // either way, so that fixture cannot tell the MERGED roster from the incoming one.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'held-by-destination', name: 'Held' }],
      defaults: {},
      membership: {},
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

  const { summary } = await runImport(
    world,
    envelope({
      system: { essenceDefinitions: [{ id: 'fire', name: 'Fire' }] },
      essenceScope: slice({
        entities: [{ id: 'fire', name: 'Fire' }],
        defaults: [{ id: 'fire', effectSource: { sourceComponentId: 'held-by-destination' } }],
        membership: [membershipRecord('fire', SOURCE_SYSTEM_ID, { inherit: {} })],
      }),
    })
  );

  assert.deepEqual(
    world.persisted('essences').defaults.fire,
    { id: 'fire', effectSource: { sourceComponentId: 'held-by-destination' } },
    'the merged roster is the destination UNION the incoming slice, so this reference resolves'
  );
  assert.equal(reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).length, 0);
});

test('16(b): a tool default whose onBreak replacement names an absent component is declined', async () => {
  const world = await seededEmptyWorld();
  const { summary } = await runImport(
    world,
    envelope({
      system: { tools: [{ id: 't1', name: 'Hammer', originItemUuid: 'Item.t1' }] },
      toolScope: slice({
        entities: [{ id: 't1', name: 'Hammer' }],
        defaults: [
          toolDefault({
            onBreak: { replacementTarget: { type: 'component', componentId: 'absent-component' } },
          }),
        ],
        membership: [
          membershipRecord('t1', SOURCE_SYSTEM_ID, {
            inherit: { onBreak: false },
            onBreak: { replacementTarget: { type: 'component', componentId: 'absent-component' } },
          }),
        ],
      }),
    })
  );

  assert.equal(world.persisted('tools').defaults.t1, undefined, 'the section was declined');
  assert.equal(reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).length, 1);
});

test('16(c): a repairRequirements group a merged member system does not hold is declined', async () => {
  // The destination holds component `c1` and a system `dest-sys` that is a member of the TOOL but
  // NOT of `c1`, so the seeded repair recipe would name an ingredient that system does not have.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'c1', name: 'Component c1' }],
      defaults: {},
      membership: {},
    },
    essenceScope: emptySeededScope(),
    toolScope: {
      entities: [{ id: 't1', name: 'Hammer' }],
      defaults: {},
      membership: {
        't1|dest-sys': membershipRecord('t1', 'dest-sys', { inherit: { breakage: false } }),
      },
    },
  });

  const { summary } = await runImport(
    world,
    envelope({
      system: { tools: [{ id: 't1', name: 'Hammer' }] },
      toolScope: slice({
        entities: [{ id: 't1', name: 'Hammer' }],
        defaults: [
          toolDefault({ repairRequirements: [{ id: 'g1', options: [{ componentId: 'c1' }] }] }),
        ],
        membership: [membershipRecord('t1', SOURCE_SYSTEM_ID, { inherit: {} })],
      }),
    })
  );

  assert.equal(world.persisted('tools').defaults.t1, undefined, 'the group was declined');
  assert.deepEqual(
    reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).map((e) => e.referenceValue),
    ['c1'],
    'naming the component the merged member system does not hold'
  );
});

test('16(d): a category default is declined when an INCOMING membership record carries none', async () => {
  // THE VACUITY ARM, and the incoming-record wording is the whole point of it.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'c1', name: 'Component c1' }],
      defaults: {},
      membership: {
        'c1|dest-sys': membershipRecord('c1', 'dest-sys', {
          inherit: { category: false },
          category: 'held',
        }),
      },
    },
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

  const { summary } = await runImport(
    world,
    envelope({
      system: { components: [component('c1')] },
      componentScope: slice({
        entities: [{ id: 'c1', name: 'Component c1' }],
        defaults: [{ id: 'c1', category: 'ore' }],
        // NO `category` key: this member authored none, so a world default would silently give it
        // one on the first resolve.
        membership: [membershipRecord('c1', SOURCE_SYSTEM_ID, { inherit: { category: false } })],
      }),
    })
  );

  assert.equal(
    world.persisted('components').defaults.c1,
    undefined,
    'every DESTINATION record carries a category, so a persisted-only reading would have written it'
  );
  assert.equal(reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).length, 1);
});

test('16(e): the incoming records count as ONE SYNTHETIC system, never under the payload’s id', async () => {
  // THE MIS-GROUPING ARM. The destination already holds a system whose id EQUALS the payload's, and
  // that system is a member of both the tool and the component — while the system the import
  // actually lands in (resolved BY NAME) is a member of neither.
  const world = await destinationWorld({
    componentScope: {
      entities: [{ id: 'c1', name: 'Component c1' }],
      defaults: {},
      membership: {
        [`c1|${SOURCE_SYSTEM_ID}`]: membershipRecord('c1', SOURCE_SYSTEM_ID, { inherit: {} }),
      },
    },
    essenceScope: emptySeededScope(),
    toolScope: {
      entities: [{ id: 't1', name: 'Hammer' }],
      defaults: {},
      membership: {
        [`t1|${SOURCE_SYSTEM_ID}`]: membershipRecord('t1', SOURCE_SYSTEM_ID, { inherit: {} }),
      },
    },
    systems: [{ id: 'dest-sys', name: 'Source System', components: [] }],
  });

  const { summary } = await runImport(
    world,
    envelope({
      system: { tools: [{ id: 't1', name: 'Hammer' }] },
      toolScope: slice({
        entities: [{ id: 't1', name: 'Hammer' }],
        defaults: [
          toolDefault({ repairRequirements: [{ id: 'g1', options: [{ componentId: 'c1' }] }] }),
        ],
        membership: [membershipRecord('t1', SOURCE_SYSTEM_ID, { inherit: {} })],
      }),
    })
  );

  assert.equal(summary.system.id, 'dest-sys', 'the import resolved its system BY NAME');
  assert.equal(
    world.persisted('tools').defaults.t1,
    undefined,
    'the incoming member is its own system, and it does not hold c1 — so the group is declined'
  );
  assert.equal(reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).length, 1);
});

test('16(f): with the component scope UNSEEDED, a component-referencing section is declined', async () => {
  // THE UNDECIDABLE-ROSTER ARM. The seeding gate is per entity type, so `toolScope` can be seeded
  // while `componentScope` is not — reachable through a torn migration.
  const world = await destinationWorld({
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });
  assert.equal(world.stores.components.isSeeded('entities'), false, 'the component scope is UNSEEDED');

  const { summary } = await runImport(
    world,
    envelope({
      system: { tools: [{ id: 't1', name: 'Hammer' }, { id: 't2', name: 'Anvil' }] },
      toolScope: slice({
        entities: [
          { id: 't1', name: 'Hammer' },
          { id: 't2', name: 'Anvil' },
        ],
        defaults: [
          toolDefault({ repairRequirements: [{ id: 'g1', options: [{ componentId: 'c1' }] }] }),
          { id: 't2', breakage: { mode: 'never' } },
        ],
        membership: [
          membershipRecord('t1', SOURCE_SYSTEM_ID, { inherit: {} }),
          membershipRecord('t2', SOURCE_SYSTEM_ID, {
            inherit: { breakage: false },
            breakage: { mode: 'never' },
          }),
        ],
      }),
    })
  );

  const persisted = world.persisted('tools');
  assert.equal(persisted.defaults.t1, undefined, 'the repair group is undecidable, so declined');
  assert.deepEqual(
    persisted.defaults.t2,
    { id: 't2', breakage: { mode: 'never' } },
    'while a section carrying NO component reference is unaffected'
  );
  assert.equal(reported(summary, REFERENCE_KINDS.WORLD_DEFAULT_DECLINED).length, 1);
});

// Validation — a malformed slice is an ERROR, never a silent drop

test('validation: a malformed slice is an ERROR, checked against the RAW payload', () => {
  // CHECKED AGAINST THE RAW PAYLOAD, not the migrated one, and that is not stylistic: the upcast
  // REPLACES a slice it cannot read with a freshly derived one, so a check on the migrated payload
  // would never fire.
  const arrayShaped = validateImportData(
    envelope({ system: { components: [component('c1')] }, componentScope: [] })
  );
  assert.equal(arrayShaped.valid, false);
  assert.ok(arrayShaped.errors.some((error) => error.includes('componentScope')));

  const scalarSubKey = validateImportData({
    ...envelope({ system: { components: [component('c1')] } }),
    toolScope: { entities: 'nope' },
  });
  assert.equal(scalarSubKey.valid, false);
  assert.ok(scalarSubKey.errors.some((error) => error.includes('toolScope.entities')));

  // BOTH shapes are valid, because requirement 13 makes the map and the array normative alike.
  for (const membership of [[], {}]) {
    const wellShaped = validateImportData(
      envelope({
        system: { components: [component('c1')] },
        componentScope: { entities: [], defaults: {}, membership },
      })
    );
    assert.equal(wellShaped.valid, true, wellShaped.errors.join('; '));
  }
});

test('export: the three slices are FILTERED BY MEMBERSHIP to the exported system', () => {
  // Currency, travel and the character libraries travel WHOLE because there is no owning system to
  // filter them by.
  const payload = buildExportPayload(
    { id: SOURCE_SYSTEM_ID, name: 'Source System', components: [] },
    [],
    '9.9.9',
    [],
    {},
    {},
    {},
    {},
    {
      entities: [
        { id: 'mine', name: 'Mine' },
        { id: 'theirs', name: 'Theirs' },
      ],
      defaults: { mine: { id: 'mine' }, theirs: { id: 'theirs' } },
      membership: {
        [`mine|${SOURCE_SYSTEM_ID}`]: membershipRecord('mine', SOURCE_SYSTEM_ID),
        'theirs|other-system': membershipRecord('theirs', 'other-system'),
      },
    }
  );

  assert.deepEqual(payload.componentScope.membership.map((r) => r.entityId), ['mine']);
  assert.deepEqual(payload.componentScope.entities.map((r) => r.id), ['mine']);
  assert.deepEqual(payload.componentScope.defaults.map((r) => r.id), ['mine']);
});
// The 1.34.0 equivalent-essence merge over the bundle (issue 1654)

/**
 * A bundle carrying two equivalent same-name essences inside its one system — the shape the
 * authoring store's same-name guard prevents and the normalizer does not, so it reaches the
 * importer through a hand-edited or a legacy bundle.
 */
function duplicateEssenceEnvelope(schemaVersion) {
  return envelope({
    schemaVersion,
    system: {
      essenceDefinitions: [
        { id: 'iron', name: 'Iron' },
        { id: 'kTz9QpLm2xR4vB1a', name: 'iron' },
      ],
    },
  });
}

for (const schemaVersion of [undefined, FABRICATE_EXPORT_SCHEMA_VERSION]) {
  const branch = schemaVersion === undefined ? 'legacy' : 'current-schema';
  test(`1654 (${branch}): the merge runs BRANCH-INDEPENDENTLY and carries its refusal`, () => {
    const migrated = migrateExportPayload(duplicateEssenceEnvelope(schemaVersion));
    // The premise: the derivation above really did lift two world essences for this one system,
    // or there would be nothing for the merge to reason about.
    assert.equal(migrated.essenceScope.entities.length, 2, 'two world essences were derived');

    const refusals = migrated._worldScopeEntityReport.essenceMergeRefusals;
    assert.ok(Array.isArray(refusals), 'the refusal leg is present on BOTH branches');
    assert.equal(refusals.length, 1, 'the equivalent pair is seen');
    // A one-system corpus refuses every group, and the refusal is the payload: both members hold a
    // membership record for the one system and both carry an `essenceDefinitions` row, so merging
    // them would make that array emit one id twice. Reported rather than silently done.
    assert.equal(refusals[0].reason, 'outputIdCollision');
    assert.deepEqual(
      migrated.essenceScope.entities.map((entity) => entity.id),
      ['iron', 'kTz9QpLm2xR4vB1a'],
      'and a REFUSED group leaves the slice exactly as the derivation built it'
    );
  });
}

test('1654: `migrate(migrate(x))` is deep-equal on the essence slice', () => {
  // The idempotence pin requirement 12 asks for, and it is not vacuous: the merge is applied
  // rather than refused by this path, so a non-idempotent re-point would re-key a re-keyed id on
  // the second pass and the two slices would diverge.
  for (const schemaVersion of [undefined, FABRICATE_EXPORT_SCHEMA_VERSION]) {
    const once = migrateExportPayload(duplicateEssenceEnvelope(schemaVersion));
    const twice = migrateExportPayload(once);
    assert.deepEqual(twice.essenceScope, once.essenceScope);
    assert.deepEqual(twice.componentScope, once.componentScope);
    assert.deepEqual(twice.system.essenceDefinitions, once.system.essenceDefinitions);
  }
});

test('1654: a bundle with nothing to merge is untouched, and grows no key it did not carry', () => {
  const raw = envelope({ system: { essenceDefinitions: [{ id: 'iron', name: 'Iron' }] } });
  const before = JSON.parse(JSON.stringify(raw));
  const migrated = migrateExportPayload(raw);
  assert.deepEqual(raw, before, 'the input is never reached');
  assert.deepEqual(migrated._worldScopeEntityReport.essenceMergeRefusals, []);
  assert.deepEqual(migrated.system.essenceDefinitions, [{ id: 'iron', name: 'Iron' }]);
  // The synthesized corpus defaults an absent gathering slice to `{}` and an absent recipe list to
  // `[]`, so an ungated write-back would add both keys to every bundle that lacked them.
  assert.deepEqual(migrated.gatheringConfig, { system: {}, shared: {} });
  const sparse = migrateExportPayload({
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    fabricateVersion: '9.9.9',
    system: { id: SOURCE_SYSTEM_ID, name: 'Source System', essenceDefinitions: [] },
    gatheringConfig: { shared: {} },
  });
  assert.deepEqual(sparse.gatheringConfig, { shared: {} }, 'no `system` slice is invented');
  assert.equal('recipes' in sparse, false, 'and no `recipes` array is invented');
});

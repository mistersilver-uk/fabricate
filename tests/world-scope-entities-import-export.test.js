/**
 * Issue 1364 (epic 1357, PR 4) — world-scope entity import/export, schema 6.
 *
 * The acceptance suite for the three envelope slices, the 5 -> 6 payload upcast that derives them,
 * copy mode's match-or-mint rule and the SPLIT merge an import performs on the destination.
 *
 * Every test below names the mutation that reddens it, because several of them are green under
 * plausible wrong implementations and say so rather than pretending otherwise: the two the delta
 * calls out — the upcast's no-aliasing rule and the "one record per component" positive statement
 * — have no reachable reddening mutation at all, and their falsifiability is carried by the
 * neighbours named in their comments.
 *
 * THE ONE STRUCTURAL TRAP, stated once at the top because three tests depend on it: the envelope
 * carries `defaults` and `membership` as ARRAYS while the shared `1.30.0` transform reads them
 * only as MAPS, and hands an array back silently discarded rather than rejected. A map-form
 * fixture therefore passes against a map-only implementation and ships the defect, so every
 * fixture here that exercises the upcast uses the ARRAY form a real bundle actually has.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_SYSTEM_ID = 'sys-source';

// ---------------------------------------------------------------------------
// Fixtures — one builder per shape, reused rather than re-authored per test
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Criterion 4 — the upcast DERIVES without STRIPPING
// ---------------------------------------------------------------------------

test('4(a): the upcast derives a world entity WITHOUT rewriting the in-system record', () => {
  // The divergence arm, and the reason the discard of the shared transform's returned `systems` is
  // LOAD-BEARING rather than defensive. `groupIdentity` folds `sourceUuid` into `aliasItemUuids`
  // even for a SINGLETON group and the identity write-back applies it to every in-system record,
  // so adopting the returned systems would rewrite in-system identity through the import door.
  //
  // REDDENS WHEN: the upcast adopts `result.systems` instead of discarding it.
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
  // component-linked tool. Run over three schemas and therefore over both branches.
  //
  // REDDENS WHEN: a `stripSystemScopedEntities` half is added, which is the mistake the epic's
  // brief invites by analogy with schemas 3, 4 and 5.
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

// ---------------------------------------------------------------------------
// Criterion 5 — a colliding pair is REFUSED rather than silently emptied
// ---------------------------------------------------------------------------

test('5(a): an ordinary bundle emits one world entity per in-system record, under its own id', () => {
  // THE POSITIVE STATEMENT, and it has NO REACHABLE REDDENING MUTATION — it does not pretend
  // otherwise. For a one-system corpus the re-key map is empty STRUCTURALLY, so disabling the
  // output-uniqueness arm changes nothing here, and the payload's own ids never move under any
  // mutation because the upcast discards the returned `systems`. Its falsifiability is carried by
  // 5(b) and by 4(a).
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
  // `registeredItemUuid`. They group together, the group claims one id, the emitted id set
  // collides, and the output-uniqueness post-condition REFUSES the pair.
  //
  // REDDENS WHEN: `findRefusals`'s output-uniqueness arm is disabled — the pair is ACCEPTED and
  // the slice comes back NON-EMPTY with ONE merged entity for two components and no refusal; and
  // INDEPENDENTLY when the refusal is not carried onto the prepared payload, where the slice is
  // still empty and only the refusal assertion fails. Both are named because either alone leaves
  // the other assertion green.
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

// ---------------------------------------------------------------------------
// Criterion 6 — the derivation is BRANCH-INDEPENDENT
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Criterion 7 — the per-pair lift guard, ON THE ARRAY FORM
// ---------------------------------------------------------------------------

test('7: a hand-edited membership record survives the upcast BYTE-IDENTICAL, from the array form', () => {
  // THE ARRAY FORM IS NOT OPTIONAL IN THIS FIXTURE. `readScopePayload` accepts `defaults` and
  // `membership` only through `isPlainObject`, which excludes arrays, so a map-form fixture passes
  // against a map-only implementation and ships the defect two reviewers found independently.
  //
  // REDDENS WHEN: the upcast's array-to-map re-keying is removed, so the arrays reach
  // `readScopePayload` and are discarded — the per-(entityId, systemId) guard never fires and the
  // hand-edited record is REBUILT by `buildMembershipRecord`; and INDEPENDENTLY when that guard is
  // removed.
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
    handEdited,
    'the record already present is preserved verbatim — `inherit.category` stays TRUE, which is ' +
      'the opposite of what `buildMembershipRecord` writes'
  );
  assert.ok(byEntity.has('c2'), 'while the missing pair is derived');
});

// ---------------------------------------------------------------------------
// Criterion 8 — the map/array conversion round-trips
// ---------------------------------------------------------------------------

test('8(a): the membership key is derived with the shipped separator, so one pair is ONE record', () => {
  // REDDENS WHEN: the separator is written as anything but the shipped `MEMBERSHIP_KEY_SEPARATOR`.
  // A DOUBLED separator produces TWO records for one pair rather than an error, because nothing
  // validates a map key against its record on the way in — so the assertion is on the COUNT and
  // never on a throw.
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
  // re-derives it. A payload whose map key and record disagree must therefore still produce
  // exactly one record, keyed from the record.
  //
  // REDDENS WHEN: the carried key is trusted rather than re-derived.
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
  // NO REACHABLE REDDENING MUTATION, and it does not pretend to have one. `migrateExportPayload`
  // deep-clones its input unconditionally on BOTH branches, so whatever the derivation aliases, it
  // aliases inside one call's own clone where no caller can observe it — both assertions stay
  // green with the deep copy removed. The deep copy is a STATED DEFENSIVE RULE whose falsifiability
  // is carried by 8(a) and 8(b), which are the direct net under the array-discard defect.
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

// ---------------------------------------------------------------------------
// Criterion 1 — the round trip, per layer
// ---------------------------------------------------------------------------

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
  // ALL THREE MUST BE NON-EMPTY IN THE DESTINATION FIXTURE: an ABSENT sub-key makes an
  // object-level merge pass by accident, which is precisely the shape this guards against.
  //
  // REDDENS WHEN: the three are collapsed into one object-level destination-wins merge, or the
  // `defaults` leg is dropped or folded into `entities`.
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

// ---------------------------------------------------------------------------
// Criterion 2 — an already-configured destination is deliberately NOT identity
// ---------------------------------------------------------------------------

test('2: the destination wins world identity, and the shipped drift detector SEES it', async () => {
  // The first exercised consumer of a detector the migration ships unused.
  //
  // The fixture avoids LEGACY source spellings deliberately, and the reason is a real interaction
  // rather than fussiness: because the upcast discards the shared transform's rewritten `systems`
  // while the derived world entity folds `sourceUuid` / `sourceItemUuid` / `fallbackItemIds` into
  // `aliasItemUuids`, a keep-mode import of a legacy bundle would land a world entity whose
  // `aliasItemUuids` differs from the in-system record's, and the detector would report THAT field
  // too — silently inflating the literal expectation below.
  //
  // REDDENS WHEN: the merge is flipped to SOURCE-wins, so the detector returns empty against a
  // non-empty literal expectation; or when a lifted field is added to the world entity without
  // being added to `WORLD_IDENTITY_FIELDS`, so this literal names a field the detector never
  // compares.
  // Both sides carry EXPLICIT `img` and `description`, because `_normalizeSystem` mints defaults
  // for both onto the in-system record — so leaving them unauthored would put two more fields in
  // the literal below and say nothing about the merge direction.
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

// ---------------------------------------------------------------------------
// Criterion 3 — an UNMIGRATED destination is untouched
// ---------------------------------------------------------------------------

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
  // THE DESTRUCTIVE ARM, aimed at the ONE genuinely pruning basis. The payload is HAND-AUTHORED
  // because the shipped exporter cannot produce it — `entities` is filtered to the ids membership
  // names — and the merge must still handle it, because `validateImportData` accepts any
  // well-shaped slice.
  //
  // REDDENS WHEN: the seeding gate is removed. The write fires because the slice DOES add an
  // `entities` record, `_persist` seeds all three sub-keys, the essence basis flips from UNKNOWN to
  // the KNOWN roster `{fire}`, and `_normalizeEssenceQuantities` prunes `ghost` PERMANENTLY.
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

// ---------------------------------------------------------------------------
// Criterion 12 — the entities merge runs BEFORE createSystem
// ---------------------------------------------------------------------------

test('12: the roster merge lands BEFORE the system is created, so no essence quantity is pruned', async () => {
  // A REAL ORDERING TEST rather than a call-order spy, and aimed at the essence basis because that
  // is the only basis that prunes.
  //
  // REDDENS WHEN: `_persistScopedEntityRosters` is moved down beside `_persistCurrencyConfig` — at
  // `createSystem` time the destination is SEEDED but lacks the incoming ids and the in-system
  // array is empty, so the basis is a KNOWN roster without them and every quantity is pruned.
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

// ---------------------------------------------------------------------------
// Criterion 13 — every written membership record names the DESTINATION system
// ---------------------------------------------------------------------------

test('13: every membership record the import writes names the DESTINATION system id', async () => {
  // Three arms: copy mode, keep mode with a matching payload id, and a keep-mode overwrite where
  // the existing system is resolved BY NAME under a different id.
  //
  // REDDENS WHEN: the membership merge is moved back into the pre-`createSystem` slot, or the
  // `systemId` rewrite is dropped — every record then names a phantom system and the created copy
  // has zero members.
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

// ---------------------------------------------------------------------------
// Criterion 15 — the tool-breakage authority is a PAIR
// ---------------------------------------------------------------------------

test('15(a): an incoming world tool-breakage authority is dropped BY THE UPCAST, and reported', async () => {
  // ASSERTED ON THE UPCAST'S OWN OUTPUT, not only on the import summary, because the export
  // assembler is not on a hand-edited payload's path at all and `readScopePayload` PRESERVES the
  // key through its extras spread.
  //
  // REDDENS WHEN: the drop is placed only on the export assembler (the value half); and
  // INDEPENDENTLY when the report push is deleted (the report half).
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
  // `store.get()`. `_normalize` rebuilds extras from the RAW argument alone and
  // `normalizeWorldToolBreakage(undefined)` answers `{}`, so the destination's authority is erased.
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

// ---------------------------------------------------------------------------
// Criteria 9, 17, 18, 19 — copy mode's match-or-mint rule
// ---------------------------------------------------------------------------

/**
 * The six-spelling fixture. Each linked component carries EXACTLY ONE source spelling and no
 * modern one, because the point is that the match runs on the MIGRATION's six-spelling rule rather
 * than the narrower three-field one. `fallbackItemIds` is exercised WITHOUT `aliasItemUuids`
 * deliberately: the two are an EITHER/OR, so a record carrying both would exercise nothing.
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
  // THE SEEDING QUALIFIER IS REQUIRED. Under the seeding gate the first import writes no world
  // entity into an UNMIGRATED destination, so the index the second import is handed would be empty
  // and it would mint again — which is the correct behaviour for an unmigrated world, and exactly
  // why this fixture uses a SEEDED one.
  //
  // REDDENS WHEN: the match is computed with `getItemMatchUuids` instead of `sourceReferencesOf` —
  // each of the three legacy-only components mints a duplicate; or when the match is run over
  // `componentScope.entities` instead of `prepared.system.components`, where the world entity has
  // already canonicalised all three legacy spellings into `aliasItemUuids` and the narrower
  // function would find them; or when the match is made name-based; or when the index is ignored.
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
  //
  // REDDENS WHEN: the fifth rewrite target is omitted — the matched entity arrives under its
  // pre-import id, the roster grows by eight, and the merged roster carries a duplicate world
  // record for an item the destination already had.
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
  //
  // REDDENS WHEN: the slice rewrite is driven over `membership` only, exactly as the shipped
  // migration drives it — a copy import's essence world DEFAULT keeps naming the pre-import
  // component id.
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

// ---------------------------------------------------------------------------
// Criterion 10 — copy mode without an index FAILS rather than minting
// ---------------------------------------------------------------------------

test('10: a copy-mode call with no worldEntityIndex throws, and the throw is the GUARD’S OWN', async () => {
  // REDDENS WHEN: the explicit guard is deleted — either nothing throws, or a destructuring
  // `TypeError` throws whose message does not match, which a BARE `assert.throws` would have
  // accepted. Giving the parameter a default value is deliberately NOT the named mutation: it does
  // not redden a correct guard, which is why the MESSAGE MATCHER carries this criterion.
  const payload = () => envelope({ system: { components: [component('c1')] } });

  assert.throws(() => prepareForImport(payload(), 'copy'), /worldEntityIndex/);
  assert.throws(() => prepareForImport(payload(), 'copy', undefined), /worldEntityIndex/);
  assert.throws(() => prepareForImport(payload(), 'copy', null), /worldEntityIndex/);
  assert.throws(() => prepareForImport(payload(), 'copy', {}), /worldEntityIndex/);

  // KEEP mode does not need one — it never re-keys anything, so there is nothing to bind.
  assert.ok(prepareForImport(payload(), 'keep'), 'keep mode is unaffected');
});

// ---------------------------------------------------------------------------
// Criterion 11 — both import call sites, in source AND in behaviour
// ---------------------------------------------------------------------------

test('11: both prepareForImport call sites pass every parameter the exporter declares', () => {
  // A guard on the guards, on the pattern the export-side signature pin sets. The two source
  // contracts below name their arguments literally, so a NEW parameter added to `prepareForImport`
  // would leave both green while both call sites silently defaulted it.
  //
  // REDDENS WHEN: one argument is deleted from either call site.
  const exporterSource = readFileSync(
    resolve(ROOT, 'src/systems/CraftingSystemExporter.js'),
    'utf8'
  );
  const signature = /export function prepareForImport\(([\s\S]*?)\) \{/.exec(exporterSource);
  assert.ok(signature, "located prepareForImport's declaration");
  const declared = signature[1]
    .replaceAll(/\/\/[^\n]*/g, '')
    .split(',')
    .map((parameter) => parameter.split('=')[0].trim())
    .filter(Boolean);
  assert.deepEqual(
    declared,
    ['rawData', 'mode', 'options'],
    'prepareForImport gained or lost a parameter — pin it in BOTH call-site guards below first'
  );

  const mainSource = readFileSync(resolve(ROOT, 'src/main.js'), 'utf8');
  const publicApi = mainSource.slice(
    mainSource.indexOf('game.fabricate.importSystemFromFile ='),
    mainSource.indexOf('game.fabricate.cleanupInteractables =')
  );
  assert.ok(publicApi.length > 0, 'located the public-API import closure');
  assert.match(
    publicApi,
    /prepareForImport\(data, mode, \{ worldEntityIndex \}\)/,
    'the public API must hand the destination index to prepareForImport'
  );
  assert.match(publicApi, /buildWorldEntityIndex\(fabricate\)/, 'and build it from the stores');

  const managerSource = readFileSync(
    resolve(ROOT, 'src/ui/SvelteCraftingSystemManagerApp.svelte.js'),
    'utf8'
  );
  assert.match(
    managerSource,
    /prepareForImport\(data, mode, \{ worldEntityIndex \}\)/,
    "the Manager's Import button must hand it the same index"
  );
  for (const accessor of ['getComponentScopeStore', 'getEssenceScopeStore', 'getToolScopeStore']) {
    assert.ok(
      managerSource.includes(`game.fabricate.${accessor}?.()?.listEntities?.() ?? []`),
      `the Manager builds the index leg through ${accessor}`
    );
  }
});

test('11: the index the call sites build has CONTENTS, and the contents are what bind', async () => {
  // THE BEHAVIOURAL ARM, and it exists because the source regexes above are satisfied by `{}`.
  //
  // REDDENS WHEN: a call site is changed to pass an empty index — the linked component mints
  // instead of binding, and the destination acquires a second world record for an item it holds.
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

// ---------------------------------------------------------------------------
// Criterion 16 — the destination re-check of a carried world default
// ---------------------------------------------------------------------------

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
  //
  // REDDENS WHEN: the constraint is decided against the incoming slice alone.
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
  // THE VACUITY ARM, and the incoming-record wording is the whole point of it. At the moment the
  // defaults merge runs, NOTHING of the incoming membership is persisted — so a destination-only
  // reading of the corpus passes this, because the empty incoming set satisfies the every-member
  // precondition VACUOUSLY.
  //
  // REDDENS WHEN: the re-check corpus is the persisted membership alone.
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
  // actually lands in (resolved BY NAME) is a member of neither. Keying the incoming records on the
  // payload's id would collapse them into that unrelated destination system's set and the
  // repair-requirements constraint would PASS, seeding a dangling repair recipe into a system whose
  // GM never authored it.
  //
  // REDDENS WHEN: the incoming records are keyed by the payload's system id rather than a synthetic
  // token.
  //
  // The union is also deliberately CONSERVATIVE, which this arm shows in passing: the default is
  // valid against the DESTINATION alone and is declined once the incoming member joins the union.
  // Over-declining is lossless — every incoming membership record still overrides the section with
  // its own system's value verbatim — while under-declining hands a member system a resolved value
  // its GM never authored.
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
  // while `componentScope` is not — reachable through a torn migration. No component roster will be
  // written, so every rule that consults one is undecidable; a section carrying NO component
  // reference is unaffected.
  //
  // REDDENS WHEN: the unseeded-component-scope case falls through to acceptance.
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

// ---------------------------------------------------------------------------
// Validation — a malformed slice is an ERROR, never a silent drop
// ---------------------------------------------------------------------------

test('validation: a malformed slice is an ERROR, checked against the RAW payload', () => {
  // CHECKED AGAINST THE RAW PAYLOAD, not the migrated one, and that is not stylistic: the upcast
  // REPLACES a slice it cannot read with a freshly derived one, so a check on the migrated payload
  // would never fire. A dropped slice is an import that quietly creates no memberships, which is
  // indistinguishable from success until the consumer sweep makes the read union visible.
  //
  // REDDENS WHEN: the check is moved onto the migrated payload, or dropped.
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
  // filter them by. Here there IS one, and it is membership — shipping the unfiltered roster would
  // import a foreign world's entire component roster into the destination.
  //
  // REDDENS WHEN: the membership filter is dropped, or `entities` / `defaults` are filtered by
  // anything other than the ids the filtered membership names.
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

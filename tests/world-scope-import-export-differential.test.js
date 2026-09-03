/**
 * Issue 1364 — THE CRITERION NO KEY-SET COMPARISON CAN ANSWER.
 *
 * "Every field a production reader consumes is identical in the destination and the source, for the
 * imported system."
 *
 * An envelope diff cannot answer that, and neither can a craft-and-salvage smoke: the authoritative
 * copy of a component is still `system.components`, while the thing this change ADDS is a slice no
 * production reader consults until the consumer sweep. So an export that dropped every membership
 * record would pass both — the system would build, craft and salvage identically, and the world
 * corpus would simply be empty.
 *
 * The answer is a CORPUS DIFFERENTIAL over `export -> prepareForImport -> importFromPackData`,
 * built on the migration suite's own two projections plus a third over the three world-scope
 * slices, with every id canonicalised through the ACTUAL map the import produced rather than a
 * re-derived one — a re-derived map would agree with a WRONG import by construction.
 *
 * It runs three ways: keep mode into a SEEDED destination, copy mode into a seeded-but-empty one,
 * and copy mode into an ALREADY-CONFIGURED one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { destinationWorld, emptySeededScope } from './helpers/worldScopeImportHarness.js';
import {
  actualImportIdMap,
  canonicaliseProjection,
  projectEntities,
  projectReferenceClosure,
  projectScopeSlices,
} from './helpers/worldScopeCorpus.js';

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { buildExportPayload, prepareForImport } = await import(
  '../src/systems/CraftingSystemExporter.js'
);

const SOURCE_SYSTEM_ID = 'sys-source';

/**
 * The authored system every leg of the differential starts from. It exercises a reference at every
 * class the shared walk visits — recipe ingredients and results, salvage, an essence source, a tool
 * component link and a repair recipe — so a projection can see a dropped one.
 */
function authoredSystem() {
  return {
    id: SOURCE_SYSTEM_ID,
    name: 'Source System',
    enabled: true,
    features: { salvage: true, essences: true },
    components: [
      {
        id: 'c1',
        name: 'Iron Ore',
        originItemUuid: 'Item.ore',
        registeredItemUuid: 'Item.ore',
        aliasItemUuids: [],
        category: 'reagent',
        essences: { fire: 2 },
        salvage: { resultGroups: [{ id: 'g1', results: [{ componentId: 'c2', quantity: 1 }] }] },
      },
      {
        id: 'c2',
        name: 'Iron Ingot',
        originItemUuid: 'Item.ingot',
        registeredItemUuid: 'Item.ingot',
        aliasItemUuids: [],
        category: 'reagent',
        essences: { fire: 1 },
      },
    ],
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', enabled: true, sourceComponentId: 'c1', propertyMacroUuid: null },
    ],
    tools: [
      {
        id: 't1',
        name: 'Hammer',
        originItemUuid: 'Item.hammer',
        registeredItemUuid: 'Item.hammer',
        aliasItemUuids: [],
        componentId: 'c2',
        breakage: { mode: 'never' },
        onBreak: { replacementTarget: { type: 'component', componentId: 'c1' } },
        repairRequirements: [{ id: 'rg1', options: [{ componentId: 'c1', quantity: 1 }] }],
      },
    ],
  };
}

/**
 * A SOURCE world: a migrated world holding the authored system and the world corpus a `1.30.0`
 * migration would have derived for it. It is built by importing the system into a seeded world,
 * which is the same machinery the migration uses and therefore cannot disagree with it about the
 * shape of a derived record.
 */
async function sourceWorld() {
  const world = await destinationWorld({
    componentScope: emptySeededScope(),
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });
  const seed = {
    schemaVersion: 6,
    fabricateVersion: '9.9.9',
    system: authoredSystem(),
    recipes: [],
    gatheringEnvironments: [],
    gatheringConfig: { system: {}, shared: {} },
  };
  await world.importer.importFromPackData(
    prepareForImport(seed, 'keep', { worldEntityIndex: world.worldEntityIndex() }),
    { overwriteExisting: true }
  );
  return world;
}

/** The envelope one world exports for one system, through the REAL production resolution. */
function exportFrom(world, systemId) {
  return buildExportPayload(
    world.systemManager.getSystem(systemId),
    [],
    '9.9.9',
    [],
    {},
    {},
    {},
    {},
    world.stores.components.get(),
    world.stores.essences.get(),
    world.stores.tools.get()
  );
}

/** The three projections of one world, for one system. */
function projectWorld(world, systemId) {
  const system = world.systemManager.getSystem(systemId);
  const corpus = {
    systems: [system],
    recipes: [],
    gatheringConfig: { systems: {} },
    componentScope: world.persisted('components'),
    essenceScope: world.persisted('essences'),
    toolScope: world.persisted('tools'),
  };
  return {
    entities: projectEntities(CraftingSystemManager, corpus, true),
    closure: projectReferenceClosure(CraftingSystemManager, corpus, true),
    slices: projectScopeSlices({
      components: corpus.componentScope,
      essences: corpus.essenceScope,
      tools: corpus.toolScope,
    }),
  };
}

/**
 * Run one leg: export from the source world, import into a fresh destination, and compare all three
 * projections after canonicalising the ids the import actually assigned.
 */
async function runLeg({ mode, destination }) {
  const source = await sourceWorld();
  const envelope = exportFrom(source, SOURCE_SYSTEM_ID);
  const sourceProjection = projectWorld(source, SOURCE_SYSTEM_ID);

  const world = await destination();
  const packData = prepareForImport(envelope, mode, {
    worldEntityIndex: world.worldEntityIndex(),
  });
  const summary = await world.importer.importFromPackData(packData, { overwriteExisting: true });
  const maps = actualImportIdMap(envelope, packData, summary.system.id);

  return {
    source,
    world,
    summary,
    expected: {
      entities: canonicaliseProjection(sourceProjection.entities, maps),
      closure: canonicaliseProjection(sourceProjection.closure, maps),
      slices: canonicaliseProjection(sourceProjection.slices, maps),
    },
    actual: projectWorld(world, summary.system.id),
  };
}

const seededEmpty = () =>
  destinationWorld({
    componentScope: emptySeededScope(),
    essenceScope: emptySeededScope(),
    toolScope: emptySeededScope(),
  });

test('differential: keep mode into a seeded destination reproduces every projection', async () => {
  // REDDENS WHEN: any one of the three merges is dropped (projection (c) loses that layer); when
  // the system is built from the world slices instead of the in-system arrays (projections (a) and
  // (b) diverge); or when the membership records are stranded at the payload's system id
  // (projection (c)'s membership keys stop canonicalising onto the destination's).
  const leg = await runLeg({ mode: 'keep', destination: seededEmpty });
  assert.deepEqual(leg.actual.entities, leg.expected.entities);
  assert.deepEqual(leg.actual.closure, leg.expected.closure);
  assert.deepEqual(leg.actual.slices, leg.expected.slices);
});

test('differential: copy mode into a seeded-but-empty destination reproduces every projection', async () => {
  // Every id moves here — the system id, both component ids — so this leg is what proves the
  // canonicaliser is doing real work and that the copy-mode map reaches INSIDE the three slices.
  //
  // REDDENS WHEN: the copy-mode map is not driven over the slices, so a membership record's
  // `entityId` or a world default's component reference keeps a pre-import id.
  const leg = await runLeg({ mode: 'copy', destination: seededEmpty });
  assert.notEqual(leg.summary.system.id, SOURCE_SYSTEM_ID, 'copy mode minted a fresh system id');
  assert.deepEqual(leg.actual.entities, leg.expected.entities);
  assert.deepEqual(leg.actual.closure, leg.expected.closure);
  assert.deepEqual(leg.actual.slices, leg.expected.slices);
});

test('differential: copy mode into an ALREADY-CONFIGURED destination binds rather than duplicating', async () => {
  // The destination already holds the SAME two items under different world ids. The imported system
  // must still project identically — every field a reader consumes is unchanged — while the world
  // roster must NOT grow, because binding to what the destination has is the whole point.
  //
  // REDDENS WHEN: match-or-mint is reverted to mint-everything: the two projections still match
  // (a duplicate world entity carries the same fields) but the roster grows by two, which is the
  // duplication this epic exists to end.
  const configured = () =>
    destinationWorld({
      componentScope: {
        entities: [
          { id: 'held-ore', name: 'Iron Ore', registeredItemUuid: 'Item.ore' },
          { id: 'held-ingot', name: 'Iron Ingot', registeredItemUuid: 'Item.ingot' },
        ],
        defaults: {},
        membership: {},
      },
      essenceScope: emptySeededScope(),
      toolScope: emptySeededScope(),
    });

  const leg = await runLeg({ mode: 'copy', destination: configured });

  assert.deepEqual(
    leg.world
      .persisted('components')
      .entities.map((entity) => entity.id)
      .sort(),
    ['held-ingot', 'held-ore'],
    'the roster did not grow — both incoming components BOUND to what the destination already held'
  );
  // The imported system's own projection is unchanged under the id map the binding produced.
  assert.deepEqual(leg.actual.entities, leg.expected.entities);
  assert.deepEqual(leg.actual.closure, leg.expected.closure);
});

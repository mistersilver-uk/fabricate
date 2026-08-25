/**
 * Carrying the WORLD travel configuration — the realm library, its two scalars, and the Foundry
 * Scene Region links nested inside each realm as `sceneMappings[]` — through an export/import
 * round trip (issue 1282), plus the pre-v4 upcast that reads a legacy per-system export.
 *
 * These are decisions rather than mechanics, which is why they are pinned here:
 *
 *   - **Import merges, it never replaces.** Realms are world scope, so an imported system's
 *     library cannot overwrite geography the destination GM authored for unrelated systems.
 *     Realms merge by id with the DESTINATION winning a collision — environments
 *     (`includedRealmIds` / `excludedRealmIds`), party overrides and actor discovery flags all
 *     cite realms by id, so an id already in this world must keep its own definition or every
 *     one of those references silently starts naming a different place. It is also what makes
 *     an import safe to run twice.
 *   - **The scalars seed an unconfigured world only.** A world that already has realms has
 *     already answered how it discloses its places, and an imported system does not overrule it.
 *   - **The upcast is branch-independent.** `migrateExportPayload` early-returns once
 *     `schemaVersion` is current, so a derivation written only on the main path silently never
 *     runs for a current-schema payload that still carries the legacy shape.
 *
 * The composition is driven END TO END — `buildExportPayload` → `prepareForImport` →
 * `importFromPackData` — rather than by pinning call shapes, because both halves of this
 * pipeline fail SILENTLY: every parameter of `buildExportPayload` after `version` is defaulted,
 * so a call site that forgets one produces an empty slice instead of an error, and
 * `prepareForImport` rebuilds the pack object key by key, so a slice it forgets is dropped
 * without a trace. That pair is exactly how the currency import shipped dead.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildExportPayload, prepareForImport } from '../src/systems/CraftingSystemExporter.js';
import { migrateExportPayload } from '../src/migration/migrateExportPayload.js';
import { CompendiumImporter } from '../src/systems/CompendiumImporter.js';
import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../src/systems/authoringExport.js';

import { makeHarness } from './helpers/authoringExportHarness.js';
import { importerOverSettings } from './helpers/worldConfigImporterHarness.js';

const SOURCE_SYSTEM_ID = 'sys-wayfaring';
const VALE_ID = 'realm-northreach-vale';
const QUARRY_ID = 'realm-deepstone-quarry';
const VALE_REGION_UUID = 'Scene.northreach.Region.vale';

function importerOver(seedTravelConfig) {
  return importerOverSettings({ travelConfig: seedTravelConfig });
}

/** A system that PARTICIPATES in travel and carries nothing else about it (issue 1282). */
function sourceSystem() {
  return {
    id: SOURCE_SYSTEM_ID,
    name: 'Wayfaring',
    gatheringRealmSettings: { enabled: true },
  };
}

/** The source world's travel configuration: two realms, one carrying a Scene Region link. */
function worldTravelConfig() {
  return {
    revealMode: 'onPartyTokenEntry',
    modifierVisibility: 'gmOnly',
    realms: [
      {
        id: VALE_ID,
        name: 'Northreach Vale',
        description: 'A green cleft between two ridges.',
        biomes: ['forest'],
        sceneMappings: [
          {
            id: 'mapping-vale',
            sceneUuid: 'Scene.northreach',
            sceneRegionUuid: VALE_REGION_UUID,
          },
        ],
        modifiers: [
          { id: 'mod-lush', kind: 'yield', operation: 'multiply', value: 2, visibility: 'gmOnly' },
        ],
      },
      { id: QUARRY_ID, name: 'Deepstone Quarry', secret: true, sceneMappings: [] },
    ],
  };
}

/** An environment gated to a WORLD realm by id — the reference the library must satisfy. */
function realmGatedEnvironment() {
  return {
    id: 'env-vale-foraging',
    craftingSystemId: SOURCE_SYSTEM_ID,
    name: 'Vale Foraging',
    // Disabled because the environment store refuses to ENABLE one with no tasks, and the tasks
    // are beside the point here — what matters is the realm id this environment gates on.
    enabled: false,
    selectionMode: 'targeted',
    compositionMode: 'automatic',
    includedRealmIds: [VALE_ID],
  };
}

function exportedEnvelope({ system = sourceSystem(), travelConfig = worldTravelConfig() } = {}) {
  return buildExportPayload(system, [], '1.27.0', [realmGatedEnvironment()], {}, {}, travelConfig);
}

/** A destination world with its own system and its own (optionally empty) realm library. */
function destinationWorld(travelConfig = {}) {
  return makeHarness({
    system: {
      id: 'sys-destination',
      name: 'Destination',
      gatheringRealmSettings: { enabled: true },
    },
    recipes: [],
    environments: [],
    gatheringConfig: { systems: {}, vocabularies: {}, conditions: {} },
    travelConfig,
  });
}

function importerInto(world) {
  return new CompendiumImporter(world.systemManager, world.recipeManager, {
    environmentStore: world.environmentStore,
    getSetting: world.getSetting,
    setSetting: world.setSetting,
    isGM: () => true,
  });
}

/** Run the WHOLE composition, exactly as `game.fabricate.importSystemFromFile` does. */
async function runWholeComposition(world, envelope, mode = 'keep') {
  const packData = prepareForImport(envelope, mode);
  const summary = await importerInto(world).importFromPackData(packData, {
    overwriteExisting: true,
  });
  return { packData, summary, persisted: world.getSetting('travelConfig') };
}

function realmIds(travelConfig) {
  return (travelConfig?.realms ?? []).map((realm) => realm.id);
}

describe('the export envelope carries the world travel configuration', () => {
  it('stamps the current schema and puts the realm library beside the currency ladder', () => {
    const envelope = exportedEnvelope();

    assert.equal(envelope.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
    assert.deepEqual(realmIds(envelope.travelConfig), [VALE_ID, QUARRY_ID]);
    assert.equal(envelope.travelConfig.revealMode, 'onPartyTokenEntry');
    assert.equal(envelope.travelConfig.modifierVisibility, 'gmOnly');
  });

  it('carries each realm’s nested Scene Region links verbatim', () => {
    // The map link is the reference most likely to be silently dropped, because it is nested
    // two levels inside the slice rather than named at the top of it.
    const vale = exportedEnvelope().travelConfig.realms.find((realm) => realm.id === VALE_ID);

    assert.deepEqual(vale.sceneMappings, [
      { id: 'mapping-vale', sceneUuid: 'Scene.northreach', sceneRegionUuid: VALE_REGION_UUID },
    ]);
  });

  it('leaves the system carrying its participation flag ALONE', () => {
    const envelope = exportedEnvelope();

    assert.deepEqual(envelope.system.gatheringRealmSettings, { enabled: true });
    assert.ok(
      !Object.hasOwn(envelope.system, 'gatheringRealms'),
      'the library is world scope; a copy on the system would be a second source of truth'
    );
  });

  it('exports an EMPTY library when a call site forgets the argument', () => {
    // The defect shape this file exists to catch. Every parameter after `version` is defaulted,
    // so the omission produces a well-formed export that quietly carries nothing — which is why
    // the round trip below is asserted end to end rather than by pinning the call.
    const envelope = buildExportPayload(sourceSystem(), [], '1.27.0', [], {}, {});

    assert.deepEqual(envelope.travelConfig.realms, []);
  });
});

describe('the library survives the WHOLE import composition, not just the merge helper', () => {
  it('lands realms and their Scene Region links in a fresh world', async () => {
    const world = destinationWorld();
    const { packData, persisted } = await runWholeComposition(world, exportedEnvelope());

    assert.deepEqual(
      realmIds(packData.travelConfig),
      [VALE_ID, QUARRY_ID],
      'prepareForImport rebuilds the pack key by key; a forgotten slice never reaches the importer'
    );
    assert.deepEqual(realmIds(persisted), [VALE_ID, QUARRY_ID]);

    const vale = persisted.realms.find((realm) => realm.id === VALE_ID);
    assert.equal(vale.name, 'Northreach Vale');
    assert.equal(vale.sceneMappings[0].sceneRegionUuid, VALE_REGION_UUID);
    assert.deepEqual(vale.biomes, ['forest']);
    assert.equal(vale.modifiers[0].kind, 'yield');
    assert.equal(vale.modifiers[0].visibility, 'gmOnly');
    assert.equal(
      persisted.realms.find((realm) => realm.id === QUARRY_ID).secret,
      true,
      'a secret place stays secret in the world it lands in'
    );
  });

  it('lands a realm the imported environment can still gate on', async () => {
    // The reason the library travels at all: the environment cites a realm by id, and an import
    // that dropped the library would leave that gate naming nothing.
    const world = destinationWorld();
    const { persisted } = await runWholeComposition(world, exportedEnvelope());

    const environment = world.environmentStore
      .list()
      .find((env) => env.id === 'env-vale-foraging' || env.name === 'Vale Foraging');
    assert.ok(Boolean(environment), 'the realm-gated environment was imported');
    for (const cited of environment.includedRealmIds) {
      assert.ok(
        realmIds(persisted).includes(cited),
        `the environment gate "${cited}" resolves to a realm this world now has`
      );
    }
  });

  it('seeds the reveal mode and modifier visibility into an unconfigured world', async () => {
    const world = destinationWorld();
    const { persisted } = await runWholeComposition(world, exportedEnvelope());

    assert.equal(persisted.revealMode, 'onPartyTokenEntry');
    assert.equal(persisted.modifierVisibility, 'gmOnly');
  });

  it('reports the realm scene-region link as an unresolved external reference', async () => {
    // The resolver reads realms from the ENVELOPE now. Left pointing at `system.gatheringRealms`
    // it would find none, and every stale map link would import unreported instead of surfacing
    // in the GM's repair list.
    const world = destinationWorld();
    const { summary } = await runWholeComposition(world, exportedEnvelope());

    const realmRefs = summary.unresolvedReferences.filter((ref) => ref.ownerType === 'realm');
    assert.ok(
      realmRefs.some((ref) => ref.referenceValue === VALE_REGION_UUID),
      'the nested scene-region link is classified, not ignored'
    );
  });

  it('carries the library through COPY mode WITHOUT rebinding realm ids', async () => {
    // Realm ids are world scope and shared by every participating system. Rebinding them the way
    // a copy rebinds recipe and component ids would duplicate the world's whole geography and
    // leave the copy gating on the duplicates while every other system gated on the originals.
    const world = destinationWorld(worldTravelConfig());
    const { packData, persisted } = await runWholeComposition(world, exportedEnvelope(), 'copy');

    assert.deepEqual(realmIds(packData.travelConfig), [VALE_ID, QUARRY_ID]);
    assert.deepEqual(realmIds(persisted), [VALE_ID, QUARRY_ID], 'no duplicate geography');
  });

  it('does not alias the raw envelope, so a later mutation cannot reach the pack', () => {
    const raw = exportedEnvelope();
    const packData = prepareForImport(raw, 'keep');
    raw.travelConfig.realms[0].name = 'Mutated';

    assert.equal(packData.travelConfig.realms[0].name, 'Northreach Vale');
  });

  it('tolerates a legacy envelope that carries no travel slice at all', () => {
    // The upcast still runs, so the slice arrives as an empty library rather than as `undefined`.
    // The importer short-circuits on an empty realm list, so nothing is written.
    const packData = prepareForImport({ schemaVersion: 3, system: { id: 'x', name: 'X' } }, 'keep');

    assert.deepEqual(packData.travelConfig.realms, []);
  });
});

describe('merging an imported realm library into a world that already has one', () => {
  it('appends only genuinely new places — the DESTINATION wins an id collision', async () => {
    const { importer, settings } = importerOver({
      revealMode: 'manual',
      realms: [
        {
          id: VALE_ID,
          name: 'Northreach Vale',
          sceneMappings: [
            { id: 'mine', sceneUuid: 'Scene.mine', sceneRegionUuid: 'Scene.mine.Region.vale' },
          ],
        },
      ],
    });

    await importer._persistTravelConfig({
      revealMode: 'alwaysVisible',
      realms: [
        {
          id: VALE_ID,
          name: 'Somewhere Else Entirely',
          sceneMappings: [
            {
              id: 'theirs',
              sceneUuid: 'Scene.theirs',
              sceneRegionUuid: 'Scene.theirs.Region.other',
            },
          ],
        },
        { id: QUARRY_ID, name: 'Deepstone Quarry' },
      ],
    });

    assert.deepEqual(realmIds(settings.travelConfig), [VALE_ID, QUARRY_ID]);

    const kept = settings.travelConfig.realms[0];
    assert.equal(
      kept.name,
      'Northreach Vale',
      'the destination’s own definition survives, so its environments keep gating on the same place'
    );
    assert.deepEqual(
      kept.sceneMappings.map((mapping) => mapping.sceneRegionUuid),
      ['Scene.mine.Region.vale'],
      'including the map link that names where that place actually is'
    );
  });

  it('never overrules an already-configured world about how it discloses its places', async () => {
    const { importer, settings } = importerOver({
      revealMode: 'manual',
      modifierVisibility: 'visible',
      realms: [{ id: VALE_ID, name: 'Northreach Vale' }],
    });

    await importer._persistTravelConfig({
      revealMode: 'alwaysVisible',
      modifierVisibility: 'gmOnly',
      realms: [{ id: QUARRY_ID, name: 'Deepstone Quarry' }],
    });

    assert.equal(settings.travelConfig.revealMode, 'manual');
    assert.equal(settings.travelConfig.modifierVisibility, 'visible');
    assert.deepEqual(
      realmIds(settings.travelConfig),
      [VALE_ID, QUARRY_ID],
      'the place still lands'
    );
  });

  it('is idempotent: re-importing the same pack writes nothing new', async () => {
    const { importer, settings } = importerOver({
      realms: [{ id: VALE_ID, name: 'Northreach Vale' }],
    });
    const incoming = worldTravelConfig();

    await importer._persistTravelConfig(incoming);
    const first = structuredClone(settings.travelConfig);
    await importer._persistTravelConfig(incoming);

    assert.deepEqual(settings.travelConfig, first);
  });

  it('does nothing for a pack carrying no realms at all', async () => {
    const { importer, settings } = importerOver({ realms: [{ id: VALE_ID, name: 'Vale' }] });

    await importer._persistTravelConfig(undefined);
    await importer._persistTravelConfig({});
    await importer._persistTravelConfig({ realms: [], revealMode: 'alwaysVisible' });

    assert.deepEqual(realmIds(settings.travelConfig), [VALE_ID]);
    assert.ok(
      !settings.travelConfig.revealMode || settings.travelConfig.revealMode === 'manual',
      'an empty library carries no mandate about disclosure either'
    );
  });

  it('deep-copies incoming realms, so the persisted config cannot alias the pack payload', async () => {
    const { importer, settings } = importerOver({ realms: [] });
    const incoming = worldTravelConfig();

    await importer._persistTravelConfig(incoming);
    incoming.realms[0].name = 'Mutated';

    assert.equal(settings.travelConfig.realms[0].name, 'Northreach Vale');
  });
});

describe('upcasting a pre-v4 export payload', () => {
  const legacySystem = () => ({
    id: SOURCE_SYSTEM_ID,
    name: 'Wayfaring',
    gatheringRealmSettings: {
      enabled: true,
      revealMode: 'alwaysVisible',
      modifierVisibility: 'gmOnly',
    },
    gatheringRealms: [
      {
        id: VALE_ID,
        craftingSystemId: SOURCE_SYSTEM_ID,
        name: 'Northreach Vale',
        sceneMappings: [
          { id: 'mapping-vale', sceneUuid: 'Scene.northreach', sceneRegionUuid: VALE_REGION_UUID },
        ],
      },
    ],
  });

  it('hoists a schema-3 payload’s per-system realms into the envelope', () => {
    const migrated = migrateExportPayload({ schemaVersion: 3, system: legacySystem() });

    assert.equal(migrated.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
    assert.deepEqual(realmIds(migrated.travelConfig), [VALE_ID]);
    assert.equal(migrated.travelConfig.revealMode, 'alwaysVisible');
    assert.equal(migrated.travelConfig.modifierVisibility, 'gmOnly');
    assert.deepEqual(
      migrated.travelConfig.realms[0].sceneMappings[0].sceneRegionUuid,
      VALE_REGION_UUID,
      'the Scene Region link rides up with the realm it belongs to'
    );
    assert.deepEqual(
      migrated.system.gatheringRealmSettings,
      { enabled: true },
      'the system is left carrying participation alone'
    );
    assert.ok(!Object.hasOwn(migrated.system, 'gatheringRealms'));
  });

  it('runs on the CURRENT-schema branch too, which early-returns before the main path', () => {
    // The trap this guards: a hand-authored or force-stamped payload can claim the current
    // schema while still carrying the legacy shape. A derivation written only after the early
    // return would silently never run for it — and every payload the shipping build writes
    // carries the current schema, so that is the branch real bundles arrive on.
    const payload = { schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION, system: legacySystem() };
    const migrated = migrateExportPayload(payload);

    assert.deepEqual(realmIds(migrated.travelConfig), [VALE_ID]);
    assert.deepEqual(migrated.system.gatheringRealmSettings, { enabled: true });
  });

  it('drops the retired per-realm craftingSystemId, because a world realm has no owner', () => {
    const migrated = migrateExportPayload({ schemaVersion: 3, system: legacySystem() });

    assert.ok(!Object.hasOwn(migrated.travelConfig.realms[0], 'craftingSystemId'));
  });

  it('leaves an envelope that already carries a travel config alone', () => {
    const migrated = migrateExportPayload({
      schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
      system: legacySystem(),
      travelConfig: { revealMode: 'manual', realms: [{ id: 'authored', name: 'Authored' }] },
    });

    assert.deepEqual(realmIds(migrated.travelConfig), ['authored']);
    assert.equal(migrated.travelConfig.revealMode, 'manual');
  });

  it('leaves a SCALARS-ONLY envelope alone, rather than rebuilding over it', () => {
    // A world that chose its reveal mode before authoring a single realm exports scalars and an
    // empty library. A realm-COUNT guard would rebuild from the system block here and discard
    // the choice the GM actually made.
    const migrated = migrateExportPayload({
      schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
      system: { id: 'x', name: 'X', gatheringRealmSettings: { enabled: true } },
      travelConfig: { revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly', realms: [] },
    });

    assert.equal(migrated.travelConfig.revealMode, 'alwaysVisible');
    assert.equal(migrated.travelConfig.modifierVisibility, 'gmOnly');
  });

  it('is idempotent: a second pass finds nothing left to lift', () => {
    const once = migrateExportPayload({ schemaVersion: 3, system: legacySystem() });
    const twice = migrateExportPayload(structuredClone(once));

    assert.deepEqual(twice, once);
  });

  it('does not alias the input payload', () => {
    const payload = { schemaVersion: 3, system: legacySystem() };
    migrateExportPayload(payload);

    assert.ok(
      Object.hasOwn(payload.system, 'gatheringRealms'),
      'the caller’s payload is never stripped in place'
    );
  });

  it('carries a legacy per-system library all the way into a fresh world', async () => {
    // The whole pipeline over a pre-1282 export: the realms are hoisted by the upcast, survive
    // `prepareForImport`, and land in the destination's world setting.
    const world = destinationWorld();
    const { persisted } = await runWholeComposition(world, {
      schemaVersion: 3,
      fabricateVersion: '1.26.0',
      system: legacySystem(),
      recipes: [],
    });

    assert.deepEqual(realmIds(persisted), [VALE_ID]);
    assert.equal(persisted.realms[0].sceneMappings[0].sceneRegionUuid, VALE_REGION_UUID);
    assert.equal(persisted.revealMode, 'alwaysVisible');
  });
});

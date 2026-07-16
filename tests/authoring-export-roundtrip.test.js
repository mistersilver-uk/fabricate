/**
 * Q1 — TRUE single-store KEEP-mode round-trip.
 *
 * export → import → export through ONE shared in-memory settings map + the REAL
 * GatheringEnvironmentStore, so the second export reads exactly what the import
 * persisted. The two envelopes must be deep-equal modulo volatile provenance
 * (`exportedAt`, `fabricateVersion`). Copy-mode id-rebind self-consistency is a
 * SEPARATE assertion.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// The shared harness installs the minimal Foundry globals + the single-store
// GatheringEnvironmentStore harness and the export resolution helpers.
const { makeHarness, exportCurrent } = await import('./helpers/authoringExportHarness.js');
const { validateImportData, prepareForImport } = await import(
  '../src/systems/CraftingSystemExporter.js'
);
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const {
  buildFullAuthoringFixture,
  FIXTURE_SYSTEM_ID,
  FIXTURE_REALM_ID,
  normalizeExportEnvelope,
} = await import('./helpers/fullAuthoringFixture.js');

test('round-trip: export → import(keep) → export is deep-equal modulo volatile fields', async () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);

  const first = exportCurrent(h, FIXTURE_SYSTEM_ID);

  // Envelope carries the explicit schema markers.
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.runtimeStateIncluded, false);
  // Runtime state stripped on export.
  for (const env of first.gatheringEnvironments) {
    assert.deepEqual(env.nodeRuntime, {}, 'nodeRuntime stripped');
  }
  // A1 — current-condition selection reset to defaults; authoring survives.
  const slice = first.gatheringConfig.system;
  assert.equal(slice.conditions.weather.current, 'clear', 'weather current reset');
  assert.equal(slice.conditions.timeOfDay.current, 'day', 'timeOfDay current reset');
  assert.equal(slice.conditions.weather.enabled, true, 'weather enabled preserved');
  assert.ok(slice.conditions.weather.values.length >= 2, 'weather values preserved');
  assert.equal(first.gatheringConfig.shared.conditions.weather, 'clear');
  assert.equal(first.gatheringConfig.shared.conditions.timeOfDay, 'day');

  const validation = validateImportData(first);
  assert.equal(validation.valid, true, validation.errors.join('; '));

  const packData = prepareForImport(first, 'keep');
  const importer = new CompendiumImporter(h.systemManager, h.recipeManager, {
    environmentStore: h.environmentStore,
    getSetting: h.getSetting,
    setSetting: h.setSetting,
    isGM: () => true,
  });
  await importer.importFromPackData(packData, { overwriteExisting: true });

  const second = exportCurrent(h, FIXTURE_SYSTEM_ID);

  assert.deepEqual(normalizeExportEnvelope(second), normalizeExportEnvelope(first));
});

test('round-trip: importing keeps other systems’ environments (single-store)', async () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);
  // Register the unrelated system so the REAL store validates its environment.
  await h.systemManager.createSystem({ id: 'other-system', name: 'Other', gatheringRealms: [] });
  // Seed an unrelated system's environment into the shared global list.
  const foreign = {
    id: 'env-foreign',
    craftingSystemId: 'other-system',
    name: 'Foreign Env',
    enabled: false, // disabled so it needs no task source
    selectionMode: 'targeted',
    compositionMode: 'automatic',
  };
  const seeded = [...h.environmentStore.list(), foreign];
  h.settings.set('gatheringEnvironments', structuredClone(seeded));
  h.environmentStore.load();

  const first = exportCurrent(h, FIXTURE_SYSTEM_ID);
  const packData = prepareForImport(first, 'keep');
  const importer = new CompendiumImporter(h.systemManager, h.recipeManager, {
    environmentStore: h.environmentStore,
    getSetting: h.getSetting,
    setSetting: h.setSetting,
    isGM: () => true,
  });
  await importer.importFromPackData(packData, { overwriteExisting: true });

  const all = h.environmentStore.list();
  assert.ok(
    all.some((e) => e.id === 'env-foreign'),
    'the other system’s environment survives the import'
  );
});

test('copy-mode: id rebind is self-consistent (env→task linkage preserved)', () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);
  const first = exportCurrent(h, FIXTURE_SYSTEM_ID);

  const copy = prepareForImport(first, 'copy');

  // System + realm + environment container ids regenerated.
  assert.equal(copy.system.id, undefined, 'system id stripped for copy');
  const newRealmId = copy.system.gatheringRealms[0].id;
  assert.notEqual(newRealmId, FIXTURE_REALM_ID, 'realm id regenerated');

  // Env realm refs rewired to the new realm id.
  for (const env of copy.gatheringEnvironments) {
    if (env.includedRealmIds?.length) {
      assert.deepEqual(env.includedRealmIds, [newRealmId]);
    }
  }

  // Task ids PRESERVED, so env→task linkage still resolves.
  const taskId = copy.gatheringConfig.system.tasks[0].id;
  const targeted = copy.gatheringEnvironments.find((e) => e.selectionMode === 'targeted');
  assert.ok(targeted.enabledTaskIds.includes(taskId), 'env still references the preserved task id');
});

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

  // ── issue 1095, stated FIELD BY FIELD rather than left to the deep-equal ──────────
  //
  // The envelope comparison above is a strong guard, but it cannot distinguish "both
  // exports carry the field" from "NEITHER does". Every field below is absence-preserving
  // or authoredness-keyed, and the shape a dropped key produces is a legal shape — so the
  // round-trip has to be asserted POSITIVELY, against the non-default fixture values.
  const exported = second.system;
  assert.deepEqual(
    exported.checkModifiers,
    [
      { id: 'mod-medicine', label: 'Medicine', expression: '@abilities.med.mod', min: -1, max: 5 },
      { id: 'mod-alchemy', label: 'Alchemy', expression: '@abilities.alch.mod' },
    ],
    'the catalogue round-trips at the SYSTEM level, and the unbounded entry keeps NEITHER ' +
      'bound key — an absence-preserving field that acquired `min: 0` on the way through ' +
      'would still be a legal catalogue'
  );
  for (const [key, policy, ids, cap] of [
    ['craftingCheck', 'bySubject', ['mod-medicine'], 2],
    ['salvageCraftingCheck', 'highest', ['mod-medicine', 'mod-alchemy'], 1],
    ['gatheringCraftingCheck', 'bySubject', ['mod-alchemy'], 3],
  ]) {
    assert.equal(exported[key].defaultModifierPolicy, policy, `${key}: the rule round-trips`);
    assert.deepEqual(exported[key].defaultModifierIds, ids, `${key}: the id set round-trips`);
    assert.equal(exported[key].maxModifierPicks, cap, `${key}: the cap round-trips`);
  }
  const herb = exported.components.find((component) => component.id === 'comp-herb');
  assert.deepEqual(
    herb.salvage.checkModifierIds,
    [],
    'an AUTHORED EMPTY component pick survives as a pick of zero — the one shape a ' +
      'truthiness test loses, and it resolves to a DIFFERENT roll from an absent one'
  );
  const ore = exported.components.find((component) => component.id === 'comp-ore');
  assert.equal(
    Object.hasOwn(ore.salvage ?? {}, 'checkModifierIds'),
    false,
    '…and a component that authored nothing keeps the key ABSENT, so it goes on inheriting'
  );
  const task = second.gatheringConfig.system.tasks.find((entry) => entry.name === 'Forage Herbs');
  assert.deepEqual(
    task.checkModifierIds,
    ['mod-medicine', 'mod-alchemy'],
    'the gathering task pick round-trips through BOTH mirrored normalizers'
  );
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

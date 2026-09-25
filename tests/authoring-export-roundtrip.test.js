/**
 * Q1 — TRUE single-store KEEP-mode round-trip. export → import → export through ONE shared
 * in-memory settings map + the REAL GatheringEnvironmentStore, so the second export reads exactly
 * what the import persisted.
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
const { emptyCopyOptions } = await import('./helpers/worldEntityIndex.js');

function seedFutureCheckFields(fixture) {
  const authoredEvaluations = new Map();
  let ordinal = 0;
  for (const [checkName, slots] of [
    ['craftingCheck', ['simple', 'progressive', 'routed']],
    ['salvageCraftingCheck', ['simple', 'progressive', 'routed']],
    ['gatheringCraftingCheck', ['progressive', 'routed']],
  ]) {
    for (const slot of slots) {
      ordinal += 1;
      const evaluation = {
        product: 'count',
        direction: 'under',
        target: {
          source: 'attribute',
          expression: `@skills.repair.value + ${ordinal}`,
          adjustmentKind: 'multiply',
          baseAdjustment: 0.5,
        },
        pool: {
          die: 20,
          base: '@abilities.int.value',
          threshold: '@skills.repair.value',
          required: ordinal,
          modifierDestination: 'threshold',
          zeroPoolFails: false,
          explode: { enabled: true, faces: { kind: 'from', value: 19 }, once: true },
          cancel: { enabled: true, faces: { kind: 'from', value: 2 } },
          additionalDice: {
            enabled: true,
            source: 'macro',
            path: 'system.resources.ap.value',
            readMacroUuid: 'Macro.read',
            spendMacroUuid: 'Macro.spend',
            max: 4,
          },
        },
      };
      fixture.system[checkName][slot] ??= {};
      fixture.system[checkName][slot].evaluation = evaluation;
      authoredEvaluations.set(`${checkName}.${slot}`, evaluation);
    }
  }
  fixture.system.craftingCheck.simple.tiers = [
    { id: 'tier', name: 'Hard', dc: 15, adjustment: 0.5, successes: 3 },
  ];
  fixture.system.craftingCheck.routed.relativeOutcomes = [
    { id: 'outcome', name: 'Hard', dc: 3, adjustment: 0.2 },
  ];
  fixture.system.components.find((component) => component.id === 'comp-herb').salvage = {
    ...fixture.system.components.find((component) => component.id === 'comp-herb').salvage,
    adjustmentOverride: 0.5,
    successesOverride: 2,
  };
  fixture.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0].adjustmentOverride = 0.2;
  fixture.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0].successesOverride = 4;
  return authoredEvaluations;
}

function assertFutureCheckFields(payload, authoredEvaluations, stage) {
  for (const [key, evaluation] of authoredEvaluations) {
    const [checkName, slot] = key.split('.');
    assert.deepEqual(payload.system[checkName][slot].evaluation, evaluation, `${key} ${stage}`);
  }
  assert.equal(payload.system.craftingCheck.simple.tiers[0].adjustment, 0.5);
  assert.equal(payload.system.craftingCheck.simple.tiers[0].successes, 3);
  assert.equal(payload.system.craftingCheck.routed.relativeOutcomes[0].adjustment, 0.2);
  const salvage = payload.system.components.find((component) => component.id === 'comp-herb').salvage;
  assert.equal(salvage.adjustmentOverride, 0.5);
  assert.equal(salvage.successesOverride, 2);
  assert.equal(payload.gatheringConfig.system.tasks[0].adjustmentOverride, 0.2);
  assert.equal(payload.gatheringConfig.system.tasks[0].successesOverride, 4);
}

test('round-trip: export → import(keep) → export is deep-equal modulo volatile fields', async () => {
  const fixture = buildFullAuthoringFixture();
  const authoredEvaluations = seedFutureCheckFields(fixture);
  const sourceTask = fixture.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0];
  sourceTask.resolutionMode = 'routed';
  sourceTask.resultGroups = [
    {
      id: 'route-rich',
      name: 'Rich',
      results: [
        {
          id: 'result-herb',
          componentId: 'comp-herb',
          quantity: 3,
          // Issue 1645: a rolled amount must survive export → import → export verbatim.
          quantityFormula: '1d4+1',
          propertyMacroUuid: 'Macro.herb-properties'
        }
      ]
    }
  ];
  const h = makeHarness(fixture);

  const first = exportCurrent(h, FIXTURE_SYSTEM_ID);
  assertFutureCheckFields(first, authoredEvaluations, 'first export');

  // Envelope carries the explicit schema markers.
  assert.equal(first.schemaVersion, 6);
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
  assertFutureCheckFields(second, authoredEvaluations, 're-export');

  assert.deepEqual(normalizeExportEnvelope(second), normalizeExportEnvelope(first));

  // issue 1095, stated FIELD BY FIELD rather than left to the deep-equal. The envelope comparison
  // above is a strong guard, but it cannot distinguish "both exports carry the field" from "NEITHER
  // does".
  const exported = second.system;
  assert.equal(exported.modifiers, undefined, 'no per-system copy survives the round trip');
  assert.deepEqual(
    second.characterLibraries.modifiers,
    [
      // `isRollExpression` IS present since issue 1308: the world slice is assembled through the
      // real `normalizeModifierLibrary`, which derives it, whereas the old per-system copy rode
      // this harness's plain-store system manager and was never normalized.
      {
        id: 'mod-medicine',
        label: 'Medicine',
        expression: '@abilities.med.mod',
        isRollExpression: false,
        min: -1,
        max: 5,
      },
      {
        id: 'mod-alchemy',
        label: 'Alchemy',
        expression: '@abilities.alch.mod',
        isRollExpression: false,
      },
      {
        id: 'mod-skilled',
        label: 'Skilled',
        expression: '@abilities.str.mod',
        isRollExpression: false,
      },
    ],
    'the ONE library round-trips in the WORLD slice, and the unbounded entries keep ' +
      'NEITHER bound key — an absence-preserving field that acquired `min: 0` on the way ' +
      'through would still be a legal library'
  );
  assert.deepEqual(
    second.characterLibraries.characterPrerequisites,
    [
      {
        id: 'prereq-smith',
        name: "Smith's Tools",
        icon: 'fa-solid fa-hammer',
        path: 'tools.smith.value',
        op: 'gte',
        value: 1,
      },
    ],
    'and the prerequisite library rides the same slice, comparand and all'
  );
  assert.equal(
    Object.hasOwn(second.gatheringConfig.system, 'characterModifiers'),
    false,
    'and the gathering slice carries no second library (issue 1117)'
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
  assert.equal(task.resolutionMode, 'routed');
  assert.deepEqual(task.resultGroups, sourceTask.resultGroups);
  assert.equal(
    task.resultGroups[0].results[0].quantityFormula,
    '1d4+1',
    'a rolled amount survives export → import → export verbatim (issue 1645)'
  );
  assert.deepEqual(
    task.checkModifierIds,
    ['mod-medicine', 'mod-alchemy'],
    // What this proves is the EXPORT/IMPORT path for the gathering config setting — the pick
    // survives export, `prepareForImport`, the importer's write and a second export.
    'the gathering task pick survives export → import → export'
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
  const sourceTask = fixture.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0];
  sourceTask.resolutionMode = 'straight';
  sourceTask.resultGroups = [
    {
      id: 'copy-result-group',
      name: 'Direct yield',
      results: [
        {
          id: 'copy-result',
          componentId: 'comp-herb',
          systemItemId: 'comp-herb',
          quantity: 2
        }
      ]
    }
  ];
  const h = makeHarness(fixture);
  const first = exportCurrent(h, FIXTURE_SYSTEM_ID);

  const copy = prepareForImport(first, 'copy', emptyCopyOptions());

  // System + environment container ids regenerated.
  assert.equal(copy.system.id, undefined, 'system id stripped for copy');

  // REALM ids are NOT regenerated (issue 1282).
  assert.deepEqual(
    copy.travelConfig.realms.map((realm) => realm.id),
    [FIXTURE_REALM_ID],
    'a copy import shares the world’s realms rather than forking them'
  );

  // Env realm refs therefore stay exactly as authored: they still name the same places.
  for (const env of copy.gatheringEnvironments) {
    if (env.includedRealmIds?.length) {
      assert.deepEqual(env.includedRealmIds, [FIXTURE_REALM_ID]);
    }
  }

  // Task ids PRESERVED, so env→task linkage still resolves.
  const taskId = copy.gatheringConfig.system.tasks[0].id;
  const targeted = copy.gatheringEnvironments.find((e) => e.selectionMode === 'targeted');
  assert.ok(targeted.enabledTaskIds.includes(taskId), 'env still references the preserved task id');

  const copiedHerb = copy.system.components.find((component) => component.name === 'Moonleaf');
  const copiedResult = copy.gatheringConfig.system.tasks[0].resultGroups[0].results[0];
  assert.notEqual(copiedHerb.id, 'comp-herb', 'copy mode regenerated the component id');
  assert.equal(copiedResult.componentId, copiedHerb.id);
  assert.equal(copiedResult.systemItemId, copiedHerb.id);
});

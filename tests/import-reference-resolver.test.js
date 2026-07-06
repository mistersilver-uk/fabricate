/**
 * Q3 — importReferenceResolver: all three dispositions.
 *
 *   - external-resolvable, unchanged        → retained
 *   - external-resolvable, remapped          → remapped (value updated)
 *   - external-absent                        → reported (value kept verbatim)
 *   - broken-internal (id resolves to nothing) → reported (data-integrity)
 *
 * Covers external absence for: environment sceneUuid, realm sceneUuid +
 * sceneRegionUuid, and drop-row itemUuid.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveImportReferences, rebindCopyContainerIds, REFERENCE_KINDS } = await import(
  '../src/systems/importReferenceResolver.js'
);
const { buildFullAuthoringFixture, FIXTURE_SYSTEM_ID, FIXTURE_REALM_ID } = await import(
  './helpers/fullAuthoringFixture.js'
);

function payloadFromFixture() {
  const f = buildFullAuthoringFixture();
  return {
    system: f.system,
    recipes: f.recipes,
    gatheringEnvironments: f.environments,
    // The resolver reads the export shape { system: <slice>, shared }.
    gatheringConfig: { system: f.gatheringConfig.systems[FIXTURE_SYSTEM_ID], shared: {} },
  };
}

test('resolver: reports external-absent scene/scene-region/drop-row-item + environment scene', async () => {
  const payload = payloadFromFixture();
  const { unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async () => null, // everything absent
  });

  const reported = unresolvedReferences.filter((r) => r.disposition === 'reported');
  const kinds = new Set(reported.map((r) => r.kind));
  assert.ok(kinds.has(REFERENCE_KINDS.SCENE), 'environment/realm scene gate reported');
  assert.ok(kinds.has(REFERENCE_KINDS.SCENE_REGION), 'realm scene-region reported');
  assert.ok(kinds.has(REFERENCE_KINDS.DROP_ROW_ITEM), 'drop-row itemUuid reported');

  // Values are preserved verbatim (never nulled out).
  const dropRow = payload.gatheringConfig.system.tasks[0].dropRows.find((r) => r.itemUuid);
  assert.equal(dropRow.itemUuid, 'Compendium.world.items.Item.rare-root');
});

test('resolver: external-resolvable is retained; remapped updates the value', async () => {
  const payload = payloadFromFixture();
  const dropUuid = 'Compendium.world.items.Item.rare-root';
  const { resolved, unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async (uuid) => {
      if (uuid === dropUuid) return { uuid: 'Compendium.world.items.Item.rare-root-v2' }; // remap
      return { uuid }; // resolve unchanged
    },
  });

  const retained = unresolvedReferences.filter((r) => r.disposition === 'retained');
  const remapped = unresolvedReferences.filter((r) => r.disposition === 'remapped');
  assert.ok(retained.length >= 1, 'at least one retained (unchanged) external ref');
  assert.equal(remapped.length, 1, 'exactly one remapped ref');
  assert.equal(remapped[0].kind, REFERENCE_KINDS.DROP_ROW_ITEM);

  // The resolved payload carries the new UUID; the input is untouched.
  const resolvedRow = resolved.gatheringConfig.system.tasks[0].dropRows.find(
    (r) => r.itemUuid && r.itemUuid.includes('rare-root')
  );
  assert.equal(resolvedRow.itemUuid, 'Compendium.world.items.Item.rare-root-v2');
});

test('resolver: broken internal env→task linkage is reported (retained data)', async () => {
  const payload = payloadFromFixture();
  // Point an environment at a task id that does not exist in the library.
  payload.gatheringEnvironments[0].enabledTaskIds = ['ghost-task'];
  const { unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async () => ({ uuid: 'x' }),
  });

  const broken = unresolvedReferences.find(
    (r) => r.kind === REFERENCE_KINDS.TASK_LINK && r.referenceValue === 'ghost-task'
  );
  assert.ok(broken, 'broken task link is reported');
  assert.equal(broken.disposition, 'reported');
});

test('resolver: broken essence sourceComponentId is reported', async () => {
  const payload = payloadFromFixture();
  payload.system.essenceDefinitions[0].sourceComponentId = 'ghost-component';
  const { unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async () => null,
  });
  const broken = unresolvedReferences.find(
    (r) => r.ownerType === 'essence' && r.referenceValue === 'ghost-component'
  );
  assert.ok(broken, 'broken essence→component link reported');
  assert.equal(broken.disposition, 'reported');
  assert.equal(broken.kind, REFERENCE_KINDS.COMPONENT_LINK);
});

test('resolver: broken essence via legacy associatedSystemItemId is reported', async () => {
  const payload = payloadFromFixture();
  delete payload.system.essenceDefinitions[0].sourceComponentId;
  payload.system.essenceDefinitions[0].associatedSystemItemId = 'legacy-ghost';
  const { unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async () => null,
  });
  const broken = unresolvedReferences.find((r) => r.referenceValue === 'legacy-ghost');
  assert.ok(broken, 'legacy alias still reported when broken');
  assert.equal(broken.ownerType, 'essence');
});

test('resolver: broken recipe recipeItemId is reported', async () => {
  const payload = payloadFromFixture();
  payload.recipes[0].recipeItemId = 'missing-def';
  const { unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async () => null,
  });
  const broken = unresolvedReferences.find((r) => r.kind === REFERENCE_KINDS.RECIPE_ITEM);
  assert.ok(broken, 'broken recipeItemId reported');
  assert.equal(broken.referenceValue, 'missing-def');
});

test('resolver: all three dispositions can co-occur', async () => {
  const payload = payloadFromFixture();
  payload.gatheringEnvironments[0].enabledTaskIds = ['ghost-task']; // broken internal → reported
  const dropUuid = 'Compendium.world.items.Item.rare-root';
  const { unresolvedReferences } = await resolveImportReferences(payload, {
    resolveUuid: async (uuid) =>
      uuid === dropUuid ? { uuid: `${uuid}-v2` } : uuid === payload.system.gatheringRealms[0].sceneMappings[0].sceneUuid ? null : { uuid },
  });
  const dispositions = new Set(unresolvedReferences.map((r) => r.disposition));
  assert.ok(dispositions.has('remapped'));
  assert.ok(dispositions.has('retained'));
  assert.ok(dispositions.has('reported'));
});

// --- Copy-mode container rebind (D3: preserve task/event/modifier ids) ---

test('rebindCopyContainerIds: regenerates realm + env ids, preserves task/event/modifier ids', () => {
  const f = buildFullAuthoringFixture();
  const prepared = {
    system: f.system,
    recipes: f.recipes,
    gatheringEnvironments: f.environments,
    gatheringConfig: { system: f.gatheringConfig.systems[FIXTURE_SYSTEM_ID], shared: {} },
  };
  let counter = 0;
  rebindCopyContainerIds(prepared, { generateId: () => `gen-${++counter}` });

  // Realm id regenerated and env cross-refs rewired to the new id.
  const newRealmId = prepared.system.gatheringRealms[0].id;
  assert.notEqual(newRealmId, FIXTURE_REALM_ID, 'realm id regenerated');
  for (const env of prepared.gatheringEnvironments) {
    assert.ok(env.id.startsWith('gen-'), 'env record id regenerated');
    assert.deepEqual(env.includedRealmIds, [newRealmId], 'env realm refs rewired');
  }

  // Task / event / characterModifier ids PRESERVED (D3) so linkages survive.
  const slice = prepared.gatheringConfig.system;
  assert.equal(slice.tasks[0].id, f.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0].id);
  assert.equal(slice.events[0].id, f.gatheringConfig.systems[FIXTURE_SYSTEM_ID].events[0].id);
  assert.equal(
    slice.characterModifiers[0].id,
    f.gatheringConfig.systems[FIXTURE_SYSTEM_ID].characterModifiers[0].id
  );
  // The env still references the preserved task id.
  assert.ok(prepared.gatheringEnvironments[0].enabledTaskIds.includes(slice.tasks[0].id));
});

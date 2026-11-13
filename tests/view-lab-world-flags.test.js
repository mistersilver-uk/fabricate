/**
 * Each world-shaping flag `buildLabWorld` takes, asserted by the world the REAL builder produces
 * (issue 1543). A flag that quietly stopped shaping the world would otherwise surface as a
 * layout-guard error in an unrelated case (which is how issue 1540 was found). The harness boots
 * the lab's Foundry host; each flagged world is built beside the default one it is compared to.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD_SHAPING_LAB_FLAGS, getCaseById } from '../scripts/lib/viewLabCases.js';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

test('each world-shaping flag builds the world it claims, against the default world', async () => {
  await withFabricateLifecycleReplay(async ({ world: control, loadModule }) => {
    const { buildLabWorld, LONG_TRAVEL_LABEL, LONG_TRAVEL_LABEL_KEY } = await loadModule(
      '/tests/view-lab/world/labWorld.js'
    );
    const { settingsKey } = await loadModule('/tests/view-lab/foundry/installFoundryShim.js');
    const setting = (world, key) => world.settings.get(settingsKey('fabricate', key));
    const authoredComponentIds = control.content.componentScope.entities.map(({ id }) => id);

    // The controls: every claim below is only worth making if the default world holds the thing.
    assert.ok(setting(control, 'toolScope').entities.length > 0, 'default has world Tools');
    assert.ok(
      control.content.systems.some((system) => (system.tools ?? []).length > 0),
      'default systems carry Tools'
    );
    assert.ok(setting(control, 'gatheringParties').length > 0, 'default has parties');
    assert.ok(authoredComponentIds.length > 0, 'default authors world components');
    assert.notEqual(control.localize(LONG_TRAVEL_LABEL_KEY), LONG_TRAVEL_LABEL);

    const flagged = async (options) => {
      const world = await buildLabWorld(options);
      try {
        return {
          toolScope: setting(world, 'toolScope'),
          systemTools: world.content.systems.flatMap((system) => system.tools ?? []),
          parties: setting(world, 'gatheringParties'),
          componentIds: setting(world, 'componentScope').entities.map(({ id }) => id),
          componentTags: setting(world, 'worldVocabulary').componentTags,
          label: world.localize(LONG_TRAVEL_LABEL_KEY),
        };
      } finally {
        world.shim.restore();
      }
    };

    const noTools = await flagged({ noTools: true });
    assert.deepEqual(noTools.toolScope.entities, [], 'noTools empties the world tool scope');
    assert.deepEqual(noTools.systemTools, [], 'noTools empties every system’s tools');

    assert.deepEqual((await flagged({ noParties: true })).parties, [], 'noParties');

    assert.ok(
      setting(control, 'worldVocabulary').componentTags.length > 0,
      'default world vocabulary carries component tags'
    );
    const noComponents = await flagged({ noAuthoredWorldComponents: true });
    assert.deepEqual(noComponents.componentTags, [], 'and the flag empties them');
    for (const id of authoredComponentIds) {
      assert.ok(
        !noComponents.componentIds.includes(id),
        `${id} survives noAuthoredWorldComponents`
      );
    }

    assert.equal((await flagged({ longTravelLabels: true })).label, LONG_TRAVEL_LABEL);

    // The drift guard: a new boolean option that builds an absence must be listed, because a list
    // that case selection reads is only as complete as the builder's own options.
    const optionNames = [...buildLabWorld.toString().matchAll(/\b([a-z]\w*) = false\b/g)].map(
      ([, name]) => name
    );
    const absenceOptions = optionNames.filter((name) => /^(?:no[A-Z]|clear|long[A-Z])/.test(name));
    assert.ok(absenceOptions.length >= 5, `the builder's options were not found: ${optionNames}`);
    assert.deepEqual(
      absenceOptions.filter((name) => !WORLD_SHAPING_LAB_FLAGS.includes(name)),
      [],
      'these buildLabWorld options shape the world but are missing from WORLD_SHAPING_LAB_FLAGS'
    );
    assert.deepEqual(
      WORLD_SHAPING_LAB_FLAGS.filter((name) => !optionNames.includes(name)),
      [],
      'WORLD_SHAPING_LAB_FLAGS names an option buildLabWorld no longer takes'
    );
  });
});

test('the salvage-triggers Runework state gives the component editor progressive triggers (issue 1865)', async () => {
  await withFabricateLifecycleReplay(async ({ world: control, loadModule }) => {
    const { buildLabWorld } = await loadModule('/tests/view-lab/world/labWorld.js');
    const triggersOf = (world) =>
      world.fabricate.craftingSystemManager
        .getSystem('lab-runework')
        .salvageCraftingCheck?.progressive?.checkBreakage?.triggers?.map(({ id }) => id) ?? [];
    assert.deepEqual(
      triggersOf(control),
      [],
      'the default Runework names none on a progressive block'
    );

    const shaped = await buildLabWorld({ runeworkCheckMode: 'salvage-triggers' });
    try {
      const system = shaped.fabricate.craftingSystemManager.getSystem('lab-runework');
      assert.equal(system.salvageResolutionMode, 'progressive');
      assert.deepEqual(triggersOf(shaped), ['rw-trig-step-target', 'rw-trig-step-up']);
    } finally {
      shaped.shim.restore();
    }
  });
});

test('the tag-picker-empty case builds a world with no component tags in scope or vocabulary', async () => {
  const viewCase = getCaseById('world-tool-entry-on-break-repair-tag-picker-empty');
  assert.equal(viewCase.query.noAuthoredWorldComponents, '1');
  await withFabricateLifecycleReplay(async ({ loadModule }) => {
    const { buildLabWorld } = await loadModule('/tests/view-lab/world/labWorld.js');
    const { settingsKey } = await loadModule('/tests/view-lab/foundry/installFoundryShim.js');
    const world = await buildLabWorld({ noAuthoredWorldComponents: true });
    try {
      const get = (key) => world.settings.get(settingsKey('fabricate', key));
      assert.deepEqual(get('worldVocabulary').componentTags, []);
      const tagged = get('componentScope').entities.filter((entity) => entity.tags?.length > 0);
      assert.deepEqual(
        tagged.map(({ id }) => id),
        [],
        'no world component record carries a tag either'
      );
    } finally {
      world.shim.restore();
    }
  });
});

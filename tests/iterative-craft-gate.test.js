/** Every existing craft path refuses an iterative recipe before it spends anything (`resolution-modes`). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';

const { ITERATIVE_CRAFT_REFUSAL } = await import('../src/systems/iterative/iterativeCraftGate.js');

const TIMED_STEP = {
  ingredients: [{ componentId: 'wood', quantity: 2 }],
  results: [{ componentId: 'plank', quantity: 1 }],
  timeRequirement: { hours: 1 },
};

/** A craft world whose system and resolution service both answer `mode`. */
const world = (mode, spec = {}) =>
  craftProbe({
    resolutionMode: mode,
    resolutionService: probeResolutionService({ mode }),
    ...spec,
  });

const SPENDING = /^(run\.createRun|item\.|actor\.|currency\.|chat\.create)/u;
const messageOf = (result) => String(result?.message ?? result?.error ?? '');

/** Stock and currency unchanged, no active run, and no spending journal entry. */
function assertNothingSpent(probe) {
  assert.deepEqual(
    probe.stockItems.map((item) => [item.id, item.system.quantity, item.deleted]),
    [['wood', 5, false]]
  );
  assert.deepEqual(probe.runManager.getActiveRuns(probe.craftingActor), []);
  const spent = probe.journal.entries.map(([name]) => name).filter((name) => SPENDING.test(name));
  assert.deepEqual(spent, []);
}

/** The versioned engine with a grant that always attests, and the probe recipe served by id. */
function versionedEngine(probe) {
  probe.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'op' }),
  });
  probe.engine.recipeManager.getRecipe = () => probe.recipe;
  return probe.engine;
}

/** A stage preparation's answer; a simple stage's later failure on the bare run is not a refusal. */
async function stagePreparation(probe, started) {
  try {
    return await probe.engine._versionedStagePreparation({
      run: { id: 'run-probe', steps: [] },
      actor: probe.craftingActor,
      componentSourceActors: [probe.sourceActor],
      recipe: probe.recipe,
      step: probe.executionSteps[0],
      stepIndex: 0,
      started,
    });
  } catch (error) {
    return { message: String(error?.message) };
  }
}

/** Each craft path, as a call answering its result for a world of the given mode. */
const PATHS = {
  'legacy craft, untimed': async (mode) => {
    const probe = world(mode);
    return { probe, result: await probe.craft() };
  },
  'legacy craft, timed': async (mode) => {
    const probe = world(mode, { steps: [TIMED_STEP] });
    return { probe, result: await probe.craft() };
  },
  'versioned start refusal': async (mode) => {
    const probe = world(mode);
    const result = probe.engine._versionedRunStartRefusal({
      viewer: { id: 'user-probe' },
      actor: probe.craftingActor,
      sourceActors: [probe.sourceActor],
      recipe: probe.recipe,
      trusted: null,
      runManager: probe.engine._craftingRunManager(),
    });
    return { probe, result };
  },
  'versioned start': async (mode) => {
    const probe = world(mode);
    const result = await versionedEngine(probe).startVersionedRun({
      viewer: { id: 'user-probe' },
      actor: probe.craftingActor,
      sourceActors: [probe.sourceActor],
      recipeId: probe.recipe.id,
      executionGrant: 'grant',
      requestId: 'request-start',
    });
    return { probe, result };
  },
  'fresh versioned stage preparation': async (mode) => {
    const probe = world(mode);
    return { probe, result: await stagePreparation(probe, false) };
  },
  'started versioned stage preparation': async (mode) => {
    const probe = world(mode);
    return { probe, result: await stagePreparation(probe, true) };
  },
};

describe('every craft path refuses an iterative recipe, and only an iterative one', () => {
  for (const [path, run] of Object.entries(PATHS)) {
    it(`${path} refuses with nothing spent`, async () => {
      const { probe, result } = await run('iterative');
      assert.ok(messageOf(result).includes(ITERATIVE_CRAFT_REFUSAL), messageOf(result));
      assertNothingSpent(probe);
      if (path.startsWith('legacy craft')) {
        assert.deepEqual(
          probe.journal.entries.map(([name]) => name),
          ['returned']
        );
      }
    });

    it(`${path} does not refuse a simple recipe`, async () => {
      const { result } = await run('simple');
      assert.ok(!messageOf(result).includes(ITERATIVE_CRAFT_REFUSAL), messageOf(result));
    });
  }
});

describe('the paths that already refuse a non-alchemy or salvage system are unchanged', () => {
  it('craftAlchemy refuses an iterative system as non-alchemy', async () => {
    const probe = world('iterative');
    const result = await probe.engine.craftAlchemy(
      probe.craftingActor,
      [probe.sourceActor],
      [{ item: probe.stockItems[0], componentId: 'wood' }],
      { craftingSystemId: probe.system.id }
    );
    assert.equal(result.message, 'No alchemy-mode crafting system found');
    assertNothingSpent(probe);
  });

  it('prepareVersionedAlchemyStart refuses an iterative system as non-alchemy', async () => {
    const probe = world('iterative');
    probe.stockItems[0].parent = probe.sourceActor;
    const result = await versionedEngine(probe).prepareVersionedAlchemyStart({
      actor: probe.craftingActor,
      sourceActors: [probe.sourceActor],
      craftingSystemId: probe.system.id,
      submittedItems: [{ item: probe.stockItems[0], componentId: 'wood' }],
      executionGrant: 'grant',
      requestId: 'request-alchemy',
    });
    assert.equal(messageOf(result), 'No alchemy-mode crafting system found.');
    assertNothingSpent(probe);
  });

  it('salvage keeps its own mode inside an iterative system', async () => {
    const probe = salvageProbe({
      resultGroups: [
        { id: 'sg', name: 'Shards', results: [{ id: 'r', componentId: 'shard', quantity: 1 }] },
      ],
    });
    game.fabricate.getCraftingSystemManager().getSystem('sys-salvage').resolutionMode = 'iterative';
    const result = await probe.salvage();
    assert.equal(result.success, true, messageOf(result));
    assert.ok(!messageOf(result).includes(ITERATIVE_CRAFT_REFUSAL));
  });
});

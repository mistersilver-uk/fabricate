/** Starting an iterative run or step: its readiness gate, its one consumption and its step state. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ITERATIVE_CRAFT_REFUSAL } from '../src/systems/iterative/iterativeCraftGate.js';

import {
  forgeLibrary,
  forgeRecipe,
  iterativeCommandWorld,
} from './helpers/iterativeCommandWorld.js';

const ores = (world) => world.actor.items.filter((item) => item.componentId === 'ore').length;
const messageOf = (result) => String(result?.message ?? result?.error ?? '');

describe('an iterative run start', () => {
  it('consumes once, writes the step state and answers the started run', async () => {
    const world = iterativeCommandWorld();
    const reply = await world.start();
    assert.equal(reply.success, true, JSON.stringify(reply));
    assert.equal(ores(world), 2);
    const run = world.run();
    assert.equal(run.status, 'inProgress');
    assert.equal(reply.canExecuteImmediately, false);
    assert.ok(run.steps[0].preparedConsumption, 'the step started');
    assert.deepEqual(world.stepState(0).counters, [
      { counterId: 'heat', value: 0 },
      { counterId: 'fuel', value: 6 },
    ]);
    assert.deepEqual(world.stepState(0).startedWith, [
      { counterId: 'heat', value: 0, formulaValue: null, rolls: [], clamped: false },
      { counterId: 'fuel', value: 6, formulaValue: null, rolls: [], clamped: false },
    ]);
    assert.equal(run.termsSnapshot.iterative.version, 1);
    assert.deepEqual(run.steps[0].resolutionSnapshot, { kind: 'none', mode: 'iterative' });
  });

  it('resolves a start formula once against the actor, before anything is spent', async () => {
    const recipe = forgeRecipe();
    recipe.iterative.counters[0] = {
      counterId: 'heat',
      start: 0,
      startFormula: '1d4',
      visible: true,
    };
    const world = iterativeCommandWorld({ recipe, rolls: [3] });
    assert.equal((await world.start()).success, true);
    assert.deepEqual(world.stepState(0).startedWith[0], {
      counterId: 'heat',
      value: 3,
      formulaValue: 3,
      rolls: [3],
      clamped: false,
    });
    assert.deepEqual(world.die.requested, [4]);
  });

  it('refuses a start formula that cannot roll with nothing spent and no run', async () => {
    const recipe = forgeRecipe();
    recipe.iterative.counters[0] = {
      counterId: 'heat',
      start: 0,
      startFormula: '1d4',
      visible: true,
    };
    const world = iterativeCommandWorld({ recipe });
    world.engine.rollDie = () => {
      throw new Error('no dice');
    };
    const reply = await world.start();
    assert.equal(reply.success, false);
    assert.equal(reply.reason, 'roll-unavailable');
    assert.equal(ores(world), 3);
    assert.deepEqual(world.manager.getActiveRuns(world.actor), []);
  });

  it('arms a one-hour gate in the start commit and leaves the run and step waiting', async () => {
    const world = iterativeCommandWorld({ timeRequirement: { hours: 1 } });
    await world.start();
    const run = world.run();
    assert.equal(ores(world), 2);
    assert.equal(run.status, 'waitingTime');
    assert.equal(run.steps[0].status, 'waitingTime');
    assert.equal(run.steps[0].timeGate.requiredSeconds, 3600);
    assert.ok(world.stepState(0), 'the state is written with the gate');
    run.completionMode = 'worldTime';
    await world.manager.updateRun(world.actor, run, { expectedRevision: run.runRevision });
    assert.deepEqual(world.manager.listDueVersionedRuns(1000 + 7200), []);
  });

  it('answers the public craft with the started run and sends no execute', async () => {
    const { executePublicCraft } = await import('../src/systems/journalRunCommands.js');
    const world = iterativeCommandWorld();
    const sent = [];
    const started = await executePublicCraft({
      engine: world.engine,
      runManager: world.manager,
      actor: world.actor,
      sourceActors: [world.actor],
      recipe: world.recipe,
      ingredientSetId: world.recipe.getExecutionSteps()[0].ingredientSets[0].id,
      executeCommand: async (command) => {
        sent.push(command);
      },
    });
    assert.equal(started.success, true, JSON.stringify(started));
    assert.equal(started.canExecuteImmediately, false);
    assert.deepEqual(sent, []);
    assert.equal(world.manager.getActiveRuns(world.actor).length, 1);
  });

  it('gives an untimed single-step recipe an explicit start', async () => {
    const world = iterativeCommandWorld({ steps: 1 });
    const step = world.recipe.getExecutionSteps()[0];
    assert.equal(world.engine._versionedStageNeedsStart(world.recipe, step), true);
    assert.equal((await world.start()).success, true);
    assert.ok(world.stepState(0));
  });
});

describe('the start readiness gate', () => {
  const cases = {
    'a critical recipe-scoped issue': (world) => {
      world.recipe.steps[0].iterative.success = [];
      return 'iterativeNoSuccessRule';
    },
    'a critical library issue on an allowed action': (world) => {
      world.system.iterative.actions[0].check = 'sometimes';
      return 'iterativeInvalidEntry';
    },
    'an inverted global counter an instance uses': (world) => {
      Object.assign(world.system.iterative.counters[1], { min: 9, max: 1 });
      return 'iterativeBoundsInverted';
    },
    'an inverted global counter only a reachable action names': (world) => {
      world.system.iterative.counters.push({
        id: 'spark',
        label: 'Spark',
        limit: 'global',
        min: 9,
        max: 1,
      });
      world.system.iterative.actions[0].effects.push({
        id: 'kindle',
        when: { combine: 'all' },
        target: { kind: 'counter', counterId: 'spark' },
        op: 'add',
        amount: '1',
      });
      return 'iterativeBoundsInverted';
    },
    'an unsupported library version': (world) => {
      world.system.iterative = { ...forgeLibrary(), version: 99 };
      return 'iterativeVersionUnsupported';
    },
  };
  for (const [name, arrange] of Object.entries(cases)) {
    it(`refuses ${name} with nothing spent and no run`, async () => {
      const world = iterativeCommandWorld();
      const code = arrange(world);
      const reply = await world.start();
      assert.equal(reply.success, false);
      assert.equal(reply.reason, 'iterative-not-ready');
      assert.equal(reply.message ?? null, null, 'no top-level sentence hides the localized one');
      assert.equal(reply.detail?.code, code);
      assert.equal(ores(world), 3);
      assert.deepEqual(world.manager.getActiveRuns(world.actor), []);
    });
  }
});

describe('a library issue outside the terms subset', () => {
  it('does not block a start on a counter nothing the recipe reaches names', async () => {
    const world = iterativeCommandWorld();
    world.system.iterative.counters.push({
      id: 'spare',
      label: 'Spare',
      limit: 'global',
      min: 9,
      max: 1,
    });
    const reply = await world.start();
    assert.equal(reply.success, true, JSON.stringify(reply));
    assert.equal(
      world.run().termsSnapshot.iterative.counters.some((entry) => entry.id === 'spare'),
      false
    );
  });
});

describe('the narrowed craft gate', () => {
  async function started(options = {}) {
    const world = iterativeCommandWorld(options);
    await world.start();
    return world;
  }

  it('refuses a manual execute, a stage check and an immediate-execute probe', async () => {
    const world = await started({ steps: 1 });
    const run = world.run();
    const recipe = world.recipe;
    const [step] = recipe.getExecutionSteps();
    const selectedSet = step.ingredientSets[0];
    const args = { actor: world.actor, componentSourceActors: [world.actor], runId: run.id };
    world.engine.installVersionedRunAuthority({
      consumeExecutionGrant: async () => ({ operationId: 'op' }),
    });
    const executed = await world.engine.executeVersionedStage({
      ...args,
      expectedRevision: run.runRevision,
      executionGrant: 'grant',
      requestId: 'execute',
    });
    assert.ok(messageOf(executed).includes(ITERATIVE_CRAFT_REFUSAL), messageOf(executed));
    await assert.rejects(
      world.engine.describeVersionedStageCheck({ ...args, preparationGrant: 'g', requestId: 'd' }),
      (error) => String(error.message).includes(ITERATIVE_CRAFT_REFUSAL)
    );
    const immediate = await world.engine._canExecuteVersionedStageImmediately({
      run,
      actor: world.actor,
      componentSourceActors: [world.actor],
      recipe,
      step,
      selectedSet,
    });
    assert.equal(immediate, false);
    assert.equal(ores(world), 2, 'only the start spent');
  });

  it('begins a later step carrying the earlier step counters, the counts at zero', async () => {
    const world = await started();
    const run = world.run();
    run.steps[0].iterative = { ...world.stepState(0), attemptCount: 4, sessionCount: 4 };
    run.steps[0].iterative.counters = [
      { counterId: 'heat', value: 5 },
      { counterId: 'fuel', value: 2 },
    ];
    const saved = await world.manager.updateRun(world.actor, run, {
      expectedRevision: run.runRevision,
    });
    await world.manager.completeStepSuccess(world.actor, saved, 0, {}, {});
    const begun = await world.begin();
    assert.equal(begun.success, true, JSON.stringify(begun));
    assert.equal(ores(world), 1);
    const next = world.stepState(1);
    assert.deepEqual(next.counters, [
      { counterId: 'heat', value: 5 },
      { counterId: 'fuel', value: 2 },
    ]);
    assert.equal(next.attemptCount, 0);
    assert.equal(next.sessionCount, 0);
    assert.deepEqual(next.startedWith[0], {
      counterId: 'heat',
      value: 5,
      formulaValue: null,
      rolls: [],
      clamped: false,
    });
  });
});

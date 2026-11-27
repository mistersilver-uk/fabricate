/**
 * The iterative workbench's lab world (issue 3011): the `workpiece` Ironworks, the run each
 * `iterative-*` Journal state persists, and the controller that answers the Journal's commands.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';
import { Recipe } from '../src/models/Recipe.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import { buildAttemptLibrary } from '../src/systems/iterative/attemptLibrary.js';
import {
  appendAttemptEntry,
  readIterativeStepState,
} from '../src/systems/iterative/iterativeStepState.js';
import { resolveAttempt } from '../src/systems/iterative/resolveAttempt.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import { scriptedRollDie } from './helpers/scriptedRollDie.js';
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import { buildDocumentIndex, buildLabActors } from './view-lab/world/labActors.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';
import { seedIterativeState } from './view-lab/world/labIterative.js';
import {
  HIDDEN_COUNTER,
  ITERATIVE_SCENARIOS,
  seedWorkpieceJourney,
} from './view-lab/world/labIterativeRuns.js';
import {
  LAB_JOURNAL_CASE_STATE_RUN_IDS,
  buildLabRunStates,
  createLabJournalCaseController,
  installLabRunStates,
} from './view-lab/world/labRunStates.js';

/** Issue 3011's reachable-state matrix, as the run states its frames render, written out by hand. */
const MATRIX_STATES = Object.freeze([
  'list',
  'history',
  'record',
  'resume',
  'idle',
  'fresh',
  'cards',
  'no-action',
  'result',
  'result-nocheck',
  'busy',
  'unanswered',
  'throw',
  'stale',
  'error',
  'refusal-cost-unaffordable',
  'refusal-action-unavailable',
  'refusal-unknown-counter',
  'step-done',
  'starting',
  'begin-stale',
  'step-started',
  'routes',
  'finished',
  'failed',
  'failed-nothing',
  'cancel',
  'cancel-single-refund',
  'single',
  'past-step',
  'future-step',
  'waiting',
  'authority',
  'unsupported',
  'gm',
  'redacted',
  'sessions',
  'narrow',
]);

const USER = 'user-lab-player';

const workpieceContent = () => {
  const content = buildLabContent();
  seedIterativeState(content, 'workpiece');
  return content;
};

function boot(state, { content = workpieceContent() } = {}) {
  const actor = { uuid: 'Actor.lab-workpiece', id: 'lab-workpiece', flags: {} };
  const containers = buildLabRunStates({
    actor,
    userId: USER,
    recipes: content.recipes,
    environments: content.environments,
    tasks: content.gatheringConfig.tasks,
    journalCaseState: state,
  });
  const persisted = [];
  const controller = createLabJournalCaseController({
    actor,
    containers,
    state,
    recipes: content.recipes,
    onPersist: () => {
      persisted.push(structuredClone(containers));
    },
  });
  const runId = ITERATIVE_SCENARIOS[state].runId;
  const run = () => containers.craftingRuns.active[runId];
  const command = (action, extra = {}) => ({
    actorUuid: actor.uuid,
    runType: 'crafting',
    runId,
    action,
    expectedRevision: run()?.runRevision,
    ...extra,
  });
  const press = (actionId, attemptId, overrides = {}) =>
    controller.execute(command('takeAction', { payload: { actionId, attemptId }, ...overrides }));
  return { actor, containers, controller, persisted, run, runId, command, press };
}

const stepStateOf = (run, index = run.currentStepIndex) =>
  readIterativeStepState(run.steps[index].iterative).state;

test('the run-state tables hold exactly the states the matrix renders, each with its own run', () => {
  assert.deepEqual(
    Object.keys(ITERATIVE_SCENARIOS).toSorted(byCodePoint),
    MATRIX_STATES.map((state) => `iterative-${state}`).toSorted(byCodePoint)
  );
  for (const [state, { runId }] of Object.entries(ITERATIVE_SCENARIOS)) {
    assert.equal(LAB_JOURNAL_CASE_STATE_RUN_IDS[state], runId, state);
    const { containers, run } = boot(state);
    const runs = Object.values(containers).flatMap((container) => [
      ...Object.values(container.active),
      ...container.history,
    ]);
    assert.ok(
      runs.some((entry) => entry.id === runId),
      `${state} persists ${runId}`
    );
    assert.ok(run() || containers.craftingRuns.history.some((entry) => entry.id === runId), state);
  }
  const tabled = Object.keys(LAB_JOURNAL_CASE_STATE_RUN_IDS).filter((state) =>
    state.startsWith('iterative-')
  );
  assert.equal(tabled.length, MATRIX_STATES.length, 'no other iterative-* state is tabled');
});

test('every iterative Journal case names a tabled state and the workpiece world', () => {
  const cases = VIEW_LAB_CASES.filter((entry) => entry.id.startsWith('player-journal-iterative-'));
  assert.ok(cases.length > 0, 'the workbench registers at least one frame');
  for (const viewCase of cases) {
    assert.equal(viewCase.query.iterative, 'workpiece', viewCase.id);
    assert.ok(Object.hasOwn(ITERATIVE_SCENARIOS, viewCase.query.journalCaseState), viewCase.id);
    assert.equal(viewCase.reaches, 'beyond', viewCase.id);
    assert.deepEqual(viewCase.smokeLabels, [], viewCase.id);
  }
});

test('a state without the workpiece world throws, whatever else the lab holds', () => {
  const plain = buildLabContent();
  seedIterativeState(plain, 'populated');
  for (const state of Object.keys(ITERATIVE_SCENARIOS)) {
    assert.throws(() => boot(state, { content: plain }), /iterative: 'workpiece'/, state);
  }
});

test('the library seeds the sentinel hidden counter, five actions and a three-tier routed check', () => {
  const content = workpieceContent();
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  assert.equal(system.visibilityMode, 'global');
  assert.deepEqual(
    system.iterative.counters.map((entry) => entry.id),
    ['shape', 'finish', 'integrity', 'heat', HIDDEN_COUNTER.id]
  );
  assert.equal(HIDDEN_COUNTER.label, 'Qzx-Hidden-Fit');
  assert.equal(HIDDEN_COUNTER.value, 7731);
  assert.deepEqual(
    system.iterative.actions.map((entry) => [entry.id, entry.check]),
    [
      ['hammer', 'roll'],
      ['planish', 'roll'],
      ['stoke', 'none'],
      ['normalise', 'none'],
      ['fitHilt', 'none'],
    ]
  );
  assert.deepEqual(
    system.craftingCheck.routed.fixedOutcomes.map((entry) => entry.name),
    ['Failure', 'Success', 'Great Success']
  );
  const recipes = content.recipes.filter((entry) => entry.craftingSystemId === system.id);
  assert.deepEqual(
    recipes.map((entry) => entry.id),
    ['iw-r-longsword', 'iw-r-spear', 'iw-r-veiled']
  );
  const [longsword, spear, veiled] = recipes;
  assert.deepEqual(
    longsword.steps.map((step) => (step.resultGroups ?? []).length),
    [0, 3],
    'step 1 has no routes; step 2 has three groups'
  );
  const [fine, plain, slag] = longsword.steps[1].resultGroups;
  assert.ok(fine.producedWhen[0].rules.length > 0);
  assert.deepEqual(plain.producedWhen, [{ end: 'success', rules: [] }]);
  assert.equal(slag.role, 'failure');
  assert.equal(spear.steps, undefined, 'the spear is a single step');
  assert.equal(veiled.name, 'Qzx-Secret-Recipe');
  assert.equal(veiled.steps[0].name, 'Qzx-Secret-Step');
});

test('the journey seed edits nothing outside its own world, and stocks the bar only in it', () => {
  const base = workpieceContent();
  const baseActors = buildLabActors(base);
  const snapshot = () => ({
    content: structuredClone(base),
    flags: baseActors.map((actor) => structuredClone(actor.flags)),
    items: baseActors.map((actor) => actor.items.length),
  });
  const untouched = snapshot();
  for (const [iterative, state] of [
    [null, 'iterative-redacted'],
    ['populated', 'iterative-redacted'],
    ['populated', 'iterative-cancel'],
  ]) {
    seedWorkpieceJourney(base, baseActors, iterative, state);
    assert.deepEqual(snapshot(), untouched, `${iterative}/${state} edits nothing`);
  }

  const content = workpieceContent();
  const actors = buildLabActors(content);
  const held = actors.map((actor) => actor.items.length);
  seedWorkpieceJourney(content, actors, 'workpiece', 'iterative-list');
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  assert.equal(system.visibilityMode, 'global');
  assert.equal(system.features.refundOnPlayerCancel, undefined);
  for (const [index, actor] of actors.entries()) {
    assert.equal(actor.items.length, held[index] + 1, `${actor.id} gains the bar`);
    const bar = actor.items.at(-1);
    assert.equal(bar.uuid, 'Item.iw-iron-bar');
    assert.equal(bar.system.quantity, 6);
    assert.equal(bar.parent, actor);
  }

  seedWorkpieceJourney(content, actors, 'workpiece', 'iterative-redacted');
  assert.equal(system.visibilityMode, 'knowledge');
  const learned = actors[0].flags.fabricate.fabricate.learnedRecipes;
  assert.ok(learned['iw-r-longsword'] && learned['iw-r-spear']);
  assert.ok(!learned['iw-r-veiled']);

  seedWorkpieceJourney(content, actors, 'workpiece', 'iterative-cancel');
  assert.equal(system.features.refundOnPlayerCancel, false);
});

/** The listing a non-GM viewer reads, built by the real builder over a state's run containers. */
function listingOf(state, viewer = { id: USER, isGM: false }) {
  const content = workpieceContent();
  const actors = buildLabActors(content);
  seedWorkpieceJourney(content, actors, 'workpiece', state);
  installFoundryShim({
    documents: buildDocumentIndex(content, actors),
    content,
    actorList: actors,
    scenes: [],
    settings: new Map(),
    i18n: { localize: (key) => key },
    seed: {},
  });
  const actor = actors[0];
  const recipes = content.recipes.map((entry) => new Recipe(entry));
  const containers = buildLabRunStates({
    actor,
    userId: USER,
    recipes,
    environments: content.environments,
    tasks: content.gatheringConfig.tasks,
    journalCaseState: state,
  });
  installLabRunStates(actor, containers);
  const getSystem = (id) => content.systems.find((entry) => entry.id === id);
  const builder = new RunJournalBuilder({
    craftingRunManager: new CraftingRunManager(),
    salvageRunManager: new SalvageRunManager(),
    gatheringRunSource: new GatheringRunManager(),
    recipeManager: { getRecipe: (id) => recipes.find((recipe) => recipe.id === id) },
    recipeVisibility: new RecipeVisibilityService(null, { getSystem }),
    resolutionModeService: new ResolutionModeService({ getSystem }),
    getSystem,
    getComponent: (systemId, id) =>
      getSystem(systemId)?.components.find((entry) => entry.id === id),
    getGatheringTask: () => null,
    nowWorldTime: () => 1_209_600,
  });
  return builder.buildListing({ actor, viewer });
}

test('the real builder lists each state’s run, and the veiled one only as a protected run', () => {
  const list = listingOf('iterative-list');
  assert.deepEqual(
    list.activeRuns.map((entry) => entry.id),
    ['iw-run-longsword', 'iw-run-boundary', 'iw-run-spear']
  );
  assert.deepEqual(
    list.history.map((entry) => [entry.id, entry.status]),
    [
      ['iw-run-failed', 'failed'],
      ['iw-run-made', 'succeeded'],
    ]
  );
  assert.equal(list.activeRuns[0].names.title, 'Forge a Longsword');
  assert.equal(list.activeRuns[0].stepCount, 2);
  assert.equal(list.activeRuns[2].stepCount, 1);

  const [veiled] = listingOf('iterative-redacted').activeRuns;
  assert.equal(veiled.redacted, true);
  assert.doesNotMatch(JSON.stringify(veiled), /Qzx|7731/);
});

test('a press is resolveAttempt plus appendAttemptEntry, its attempt id included', async () => {
  const world = boot('iterative-result');
  const before = structuredClone(stepStateOf(world.run()));
  const terms = world.run().termsSnapshot;
  const library = buildAttemptLibrary(terms.iterative, terms.recipe, 0);
  const hammer = library.actions.find((entry) => entry.id === 'hammer');
  const resolved = resolveAttempt({
    state: before,
    action: hammer,
    library,
    rollData: {},
    check: { success: false, outcomeId: 'failure', value: 7 },
    rollDie: scriptedRollDie([], { fill: 1 }).rollDie,
  });
  const expected = appendAttemptEntry(resolved.next, resolved.entry, 'attempt-1');

  const reply = await world.press('hammer', 'attempt-1');
  assert.equal(reply.success, true);
  assert.deepEqual(stepStateOf(world.run()), expected);
  assert.equal(world.run().steps[0].iterative.log.at(-1).requestId, 'attempt-1');
  assert.deepEqual(reply.iterative, {
    attempt: expected.log.at(-1),
    stepEnd: null,
    replayed: false,
  });
  assert.equal(reply.runRevision, 4);
  // The failed check paid its costs and applied no effect; the literal pins the oracle above.
  assert.deepEqual(stepStateOf(world.run()).counters, [
    { counterId: 'shape', value: 20 },
    { counterId: 'integrity', value: 10 },
    { counterId: 'heat', value: 50 },
    { counterId: HIDDEN_COUNTER.id, value: HIDDEN_COUNTER.value },
  ]);
  assert.equal(world.persisted.length, 1);
});

test('two fresh controllers answer the same press the same way', async () => {
  const [a, b] = [boot('iterative-result-nocheck'), boot('iterative-result-nocheck')];
  const replies = await Promise.all([a.press('stoke', 'same-id'), b.press('stoke', 'same-id')]);
  assert.deepEqual(replies[0], replies[1]);
  assert.deepEqual(a.containers, b.containers);
  assert.equal(replies[0].iterative.attempt.check, null, 'an unchecked action rolls nothing');
});

test('a repeat press at the same revision is stale-run and changes nothing', async () => {
  const world = boot('iterative-result');
  const revision = world.run().runRevision;
  assert.equal(
    (await world.press('hammer', 'first', { expectedRevision: revision })).success,
    true
  );
  const settled = structuredClone(world.containers);
  const second = await world.press('stoke', 'second', { expectedRevision: revision });
  assert.equal(second.success, false);
  assert.equal(second.reason, 'stale-run');
  assert.deepEqual(world.containers, settled);
});

test('a begin writes the carried step state, a zero session count and a bumped revision', async () => {
  const world = boot('iterative-step-started');
  const revision = world.run().runRevision;
  assert.equal(world.run().steps[1].iterative, undefined, 'the boundary has no step state yet');
  assert.deepEqual(await world.controller.execute(world.command('beginStep')), { success: true });
  const state = stepStateOf(world.run());
  assert.equal(state.sessionCount, 0);
  assert.equal(state.attemptCount, 0);
  assert.deepEqual(state.log, []);
  assert.deepEqual(
    state.startedWith.map(({ counterId, value }) => [counterId, value]),
    [
      ['shape', 60],
      ['integrity', 9],
      ['heat', 35],
      [HIDDEN_COUNTER.id, HIDDEN_COUNTER.value],
    ]
  );
  assert.equal(world.run().runRevision, revision + 1);
  assert.equal(world.run().steps[1].status, 'inProgress');
  assert.ok(world.run().steps[1].preparedConsumption);
});

test('busy and starting never answer, and leave no timer behind', async () => {
  for (const [state, command] of [
    ['iterative-busy', (world) => world.press('hammer', 'busy-id')],
    ['iterative-starting', (world) => world.controller.execute(world.command('beginStep'))],
  ]) {
    const world = boot(state);
    const timers = () =>
      process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
    const baseline = timers();
    const outcome = await Promise.race([
      command(world),
      new Promise((resolve) => setImmediate(() => resolve('pending'))),
    ]);
    assert.equal(outcome, 'pending', `${state} stays unanswered`);
    assert.equal(timers(), baseline, `${state} holds no timer`);
    assert.equal(world.persisted.length, 0, `${state} writes nothing`);
  }
});

test('the controller states answer with the replies the Journal must classify', async () => {
  const table = [
    ['iterative-unanswered', { success: false, reason: 'command-timeout' }],
    ['iterative-error', { success: false, reason: 'roll-unavailable' }],
    [
      'iterative-refusal-cost-unaffordable',
      {
        success: false,
        reason: 'cost-unaffordable',
        detail: { entryId: 'rest', counterId: 'heat', amount: 50, value: 40 },
      },
    ],
    [
      'iterative-refusal-action-unavailable',
      { success: false, reason: 'action-unavailable', detail: { actionId: 'hammer' } },
    ],
    [
      'iterative-refusal-unknown-counter',
      { success: false, reason: 'unknown-counter', detail: { counterId: 'finish' } },
    ],
  ];
  for (const [state, expected] of table) {
    const world = boot(state);
    const before = structuredClone(world.containers);
    const reply = await world.press('hammer', 'canned');
    assert.equal(reply.success, expected.success, state);
    assert.equal(reply.reason, expected.reason, state);
    assert.deepEqual(reply.detail ?? undefined, expected.detail ?? reply.detail, state);
    assert.deepEqual(world.containers, before, `${state} changes nothing`);
  }
  const thrown = boot('iterative-throw');
  await assert.rejects(() => thrown.press('hammer', 'thrown'), /threw/);
});

test('iterative-stale appends the other window’s Stoke, bumps the revision and refuses', async () => {
  const world = boot('iterative-stale');
  const revision = world.run().runRevision;
  const attempts = stepStateOf(world.run()).attemptCount;
  const reply = await world.press('hammer', 'mine');
  assert.equal(reply.reason, 'stale-run');
  assert.equal(world.run().runRevision, revision + 1);
  const state = stepStateOf(world.run());
  assert.equal(state.attemptCount, attempts + 1);
  assert.equal(state.log.at(-1).actionId, 'stoke');
  assert.notEqual(state.log.at(-1).requestId, 'mine', 'it is not the pressed attempt');
  assert.equal(world.persisted.length, 1);
});

test('iterative-begin-stale bumps the revision and refuses the begin', async () => {
  const world = boot('iterative-begin-stale');
  const revision = world.run().runRevision;
  const reply = await world.controller.execute(world.command('beginStep'));
  assert.equal(reply.reason, 'stale-run');
  assert.equal(world.run().runRevision, revision + 1);
  assert.equal(world.run().steps[1].iterative, undefined, 'the step was not started');
});

test('a step end settles as the engine does: the next step, or the run archived', async () => {
  const done = boot('iterative-step-done');
  const reply = await done.press('hammer', 'finish-step');
  assert.deepEqual(reply.iterative.stepEnd, { kind: 'success', attempt: 2, resultGroupId: null });
  assert.equal(done.run().currentStepIndex, 1);
  assert.equal(done.run().steps[0].status, 'succeeded');
  assert.equal(done.run().steps[1].status, 'inProgress');
  assert.equal(done.run().steps[1].iterative, undefined, 'the next step is unstarted');
  assert.equal(done.containers.craftingRuns.history.length, 0);

  const finished = boot('iterative-finished');
  const ended = await finished.press('fitHilt', 'finish-run');
  assert.equal(ended.iterative.stepEnd.kind, 'success');
  const [made] = finished.containers.craftingRuns.history;
  assert.equal(made.status, 'succeeded');
  assert.equal(finished.run(), undefined);
  assert.equal(made.termsSnapshot, undefined, 'an archived run drops its terms');
  assert.ok(made.steps[0].iterative.labels, 'and keeps the labels its terms held');
  assert.deepEqual(
    made.steps[0].createdResults.map((entry) => [entry.componentId, entry.name]),
    [['iw-spearhead', 'Spearhead']]
  );

  const failed = boot('iterative-failed');
  assert.equal((await failed.press('hammer', 'break')).iterative.stepEnd.kind, 'failure');
  const [lost] = failed.containers.craftingRuns.history;
  assert.equal(lost.status, 'failed');
  assert.deepEqual(
    lost.steps[1].createdResults.map((entry) => entry.componentId),
    ['iw-slag']
  );

  const nothing = boot('iterative-failed-nothing');
  await nothing.press('hammer', 'break');
  assert.deepEqual(nothing.containers.craftingRuns.history[0].steps[0].createdResults, []);
});

test('each scripted check is the one its state names, and only a rolled action reads it', async () => {
  const miss = boot('iterative-result');
  assert.deepEqual((await miss.press('hammer', 'a')).iterative.attempt.check, {
    success: false,
    outcomeId: 'failure',
    value: 7,
  });
  const hit = boot('iterative-step-done');
  assert.deepEqual((await hit.press('hammer', 'b')).iterative.attempt.check, {
    success: true,
    outcomeId: 'success',
    value: 14,
  });
});

test('the authority state starts without a ledger, and no other iterative state does', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('view-lab/world/labWorld.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /\['authority-unavailable', 'iterative-authority'\]\.includes\(journalCaseState\)/
  );
  assert.match(source, /seedWorkpieceJourney\(content, actors, iterative, journalCaseState\)/);
});

/**
 * Issue 1773 PR3, V&A 15: a run that still owes an award choice survives the history trim and the
 * prunes, is skipped by the world-time sweep, and is not settled history until the choice is; the
 * settle write admits only its own operation, once, and claimability is judged against the world.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { memberUnclaimableReason } from '../src/systems/awardChoiceSettle.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

import { mergeHistoryFlag } from './helpers/journal-fixtures.js';

const FLAG = 'fabricate.craftingRuns';

function makeActor() {
  return {
    name: 'Crafter',
    uuid: 'Actor.crafter',
    isOwner: true,
    flags: {},
    getFlag(namespace, key) {
      return this.flags[namespace]?.[key];
    },
    async setFlag(namespace, key, value) {
      this.flags[namespace] ??= {};
      this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], value);
      return this;
    },
  };
}

function setup() {
  let id = 0;
  const actor = makeActor();
  Object.assign(globalThis, {
    foundry: { utils: { randomID: () => `rid-${++id}` } },
    game: { user: { id: 'user-1' }, time: { worldTime: 1000 }, actors: [actor] },
  });
  return { actor, manager: new CraftingRunManager() };
}

const recipe = {
  id: 'recipe-owed',
  craftingSystemId: 'system',
  getExecutionSteps: () => [{ id: 'step', name: 'Only Step' }],
};

const owedChoice = (extra = {}) => ({
  choiceId: 'pick',
  resultGroupId: 'set',
  awardStrategy: 'anyOne',
  count: 1,
  alternatives: [{ id: 'a', componentId: 'ore', quantity: 1 }],
  ...extra,
});

/** A terminal run whose only step holds `choice`. */
async function archived(actor, manager, choice) {
  const run = await manager.createRun(actor, recipe, [actor], 'user-1', { lifecycleVersion: 1 });
  run.steps[0].pendingAwardChoices = [choice];
  await manager.completeRun(actor, run, 'succeeded');
  return run.id;
}

const historyIds = (manager, actor) => {
  manager.invalidateCache(actor.id);
  return manager.getRunHistory(actor).map((run) => run.id);
};

test('1773 V&A 15: a 51st history run never evicts a run that owes a choice', async () => {
  const { actor, manager } = setup();
  const owed = await archived(actor, manager, owedChoice());
  const settled = await archived(
    actor,
    manager,
    owedChoice({ picks: ['a'], settledAt: 5, outcome: 'awarded' })
  );
  for (let index = 0; index < 50; index += 1) {
    await manager.recordFizzle(actor, { craftingSystemId: 'system' });
  }
  const ids = historyIds(manager, actor);
  assert.equal(ids.length, 51, 'fifty runs and the one still owed');
  assert.ok(ids.includes(owed), 'the owed run is kept');
  assert.ok(!ids.includes(settled), 'a settled run is trimmed as before');
});

test('1773 V&A 15: the prunes keep a run that owes a choice', async () => {
  const { actor, manager } = setup();
  const owed = await archived(actor, manager, owedChoice());
  const plain = await archived(actor, manager, owedChoice({ settledAt: 1, outcome: 'forfeited' }));
  await manager.removeRunsForRecipes([recipe.id]);
  assert.deepEqual(historyIds(manager, actor), [owed], 'the recipe prune');
  await manager.removeRunsForSystem('system');
  assert.deepEqual(historyIds(manager, actor), [owed], 'the system prune');
  await manager.cleanupInvalidRuns(new Set(), new Set());
  assert.deepEqual(historyIds(manager, actor), [owed], 'the corpus prune');
  assert.ok(plain);
});

test('1773 V&A 15: the world-time sweep skips a run that owes a choice', async () => {
  const { actor, manager } = setup();
  const run = await manager.createRun(actor, recipe, [actor], 'user-1', { lifecycleVersion: 1 });
  await manager.setCompletionMode(actor, run.id, 'worldTime', { expectedRevision: 0 });
  await manager.markStepWaitingForTime(actor, manager.getActiveRun(actor, run.id), 0, {
    minutes: 1,
  });
  assert.equal(manager.listDueVersionedRuns(2000).length, 1, 'the control is due');
  actor.flags.fabricate[FLAG].active[run.id].steps[0].pendingAwardChoices = [owedChoice()];
  manager.invalidateCache(actor.id);
  assert.deepEqual(manager.listDueVersionedRuns(2000), []);
});

test('1773 V&A 15: a step owing a choice is not settled history until the settle', async () => {
  for (const [choices, expected] of [
    [[owedChoice()], 'pending'],
    [[], 'complete'],
  ]) {
    const { actor, manager } = setup();
    const run = await manager.createRun(actor, recipe, [actor]);
    run.steps[0].historySettlement = { consumption: 'complete' };
    const completed = await manager.completeStepSuccess(actor, run, 0, {
      createdResults: [],
      pendingAwardChoices: choices,
    });
    assert.equal(completed.steps[0].historySettlement.awards, expected);
  }
});

test('1773: the settle write admits only its own planned operation, and only once', async () => {
  const { actor, manager } = setup();
  const runId = await archived(actor, manager, owedChoice());
  const history = actor.flags.fabricate[FLAG].history;
  history[0].awardChoiceJournal = {
    operationId: 'op-settle',
    requestId: 'choose',
    baseRunRevision: history[0].runRevision,
    status: 'planned',
    intent: null,
    effects: [],
  };
  const settlement = {
    stepIndex: 0,
    choiceId: 'pick',
    picks: ['a'],
    outcome: 'awarded',
    groupAward: {
      choiceId: 'pick',
      chooser: 'playerChooses',
      awardStrategy: 'anyOne',
      count: 1,
      selections: [{ alternativeId: 'a' }],
    },
    receipt: { createdResults: [{ actorUuid: 'Actor.crafter', itemUuid: 'Item.a', quantity: 1 }] },
  };
  const write = (operation) => {
    manager.invalidateCache(actor.id);
    const revision = manager.getRun(actor, runId).runRevision;
    return manager.settleAwardChoice(actor, runId, settlement, {
      expectedRevision: revision,
      executionOperationId: operation,
    });
  };
  await assert.rejects(write('op-other'), { code: 'EXECUTION_OPERATION_MISMATCH' });
  const settled = await write('op-settle');
  assert.equal(settled.steps[0].pendingAwardChoices[0].outcome, 'awarded');
  assert.equal(settled.steps[0].pendingAwardChoices[0].settledAt, 1000);
  assert.deepEqual(settled.steps[0].groupAwards[0].selections, [{ alternativeId: 'a' }]);
  assert.equal(settled.steps[0].createdResults.length, 1);
  await assert.rejects(write('op-settle'), { code: 'AWARD_CHOICE_SETTLED' });
});

test('1773 Escalation 12: claimability names why a member cannot be picked now', () => {
  const units = [{ id: 'gp' }];
  const system = { requirements: { currency: { enabled: true } } };
  const context = (overrides = {}) => ({
    actor: { flags: {} },
    recipe: { craftingSystemId: 'sys' },
    resolveComponent: (id) => (id === 'ore' ? { id } : null),
    seams: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getCurrencyConfig: () => ({ units }),
      resolveRecipe: (id) => (id === 'taught' ? { id, craftingSystemId: 'sys' } : null),
      resolveSystem: () => system,
      isKnowledgeObservable: () => true,
      readFlag: () => ({}),
      ...overrides,
    },
  });
  const reason = (member, overrides = {}) => memberUnclaimableReason(member, context(overrides));
  assert.equal(reason({ componentId: 'ore' }), null);
  assert.equal(reason({ componentId: 'gone' }), 'componentMissing');
  assert.equal(reason({ kind: 'currency', unit: 'gp' }), null);
  assert.equal(reason({ kind: 'currency', unit: 'mark' }), 'unitMissing');
  assert.equal(reason({ kind: 'knowledge', recipeId: 'taught' }), null);
  assert.equal(reason({ kind: 'knowledge', recipeId: 'gone' }), 'recipeMissing');
  assert.equal(
    reason({ kind: 'knowledge', recipeId: 'taught' }, { isKnowledgeObservable: () => false }),
    'knowledgeNotObservable'
  );
  assert.equal(
    reason(
      { kind: 'knowledge', recipeId: 'taught' },
      { readFlag: () => ({ taught: { learnedAt: 1, granted: true } }) }
    ),
    'alreadyKnown'
  );
  system.requirements.currency.enabled = false;
  assert.equal(reason({ kind: 'currency', unit: 'gp' }), 'currencyDisabled');
});

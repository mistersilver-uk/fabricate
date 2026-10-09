/**
 * Issue 1773 PR3, V&A 15: a run that still owes an award choice survives the history trim, and a
 * prune forfeits that choice before it would drop the run; the world-time sweep waits on the stage's
 * own predicate and on a settle in flight; the settle write admits only its own operation, once;
 * and claimability is judged against the world, a credit through its writer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { AwardChoiceSettler, memberUnclaimableReason } from '../src/systems/awardChoiceSettle.js';
import { owesClaimablePick } from '../src/systems/choiceGroupAward.js';
import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

import { makeWorldCurrencyConfig } from './helpers/currency-spend-fixtures.js';
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

const PRUNES = Object.freeze({
  recipe: (manager) => manager.removeRunsForRecipes([recipe.id]),
  system: (manager) => manager.removeRunsForSystem('system'),
  corpus: (manager) => manager.cleanupInvalidRuns(new Set(), new Set()),
});

for (const [name, prune] of Object.entries(PRUNES)) {
  test(`1773 V&A 15: the ${name} prune forfeits an owed choice where it would drop the run`, async () => {
    const { actor, manager } = setup();
    const owed = await archived(actor, manager, owedChoice());
    await archived(actor, manager, owedChoice({ picks: [], settledAt: 1, outcome: 'forfeited' }));
    manager.invalidateCache(actor.id);
    const revision = manager.getRun(actor, owed).runRevision;
    await prune(manager);
    assert.deepEqual(historyIds(manager, actor), [owed], 'the settled run is dropped');
    const [step] = manager.getRun(actor, owed).steps;
    const { picks, settledAt, outcome } = step.pendingAwardChoices[0];
    assert.deepEqual(
      { picks, settledAt, outcome },
      { picks: [], settledAt: 1000, outcome: 'forfeited' }
    );
    assert.deepEqual(step.groupAwards, [
      {
        choiceId: 'pick',
        chooser: 'playerChooses',
        awardStrategy: 'anyOne',
        count: 1,
        selections: [],
      },
    ]);
    assert.ok(manager.getRun(actor, owed).runRevision > revision, 'the forfeit is a revision');
    await prune(manager);
    assert.deepEqual(historyIds(manager, actor), [], 'and the next prune drops it as any other');
  });
}

test('1773 V&A 15: the world-time sweep asks the stage predicate and waits on a planned settle', async () => {
  const { actor, manager } = setup();
  const run = await manager.createRun(actor, recipe, [actor], 'user-1', { lifecycleVersion: 1 });
  await manager.setCompletionMode(actor, run.id, 'worldTime', { expectedRevision: 0 });
  await manager.markStepWaitingForTime(actor, manager.getActiveRun(actor, run.id), 0, {
    minutes: 1,
  });
  const active = actor.flags.fabricate[FLAG].active[run.id];
  active.steps[0].pendingAwardChoices = [owedChoice()];
  manager.invalidateCache(actor.id);
  assert.equal(manager.listDueVersionedRuns(2000).length, 1, 'an owed choice alone holds nothing');
  const asked = [];
  const blocks = (candidate, owner) => {
    asked.push([candidate.id, owner]);
    return true;
  };
  assert.deepEqual(manager.listDueVersionedRuns(2000, blocks), [], 'a blocking choice is skipped');
  assert.deepEqual(asked, [[run.id, actor]]);
  active.awardChoiceJournal = {
    operationId: 'op-settle',
    requestId: 'choose',
    baseRunRevision: active.runRevision,
    status: 'planned',
    intent: null,
    effects: [],
  };
  manager.invalidateCache(actor.id);
  assert.deepEqual(manager.listDueVersionedRuns(2000), [], 'a settle in flight holds the sweep');
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

const TAUGHT = Object.freeze({ taught: 'sys', foreign: 'other' });

/** A world whose `gp` credit the real actor-property writer can plan for `actor`. */
function claimWorld(overrides = {}) {
  const system = { requirements: { currency: { enabled: true } } };
  const actor = {
    id: 'crafter',
    uuid: 'Actor.crafter',
    flags: {},
    _source: { system: { currency: { gp: 1, sp: 0 } } },
    get system() {
      return this._source.system;
    },
  };
  const context = {
    actor,
    recipe: { craftingSystemId: 'sys' },
    resolveComponent: (id) => (id === 'ore' ? { id } : null),
    resolveItem: (uuid) => (uuid === 'Item.kept' ? { uuid } : null),
    seams: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getCurrencyConfig: () => makeWorldCurrencyConfig(),
      actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
      resolveRecipe: (id) => (TAUGHT[id] ? { id, craftingSystemId: TAUGHT[id] } : null),
      resolveSystem: () => system,
      isKnowledgeObservable: () => true,
      readFlag: () => ({}),
      ...overrides,
    },
  };
  return { system, actor, context };
}

test('1773 Escalation 12: claimability names why an alternative cannot be picked now', () => {
  const { system, actor, context } = claimWorld();
  const reason = (member, overrides = {}) =>
    memberUnclaimableReason(member, { ...context, seams: { ...context.seams, ...overrides } });
  assert.equal(reason({ componentId: 'ore' }), null);
  assert.equal(reason({ componentId: 'gone' }), 'componentMissing');
  assert.equal(reason({ itemUuid: 'Item.kept' }), null, 'a bare Item that still resolves');
  assert.equal(reason({ itemUuid: 'Item.gone' }), 'componentMissing', 'and one that does not');
  assert.equal(reason({ kind: 'currency', unit: 'gp' }), null);
  assert.equal(reason({ kind: 'currency', unit: 'mark' }), 'unitMissing');
  assert.equal(reason({ kind: 'knowledge', recipeId: 'taught' }), null);
  assert.equal(reason({ kind: 'knowledge', recipeId: 'gone' }), 'recipeMissing');
  assert.equal(
    reason({ kind: 'knowledge', recipeId: 'foreign' }),
    'recipeMissing',
    'another system'
  );
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
  delete actor._source.system.currency.gp;
  assert.equal(
    reason({ kind: 'currency', unit: 'gp' }),
    'currencySourceMissing',
    'the world writer refuses a credit it cannot write'
  );
  system.requirements.currency.enabled = false;
  assert.equal(reason({ kind: 'currency', unit: 'gp' }), 'currencyDisabled');
});

test('1773: a bare Item alternative is judged through fromUuidSync without loading it', () => {
  const asked = [];
  const saved = globalThis.fromUuidSync;
  const fromUuidSync = (uuid, options) => {
    asked.push([uuid, options]);
    return uuid === 'Compendium.pack.Item.kept' ? { uuid } : null;
  };
  Object.assign(globalThis, { fromUuidSync });
  try {
    const settler = new AwardChoiceSettler({
      getRecipe: () => null,
      seams: {},
      resolveComponent: () => null,
    });
    const run = (itemUuid) => ({
      steps: [{ pendingAwardChoices: [owedChoice({ alternatives: [{ id: 'a', itemUuid }] })] }],
    });
    assert.equal(settler.blocks(run('Compendium.pack.Item.kept'), {}), true);
    assert.equal(settler.blocks(run('Item.gone'), {}), false);
    assert.deepEqual(asked, [
      ['Compendium.pack.Item.kept', { strict: false }],
      ['Item.gone', { strict: false }],
    ]);
  } finally {
    Object.assign(globalThis, { fromUuidSync: saved });
  }
});

const pending = (...alternatives) => ({
  choiceId: 'c',
  alternatives: alternatives.map((id) => ({ id })),
});
const runOwing = (...choices) => ({ steps: [{ pendingAwardChoices: choices }] });

test('1644: owing a claimable pick needs one claimable alternative of any owed choice', () => {
  const only =
    (...ids) =>
    () =>
    (member) =>
      ids.includes(member.id) ? null : 'unitMissing';
  assert.equal(owesClaimablePick(runOwing(pending('a', 'b')), only('b')), true, 'one of two');
  assert.equal(
    owesClaimablePick(runOwing(pending('a'), pending('b')), only('b')),
    true,
    'one choice'
  );
  assert.equal(owesClaimablePick(runOwing(pending('a', 'b')), only()), false, 'none claimable');
  const settled = { ...pending('a'), settledAt: 5 };
  assert.equal(owesClaimablePick(runOwing(settled), only('a')), false, 'a settled choice');
});

test('1644: claimability is asked only of a run that owes a pick', () => {
  let asked = 0;
  const claimability = () => {
    asked += 1;
    return () => null;
  };
  assert.equal(owesClaimablePick(runOwing(), claimability), false);
  assert.equal(owesClaimablePick(runOwing({ ...pending('a'), settledAt: 5 }), claimability), false);
  assert.equal(asked, 0, 'nothing owed, nothing asked');
  assert.equal(owesClaimablePick(runOwing(pending('a')), claimability), true);
  assert.equal(asked, 1);
});

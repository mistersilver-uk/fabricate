/**
 * Issue 1773 PR1: the versioned `award-rewards` effect, through the real engine, run manager and
 * serialized actor flags. It follows `award-results` only when the routed set holds a reward,
 * applies the plan that receipt carries, and is never replayed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDocumentUpdate } from './helpers/companionRewardWorld.js';
import { createPersistedCraftingHistory } from './helpers/journal-fixtures.js';

const LEARNED_KEY = 'fabricate.learnedRecipes';

/** Give the fixture's crafter a `_source` its currency and learned-recipe writes land on. */
function rewardable(actor) {
  const getFlag = actor.getFlag.bind(actor);
  actor._source = { system: { currency: { gp: 1, sp: 0 } }, flags: {} };
  Object.defineProperty(actor, 'system', { get: () => actor._source.system, configurable: true });
  actor.getFlag = (namespace, key) =>
    key === LEARNED_KEY
      ? actor._source.flags.fabricate?.fabricate?.learnedRecipes
      : getFlag(namespace, key);
  actor.update = async (payload) => {
    applyDocumentUpdate(actor._source, payload);
    return actor;
  };
  actor.updateSource = () => {};
  return actor;
}

const rewards = (recipeId) => [
  { id: 'coin', kind: 'currency', unit: 'gp', quantity: 2, label: 'Fee', reason: 'For the work' },
  { id: 'lore', kind: 'knowledge', recipeId, quantity: 1 },
];

/** One-stage run whose stage awards `extra` beside its component; `around` wraps the execute. */
function runWithRewards({ extra = (recipe) => rewards(recipe.id), around = null } = {}) {
  return createPersistedCraftingHistory({
    stageCount: 1,
    drive: async ({ engine, actor, sources, gm, runId, manager, steps, recipe }) => {
      rewardable(actor);
      steps[0].resultGroups[0].results.push(...extra(recipe));
      game.time.worldTime += 60;
      const execute = (requestId = 'execute') =>
        engine.executeVersionedStage({
          viewer: gm,
          actor,
          componentSourceActors: sources,
          runId,
          expectedRevision: manager().getRun(actor, runId).runRevision,
          requestId,
          executionGrant: 'grant',
        });
      const outcome = around ? await around({ execute, manager, actor, runId }) : await execute();
      return {
        outcome,
        actor: structuredClone({ source: actor._source, items: actor.items.length }),
      };
    },
  });
}

const effectIds = (record) => record.executionJournal.effects.map((effect) => effect.effectId);
const receiptOf = (record, id) =>
  record.executionJournal.effects.find((effect) => effect.effectId === id)?.receipt;

test('1773 V&A 1: a component-only stage plans exactly the effects it planned before', async () => {
  const { record } = await runWithRewards({ extra: () => [] });
  assert.ok(!effectIds(record).includes('award-rewards'));
  assert.deepEqual(Object.keys(receiptOf(record, 'award-results')), ['results', 'resolutionMeta']);
  assert.ok(!('currencyCredits' in record.steps[0]), 'no empty credit key is written');
  assert.ok(!('knowledgeGrants' in record.steps[0]));
});

test('1773 V&A 3: award-rewards follows award-results and credits and grants once', async () => {
  const { record, actor } = await runWithRewards();
  const ids = effectIds(record);
  assert.equal(ids.indexOf('award-rewards'), ids.indexOf('award-results') + 1);
  const planned = record.executionJournal.effects.find(
    (effect) => effect.effectId === 'award-rewards'
  );
  assert.deepEqual(planned.planned, ['coin', 'lore'], 'its plan is the stable list of result ids');
  assert.equal(planned.kind, 'awardRewards');
  assert.deepEqual(
    receiptOf(record, 'award-results').rewardPlan.map((entry) => entry.kind),
    ['currency', 'knowledge']
  );
  assert.equal(actor.source.system.currency.gp, 3, 'credited once');
  assert.equal(
    actor.source.flags.fabricate.fabricate.learnedRecipes['historical-recipe'].granted,
    true
  );
  assert.equal(actor.items, 1, 'only the component became an Item');
  const step = record.steps[0];
  assert.deepEqual(step.currencyCredits, [
    {
      resultId: 'coin',
      unit: 'gp',
      amount: 2,
      label: 'Fee',
      reason: 'For the work',
      unitName: 'gp',
    },
  ]);
  assert.deepEqual(step.knowledgeGrants, [
    {
      resultId: 'lore',
      recipeId: 'historical-recipe',
      outcome: 'granted',
      recipeName: 'Recorded tonic',
    },
  ]);
  assert.deepEqual(receiptOf(record, 'award-rewards'), {
    currencyCredits: step.currencyCredits,
    knowledgeGrants: step.knowledgeGrants,
  });
});

test('1773 V&A 14: a resume after award-results applied hydrates the plan and awards once', async () => {
  const { record, actor } = await runWithRewards({
    around: async ({ execute, manager }) => {
      const runs = manager();
      const update = runs.updateExecutionJournal.bind(runs);
      runs.updateExecutionJournal = async (...args) => {
        if (args[2].type === 'effectApplying' && args[2].effectId === 'award-rewards') {
          throw new Error('stopped between effects');
        }
        return update(...args);
      };
      await assert.rejects(execute(), /stopped between effects/);
      runs.updateExecutionJournal = update;
      runs.invalidateCache?.();
      return execute();
    },
  });
  assert.equal(record.status, 'succeeded');
  assert.equal(actor.source.system.currency.gp, 3, 'the resumed reward step credited exactly once');
  assert.equal(actor.items, 1, 'the applied award-results was not replayed');
  assert.equal(record.steps[0].knowledgeGrants[0].outcome, 'granted');
});

test('1773 V&A 3: an interrupted award-rewards requires recovery and is never re-credited', async () => {
  const { record, actor, outcome } = await runWithRewards({
    around: async ({ execute, manager }) => {
      const runs = manager();
      const update = runs.updateExecutionJournal.bind(runs);
      runs.updateExecutionJournal = async (...args) => {
        if (args[2].type === 'effectApplied' && args[2].effectId === 'award-rewards') {
          throw new Error('receipt lost');
        }
        return update(...args);
      };
      await assert.rejects(execute(), /receipt could not be persisted|receipt lost/);
      runs.updateExecutionJournal = update;
      runs.invalidateCache?.();
      return execute().catch((error) => ({ refused: error.code ?? error.message }));
    },
  });
  assert.equal(actor.source.system.currency.gp, 3, 'credited by the first attempt only');
  const effect = record.executionJournal.effects.find(
    (entry) => entry.effectId === 'award-rewards'
  );
  assert.equal(effect.phase, 'applying', 'the uncertain effect is left as it was');
  assert.equal(record.executionJournal.status, 'recoveryRequired');
  assert.notEqual(outcome?.success, true, 'the retry did not complete the stage');
});

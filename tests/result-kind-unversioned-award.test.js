/**
 * Issue 1773 PR1: the unversioned craft settles its rewards right after its items, through the
 * real `craft()` and run manager. A credit's marker names the run, and a reward write that fails
 * leaves the stage recording each credit it confirmed as a credit, never as a blank Item row.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

import { applyDocumentUpdate } from './helpers/companionRewardWorld.js';
import {
  craftProbe,
  probeResolutionService,
  PROBE_CURRENCY_UNITS,
} from './helpers/craftPipelineProbe.js';
import { stubRoll } from './helpers/routedCheckEngine.js';

const credit = (id, quantity) => ({ id, kind: 'currency', unit: 'gp', quantity });

/** A craft of two wood into a plank and `credits`, by a crafter whose writes land on `_source`;
 *  `refuseCredit` is the 1-based credit write the actor refuses. */
function creditWorld({ credits = [credit('c1', 3)], refuseCredit = null, spec = {} } = {}) {
  const world = craftProbe({
    ...spec,
    steps: [
      {
        ingredients: [{ componentId: 'wood', quantity: 2 }],
        results: [{ componentId: 'plank', quantity: 1 }, ...credits],
        timeRequirement: null,
      },
    ],
    requirements: { currency: { enabled: true } },
    currencyUnits: PROBE_CURRENCY_UNITS,
    actorCurrency: { gp: 5 },
  });
  world.engine.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
  const actor = world.craftingActor;
  actor._source = { system: actor.system, flags: actor.flags };
  let writes = 0;
  actor.update = async (payload) => {
    const crediting = Object.keys(payload).some((key) => key.startsWith('system.currency'));
    if (crediting && ++writes === refuseCredit) return null;
    applyDocumentUpdate(actor._source, payload);
    return actor;
  };
  return world;
}

test('1773: an unversioned credit carries its run id on the marker', async () => {
  const world = creditWorld();
  const result = await world.craft();
  assert.equal(result.success, true, result.message);
  const [run] = world.runManager.getRunHistory(world.craftingActor);
  assert.equal(world.craftingActor.system.currency.gp, 8);
  assert.deepEqual(world.craftingActor._source.flags.fabricate.companionEffect, {
    runId: run.id,
    effectId: 'award-rewards',
    resultId: 'c1',
    index: 0,
  });
  assert.deepEqual(run.steps[0].currencyCredits, [
    { resultId: 'c1', unit: 'gp', amount: 3, unitName: 'gp' },
  ]);
});

test('1773 V&A 3: a reward write that fails leaves the confirmed credit a credit, not an Item row', async () => {
  const world = creditWorld({ credits: [credit('c1', 3), credit('c2', 1)], refuseCredit: 2 });
  await assert.rejects(world.craft(), (error) => error.code === 'HISTORY_EFFECT_UNCERTAIN');
  assert.equal(world.craftingActor.system.currency.gp, 8, 'the first credit stands');
  const [run] = world.runManager.getActiveRuns(world.craftingActor);
  const stage = run.steps[0];
  assert.equal(stage.historySettlement.awards, 'uncertain');
  assert.deepEqual(
    stage.createdResults.map((receipt) => [receipt.name, receipt.quantity]),
    [['plank', 1]],
    'only the Item receipt is an Item row'
  );
  assert.ok(
    stage.createdResults.every((receipt) => receipt.itemUuid),
    'no blank row stands for a credit'
  );
  assert.deepEqual(stage.currencyCredits, [
    { resultId: 'c1', unit: 'gp', amount: 3, unitName: 'gp' },
  ]);

  const evidence = new RunJournalBuilder({})._nativeRecoveryEvidence(run, true);
  const awards = evidence.effects.find((effect) => effect.kind === 'awardItems');
  assert.deepEqual(
    awards.receipt.items.map((item) => item.name),
    ['plank']
  );
  assert.deepEqual(awards.receipt.currencies, [{ unit: 'gp', amount: 3 }]);
});

test('1773: an alchemy failure that pays from its failure group records the credit', async () => {
  const world = creditWorld({
    credits: [],
    spec: {
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'simple' },
      craftingCheck: {
        enabled: true,
        simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' },
        consumption: { consumeIngredientsOnFail: true },
      },
      failureResults: [{ componentId: 'ash', quantity: 1 }, credit('c9', 2)],
      resolutionService: probeResolutionService({
        mode: 'alchemy',
        resolveResultGroups: ({ step, checkResult }) => ({
          groups: step.resultGroups.filter(
            (group) => (group.role === 'failure') !== Boolean(checkResult?.success)
          ),
          meta: { disposition: checkResult?.success ? 'success' : 'failure' },
        }),
      }),
    },
  });
  stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
  const result = await world.craft(null, { isAlchemyAttempt: true });
  assert.equal(result.success, false);
  assert.equal(world.craftingActor.system.currency.gp, 7, 'the failure group paid two gold');
  const [run] = world.runManager.getRunHistory(world.craftingActor);
  assert.deepEqual(run.steps[0].currencyCredits, [
    { resultId: 'c9', unit: 'gp', amount: 2, unitName: 'gp' },
  ]);
});

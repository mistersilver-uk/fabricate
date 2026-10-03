/**
 * A rolled amount the crafting character's roll data breaks is refused before anything is
 * consumed (issue 1516): a path resolving to text, and a divisor that is zero for this character.
 * The dice double reads roll data as core's grammar does (`rollDataRollClass`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { rolledAmountRefusals, validateCraft } from '../src/systems/rolledAmountResolver.js';

import { craftProbe, PROBE_CURRENCY_UNITS } from './helpers/craftPipelineProbe.js';
import {
  GatheringDocumentActor,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';
import { rollDataRollClass, withRoll } from './helpers/seededRoll.js';

const { Roll } = rollDataRollClass();

/** Each formula passes the actor-free floor, and breaks only for the character it names. */
const BROKEN = Object.freeze([
  { formula: '1d4 + @name', rollData: { name: 'Elf' }, sound: { name: 2 } },
  { formula: '1d4 + 10 / (@level - 1)', rollData: { level: 1 }, sound: { level: 3 } },
]);

/** A craft that consumes two wood and spends two gold, awarding a rolled plank. */
function rolledWorld(formula, rollData) {
  const world = craftProbe({
    steps: [
      {
        ingredients: [{ componentId: 'wood', quantity: 2 }],
        results: [{ componentId: 'plank', quantity: 1, quantityFormula: formula }],
        timeRequirement: null,
      },
    ],
    requirements: { currency: { enabled: true } },
    currencySpends: [{ unit: 'gp', amount: 2 }],
    currencyUnits: PROBE_CURRENCY_UNITS,
    actorCurrency: { gp: 5 },
  });
  world.craftingActor.getRollData = () => rollData;
  return world;
}

const effects = (world) => world.journal.entries.map(([name]) => name);

for (const { formula, rollData, sound } of BROKEN) {
  test(`1516: "${formula}" the character's roll data breaks is refused with zero mutation`, async () => {
    await withRoll(Roll, async () => {
      const world = rolledWorld(formula, rollData);
      const result = await world.craft();

      assert.equal(result.success, false);
      assert.match(result.message, /cannot be rolled for this character/);
      assert.deepEqual(effects(world), ['returned'], 'no consumption, spend, run or award');
      assert.equal(world.stockItems[0].system.quantity, 5, 'the wood is all still there');
      assert.equal(world.craftingActor.system.currency.gp, 5, 'and so is the gold');
      assert.deepEqual(world.runManager.getActiveRuns(world.craftingActor), [], 'no run is left');
    });
  });

  test(`1516: "${formula}" crafts for a character whose roll data it reads`, async () => {
    await withRoll(Roll, async () => {
      const world = rolledWorld(formula, sound);
      const result = await world.craft();

      assert.equal(result.success, true, result.message);
      // The control: this world consumes and spends, so the refusal above withheld both.
      assert.ok(effects(world).includes('item.update'), 'the wood is consumed');
      assert.ok(effects(world).includes('currency.spend'), 'the gold is spent');
    });
  });
}

/** The versioned start's refusal for `world`, with a grant attesting an alchemy match. */
const versionedRefusal = (world) =>
  world.engine._versionedRunStartRefusal({
    viewer: { id: 'user-probe' },
    actor: world.craftingActor,
    sourceActors: [world.sourceActor],
    recipe: world.recipe,
    trusted: { matched: true, activityKind: 'alchemy', recipeId: world.recipe.id },
    runManager: world.runManager,
  });

test('1516: the versioned start refuses the same formula before it creates a run', async () => {
  await withRoll(Roll, async () => {
    const world = rolledWorld('1d4 + @name', { name: 'Elf' });
    const refusal = versionedRefusal(world);
    assert.equal(refusal.success, false);
    assert.match(refusal.message, /cannot be rolled for this character/);
    world.craftingActor.getRollData = () => ({ name: 2 });
    assert.equal(versionedRefusal(world), null, 'a character it reads starts');
  });
});

test('1516: every result group is read once, and a progressive system reads none', () => {
  const group = { results: [{ quantityFormula: '1d4 + @name' }] };
  const recipe = {
    resultGroups: [group],
    steps: [{ resultGroups: [group] }, { resultGroups: [{ results: [{ quantity: 2 }] }] }],
    validate: ({ progressive }) => ({ valid: true, errors: [], progressive }),
  };
  const actor = { getRollData: () => ({ name: 'Elf' }) };
  return withRoll(Roll, () => {
    assert.equal(validateCraft(recipe, actor, { getMode: () => 'simple' }).errors.length, 1);
    const progressive = validateCraft(recipe, actor, { getMode: () => 'progressive' });
    assert.deepEqual(progressive, { valid: true, errors: [], progressive: true });
    assert.deepEqual(rolledAmountRefusals([group], undefined, {}), [], 'no Roll, no refusal');
  });
});

/** One routed gathering attempt whose yield rolls `1d4 + @name` against `rollData`. */
async function gatherRolled(rollData) {
  const fixture = gatheringFixture({
    mode: 'routed',
    components: [{ id: 'scrap', name: 'Scrap', difficulty: 1 }],
    resultGroups: [
      {
        id: 'yield',
        name: 'Yield',
        results: [{ id: 'r', componentId: 'scrap', quantity: 1, quantityFormula: '1d4 + @name' }],
      },
    ],
  });
  const actor = new GatheringDocumentActor('Gatherer', { ownerIds: ['user-gathering'] });
  actor.getRollData = () => rollData;
  return runRealGatheringAttempt({
    ...fixture,
    actor,
    // The check keeps the harness's own stub; only the amount formula meets this double.
    beforeStart: () => {
      const CheckRoll = globalThis.Roll;
      function AmountRoll(formula, data, options) {
        return formula === '1d4 + @name'
          ? new Roll(formula, data)
          : new CheckRoll(formula, data, options);
      }
      Object.setPrototypeOf(AmountRoll, CheckRoll);
      // The harness restores the global after the attempt.
      Object.assign(globalThis, { Roll: AmountRoll });
    },
  });
}

test('1516: a gathering amount the character breaks fails at plan time and awards nothing', async () => {
  const refused = await gatherRolled({ name: 'Elf' });
  assert.equal(refused.error, null);
  assert.equal(refused.response.accepted, false);
  assert.deepEqual(
    refused.response.blockedReasons.map((reason) => reason.code),
    ['TASK_MISCONFIGURED']
  );
  assert.equal(refused.actor.items.length, 0, 'no item is created');
  assert.deepEqual(refused.runManagerCalls.createTerminalRun, [], 'and no run is written');

  const gathered = await gatherRolled({ name: 2 });
  assert.equal(gathered.response.accepted, true, 'the control: a character it reads gathers');
  assert.equal(gathered.actor.items.length, 1);
});

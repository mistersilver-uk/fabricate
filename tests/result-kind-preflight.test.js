/**
 * Issue 1773 PR1, V&A 5: every reward the world cannot honour is refused before anything is
 * consumed, through the real `craft()` (whose one gate precedes `commitCraft` and both failure
 * paths) and the versioned start, against a crafter who holds the ingredient. The control world
 * consumes and credits, so the unchanged inventory each refusal asserts is one that could move.
 * Issue 1773 PR3 adds the choice group's refusals: a player chooser, and a group formula.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';

import { makeWorldActor } from './helpers/companionRewardWorld.js';
import { craftProbe, PROBE_CURRENCY_UNITS } from './helpers/craftPipelineProbe.js';
import { rollDataRollClass, withRoll } from './helpers/seededRoll.js';

const TAUGHT = { id: 'taught', name: 'Taught tonic', craftingSystemId: 'sys-probe' };
const COIN = { kind: 'currency', unit: 'gp', quantity: 3 };
const LORE = { kind: 'knowledge', recipeId: 'taught', quantity: 1 };

/** A craft of two wood into `results`, with a crafter whose currency and flags live on `_source`. */
function rewardWorld({ results = [COIN, LORE], enabled = true, system, failureResults } = {}) {
  const world = craftProbe({
    failureResults,
    steps: [
      { ingredients: [{ componentId: 'wood', quantity: 2 }], results, timeRequirement: null },
    ],
    requirements: { currency: { enabled } },
    currencyUnits: PROBE_CURRENCY_UNITS,
    runManager: false,
  });
  world.engine.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
  const seams = world.engine._rewardSeams.bind(world.engine);
  const knowledge = { observable: true };
  world.engine._rewardSeams = () => ({
    ...seams(),
    resolveRecipe: (id) => (id === TAUGHT.id ? TAUGHT : null),
    resolveSystem: () => world.system,
    isKnowledgeObservable: () => knowledge.observable,
    readFlag: (actor, key, fallback) => actor._source.flags.fabricate?.fabricate?.[key] ?? fallback,
    writeFlag: (actor, key, value) => actor.update({ [`flags.fabricate.fabricate.${key}`]: value }),
  });
  const crafter = makeWorldActor('hero', { system: system ?? { currency: { gp: 5, sp: 0 } } });
  return { ...world, crafter, knowledge };
}

const wood = (world) => world.stockItems[0].system.quantity;

/** The versioned start's refusal for the same crafter and recipe. */
const versionedRefusal = (world) =>
  world.engine._versionedRunStartRefusal({
    viewer: { id: 'user-probe' },
    actor: world.crafter,
    sourceActors: [world.sourceActor],
    recipe: world.recipe,
    trusted: null,
    runManager: {},
  });

/** A rolled group of two gold credits: `1d6` at its maximum selects the second. */
const rolledCoins = (extra = {}) => ({
  id: 'purse',
  chooser: 'rolled',
  selectionFormula: '1d6',
  alternatives: [
    { ...COIN, id: 'one', quantity: 1, selectionRange: { from: 1, to: 3 } },
    { ...COIN, id: 'two', quantity: 2, selectionRange: { from: 4, to: 6 } },
  ],
  ...extra,
});
const playerCoins = { id: 'purse', alternatives: rolledCoins().alternatives };

/** A world whose rolled formula reads the crafter's name, which is text. */
function textFormulaWorld(results) {
  const world = rewardWorld({ results });
  world.crafter.getRollData = () => ({ details: { name: 'Sera' } });
  return world;
}

const REFUSALS = Object.freeze([
  {
    name: 'a player-chooser group (issue 1773, until its pick can be settled)',
    world: () => rewardWorld({ results: [playerCoins] }),
    reason: /the player chooses cannot be awarded yet/,
  },
  {
    name: 'a player-chooser group in the failure-role set alone',
    world: () => rewardWorld({ results: [COIN], failureResults: [playerCoins] }),
    reason: /the player chooses cannot be awarded yet/,
  },
  {
    name: 'a selection formula resolving to text',
    world: () => textFormulaWorld([rolledCoins({ selectionFormula: '@details.name' })]),
    reason: /"@details.name" cannot be rolled for this character/,
  },
  {
    name: 'a count formula resolving to text',
    world: () =>
      textFormulaWorld([
        rolledCoins({ awardStrategy: 'upTo', awardCountFormula: '@details.name' }),
      ]),
    reason: /"@details.name" cannot be rolled for this character/,
  },
  {
    name: 'a member amount resolving to text',
    world: () => {
      const [first, second] = rolledCoins().alternatives;
      const alternatives = [{ ...first, quantityFormula: '@details.name' }, second];
      return textFormulaWorld([rolledCoins({ alternatives })]);
    },
    reason: /"@details.name" cannot be rolled for this character/,
  },
  {
    name: 'a group member in an unconfigured unit',
    world: () => {
      const [first, second] = rolledCoins().alternatives;
      return rewardWorld({
        results: [rolledCoins({ alternatives: [first, { ...second, unit: 'mark' }] })],
      });
    },
    reason: /"mark" is not configured/,
  },
  {
    name: 'an unconfigured unit',
    world: () => rewardWorld({ results: [{ ...COIN, unit: 'mark' }] }),
    reason: /"mark" is not configured/,
  },
  { name: 'currency off', world: () => rewardWorld({ enabled: false }), reason: /needs currency/ },
  {
    name: 'a synthetic-token crafter',
    world: () => tokenWorld(),
    reason: /actorNotFound/,
  },
  {
    name: 'creditNotConfigured',
    world: () => strategyWorld('actorInventory', null),
    reason: /creditNotConfigured/,
  },
  {
    name: 'currencySourceMissing',
    world: () => rewardWorld({ results: [COIN], system: {} }),
    reason: /currencySourceMissing/,
  },
  {
    name: 'balanceUnreadable',
    world: () =>
      strategyWorld('actorInventory', {
        readCoins: () => ({ valid: false }),
        refund: async () => ({ valid: true }),
      }),
    reason: /balanceUnreadable/,
  },
  {
    name: 'a missing taught recipe',
    world: () => rewardWorld({ results: [{ ...LORE, recipeId: 'gone' }] }),
    reason: /"gone" is not in this crafting system/,
  },
  {
    name: 'knowledgeNotObservable',
    world: () => unobservableWorld(),
    reason: /knowledgeNotObservable/,
  },
  {
    name: 'a credit formula resolving to text',
    world: () => {
      const world = rewardWorld({ results: [{ ...COIN, quantityFormula: '@details.name' }] });
      world.crafter.getRollData = () => ({ details: { name: 'Sera' } });
      return world;
    },
    reason: /cannot be rolled for this character/,
  },
]);

function tokenWorld() {
  const world = rewardWorld();
  world.crafter.isToken = true;
  return world;
}

function unobservableWorld() {
  const world = rewardWorld();
  world.knowledge.observable = false;
  return world;
}

function strategyWorld(spendStrategy, inventorySpender) {
  const world = rewardWorld({ results: [COIN] });
  const config = world.engine.currencyConfigStore.get();
  world.engine.currencyConfigStore = { get: () => ({ ...config, spendStrategy }) };
  world.engine.actorInventoryCoinSpender = inventorySpender;
  return world;
}

const { Roll } = rollDataRollClass();

test('1773 V&A 5 control: an honoured reward consumes the ingredient, credits and grants', async () => {
  await withRoll(Roll, async () => {
    const world = rewardWorld();
    const result = await world.craftWith(world.crafter, [world.sourceActor]);
    assert.equal(result.success, true, result.message);
    assert.equal(wood(world), 3, 'two wood were consumed');
    assert.equal(world.crafter._source.system.currency.gp, 8, 'three gold were credited');
    assert.equal(
      world.crafter._source.flags.fabricate.fabricate.learnedRecipes.taught.granted,
      true
    );
    assert.equal(versionedRefusal(world), null, 'and the versioned start would begin');
  });
});

test('1773 V&A 5 control: a rolled group credits the member its selection roll draws', async () => {
  await withRoll(Roll, async () => {
    const world = rewardWorld({ results: [rolledCoins()] });
    const result = await world.craftWith(world.crafter, [world.sourceActor]);
    assert.equal(result.success, true, result.message);
    assert.equal(wood(world), 3, 'two wood were consumed');
    assert.equal(world.crafter._source.system.currency.gp, 7, 'the second member, two gold');
    assert.equal(versionedRefusal(world), null);
  });
});

for (const { name, world: build, reason } of REFUSALS) {
  test(`1773 V&A 5: ${name} is refused before anything is consumed, on both entrances`, async () => {
    await withRoll(Roll, async () => {
      const world = build();
      const result = await world.craftWith(world.crafter, [world.sourceActor]);
      assert.equal(result.success, false);
      assert.match(result.message, reason);
      assert.equal(wood(world), 5, 'the wood is all still there');
      assert.equal(world.crafter.updates.length, 0, 'nothing was credited or granted');
      assert.deepEqual(
        world.journal.entries.filter(([effect]) => /^item\.(update|delete)$/.test(effect)),
        [],
        'no ingredient was touched'
      );
      assert.match(versionedRefusal(world).message, reason);
    });
  });
}

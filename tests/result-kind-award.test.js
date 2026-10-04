/**
 * Issue 1773 PR1: a `currency` result credits through the world strategy's writer and a `knowledge`
 * result grants through the knowledge-grant entry, neither as an Item, and the pre-flight refuses
 * every reward the world cannot honour before anything is consumed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';

import { makeWorldActor } from './helpers/companionRewardWorld.js';
import { seededRollClass, withRoll } from './helpers/seededRoll.js';

Object.assign(globalThis, { foundry: { utils: { randomID: () => 'minted' } } });
Object.assign(globalThis, { game: { time: { worldTime: 0 }, fabricate: {} } });

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { validateCraft } = await import('../src/systems/rolledAmountResolver.js');
const { rolledAwardChatParts } = await import('../src/systems/craftChatEntries.js');
const { applyRewardPlan, awardHistory, grantedByFor, rewardRefusals } =
  await import('../src/systems/resultKindAward.js');

const LADDER = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'cp', amount: 100 }],
  },
  { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
];
const RECIPE = { id: 'teacher', name: 'Teacher', craftingSystemId: 'sys' };
const TAUGHT = { id: 'taught', name: 'Taught tonic', craftingSystemId: 'sys' };

function seamsFor({ enabled = true, strategy = 'actorProperty', observable = true } = {}) {
  const system = { id: 'sys', requirements: { currency: { enabled } } };
  return {
    getCraftingSystemManager: () => ({ getSystem: (id) => (id === 'sys' ? system : null) }),
    getCurrencyConfig: () => ({ spendStrategy: strategy, units: LADDER, macros: {} }),
    actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
    resolveRecipe: (id) => ({ taught: TAUGHT, teacher: RECIPE })[id] ?? null,
    resolveSystem: (id) => (id === 'sys' ? system : null),
    isKnowledgeObservable: () => observable,
    readFlag: (actor, key, fallback) => actor._source.flags.fabricate?.fabricate?.[key] ?? fallback,
    writeFlag: (actor, key, value) => actor.update({ [`flags.fabricate.fabricate.${key}`]: value }),
  };
}

const hero = () => makeWorldActor('hero', { system: { currency: { gp: 5, cp: 0 } } });
const credit = (extra = {}) => ({
  kind: 'currency',
  resultId: 'c1',
  unit: 'gp',
  amount: 3,
  ...extra,
});
const grant = (extra = {}) => ({ kind: 'knowledge', resultId: 'k1', recipeId: 'taught', ...extra });
const learnedOf = (actor) => actor._source.flags.fabricate?.fabricate?.learnedRecipes ?? {};

test('1773 V&A 3: a credit writes through the strategy writer, its marker on the same update', async () => {
  const actor = hero();
  const awards = await applyRewardPlan([credit({ label: 'Bounty', reason: 'For the job' })], {
    actor,
    recipe: RECIPE,
    runId: 'run-1',
    seams: seamsFor(),
  });
  assert.equal(actor._source.system.currency.gp, 8, 'credited three gold');
  assert.deepEqual(actor._source.flags.fabricate.companionEffect, {
    runId: 'run-1',
    effectId: 'award-rewards',
    resultId: 'c1',
    index: 0,
  });
  assert.equal(actor.updates.length, 1, 'value and marker ride one update');
  assert.deepEqual(awards, {
    currencyCredits: [
      { resultId: 'c1', unit: 'gp', amount: 3, label: 'Bounty', reason: 'For the job' },
    ],
    knowledgeGrants: [],
  });
});

test('1773 V&A 3: an amount of zero makes no writer call and is recorded as an empty award', async () => {
  const actor = hero();
  const awards = await applyRewardPlan(
    [credit({ amount: 0, rolled: { formula: '1d4-4', total: -1 } })],
    {
      actor,
      recipe: RECIPE,
      seams: seamsFor(),
    }
  );
  assert.equal(actor.updates.length, 0, 'nothing was written');
  assert.deepEqual(awards.currencyCredits, [
    { resultId: 'c1', unit: 'gp', amount: 0, rolled: { formula: '1d4-4', total: -1 } },
  ]);
});

test('1773 V&A 4: a knowledge award grants, cut to 64 code points, and an already-known recipe writes nothing', async () => {
  const actor = hero();
  const recipe = { ...RECIPE, name: `  ${'\u{1F702}'.repeat(70)}  ` };
  const first = await applyRewardPlan([grant()], { actor, recipe, seams: seamsFor() });
  const entry = learnedOf(actor).taught;
  assert.equal(entry.granted, true);
  assert.equal(entry.grantedBy, '\u{1F702}'.repeat(64), 'trimmed, then cut by code point');
  assert.equal(grantedByFor(recipe), entry.grantedBy);
  assert.deepEqual(first.knowledgeGrants, [
    { resultId: 'k1', recipeId: 'taught', outcome: 'granted' },
  ]);
  assert.equal(actor.createCalls.length, 0, 'no item is created');

  const writes = actor.updates.length;
  const second = await applyRewardPlan([grant()], { actor, recipe, seams: seamsFor() });
  assert.equal(actor.updates.length, writes, 'an already-known recipe writes nothing');
  assert.equal(second.knowledgeGrants[0].outcome, 'alreadyKnown');
});

test('1773 V&A 3: a later write that fails retains a receipt naming the credit and the grant before it', async () => {
  const actor = hero();
  const plan = [credit(), grant(), credit({ resultId: 'c2', unit: 'mark' })];
  await assert.rejects(
    applyRewardPlan(plan, { actor, recipe: RECIPE, seams: seamsFor() }),
    (error) => {
      assert.equal(error.code, 'HISTORY_EFFECT_UNCERTAIN');
      assert.match(error.message, /unitNotFound|ladder/);
      assert.deepEqual(error.receipts, [
        { resultId: 'c1', unit: 'gp', amount: 3 },
        { resultId: 'k1', recipeId: 'taught', outcome: 'granted' },
      ]);
      return true;
    }
  );
  assert.equal(actor._source.system.currency.gp, 8, 'the first credit stands and is not undone');
});

test('1773: a credit refuses at award time when the system takes no part in currency', async () => {
  await assert.rejects(
    applyRewardPlan([credit()], {
      actor: hero(),
      recipe: RECIPE,
      seams: seamsFor({ enabled: false }),
    }),
    /currencyDisabled/
  );
});

/** An engine whose rewards read `seams`, over a world with no resolution service. */
function engineWith(seams) {
  const engine = new CraftingEngine({ canCraft: () => ({ canCraft: false }) });
  engine._rewardSeams = () => seams;
  return engine;
}

const groups = (...results) => ({ resultGroups: [{ id: 'g', results }] });
const currencyResult = (extra = {}) => ({
  id: 'c1',
  kind: 'currency',
  unit: 'gp',
  quantity: 4,
  ...extra,
});
const knowledgeResult = { id: 'k1', kind: 'knowledge', recipeId: 'taught', quantity: 1 };

test('1773 V&A 4: the unversioned award credits and grants in place, creating no Item', async () => {
  const actor = hero();
  const engine = engineWith(seamsFor());
  engine._createSingleResult = async () => assert.fail('a reward never reaches the Item path');
  const { items } = await engine._createResultItems(
    actor,
    RECIPE,
    groups(currencyResult(), knowledgeResult),
    null,
    [],
    []
  );
  assert.equal(items.length, 0);
  assert.equal(actor._source.system.currency.gp, 9);
  assert.equal(learnedOf(actor).taught.granted, true);
  assert.deepEqual(awardHistory(items), {
    createdResults: [],
    currencyCredits: [{ resultId: 'c1', unit: 'gp', amount: 4, unitName: 'gp' }],
    knowledgeGrants: [
      { resultId: 'k1', recipeId: 'taught', outcome: 'granted', recipeName: 'Taught tonic' },
    ],
  });
});

test('1773 V&A 3: the versioned award plans its rewards and writes nothing', async () => {
  const actor = hero();
  const { items } = await engineWith(seamsFor())._createResultItems(
    actor,
    RECIPE,
    groups(currencyResult(), knowledgeResult),
    null,
    [],
    [],
    null,
    null,
    { deferRewards: true }
  );
  assert.equal(actor.updates.length, 0, 'award-results credits and grants nothing');
  assert.deepEqual(items.rewardPlan, [
    { kind: 'currency', resultId: 'c1', unit: 'gp', amount: 4, unitName: 'gp' },
    { kind: 'knowledge', resultId: 'k1', recipeId: 'taught', recipeName: 'Taught tonic' },
  ]);
});

test('1773: a rolled credit resolves once against the crafter and its roll rides the card', async () => {
  await withRoll(seededRollClass({ totals: { '1d6+1': 6 } }).Roll, async () => {
    const actor = hero();
    actor.getRollData = () => ({ level: 3 });
    const { items } = await engineWith(seamsFor())._createResultItems(
      actor,
      RECIPE,
      groups(currencyResult({ quantityFormula: '1d6+1', label: 'Purse', reason: 'Found it' })),
      null,
      [],
      []
    );
    assert.equal(actor._source.system.currency.gp, 11);
    const [row] = items.rewardAwards.currencyCredits;
    assert.deepEqual(row.rolled, { formula: '1d6+1', total: 6 });
    const parts = rolledAwardChatParts(items);
    assert.equal(parts.rolls.length, 1, 'the credit roll rides the card');
    assert.equal(parts.emptyAwards[0].kind, 'currency', 'and the credit is its own row');
  });
});

// The pre-flight `validateCraft` runs over every set of every step, failure role included.
const recipeWith = (failureResults, { successResults = [] } = {}) => ({
  craftingSystemId: 'sys',
  validate: () => ({ valid: true, errors: [] }),
  steps: [
    {
      resultGroups: [
        { id: 'ok', results: successResults },
        { id: 'fail', role: 'failure', results: failureResults },
      ],
    },
  ],
});
const simple = { getMode: () => 'simple' };
const refusals = (recipe, seams = seamsFor(), actor = hero(), modes = simple) =>
  validateCraft(recipe, actor, modes, rewardRefusals(seams)).errors;

test('1773 V&A 5: the pre-flight refuses each reward its world cannot honour', () => {
  assert.deepEqual(refusals(recipeWith([currencyResult(), knowledgeResult])), []);
  assert.match(
    refusals(recipeWith([currencyResult({ unit: 'mark' })])).join(','),
    /"mark" is not configured/
  );
  assert.match(
    refusals(recipeWith([currencyResult()]), seamsFor({ enabled: false })).join(','),
    /needs currency enabled/
  );
  const token = Object.assign(hero(), { isToken: true });
  assert.match(
    refusals(recipeWith([currencyResult()]), seamsFor(), token).join(','),
    /actorNotFound/
  );
  assert.match(
    refusals(recipeWith([currencyResult()]), seamsFor({ strategy: 'actorInventory' })).join(','),
    /creditNotConfigured/
  );
  assert.match(
    refusals(recipeWith([{ ...knowledgeResult, recipeId: 'gone' }])).join(','),
    /"gone" is not in this crafting system/
  );
  assert.match(
    refusals(recipeWith([knowledgeResult]), seamsFor({ observable: false })).join(','),
    /knowledgeNotObservable/
  );
  assert.match(
    refusals(recipeWith([currencyResult({ quantity: 2.5 })])).join(','),
    /must be a whole amount/
  );
  assert.match(
    refusals(recipeWith([currencyResult()]), seamsFor(), hero(), {
      getMode: () => 'progressive',
    }).join(','),
    /progressive result must award a component/
  );
});

test('1773 V&A 5: a credit formula resolving to text is refused before consumption', async () => {
  const { rollDataRollClass } = await import('./helpers/seededRoll.js');
  await withRoll(rollDataRollClass().Roll, () => {
    const actor = hero();
    actor.getRollData = () => ({ details: { name: 'Sera' } });
    assert.match(
      refusals(
        recipeWith([currencyResult({ quantityFormula: '@details.name' })]),
        seamsFor(),
        actor
      ).join(','),
      /cannot be rolled for this character/
    );
  });
});

test('1773 V&A 5: both craft entrances refuse before a run exists or anything is consumed', async () => {
  const actor = hero();
  const engine = engineWith(seamsFor({ enabled: false }));
  const recipe = recipeWith([currencyResult()]);
  const ctx = await engine._openCraftContext(actor, [actor], recipe, null, {});
  assert.match(ctx.refusal?.message ?? '', /Invalid recipe: .*needs currency enabled/);
  assert.equal(ctx.run, null, 'no run was created');

  game.fabricate.getRecipeVisibilityService = () => ({
    guardCraftStart: () => ({ craftable: true }),
  });
  const refused = engine._versionedRunStartRefusal({
    viewer: { id: 'u' },
    actor,
    sourceActors: [actor],
    recipe,
    trusted: null,
    runManager: {},
  });
  assert.match(
    refused.message ?? refused.error ?? JSON.stringify(refused),
    /needs currency enabled/
  );
  assert.equal(actor.updates.length + actor.createCalls.length, 0, 'the inventory is untouched');
  delete game.fabricate.getRecipeVisibilityService;
});

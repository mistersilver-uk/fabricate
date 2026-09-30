/**
 * The advantage offer (issue 2007): `resolveAdvantageOffer` is the one derivation, every prompt
 * producer equals it over one corpus (MA17), the prepared policy carries the whole offer and the
 * authority enforces both buttons from it (MA18), and a batch intersects its offers (MA19).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import {
  advantageOfferFields,
  intersectAdvantageOffers,
  isBonusExpression,
  offeredDecision,
  publicAdvantageOffer,
  resolveAdvantageOffer,
} from '../src/systems/checkAdvantage.js';
import { evaluateCheckRoll, evaluatePreparedRunCheck } from '../src/systems/checkRoll.js';
import { resolveBulkCheckDecision } from '../src/systems/companionCheckRoll.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { normalizeJournalRunAuthorityState } from '../src/systems/journalRunPrivatePreparation.js';
import { preparedDecisionPolicy } from '../src/systems/preparedDecisionPolicy.js';
import { RUN_LIFECYCLE_VERSION } from '../src/systems/runLifecycleState.js';
import { promptBulkCheckRoll, promptCheckRoll } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation } from './helpers/countFixtures.js';
import { gatheringFixture } from './helpers/real-gathering-attempt.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { installTermBearingRoll } from './helpers/termBearingRoll.js';

const OVER = { product: 'sum', direction: 'over' };
const UNDER = { product: 'sum', direction: 'under' };
const COUNT = countEvaluation();
const NONE = { advantage: false, disadvantage: false, kind: null, detail: null };
const KEEP = { advantage: true, disadvantage: true, kind: 'keep', detail: null };
const KEEP_ONLY = { ...KEEP, disadvantage: false };

describe('resolveAdvantageOffer', () => {
  const cases = [
    ['a default rule keeps a plain first group', {}, OVER, '1d12 + 3', KEEP],
    ['a plain group under keeps too', {}, UNDER, '2d6 + @prof', KEEP],
    ['a nested first group offers nothing', {}, OVER, '(1d20 + 2) * 2', NONE],
    ['a dice-free formula offers nothing', {}, OVER, '@skill + 5', NONE],
    ['disadvantage off leaves advantage', { offerDisadvantage: false }, OVER, '1d20', KEEP_ONLY],
    ['off offers nothing', { mode: 'off' }, OVER, '1d20', NONE],
    [
      'a bonus names its total over',
      { mode: 'bonus', bonusExpression: ' +1d8 + 1 ' },
      OVER,
      '@skill + 5',
      { ...KEEP, kind: 'bonus', detail: { expression: '1d8 + 1', destination: 'total' } },
    ],
    [
      'a bonus names its target under',
      { mode: 'bonus', bonusExpression: '3', offerDisadvantage: false },
      UNDER,
      '(1d20 + 2) * 2',
      { ...KEEP_ONLY, kind: 'bonus', detail: { expression: '3', destination: 'target' } },
    ],
    [
      'an invalid bonus offers nothing',
      { mode: 'bonus', bonusExpression: '1d6x' },
      OVER,
      '1d20',
      NONE,
    ],
    [
      'a count check offers its dice both ways, whatever its formula or stale mode',
      { mode: 'bonus', countDice: 3, offerDisadvantage: false },
      COUNT,
      '',
      { advantage: true, disadvantage: true, kind: 'count', detail: { dice: 3 } },
    ],
    ['a disabled count offers nothing', { countEnabled: false }, COUNT, '1d20', NONE],
  ];
  for (const [name, advantage, evaluation, authoredFormula, expected] of cases) {
    it(name, () => {
      assert.deepEqual(resolveAdvantageOffer({ advantage, evaluation, authoredFormula }), expected);
    });
  }

  it('reads the bonus grammar exactly as the prototype pins it', () => {
    for (const accepted of ['1d6', '2d4', '1d8 + 1', '+1d6', '3']) {
      assert.equal(isBonusExpression(accepted), true, accepted);
    }
    for (const refused of ['1d6x', '@prof', '1d6*2', '(1d6)', '1d6kh1', '', '1d6 − 1']) {
      assert.equal(isBonusExpression(refused), false, refused);
    }
  });

  it('removes a bonus an injected dice engine cannot roll, and fails open without one', () => {
    class RefusingRoll {
      total = null;

      constructor(formula) {
        if (formula === '1000d6') throw new Error('too many dice');
      }

      evaluateSync() {
        this.total = 6;
      }
    }
    const advantage = { mode: 'bonus', bonusExpression: '1000d6' };
    const offer = (Roll) => resolveAdvantageOffer({ advantage, evaluation: OVER, Roll });
    assert.deepEqual(offer(RefusingRoll), NONE, 'the maximized roll refuses it before any roll');
    assert.equal(offer(undefined).kind, 'bonus', 'the grammar alone admits it');
  });

  it('honours only an offered button', () => {
    assert.equal(offeredDecision(KEEP_ONLY, 'advantage'), 'advantage');
    assert.equal(offeredDecision(KEEP_ONLY, 'disadvantage'), null);
    assert.equal(offeredDecision(KEEP, 'normal'), null);
    assert.equal(offeredDecision(undefined, 'advantage'), null);
  });

  it('carries an allowlisted copy, never extra keys', () => {
    const hostile = {
      advantage: true,
      disadvantage: 'yes',
      kind: 'bonus',
      rule: { mode: 'bonus' },
      detail: { expression: '1d6', destination: 'elsewhere', formula: '@secret' },
    };
    assert.deepEqual(publicAdvantageOffer(hostile), {
      advantage: true,
      disadvantage: false,
      kind: 'bonus',
      detail: { expression: '1d6', destination: 'total' },
    });
    assert.deepEqual(publicAdvantageOffer({ ...KEEP, kind: 'other' }), { ...KEEP, kind: null });
    assert.deepEqual(publicAdvantageOffer({ disadvantage: true }), NONE);
  });
});

// MA19: `some` in place of `every`, or `offerDisadvantage` ORed across the batch, turns this red.
describe('intersectAdvantageOffers (MA19)', () => {
  const bonus = (expression) => ({
    ...KEEP,
    kind: 'bonus',
    detail: { expression, destination: 'total' },
  });

  it('offers each button only when every offer includes it', () => {
    assert.deepEqual(intersectAdvantageOffers([KEEP, KEEP]), KEEP);
    assert.deepEqual(intersectAdvantageOffers([KEEP, KEEP_ONLY]), KEEP_ONLY);
    assert.deepEqual(intersectAdvantageOffers([KEEP_ONLY, KEEP]), KEEP_ONLY);
    assert.deepEqual(intersectAdvantageOffers([KEEP, NONE]), NONE, 'any empty offer: one Roll');
    assert.deepEqual(intersectAdvantageOffers([NONE, KEEP]), NONE);
    assert.deepEqual(intersectAdvantageOffers([]), NONE);
  });

  it('keeps the kind and detail only when every offer agrees on both', () => {
    assert.deepEqual(intersectAdvantageOffers([bonus('1d6'), bonus('1d6')]), bonus('1d6'));
    const mixed = { ...KEEP, kind: 'mixed', detail: null };
    assert.deepEqual(intersectAdvantageOffers([bonus('1d6'), bonus('1d8')]), mixed);
    assert.deepEqual(intersectAdvantageOffers([KEEP, bonus('1d6')]), mixed);
  });

  it('is what bulk salvage and the companion bulk decision offer', async () => {
    const salvage = await salvageOffer([
      { rollFormula: '1d20 + 3' },
      { rollFormula: '2d6 + 1', advantage: { offerDisadvantage: false } },
    ]);
    assert.deepEqual(salvage, KEEP_ONLY);
    assert.deepEqual(
      await salvageOffer([{ rollFormula: '1d20' }, { rollFormula: '(1d20+2)*2' }]),
      NONE
    );
    assert.deepEqual(await companionOffer(['1d20', '2d6']), KEEP);
    assert.deepEqual(await companionOffer(['1d20', 'max(1d20, 10)']), NONE);
  });
});

// ── the five producers ───────────────────────────────────────────────────────

let restoreDice = null;
afterEach(() => {
  restoreDice?.();
  restoreDice = null;
});

/** A count row needs the registered count roll; a summed row needs a Roll that parses a bonus. */
function installDiceFor({ evaluation }) {
  restoreDice?.();
  restoreDice =
    evaluation.product === 'count' ? installCountDice().restore : installTermBearingRoll().restore;
}

const ACTOR = {
  uuid: 'Actor.offer',
  name: 'Offer',
  system: {},
  getRollData: () => ({ prof: 2, skill: 3 }),
};

/** `promptInput`, read through the interactive prompt the evaluator opens and dismisses. */
async function promptOffer({ formula, evaluation, advantage }) {
  let asked = null;
  await evaluateCheckRoll(formula, ACTOR, {
    interactive: true,
    evaluation,
    advantage,
    prompt: async (input) => {
      asked = input;
      return { confirmed: false };
    },
  });
  return asked;
}

/** The crafting versioned descriptor's public prompt, with only its lookups stubbed. */
async function craftingOffer({ formula, evaluation, advantage }) {
  const system = {
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: { simple: { rollFormula: formula, dc: 12, evaluation, advantage } },
  };
  const recipe = { id: 'recipe', name: 'Tonic' };
  const run = { lifecycleVersion: RUN_LIFECYCLE_VERSION, recipeId: 'recipe', currentStepIndex: 0 };
  const engine = new CraftingEngine(
    { getRecipe: () => recipe },
    {
      invalidateCache() {},
      getActiveRun: () => run,
    }
  );
  Object.assign(engine, {
    _consumeVersionedGrant: async () => ({}),
    _executionSteps: () => [{ id: 'step' }],
    _lockedStageSelection: () => ({ selectedIngredientSetId: 'set' }),
    _selectedIngredientSet: () => ({ id: 'set' }),
    _versionedStageRollable: () => true,
    _getRecipeSystem: () => system,
    _versionedStageStarted: () => true,
    _versionedStagePreparation: async () => ({ valid: true, toolValidation: { tools: [] } }),
    _buildInteractiveModifierChoice: () => null,
    _resolveSimpleCheckDc: async (_system, _config, _recipe, _set, _actor, target) => target,
  });
  const { publicPrompt } = await engine.describeVersionedStageCheck({
    actor: ACTOR,
    componentSourceActors: [],
    runId: 'run',
    preparationGrant: 'grant',
  });
  return publicPrompt;
}

/** The gathering versioned descriptor's public prompt for a routed task. */
function gatheringOffer({ formula, evaluation, advantage }) {
  const engine = new GatheringEngine({ localize: (key) => key });
  const { system, environment, task } = gatheringFixture({ mode: 'routed' });
  Object.assign(system.gatheringCraftingCheck.routed, {
    rollFormula: formula,
    evaluation,
    advantage,
  });
  return engine._versionedCheckDescriptor({
    actor: ACTOR,
    run: { taskId: task.id },
    system,
    environment,
    task,
  }).publicPrompt;
}

/** What bulk salvage hands its one prompt for subjects authoring `checks`. */
async function salvageFields(checks) {
  let offered = null;
  const service = new BulkSalvageService({
    salvage: async () => ({ success: true }),
    promptRollDecision: async (input) => {
      offered = input;
      return { confirmed: false };
    },
  });
  const runnable = checks.map((check, index) => ({
    system: { id: `system-${index}`, salvageCraftingCheck: { simple: { dc: 10, ...check } } },
    component: {},
    item: { actorName: 'Salvager', name: `Item ${index}` },
  }));
  await service._resolveRollDecision(runnable, true);
  return offered;
}

async function salvageOffer(checks) {
  return (await salvageFields(checks)).advantageOffer;
}

async function companionFields(formulas) {
  let offered = null;
  const seams = {
    localize: (_key, fallback) => fallback,
    promptBulk: async (input) => {
      offered = input;
      return { confirmed: false };
    },
  };
  await resolveBulkCheckDecision({ callSite: 'gmAction', formulas }, seams);
  return offered;
}

async function companionOffer(formulas) {
  return (await companionFields(formulas)).advantageOffer;
}

const FORMULAS = [
  '1d20 + 3',
  'd20',
  '2d6 + @prof',
  '1d12 + 3',
  '1d6 + 1d20',
  '1d6x + 1d20',
  '(1d20 + 2) * 2',
  '10 - 1d20',
  '2 * 1d20',
  '@prof + 1d20',
  '@skill + 5',
];
const RULES = [
  { offerDisadvantage: false },
  { mode: 'off' },
  { extraDice: 3 },
  { mode: 'bonus', bonusExpression: '1d8 + 1' },
  { mode: 'bonus', bonusExpression: '1d6x' },
  { mode: 'bonus', bonusExpression: '+2', offerDisadvantage: false },
];

/** One corpus: every formula on the default rule, every rule on two formulas, and counting. */
const CORPUS = [
  ...FORMULAS.flatMap((formula) => [OVER, UNDER].map((evaluation) => ({ formula, evaluation }))),
  ...RULES.flatMap((advantage) =>
    ['1d20 + 3', '(1d20 + 2) * 2'].flatMap((formula) =>
      [OVER, UNDER].map((evaluation) => ({ formula, evaluation, advantage }))
    )
  ),
  ...[undefined, { countEnabled: false }, { countDice: 4, mode: 'bonus' }].map((advantage) => ({
    formula: '1d20',
    evaluation: COUNT,
    advantage,
  })),
];

/** The one derivation, with the dice engine each producer injects installed for the row. */
function expectedOffer(entry) {
  installDiceFor(entry);
  const { formula, evaluation, advantage } = entry;
  return resolveAdvantageOffer({
    advantage,
    evaluation,
    authoredFormula: formula,
    Roll: globalThis.Roll,
  });
}

const assertFields = (fields, expected, label) => {
  assert.deepEqual(fields.advantageOffer, expected, label);
  assert.equal(fields.allowAdvantage, expected.advantage, `${label}: allowAdvantage`);
};

// MA17: a producer that keeps its own predicate (`hasPlainD20`, the gathering regex, a count gate)
// differs from the one derivation on some row of this corpus.
describe('every producer offers exactly resolveAdvantageOffer (MA17)', () => {
  it('the corpus reaches every kind of offer, so no comparison is vacuous', () => {
    const kinds = new Set(CORPUS.map((entry) => expectedOffer(entry).kind));
    assert.deepEqual(kinds, new Set(['bonus', 'count', 'keep', null]));
    const halves = CORPUS.map(expectedOffer).filter(
      (offer) => offer.advantage && !offer.disadvantage
    );
    assert.ok(halves.length > 0, 'some row offers advantage alone');
  });

  const producers = [
    ['the interactive prompt (promptInput)', promptOffer],
    ['the crafting versioned descriptor', craftingOffer],
    ['the gathering versioned descriptor', gatheringOffer],
    ['bulk salvage over one subject', (entry) => salvageFields([checkOf(entry)])],
  ];
  for (const [name, produce] of producers) {
    it(name, async () => {
      for (const entry of CORPUS) {
        const { product, direction } = entry.evaluation;
        const label = `${entry.formula} ${product}/${direction} ${JSON.stringify(entry.advantage)}`;
        const expected = expectedOffer(entry);
        assertFields(await produce(entry), expected, label);
      }
    });
  }

  it('the companion bulk decision over one formula, on the default rule', async () => {
    for (const entry of CORPUS) {
      if (entry.advantage || entry.evaluation !== OVER) continue;
      const expected = expectedOffer(entry);
      assertFields(await companionFields([entry.formula]), expected, entry.formula);
    }
  });

  it('the descriptor fields are the offer after the retirement shim', () => {
    const config = { advantage: { offerDisadvantage: false } };
    assert.deepEqual(advantageOfferFields(config, OVER, '1d20 + @craftingModifier', undefined), {
      allowAdvantage: true,
      advantageOffer: KEEP_ONLY,
    });
  });
});

function checkOf({ formula, evaluation, advantage }) {
  return { rollFormula: formula, evaluation, advantage };
}

// ── the prepared policy and the authority ────────────────────────────────────

// MA18: a policy that drops `disadvantage` or `kind` fails the whitelist and the Disadvantage roll.
describe('the prepared policy carries the whole offer and the authority enforces it (MA18)', () => {
  const PROMPT = {
    allowsSituationalModifier: true,
    allowAdvantage: true,
    advantageOffer: { ...KEEP, detail: { canary: 'SECRET' }, rule: 'SECRET' },
    formula: 'SECRET',
  };

  it('binds and persists the allowlisted offer', () => {
    const policy = preparedDecisionPolicy(PROMPT);
    assert.deepEqual(policy, {
      allowsSituationalModifier: true,
      allowAdvantage: true,
      advantageOffer: KEEP,
    });
    const persisted = normalizeJournalRunAuthorityState({
      prepareTokens: { token: { status: 'active', binding: { decisionPolicy: PROMPT } } },
    }).prepareTokens.token.binding.decisionPolicy;
    assert.deepEqual(persisted, policy, 'the persisted whitelist keeps disadvantage and kind');
  });

  async function preparedRoll(offer, advantage) {
    const constructed = [];
    const { restore } = installTermBearingRoll({
      onConstruct: (roll) => {
        constructed.push(roll);
      },
    });
    restoreDice = restore;
    await evaluatePreparedRunCheck(
      { rollFormula: '1d20 + 3', slot: 'simple', checkConfig: { dc: 1 }, flavor: 'Check' },
      ACTOR,
      { ...preparedDecisionPolicy({ advantageOffer: offer }), advantage, rollMode: 'selfroll' }
    );
    return constructed.at(-1)._formula;
  }

  it('rolls each offered button and refuses each unoffered one', async () => {
    assert.equal(await preparedRoll(KEEP, 'disadvantage'), '2d20kl1 + 3', 'offered Disadvantage');
    assert.equal(await preparedRoll(KEEP, 'advantage'), '2d20kh1 + 3', 'offered Advantage');
    assert.equal(
      await preparedRoll(KEEP_ONLY, 'disadvantage'),
      '1d20 + 3',
      'unoffered Disadvantage'
    );
    assert.equal(await preparedRoll(KEEP_ONLY, 'advantage'), '2d20kh1 + 3');
    assert.equal(await preparedRoll(NONE, 'advantage'), '1d20 + 3', 'unoffered Advantage');
  });
});

// The prompt's buttons render from the offer later in this issue; the view carries it already.
describe('the prompt view carries the allowlisted offer', () => {
  async function viewOf(prompt, args) {
    const surface = stubPromptSurface(() => null);
    try {
      await prompt(args);
      return surface.view;
    } finally {
      surface.restore();
    }
  }

  it('on the single and the bulk prompt, and only when a producer supplied one', async () => {
    const offer = { ...KEEP_ONLY, rule: 'SECRET' };
    const single = await viewOf(promptCheckRoll, { allowAdvantage: true, advantageOffer: offer });
    assert.deepEqual(single.advantageOffer, KEEP_ONLY);
    const bulk = await viewOf(promptBulkCheckRoll, { allowAdvantage: true, advantageOffer: offer });
    assert.deepEqual(bulk.advantageOffer, KEEP_ONLY);
    const legacy = await viewOf(promptCheckRoll, { allowAdvantage: true });
    assert.equal(Object.hasOwn(legacy, 'advantageOffer'), false);
  });
});

/**
 * The advantage rule at every check site (issue 2007): each site threads its own record to the
 * engine, the engine rolls only a button that record's offer includes whatever transport carried
 * it (MA8, MA9, MA15), and a prepared check rolls its prepare-time snapshot (MA16). A bonus die
 * and a count pool change act as the chosen button's one contribution (MA10 to MA14).
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  evaluateCheckRoll,
  evaluatePreparedCraftingCheck,
  evaluatePreparedRunCheck,
  runFormulaPassFail,
  runFormulaProgressive,
} from '../src/systems/checkRoll.js';
import { resolveCheckDecision } from '../src/systems/checkRollDecision.js';
import { rollActorCheck } from '../src/systems/companionCheckRoll.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import {
  preparedDecisionPolicy,
  validatedPreparedDecision,
} from '../src/systems/preparedDecisionPolicy.js';
import { RUN_LIFECYCLE_VERSION } from '../src/systems/runLifecycleState.js';
import { buildInteractiveRollOptions } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation, preparedCountCheck } from './helpers/countFixtures.js';
import { gatheringFixture } from './helpers/real-gathering-attempt.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { installTermBearingRoll } from './helpers/termBearingRoll.js';

const FORMULA = '1d20 + 3';
const ACTOR = {
  id: 'actor-engine',
  uuid: 'Actor.engine',
  name: 'Engine',
  items: [],
  getRollData: () => ({}),
};
const KEEP = { advantage: true, disadvantage: true, kind: 'keep', detail: null };

/** The main roll each site evaluated last, read from the constructed Roll's cached formula. */
let rolled = [];
let restores = [];

beforeEach(() => {
  rolled = [];
  const dice = installTermBearingRoll({
    extend: (Base) =>
      class extends Base {
        async evaluate(options) {
          await super.evaluate(options);
          rolled.push(this._formula);
          return this;
        }
      },
  });
  // ratchet-exempt(lint): the engine reads `game.fabricate` for the system and its mode.
  globalThis.game = { user: { id: 'user-1', name: 'GM' } };
  restores = [dice.restore];
});

afterEach(() => {
  for (const restore of restores.toReversed()) restore();
  delete globalThis.game;
});

/** Answer the interactive prompt with `choice`, as a stale or hostile client might. */
function answerPrompt(choice) {
  const surface = stubPromptSurface(() => ({ confirmed: true, advantage: choice }));
  restores.push(surface.restore);
}

/** A crafting engine whose one system authors `craftingCheck` in `resolutionMode`. */
function craftingEngine({ resolutionMode, craftingCheck, alchemy }) {
  const system = {
    id: 'sys-1',
    resolutionMode,
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, ...craftingCheck },
    ...(alchemy && { alchemy }),
  };
  const resolutionService = {
    getMode: () => resolutionMode,
    getResultSelection: () => ({ provider: 'check' }),
  };
  const engine = new CraftingEngine({ getToolsForSet: () => [] }, null, resolutionService);
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => ({ getSystem: () => system }),
    getResolutionModeService: () => resolutionService,
  };
  return engine;
}

const RECIPE = Object.freeze({ id: 'recipe', name: 'Tonic', craftingSystemId: 'sys-1' });
const simpleCheck = (advantage) => ({ rollFormula: FORMULA, dc: 12, dcMode: 'static', advantage });
const routedCheck = (advantage) => ({
  ...simpleCheck(advantage),
  type: 'relative',
  relativeOutcomes: [{ id: 'hit', name: 'Hit', dc: 0 }],
  fixedOutcomes: [],
});

/** Roll a crafting mode's check through `_runCraftingCheck`, the immediate craft's dispatch. */
function craftingSite(resolutionMode, slot, { alchemy } = {}) {
  return async (advantage, choice) => {
    answerPrompt(choice);
    const check = slot === 'routed' ? routedCheck(advantage) : simpleCheck(advantage);
    const engine = craftingEngine({ resolutionMode, craftingCheck: { [slot]: check }, alchemy });
    await engine._runCraftingCheck(RECIPE, ACTOR, [ACTOR], null, null, { interactive: true });
  };
}

/** The timed FINISH leg, stopped once its check has rolled. */
async function timedFinishSite(advantage, choice) {
  answerPrompt(choice);
  const engine = craftingEngine({
    resolutionMode: 'simple',
    craftingCheck: { simple: simpleCheck(advantage) },
  });
  const finished = new Error('the check rolled');
  Object.assign(engine, {
    _validateTools: async () => ({ valid: true, tools: [] }),
    _beginNativeStage: async () => {
      throw finished;
    },
  });
  await assert.rejects(
    engine._finishTimedStep({
      craftingActor: ACTOR,
      componentSourceActors: [ACTOR],
      recipe: { ...RECIPE, ingredientSets: [], resultGroups: [] },
      step: { id: 'step', name: 'Brew' },
      stepIndex: 0,
      options: { interactive: true },
      presentTools: null,
      runManager: {},
      run: { id: 'run', steps: [{ preparedConsumption: { consumedSummary: [] } }] },
    }),
    finished
  );
}

const SALVAGE_COMPONENT = Object.freeze({ id: 'ore', name: 'Ore', salvage: { enabled: true } });

/** Salvage one component, prompted (single) or with the batch's forwarded `rollDecision` (bulk). */
function salvageSite(mode, { bulk = false } = {}) {
  return async (advantage, choice) => {
    const check = mode === 'routed' ? routedCheck(advantage) : simpleCheck(advantage);
    const system = { salvageResolutionMode: mode, salvageCraftingCheck: { [mode]: check } };
    if (!bulk) answerPrompt(choice);
    const rollDecision = bulk ? { bonus: null, rollMode: undefined, advantage: choice } : null;
    await new CraftingEngine({}, null, {})._runSalvageCraftingCheck(
      SALVAGE_COMPONENT,
      system,
      ACTOR,
      { interactive: true, rollDecision }
    );
  };
}

function gatheringWorld(mode, advantage) {
  const world = gatheringFixture({ mode });
  const checks = world.system.gatheringCraftingCheck;
  checks[mode] = { ...checks[mode], rollFormula: FORMULA, advantage };
  return { engine: new GatheringEngine({ localize: (key) => key }), ...world, check: checks[mode] };
}

async function gatheringRoutedSite(advantage, choice) {
  answerPrompt(choice);
  const { engine, check, task } = gatheringWorld('routed', advantage);
  await engine._rollRoutedFormula({
    routed: check,
    rollFormula: FORMULA,
    actor: ACTOR,
    task,
    interactive: true,
    craftingModifier: null,
  });
}

async function gatheringProgressiveSite(advantage, choice) {
  answerPrompt(choice);
  const { engine, system, task } = gatheringWorld('progressive', advantage);
  await engine._evaluateGatheringCheck({ actor: ACTOR, system, task, interactive: true });
}

/** The crafting versioned descriptor, with only its lookups stubbed, and the live check. */
async function describeCrafting(advantage) {
  const check = simpleCheck(advantage);
  const system = {
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: { simple: check },
  };
  const run = { lifecycleVersion: RUN_LIFECYCLE_VERSION, recipeId: 'recipe', currentStepIndex: 0 };
  const engine = new CraftingEngine(
    { getRecipe: () => RECIPE },
    { invalidateCache() {}, getActiveRun: () => run }
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
  const descriptor = await engine.describeVersionedStageCheck({
    actor: ACTOR,
    componentSourceActors: [],
    runId: 'run',
    preparationGrant: 'grant',
  });
  return { descriptor, check };
}

/** A token policy claiming both buttons, as a stale or forged binding would. */
const claimed = (choice) => ({
  ...preparedDecisionPolicy({ allowAdvantage: true, advantageOffer: KEEP }),
  advantage: choice,
  rollMode: 'selfroll',
});

async function craftingPreparedSite(advantage, choice, edit = () => {}) {
  const { descriptor, check } = await describeCrafting(advantage);
  edit(check);
  await evaluatePreparedCraftingCheck(descriptor.privateEvaluation, ACTOR, claimed(choice));
}

async function gatheringPreparedSite(advantage, choice, edit = () => {}) {
  const { engine, system, environment, task, check } = gatheringWorld('routed', advantage);
  const descriptor = engine._versionedCheckDescriptor({
    actor: ACTOR,
    run: { taskId: task.id },
    system,
    environment,
    task,
  });
  edit(check);
  engine.versionedRunAuthority = { evaluatePreparedRunCheck };
  await engine.evaluatePreparedVersionedCheck({
    actor: ACTOR,
    privateEvaluation: descriptor.privateEvaluation,
    decision: claimed(choice),
  });
}

const SITES = [
  ['crafting simple', craftingSite('simple', 'simple')],
  ['crafting routedByIngredients', craftingSite('routedByIngredients', 'simple')],
  ['alchemy simple', craftingSite('alchemy', 'simple', { alchemy: { checkMode: 'simple' } })],
  ['alchemy tiered', craftingSite('alchemy', 'routed', { alchemy: { checkMode: 'tiered' } })],
  ['crafting routedByCheck', craftingSite('routedByCheck', 'routed')],
  ['crafting progressive', craftingSite('progressive', 'progressive')],
  ['crafting timed FINISH', timedFinishSite],
  ['salvage simple', salvageSite('simple')],
  ['salvage routed', salvageSite('routed')],
  ['salvage progressive', salvageSite('progressive')],
  ['bulk salvage (the forwarded batch decision)', salvageSite('simple', { bulk: true })],
  ['gathering routed', gatheringRoutedSite],
  ['gathering legacy progressive', gatheringProgressiveSite],
  ['crafting prepared (Journal)', craftingPreparedSite],
  ['gathering prepared (Journal)', gatheringPreparedSite],
];

/** Each rule, the button asked for, and the one formula the check may roll for it. */
const MATRIX = [
  {
    row: 'mode off: Advantage rolls the authored formula (MA8)',
    advantage: { mode: 'off' },
    choice: 'advantage',
    formula: FORMULA,
  },
  {
    row: 'two extra dice: the site threads its own rule (MA15)',
    advantage: { extraDice: 2 },
    choice: 'advantage',
    formula: '3d20kh1 + 3',
  },
  {
    row: 'disadvantage not offered: it rolls normally (MA9)',
    advantage: { offerDisadvantage: false },
    choice: 'disadvantage',
    formula: FORMULA,
  },
];

// MA15: a site that omits its record rolls the default rule, `2d20kh1 + 3`, on two rows.
describe('every check site threads its own advantage rule, and the engine enforces it', () => {
  for (const [site, roll] of SITES) {
    it(site, async () => {
      const results = [];
      for (const { advantage, choice } of MATRIX) {
        rolled = [];
        await roll(advantage, choice);
        results.push(rolled.at(-1));
      }
      assert.deepEqual(
        results,
        MATRIX.map(({ formula }) => formula),
        MATRIX.map(({ row }) => row).join('; ')
      );
    });
  }

  it('the companion rolls under the default rule (ruling R2)', async () => {
    const seams = {
      isElectedExecutor: () => true,
      hasDiceEngine: () => true,
      localize: (_key, fallback) => fallback,
      prompt: async () => ({ confirmed: true }),
      runPassFail: runFormulaPassFail,
      runProgressive: runFormulaProgressive,
      buildRollOptions: buildInteractiveRollOptions,
    };
    const forwarded = async (advantage) => {
      const request = { actor: ACTOR, callSite: 'gmAction', formula: FORMULA, dc: 10 };
      await rollActorCheck({ ...request, interactive: true, rollDecision: { advantage } }, seams);
      return rolled.at(-1);
    };
    assert.equal(await forwarded('advantage'), '2d20kh1 + 3');
    assert.equal(await forwarded('disadvantage'), '2d20kl1 + 3');
  });
});

// MA16: a snapshot that shares the live rule, or an evaluator that re-reads it, rolls the edit.
describe('a prepared check rolls its prepare-time rule (MA16)', () => {
  const editToOff = (check) => {
    Object.assign(check.advantage, { mode: 'off', extraDice: 1 });
  };

  for (const [site, prepare] of [
    ['crafting', craftingPreparedSite],
    ['gathering', gatheringPreparedSite],
  ]) {
    it(`${site}: an edit between prepare and execute changes nothing`, async () => {
      await prepare({ extraDice: 2 }, 'advantage', editToOff);
      assert.equal(rolled.at(-1), '3d20kh1 + 3');
    });
  }
});

describe('validatedPreparedDecision', () => {
  it('passes only a button the snapshot offer includes', () => {
    const offer = { ...KEEP, disadvantage: false };
    const read = (advantage, against = offer) =>
      validatedPreparedDecision({ advantage }, null, against).advantage;
    assert.equal(read('advantage'), 'advantage');
    assert.equal(read('disadvantage'), null, 'the offer excludes it');
    assert.equal(read('normal'), null);
    assert.equal(read('advantage', null), null, 'no offer, no button');
  });

  it('keeps its bonus, roll mode and offered modifier ids unchanged', () => {
    const choice = { modifiers: [{ id: 'a' }, { id: 'b' }] };
    const decision = { bonus: '2', rollMode: 'gmroll', modifierIds: ['b', 'x', 3] };
    assert.deepEqual(validatedPreparedDecision(decision, choice, KEEP), {
      bonus: '2',
      advantage: null,
      rollMode: 'gmroll',
      chosenModifierIds: ['b'],
    });
    assert.equal(validatedPreparedDecision({ rollMode: 'loud' }, null, KEEP).rollMode, null);
  });
});

const OVER = Object.freeze({ product: 'sum', direction: 'over', target: { source: 'fixed' } });
const UNDER = Object.freeze({ product: 'sum', direction: 'under', target: { source: 'fixed' } });

/** Roll `1d20 + 3` under a bonus-die rule with a forwarded `choice`; the double's d8 rolls 5. */
function rollBonus({ evaluation, choice, expression = '1d6', bonus = null }) {
  return evaluateCheckRoll(FORMULA, ACTOR, {
    evaluation,
    interactive: true,
    rollDecision: { advantage: choice, bonus },
    advantage: { mode: 'bonus', bonusExpression: expression },
  });
}

describe('a bonus die is one advantage contribution', () => {
  it('sum/over rolls it in the main roll after the situational bonus (MA10)', async () => {
    const result = await rollBonus({ evaluation: OVER, choice: 'advantage', bonus: '2' });
    assert.equal(rolled.at(-1), '1d20 + 3 + (2) + (1d6)');
    assert.equal(result.resolvedFormula, '1d20 + 3 + (2) + (1d6)');
    assert.deepEqual(
      result.modifierPlacement.appendTerms.map(({ source, label, expression }) => ({
        source,
        label,
        expression,
      })),
      [
        { source: 'situational', label: '', expression: '2' },
        { source: 'advantage', label: 'Advantage', expression: '1d6' },
      ]
    );
    assert.deepEqual(result.modifierPlacement.preRolls, []);
  });

  it('Disadvantage over subtracts the whole expression (MA11)', async () => {
    const result = await rollBonus({
      evaluation: OVER,
      choice: 'disadvantage',
      expression: '1d8 + 1',
    });
    assert.equal(rolled.at(-1), '1d20 + 3 - (1d8 + 1)');
    const [term] = result.modifierPlacement.appendTerms;
    assert.deepEqual([term.label, term.expression, term.negate], ['Disadvantage', '1d8 + 1', true]);
  });

  it('Disadvantage under pre-rolls the expression unsigned and lowers the target by it (MA11)', async () => {
    const { modifierPlacement: placement } = await rollBonus({
      evaluation: UNDER,
      choice: 'disadvantage',
      expression: '1d8 + 1',
    });
    assert.deepEqual(rolled, ['1d8 + 1', FORMULA], 'one unsigned pre-roll, then the main roll');
    assert.equal(placement.preRolls.length, 1);
    const [preRoll] = placement.preRolls;
    assert.deepEqual(
      [preRoll.expression, preRoll.destination, preRoll.total, preRoll.negate],
      ['1d8 + 1', 'target', 6, true]
    );
    assert.equal(placement.targetDelta, -preRoll.total);
  });

  it('Advantage under raises the target and leaves the rolled formula alone (MA12)', async () => {
    const { modifierPlacement: placement, resolvedFormula } = await rollBonus({
      evaluation: UNDER,
      choice: 'advantage',
    });
    assert.equal(rolled.at(-1), FORMULA);
    assert.equal(resolvedFormula, FORMULA);
    assert.deepEqual(placement.appendTerms, []);
    assert.deepEqual(
      placement.preRolls.map(({ source, label, expression, destination, total, negate }) => ({
        source,
        label,
        expression,
        destination,
        total,
        negate,
      })),
      [
        {
          source: 'advantage',
          label: 'Advantage',
          expression: '1d6',
          destination: 'target',
          total: 4,
          negate: undefined,
        },
      ]
    );
    assert.equal(placement.targetDelta, 4);
  });

  it('a button the rule does not offer places nothing', async () => {
    const result = await evaluateCheckRoll(FORMULA, ACTOR, {
      evaluation: OVER,
      interactive: true,
      rollDecision: { advantage: 'disadvantage' },
      advantage: { mode: 'bonus', bonusExpression: '1d6', offerDisadvantage: false },
    });
    assert.equal(rolled.at(-1), FORMULA);
    assert.deepEqual(result.modifierPlacement.appendTerms, []);
  });
});

const fromAdvantage = ({ source }) => source === 'advantage';

/** A count check's decision under `advantage` with a forwarded `choice`, destination threshold. */
function countDecision(advantage, choice) {
  return resolveCheckDecision({
    authoredFormula: '1d20',
    actor: ACTOR,
    options: { interactive: true, rollDecision: { advantage: choice }, advantage },
    evaluation: countEvaluation({ modifierDestination: 'threshold' }),
    deferred: false,
    resolvedCheck: { formula: '', selected: [] },
    displayFormula: () => null,
    Roll: globalThis.Roll,
  });
}

describe('a counting check adds or removes dice on the pool', () => {
  it('moves the pool by countDice either way, whatever the modifier destination (MA13)', async () => {
    const advantaged = await countDecision({ countDice: 3 }, 'advantage');
    const disadvantaged = await countDecision({ countDice: 3 }, 'disadvantage');
    assert.deepEqual(
      [advantaged.placementPlan.poolDelta, disadvantaged.placementPlan.poolDelta],
      [3, -3]
    );
    assert.equal(advantaged.placementPlan.thresholdDelta, 0);
    assert.deepEqual(advantaged.contributions.filter(fromAdvantage), [
      { source: 'advantage', label: 'Advantage', form: 'scalar', value: 3 },
    ]);
  });

  it('a stale bonus mode still uses the count rule', async () => {
    const decision = await countDecision({ mode: 'bonus', countDice: 2 }, 'advantage');
    assert.equal(decision.placementPlan.poolDelta, 2);
  });

  it('leaves the pool alone when the rule is off (MA14)', async () => {
    const decision = await countDecision({ countEnabled: false, countDice: 3 }, 'advantage');
    assert.equal(decision.placementPlan.poolDelta, 0);
    assert.deepEqual(decision.contributions.filter(fromAdvantage), []);
  });

  it('rolls the changed pool through the count Roll', async () => {
    const dice = installCountDice({ faces: [9, 3, 8, 1, 2], chat: false });
    restores.push(dice.restore);
    const roll = (advantage, choice) =>
      runFormulaPassFail({
        formula: '',
        dc: 1,
        actor: ACTOR,
        evaluation: countEvaluation(),
        rollOptions: { interactive: true, rollDecision: { advantage: choice }, advantage },
      });
    await roll({ countDice: 3 }, 'advantage');
    await roll({ countDice: 1 }, 'disadvantage');
    await roll({ countEnabled: false }, 'advantage');
    assert.deepEqual(dice.formulas(), ['5d10', '1d10', '2d10']);
  });

  it('a prepared count check changes the pool by its snapshot rule', async () => {
    const dice = installCountDice({ faces: [9, 3, 8, 1], chat: false });
    restores.push(dice.restore);
    const preparation = preparedCountCheck();
    preparation.checkConfig.advantage = { countDice: 2 };
    const offer = { advantage: true, disadvantage: true, kind: 'count', detail: { dice: 2 } };
    const policy = preparedDecisionPolicy({ allowAdvantage: true, advantageOffer: offer });
    await evaluatePreparedRunCheck(preparation, ACTOR, { ...policy, advantage: 'advantage' });
    assert.deepEqual(dice.formulas(), ['4d10']);
  });
});

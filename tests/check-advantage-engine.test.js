/**
 * The advantage rule at every check site (issue 2007): each site threads its own record to the
 * engine, the engine rolls only a button that record's offer includes whatever transport carried
 * it (MA8, MA9, MA15), and a prepared check rolls its prepare-time snapshot (MA16).
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  evaluatePreparedCraftingCheck,
  evaluatePreparedRunCheck,
  runFormulaPassFail,
  runFormulaProgressive,
} from '../src/systems/checkRoll.js';
import { rollActorCheck } from '../src/systems/companionCheckRoll.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import {
  preparedDecisionPolicy,
  validatedPreparedDecision,
} from '../src/systems/preparedDecisionPolicy.js';
import { RUN_LIFECYCLE_VERSION } from '../src/systems/runLifecycleState.js';
import { buildInteractiveRollOptions } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

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

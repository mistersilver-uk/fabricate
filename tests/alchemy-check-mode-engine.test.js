/**
 * CraftingEngine — the system-level alchemy checkMode additions (issue 554):
 *   - `_runCraftingCheck` dispatch on `alchemy.checkMode` (none/simple/tiered);
 *   - the matched Simple-FAILURE path (`_resolveAlchemySimpleFailure`): consume via
 *     alchemy.consumeOnFail, produce the reserved failure group (nothing when empty),
 *     learn on match, and a distinct produced-on-failure disposition; and
 *   - the timed twin (`_finishAlchemySimpleFailure`) which never re-consumes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let _idCounter = 0;
globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => `id-${++_idCounter}` },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

function stubRoll(total, dice = []) {
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      return { total, dice };
    }
  };
}
function stubThrowingRoll() {
  globalThis.Roll = class {
    async evaluate() {
      throw new Error('bad formula');
    }
  };
}

function makeSystem(alchemy = {}, craftingCheck = {}) {
  return {
    id: 'sys-a',
    resolutionMode: 'alchemy',
    features: {},
    alchemy: { checkMode: 'none', learnOnCraft: true, consumeOnFail: true, ...alchemy },
    craftingCheck,
  };
}

function installSystem(system) {
  const resolutionService = { getMode: () => 'alchemy' };
  const engine = new CraftingEngine({}, null, resolutionService);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => resolutionService,
    },
  };
  return engine;
}

const ACTOR = { id: 'a1', name: 'Alchemist', items: [], uuid: 'Actor.a1' };
const RECIPE = { craftingSystemId: 'sys-a', name: 'Elixir' };
const runCheck = (engine) => engine._runCraftingCheck(RECIPE, ACTOR, [ACTOR], null);

// --- _runCraftingCheck dispatch ---------------------------------------------

test('checkMode=none returns an unconditional no-op success (ignores stray formula)', async () => {
  const engine = installSystem(makeSystem({ checkMode: 'none' }, { simple: { rollFormula: '1d20', dc: 15 } }));
  stubThrowingRoll();
  const result = await runCheck(engine);
  assert.equal(result.success, true);
  assert.equal(result.outcome, null);
});

test('checkMode=simple runs the pass/fail check; a pass succeeds, a fail fails', async () => {
  const engine = installSystem(makeSystem({ checkMode: 'simple' }, { simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet', dcMode: 'static' } }));
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  assert.equal((await runCheck(engine)).success, true);
  stubRoll(9, [{ number: 1, faces: 20, total: 9 }]);
  assert.equal((await runCheck(engine)).success, false);
});

test('checkMode=simple with no formula is a misconfiguration', async () => {
  const engine = installSystem(makeSystem({ checkMode: 'simple' }, { simple: { rollFormula: '' } }));
  const result = await runCheck(engine);
  assert.equal(result.success, false);
  assert.equal(result.misconfigured, true);
});

test('checkMode=tiered runs the routed check and returns the matched tier outcome', async () => {
  const engine = installSystem(
    makeSystem(
      { checkMode: 'tiered' },
      {
        routed: {
          rollFormula: '1d20',
          type: 'fixed',
          fixedOutcomes: [
            { id: 't-fail', name: 'Fail', success: false, start: 0, end: 9 },
            { id: 't-fine', name: 'Fine', success: true, start: 10, end: 30 },
          ],
        },
      }
    )
  );
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const result = await runCheck(engine);
  assert.equal(result.success, true);
  assert.equal(result.outcome, 'Fine');
});

test('checkMode=tiered with no routed formula is a misconfiguration', async () => {
  const engine = installSystem(makeSystem({ checkMode: 'tiered' }, { routed: { rollFormula: '' } }));
  const result = await runCheck(engine);
  assert.equal(result.success, false);
  assert.equal(result.misconfigured, true);
});

// --- Timed twin (`_finishTimedStep` path): never re-consumes ----------------
// The immediate `craft()` failure path is covered end-to-end in
// `alchemy-craft-integration.test.js` (through the REAL craft() + _createResultItems,
// no heavy stubs). The timed twin is only reachable via a matured time gate, so it
// is exercised here at the helper boundary — the one seam integration can't reach
// cheaply — to prove it produces + learns WITHOUT re-consuming.

function failureHarness({ consumeOnFail = true, learnOnCraft = true, failureGroupItems = ['potion-of-sludge'] } = {}) {
  const system = makeSystem({ checkMode: 'simple', consumeOnFail, learnOnCraft }, { simple: { rollFormula: '1d20', dc: 15 } });
  const calls = { consumed: 0, currency: 0, learn: 0, itemUse: 0, chat: null };
  const engine = installSystem(system);
  globalThis.game.fabricate.getRecipeVisibilityService = () => ({
    async applyRecipeItemUseOnCraft() {
      calls.itemUse += 1;
    },
    async learnRecipeOnCraft() {
      // Mirror the service's internal learnOnCraft gate so the test is realistic.
      if (system.alchemy.learnOnCraft !== true) return;
      calls.learn += 1;
    },
  });
  engine._consumeIngredients = async () => {
    calls.consumed += 1;
    return [];
  };
  engine._spendCraftCurrency = async () => {
    calls.currency += 1;
  };
  engine._resolveCraftingBreakageDecision = () => ({ forceBreak: false, authority: 'toolSpecific' });
  engine._applyToolBreakage = async () => [];
  engine._createResultItems = async () => ({
    items: failureGroupItems.map((name) => ({ name, uuid: `Item.${name}`, system: { quantity: 1 } })),
    resolutionMeta: {},
  });
  engine._postCraftChatMessage = async (payload) => {
    calls.chat = payload;
  };
  return { engine, calls, system };
}

test('the timed twin produces + learns WITHOUT re-consuming (components spent at START)', async () => {
  const { engine, calls } = failureHarness({ consumeOnFail: true });
  const runManager = { completeStepFailure: async () => {} };
  const outcome = await engine._finishAlchemySimpleFailure({
    craftingActor: ACTOR,
    componentSourceActors: [{ items: [] }],
    recipe: RECIPE,
    executionRecipe: RECIPE,
    step: {},
    stepIndex: 0,
    ingredientSet: { id: 'set-1' },
    consumedItems: [],
    consumedRunRefs: [],
    toolItems: [],
    resolvedEssences: {},
    checkResult: { success: false, outcome: 'fail', message: 'Failed', data: {} },
    runManager,
    run: { id: 'run-1' },
  });
  assert.equal(calls.consumed, 0, 'the timed twin never re-consumes');
  assert.equal(calls.currency, 0, 'no re-spend at FINISH');
  assert.equal(calls.learn, 1, 'still learns at FINISH');
  assert.equal(outcome.result.disposition, 'produced-on-failure');
});

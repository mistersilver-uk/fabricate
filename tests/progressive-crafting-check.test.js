// Engine integration tests for the progressive crafting check
// (CraftingEngine._runProgressiveCheck via _runCraftingCheck dispatch): the roll
// total becomes the numeric `value` progressive result-awarding spends, per-die
// crits force award-all/award-none, and a formula-less progressive check fails
// loudly (the legacy macro check source is gone).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

function defaultProgressive(overrides = {}) {
  return {
    awardMode: 'equal',
    allowPlayerReorder: false,
    rollFormula: '2d6',
    checkBreakage: { triggers: [] },
    ...overrides,
  };
}

// A unified trigger forcing `outcome` (and optionally breakTools) when the rolled
// group total equals `value` — the recombined replacement for a per-die crit.
function totalTrigger({ id = 't', groupId = 0, value, outcome = 'none', breakTools = false }) {
  return {
    id,
    condition: { type: 'diceGroup', groupId, aggregate: 'total', operator: '==', value },
    outcome,
    breakTools,
  };
}

function breakage(...triggers) {
  return { checkBreakage: { triggers } };
}

function makeEngine({ progressive, craftingCheck = {}, features = {} } = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode: 'progressive',
    features,
    craftingCheck: { enabled: true, progressive, ...craftingCheck },
  };
  const systemManager = { getSystem: () => system };
  const resolutionService = {
    getMode: () => system.resolutionMode,
    getResultSelection: () => null,
  };
  const engine = new CraftingEngine({}, null, resolutionService);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService,
    },
  };
  return { engine, system };
}

// Stub Foundry's Roll: evaluate() resolves to a fixed total and dice terms, each
// described as { number, faces, total } (mirroring an evaluated DiceTerm).
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

const ACTOR = { id: 'a1', name: 'Crafter', items: [] };
const run = (engine, recipe = { craftingSystemId: 'sys-1' }) =>
  engine._runCraftingCheck(recipe, ACTOR, [ACTOR], null);

// ── Plain roll → value is the total ─────────────────────────────────────────

test('a plain roll surfaces the total as the numeric value', async () => {
  const { engine } = makeEngine({ progressive: defaultProgressive() });
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  const result = await run(engine);
  assert.equal(result.success, true, 'progressive crafts always proceed');
  assert.equal(result.outcome, null);
  assert.equal(result.value, 8, 'the value equals the roll total');
  assert.equal(result.data.total, 8);
  assert.equal(result.data.breakTools, undefined, 'a plain progressive roll surfaces no breakTools');
});

// ── Forced-outcome triggers force award-all / award-none ─────────────────────

test('a success trigger forces value MAX_SAFE_INTEGER (award all)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive(breakage(totalTrigger({ groupId: 0, value: 12, outcome: 'success', breakTools: true }))),
  });
  stubRoll(12, [{ number: 2, faces: 6, total: 12 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, Number.MAX_SAFE_INTEGER, 'award-all sentinel');
});

test('a failure trigger forces value 0 (award nothing)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive(breakage(totalTrigger({ groupId: 0, value: 2, outcome: 'failure' }))),
  });
  // A high total (10) would normally award plenty; the failure trigger overrides it.
  stubRoll(10, [{ number: 2, faces: 6, total: 2 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, 0, 'award-none');
});

test('a matching forced failure takes precedence over a matching forced success', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      rollFormula: '1d20+1d6',
      ...breakage(
        totalTrigger({ id: 'c1', groupId: 0, value: 20, outcome: 'success' }),
        totalTrigger({ id: 'c2', groupId: 1, value: 1, outcome: 'failure' })
      ),
    }),
  });
  stubRoll(21, [
    { number: 1, faces: 20, total: 20 },
    { number: 1, faces: 6, total: 1 },
  ]);
  const result = await run(engine);
  assert.equal(result.value, 0, 'forced failure wins → award nothing');
});

test('a non-matching trigger leaves the rolled total as the value', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive(breakage(totalTrigger({ groupId: 0, value: 12, outcome: 'success' }))),
  });
  stubRoll(7, [{ number: 2, faces: 6, total: 7 }]);
  const result = await run(engine);
  assert.equal(result.value, 7);
});

// ── Roll engine edge cases ──────────────────────────────────────────────────

test('no Roll engine available does not block the craft (awards nothing)', async () => {
  const { engine } = makeEngine({ progressive: defaultProgressive() });
  delete globalThis.Roll;
  const result = await run(engine);
  assert.equal(result.success, true);
  // A finite 0 value (award nothing) rather than null, so progressive awarding
  // accepts it instead of treating the craft as a validation failure.
  assert.equal(result.value, 0);
});

test('a roll that throws fails the check with a message', async () => {
  const { engine } = makeEngine({ progressive: defaultProgressive() });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.match(result.message, /roll failed/i);
});

// ── Formula-less progressive fails loudly (no legacy macro path) ─────────────

test('a formula-less progressive check fails loudly (requires a roll formula)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({ rollFormula: '' }),
  });
  const result = await run(engine);
  assert.equal(result.success, false, 'progressive mode requires a configured roll formula');
  assert.match(result.message, /requires a configured crafting check roll formula/i);
});

// ── checkBreakage / value-vs-total distinction (issue 419) ───────────────────

test('progressive surfaces value (awarding) and data.total (raw roll) distinctly under a success trigger', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      rollFormula: '1d20',
      ...breakage(totalTrigger({ groupId: 0, value: 1, outcome: 'success' })),
    }),
  });
  // Natural 1 forces success: value → MAX_SAFE_INTEGER, data.total keeps raw 1.
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const r = await run(engine);
  assert.equal(r.value, Number.MAX_SAFE_INTEGER, 'awarding value is the forced award');
  assert.equal(r.data.total, 1, 'data.total keeps the raw roll');
});

test('checkDriven progressive: a progressiveValue trigger fires while a rollTotal trigger does not (distinct sources)', async () => {
  const progressive = defaultProgressive({
    rollFormula: '1d20',
    ...breakage(totalTrigger({ groupId: 0, value: 1, outcome: 'success' })),
  });
  const { engine, system } = makeEngine({ progressive });
  system.toolBreakage = { authority: 'checkDriven' };
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const r = await run(engine);
  // progressiveValue targets the awarded MAX; rollTotal targets the raw 1. Both
  // break-tools triggers, so only the one whose condition matches force-breaks.
  const progTrigger = { triggers: [{ id: 'pv', breakTools: true, condition: { type: 'progressiveValue', operator: '>=', value: 1000 } }] };
  const rollTrigger = { triggers: [{ id: 'rt', breakTools: true, condition: { type: 'rollTotal', operator: '>=', value: 1000 } }] };
  const { evaluateCheckBreakage } = await import('../src/toolBreakageRuntime.js');
  assert.equal(evaluateCheckBreakage({ checkBreakage: progTrigger, checkResult: r }).forceBreak, true);
  assert.equal(evaluateCheckBreakage({ checkBreakage: rollTrigger, checkResult: r }).forceBreak, false);
});

test('checkDriven progressive: surfaces data.diceGroups for the DSL', async () => {
  const { engine, system } = makeEngine({ progressive: defaultProgressive({ rollFormula: '2d6' }) });
  system.toolBreakage = { authority: 'checkDriven' };
  stubRoll(7, [{ number: 2, faces: 6, total: 7, results: [{ result: 3, active: true }, { result: 4, active: true }] }]);
  const r = await run(engine);
  assert.deepEqual(r.data.diceGroups, [{ groupId: 0, group: '2d6', sum: 7, results: [3, 4] }]);
});

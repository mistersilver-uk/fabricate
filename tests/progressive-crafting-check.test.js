// Engine integration tests for the progressive crafting check
// (CraftingEngine._runProgressiveCheck via _runCraftingCheck dispatch): the roll
// total becomes the numeric `value` progressive result-awarding spends, per-die
// crits force award-all/award-none, and a formula-less progressive check still
// defers to the legacy macro path.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');

function defaultProgressive(overrides = {}) {
  return {
    awardMode: 'equal',
    allowPlayerReorder: false,
    rollFormula: '2d6',
    diceCrits: [],
    ...overrides,
  };
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
  assert.equal(result.data.crit, null);
  assert.equal(result.data.breakTools, false);
});

// ── Crits force award-all / award-none ──────────────────────────────────────

test('a success crit forces value MAX_SAFE_INTEGER (award all) and can break tools', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      diceCrits: [{ id: 'c1', die: '2d6', raw: 12, success: true, breakTools: true }],
    }),
  });
  stubRoll(12, [{ number: 2, faces: 6, total: 12 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, Number.MAX_SAFE_INTEGER, 'award-all sentinel');
  assert.equal(result.data.crit.success, true);
  assert.equal(result.data.breakTools, true, 'the crit surfaces breakTools');
});

test('a failure crit forces value 0 (award nothing)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      diceCrits: [{ id: 'c1', die: '2d6', raw: 2, success: false }],
    }),
  });
  // A high total (10) would normally award plenty; the failure crit overrides it.
  stubRoll(10, [{ number: 2, faces: 6, total: 2 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, 0, 'award-none');
  assert.equal(result.data.crit.success, false);
  assert.equal(result.data.breakTools, false);
});

test('a matching forced failure takes precedence over a matching forced success', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      rollFormula: '1d20+1d6',
      diceCrits: [
        { id: 'c1', die: '1d20', raw: 20, success: true },
        { id: 'c2', die: '1d6', raw: 1, success: false },
      ],
    }),
  });
  stubRoll(21, [
    { number: 1, faces: 20, total: 20 },
    { number: 1, faces: 6, total: 1 },
  ]);
  const result = await run(engine);
  assert.equal(result.value, 0, 'forced failure wins → award nothing');
  assert.equal(result.data.crit.success, false);
});

test('a non-matching crit leaves the rolled total as the value', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({
      diceCrits: [{ id: 'c1', die: '2d6', raw: 12, success: true }],
    }),
  });
  stubRoll(7, [{ number: 2, faces: 6, total: 7 }]);
  const result = await run(engine);
  assert.equal(result.data.crit, null);
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

// ── Formula-less progressive defers to the legacy macro path ─────────────────

test('a formula-less progressive check defers to the configured macro', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({ rollFormula: '' }),
    craftingCheck: { checkSource: 'macro', macroUuid: 'Macro.legacy' },
  });
  const orig = MacroExecutor.run;
  let macroCalled = false;
  MacroExecutor.run = async () => {
    macroCalled = true;
    return { outcome: null, value: 5 };
  };
  try {
    const result = await run(engine);
    assert.equal(macroCalled, true, 'the legacy macro ran, not the progressive check');
    assert.equal(result.value, 5, 'the macro value is surfaced');
  } finally {
    MacroExecutor.run = orig;
  }
});

test('a formula-less progressive check with no macro requires one (fails)', async () => {
  const { engine } = makeEngine({
    progressive: defaultProgressive({ rollFormula: '' }),
    craftingCheck: { checkSource: 'macro', macroUuid: null },
  });
  const result = await run(engine);
  assert.equal(result.success, false, 'progressive mode requires a check when no formula is set');
  assert.match(result.message, /requires a crafting check macro/i);
});

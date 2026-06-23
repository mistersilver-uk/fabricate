// Engine integration tests for the simple pass/fail crafting check
// (CraftingEngine._runSimpleCheck): DC resolution (static / tier / dynamic),
// meet-vs-exceed comparison, per-die critical raw rolls, and the simple/alchemy
// gating. Covers the full matrix of authoring scenarios at craft time.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');

function defaultSimple(overrides = {}) {
  return {
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    diceCrits: [],
    ...overrides,
  };
}

function makeEngine({ simple, resolutionMode = 'simple', enabled = true, features = {} } = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode,
    features,
    craftingCheck: { enabled, simple },
  };
  const systemManager = { getSystem: () => system };
  const resolutionService = { getMode: () => system.resolutionMode };
  const engine = new CraftingEngine({}, null, resolutionService);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService,
    },
  };
  return { engine, system };
}

// Stub Foundry's Roll: evaluate() resolves to a fixed total and dice terms,
// each described as { number, faces, total } (mirroring an evaluated DiceTerm).
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
const run = (engine, recipe = { craftingSystemId: 'sys-1' }, ingredientSet = null) =>
  engine._runCraftingCheck(recipe, ACTOR, [ACTOR], ingredientSet);

// ── Static DC + comparison ──────────────────────────────────────────────────

test('static DC, meet: roll above the DC passes', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.outcome, 'pass');
  assert.equal(result.value, 18);
  assert.equal(result.data.dc, 15);
  assert.equal(result.data.comparison, 'meet');
});

test('static DC, meet: roll below the DC fails', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubRoll(10, [{ number: 1, faces: 20, total: 10 }]);
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'fail');
  assert.equal(result.value, 10);
});

test('meet: equal to the DC passes (>=)', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15, thresholdMode: 'meet' }) });
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  assert.equal((await run(engine)).success, true);
});

test('exceed: equal to the DC fails (>)', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15, thresholdMode: 'exceed' }) });
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.data.comparison, 'exceed');
});

test('exceed: strictly above the DC passes', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15, thresholdMode: 'exceed' }) });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  assert.equal((await run(engine)).success, true);
});

// ── Recipe tiers (static DC overrides) ──────────────────────────────────────

test('recipe tier overrides the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 10, tiers: [{ id: 't1', name: 'Masterwork', dc: 20 }] }),
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine, { craftingSystemId: 'sys-1', checkTierId: 't1' });
  assert.equal(result.data.dc, 20, 'uses the tier DC, not the default');
  assert.equal(result.success, false, '18 < 20');
});

test('unknown tier id falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, tiers: [{ id: 't1', dc: 20 }] }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const result = await run(engine, { craftingSystemId: 'sys-1', checkTierId: 'gone' });
  assert.equal(result.data.dc, 15);
  assert.equal(result.success, true);
});

// ── Dynamic DC (macro) ──────────────────────────────────────────────────────

test('dynamic DC: the macro return value is used as the DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 99, dcMode: 'dynamic', macroUuid: 'Macro.dc' }),
  });
  stubRoll(13, [{ number: 1, faces: 20, total: 13 }]);
  const orig = MacroExecutor.run;
  let received = null;
  MacroExecutor.run = async (uuid, context) => {
    received = { uuid, context };
    return 12;
  };
  try {
    const result = await run(engine, { craftingSystemId: 'sys-1' }, { id: 'set-1' });
    assert.equal(result.data.dc, 12);
    assert.equal(result.success, true, '13 >= 12');
    assert.equal(received.uuid, 'Macro.dc');
    assert.equal(
      received.context.candidateIngredientSet.id,
      'set-1',
      'macro gets the ingredient set'
    );
    assert.ok(received.context.craftingActor && received.context.recipe);
  } finally {
    MacroExecutor.run = orig;
  }
});

test('dynamic DC: a non-numeric macro return falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, dcMode: 'dynamic', macroUuid: 'Macro.dc' }),
  });
  stubRoll(14, [{ number: 1, faces: 20, total: 14 }]);
  const orig = MacroExecutor.run;
  MacroExecutor.run = async () => 'not a number';
  try {
    const result = await run(engine);
    assert.equal(result.data.dc, 15);
    assert.equal(result.success, false, '14 < 15');
  } finally {
    MacroExecutor.run = orig;
  }
});

test('dynamic DC: a throwing macro falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, dcMode: 'dynamic', macroUuid: 'Macro.dc' }),
  });
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const orig = MacroExecutor.run;
  MacroExecutor.run = async () => {
    throw new Error('boom');
  };
  try {
    const result = await run(engine);
    assert.equal(result.data.dc, 15);
    assert.equal(result.success, true);
  } finally {
    MacroExecutor.run = orig;
  }
});

test('dynamic DC: no macro linked falls back to the default DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15, dcMode: 'dynamic', macroUuid: null }),
  });
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const result = await run(engine);
  assert.equal(result.data.dc, 15);
  assert.equal(result.success, true);
});

// ── Critical raw rolls ──────────────────────────────────────────────────────

test('critical auto-succeed forces success below the DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      dc: 15,
      diceCrits: [{ id: 'c1', die: '1d20', raw: 20, effect: 'succeed' }],
    }),
  });
  stubRoll(5, [{ number: 1, faces: 20, total: 20 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.data.crit, 'succeed');
});

test('critical auto-fail forces failure above the DC', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      dc: 15,
      diceCrits: [{ id: 'c1', die: '1d20', raw: 1, effect: 'fail' }],
    }),
  });
  stubRoll(30, [{ number: 1, faces: 20, total: 1 }]);
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.data.crit, 'fail');
});

test('a matching auto-fail takes precedence over a matching auto-succeed', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      rollFormula: '1d20+1d6',
      dc: 15,
      diceCrits: [
        { id: 'c1', die: '1d20', raw: 20, effect: 'succeed' },
        { id: 'c2', die: '1d6', raw: 1, effect: 'fail' },
      ],
    }),
  });
  stubRoll(21, [
    { number: 1, faces: 20, total: 20 },
    { number: 1, faces: 6, total: 1 },
  ]);
  const result = await run(engine);
  assert.equal(result.success, false, 'fail wins');
  assert.equal(result.data.crit, 'fail');
});

test('a non-matching critical raw roll leaves the comparison in charge', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      dc: 15,
      diceCrits: [{ id: 'c1', die: '1d20', raw: 20, effect: 'succeed' }],
    }),
  });
  stubRoll(13, [{ number: 1, faces: 20, total: 13 }]);
  const result = await run(engine);
  assert.equal(result.data.crit, null);
  assert.equal(result.success, false, '13 < 15 and no crit');
});

// ── Gating: simple vs alchemy vs disabled ───────────────────────────────────

test('alchemy mode runs the simple check even when the enabled flag is off', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15 }),
    resolutionMode: 'alchemy',
    enabled: false,
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.data.dc, 15, 'the simple check ran');
});

test('simple mode with the check disabled does not run (no roll, auto-success)', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({ dc: 15 }),
    resolutionMode: 'simple',
    enabled: false,
  });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, true, 'a disabled optional check never blocks the craft');
  assert.equal(result.data.dc, undefined, 'the simple check was not evaluated');
});

test('an enabled check with no roll formula does not block the craft', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ rollFormula: '' }) });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, true);
});

// ── Roll engine edge cases ──────────────────────────────────────────────────

test('no Roll engine available does not block the craft', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  delete globalThis.Roll;
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.value, null);
  assert.equal(result.data.dc, 15);
});

test('a roll that throws fails the check with a message', async () => {
  const { engine } = makeEngine({ simple: defaultSimple({ dc: 15 }) });
  stubThrowingRoll();
  const result = await run(engine);
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'fail');
  assert.match(result.message, /roll failed/i);
});

test('dice-group sums (not single die faces) drive multi-die crits', async () => {
  const { engine } = makeEngine({
    simple: defaultSimple({
      rollFormula: '2d6',
      dc: 99,
      diceCrits: [{ id: 'c1', die: '2d6', raw: 12, effect: 'succeed' }],
    }),
  });
  // 2d6 summing to 12 matches the crit configured on the "2d6" group.
  stubRoll(12, [{ number: 2, faces: 6, total: 12 }]);
  const result = await run(engine);
  assert.equal(result.success, true);
  assert.equal(result.data.crit, 'succeed');
});

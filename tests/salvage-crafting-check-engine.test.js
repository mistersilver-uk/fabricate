// Engine tests for the formula-based salvage check (CraftingEngine
// ._runSalvageCraftingCheck dispatch): salvage simple (DC + per-component override
// + crits) and salvage progressive (value + award-all/none crits), plus the legacy
// macro fallback when no formula is configured.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { MacroExecutor } = await import('../src/utils/MacroExecutor.js');

function makeEngine() {
  return new CraftingEngine({}, null, {});
}

function stubRoll(total, dice = []) {
  globalThis.Roll = class {
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

const ACTOR = { id: 'a1', name: 'Salvager', items: [] };
const sys = (salvageCraftingCheck, salvageResolutionMode) => ({
  salvageResolutionMode,
  salvageCraftingCheck,
});
const run = (engine, system, component = {}) =>
  engine._runSalvageCraftingCheck(component, system, ACTOR, []);

// ── Salvage simple ──────────────────────────────────────────────────────────

test('salvage simple: roll at/above the DC passes', async () => {
  const engine = makeEngine();
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(engine, sys({ simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' } }, 'simple'));
  assert.equal(r.success, true);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.value, 16);
  assert.equal(r.data.dc, 15);
});

test('salvage simple: a per-component dcOverride replaces the default DC', async () => {
  const engine = makeEngine();
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 10, thresholdMode: 'meet' } }, 'simple'),
    { salvage: { dcOverride: 20 } }
  );
  assert.equal(r.data.dc, 20, 'uses the component override, not the default');
  assert.equal(r.success, false, '16 < 20');
});

test('salvage simple: a crit forces success below the DC and surfaces breakTools', async () => {
  const engine = makeEngine();
  stubRoll(3, [{ number: 1, faces: 20, total: 20 }]);
  const r = await run(
    engine,
    sys(
      { simple: { rollFormula: '1d20', dc: 15, diceCrits: [{ id: 'c', die: '1d20', raw: 20, success: true, breakTools: true }] } },
      'simple'
    )
  );
  assert.equal(r.success, true);
  assert.equal(r.data.breakTools, true);
});

// ── Salvage progressive ─────────────────────────────────────────────────────

test('salvage progressive: the roll total is the numeric value', async () => {
  const engine = makeEngine();
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  const r = await run(engine, sys({ progressive: { rollFormula: '2d6', awardMode: 'equal' } }, 'progressive'));
  assert.equal(r.success, true);
  assert.equal(r.value, 8);
});

test('salvage progressive: a success crit awards all (MAX_SAFE_INTEGER), a failure crit awards none', async () => {
  const engine = makeEngine();
  stubRoll(7, [{ number: 2, faces: 6, total: 12 }]);
  const all = await run(
    engine,
    sys({ progressive: { rollFormula: '2d6', diceCrits: [{ id: 'c', die: '2d6', raw: 12, success: true }] } }, 'progressive')
  );
  assert.equal(all.value, Number.MAX_SAFE_INTEGER);

  stubRoll(11, [{ number: 2, faces: 6, total: 2 }]);
  const none = await run(
    engine,
    sys({ progressive: { rollFormula: '2d6', diceCrits: [{ id: 'c', die: '2d6', raw: 2, success: false }] } }, 'progressive')
  );
  assert.equal(none.value, 0);
});

// ── Fallbacks ───────────────────────────────────────────────────────────────

test('no formula configured falls back to the legacy macro path', async () => {
  const engine = makeEngine();
  const orig = MacroExecutor.run;
  let called = false;
  MacroExecutor.run = async () => {
    called = true;
    return { success: true, outcome: 'pass', value: 5 };
  };
  try {
    const r = await run(engine, sys({ enabled: true, macroUuid: 'Macro.s', simple: { rollFormula: '' } }, 'simple'));
    assert.equal(called, true, 'the macro ran, not the formula check');
    assert.equal(r.value, 5);
  } finally {
    MacroExecutor.run = orig;
  }
});

test('salvage simple: a throwing roll fails the check with a message', async () => {
  const engine = makeEngine();
  stubThrowingRoll();
  const r = await run(engine, sys({ simple: { rollFormula: '1d20', dc: 15 } }, 'simple'));
  assert.equal(r.success, false);
  assert.match(r.message, /roll failed/i);
});

test('salvage progressive: no Roll engine awards nothing without blocking', async () => {
  const engine = makeEngine();
  delete globalThis.Roll;
  const r = await run(engine, sys({ progressive: { rollFormula: '2d6' } }, 'progressive'));
  assert.equal(r.success, true);
  assert.equal(r.value, 0);
});

// ── Salvage routed ──────────────────────────────────────────────────────────

const ROUTED_RELATIVE = [
  { id: 'crit', name: 'Critical', success: true, breakTools: false, dc: 10 },
  { id: 'ok', name: 'Success', success: true, breakTools: false, dc: 0 },
  { id: 'miss', name: 'Failure', success: false, breakTools: false, dc: -5 },
];

test('salvage routed: a formula whose total matches a tier surfaces that tier name as the outcome', async () => {
  const engine = makeEngine();
  // base dc 15: thresholds 25/15/10. total 16 → highest match is "Success" (15).
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(
    engine,
    sys(
      {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          relativeOutcomes: ROUTED_RELATIVE,
        },
      },
      'routed'
    )
  );
  assert.equal(r.outcome, 'Success');
  assert.equal(r.success, true);
  assert.equal(r.value, 16);
});

test('salvage routed: the matched outcome name routes to a result group via outcomeRouting', async () => {
  const engine = makeEngine();
  const component = {
    salvage: {
      resultGroups: [
        { id: 'g-crit', results: [] },
        { id: 'g-success', results: [] },
      ],
      outcomeRouting: { Critical: 'g-crit', Success: 'g-success' },
    },
  };
  const checkResult = { outcome: 'Success', value: 16 };
  const groups = engine._resolveSalvageResultGroups(
    component,
    { salvageResolutionMode: 'routed' },
    checkResult
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'g-success', 'routed outcome name maps to its result group');
});

test('salvage routed: an outcome with no outcomeRouting entry yields no result groups', async () => {
  const engine = makeEngine();
  const component = {
    salvage: {
      resultGroups: [{ id: 'g-crit', results: [] }],
      outcomeRouting: { Critical: 'g-crit' }, // "Success" is intentionally unrouted
    },
  };
  const groups = engine._resolveSalvageResultGroups(
    component,
    { salvageResolutionMode: 'routed' },
    { outcome: 'Success', value: 16 }
  );
  assert.deepEqual(groups, [], 'an unrouted outcome degrades to nothing, not a crash');
});

test('salvage routed: a per-component dcOverride shifts the relative thresholds', async () => {
  const engine = makeEngine();
  // total 16: with the default dc 15, "Success" (threshold 15) matches; with the
  // override dc 20 the only matching tier becomes "Failure" (threshold 15 = 20-5).
  stubRoll(16, [{ number: 1, faces: 20, total: 16 }]);
  const r = await run(
    engine,
    sys(
      {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          relativeOutcomes: ROUTED_RELATIVE,
        },
      },
      'routed'
    ),
    { salvage: { dcOverride: 20 } }
  );
  assert.equal(r.data.dc, 20);
  assert.equal(r.outcome, 'Failure', '20 - 5 = 15 is the only tier 16 still meets');
  assert.equal(r.success, false);
});

test('salvage routed WITHOUT a formula still falls through to the legacy macro path', async () => {
  const engine = makeEngine();
  // Would throw if the routed formula were actually rolled — proves no roll happens.
  stubThrowingRoll();
  const orig = MacroExecutor.run;
  let called = false;
  MacroExecutor.run = async () => {
    called = true;
    return { success: true, outcome: 'Success', value: 3 };
  };
  try {
    const r = await run(
      engine,
      sys(
        { enabled: true, macroUuid: 'Macro.r', routed: { type: 'relative', rollFormula: '', dc: 12 } },
        'routed'
      )
    );
    assert.equal(called, true, 'the macro ran, not the formula check');
    assert.equal(r.outcome, 'Success');
    assert.equal(r.value, 3);
  } finally {
    MacroExecutor.run = orig;
  }
});

// ── dcOverride = 0 edge (0 is a valid, finite DC) ───────────────────────────

test('salvage simple: a dcOverride of 0 is honoured as a valid DC (not treated as unset)', async () => {
  const engine = makeEngine();
  stubRoll(0, [{ number: 1, faces: 20, total: 0 }]);
  const r = await run(
    engine,
    sys({ simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' } }, 'simple'),
    { salvage: { dcOverride: 0 } }
  );
  assert.equal(r.data.dc, 0, '0 override replaces the default DC');
  assert.equal(r.success, true, '0 >= 0 passes');
});

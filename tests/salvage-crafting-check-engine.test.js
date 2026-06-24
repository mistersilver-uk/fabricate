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

// ── Routed not yet engine-evaluated (authoring-only until gathering routed) ──

test('salvage routed does not evaluate its formula yet (falls through to the macro path)', async () => {
  const engine = makeEngine();
  // Would throw if the routed formula were actually rolled.
  stubThrowingRoll();
  const r = await run(
    engine,
    sys({ routed: { type: 'relative', rollFormula: '1d20', dc: 12, relativeOutcomes: [] } }, 'routed')
  );
  // Routed salvage is dispatched to the (absent) macro path, not the formula check:
  // success with no outcome and no value, and the throwing roll is never reached.
  assert.equal(r.success, true);
  assert.equal(r.outcome, null);
  assert.equal(r.value, null);
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

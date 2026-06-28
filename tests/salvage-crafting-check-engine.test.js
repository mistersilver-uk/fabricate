// Engine tests for the formula-based salvage check (CraftingEngine
// ._runSalvageCraftingCheck dispatch): salvage simple (DC + per-component override
// + crits) and salvage progressive (value + award-all/none crits), plus the
// no-formula behaviour (optional no-op success, or a loud required-check failure).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

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

test('salvage simple: a forced-success trigger passes below the DC', async () => {
  const engine = makeEngine();
  stubRoll(3, [{ number: 1, faces: 20, total: 20 }]);
  const r = await run(
    engine,
    sys(
      {
        simple: {
          rollFormula: '1d20',
          dc: 15,
          checkBreakage: { triggers: [totalTrigger({ groupId: 0, value: 20, outcome: 'success' })] },
        },
      },
      'simple'
    )
  );
  assert.equal(r.success, true);
});

// ── Salvage progressive ─────────────────────────────────────────────────────

test('salvage progressive: the roll total is the numeric value', async () => {
  const engine = makeEngine();
  stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
  const r = await run(engine, sys({ progressive: { rollFormula: '2d6', awardMode: 'equal' } }, 'progressive'));
  assert.equal(r.success, true);
  assert.equal(r.value, 8);
});

test('salvage progressive: a success trigger awards all (MAX_SAFE_INTEGER), a failure trigger awards none', async () => {
  const engine = makeEngine();
  stubRoll(7, [{ number: 2, faces: 6, total: 12 }]);
  const all = await run(
    engine,
    sys({ progressive: { rollFormula: '2d6', checkBreakage: { triggers: [totalTrigger({ groupId: 0, value: 12, outcome: 'success' })] } } }, 'progressive')
  );
  assert.equal(all.value, Number.MAX_SAFE_INTEGER);

  stubRoll(11, [{ number: 2, faces: 6, total: 2 }]);
  const none = await run(
    engine,
    sys({ progressive: { rollFormula: '2d6', checkBreakage: { triggers: [totalTrigger({ groupId: 0, value: 2, outcome: 'failure' })] } } }, 'progressive')
  );
  assert.equal(none.value, 0);
});

// ── No-formula behaviour ─────────────────────────────────────────────────────

test('simple salvage with no formula is a no-op success (no legacy macro path)', async () => {
  const engine = makeEngine();
  const r = await run(engine, sys({ enabled: true, simple: { rollFormula: '' } }, 'simple'));
  assert.equal(r.success, true, 'an optional simple salvage check with no formula does not run');
  assert.equal(r.outcome, null);
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

test('salvage routed WITHOUT a formula fails loudly (no legacy macro path)', async () => {
  const engine = makeEngine();
  const r = await run(
    engine,
    sys({ enabled: true, routed: { type: 'relative', rollFormula: '', dc: 12 } }, 'routed')
  );
  assert.equal(r.success, false, 'routed salvage with no formula fails');
  assert.equal(r.outcome, null);
  assert.match(r.message, /requires a configured salvage check roll formula/);
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

// ── engineEvaluated + checkDriven parity (issue 419) ─────────────────────────

test('salvage simple is engine-evaluated and surfaces data.diceGroups', async () => {
  const engine = makeEngine();
  stubRoll(16, [{ number: 1, faces: 20, total: 16, results: [{ result: 16, active: true }] }]);
  const r = await run(engine, sys({ simple: { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' } }, 'simple'));
  assert.equal(r.engineEvaluated, true);
  assert.deepEqual(r.data.diceGroups, [{ groupId: 0, group: '1d20', sum: 16, results: [16] }]);
});

test('checkDriven salvage: the active salvage check checkBreakage decides forced breakage (parity)', async () => {
  const engine = makeEngine();
  stubRoll(1, [{ number: 1, faces: 20, total: 1, results: [{ result: 1, active: true }] }]);
  const checkBreakage = {
    triggers: [{ id: 'nat1', breakTools: true, outcome: 'none', condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 } }],
  };
  const system = {
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { simple: { rollFormula: '1d20', dc: 1, thresholdMode: 'meet', checkBreakage } },
    toolBreakage: { authority: 'checkDriven' },
  };
  const r = await run(engine, system);
  const decision = engine._resolveSalvageBreakageDecision(system, r);
  assert.equal(decision.authority, 'checkDriven');
  assert.equal(decision.forceBreak, true);
  assert.equal(decision.triggerId, 'nat1');
});

test('toolSpecific salvage: a breakTools trigger never force-breaks (either-or authority)', async () => {
  const engine = makeEngine();
  stubRoll(3, [{ number: 1, faces: 20, total: 20, results: [{ result: 20, active: true }] }]);
  const system = {
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      simple: {
        rollFormula: '1d20',
        dc: 15,
        checkBreakage: { triggers: [totalTrigger({ id: 'bt', groupId: 0, value: 20, outcome: 'success', breakTools: true })] },
      },
    },
  };
  const r = await run(engine, system);
  const decision = engine._resolveSalvageBreakageDecision(system, r);
  assert.equal(decision.authority, 'toolSpecific');
  assert.equal(decision.forceBreak, false, 'a check never breaks tools under toolSpecific');
});

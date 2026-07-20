// Unit tests for nat-20/nat-1 tier stepping on the routed check runner
// (src/systems/checkRoll.js `runFormulaRouted` with `natStepping: true`):
// step up/down, cap/floor at the ladder ends, precedence of forced (crit
// trigger) outcomes, relative-type scoping, and the advantage-pool kept die.
import test from 'node:test';
import assert from 'node:assert/strict';

const { runFormulaRouted } = await import('../src/systems/checkRoll.js');

// Standard relative quality ladder over base DC 15: thresholds -15 / 15 / 20 / 25.
const TIERS = [
  { id: 'ruined', name: 'Ruined', dc: -30, success: false, breakTools: false },
  { id: 'standard', name: 'Standard', dc: 0, success: true, breakTools: false },
  { id: 'fine', name: 'Fine', dc: 5, success: true, breakTools: false },
  { id: 'masterwork', name: 'Masterwork', dc: 10, success: true, breakTools: false },
];

// Stub the dice engine: `evaluate()` yields the given total and a single d20
// dice group showing `face` (matching the check-roll.test.js stub conventions).
function stubRoll(total, face, { pool = false } = {}) {
  const dice = pool
    ? [
        {
          number: 2,
          faces: 20,
          total: face,
          results: [{ result: face }, { result: 3, active: false }],
        },
      ]
    : [{ number: 1, faces: 20, total: face, results: [{ result: face }] }];
  globalThis.Roll = class {
    async evaluate() {
      return { total, dice };
    }
  };
}

const ACTOR = { getRollData: () => ({}) };

function routedArgs(overrides = {}) {
  return {
    formula: '1d20 + 3',
    dc: 15,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: TIERS,
    fixedOutcomes: [],
    triggers: [],
    actor: ACTOR,
    clampToNearest: true,
    natStepping: true,
    ...overrides,
  };
}

test('natStepping: a natural 20 steps the matched tier UP one', async () => {
  stubRoll(23, 20); // 23 matches Fine (>= 20, < 25)
  const result = await runFormulaRouted(routedArgs());
  assert.equal(result.outcome, 'Masterwork');
  assert.equal(result.data.outcomeId, 'masterwork');
  assert.equal(result.success, true);
  assert.deepEqual(result.data.natStep, {
    natural: 20,
    direction: 'up',
    fromOutcomeId: 'fine',
    toOutcomeId: 'masterwork',
  });
});

test('natStepping: a natural 1 steps the matched tier DOWN one', async () => {
  stubRoll(21, 1); // 21 matches Fine (a big flat bonus carried the nat 1 there)
  const result = await runFormulaRouted(routedArgs());
  assert.equal(result.outcome, 'Standard');
  assert.equal(result.data.outcomeId, 'standard');
  assert.deepEqual(result.data.natStep, {
    natural: 1,
    direction: 'down',
    fromOutcomeId: 'fine',
    toOutcomeId: 'standard',
  });
});

test('natStepping: stepping down can flip success to failure (tier flags rule)', async () => {
  stubRoll(16, 1); // 16 matches Standard (success tier)
  const result = await runFormulaRouted(routedArgs());
  assert.equal(result.outcome, 'Ruined');
  assert.equal(result.success, false);
  assert.equal(result.data.natStep.direction, 'down');
});

test('natStepping: capped at the best tier — no step, no natStep annotation', async () => {
  stubRoll(30, 20); // already Masterwork
  const result = await runFormulaRouted(routedArgs());
  assert.equal(result.outcome, 'Masterwork');
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: floored at the worst tier — no step, no natStep annotation', async () => {
  stubRoll(4, 1); // matches Ruined (threshold -15) already
  const result = await runFormulaRouted(routedArgs());
  assert.equal(result.outcome, 'Ruined');
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: a forced (crit trigger) outcome takes precedence — no stepping on top', async () => {
  stubRoll(23, 20);
  const result = await runFormulaRouted(
    routedArgs({
      triggers: [
        {
          id: 'crit',
          condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 20 },
          outcome: 'success',
          breakTools: false,
        },
      ],
    })
  );
  // The forced success routes to the BEST succeeding tier itself; stepping must
  // not fire again (and must not be annotated).
  assert.equal(result.outcome, 'Masterwork');
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: a forced failure routes to the worst failing tier with no down-step on top', async () => {
  stubRoll(21, 1);
  const result = await runFormulaRouted(
    routedArgs({
      triggers: [
        {
          id: 'fumble',
          condition: { type: 'diceGroup', groupId: 0, aggregate: 'total', operator: '==', value: 1 },
          outcome: 'failure',
          breakTools: false,
        },
      ],
    })
  );
  assert.equal(result.outcome, 'Ruined');
  assert.equal(result.success, false);
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: off by default — a natural 20 routes its rolled tier unchanged', async () => {
  stubRoll(23, 20);
  const result = await runFormulaRouted(routedArgs({ natStepping: false }));
  assert.equal(result.outcome, 'Fine');
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: ignored for the fixed type (relative-only feature)', async () => {
  stubRoll(23, 20);
  const result = await runFormulaRouted(
    routedArgs({
      type: 'fixed',
      relativeOutcomes: [],
      fixedOutcomes: [
        { id: 'low', name: 'Low', start: 1, end: 24, success: true, breakTools: false },
        { id: 'high', name: 'High', start: 25, end: 99, success: true, breakTools: false },
      ],
    })
  );
  assert.equal(result.outcome, 'Low');
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: an advantage pool (2d20kh1) steps on its KEPT die', async () => {
  stubRoll(23, 20, { pool: true }); // active faces: [20]; dropped 3 filtered out
  const result = await runFormulaRouted(routedArgs());
  assert.equal(result.outcome, 'Masterwork');
  assert.equal(result.data.natStep.natural, 20);
});

test('natStepping: a non-d20 formula never steps (no d20 group to read)', async () => {
  globalThis.Roll = class {
    async evaluate() {
      return {
        total: 23,
        dice: [{ number: 3, faces: 6, total: 18, results: [{ result: 6 }, { result: 6 }, { result: 6 }] }],
      };
    }
  };
  const result = await runFormulaRouted(routedArgs({ formula: '3d6 + 5' }));
  assert.equal(result.outcome, 'Fine');
  assert.equal(result.data.natStep, undefined);
});

test('natStepping: the stepped tier drives the routed breakTools bridge', async () => {
  const tiers = [
    { id: 'ruined', name: 'Ruined', dc: -30, success: false, breakTools: true },
    { id: 'standard', name: 'Standard', dc: 0, success: true, breakTools: false },
  ];
  stubRoll(16, 1); // matches Standard, steps down to Ruined (breakTools: true)
  const result = await runFormulaRouted(routedArgs({ relativeOutcomes: tiers }));
  assert.equal(result.outcome, 'Ruined');
  assert.equal(result.data.breakTools, true);
});

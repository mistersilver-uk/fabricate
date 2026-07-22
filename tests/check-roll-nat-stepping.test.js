import test from 'node:test';
import assert from 'node:assert/strict';

import { runFormulaRouted } from '../src/systems/checkRoll.js';

const RELATIVE_OUTCOMES = Object.freeze([
  { id: 'low', name: 'Low', dc: -5, success: false },
  { id: 'middle', name: 'Middle', dc: 0, success: true },
  { id: 'high', name: 'High', dc: 5, success: true },
]);

function installRoll(t, { total = 10, dice }) {
  globalThis.Roll = class {
    async evaluate() {
      return { total, dice };
    }
  };
  t.after(() => delete globalThis.Roll);
}

function d20Group(results, total = results.find((entry) => entry.active !== false)?.result) {
  return { number: results.length, faces: 20, total, results };
}

function routed(overrides = {}) {
  return runFormulaRouted({
    formula: '1d20',
    dc: 10,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: RELATIVE_OUTCOMES,
    fixedOutcomes: [],
    triggers: [],
    natStepping: true,
    ...overrides,
  });
}

test('natural 20 steps a relative routed result up exactly one tier', async (t) => {
  installRoll(t, { total: 10, dice: [d20Group([{ result: 20 }])] });

  const result = await routed();

  assert.equal(result.outcome, 'High');
  assert.deepEqual(result.data.natStep, {
    face: 20,
    direction: 'up',
    fromOutcomeId: 'middle',
    toOutcomeId: 'high',
  });
});

test('natural 1 steps a relative routed result down exactly one tier', async (t) => {
  installRoll(t, { total: 10, dice: [d20Group([{ result: 1 }])] });

  const result = await routed();

  assert.equal(result.outcome, 'Low');
  assert.deepEqual(result.data.natStep, {
    face: 1,
    direction: 'down',
    fromOutcomeId: 'middle',
    toOutcomeId: 'low',
  });
});

test('advantage and disadvantage inspect only the active kept face', async (t) => {
  await t.test('advantage ignores the inactive natural 1', async (t) => {
    installRoll(t, {
      total: 10,
      dice: [d20Group([{ result: 1, active: false }, { result: 20, active: true }], 20)],
    });
    assert.equal((await routed()).outcome, 'High');
  });

  await t.test('disadvantage ignores the inactive natural 20', async (t) => {
    installRoll(t, {
      total: 10,
      dice: [d20Group([{ result: 20, active: false }, { result: 1, active: true }], 1)],
    });
    assert.equal((await routed()).outcome, 'Low');
  });
});

test('forced outcomes take precedence over natural stepping', async (t) => {
  installRoll(t, { total: 10, dice: [d20Group([{ result: 20 }])] });
  const result = await routed({
    triggers: [
      {
        outcome: 'failure',
        condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 20 },
      },
    ],
  });

  assert.equal(result.outcome, 'Low');
  assert.equal(result.data.natStep, undefined);
});

test('fixed checks, cap/floor no-ops, and rolls without a d20 do not report natStep', async (t) => {
  await t.test('fixed check', async (t) => {
    installRoll(t, { total: 10, dice: [d20Group([{ result: 20 }])] });
    const result = await routed({
      type: 'fixed',
      relativeOutcomes: [],
      fixedOutcomes: [{ id: 'fixed', name: 'Fixed', start: 1, end: 20, success: true }],
    });
    assert.equal(result.outcome, 'Fixed');
    assert.equal(result.data.natStep, undefined);
  });

  await t.test('top cap', async (t) => {
    installRoll(t, { total: 15, dice: [d20Group([{ result: 20 }])] });
    const result = await routed();
    assert.equal(result.outcome, 'High');
    assert.equal(result.data.natStep, undefined);
  });

  await t.test('bottom floor', async (t) => {
    installRoll(t, { total: 5, dice: [d20Group([{ result: 1 }])] });
    const result = await routed();
    assert.equal(result.outcome, 'Low');
    assert.equal(result.data.natStep, undefined);
  });

  await t.test('no d20', async (t) => {
    installRoll(t, {
      total: 10,
      dice: [{ number: 2, faces: 6, total: 10, results: [{ result: 6 }, { result: 4 }] }],
    });
    const result = await routed({ formula: '2d6' });
    assert.equal(result.outcome, 'Middle');
    assert.equal(result.data.natStep, undefined);
  });
});

test('nat stepping is default-off and occurs after relative tier matching', async (t) => {
  installRoll(t, { total: 10, dice: [d20Group([{ result: 20 }])] });

  const defaultOff = await routed({ natStepping: undefined });
  assert.equal(defaultOff.outcome, 'Middle');
  assert.equal(defaultOff.data.natStep, undefined);
});

test('the first d20 group is authoritative and an ordinary kept face does not step', async (t) => {
  installRoll(t, {
    total: 10,
    dice: [d20Group([{ result: 10 }]), d20Group([{ result: 20 }])],
  });

  const result = await routed();

  assert.equal(result.outcome, 'Middle');
  assert.equal(result.data.natStep, undefined);
});

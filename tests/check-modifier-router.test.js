import test from 'node:test';
import assert from 'node:assert/strict';

import {
  planModifierPlacement,
  settlePlacement,
} from '../src/systems/checkModifierRouter.js';

const sum = (direction = 'over', source = 'fixed') => ({
  product: 'sum',
  direction,
  target: { source },
});

const count = (direction = 'over', modifierDestination = 'pool') => ({
  product: 'count',
  direction,
  pool: { modifierDestination },
});

test('sum/over keeps resolved terms in legacy order for either target source', () => {
  const contributions = [
    { source: 'advantage', label: 'Bonus die', form: 'expression', expression: '1d6' },
    { source: 'library', label: 'Fire', form: 'expression', expression: '(1d4[fire])' },
    { source: 'situational', label: 'Situation', form: 'scalar', value: -2 },
    { source: 'tool', label: 'Tongs', form: 'scalar', value: 1.5 },
    { source: 'library', label: 'Modifiers', form: 'scalar', value: -0.25 },
    { source: 'tool', label: 'Gloves', form: 'scalar', value: 0 },
  ];
  const original = structuredClone(contributions);

  for (const source of ['fixed', 'attribute']) {
    const plan = planModifierPlacement({ evaluation: sum('over', source), contributions });
    assert.deepEqual(plan.appendTerms.map(({ source, form, value, expression }) => ({
      source, form, value, expression,
    })), [
      { source: 'tool', form: 'scalar', value: 1.5, expression: undefined },
      { source: 'library', form: 'scalar', value: -0.25, expression: undefined },
      { source: 'library', form: 'expression', value: undefined, expression: '(1d4[fire])' },
      { source: 'situational', form: 'scalar', value: -2, expression: undefined },
      { source: 'advantage', form: 'expression', value: undefined, expression: '1d6' },
    ]);
    assert.deepEqual([plan.targetDelta, plan.thresholdDelta, plan.poolDelta], [0, 0, 0]);
    assert.deepEqual(plan.preRolls, []);
    assert.deepEqual(settlePlacement(plan, []), plan);
  }
  assert.deepEqual(contributions, original);
});

test('sum/under turns signed contributions into target benefits and settles by index', () => {
  const contributions = [
    { source: 'library', label: 'Twin', form: 'expression', expression: '1d4' },
    { source: 'library', label: 'Twin', form: 'expression', expression: '2d4' },
    { source: 'tool', label: 'Hammer', form: 'scalar', value: -1.25 },
    { source: 'situational', label: 'Weather', form: 'scalar', value: 0.5 },
  ];
  const plan = planModifierPlacement({ evaluation: sum('under'), contributions });
  assert.deepEqual(plan.appendTerms, []);
  assert.equal(plan.targetDelta, -0.75);
  assert.deepEqual(plan.preRolls.map(({ index, label, expression, destination }) => ({
    index, label, expression, destination,
  })), [
    { index: 0, label: 'Twin', expression: '1d4', destination: 'target' },
    { index: 1, label: 'Twin', expression: '2d4', destination: 'target' },
  ]);
  const settled = settlePlacement(plan, [{ index: 1, total: -0.5 }, { index: 0, total: 2.25 }]);
  assert.equal(settled.targetDelta, 1);
  assert.deepEqual(settled.preRolls.map(({ index, total }) => ({ index, total })), [
    { index: 0, total: 2.25 },
    { index: 1, total: -0.5 },
  ]);
  assert.equal(plan.targetDelta, -0.75);
  assert.ok(plan.preRolls.every((entry) => !Object.hasOwn(entry, 'total')));
});

test('count sends all benefits to the selected destination except synthetic advantage', () => {
  const contributions = [
    { source: 'tool', label: 'Tool', form: 'scalar', value: 0.25 },
    { source: 'library', label: 'Penalty', form: 'scalar', value: -1.5 },
    { source: 'situational', label: 'Weather', form: 'expression', expression: '1d4-2' },
    { source: 'advantage', label: 'Advantage', form: 'scalar', value: 1 },
  ];

  const pool = planModifierPlacement({ evaluation: count('over', 'pool'), contributions });
  assert.equal(pool.poolDelta, -0.25);
  assert.equal(pool.thresholdDelta, 0);
  assert.equal(pool.preRolls[0].destination, 'pool');
  const settledPool = settlePlacement(pool, [{ index: 2, total: 0.75 }]);
  assert.equal(settledPool.poolDelta, 0.5);

  for (const direction of ['over', 'under']) {
    const plan = planModifierPlacement({ evaluation: count(direction, 'threshold'), contributions });
    assert.equal(plan.poolDelta, 1);
    assert.equal(plan.thresholdDelta, direction === 'over' ? 1.25 : -1.25);
    assert.equal(plan.preRolls[0].destination, 'threshold');
    const settled = settlePlacement(plan, [{ index: 2, total: 0.75 }]);
    assert.equal(settled.thresholdDelta, direction === 'over' ? 0.5 : -0.5);
    assert.equal(settled.poolDelta, 1);
  }
});

test('already rolled tool evidence is carried without requesting another roll', () => {
  const evidence = { expression: '1d4+1', total: 3, serializedRoll: { formula: '1d4+1' } };
  const contributions = [{
    source: 'tool', label: 'Hammer', form: 'scalar', value: 3, preRoll: evidence,
  }];
  const plan = planModifierPlacement({ evaluation: sum('under'), contributions });
  assert.equal(plan.targetDelta, 3);
  assert.deepEqual(plan.preRolls, [{
    index: 0, source: 'tool', label: 'Hammer', expression: '1d4+1',
    destination: 'target', total: 3, serializedRoll: { formula: '1d4+1' },
  }]);
  assert.deepEqual(settlePlacement(plan, []), plan);
  const settled = settlePlacement(plan, []);
  settled.preRolls[0].serializedRoll.formula = 'elsewhere';
  assert.equal(plan.preRolls[0].serializedRoll.formula, '1d4+1');
  evidence.serializedRoll.formula = 'changed';
  assert.equal(plan.preRolls[0].serializedRoll.formula, '1d4+1');
});

test('source provenance stays separate from scalar or expression form', () => {
  for (const source of ['tool', 'library', 'situational', 'advantage']) {
    const scalar = { source, label: 'Repeated', form: 'scalar', value: -0.5 };
    const expression = { source, label: 'Repeated', form: 'expression', expression: '1d4-2' };
    const evaluation = count('under', 'threshold');
    const plan = planModifierPlacement({ evaluation, contributions: [scalar, expression] });
    assert.deepEqual(plan.appendTerms, []);
    assert.equal(plan.preRolls[0].source, source);
    assert.equal(plan.preRolls[0].index, 1);
    assert.equal(plan.preRolls[0].destination, source === 'advantage' ? 'pool' : 'threshold');
    const settled = settlePlacement(plan, [{ index: 1, total: 1.25 }]);
    assert.equal(settled.poolDelta, source === 'advantage' ? 0.75 : 0);
    assert.equal(settled.thresholdDelta, source === 'advantage' ? 0 : 0.75);
  }
});

test('settlement rejects missing, repeated or non-finite results instead of losing a benefit', () => {
  const plan = planModifierPlacement({
    evaluation: count(),
    contributions: [{ source: 'library', label: 'A', form: 'expression', expression: '1d6' }],
  });
  assert.throws(() => settlePlacement(plan, []), /missing/i);
  assert.throws(() => settlePlacement(plan, [{ index: 0, total: Infinity }]), /finite/i);
  assert.throws(() => settlePlacement(plan, [{ index: 1, total: 2 }]), /unknown/i);
  assert.throws(() => settlePlacement(plan, [{ index: 0, total: 2 }, { index: 0, total: 3 }]), /duplicate/i);
  assert.throws(() => planModifierPlacement({ evaluation: sum(), contributions: [
    { source: 'advantage', label: 'Synthetic', form: 'scalar', value: 1 },
  ] }), /count pool/i);
});

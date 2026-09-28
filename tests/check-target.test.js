import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compareToTarget } from '../src/systems/checkEvaluation.js';
import {
  attributeTargetBasis,
  CHECK_TARGET_REFUSALS,
  checkRefusalMessage,
  isValidTargetAdjustment,
  multiplyTierThreshold,
  resolveCheckTarget,
  selectTargetAdjustment,
} from '../src/systems/checkTarget.js';

function attribute(expression, adjustmentKind = 'add', baseAdjustment = null) {
  return {
    product: 'sum',
    direction: 'under',
    target: { source: 'attribute', expression, adjustmentKind, baseAdjustment },
  };
}

function resolveAttribute(expression, rollData, adjustmentKind = 'add', adjustment = null) {
  return resolveCheckTarget({
    evaluation: attribute(expression, adjustmentKind),
    rollData,
    anchor: 99,
    adjustment,
  });
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

test('the refusal-reason enum is exactly the shared runtime, preview and readiness list', () => {
  assert.deepEqual(CHECK_TARGET_REFUSALS, [
    'expression-missing',
    'unresolved-path',
    'non-finite',
    'dice',
    'invalid',
    'adjustment-invalid',
    'progressive-under',
    'formula-empty',
  ]);
  assert.ok(Object.isFrozen(CHECK_TARGET_REFUSALS));
});

test('a fixed target keeps its anchor and ignores the expression and every adjustment', () => {
  for (const direction of ['over', 'under']) {
    const evaluation = {
      product: 'sum',
      direction,
      target: { source: 'fixed', expression: '@skill', adjustmentKind: 'multiply', baseAdjustment: 0.5 },
    };
    assert.deepEqual(resolveCheckTarget({ evaluation, rollData: {}, anchor: 55, adjustment: 0.5 }), {
      ok: true,
      target: 55,
      source: 'fixed',
    });
  }
  assert.deepEqual(resolveCheckTarget({ evaluation: undefined, anchor: 15 }), {
    ok: true,
    target: 15,
    source: 'fixed',
  });
  assert.deepEqual(resolveCheckTarget({ evaluation: undefined, anchor: Number.NaN }), {
    ok: false,
    reason: 'non-finite',
  });
});

test('fixed target 55 under: meet accepts 55 and rejects 56, and exceed rejects 55', () => {
  const evaluation = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
  const { target } = resolveCheckTarget({ evaluation, anchor: 55 });
  assert.equal(compareToTarget(55, target, 'meet', 'under'), true);
  assert.equal(compareToTarget(56, target, 'meet', 'under'), false);
  assert.equal(compareToTarget(55, target, 'exceed', 'under'), false);
  assert.equal(compareToTarget(54, target, 'exceed', 'under'), true);
});

test('an attribute target resolves its expression and ignores the fixed anchor', () => {
  const rollData = { skills: { craft: { value: 55 } } };
  for (const direction of ['over', 'under']) {
    const evaluation = { ...attribute('@skills.craft.value'), direction };
    assert.deepEqual(resolveCheckTarget({ evaluation, rollData, anchor: 99 }), {
      ok: true,
      target: 55,
      source: 'attribute',
    });
  }
  assert.equal(resolveAttribute('@skills.craft.value - 5', rollData).target, 50);
});

test('an added adjustment is added before flooring', () => {
  assert.equal(resolveAttribute('@v', { v: 12 }, 'add', -2).target, 10);
  assert.equal(resolveAttribute('@v', { v: 12 }, 'add', 0.5).target, 12);
  assert.equal(resolveAttribute('@v', { v: 12.5 }, 'add', 0.5).target, 13);
  assert.equal(resolveAttribute('@v', { v: 12.5 }, 'add', null).target, 12);
  assert.equal(resolveAttribute('@v', { v: 12 }, 'add', 0).target, 12);
});

test('a multiplier is applied before flooring', () => {
  const rollData = { v: 55 };
  assert.equal(resolveAttribute('@v', rollData, 'multiply', 1).target, 55);
  assert.equal(resolveAttribute('@v', rollData, 'multiply', 0.5).target, 27);
  assert.equal(resolveAttribute('@v', rollData, 'multiply', 0.2).target, 11);
  assert.equal(resolveAttribute('@v', rollData, 'multiply', 2).target, 110);
  assert.equal(resolveAttribute('@v', { v: 9.5 }, 'multiply', 2).target, 19);
  assert.equal(resolveAttribute('@v', { v: -5 }, 'multiply', 0.5).target, -3);
  assert.equal(resolveAttribute('@v', { v: 55 }, 'multiply', null).target, 55);
});

test('a relative multiply tier floors the already-floored anchor again', () => {
  const anchor = resolveAttribute('@v', { v: 9 }, 'multiply', 0.5).target;
  assert.equal(anchor, 4);
  assert.equal(multiplyTierThreshold(anchor, 2), 8);
  assert.equal(multiplyTierThreshold(55, 0.5), 27);
  assert.equal(multiplyTierThreshold(55, 0.2), 11);
  assert.equal(multiplyTierThreshold(-5, 0.5), -3);
  assert.equal(multiplyTierThreshold(55, 2), 110);
  for (const invalid of [0, -1, Number.NaN, Infinity, null]) {
    assert.ok(Number.isNaN(multiplyTierThreshold(55, invalid)), String(invalid));
  }
});

test('QE14 boundaries: a roll of 28 misses Hard at 55×½ and meets Regular; exceed is strict', () => {
  const hard = multiplyTierThreshold(55, 0.5);
  const regular = multiplyTierThreshold(55, 1);
  assert.equal(compareToTarget(28, hard, 'meet', 'under'), false);
  assert.equal(compareToTarget(28, regular, 'meet', 'under'), true);
  assert.equal(compareToTarget(27, hard, 'meet', 'under'), true);
  assert.equal(compareToTarget(27, hard, 'exceed', 'under'), false);
  assert.equal(compareToTarget(26, hard, 'exceed', 'under'), true);
});

test('adjustment validity: an addend is any finite number, a multiplier a finite number above zero', () => {
  for (const value of [0, -2, 0.5, 7, -0.25]) {
    assert.equal(isValidTargetAdjustment('add', value), true, String(value));
  }
  for (const value of [0.5, 1, 2, 0.001]) {
    assert.equal(isValidTargetAdjustment('multiply', value), true, String(value));
  }
  for (const value of [Number.NaN, Infinity, -Infinity, null, undefined, '2']) {
    assert.equal(isValidTargetAdjustment('add', value), false, String(value));
    assert.equal(isValidTargetAdjustment('multiply', value), false, String(value));
  }
  for (const value of [0, -0.5, -2]) {
    assert.equal(isValidTargetAdjustment('multiply', value), false, String(value));
  }
});

test('an invalid active adjustment refuses adjustment-invalid instead of resolving', () => {
  for (const multiplier of [0, -0.5]) {
    assert.deepEqual(resolveAttribute('@v', { v: 55 }, 'multiply', multiplier), {
      ok: false,
      reason: 'adjustment-invalid',
    });
  }
  assert.deepEqual(resolveAttribute('@v', { v: 55 }, 'add', Infinity), {
    ok: false,
    reason: 'adjustment-invalid',
  });
  assert.deepEqual(resolveAttribute('@v', { v: 1e308 }, 'multiply', 10), {
    ok: false,
    reason: 'non-finite',
  });
});

test('adjustment selection takes a non-null override, else the base, and a null base is identity', () => {
  const base = attribute('@v', 'multiply', 0.5);
  const tier = { id: 'hard', adjustment: 0.2 };
  const component = { salvage: { adjustmentOverride: 0 } };
  const task = { adjustmentOverride: null };
  assert.equal(selectTargetAdjustment(base, tier.adjustment), 0.2);
  assert.equal(selectTargetAdjustment(attribute('@v', 'add', 3), component.salvage.adjustmentOverride), 0);
  assert.equal(selectTargetAdjustment(base, task.adjustmentOverride), 0.5);
  assert.equal(selectTargetAdjustment(base, undefined), 0.5);
  assert.equal(selectTargetAdjustment(attribute('@v'), null), null);
  assert.equal(selectTargetAdjustment(undefined, undefined), null);
});

test('each unusable expression refuses with its own reason and never reads as 0', () => {
  const cases = [
    ['', {}, 'expression-missing'],
    ['   ', {}, 'expression-missing'],
    ['@skills.craft.value', {}, 'unresolved-path'],
    ['@v', { v: '  ' }, 'unresolved-path'],
    ['@v', { v: null }, 'unresolved-path'],
    ['1d6 + 3', {}, 'dice'],
    ['@v', { v: '2d6' }, 'dice'],
    ['@v', { v: 'seven' }, 'invalid'],
    ['2 + nope', {}, 'invalid'],
    ['@v', { v: Number.NaN }, 'non-finite'],
    ['@v', { v: 'Infinity' }, 'non-finite'],
    ['1 / 0', {}, 'non-finite'],
  ];
  for (const [expression, rollData, reason] of cases) {
    const result = resolveAttribute(expression, rollData);
    assert.deepEqual(result, { ok: false, reason }, `${expression} ${JSON.stringify(rollData)}`);
    assert.ok(CHECK_TARGET_REFUSALS.includes(reason));
  }
});

test('a missing path under sum/over refuses where reading it as 0 would pass every roll', () => {
  const evaluation = { ...attribute('@skills.craft.value'), direction: 'over' };
  const result = resolveCheckTarget({ evaluation, rollData: { skills: {} }, anchor: 15 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unresolved-path');
  assert.equal('target' in result, false);
});

test('F6: character values resolve the way Foundry replaceFormulaData reads roll data', () => {
  class Proficiency {
    toString() {
      return '3';
    }
  }
  class ActorData {
    get level() {
      return 7;
    }
  }
  const rollData = { prof: new Proficiency(), actor: new ActorData(), flags: {}, list: [7] };
  assert.equal(resolveAttribute('@prof + 10', rollData).target, 13);
  assert.equal(resolveAttribute('@actor.level * 2', rollData).target, 14);
  assert.deepEqual(resolveAttribute('@flags', rollData), { ok: false, reason: 'invalid' });
  assert.deepEqual(resolveAttribute('@list', rollData), { ok: false, reason: 'invalid' });
  assert.equal(resolveAttribute('@{actor.level}', rollData).target, 7);
});

test('F10: deep-frozen roll data resolves without throwing or being mutated', () => {
  class ActorData {
    get level() {
      return 4;
    }
  }
  const rollData = deepFreeze({
    skills: { craft: { value: 55 } },
    details: { level: '6' },
    actor: Object.freeze(new ActorData()),
  });
  const before = JSON.stringify(rollData);
  assert.equal(resolveAttribute('@skills.craft.value', rollData, 'multiply', 0.5).target, 27);
  assert.equal(resolveAttribute('@details.level + @actor.level', rollData, 'add', -1).target, 9);
  assert.equal(resolveAttribute('@skills.missing', rollData).reason, 'unresolved-path');
  assert.equal(JSON.stringify(rollData), before);
});

test('a refusal reads as a localized sentence whose English fallback matches en.json', () => {
  const { TargetRefusal } = JSON.parse(readFileSync('lang/en.json', 'utf8')).FABRICATE.Check;
  const english = (key, data) =>
    TargetRefusal[key.replace('FABRICATE.Check.TargetRefusal.', '')]?.replace('{label}', data.label);
  const keys = new Set();
  for (const reason of [...CHECK_TARGET_REFUSALS, 'unknown']) {
    let asked = null;
    const localized = checkRefusalMessage(reason, 'Salvage', (key, data) => (asked = key) && english(key, data));
    keys.add(asked);
    assert.match(localized, /^Salvage check cannot roll: [a-z].*\.$/, reason);
    assert.equal(checkRefusalMessage(reason, 'Salvage', () => undefined), localized, reason);
  }
  assert.equal(keys.size, CHECK_TARGET_REFUSALS.length + 1, 'one sentence per reason, plus a fallback');
  assert.equal(keys.size, Object.keys(TargetRefusal).length, 'every en.json sentence is used');
});

test('a summed character-value target names its value and the adjustment that moved it', () => {
  const rollData = { skills: { smith: { level: 12 } } };
  const config = (evaluation, type) => ({ type, evaluation });
  const basis = (evaluation, override, type) =>
    attributeTargetBasis(config(evaluation, type), {
      override,
      label: 'Hard Work',
      readRollData: () => rollData,
    });
  const smith = attribute(' @skills.smith.level ', 'add', 1);
  assert.deepEqual(basis(smith, -2), {
    expression: '@skills.smith.level',
    value: 12,
    adjustment: { kind: 'add', value: -2, label: 'Hard Work' },
  });
  assert.deepEqual(basis(smith, null).adjustment, { kind: 'add', value: 1, label: '' });
  assert.equal(basis(attribute('@skills.smith.level'), undefined).adjustment, null);
  assert.equal(basis({ ...smith, product: 'count' }, -2), null, 'a count check reads a pool');
  assert.equal(basis({ ...smith, target: { source: 'fixed' } }, -2), null);
  assert.equal(basis(smith, -2, 'fixed'), null, 'a fixed-range routed check reads no target');
  assert.equal(basis(attribute('@skills.lore.level'), -2), null, 'an unresolved value');
});

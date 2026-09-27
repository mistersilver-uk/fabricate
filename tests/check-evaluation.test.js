import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareToTarget,
  better,
  rankBest,
  effectiveMargin,
  resolveDeterministicExpression,
} from '../src/systems/checkEvaluation.js';

test('comparison and benefit ordering support both directions and strict thresholds', () => {
  assert.equal(compareToTarget(12, 12, 'meet', 'over'), true);
  assert.equal(compareToTarget(12, 12, 'exceed', 'over'), false);
  assert.equal(compareToTarget(12, 12, 'meet', 'under'), true);
  assert.equal(compareToTarget(12, 12, 'exceed', 'under'), false);
  assert.equal(compareToTarget(11, 12, 'exceed', 'under'), true);
  assert.equal(better(11, 12, 'under'), true);
  assert.equal(better(13, 12, 'over'), true);
  assert.equal(effectiveMargin(11, 12, 'under'), 1);
  assert.equal(effectiveMargin(11, 12, 'over'), -1);
});

test('rankBest is stable for ties and leaves input unchanged', () => {
  const entries = [
    { id: 'first', value: 3 },
    { id: 'best', value: 1 },
    { id: 'tied', value: 1 },
  ];
  assert.deepEqual(rankBest(entries, (entry) => entry.value, 'under').map((entry) => entry.id), [
    'best',
    'tied',
    'first',
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ['first', 'best', 'tied']);
});

test('deterministic expressions resolve numbers, roll-data paths and arithmetic', () => {
  const data = { abilities: { int: { value: 13 } }, skill: 3 };
  assert.deepEqual(resolveDeterministicExpression(4.5, data), { ok: true, value: 4.5 });
  assert.deepEqual(resolveDeterministicExpression('floor((@abilities.int.value + @skill) / 2)', data), {
    ok: true,
    value: 8,
  });
  assert.deepEqual(resolveDeterministicExpression('ceil(-1.2) + round(1.6)', data), {
    ok: true,
    value: 1,
  });
  assert.deepEqual(resolveDeterministicExpression('@{abilities.int.value} - 1', data), {
    ok: true,
    value: 12,
  });
});

test('deterministic expressions refuse missing paths, dice, invalid syntax and non-finite results', () => {
  const data = { skill: 3 };
  assert.deepEqual(resolveDeterministicExpression('@missing + 2', data), {
    ok: false,
    reason: 'unresolved-path',
  });
  assert.deepEqual(resolveDeterministicExpression('1d20 + @skill', data), {
    ok: false,
    reason: 'dice',
  });
  assert.deepEqual(resolveDeterministicExpression('2d10cs>=8', data), {
    ok: false,
    reason: 'dice',
  });
  assert.deepEqual(resolveDeterministicExpression('floor()', data), {
    ok: false,
    reason: 'invalid',
  });
  assert.deepEqual(resolveDeterministicExpression('1 / 0', data), {
    ok: false,
    reason: 'non-finite',
  });
  assert.deepEqual(resolveDeterministicExpression('@skill', { skill: Infinity }), {
    ok: false,
    reason: 'non-finite',
  });
  assert.deepEqual(resolveDeterministicExpression('2 + nope', data), {
    ok: false,
    reason: 'invalid',
  });
});

test('rankBest sinks non-finite values last in either direction, keeping their authored order', () => {
  const entries = [
    { id: 'nan', value: Number.NaN },
    { id: 'low', value: 2 },
    { id: 'null', value: null },
    { id: 'high', value: 9 },
  ];
  for (const [direction, expected] of [
    ['over', ['high', 'low', 'nan', 'null']],
    ['under', ['low', 'high', 'nan', 'null']],
  ]) {
    assert.deepEqual(
      rankBest(entries, (entry) => entry.value, direction).map((entry) => entry.id),
      expected
    );
  }
});

test('path tokens that contain a d are paths, not dice, and every dice form is refused', () => {
  const data = { dc: 12, d20: 4, attributes: { 'spell-dc': 15 } };
  assert.deepEqual(resolveDeterministicExpression('@dc', data), { ok: true, value: 12 });
  assert.deepEqual(resolveDeterministicExpression('@{dc}', data), { ok: true, value: 12 });
  assert.deepEqual(resolveDeterministicExpression('@attributes.spell-dc - @d20', data), {
    ok: true,
    value: 11,
  });
  for (const dice of ['1d%', 'd20', '4dF', '2 * d6', '@dc + 1d4']) {
    assert.deepEqual(resolveDeterministicExpression(dice, data), { ok: false, reason: 'dice' }, dice);
  }
});

test('a path resolves only an own finite number or decimal string, never a coerced value', () => {
  assert.deepEqual(resolveDeterministicExpression('@v', { v: ' 7 ' }), { ok: true, value: 7 });
  assert.deepEqual(resolveDeterministicExpression('@v', { v: '-2.5' }), { ok: true, value: -2.5 });
  for (const v of [' ', '', null, undefined]) {
    assert.deepEqual(resolveDeterministicExpression('@v', { v }), {
      ok: false,
      reason: 'unresolved-path',
    });
  }
  for (const v of [[], false, true, {}, [7], '0x10', 'Infinity', 'seven']) {
    assert.deepEqual(resolveDeterministicExpression('@v', { v }), {
      ok: false,
      reason: 'non-finite',
    });
  }
  const inherited = Object.create({ v: 3 });
  assert.equal(resolveDeterministicExpression('@v', inherited).ok, false);
  assert.equal(resolveDeterministicExpression('@name.length', { name: 'abc' }).ok, false);
  assert.equal(resolveDeterministicExpression('@toString', {}).ok, false);
});

const FOUNDRY_PATHS = { pathMode: 'foundry' };

test('the Foundry path mode walks with `in`, so inherited values and prototype getters resolve', () => {
  class ActorData {
    get level() {
      return 7;
    }
  }
  const data = { actor: new ActorData(), inherited: Object.create({ v: 3 }), 'skills.craft': 40 };
  assert.deepEqual(resolveDeterministicExpression('@actor.level + 1', data, FOUNDRY_PATHS), {
    ok: true,
    value: 8,
  });
  assert.deepEqual(resolveDeterministicExpression('@inherited.v', data, FOUNDRY_PATHS), {
    ok: true,
    value: 3,
  });
  assert.deepEqual(resolveDeterministicExpression('@skills.craft', data, FOUNDRY_PATHS), {
    ok: true,
    value: 40,
  });
  for (const expression of ['@actor.level', '@inherited.v', '@skills.craft']) {
    assert.equal(resolveDeterministicExpression(expression, data).ok, false, expression);
  }
});

test('the Foundry path mode stops its walk at a non-object and at a missing key', () => {
  const data = { name: 'abc', list: [4, 5], nested: { zero: 0 } };
  for (const expression of ['@name.length', '@missing.value', '@nested.zero.value']) {
    assert.deepEqual(resolveDeterministicExpression(expression, data, FOUNDRY_PATHS), {
      ok: false,
      reason: 'unresolved-path',
    });
  }
  assert.deepEqual(resolveDeterministicExpression('@list.length', data, FOUNDRY_PATHS), {
    ok: true,
    value: 2,
  });
  assert.deepEqual(resolveDeterministicExpression('@nested.zero', data, FOUNDRY_PATHS), {
    ok: true,
    value: 0,
  });
  assert.deepEqual(resolveDeterministicExpression('@v', null, FOUNDRY_PATHS), {
    ok: false,
    reason: 'unresolved-path',
  });
});

test('the Foundry path mode coerces a value as trimmed text and refuses each non-number by reason', () => {
  class Proficiency {
    constructor(value) {
      this.value = value;
    }
    toString() {
      return String(this.value);
    }
  }
  const resolved = (v) => resolveDeterministicExpression('@v', { v }, FOUNDRY_PATHS);
  assert.deepEqual(resolved(new Proficiency(2.5)), { ok: true, value: 2.5 });
  assert.deepEqual(resolved(' -4 '), { ok: true, value: -4 });
  assert.deepEqual(resolved(6), { ok: true, value: 6 });
  for (const [v, reason] of [
    [undefined, 'unresolved-path'],
    [null, 'unresolved-path'],
    ['', 'unresolved-path'],
    [new Proficiency('  '), 'unresolved-path'],
    ['1d4', 'dice'],
    [new Proficiency('2d6 + 1'), 'dice'],
    ['seven', 'invalid'],
    ['0x10', 'invalid'],
    [true, 'invalid'],
    [{}, 'invalid'],
    [[7], 'invalid'],
    [new Set([7]), 'invalid'],
    [() => 7, 'invalid'],
    [Number.NaN, 'non-finite'],
    [Infinity, 'non-finite'],
    ['-Infinity', 'non-finite'],
    ['1e999', 'non-finite'],
  ]) {
    assert.deepEqual(resolved(v), { ok: false, reason }, String(v));
  }
});

test('the strict reader stays the default and ignores an unknown path mode', () => {
  const data = { v: '1d4', inherited: Object.create({ v: 3 }) };
  for (const options of [undefined, {}, { pathMode: 'strict' }, { pathMode: 'other' }]) {
    assert.deepEqual(resolveDeterministicExpression('@v', data, options), {
      ok: false,
      reason: 'non-finite',
    });
    assert.equal(resolveDeterministicExpression('@inherited.v', data, options).ok, false);
  }
});

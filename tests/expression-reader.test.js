import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PATH_TOKEN as REEXPORTED_PATH_TOKEN } from '../src/systems/checkEvaluation.js';
import {
  createExpressionReader,
  DEFAULT_FUNCTIONS,
  DICE_TERM,
  PATH_TOKEN,
  readFoundryPath,
  readStrictPath,
} from '../src/systems/expressionReader.js';

const DATA = { a: 3, b: 2, heat: 5 };
const readPath = (token) => readStrictPath(token, DATA);

/** Reads `source` whole, returning the value or the thrown reason; a short read is `'short'`. */
function read(source, options = {}) {
  const reader = createExpressionReader(source, { readPath, ...options });
  try {
    const value = reader.parseExpression();
    return reader.atEnd() ? value : 'short';
  } catch (error) {
    return error;
  }
}

const abs = { minArgs: 1, maxArgs: 1, apply: (value) => Math.abs(value) };
const min = { minArgs: 1, maxArgs: Infinity, apply: (...values) => Math.min(...values) };
const dice = { pattern: /\d*d\d+/, read: (found) => found[0].length };
const counter = {
  pattern: /@counter\.[a-z]\w*(?![\w.])/,
  read: (found) => (found[0] === '@counter.heat' ? 7 : NaN),
};

test('the default reader accepts exactly the deterministic grammar', () => {
  assert.equal(read('1 + 2 * 3'), 7);
  assert.equal(read('-(@a - @b) % 4'), -1);
  assert.equal(read('floor(1.5) + ceil(1.2) + round(1.5)'), 5);
  assert.equal(read('floor (2.5)'), 2);
  assert.equal(read('@{a} - 1'), 2);
  assert.equal(read('1e3'), 1000);
});

test('the default functions take one argument and a name outside its arity is invalid', () => {
  assert.deepEqual(Object.keys(DEFAULT_FUNCTIONS), ['floor', 'ceil', 'round']);
  assert.ok(Object.isFrozen(DEFAULT_FUNCTIONS));
  for (const source of ['floor(1,2)', 'floor()', 'floor', 'floor + 1', 'floorx(1)', 'Floor(1)']) {
    assert.equal(read(source), 'invalid', source);
  }
});

test('a default reader refuses abs, min, max and dice terms', () => {
  for (const source of ['abs(1)', 'min(1,2)', 'max(1,2)', 'constructor(1)']) {
    assert.equal(read(source), 'invalid', source);
  }
  for (const source of ['2d6', 'd6', '1d6 + 1']) {
    assert.notEqual(typeof read(source), 'number', source);
  }
});

test('an injected function table extends only its own reader', () => {
  const functions = { ...DEFAULT_FUNCTIONS, abs, min };
  assert.equal(read('abs(-3) + 1', { functions }), 4);
  assert.equal(read('min(4, 2, 9)', { functions }), 2);
  assert.equal(read('min(4)', { functions }), 4);
  assert.equal(read('abs(1, 2)', { functions }), 'invalid');
  assert.equal(read('min()', { functions }), 'invalid');
  assert.equal(read('abs', { functions }), 'invalid');
  assert.equal(read('floor(abs(-2.5))', { functions }), 2);
  assert.equal(read('abs(1)'), 'invalid');
  assert.deepEqual(Object.keys(DEFAULT_FUNCTIONS), ['floor', 'ceil', 'round']);
});

test('an injected function table replaces the defaults for its own reader', () => {
  assert.equal(read('floor(1.5)', { functions: { abs } }), 'invalid');
  assert.equal(read('abs(-1)', { functions: { abs } }), 1);
  assert.equal(read('floor(1.5)'), 1);
});

test('an injected token is read before the path token and the number, and only by its own reader', () => {
  const tokens = [dice];
  assert.equal(read('2d6', { tokens }), 3);
  assert.equal(read('2d6 + 1', { tokens }), 4);
  assert.equal(read('(2d6) * 2', { tokens }), 6);
  assert.equal(read('floor(1d4 / 2)', { tokens }), 1);
  assert.notEqual(read('2d6'), 3);
  assert.equal(read('2 + 1', { tokens }), 3);
});

test('injected tokens are consulted in order and fall through to the path token', () => {
  const first = { pattern: /@counter\.heat/, read: () => 1 };
  const second = { pattern: /@counter\.heat/, read: () => 2 };
  assert.equal(read('@counter.heat', { tokens: [first, second] }), 1);
  assert.equal(read('@counter.heat', { tokens: [second, first] }), 2);
  assert.equal(read('@a + @counter.x', { tokens: [first] }), 'unresolved-path');
  assert.equal(read('@a', { tokens: [first] }), 3);
});

test('an injected reserved-root token ends where it cannot continue and lets a hyphen subtract', () => {
  const tokens = [counter];
  assert.equal(read('@counter.heat-1', { tokens }), 6);
  assert.equal(read('@counter.heat - @a', { tokens }), 4);
  assert.equal(read('@counter.heat.x', { tokens }), 'unresolved-path');
  assert.equal(read('@{counter.heat}', { tokens }), 'unresolved-path');
});

test('an injected pattern is anchored at the read position and keeps no match state', () => {
  const tokens = [{ pattern: /d6/g, read: () => 4 }];
  assert.equal(read('1 + d6 + d6', { tokens }), 9);
  assert.equal(read('1 + 1d6', { tokens }), 'short');
  assert.equal(read('d6 + d6', { tokens }), 8);
});

test('the path readers walk strictly or as Foundry does', () => {
  const data = { n: 4, s: ' 5 ', nested: { x: 2 } };
  assert.equal(readStrictPath('@n', data), 4);
  assert.equal(readStrictPath('@{nested.x}', data), 2);
  assert.throws(
    () => readStrictPath('@missing', data),
    (error) => error === 'unresolved-path'
  );
  assert.throws(
    () => readStrictPath('@nested', data),
    (error) => error === 'non-finite'
  );
  assert.equal(readFoundryPath('@s', data), 5);
  assert.throws(
    () => readFoundryPath('@missing', data),
    (error) => error === 'unresolved-path'
  );
  assert.throws(
    () => readFoundryPath('@v', { v: '2d6' }),
    (error) => error === 'dice'
  );
  assert.throws(
    () => readFoundryPath('@v', { v: {} }),
    (error) => error === 'invalid'
  );
});

test('the token patterns are shared and the re-exported path token is the same regex object', () => {
  assert.equal(REEXPORTED_PATH_TOKEN, PATH_TOKEN);
  assert.equal(PATH_TOKEN.flags, 'g');
  assert.equal(DICE_TERM.test('2d6'), true);
  assert.equal(DICE_TERM.test('@d20'.replaceAll(PATH_TOKEN, '0')), false);
});

// The deterministic reduction a rolling check modifier is RANKED by (issue 1118).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECORDED_EXPRESSION_MEANS,
  RECORDED_UNPARSEABLE_EXPRESSIONS,
} from './helpers/recordedModifierRollShapes.js';

const { reduceRollExpression } = await import('../src/utils/rollExpressionAverage.js');

// ── the two answers one walk produces ────────────────────────────────────────

// EXACT means exact: these are asserted by equality, and three of them (`pow`, `sqrt`,
// `clamp`) are functions the reducer refused outright until the review round — Foundry
// resolves any `Math` member, so refusing them silently dropped entries it could roll.
test('a flat expression reduces exactly and reports that it does not roll', () => {
  for (const [expression, expected] of [
    ['3', 3],
    ['-2', -2],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['floor(7 / 2)', 3],
    ['max(1, 4, 2)', 4],
    ['min(3, 7, 5)', 3],
    ['max(2, 9)', 9],
    ['pow(3, 2)', 9],
    ['sqrt(16)', 4],
    ['clamp(9, 1, 6)', 6],
    ['2.5', 2.5],
  ]) {
    assert.deepEqual(
      reduceRollExpression(expression),
      { value: expected, rollsDice: false },
      expression
    );
  }
});

// The classification is a fact the walk OBSERVES, not a second opinion about the same text.
// It is asserted against real Foundry's own answer — `new Roll(x).isDeterministic === false`
// — for every parseable row of the recorded table.
test('rollsDice agrees with Foundry`s own determinism verdict on every recorded row', () => {
  for (const [expression] of RECORDED_EXPRESSION_MEANS) {
    assert.equal(
      reduceRollExpression(expression).rollsDice,
      true,
      `${expression} was recorded as non-deterministic in 14.365`
    );
  }
  for (const flat of ['3', '@already.substituted', '2 + 2', 'floor(9 / 2)']) {
    assert.equal(reduceRollExpression(flat).rollsDice, false, `${flat} rolls nothing`);
  }
});

// ── the average, against 40 000 real rolls per row ───────────────────────────

test('the computed average matches the measured mean of the real 14.365 engine', () => {
  for (const [expression, measured, tolerance, kind] of RECORDED_EXPRESSION_MEANS) {
    const { value } = reduceRollExpression(expression);
    // An `exact` row is graded by EQUALITY. Grading every row with the tolerant `<=` let an
    // exact claim pass at any error inside its own (small) tolerance, so the word `exact`
    // asserted nothing.
    if (kind.startsWith('exact') && tolerance === 0) {
      assert.equal(value, measured, `${expression} (${kind}) is exact, not approximate`);
      continue;
    }
    assert.ok(
      Math.abs(value - measured) <= tolerance,
      `${expression} (${kind}): computed ${value}, measured ${measured}, tolerance ${tolerance}`
    );
  }
});

// The rows the module's header used to describe as "well under one point" and is not. They
// are recorded so the limitation is a measurement a reviewer can check, and so that a future
// change which DOES model them reddens this test rather than passing silently.
test('the counting modifiers are recorded as the wrong quantity, not as a near miss', () => {
  const counting = RECORDED_EXPRESSION_MEANS.filter(([, , , kind]) =>
    kind.startsWith('WRONG QUANTITY')
  );
  assert.ok(counting.length >= 4, 'cs / cf / df are all recorded');
  const [, measured] = counting.find(([expression]) => expression === '1d20cs>15');
  assert.ok(
    Math.abs(reduceRollExpression('1d20cs>15').value - measured) > 9,
    'a face-sum average cannot approximate a success COUNT, and the table says so'
  );
  assert.ok(
    Math.abs(reduceRollExpression('1d20df<5').value - 9.83) < 0.75,
    '`df` is at least no longer read as a drop-one, which answered 0'
  );
});

// The single row that motivated the order-statistics walk, pinned on its own so a
// regression to the plain sum cannot hide inside the tolerance table above.
test('a keep-highest die is EXACT, not its plain sum', () => {
  assert.equal(
    Math.round(reduceRollExpression('2d20kh1').value * 1000) / 1000,
    13.825,
    'E[max of 2d20]; the plain sum would be 21 and would win `highest` against anything'
  );
  assert.equal(
    reduceRollExpression('2d20').value,
    21,
    'the SAME dice without the modifier still sum plainly, so the walk is not always-on'
  );
});

test('a keep/drop count reads from the end its family names', () => {
  // `k`-family counts what to KEEP, `d`-family counts what to DROP, so `4d6kh3` and `4d6dl1`
  // retain the same three dice and must reduce identically.
  assert.equal(reduceRollExpression('4d6kh3').value, reduceRollExpression('4d6dl1').value);
  assert.equal(reduceRollExpression('3d6k1').value, reduceRollExpression('3d6kh1').value);
  assert.equal(
    reduceRollExpression('3d6d2').value,
    reduceRollExpression('3d6dl2').value,
    'a bare `d` drops the lowest'
  );
  assert.equal(reduceRollExpression('2d6kh5').value, 7, 'keeping more than were rolled keeps all');
  assert.equal(reduceRollExpression('2d6d9').value, 0, 'dropping more than were rolled keeps none');
});

// ── the shapes it refuses ────────────────────────────────────────────────────

test('an expression the reducer cannot read is NaN, so its entry contributes nothing', () => {
  for (const expression of ['', '   ', 'not an expression', '1d4]', '1d20 +', '{1d6', 'floor(']) {
    assert.ok(
      Number.isNaN(reduceRollExpression(expression).value),
      `${JSON.stringify(expression)} must not reduce to a number`
    );
  }
});

test('`d%` is refused, because real 14.365 refuses to parse it', () => {
  assert.ok(RECORDED_UNPARSEABLE_EXPRESSIONS.includes('1d%'));
  assert.ok(
    Number.isNaN(reduceRollExpression('1d%').value),
    'an average for a formula that cannot roll would describe nothing'
  );
});

// A word beginning with `d` must not be read as a die. Foundry`s own grammar admits any
// letter as faces, which would make `damage` parse as "one d, faces a, modifiers mage"; the
// reducer restricts faces to the denominations `CONFIG.Dice.terms` configures.
// `FunctionTerm#function` is `CONFIG.Dice.functions[fn] ?? Math[fn]`, resolved CASE-SENSITIVELY,
// and `CONFIG.Dice.functions` is `{}`. A lowercasing walk therefore valued an expression Foundry
// throws on — measured: `MAX(1d4, 2)` reduced to 2.5 while the engine refused to roll it at all.
test('function names are resolved case-sensitively, exactly as Foundry resolves them', () => {
  for (const shouty of ['MAX(1d4, 2)', 'Min(1d4, 2)', 'FLOOR(1d8)', 'Abs(1d4)', 'Sqrt(4)']) {
    assert.ok(Number.isNaN(reduceRollExpression(shouty).value), `${shouty} is not a Math member`);
  }
  for (const [correct, expected] of [
    ['max(1d4, 2)', 2.5],
    ['floor(1d8)', 4],
    ['abs(1d4)', 2.5],
  ]) {
    assert.equal(reduceRollExpression(correct).value, expected, correct);
  }
});

// The one `Math` member that is not a function of its arguments. Admitting it would make this
// module's answer differ between two calls on the same text, which is the whole contract.
test('Math.random is refused, however Foundry would resolve it', () => {
  assert.ok(Number.isNaN(reduceRollExpression('random()').value));
  assert.ok(Number.isNaN(reduceRollExpression('1d4 + random()').value));
  assert.equal(reduceRollExpression('round(2.4)').value, 2, 'its neighbours still resolve');
});

test('a word starting with d is not a die', () => {
  assert.ok(Number.isNaN(reduceRollExpression('damage').value));
  assert.equal(reduceRollExpression('damage').rollsDice, false);
  assert.equal(reduceRollExpression('1dF').rollsDice, true, 'a real denomination still is one');
});

test('a trailing fragment the walk cannot consume refuses the whole reduction', () => {
  // A prefix that reduces is NOT an answer: `1d4 &&& 2` would otherwise report 2.5 and read
  // as a working modifier.
  assert.ok(Number.isNaN(reduceRollExpression('1d4 &&& 2').value));
  assert.ok(Number.isNaN(reduceRollExpression('3 nonsense').value));
});

test('an authored flavour label contributes nothing to the value', () => {
  assert.equal(reduceRollExpression('1d4[fire]').value, 2.5);
  assert.equal(reduceRollExpression('3[flat]').value, 3);
  assert.equal(reduceRollExpression('3[flat]').rollsDice, false);
});

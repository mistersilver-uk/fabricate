/** The iterative expression grammar, its field profiles and the effective bounds (`resolution-modes`). */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { scriptedRollDie } from './helpers/scriptedRollDie.js';

const reads = [];
for (const name of ['CONFIG', 'foundry', 'game']) {
  Object.defineProperty(globalThis, name, {
    get() {
      reads.push(name);
      throw new Error('forbidden global');
    },
    configurable: true,
  });
}

const { resolveDeterministicExpression } = await import('../src/systems/checkEvaluation.js');
const { effectiveBounds } = await import('../src/systems/iterative/attemptLibrary.js');
const {
  analyzeIterativeExpression,
  evaluateIterativeExpression,
  ITERATIVE_EXPRESSION_PROFILES,
  RESERVED_ROOT_TOKEN,
} = await import('../src/systems/iterative/expression.js');

after(() => assert.deepEqual(reads, [], 'no iterative module reads a Foundry global'));

const ROOTS = Object.freeze({
  counters: new Map([
    ['heat', 5],
    ['a', 7],
    ['b', 3],
  ]),
  min: new Map([['heat', 0]]),
  max: new Map([['heat', 20]]),
  target: new Map([['heat', 12]]),
  sessionCount: 4,
  checkValue: 15,
});

/** Evaluates `text` with a scripted die; returns the outcome beside the die's record. */
function run(text, { profile = 'effect', script = [], fill, rollData = {}, roots = ROOTS } = {}) {
  const die = scriptedRollDie(script, { fill });
  const result = evaluateIterativeExpression(text, {
    profile,
    roots,
    rollData,
    rollDie: die.rollDie,
  });
  return { result, die };
}

const evaluated = (text, options = {}) => {
  const { result } = run(text, options);
  assert.equal(result.ok, true, `${text} -> ${result.reason}`);
  return result.value;
};
const refusal = (text, options = {}) => {
  const { result } = run(text, options);
  assert.equal(result.ok, false, `${text} should refuse`);
  return result.reason;
};

/** The outcome of `text` against a die source that is not a script. */
const withDie = (text, rollDie) =>
  evaluateIterativeExpression(text, { profile: 'effect', roots: ROOTS, rollData: {}, rollDie });

describe('the four profiles', () => {
  it('are frozen and named', () => {
    assert.deepEqual(Object.keys(ITERATIVE_EXPRESSION_PROFILES), [
      'cost',
      'start',
      'effect',
      'actionAdjustment',
    ]);
    assert.ok(Object.isFrozen(ITERATIVE_EXPRESSION_PROFILES));
  });

  const OK = 'ok';
  const ALLOWED = { cost: OK, start: OK, effect: OK, actionAdjustment: OK };
  const TABLE = [
    ['1d4', { ...ALLOWED, cost: 'dice', actionAdjustment: 'dice' }],
    ['@check.value', { ...ALLOWED, cost: 'forbidden-root', start: 'forbidden-root' }],
    ['@counter.heat', { ...ALLOWED, start: 'forbidden-root' }],
    ['@sessionCount', { ...ALLOWED, start: 'forbidden-root' }],
    ['@min.heat', ALLOWED],
    ['@max.heat', ALLOWED],
    ['@target.heat', ALLOWED],
  ];
  for (const [text, expected] of TABLE) {
    for (const [profile, outcome] of Object.entries(expected)) {
      it(`${text} under ${profile} is ${outcome}`, () => {
        const { result } = run(text, { profile, fill: 2 });
        assert.equal(result.ok ? OK : result.reason, outcome);
        const analysis = analyzeIterativeExpression(text, profile);
        assert.equal(analysis.ok ? OK : analysis.reason, outcome);
      });
    }
  }
});

describe('the arithmetic grammar', () => {
  it('reads the deterministic grammar and abs, min and max', () => {
    assert.equal(evaluated('1 + 2 * 3'), 7);
    assert.equal(evaluated('floor(7 / 2) + ceil(0.2) + round(1.5)'), 6);
    assert.equal(evaluated('abs(0 - 3)'), 3);
    assert.equal(evaluated('min(4, 2, 9)'), 2);
    assert.equal(evaluated('max(1)'), 1);
    assert.equal(evaluated('max(1, 5, 3)'), 5);
    assert.equal(evaluated('7 % 4 - -1'), 4);
  });

  it('refuses a call outside its arity, an unknown name and a bare name', () => {
    const faulty = ['abs(1, 2)', 'abs()', 'min()', 'floor(1, 2)', 'floor', 'nope(1)', 'min(1,'];
    for (const text of [...faulty, '1 +', '', '  ']) {
      assert.equal(refusal(text), 'invalid', text);
    }
  });

  it('refuses a non-finite result and reads a finite number or refuses another type', () => {
    assert.equal(refusal('1 / 0'), 'non-finite');
    assert.equal(refusal('0 / 0'), 'non-finite');
    const options = { profile: 'cost', roots: ROOTS, rollData: {} };
    assert.deepEqual(evaluateIterativeExpression(3, options), { ok: true, value: 3, dice: [] });
    assert.equal(evaluateIterativeExpression(null, options).reason, 'invalid');
    assert.equal(evaluateIterativeExpression(NaN, options).reason, 'non-finite');
  });

  it('keeps the shared deterministic expression free of the iterative grammar', () => {
    for (const text of ['abs(1)', 'min(1, 2)', 'max(1, 2)']) {
      assert.deepEqual(resolveDeterministicExpression(text), { ok: false, reason: 'invalid' });
    }
    assert.deepEqual(resolveDeterministicExpression('2d6'), { ok: false, reason: 'dice' });
  });
});

describe('the reserved roots', () => {
  it('resolve before roll data and are never shadowed by it', () => {
    const rollData = {
      counter: { heat: 99 },
      check: { value: 99 },
      sessionCount: 99,
      min: { heat: 99 },
      target: { heat: 99 },
    };
    assert.equal(evaluated('@counter.heat', { rollData }), 5);
    assert.equal(evaluated('@check.value', { rollData }), 15);
    assert.equal(evaluated('@sessionCount', { rollData }), 4);
    assert.equal(evaluated('@min.heat + @max.heat + @target.heat', { rollData }), 32);
  });

  it('end at the first character that cannot continue them', () => {
    assert.equal(evaluated('@counter.heat-1'), 4);
    assert.equal(evaluated('@sessionCount-1'), 3);
    assert.equal(evaluated('@check.value-1'), 14);
    assert.equal(evaluated('@counter.a-@counter.b'), 4);
    assert.equal(evaluated('@counter.a*2'), 14);
    assert.equal(evaluated('(@counter.a)'), 7);
  });

  it('report an unknown id, an unbounded side and a missing check as unresolved', () => {
    assert.equal(refusal('@counter.nope'), 'unresolved-path');
    assert.equal(refusal('@min.nope'), 'unresolved-path');
    assert.equal(refusal('@max.a'), 'unresolved-path');
    assert.equal(refusal('@target.a'), 'unresolved-path');
    const unchecked = { ...ROOTS, checkValue: null };
    assert.equal(refusal('@check.value', { roots: unchecked }), 'unresolved-path');
  });

  it('refuse a braced form or extra segments as unresolved even when roll data has the keys', () => {
    const rollData = { counter: { heat: { x: 9 } }, sessionCount: { x: 1 } };
    const forms = ['@{counter.heat}', '@counter.heat.x', '@counter', '@counter.Heat', '@min'];
    for (const text of [...forms, '@{sessionCount}', '@sessionCount.x', '@counter-1']) {
      assert.equal(refusal(text, { rollData }), 'unresolved-path', text);
    }
  });

  it('refuse every check fact but exactly @check.value, and the roots held for extensions', () => {
    const rollData = { check: { value: 1 }, recipe: { id: 1 } };
    const checks = ['@check.success', '@check', '@{check.value}', '@check.value.x', '@check-1'];
    for (const text of [
      ...checks,
      '@recipe.id',
      '@circumstance.id',
      '@status.id',
      '@{recipe.id}',
    ]) {
      assert.equal(refusal(text, { rollData }), 'forbidden-root', text);
    }
  });

  it('read every other root from actor roll data in the Foundry path mode', () => {
    const rollData = {
      abilities: { str: { mod: '3' } },
      'flat.key': 2,
      ability: '2d6',
      blank: ' ',
    };
    assert.equal(evaluated('@abilities.str.mod + @flat.key', { rollData }), 5);
    assert.equal(refusal('@ability', { rollData }), 'dice');
    assert.equal(refusal('@missing', { rollData }), 'unresolved-path');
    assert.equal(refusal('@blank', { rollData }), 'unresolved-path');
  });

  it('are matched by one token that carries no match state', () => {
    assert.equal(RESERVED_ROOT_TOKEN.global, false);
    assert.equal(RESERVED_ROOT_TOKEN.sticky, false);
  });
});

describe('dice', () => {
  it('rolls NdF with a default count of one', () => {
    const one = run('d6', { script: [4] });
    assert.deepEqual(one.result, {
      ok: true,
      value: 4,
      dice: [{ faces: 6, results: [4], value: 4 }],
    });
    assert.deepEqual(one.die.requested, [6]);
    assert.equal(evaluated('3d4 + 1', { script: [1, 2, 3] }), 7);
  });

  it('draws terms left to right and each term base dice first', () => {
    const { result, die } = run('1d4 + 2d6', { script: [3, 5, 6] });
    assert.equal(result.value, 14);
    assert.deepEqual(die.requested, [4, 6, 6]);
    assert.deepEqual(
      result.dice.map((term) => term.value),
      [3, 11]
    );
    die.assertDrained();
  });

  it('explodes on the maximum face by default, checking each new die in turn', () => {
    const { result, die } = run('2d6x', { script: [6, 2, 6, 5] });
    assert.deepEqual(result.dice[0].results, [6, 2, 6, 5]);
    assert.equal(result.value, 19);
    assert.deepEqual(die.requested, [6, 6, 6, 6]);
    die.assertDrained();
  });

  it('explodes on each comparison form', () => {
    const rows = [
      ['1d6x4', [4, 4, 1], 9],
      ['1d6x>=5', [5, 6, 3], 14],
      ['1d6x>4', [5, 6, 3], 14],
      ['1d6x<=2', [1, 2, 5], 8],
      ['1d6x<3', [1, 2, 4], 7],
      ['1d6x>=5 + 1', [4], 5],
    ];
    for (const [text, script, total] of rows) {
      const { result, die } = run(text, { script });
      assert.equal(result.value, total, text);
      die.assertDrained();
    }
  });

  it('keeps the highest or lowest results, and all of them when the count is larger', () => {
    assert.equal(evaluated('4d6kh3', { script: [1, 2, 3, 4] }), 9);
    assert.equal(evaluated('4d6kl3', { script: [1, 2, 3, 4] }), 6);
    assert.equal(evaluated('2d20kh', { script: [4, 9] }), 9);
    assert.equal(evaluated('2d20kl1', { script: [4, 9] }), 4);
    assert.equal(evaluated('2d6kh5', { script: [3, 4] }), 7);
  });

  it('keeps from every result of an exploding term', () => {
    const { result } = run('4d6xkh3', { script: [6, 1, 2, 3, 4] });
    assert.deepEqual(result.dice[0].results, [6, 1, 2, 3, 4]);
    assert.equal(result.value, 13);
  });

  it('refuses every other dice form as invalid', () => {
    const forms = ['2d6kh1x', '2d6kl1x2', 'd%', '1dF', '2d6r', '2d6r1', '2d6xo', '2d6cs'];
    const counts = ['2d6kh0', '0d6', '1d0', 'd', '2d', '1.5d6', '2d6x=3', '2d6kh1kl1', '2 d6'];
    for (const text of [...forms, ...counts]) {
      assert.equal(refusal(text, { fill: 3 }), 'invalid', text);
    }
  });

  it('refuses a count above 1000 before any draw and a term passing 1000 results', () => {
    const big = run('1000d6', { fill: 1 });
    assert.equal(big.result.value, 1000);
    assert.equal(big.die.requested.length, 1000);
    const over = run('1001d6', { fill: 1 });
    assert.deepEqual(over.result, { ok: false, reason: 'explode-limit' });
    assert.deepEqual(over.die.requested, []);
    const runaway = run('1d6x>=1', { fill: 3 });
    assert.deepEqual(runaway.result, { ok: false, reason: 'explode-limit' });
    assert.equal(runaway.die.requested.length, 1000);
    assert.equal(run('1000d6x', { fill: 1 }).result.value, 1000);
    const script = [...Array.from({ length: 999 }, () => 1), 6, 1];
    assert.equal(run('1000d6x', { script }).result.reason, 'explode-limit');
  });

  it('refuses a bad face, a thrown die and a missing die as roll-unavailable', () => {
    for (const face of [0, 7, 1.5, NaN, '3', null, undefined]) {
      const outcome = withDie('1d6', () => face);
      assert.deepEqual(outcome, { ok: false, reason: 'roll-unavailable' }, String(face));
    }
    assert.equal(refusal('1d6'), 'roll-unavailable');
    const thrown = withDie('1d6', () => {
      throw new Error('no generator');
    });
    assert.deepEqual(thrown, { ok: false, reason: 'roll-unavailable' });
    assert.equal(withDie('1d6', undefined).reason, 'roll-unavailable');
  });
});

describe('analyzeIterativeExpression', () => {
  it('flags an explosion that cannot stop', () => {
    for (const text of ['1d1x', '1d6x>=1', '1d6x<=6', '1d6x<7', '1d6x>0', '2d1x5']) {
      assert.equal(analyzeIterativeExpression(text, 'effect').explodeUnbounded, true, text);
    }
    for (const text of ['1d6x', '1d6x>=2', '1d6x6', '1d6x<=5', '1d6x>5', '1d6']) {
      assert.equal(analyzeIterativeExpression(text, 'effect').explodeUnbounded, false, text);
    }
  });

  it('reports syntax, profile and limit faults without roll data or dice', () => {
    const reasonFor = (text, profile) => analyzeIterativeExpression(text, profile).reason;
    assert.equal(reasonFor('1001d6', 'effect'), 'explode-limit');
    assert.equal(reasonFor('@counter.heat.x', 'effect'), 'unresolved-path');
    assert.equal(reasonFor('@{counter.heat}', 'effect'), 'unresolved-path');
    assert.equal(reasonFor('1d', 'effect'), 'invalid');
    assert.equal(reasonFor('1d4', 'cost'), 'dice');
    assert.equal(reasonFor('@check.value', 'cost'), 'forbidden-root');
    assert.equal(analyzeIterativeExpression('@abilities.str + 1', 'cost').ok, true);
    assert.equal(analyzeIterativeExpression(7, 'cost').ok, true);
    assert.equal(analyzeIterativeExpression('', 'cost').ok, false);
  });

  it('reports the reserved roots and ids an expression reads', () => {
    const text =
      '@counter.heat + @counter.a + @min.heat + @max.b + @target.heat + @sessionCount + @check.value + @abilities.str';
    assert.deepEqual(analyzeIterativeExpression(text, 'effect'), {
      ok: true,
      roots: {
        counter: ['heat', 'a'],
        min: ['heat'],
        max: ['b'],
        target: ['heat'],
        sessionCount: true,
        check: true,
      },
      explodeUnbounded: false,
    });
    assert.equal(analyzeIterativeExpression('2', 'cost').roots.check, false);
  });
});

describe('effectiveBounds', () => {
  const library = {
    counters: [
      { id: 'g', limit: 'global', min: 1, max: 9 },
      { id: 'p', limit: 'perRecipe', min: 2, max: 8 },
      { id: 'q', limit: 'perRecipe', min: 2 },
      { id: 'n', limit: 'none', min: 3, max: 4 },
    ],
    instances: [
      { counterId: 'g', min: 5, max: 6 },
      { counterId: 'p', min: 3, max: 7 },
      { counterId: 'q', max: 5 },
      { counterId: 'n', min: 1 },
    ],
  };

  it('uses system bounds for global, instance bounds over them for perRecipe, none otherwise', () => {
    assert.deepEqual(effectiveBounds('g', library), { min: 1, max: 9 });
    assert.deepEqual(effectiveBounds('p', library), { min: 3, max: 7 });
    assert.deepEqual(effectiveBounds('q', library), { min: 2, max: 5 });
    assert.deepEqual(effectiveBounds('n', library), { min: null, max: null });
    assert.deepEqual(effectiveBounds('missing', library), { min: null, max: null });
  });
});

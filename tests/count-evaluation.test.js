import test from 'node:test';
import assert from 'node:assert/strict';

import { CHECK_TARGET_REFUSALS } from '../src/systems/checkTarget.js';
import { planModifierPlacement, settlePlacement } from '../src/systems/checkModifierRouter.js';
import {
  COUNT_CHECK_REFUSALS,
  COUNT_REFUSALS,
  MAX_COUNT_POOL,
  countCheckPasses,
  countFacePredicates,
  minimumAdditionalDice,
  projectCountResults,
  resolvePool,
} from '../src/systems/countEvaluation.js';

import { countEvaluation, deepFreeze, scalar } from './helpers/countFixtures.js';

function resolved(pool, options = {}) {
  const result = resolvePool({ evaluation: countEvaluation(pool), ...options });
  assert.equal(result.ok, true, `expected a policy, got ${JSON.stringify(result)}`);
  return result.policy;
}

function placementFor(evaluation, contributions, preRollResults = []) {
  return settlePlacement(planModifierPlacement({ evaluation, contributions }), preRollResults);
}

const faces = (...values) => values.map((result) => ({ result, active: true }));

test("count's four refusal reasons are new to CHECK_TARGET_REFUSALS, and one list joins both", () => {
  assert.deepEqual(COUNT_REFUSALS, [
    'die-invalid',
    'faces-invalid',
    'explode-unbounded',
    'pool-too-large',
  ]);
  assert.ok(Object.isFrozen(COUNT_REFUSALS));
  assert.ok(COUNT_REFUSALS.every((reason) => !CHECK_TARGET_REFUSALS.includes(reason)));
  assert.deepEqual(COUNT_CHECK_REFUSALS, [...CHECK_TARGET_REFUSALS, ...COUNT_REFUSALS]);
  assert.ok(Object.isFrozen(COUNT_CHECK_REFUSALS));
  assert.equal(MAX_COUNT_POOL, 999);
});

test('the #861 threshold resolves to the sum of two character values with Foundry paths', () => {
  const rollData = deepFreeze({
    abilities: { int: { value: 3 } },
    skills: { repair: { value: 4 } },
  });
  const policy = resolved(
    { threshold: '@abilities.int.value + @skills.repair.value' },
    { rollData }
  );
  assert.equal(policy.threshold, 7);
  assert.deepEqual(policy.resolved, { base: 2, threshold: 7 });
});

test('a toString() object and a prototype getter resolve for both base and threshold', () => {
  class Skills {
    get rank() {
      return 4;
    }
  }
  class Proficiency {
    toString() {
      return '3';
    }
  }
  const rollData = deepFreeze({ prof: new Proficiency(), skills: new Skills() });
  const swapped = resolved({ base: '@skills.rank', threshold: '@prof' }, { rollData });
  assert.deepEqual(swapped.resolved, { base: 4, threshold: 3 });
  const policy = resolved({ base: '@prof', threshold: '@skills.rank' }, { rollData });
  assert.equal(policy.dice, 3);
  assert.equal(policy.threshold, 4);
});

test('unusable base and threshold inputs refuse with distinct reasons and never read as 0', () => {
  class Word {
    toString() {
      return 'many';
    }
  }
  const rollData = deepFreeze({
    blank: '  ',
    word: new Word(),
    list: [1, 2],
    huge: '1e999',
    dicey: '1d4',
  });
  const cases = [
    ['', 'expression-missing'],
    ['   ', 'expression-missing'],
    [null, 'expression-missing'],
    ['@missing', 'unresolved-path'],
    ['@blank', 'unresolved-path'],
    ['@word', 'invalid'],
    ['@list', 'invalid'],
    ['@huge', 'non-finite'],
    ['@dicey', 'dice'],
    ['2d6', 'dice'],
    ['2 +', 'invalid'],
  ];
  for (const input of ['base', 'threshold']) {
    for (const [expression, reason] of cases) {
      const result = resolvePool({
        evaluation: countEvaluation({ [input]: expression }),
        rollData,
        placement: { poolDelta: 0, thresholdDelta: 0, preRolls: [] },
      });
      assert.deepEqual(
        result,
        { ok: false, reason, refusedInput: input },
        `${input} ${JSON.stringify(expression)}`
      );
      assert.ok(CHECK_TARGET_REFUSALS.includes(reason));
    }
  }
});

test('a missing threshold path refuses where reading 0 would qualify every die', () => {
  const result = resolvePool({ evaluation: countEvaluation({ threshold: '@missing' }) });
  assert.deepEqual(result, { ok: false, reason: 'unresolved-path', refusedInput: 'threshold' });
});

test('a missing pool path refuses rather than failing as a zero pool or flooring to one die', () => {
  for (const zeroPoolFails of [true, false]) {
    const result = resolvePool({
      evaluation: countEvaluation({ base: '@missing', zeroPoolFails }),
    });
    assert.deepEqual(result, { ok: false, reason: 'unresolved-path', refusedInput: 'base' });
  }
});

test('numeric base and threshold values resolve, so a prepared policy replays without roll data', () => {
  const policy = resolved({ base: 2.5, threshold: 7.5 });
  assert.deepEqual(policy.resolved, { base: 2.5, threshold: 7.5 });
  assert.equal(policy.dice, 2);
  assert.equal(policy.threshold, 7.5);
});

test('the die must be an integer of at least two, and imported nonstandard sizes are kept', () => {
  for (const die of [1, 0, -4, 2.5, '10', null, undefined, Number.NaN]) {
    assert.deepEqual(resolvePool({ evaluation: countEvaluation({ die }) }), {
      ok: false,
      reason: 'die-invalid',
      refusedInput: 'die',
    });
  }
  assert.equal(resolved({ die: 7 }).die, 7);
  assert.equal(resolved({ die: 2 }).die, 2);
});

test('an enabled from face with no usable value refuses faces-invalid for its own input', () => {
  for (const value of [null, 0, 1.5]) {
    assert.deepEqual(
      resolvePool({
        evaluation: countEvaluation({
          explode: { enabled: true, faces: { kind: 'from', value }, once: true },
        }),
      }),
      { ok: false, reason: 'faces-invalid', refusedInput: 'explode' }
    );
    assert.deepEqual(
      resolvePool({
        evaluation: countEvaluation({ cancel: { enabled: true, faces: { kind: 'from', value } } }),
      }),
      { ok: false, reason: 'faces-invalid', refusedInput: 'cancel' }
    );
  }
  const inert = resolved({
    explode: { enabled: false, faces: { kind: 'from', value: null }, once: false },
    cancel: { enabled: false, faces: { kind: 'from', value: null } },
  });
  assert.equal(inert.explode, null);
  assert.equal(inert.cancel, null);
});

test('a recursive explosion that holds on every face refuses before any roll', () => {
  const everyFace = [
    ['over', { kind: 'from', value: 1 }],
    ['under', { kind: 'from', value: 10 }],
  ];
  for (const [direction, facesRule] of everyFace) {
    assert.deepEqual(
      resolvePool({
        evaluation: countEvaluation({
          direction,
          explode: { enabled: true, faces: facesRule, once: false },
        }),
      }),
      { ok: false, reason: 'explode-unbounded', refusedInput: 'explode' }
    );
    const once = resolved({
      direction,
      explode: { enabled: true, faces: facesRule, once: true },
    });
    assert.deepEqual(once.explode, { ...facesRule, once: true });
  }
  assert.equal(
    resolved({ explode: { enabled: true, faces: { kind: 'from', value: 2 }, once: false } }).explode
      .once,
    false
  );
});

test('a scalar pool benefit adds dice exactly once and never touches the threshold', () => {
  const evaluation = countEvaluation({ die: 6, base: '2', threshold: '5' });
  const placement = placementFor(evaluation, [scalar('tool', 1), scalar('library', 1)]);
  const policy = resolved({ die: 6, base: '2', threshold: '5' }, { placement });
  assert.equal(policy.dice, 4);
  assert.equal(policy.threshold, 5);
});

test('a settled rolled pool benefit adds its total once', () => {
  const pool = { die: 6, base: '2', threshold: '5' };
  const evaluation = countEvaluation(pool);
  const placement = placementFor(
    evaluation,
    [{ source: 'tool', label: 'Kit', form: 'expression', expression: '1d4' }],
    [{ index: 0, total: 3 }]
  );
  assert.equal(resolved(pool, { placement }).dice, 5);
});

test('an unsettled placement is a caller error rather than a silently lost benefit', () => {
  const evaluation = countEvaluation();
  const plan = planModifierPlacement({
    evaluation,
    contributions: [{ source: 'tool', label: 'Kit', form: 'expression', expression: '1d4' }],
  });
  assert.throws(() => resolvePool({ evaluation, placement: plan }), TypeError);
});

test('a threshold benefit applies its already-signed delta once in both directions', () => {
  const over = { die: 6, base: '2', threshold: '5', modifierDestination: 'threshold' };
  const overPlacement = placementFor(countEvaluation(over), [
    scalar('tool', 1),
    scalar('library', 1),
  ]);
  const overPolicy = resolved(over, { placement: overPlacement });
  assert.equal(overPolicy.threshold, 3);
  assert.equal(overPolicy.dice, 2);

  const under = { ...over, direction: 'under', threshold: '10' };
  const underPlacement = placementFor(countEvaluation(under), [scalar('library', 2)]);
  const underPolicy = resolved(under, { placement: underPlacement });
  assert.equal(underPolicy.threshold, 12);
  assert.equal(underPolicy.dice, 2);
});

test('the reporter: d20 faces 11/15/8 under meet 10 net one, and two after a +2 benefit', () => {
  const pool = { die: 20, base: '3', threshold: '10', modifierDestination: 'threshold' };
  const rolled = faces(11, 15, 8);
  const plain = resolved({ ...pool, direction: 'under' });
  assert.equal(projectCountResults({ policy: plain, results: rolled }).net, 1);

  const evaluation = countEvaluation({ ...pool, direction: 'under' });
  const placement = placementFor(evaluation, [scalar('situational', 2)]);
  const helped = resolved({ ...pool, direction: 'under' }, { placement });
  assert.equal(helped.threshold, 12);
  assert.equal(projectCountResults({ policy: helped, results: rolled }).net, 2);
});

test('the effective threshold stays fractional or out of range without clamping', () => {
  const fractional = resolved({ die: 6, threshold: '4.5' });
  assert.equal(fractional.threshold, 4.5);
  assert.deepEqual(
    projectCountResults({ policy: fractional, results: faces(4, 5) }).results.map(
      (entry) => entry.qualified
    ),
    [false, true]
  );
  const negative = resolved(
    { die: 6, threshold: '1', modifierDestination: 'threshold' },
    { placement: { poolDelta: 0, thresholdDelta: -3, preRolls: [] } }
  );
  assert.equal(negative.threshold, -2);
  assert.equal(resolved({ die: 6, threshold: '9' }).threshold, 9);
});

test('a fractional effective pool rounds down after every benefit and always rolls', () => {
  const library = { poolDelta: 0.5, thresholdDelta: 0, preRolls: [] };
  assert.equal(resolved({ base: '2' }, { placement: library }).dice, 2);
  assert.equal(resolved({ base: '2.5' }).dice, 2);
  assert.equal(resolved({ base: '1.5' }, { placement: library }).dice, 2);
  assert.equal(resolved({ base: '2.9' }).dice, 2);
  const nearlyOne = resolved({ base: '0.9' });
  assert.equal(nearlyOne.zeroPool, true);
  assert.equal(nearlyOne.dice, 0);
  assert.equal(resolved({ base: '0.9', zeroPoolFails: false }).dice, 1);
});

test('floating-point noise in the settled pool never rounds a whole die away', () => {
  const benefits = { poolDelta: 0.7 + 0.2 + 0.1, thresholdDelta: 0, preRolls: [] };
  const policy = resolved({ base: '0' }, { placement: benefits });
  assert.equal(policy.zeroPool, false);
  assert.equal(policy.dice, 1);
});

test('a non-finite effective threshold or pool refuses non-finite for its own input', () => {
  const threshold = resolvePool({
    evaluation: countEvaluation({ threshold: Number.MAX_VALUE }),
    placement: { poolDelta: 0, thresholdDelta: Number.MAX_VALUE, preRolls: [] },
  });
  assert.deepEqual(threshold, { ok: false, reason: 'non-finite', refusedInput: 'threshold' });
  const pool = resolvePool({
    evaluation: countEvaluation({ base: Number.MAX_VALUE }),
    placement: { poolDelta: Number.MAX_VALUE, thresholdDelta: 0, preRolls: [] },
  });
  assert.deepEqual(pool, { ok: false, reason: 'non-finite', refusedInput: 'pool' });
});

test('at or below zero dice, zeroPoolFails decides between an automatic failure and one die', () => {
  const penalty = { poolDelta: -3, thresholdDelta: 0, preRolls: [] };
  for (const [base, placement] of [
    ['0', null],
    ['2', penalty],
    ['-1', null],
  ]) {
    const failing = resolved({ base }, { placement });
    assert.equal(failing.zeroPool, true, `base ${base}`);
    assert.equal(failing.dice, 0);
    const floored = resolved({ base, zeroPoolFails: false }, { placement });
    assert.equal(floored.zeroPool, false);
    assert.equal(floored.dice, 1);
  }
  const normal = resolved({ base: '3' });
  assert.equal(normal.zeroPool, false);
  assert.equal(normal.dice, 3);
});

test('a zero pool fails even when zero successes are needed, and otherwise net meets required', () => {
  const zero = resolved({ base: '0' });
  assert.equal(countCheckPasses({ policy: zero, net: 0, required: 0 }), false);
  assert.equal(countCheckPasses({ policy: zero, net: null, required: 0 }), false);
  const rolled = resolved({ base: '2' });
  assert.equal(countCheckPasses({ policy: rolled, net: 0, required: 0 }), true);
  assert.equal(countCheckPasses({ policy: rolled, net: 2, required: 2 }), true);
  assert.equal(countCheckPasses({ policy: rolled, net: 1, required: 2 }), false);
  assert.equal(countCheckPasses({ policy: rolled, net: -1, required: 0 }), false);
});

test('a settled pool above 999 dice refuses pool-too-large, and 999 still rolls', () => {
  const placement = { poolDelta: 1, thresholdDelta: 0, preRolls: [] };
  assert.deepEqual(resolvePool({ evaluation: countEvaluation({ base: '999' }), placement }), {
    ok: false,
    reason: 'pool-too-large',
    refusedInput: 'pool',
  });
  assert.equal(resolved({ base: '998' }, { placement }).dice, 999);
  const penalised = { poolDelta: -300, thresholdDelta: 0, preRolls: [] };
  assert.equal(resolved({ base: '1200' }).dice, 1200, 'unchecked before settlement');
  assert.equal(resolved({ base: '1200' }, { placement: penalised }).dice, 900);
});

test('comparison follows the threshold mode in both directions', () => {
  const cases = [
    ['over', 'meet', [7, 8, 9], [false, true, true]],
    ['over', 'exceed', [7, 8, 9], [false, false, true]],
    ['under', 'meet', [7, 8, 9], [true, true, false]],
    ['under', 'exceed', [7, 8, 9], [true, false, false]],
  ];
  for (const [direction, thresholdMode, rolled, expected] of cases) {
    const policy = resolved({ direction }, { thresholdMode });
    assert.equal(policy.comparison, thresholdMode);
    assert.equal(policy.direction, direction);
    const { qualifies } = countFacePredicates(policy);
    assert.deepEqual(rolled.map(qualifies), expected, `${direction} ${thresholdMode}`);
  }
});

test('best explosion is the maximum over and one under; from faces compare inclusively', () => {
  const explodeWith = (direction, facesRule) =>
    countFacePredicates(
      resolved({ direction, explode: { enabled: true, faces: facesRule, once: true } })
    ).explodes;
  const range = Array.from({ length: 10 }, (_, index) => index + 1);
  const exploding = (predicate) => range.filter((face) => predicate(face));
  assert.deepEqual(exploding(explodeWith('over', { kind: 'best', value: null })), [10]);
  assert.deepEqual(exploding(explodeWith('under', { kind: 'best', value: null })), [1]);
  assert.deepEqual(exploding(explodeWith('over', { kind: 'from', value: 8 })), [8, 9, 10]);
  assert.deepEqual(exploding(explodeWith('under', { kind: 'from', value: 3 })), [1, 2, 3]);
  assert.deepEqual(exploding(explodeWith('over', { kind: 'from', value: 12 })), []);
  assert.deepEqual(exploding(explodeWith('under', { kind: 'from', value: 12 })), []);
});

test('worst cancellation is one over and the maximum under; from faces compare oppositely', () => {
  const cancelWith = (direction, facesRule) =>
    countFacePredicates(resolved({ direction, cancel: { enabled: true, faces: facesRule } }))
      .cancels;
  const range = Array.from({ length: 10 }, (_, index) => index + 1);
  const cancelling = (predicate) => range.filter((face) => predicate(face));
  assert.deepEqual(cancelling(cancelWith('over', { kind: 'worst', value: null })), [1]);
  assert.deepEqual(cancelling(cancelWith('under', { kind: 'worst', value: null })), [10]);
  assert.deepEqual(cancelling(cancelWith('over', { kind: 'from', value: 2 })), [1, 2]);
  assert.deepEqual(cancelling(cancelWith('under', { kind: 'from', value: 9 })), [9, 10]);
  assert.deepEqual(cancelling(cancelWith('over', { kind: 'from', value: 12 })), range);
  assert.deepEqual(cancelling(cancelWith('under', { kind: 'from', value: 12 })), []);
});

test('explode-once tests original dice only, and recursive explosion tests generated dice too', () => {
  const rule = (once) => ({ enabled: true, faces: { kind: 'best', value: null }, once });
  const once = countFacePredicates(resolved({ explode: rule(true) }));
  assert.equal(once.explodes(10), true);
  assert.equal(once.explodes(10, { generated: true }), false);
  const recursive = countFacePredicates(resolved({ explode: rule(false) }));
  assert.equal(recursive.explodes(10, { generated: true }), true);
  const none = countFacePredicates(resolved());
  assert.equal(none.explodes(10), false);
  assert.equal(none.cancels(1), false);
});

test('an overlapping face contributes zero with both marks', () => {
  const policy = resolved({
    die: 6,
    threshold: '1',
    cancel: { enabled: true, faces: { kind: 'worst', value: null } },
  });
  const projection = projectCountResults({ policy, results: faces(1, 4) });
  assert.deepEqual(
    projection.results.map(({ qualified, cancelled, contribution }) => ({
      qualified,
      cancelled,
      contribution,
    })),
    [
      { qualified: true, cancelled: true, contribution: 0 },
      { qualified: true, cancelled: false, contribution: 1 },
    ]
  );
  assert.deepEqual(
    { successes: projection.successes, cancelled: projection.cancelled, net: projection.net },
    { successes: 2, cancelled: 1, net: 1 }
  );
});

test('six d10 plus two pool dice explode tens, cancel ones, and can net below zero', () => {
  const pool = {
    base: '6',
    threshold: '8',
    explode: { enabled: true, faces: { kind: 'best', value: null }, once: false },
    cancel: { enabled: true, faces: { kind: 'worst', value: null } },
  };
  const placement = placementFor(countEvaluation(pool), [scalar('library', 2)]);
  const policy = resolved(pool, { placement });
  assert.equal(policy.dice, 8);
  const rolled = [
    { result: 10, active: true, exploded: true },
    ...faces(1, 1, 1, 2, 3, 4, 5),
    { result: 1, active: true },
  ];
  const projection = projectCountResults({ policy, results: rolled });
  assert.equal(projection.successes, 1);
  assert.equal(projection.cancelled, 4);
  assert.equal(projection.net, -3);
  assert.equal(countCheckPasses({ policy, net: projection.net, required: 0 }), false);
});

test('generated dice qualify and cancel, and provenance follows Foundry append order', () => {
  const policy = resolved({
    base: '2',
    threshold: '8',
    explode: { enabled: true, faces: { kind: 'best', value: null }, once: false },
    cancel: { enabled: true, faces: { kind: 'worst', value: null } },
  });
  const results = [
    { result: 10, active: true, exploded: true },
    { result: 3, active: true },
    { result: 10, active: true, exploded: true },
    { result: 1, active: true },
  ];
  const projection = projectCountResults({ policy, results });
  assert.deepEqual(projection.results, [
    {
      index: 0,
      face: 10,
      active: true,
      exploded: true,
      explodedFrom: null,
      qualified: true,
      cancelled: false,
      contribution: 1,
    },
    {
      index: 1,
      face: 3,
      active: true,
      exploded: false,
      explodedFrom: null,
      qualified: false,
      cancelled: false,
      contribution: 0,
    },
    {
      index: 2,
      face: 10,
      active: true,
      exploded: true,
      explodedFrom: 0,
      qualified: true,
      cancelled: false,
      contribution: 1,
    },
    {
      index: 3,
      face: 1,
      active: true,
      exploded: false,
      explodedFrom: 2,
      qualified: false,
      cancelled: true,
      contribution: -1,
    },
  ]);
  assert.equal(projection.net, 1);
  assert.deepEqual(results[3], { result: 1, active: true }, 'input results are not mutated');
});

test('an inactive die contributes zero and carries neither mark', () => {
  const policy = resolved({
    threshold: '1',
    cancel: { enabled: true, faces: { kind: 'worst', value: null } },
  });
  const projection = projectCountResults({
    policy,
    results: [
      { result: 1, active: false },
      { result: 5, active: true },
    ],
  });
  assert.deepEqual(
    projection.results.map(({ active, qualified, cancelled, contribution }) => ({
      active,
      qualified,
      cancelled,
      contribution,
    })),
    [
      { active: false, qualified: false, cancelled: false, contribution: 0 },
      { active: true, qualified: true, cancelled: false, contribution: 1 },
    ]
  );
  assert.equal(projection.net, 1);
});

test('the shortfall is required minus dice, and never negative', () => {
  assert.equal(minimumAdditionalDice({ required: 4, dice: 2 }), 2);
  assert.equal(minimumAdditionalDice({ required: 2, dice: 2 }), 0);
  assert.equal(minimumAdditionalDice({ required: 1, dice: 6 }), 0);
  assert.equal(minimumAdditionalDice({ required: 0, dice: 0 }), 0);
});

test('resolution never mutates deep-frozen roll data, evaluation or placement', () => {
  const rollData = deepFreeze({ skills: { smith: { rank: 4 } } });
  const evaluation = deepFreeze(countEvaluation({ base: '@skills.smith.rank + 2' }));
  const placement = deepFreeze({ poolDelta: 1, thresholdDelta: 0, preRolls: [] });
  const result = resolvePool({ evaluation, rollData, placement });
  assert.equal(result.ok, true);
  assert.equal(result.policy.dice, 7);
});

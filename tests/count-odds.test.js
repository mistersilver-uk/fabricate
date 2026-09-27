import test from 'node:test';
import assert from 'node:assert/strict';

import { planModifierPlacement } from '../src/systems/checkModifierRouter.js';
import {
  COUNT_ODDS_MAX_DEPTH,
  COUNT_ODDS_REASONS,
  COUNT_ODDS_RESIDUAL,
  MAX_PRE_ROLL_OUTCOMES,
  countOdds,
  countPassProbability,
} from '../src/systems/countOdds.js';

import {
  countEvaluation as d10CountEvaluation,
  deepFreeze,
  scalar,
} from './helpers/countFixtures.js';

const TOLERANCE = 1e-12;

// The odds chart d6 pools, whose masses are small fractions of 6^n.
const countEvaluation = (pool = {}) => d10CountEvaluation({ die: 6, threshold: '5', ...pool });

const explodeBest = (once) => ({ enabled: true, faces: { kind: 'best', value: null }, once });
const explodeFrom = (value, once) => ({ enabled: true, faces: { kind: 'from', value }, once });
const cancelWorst = { enabled: true, faces: { kind: 'worst', value: null } };
const cancelFrom = (value) => ({ enabled: true, faces: { kind: 'from', value } });

function odds(pool = {}, options = {}) {
  const result = countOdds({ evaluation: countEvaluation(pool), ...options });
  assert.equal(result.ok, true, `expected odds, got ${result.reason}`);
  return result;
}

function byNet(result) {
  const masses = {};
  for (const outcome of result.outcomes) {
    const key = outcome.zeroPool ? 'zeroPool' : outcome.net;
    masses[key] = (masses[key] ?? 0) + outcome.probability;
  }
  return masses;
}

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${message ?? 'value'}: expected ${expected}, got ${actual}`
  );
}

function assertMasses(actual, expected, message) {
  assert.deepEqual(Object.keys(actual).toSorted(), Object.keys(expected).toSorted(), message);
  for (const [key, mass] of Object.entries(expected)) {
    assertClose(actual[key], mass, `${message} net ${key}`);
  }
}

// Field by field: deep-diffing a whole odds result that regressed to charting can exhaust the heap.
function assertRefusal(result, reason, refusedInput) {
  assert.equal(result.ok, false, `expected a refusal, got ok ${result.ok}`);
  assert.equal(result.reason, reason);
  assert.equal(result.refusedInput, refusedInput);
}

function totalMass(result) {
  return result.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
}

function meanNet(result) {
  return result.outcomes.reduce((sum, outcome) => sum + outcome.net * outcome.probability, 0);
}

function rolling(source, expression) {
  return { source, label: source, form: 'expression', expression };
}

const range = (count) => Array.from({ length: count }, (_, index) => index + 1);

// An independent reference: every original face, and each once-explosion's generated face,
// enumerated as a joint sequence and scored by hand-written predicates.
function bruteForce({ dice, die, qualifies, cancels, explodes = () => false, aggregates = [] }) {
  const branches = [];
  for (const face of range(die)) {
    if (!explodes(face)) branches.push({ faces: [face], weight: 1 / die });
    else
      for (const next of range(die)) branches.push({ faces: [face, next], weight: 1 / die ** 2 });
  }
  const masses = {};
  const walk = (remaining, faces, weight) => {
    if (remaining === 0) {
      const net = faces.reduce(
        (sum, face) => sum + Number(qualifies(face)) - Number(cancels(face)),
        0
      );
      const marks = aggregates.map(({ aggregate, matches }) =>
        aggregate === 'anyDie' ? faces.some(matches) : faces.every(matches)
      );
      const key = [net, ...marks].join('|');
      masses[key] = (masses[key] ?? 0) + weight;
      return;
    }
    for (const branch of branches)
      walk(remaining - 1, [...faces, ...branch.faces], weight * branch.weight);
  };
  walk(dice, [], 1);
  return masses;
}

function jointMasses(result) {
  const masses = {};
  for (const outcome of result.outcomes) {
    const key = [outcome.net, ...outcome.matches].join('|');
    masses[key] = (masses[key] ?? 0) + outcome.probability;
  }
  return masses;
}

test('the odds refusal codes and recursion limits are the stated ones', () => {
  assert.deepEqual(COUNT_ODDS_REASONS, {
    preRollNotEnumerable: 'modifier-preroll-not-enumerable',
    tooManyOutcomes: 'too-many-outcomes',
    residualTooLarge: 'count-residual-too-large',
  });
  assert.ok(Object.isFrozen(COUNT_ODDS_REASONS));
  assert.equal(COUNT_ODDS_RESIDUAL, 1e-9);
  assert.equal(COUNT_ODDS_MAX_DEPTH, 20);
  assert.equal(MAX_PRE_ROLL_OUTCOMES, 50_000);
});

test('2d6 meet threshold 5 needing one success passes 20/36, and exceed charts 11/36', () => {
  const meet = odds({}, { thresholdMode: 'meet' });
  assert.equal(meet.status, 'exact');
  assert.equal(meet.residual, 0);
  assertMasses(byNet(meet), { 0: 16 / 36, 1: 16 / 36, 2: 4 / 36 }, 'meet');
  assertClose(countPassProbability({ odds: meet, required: 1 }), 20 / 36, 'meet pass');
  const exceed = odds({}, { thresholdMode: 'exceed' });
  assertClose(countPassProbability({ odds: exceed, required: 1 }), 11 / 36, 'exceed pass');
});

test('grading meets the required count: a net equal to it passes and one below it fails', () => {
  const result = odds();
  assertClose(countPassProbability({ odds: result, required: 2 }), 4 / 36, 'required 2');
  assertClose(countPassProbability({ odds: result, required: 3 }), 0, 'required 3');
  assertClose(countPassProbability({ odds: result, required: 0 }), 1, 'required 0');
});

test('a library +1 routed to the threshold charts 27/36 against threshold 4, applied once', () => {
  const evaluation = countEvaluation({ modifierDestination: 'threshold' });
  const placement = planModifierPlacement({ evaluation, contributions: [scalar('library', 1)] });
  const result = countOdds({ evaluation, placement });
  assert.equal(result.ok, true);
  assertClose(countPassProbability({ odds: result, required: 1 }), 27 / 36, 'threshold 4');
  assertMasses(byNet(result), { 0: 9 / 36, 1: 18 / 36, 2: 9 / 36 }, 'threshold 4');
});

test('a library +1 routed to the pool rolls 3d6 for 152/216 and never appends a success', () => {
  const evaluation = countEvaluation({ modifierDestination: 'pool' });
  const placement = planModifierPlacement({ evaluation, contributions: [scalar('library', 1)] });
  const result = countOdds({ evaluation, placement });
  assert.equal(result.ok, true);
  assertClose(countPassProbability({ odds: result, required: 1 }), 152 / 216, 'pool 3d6');
  assertMasses(byNet(result), { 0: 64 / 216, 1: 96 / 216, 2: 48 / 216, 3: 8 / 216 }, '3d6');
});

test('cancelling the worst face on 2d6 threshold 5 has an expected net of exactly 1/3', () => {
  const result = odds({ cancel: cancelWorst });
  assert.equal(result.status, 'exact');
  assertClose(result.expected, 1 / 3, 'closed form');
  assertClose(meanNet(result), 1 / 3, 'distribution mean');
  assertMasses(
    byNet(result),
    { '-2': 1 / 36, '-1': 6 / 36, 0: 13 / 36, 1: 12 / 36, 2: 4 / 36 },
    'net'
  );
});

test('a face that both qualifies and cancels contributes zero, so 1d6 expects a net of 5/6', () => {
  const result = odds({ base: '1', threshold: '1', cancel: cancelFrom(1) });
  assertMasses(byNet(result), { 0: 1 / 6, 1: 5 / 6 }, 'overlap');
  assertClose(result.expected, 5 / 6, 'expected');
  assertClose(meanNet(result), 5 / 6, 'mean');
});

test('a once-exploding 1d6 on its best face at threshold 5 charts 24/36, 10/36 and 2/36', () => {
  const result = odds({ base: '1', explode: explodeBest(true) });
  assert.equal(result.status, 'exact');
  assert.equal(result.residual, 0);
  assertMasses(byNet(result), { 0: 24 / 36, 1: 10 / 36, 2: 2 / 36 }, 'once');
  assertClose(result.expected, 14 / 36, 'expected');
  assertClose(meanNet(result), 14 / 36, 'mean');
});

test('nonexploding pools through 6d6 match an independent brute force in every mode', () => {
  const variants = [
    {
      label: 'over meet',
      pool: { threshold: '4' },
      qualifies: (f) => f >= 4,
      cancels: () => false,
    },
    {
      label: 'over exceed, cancel worst',
      pool: { threshold: '4', cancel: cancelWorst },
      mode: 'exceed',
      qualifies: (f) => f > 4,
      cancels: (f) => f === 1,
    },
    {
      label: 'under meet, cancel from 5 overlapping',
      pool: { direction: 'under', threshold: '5', cancel: cancelFrom(5) },
      qualifies: (f) => f <= 5,
      cancels: (f) => f >= 5,
    },
    {
      label: 'over fractional threshold, cancel from 3 overlapping',
      pool: { threshold: '2.5', cancel: cancelFrom(3) },
      qualifies: (f) => f >= 2.5,
      cancels: (f) => f <= 3,
    },
    {
      label: 'under exceed, cancel worst',
      pool: { direction: 'under', threshold: '3', cancel: cancelWorst },
      mode: 'exceed',
      qualifies: (f) => f < 3,
      cancels: (f) => f === 6,
    },
  ];
  for (const variant of variants) {
    for (const dice of range(6)) {
      const result = odds({ ...variant.pool, base: String(dice) }, { thresholdMode: variant.mode });
      const expected = bruteForce({ dice, die: 6, ...variant });
      assertMasses(jointMasses(result), expected, `${variant.label} ${dice}d6`);
      assertClose(result.expected, meanNet(result), `${variant.label} ${dice}d6 expected`);
    }
  }
});

test('once-exploding pools with overlapping marks and face aggregates match brute force', () => {
  const aggregates = [
    { aggregate: 'anyDie', matches: (face) => face === 6 },
    { aggregate: 'allDice', matches: (face) => face === 1 },
  ];
  const variants = [
    {
      label: 'best once, cancel from 4',
      pool: { threshold: '3', explode: explodeBest(true), cancel: cancelFrom(4) },
      qualifies: (f) => f >= 3,
      cancels: (f) => f <= 4,
      explodes: (f) => f === 6,
    },
    {
      label: 'under from-2 once, cancel worst',
      pool: {
        direction: 'under',
        threshold: '3',
        explode: explodeFrom(2, true),
        cancel: cancelWorst,
      },
      qualifies: (f) => f <= 3,
      cancels: (f) => f === 6,
      explodes: (f) => f <= 2,
    },
  ];
  for (const variant of variants) {
    for (const dice of range(4)) {
      const result = odds({ ...variant.pool, base: String(dice) }, { faceAggregates: aggregates });
      const expected = bruteForce({ dice, die: 6, aggregates, ...variant });
      assertMasses(jointMasses(result), expected, `${variant.label} ${dice}d6`);
      assertClose(result.expected, meanNet(result), `${variant.label} ${dice}d6 expected`);
    }
  }
});

test('face aggregates see explosion-generated dice, and a zero pool matches no aggregate', () => {
  const aggregates = [{ aggregate: 'allDice', matches: (face) => face >= 5 }];
  const result = odds({ base: '1', explode: explodeBest(true) }, { faceAggregates: aggregates });
  // A 6 explodes: every die is 5 or more only when the generated die is too.
  assertMasses(
    jointMasses(result),
    {
      '0|false': 24 / 36,
      '1|true': 6 / 36,
      '1|false': 4 / 36,
      '2|true': 2 / 36,
    },
    'generated'
  );
  const zero = odds({ base: '0' }, { faceAggregates: aggregates });
  assert.deepEqual(zero.outcomes, [{ net: 0, zeroPool: true, matches: [false], probability: 1 }]);
});

test('recursive explosion charts the untruncated masses and returns the residual unrenormalized', () => {
  const result = odds({ base: '1', explode: explodeBest(false) });
  assert.equal(result.status, 'bounded');
  assert.ok(result.residual > 0 && result.residual < COUNT_ODDS_RESIDUAL, `${result.residual}`);
  const masses = byNet(result);
  const top = Math.max(...Object.keys(masses).map(Number));
  assertClose(masses[0], 4 / 6, 'net 0');
  // The deepest charted chain is top - 1 sixes then a 5; top sixes is the unexpanded residual.
  const relative = (actual, expected) => Math.abs(actual - expected) <= expected * 1e-12;
  assert.ok(relative(masses[top], (1 / 6) ** top), `net ${top}`);
  assert.ok(relative(result.residual, (1 / 6) ** top), 'residual');
  for (let net = 1; net < top; net += 1) {
    // A run of n - 1 sixes then a 5, or n sixes then 1 to 4.
    assert.ok(relative(masses[net], (10 / 6) * (1 / 6) ** net), `net ${net}: ${masses[net]}`);
  }
  assert.ok(Math.abs(totalMass(result) + result.residual - 1) <= 1e-15, 'mass plus residual');
  assertClose(result.expected, 2 / 5, 'closed-form expected');
});

test('a recursive pool keeps mass plus residual at one across several dice', () => {
  const result = odds({
    base: '3',
    threshold: '4',
    explode: explodeBest(false),
    cancel: cancelWorst,
  });
  assert.equal(result.status, 'bounded');
  assert.ok(result.residual > 0 && result.residual < COUNT_ODDS_RESIDUAL);
  assert.ok(Math.abs(totalMass(result) + result.residual - 1) <= 1e-14);
  // Per die: mean (3 - 1) / 6, and each explosion adds that again with probability 1/6.
  assertClose(result.expected, 3 * (2 / 6) * (6 / 5), 'expected');
  assert.ok(Math.abs(meanNet(result) - result.expected) < 1e-8);
});

test('near-every-face recursion abstains with its residual when depth 20 cannot reach tolerance', () => {
  const cases = [
    { die: 2, base: '1', threshold: '2', explode: explodeBest(false) },
    { die: 10, base: '4', threshold: '8', explode: explodeFrom(2, false) },
  ];
  for (const pool of cases) {
    const result = countOdds({ evaluation: countEvaluation(pool) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'count-residual-too-large');
    assert.ok(result.residual >= COUNT_ODDS_RESIDUAL, `${result.residual}`);
    assert.equal(Object.hasOwn(result, 'outcomes'), false);
  }
  const d2 = countOdds({ evaluation: countEvaluation(cases[0]) });
  assertClose(d2.residual, 2 ** -(COUNT_ODDS_MAX_DEPTH + 1), 'd2 residual after depth 20');
});

test('a separately evaluated pool pre-roll is mixed exactly over the pools it settles', () => {
  const evaluation = countEvaluation({ modifierDestination: 'pool' });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '1d4')],
  });
  const result = countOdds({
    evaluation,
    placement,
    preRollTotals: [{ index: 0, totals: [1, 2, 3, 4] }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'exact');
  const pass = [3, 4, 5, 6].reduce((sum, dice) => sum + (1 - (2 / 3) ** dice) / 4, 0);
  assertClose(countPassProbability({ odds: result, required: 1 }), pass, 'mixed pool');
  assertClose(result.expected, (4.5 * 1) / 3, 'expected over 3 to 6 dice');
  assertClose(totalMass(result), 1, 'mass');
});

test('threshold pre-rolls mix jointly with scalar benefits, each applied exactly once', () => {
  const evaluation = countEvaluation({ modifierDestination: 'threshold', base: '1' });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [scalar('tool', 1), rolling('library', '1d2'), rolling('situational', '1d2')],
  });
  const result = countOdds({
    evaluation,
    placement,
    preRollTotals: [
      { index: 1, totals: [1, 2] },
      { index: 2, totals: [1, 2] },
    ],
  });
  assert.equal(result.ok, true);
  // Threshold 5 - 1 - (2..4) is 2, 1 or 0 with weights 1/4, 1/2, 1/4; 1 and 0 qualify every face.
  const pass = (1 / 4) * (5 / 6) + (3 / 4) * 1;
  assertClose(countPassProbability({ odds: result, required: 1 }), pass, 'joint threshold');
});

test('a pending pre-roll without enumerable totals refuses modifier-preroll-not-enumerable', () => {
  const evaluation = countEvaluation();
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '1d4')],
  });
  for (const preRollTotals of [
    [],
    [{ index: 1, totals: [1, 2] }],
    [{ index: 0, totals: [] }],
    [{ index: 0, totals: null }],
    [{ index: 0, totals: [1, Number.NaN] }],
    [{ index: 0, totals: [1, Infinity] }],
  ]) {
    assertRefusal(
      countOdds({ evaluation, placement, preRollTotals }),
      'modifier-preroll-not-enumerable'
    );
  }
});

test('a joint pre-roll space above 50,000 outcomes refuses too-many-outcomes before walking it', () => {
  const evaluation = countEvaluation({ modifierDestination: 'threshold' });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '1d250'), rolling('situational', '1d250')],
  });
  const totals = range(250);
  const within = countOdds({
    evaluation,
    placement,
    preRollTotals: [
      { index: 0, totals: totals.slice(0, 200) },
      { index: 1, totals: totals.slice(0, 250) },
    ],
  });
  assert.equal(within.ok, true);
  const refused = countOdds({
    evaluation,
    placement,
    preRollTotals: [
      { index: 0, totals },
      { index: 1, totals: [...totals, 251] },
    ],
  });
  assertRefusal(refused, 'too-many-outcomes');
});

test('pool refusals pass through unchanged, including one only a pre-roll outcome reaches', () => {
  assertRefusal(
    countOdds({ evaluation: countEvaluation({ base: '@missing' }) }),
    'unresolved-path',
    'base'
  );
  assertRefusal(
    countOdds({ evaluation: countEvaluation({ die: 6, explode: explodeFrom(1, false) }) }),
    'explode-unbounded',
    'explode'
  );
  const evaluation = countEvaluation({ base: '997' });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '1d4')],
  });
  const result = countOdds({
    evaluation,
    placement,
    preRollTotals: [{ index: 0, totals: [1, 2, 3] }],
  });
  assertRefusal(result, 'pool-too-large', 'pool');
  assertRefusal(
    countOdds({ evaluation: countEvaluation({ base: '1000' }) }),
    'pool-too-large',
    'pool'
  );
});

test('duplicate equally likely pre-roll totals each carry their own share', () => {
  const evaluation = countEvaluation({ base: '1' });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '2d2')],
  });
  const result = countOdds({
    evaluation,
    placement,
    preRollTotals: [{ index: 0, totals: [2, 3, 3, 4] }],
  });
  assert.equal(result.ok, true);
  assertClose(totalMass(result), 1, 'mass');
  const pass = [3, 4, 4, 5].reduce((sum, dice) => sum + (1 - (2 / 3) ** dice) / 4, 0);
  assertClose(countPassProbability({ odds: result, required: 1 }), pass, '2d2 pool');
});

test('a pre-roll mixture of recursive pools keeps mass plus residual at one', () => {
  const evaluation = countEvaluation({ base: '1', explode: explodeBest(false) });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '1d2')],
  });
  const result = countOdds({
    evaluation,
    placement,
    preRollTotals: [{ index: 0, totals: [1, 2] }],
  });
  assert.equal(result.ok, true);
  assert.ok(result.residual > 0);
  assert.ok(Math.abs(totalMass(result) + result.residual - 1) <= 1e-14);
});

test('a zero pool is one zeroPool outcome that never passes, and floors to one die when allowed', () => {
  const zero = odds({ base: '0' });
  assert.deepEqual(zero.outcomes, [{ net: 0, zeroPool: true, matches: [], probability: 1 }]);
  assert.equal(zero.expected, 0);
  assert.equal(countPassProbability({ odds: zero, required: 0 }), 0);
  const floored = odds({ base: '0', zeroPoolFails: false });
  assertMasses(byNet(floored), { 0: 4 / 6, 1: 2 / 6 }, 'one die');
  assertClose(countPassProbability({ odds: floored, required: 0 }), 1, 'required 0');
});

test('a zero pool reached by only some pre-roll outcomes carries exactly their mass', () => {
  const evaluation = countEvaluation({ base: '1' });
  const placement = planModifierPlacement({
    evaluation,
    contributions: [rolling('library', '1d2-2')],
  });
  const result = countOdds({
    evaluation,
    placement,
    preRollTotals: [{ index: 0, totals: [-1, 0] }],
  });
  assert.equal(result.ok, true);
  assertMasses(byNet(result), { zeroPool: 1 / 2, 0: 1 / 3, 1: 1 / 6 }, 'half zero');
  assertClose(countPassProbability({ odds: result, required: 0 }), 1 / 2, 'required 0');
  assertClose(result.expected, 1 / 6, 'expected');
});

test('pools enumerate natively as NdX, well beyond the sum enumerator unit-die whitelist', () => {
  const twelve = odds({ die: 10, base: '12', threshold: '8' });
  const binomial = (k) => {
    let choose = 1;
    for (let index = 0; index < k; index += 1) choose = (choose * (12 - index)) / (index + 1);
    return choose * 0.3 ** k * 0.7 ** (12 - k);
  };
  for (const k of range(12)) assertClose(byNet(twelve)[k], binomial(k), `12d10 net ${k}`);
  const largest = odds({ die: 10, base: '999', threshold: '8' });
  assert.equal(largest.status, 'exact');
  assertClose(largest.expected, 999 * 0.3, 'expected');
  assert.ok(Math.abs(totalMass(largest) - 1) < 1e-9);
});

test('odds whose convolution would exceed the work budget refuse too-many-outcomes', () => {
  const pool = {
    die: 10,
    base: '999',
    threshold: '8',
    explode: explodeBest(true),
    cancel: cancelWorst,
  };
  assert.equal(odds(pool).status, 'exact');
  const aggregates = [
    { aggregate: 'anyDie', matches: (face) => face === 10 },
    { aggregate: 'allDice', matches: (face) => face === 1 },
  ];
  const refused = countOdds({ evaluation: countEvaluation(pool), faceAggregates: aggregates });
  assertRefusal(refused, 'too-many-outcomes');
});

test('an unknown face aggregate is a contract error', () => {
  assert.throws(
    () =>
      countOdds({ evaluation: countEvaluation(), faceAggregates: [{ aggregate: 'lowestDie' }] }),
    TypeError
  );
});

test('odds read deep-frozen inputs without mutating them', () => {
  const rollData = deepFreeze({ skills: { craft: { value: 3 } } });
  const evaluation = deepFreeze(countEvaluation({ base: '@skills.craft.value' }));
  const placement = deepFreeze(
    planModifierPlacement({ evaluation, contributions: [rolling('library', '1d2')] })
  );
  const preRollTotals = deepFreeze([{ index: 0, totals: [1, 2] }]);
  const result = countOdds({ evaluation, rollData, placement, preRollTotals });
  assert.equal(result.ok, true);
  assertClose(result.expected, 4.5 / 3, 'four or five dice');
});

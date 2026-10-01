/**
 * Issue 2006 — the summary line and rows a result states for an executed count check, read from
 * its projection's `count` alone, in the approved copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { executedCheckDisplay } from '../src/ui/presenters/checkDisplay.js';
import {
  countBotched,
  countEvidenceRows,
  countSummaryText,
  statesCountEvidence,
} from '../src/ui/presenters/countEvidenceRows.js';

import { NOT_PUBLIC, shippedLocalize } from './helpers/checkEvidenceFixtures.js';

const PUBLIC = { rollMode: 'publicroll', secret: false };

/** A count projection: a d10 pool of 6 at 8 or above, two dice rolled; `count` overrides it. */
function counted({ direction = 'over', comparison = 'meet', preRolls, count = {} } = {}) {
  const { pool, threshold, ...rest } = count;
  return executedCheckDisplay({
    data: {
      product: 'count',
      direction,
      comparison,
      total: rest.net ?? 1,
      target: 8,
      ...(preRolls && { preRolls }),
    },
    visibility: PUBLIC,
    countDisplay: {
      die: 10,
      results: [
        { index: 0, face: 9, active: true, qualified: true },
        { index: 1, face: 1, active: true, cancelled: true },
      ],
      qualified: 1,
      cancelled: 1,
      net: 0,
      required: 2,
      margin: -2,
      zeroPool: false,
      pool: { base: 6, terms: [], rolled: 6, ...pool },
      threshold: { anchor: 8, source: 'fixed', terms: [], effective: 8, ...threshold },
      ...rest,
    },
  });
}

const rows = (display) =>
  countEvidenceRows(display, shippedLocalize).map(({ id, text, tone }) => [id, text, tone]);

test('a fixed, unmoved threshold states Count and Needed, with the margin signed', () => {
  const display = counted({ count: { net: 3, margin: 1, qualified: 3, cancelled: 0 } });
  assert.equal(countSummaryText(display, shippedLocalize), '6d10, each ≥ 8');
  assert.deepEqual(rows(display), [
    ['count', '3 qualified − 0 cancelled = 3 net', undefined],
    ['needed', '2 · margin +1', undefined],
  ]);
  assert.equal(countBotched(display), false);
});

test('a botch reads its net with the true minus in the danger tone, and Needed names the botch', () => {
  const display = counted({ count: { net: -1, margin: -3, qualified: 1, cancelled: 2 } });
  assert.deepEqual(rows(display), [
    ['count', '1 qualified − 2 cancelled = −1 net', 'danger'],
    ['needed', '2 · a net below zero is a botch', undefined],
  ]);
  assert.equal(countBotched(display), true);
});

test('a pool grown by modifiers says so, and a character threshold moved by one states both', () => {
  const display = counted({
    direction: 'under',
    count: {
      net: 2,
      margin: 0,
      pool: { base: 2, rolled: 3, terms: [{ source: 'library', value: 1 }] },
      threshold: {
        anchor: 13,
        source: 'character',
        effective: 14,
        terms: [{ source: 'situational', value: 1 }],
      },
    },
  });
  assert.equal(
    countSummaryText(display, shippedLocalize),
    '3d10, each ≤ 14 (pool grown +1 by modifiers)'
  );
  assert.deepEqual(rows(display)[0], [
    'successOn',
    '≤ 14 · character value 13, moved +1 by modifiers',
    undefined,
  ]);
});

test('a moved threshold reads signed by its benefit, as the prompt signs it, in either direction', () => {
  const moved = (direction, comparison, effective) =>
    rows(counted({ direction, comparison, count: { threshold: { effective } } }))[0][1];
  assert.equal(moved('over', 'meet', 7), '≥ 7 · fixed, moved +1 by modifiers', 'a +1 Tool bonus');
  assert.equal(moved('over', 'exceed', 7), '> 7 · fixed, moved +1 by modifiers');
  assert.equal(moved('over', 'meet', 9), '≥ 9 · fixed, moved −1 by modifiers', 'a penalty');
  assert.equal(moved('under', 'meet', 9), '≤ 9 · fixed, moved +1 by modifiers');
  assert.equal(moved('under', 'meet', 7), '≤ 7 · fixed, moved −1 by modifiers');
});

test('Pre-rolled states the dice a rolled bonus added and the threshold it moved', () => {
  const preRolls = [
    { source: 'situational', label: '', expression: '(1d4)', total: 3, destination: 'pool' },
    { source: 'library', label: 'Knack', expression: '1d2', total: 2, destination: 'threshold' },
  ];
  const over = rows(counted({ preRolls })).find(([id]) => id === 'preRolled');
  assert.equal(
    over[1],
    'Situational 1d4 rolled 3, adding 3 dice; Knack 1d2 rolled 2, moving the threshold +2'
  );
  const under = rows(counted({ direction: 'under', preRolls })).find(([id]) => id === 'preRolled');
  assert.match(under[1], /moving the threshold \+2$/, 'signed by the benefit either way');
  const penalty = [{ ...preRolls[1], total: -2 }];
  const lowered = rows(counted({ preRolls: penalty })).find(([id]) => id === 'preRolled');
  assert.match(lowered[1], /moving the threshold −2$/, 'a rolled penalty reads negative');
});

test('Pre-rolled names one die in the singular and a negative roll as dice removed', () => {
  const preRolled = (total) =>
    rows(
      counted({
        preRolls: [
          { source: 'situational', label: '', expression: '1d4', total, destination: 'pool' },
        ],
      })
    ).find(([id]) => id === 'preRolled')[1];
  assert.equal(preRolled(1), 'Situational 1d4 rolled 1, adding 1 die');
  assert.equal(preRolled(-2), 'Situational 1d4 rolled −2, removing 2 dice');
  assert.equal(preRolled(-1), 'Situational 1d4 rolled −1, removing 1 die');
});

test('a check with no required count, progressive or fixed-range, states no Needed row', () => {
  const display = counted({ count: { required: null, margin: null, net: 2 } });
  assert.deepEqual(
    rows(display).map(([id]) => id),
    ['count']
  );
});

test('a zero pool states why it rolled nothing, naming one source or several', () => {
  const zero = (terms) =>
    counted({
      count: {
        net: null,
        qualified: null,
        cancelled: null,
        results: [],
        zeroPool: true,
        required: 1,
        pool: { base: 6, rolled: 0, terms },
      },
    });
  const one = zero([{ source: 'situational', value: -6 }]);
  assert.equal(countSummaryText(one, shippedLocalize), '6d10 − 6 situational = 0 dice');
  assert.deepEqual(rows(one), [
    ['pool', 'Reduced to zero by a situational penalty of −6', undefined],
    ['result', 'A pool reduced to zero fails automatically. Nothing was rolled.', undefined],
  ]);
  assert.deepEqual(one.count.tiles, { tiles: [], more: 0 });

  const several = zero([
    { source: 'tool', value: -2 },
    { source: 'library', value: -4 },
  ]);
  assert.equal(countSummaryText(several, shippedLocalize), '6d10 − 6 modifiers = 0 dice');
  assert.equal(rows(several)[0][1], 'Reduced to zero by modifiers totalling −6');

  const bare = zero([]);
  assert.equal(countSummaryText(bare, shippedLocalize), '6d10 = 0 dice');
  assert.deepEqual(
    rows(bare).map(([id]) => id),
    ['result']
  );
});

test('a summed check or a count without executed dice states no count evidence', () => {
  const summed = executedCheckDisplay({
    data: { product: 'sum', direction: 'under', comparison: 'meet', total: 9, target: 12 },
    visibility: PUBLIC,
  });
  const undiced = executedCheckDisplay({
    data: { product: 'count', direction: 'over', comparison: 'meet', total: 1, target: 8 },
    visibility: PUBLIC,
  });
  for (const display of [summed, undiced, null]) {
    assert.equal(statesCountEvidence(display), false);
    assert.equal(countSummaryText(display, shippedLocalize), '');
    assert.deepEqual(countEvidenceRows(display, shippedLocalize), []);
  }
});

/** Frame 39: three d20s under 14, the last of them bought with a point of Momentum. */
function bought({ visibility = PUBLIC, resourceLabel = 'Momentum', pool, terms = [] } = {}) {
  return executedCheckDisplay({
    data: {
      product: 'count',
      direction: 'under',
      comparison: 'meet',
      total: 1,
      target: 14,
      boughtDice: { count: 1, source: 'macro' },
    },
    visibility,
    countDisplay: {
      die: 20,
      bought: 1,
      resourceLabel,
      results: [
        { index: 0, face: 1, active: true, qualified: true },
        { index: 1, face: 20, active: true, cancelled: true },
        { index: 2, face: 11, active: true, qualified: true },
      ],
      qualified: 2,
      cancelled: 1,
      net: 1,
      required: 1,
      margin: 0,
      zeroPool: false,
      pool: { base: 2, terms, rolled: 3, ...pool },
      threshold: { anchor: 14, source: 'fixed', terms: [], effective: 14 },
    },
  });
}

test('a count that bought dice states them in its summary and its Additional dice row', () => {
  const display = bought();
  assert.equal(countSummaryText(display, shippedLocalize), '3d20 (2 + 1 bought), each ≤ 14');
  assert.deepEqual(rows(display), [
    ['count', '2 qualified − 1 cancelled = 1 net', undefined],
    ['needed', '1 · margin +0', undefined],
    ['additionalDice', '1 bought · spent 1 Momentum', undefined],
  ]);
  assert.equal(
    countEvidenceRows(display, shippedLocalize).at(-1).label,
    'Additional dice',
    'the row is labelled'
  );
});

test('an unlabelled resource drops its noun, and a grown pool keeps its modifier suffix', () => {
  assert.deepEqual(rows(bought({ resourceLabel: '' })).at(-1), [
    'additionalDice',
    '1 bought · spent 1',
    undefined,
  ]);
  const grown = bought({ pool: { rolled: 4 }, terms: [{ source: 'library', value: 1 }] });
  assert.equal(
    countSummaryText(grown, shippedLocalize),
    '4d20 (3 + 1 bought), each ≤ 14 (pool grown +1 by modifiers)'
  );
});

test('a secret or non-public count states no bought dice in its summary or rows', () => {
  for (const visibility of NOT_PUBLIC) {
    const display = bought({ visibility });
    assert.equal(
      countSummaryText(display, shippedLocalize),
      '3d20, each ≤ 14',
      JSON.stringify(visibility)
    );
    assert.ok(
      rows(display).every(([id]) => id !== 'additionalDice'),
      JSON.stringify(visibility)
    );
  }
});

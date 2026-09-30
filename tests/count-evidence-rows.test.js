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

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';

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

test('a fixed threshold that moved states Success on as fixed; strictness picks the sign', () => {
  const display = counted({
    comparison: 'exceed',
    count: { threshold: { anchor: 8, effective: 7, terms: [{ source: 'tool', value: -1 }] } },
  });
  assert.deepEqual(rows(display)[0], [
    'successOn',
    '> 7 · fixed, moved −1 by modifiers',
    undefined,
  ]);
});

test('Pre-rolled states the dice a rolled bonus added and the threshold it moved', () => {
  const preRolls = [
    { source: 'situational', label: '', expression: '(1d4)', total: 3, destination: 'pool' },
    { source: 'library', label: 'Knack', expression: '1d2', total: 2, destination: 'threshold' },
  ];
  const over = rows(counted({ preRolls })).find(([id]) => id === 'preRolled');
  assert.equal(
    over[1],
    'Situational 1d4 rolled 3, adding 3 dice; Knack 1d2 rolled 2, moving the threshold −2'
  );
  const under = rows(counted({ direction: 'under', preRolls })).find(([id]) => id === 'preRolled');
  assert.match(under[1], /moving the threshold \+2$/, 'a roll-low threshold rises');
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

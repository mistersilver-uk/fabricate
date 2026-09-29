/**
 * Issue 2006 — a count roll's executed display input: each source's settled benefit counted once,
 * signed as it moved its destination, and reported only to a caller that reports its visibility.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { scalar } from './helpers/countFixtures.js';
import {
  countPlacementTerms,
  countRollReport,
  reportedCountDisplay,
} from '../src/systems/countDisplayEvidence.js';

const toPool = { product: 'count', direction: 'over', pool: { modifierDestination: 'pool' } };
const toThreshold = (direction) => ({
  product: 'count',
  direction,
  pool: { modifierDestination: 'threshold' },
});

/** A Tool benefit already rolled before the prompt: a scalar that carries its pre-roll. */
const rolledTool = {
  ...scalar('tool', 2),
  preRoll: { expression: '1d4', total: 2 },
};

test('each source is counted once, a pre-rolled Tool from its settled pre-roll alone', () => {
  const terms = countPlacementTerms(
    toPool,
    [rolledTool, scalar('library', 1), scalar('library', 1), scalar('situational', 0)],
    [
      { source: 'tool', destination: 'pool', total: 2 },
      { source: 'situational', destination: 'pool', total: -3 },
    ]
  );
  assert.deepEqual(terms, {
    pool: [
      { source: 'tool', value: 2 },
      { source: 'library', value: 2 },
      { source: 'situational', value: -3 },
    ],
    threshold: [],
  });
});

test('a threshold benefit lowers a roll-high threshold and raises a roll-low one', () => {
  const over = countPlacementTerms(toThreshold('over'), [scalar('library', 2)]);
  const under = countPlacementTerms(toThreshold('under'), [scalar('library', 2)]);
  assert.deepEqual(over.threshold, [{ source: 'library', value: -2 }]);
  assert.deepEqual(under.threshold, [{ source: 'library', value: 2 }]);
});

test('only a caller that reports its visibility receives the report or the display', () => {
  const decision = { rollMode: 'gmroll', contributions: [scalar('tool', 1)] };
  const input = { decision, evaluation: toPool, placement: { preRolls: [] } };
  assert.deepEqual(countRollReport({}, input), {});
  assert.deepEqual(countRollReport({ reportVisibility: true }, input), {
    rollMode: 'gmroll',
    countTerms: { pool: [{ source: 'tool', value: 1 }], threshold: [] },
    thresholdSource: 'fixed',
  });
  const policy = { die: 6, dice: 3, threshold: 5, resolved: { base: 2, threshold: 5 } };
  const rolled = { policy, total: 1, countProjection: { results: [], successes: 2, cancelled: 1 } };
  assert.deepEqual(reportedCountDisplay(rolled, 2), {}, 'not reported, so nothing to hand on');
  const { countDisplay } = reportedCountDisplay({ ...rolled, rollMode: 'publicroll' }, 2);
  assert.deepEqual(
    [countDisplay.net, countDisplay.required, countDisplay.margin, countDisplay.pool.rolled],
    [1, 2, -1, 3]
  );
});

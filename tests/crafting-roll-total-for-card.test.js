/**
 * Unit tests for `rollTotalForCard` — the helper that picks the RAW rolled total
 * threaded onto crafting/salvage result chat cards (issue 688).
 *
 * The key case: a progressive check's `value` is the AWARDING value, which a forced
 * crit overwrites (`MAX_SAFE_INTEGER`/`0`), while `data.total` keeps the raw roll.
 * The card must show the raw roll, not the awarding sentinel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { rollTotalForCard } from '../src/systems/CraftingEngine.js';

test('prefers data.total (the raw roll) over value for a forced-crit progressive check', () => {
  // A forced SUCCESS crit awards everything: value === MAX_SAFE_INTEGER, but the
  // player rolled 12 — the card must show 12, not 9007199254740991.
  const forcedSuccess = { value: Number.MAX_SAFE_INTEGER, data: { total: 12 } };
  assert.equal(rollTotalForCard(forcedSuccess), 12);

  // A forced FAILURE crit awards nothing: value === 0, raw roll was 18.
  const forcedFailure = { value: 0, data: { total: 18 } };
  assert.equal(rollTotalForCard(forcedFailure), 18);
});

test('returns the shared total when value === data.total (simple / routed checks)', () => {
  assert.equal(rollTotalForCard({ value: 15, data: { total: 15 } }), 15);
});

test('falls back to value when data.total is absent', () => {
  assert.equal(rollTotalForCard({ value: 9, data: {} }), 9);
  assert.equal(rollTotalForCard({ value: 7 }), 7);
});

test('returns null when no check ran (null value, no data, or absent result)', () => {
  assert.equal(rollTotalForCard({ value: null, data: {} }), null);
  assert.equal(rollTotalForCard({}), null);
  assert.equal(rollTotalForCard(null), null);
  assert.equal(rollTotalForCard(undefined), null);
});

test('preserves a raw total of 0 rather than collapsing to null', () => {
  assert.equal(rollTotalForCard({ value: 0, data: { total: 0 } }), 0);
});

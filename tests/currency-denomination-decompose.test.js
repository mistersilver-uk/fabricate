/**
 * `decomposeBaseAmount` — a terminal-base-unit figure said the way a table says it (issue 1342).
 *
 * The pooled consume settles and reports every payer's share in the world's TERMINAL BASE UNIT,
 * for the over-charging reason `consumePooledCurrency` states in full, while the ledger row beside
 * it echoes the caller's own denomination. A companion drawing the two together was therefore
 * printing copper beside a cost asked for in gold. This function closes that, and it must be exact
 * in integers rather than approximately right: a coin count that does not sum back to the amount
 * debited is a chat card contradicting a character sheet.
 *
 * Every case here is about the arithmetic alone. The publication of `unitId`/`share` through the
 * contract boundary is pinned by `companion-pooled-holdings-contract.test.js`, and the end-to-end
 * settlement by `companion-pooled-consumption.test.js`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeBaseAmount } from '../src/systems/currencyProfile.js';

/** A `gp -> sp -> cp` ladder, in the shape `validateCurrencyProfile` publishes one. */
function coinLadder() {
  return {
    units: [
      { id: 'gp', abbreviation: 'gp', label: 'Gold Pieces' },
      { id: 'sp', abbreviation: 'sp', label: 'Silver Pieces' },
      { id: 'cp', abbreviation: 'cp', label: 'Copper Pieces' },
    ],
    metadata: new Map([
      ['gp', { baseUnitId: 'cp', baseValue: 100 }],
      ['sp', { baseUnitId: 'cp', baseValue: 10 }],
      ['cp', { baseUnitId: 'cp', baseValue: 1 }],
    ]),
  };
}

test('an amount that divides evenly names one denomination and stops', () => {
  assert.deepEqual(decomposeBaseAmount(15_000, coinLadder(), 'cp'), [
    { unitId: 'gp', unitLabel: 'gp', amount: 150 },
  ]);
});

test('an amount that does NOT divide evenly names every denomination it needs', () => {
  // The case a naive implementation gets wrong by rounding, and the one that would put a chat card
  // three coppers out of step with the sheet it was taken from.
  assert.deepEqual(decomposeBaseAmount(15_003, coinLadder(), 'cp'), [
    { unitId: 'gp', unitLabel: 'gp', amount: 150 },
    { unitId: 'cp', unitLabel: 'cp', amount: 3 },
  ]);
  assert.deepEqual(decomposeBaseAmount(256, coinLadder(), 'cp'), [
    { unitId: 'gp', unitLabel: 'gp', amount: 2 },
    { unitId: 'sp', unitLabel: 'sp', amount: 5 },
    { unitId: 'cp', unitLabel: 'cp', amount: 6 },
  ]);
});

test('a denomination that takes none of the amount is OMITTED rather than reported as zero', () => {
  const share = decomposeBaseAmount(250, coinLadder(), 'cp');
  assert.deepEqual(share, [
    { unitId: 'gp', unitLabel: 'gp', amount: 2 },
    { unitId: 'sp', unitLabel: 'sp', amount: 5 },
  ]);
  assert.ok(
    share.every((entry) => entry.amount !== 0),
    'a zero row would draw a coin nobody paid'
  );
});

test('every decomposition sums back to the amount it came from', () => {
  const profile = coinLadder();
  for (const amount of [1, 9, 10, 99, 100, 101, 999, 1000, 15_003, 123_456]) {
    const total = decomposeBaseAmount(amount, profile, 'cp').reduce(
      (sum, entry) => sum + entry.amount * profile.metadata.get(entry.unitId).baseValue,
      0
    );
    assert.equal(total, amount, `${amount} did not sum back`);
  }
});

test('nothing to decompose answers nothing at all', () => {
  const profile = coinLadder();
  assert.deepEqual(decomposeBaseAmount(0, profile, 'cp'), []);
  assert.deepEqual(decomposeBaseAmount(-5, profile, 'cp'), []);
  assert.deepEqual(decomposeBaseAmount(NaN, profile, 'cp'), []);
  assert.deepEqual(decomposeBaseAmount(undefined, profile, 'cp'), []);
});

test('a base unit this world does not run answers nothing rather than inventing a coin', () => {
  assert.deepEqual(decomposeBaseAmount(500, coinLadder(), 'shells'), []);
  assert.deepEqual(decomposeBaseAmount(500, { units: [], metadata: new Map() }, 'cp'), []);
  assert.deepEqual(decomposeBaseAmount(500, null, 'cp'), []);
});

test('a SECOND ladder in the same world cannot bleed into the first one`s change', () => {
  // `currencyTotalForBase` filters on `baseUnitId` for the same reason, and the two must agree:
  // a world running coins beside trade-bars must not pay a copper cost in bars.
  const profile = coinLadder();
  profile.units.push({ id: 'bar', abbreviation: 'bar' });
  profile.metadata.set('bar', { baseUnitId: 'shard', baseValue: 500 });
  assert.deepEqual(decomposeBaseAmount(15_000, profile, 'cp'), [
    { unitId: 'gp', unitLabel: 'gp', amount: 150 },
  ]);
});

test('the label is the unit`s own display chain, not its id', () => {
  const profile = coinLadder();
  // `abbreviation` wins; a unit with none falls to `label`, and one with neither to its `id` —
  // the chain `currencyUnitDisplayName` owns, so a coin is named the same here as everywhere else.
  profile.units = [{ id: 'crown', label: 'Crowns' }, { id: 'bit' }];
  profile.metadata = new Map([
    ['crown', { baseUnitId: 'bit', baseValue: 12 }],
    ['bit', { baseUnitId: 'bit', baseValue: 1 }],
  ]);
  assert.deepEqual(decomposeBaseAmount(25, profile, 'bit'), [
    { unitId: 'crown', unitLabel: 'Crowns', amount: 2 },
    { unitId: 'bit', unitLabel: 'bit', amount: 1 },
  ]);
});

test('two denominations of EQUAL value break the tie the way the spend ladder breaks it', () => {
  // `buildSpendLadders` sorts descending by value, then by id. A decomposition that chose
  // differently would have a world paying in one coin and reporting in another.
  const profile = {
    units: [
      { id: 'zenith', abbreviation: 'z' },
      { id: 'apex', abbreviation: 'a' },
      { id: 'bit', abbreviation: 'b' },
    ],
    metadata: new Map([
      ['zenith', { baseUnitId: 'bit', baseValue: 10 }],
      ['apex', { baseUnitId: 'bit', baseValue: 10 }],
      ['bit', { baseUnitId: 'bit', baseValue: 1 }],
    ]),
  };
  assert.deepEqual(decomposeBaseAmount(23, profile, 'bit'), [
    { unitId: 'apex', unitLabel: 'a', amount: 2 },
    { unitId: 'bit', unitLabel: 'b', amount: 3 },
  ]);
});

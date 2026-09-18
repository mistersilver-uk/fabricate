/** Direct proof for the shared ratchet in `tests/helpers/ratchetBaseline.js` (issue 1391). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertRatchet, ratchetFindings, tallyByKey } from './helpers/ratchetBaseline.js';

/** A three-row baseline totalling six, small enough to reason about by eye. */
const BASELINE = Object.freeze([
  Object.freeze({ key: 'a.css height 40', count: 3 }),
  Object.freeze({ key: 'b.svelte height 36', count: 2 }),
  Object.freeze({ key: 'c.svelte min-height 32', count: 1 }),
]);

/** The clean observation: exactly the baseline. */
const clean = () =>
  new Map([
    ['a.css height 40', 3],
    ['b.svelte height 36', 2],
    ['c.svelte min-height 32', 1],
  ]);

/** Run the ratchet over `observed`, with everything else healthy. */
const run = (observed, overrides = {}) =>
  assertRatchet({
    label: 'retired heights',
    baseline: BASELINE,
    pinnedTotal: 6,
    observed,
    scanned: 900,
    floor: 800,
    guidance: 'pick a rung from the published ladder',
    ...overrides,
  });

test('a baseline that matches the tree passes and reports its total', () => {
  assert.deepEqual(run(clean()), { total: 6 });
});

test('a new key fails as new debt', () => {
  const observed = clean().set('d.svelte height 40', 1);
  assert.throws(() => run(observed), {
    message: /APPEARED[\s\S]*d\.svelte height 40 \(1x, not in the baseline\)/,
  });
  // The guidance travels with the failure: a gate that only says "no" makes the reader guess.
  assert.throws(() => run(observed), { message: /pick a rung from the published ladder/ });
});

test('an existing key that grows fails, which a per-file total would absorb', () => {
  assert.throws(() => run(clean().set('a.css height 40', 4)), {
    message: /GREW[\s\S]*a\.css height 40 \(3x pinned, 4x found\)/,
  });
});

test('paying debt down without banking it fails, and says so in the other direction', () => {
  assert.throws(() => run(clean().set('a.css height 40', 2)), {
    message: /SHRANK[\s\S]*Bank it[\s\S]*a\.css height 40 \(3x pinned, 2x found\)/,
  });
});

test('a baseline row that no longer exists fails as a stale permission', () => {
  const observed = clean();
  observed.delete('c.svelte min-height 32');
  assert.throws(() => run(observed), {
    message: /VANISHED[\s\S]*c\.svelte min-height 32 \(1x pinned, none found\)/,
  });
});

test('every discrepancy is reported at once, not one run at a time', () => {
  const observed = clean();
  observed.set('a.css height 40', 4);
  observed.set('d.svelte height 32', 1);
  observed.delete('c.svelte min-height 32');

  // A ratchet is edited in bulk. Reporting the first finding turns one fix into three runs, and
  // hides from the reader that the third change is a payment they were entitled to bank.
  assert.throws(() => run(observed), {
    message: /APPEARED[\s\S]*GREW[\s\S]*VANISHED/,
  });
});

test('a pinned total that disagrees with the sum fails before anything is compared', () => {
  // Deliberately with a CLEAN observation: this must fail on the baseline's own arithmetic, so a
  // row edited without updating the headline cannot ride along on a green tree.
  assert.throws(() => run(clean(), { pinnedTotal: 7 }), {
    message: /holds 6 across 3 keys but the pinned total says 7/,
  });
});

test('a scan that looked at almost nothing fails instead of reporting a clean tree', () => {
  assert.throws(() => run(clean(), { scanned: 12 }), {
    message: /only 12 candidates, below the floor of 800[\s\S]*broken scan reported as a clean tree/,
  });
});

test('a malformed or duplicated baseline row is rejected rather than half-counted', () => {
  const duplicated = [...BASELINE, { key: 'a.css height 40', count: 1 }];
  assert.throws(() => run(clean(), { baseline: duplicated }), {
    message: /"a\.css height 40" appears twice/,
  });
  assert.throws(() => run(clean(), { baseline: [{ key: '', count: 1 }] }), {
    message: /non-empty string `key`/,
  });
  assert.throws(() => run(clean(), { baseline: [{ key: 'a', count: 0 }] }), {
    message: /needs a positive integer `count`/,
  });
});

test('the four categories are separable without parsing a message', () => {
  const found = ratchetFindings(
    new Map([
      ['kept', 1],
      ['grown', 1],
      ['shrunk', 2],
      ['gone', 1],
    ]),
    new Map([
      ['kept', 1],
      ['grown', 2],
      ['shrunk', 1],
      ['new', 1],
    ])
  );

  assert.deepEqual(found.appeared, ['new (1x, not in the baseline)']);
  assert.deepEqual(found.grew, ['grown (1x pinned, 2x found)']);
  assert.deepEqual(found.shrank, ['shrunk (2x pinned, 1x found)']);
  assert.deepEqual(found.vanished, ['gone (1x pinned, none found)']);
});

test('tallying counts repeats rather than collapsing them', () => {
  // Counted, not set-valued, for the reason `manager-button-source-contract.test.js` gives:
  // deleting one of two identical probes must not be silently absorbed.
  const counts = tallyByKey(
    [{ file: 'a' }, { file: 'b' }, { file: 'a' }],
    (entry) => entry.file
  );
  assert.deepEqual([...counts], [
    ['a', 2],
    ['b', 1],
  ]);
});

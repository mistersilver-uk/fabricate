/**
 * The design-system programme's closing ratchet: the two `target` populations that must reach
 * zero (issue 1776, epic 1495 rule 2).
 *
 * Library names are derived as `parseDesignLibrary(readDesignLibrary()).blocks` flattened to their
 * `perNameStatus` entries reading `target`, keyed on the name — 59 at `dd1eae56`.
 * Manifest rows are `DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.status === 'target')`, keyed on
 * the implementation path — 46 at `dd1eae56`.
 *
 * Two registers rather than two views of one: 24 manifest rows name no library entry, so one
 * status flip lowers one key, both, or neither.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DESIGN_SYSTEM_PRIMITIVES } from '../../scripts/lib/designSystemPrimitives.js';
import { parseDesignLibrary, readDesignLibrary } from '../helpers/designLibrary.js';
import { assertRatchet, tallyByKey } from '../helpers/ratchetBaseline.js';

import {
  TARGET_LIBRARY_NAMES,
  TARGET_LIBRARY_NAME_TOTAL,
  TARGET_MANIFEST_ROWS,
  TARGET_MANIFEST_ROW_TOTAL,
} from './design-system-target-baseline.js';

const library = parseDesignLibrary(readDesignLibrary());

/** Every library name whose own `data-status-<Name>` reads `target`, one occurrence each. */
function observedLibraryNames() {
  const names = library.blocks
    .flatMap((block) => Object.entries(block.perNameStatus))
    .filter(([, status]) => status === 'target')
    .map(([name]) => name);
  return tallyByKey(names, (name) => name);
}

/** Every manifest row whose `status` reads `target`, keyed on its implementation path. */
function observedManifestRows() {
  return tallyByKey(
    DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.status === 'target'),
    (row) => row.path
  );
}

/**
 * The library half of the ratchet. Called by both the gate and its control, so deleting the call
 * below reds the control too.
 */
function pinLibraryNames(observed) {
  return assertRatchet({
    label: 'library entries at `target`',
    baseline: TARGET_LIBRARY_NAMES,
    pinnedTotal: TARGET_LIBRARY_NAME_TOTAL,
    observed,
    scanned: library.names.length,
    floor: 60,
    guidance:
      'This is the programme-closing count, and it only goes down. A name flips to `shipped` when ' +
      'its API and geometry match the specimen and a View Lab case draws it, or to `divergent` on ' +
      'a maintainer decision carrying its issue; either way the flip deletes that row and lowers ' +
      'the pinned total in the same commit. A new row means a new entry was written at `target`, ' +
      'which is legitimate only when the entry is new — it owes a stated reason on the issue, not ' +
      'a silent append here. Building one name in a multi-name block lowers one row, not the block.',
  });
}

/** @see pinLibraryNames */
function pinManifestRows(observed) {
  return assertRatchet({
    label: 'manifest rows at `target`',
    baseline: TARGET_MANIFEST_ROWS,
    pinnedTotal: TARGET_MANIFEST_ROW_TOTAL,
    observed,
    scanned: DESIGN_SYSTEM_PRIMITIVES.length,
    floor: 50,
    guidance:
      'Keyed on the implementation PATH, so a move re-keys the row rather than retiring it: delete ' +
      'the old key and add the new one, leaving the pinned total alone. A row reaches `shipped` on ' +
      'the same bar as a library name and is deleted here when it does. A promotion into a ' +
      'primitive directory arrives as a new row at `target`, and the promoting change says so.',
  });
}

/** One key removed and one invented, so a pin has to report both directions at once. */
function swapOneKey(observed) {
  const mutated = new Map(observed);
  const [removed] = mutated.keys();
  mutated.delete(removed);
  mutated.set('no-such-entry-1776', 1);
  return { mutated, removed };
}

/** Prove the pin is load-bearing by perturbing what it reads, not by re-reading the baseline. */
function assertPinRedsOnSwap(pin, observed) {
  const { mutated, removed } = swapOneKey(observed);
  assert.ok(
    !mutated.has(removed) && mutated.has('no-such-entry-1776'),
    `the control neither removed ${removed} nor added its stand-in, so it perturbed nothing and ` +
      'the throw below would prove the pin still works when it may not'
  );
  assert.throws(
    () => pin(mutated),
    (error) => error.message.includes('VANISHED') && error.message.includes('APPEARED'),
    'the pin accepted a swapped key, so a net-zero trade would pass and the count would stop ' +
      'describing the tree'
  );
}

test('every library entry still at `target` is the pinned set', () => {
  assert.equal(pinLibraryNames(observedLibraryNames()).total, TARGET_LIBRARY_NAME_TOTAL);
});

test('every manifest row still at `target` is the pinned set', () => {
  assert.equal(pinManifestRows(observedManifestRows()).total, TARGET_MANIFEST_ROW_TOTAL);
});

test('the library pin reds when one name is traded for another', () => {
  assertPinRedsOnSwap(pinLibraryNames, observedLibraryNames());
});

test('the manifest pin reds when one row is traded for another', () => {
  assertPinRedsOnSwap(pinManifestRows, observedManifestRows());
});

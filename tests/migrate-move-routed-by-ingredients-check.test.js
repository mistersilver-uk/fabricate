/**
 * Tests for the 1.10.0 migration
 * (src/migration/migrateMoveRoutedByIngredientsCheck.js): move a
 * `routedByIngredients` system's optional pass/fail crafting-check config from the
 * shared `craftingCheck.routed` slot to the shared `craftingCheck.simple` slot.
 *
 * Covers: the move (rollFormula/dc/thresholdMode/tiers/checkBreakage routed → simple),
 * the routed slot cleared afterwards, tier-id preservation, the unauthored-simple
 * guard (no clobber of an authored simple check), idempotency, non-routedByIngredients
 * systems untouched, raw un-normalized input handling, and purity.
 *
 * node:test + node:assert/strict. Pure function; no Foundry globals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateMoveRoutedByIngredientsCheck } from '../src/migration/migrateMoveRoutedByIngredientsCheck.js';

function riSystem(craftingCheck, { id = 'sys-ri', name = 'RI Sys' } = {}) {
  return { id, name, resolutionMode: 'routedByIngredients', craftingCheck };
}

function migrate(systems) {
  return migrateMoveRoutedByIngredientsCheck({ systems });
}

// --- The move ---------------------------------------------------------------

test('moves the pass/fail fields routed → simple for a routedByIngredients system', () => {
  const out = migrate([
    riSystem({
      simple: {},
      routed: {
        rollFormula: '1d20+4',
        dc: 14,
        thresholdMode: 'exceed',
        tiers: [{ id: 'tier-hard', name: 'Hard', dc: 20 }],
        checkBreakage: { triggers: [{ id: 't1' }] },
        type: 'fixed',
        relativeOutcomes: [{ id: 'x' }],
        fixedOutcomes: [{ id: 'y' }],
      },
    }),
  ]);
  const check = out.systems[0].craftingCheck;
  assert.equal(check.simple.rollFormula, '1d20+4');
  assert.equal(check.simple.dc, 14);
  assert.equal(check.simple.thresholdMode, 'exceed');
  assert.deepEqual(check.simple.tiers, [{ id: 'tier-hard', name: 'Hard', dc: 20 }]);
  assert.deepEqual(check.simple.checkBreakage, { triggers: [{ id: 't1' }] });
});

test('preserves tier ids so recipe checkTierId references keep resolving', () => {
  const out = migrate([
    riSystem({
      simple: {},
      routed: {
        rollFormula: '1d20',
        tiers: [
          { id: 'tier-a', name: 'A', dc: 10 },
          { id: 'tier-b', name: 'B', dc: 18 },
        ],
      },
    }),
  ]);
  const ids = out.systems[0].craftingCheck.simple.tiers.map((t) => t.id);
  assert.deepEqual(ids, ['tier-a', 'tier-b']);
});

test('clears the moved config from the routed slot (rollFormula empty; tier-routing fields dropped)', () => {
  const out = migrate([
    riSystem({
      simple: {},
      routed: {
        rollFormula: '1d20',
        dc: 12,
        thresholdMode: 'meet',
        tiers: [{ id: 't', dc: 9 }],
        checkBreakage: { triggers: [] },
        type: 'relative',
        relativeOutcomes: [{ id: 'r' }],
        fixedOutcomes: [],
      },
    }),
  ]);
  const routed = out.systems[0].craftingCheck.routed;
  assert.equal(routed.rollFormula, '', 'routed formula is cleared after the move');
  assert.equal('dc' in routed, false);
  assert.equal('thresholdMode' in routed, false);
  assert.equal('tiers' in routed, false);
  assert.equal('checkBreakage' in routed, false);
  assert.equal('type' in routed, false);
  assert.equal('relativeOutcomes' in routed, false);
  assert.equal('fixedOutcomes' in routed, false);
});

// --- Guards -----------------------------------------------------------------

test('does NOT clobber a GM-authored simple check', () => {
  const out = migrate([
    riSystem({
      simple: { rollFormula: '2d6+1', dc: 8 },
      routed: { rollFormula: '1d20', dc: 30 },
    }),
  ]);
  const check = out.systems[0].craftingCheck;
  assert.equal(check.simple.rollFormula, '2d6+1', 'authored simple check is preserved');
  assert.equal(check.simple.dc, 8);
  assert.equal(check.routed.rollFormula, '1d20', 'routed left intact when simple is authored');
});

test('no-op when the routed slot has no authored formula', () => {
  const input = [riSystem({ simple: {}, routed: { rollFormula: '', dc: 12 } })];
  const before = JSON.stringify(input);
  const out = migrate(input);
  assert.equal(JSON.stringify(out.systems), before, 'nothing moved when routed is unauthored');
});

test('leaves non-routedByIngredients systems untouched', () => {
  const input = [
    { id: 'rc', resolutionMode: 'routedByCheck', craftingCheck: { simple: {}, routed: { rollFormula: '1d20', dc: 15 } } },
    { id: 's', resolutionMode: 'simple', craftingCheck: { simple: {}, routed: { rollFormula: '1d20', dc: 15 } } },
  ];
  const before = JSON.stringify(input);
  const out = migrate(input);
  assert.equal(JSON.stringify(out.systems), before);
});

// --- Idempotency + raw shape + purity ---------------------------------------

test('is idempotent (a second run over migrated data no-ops)', () => {
  const first = migrate([
    riSystem({ simple: {}, routed: { rollFormula: '1d20', dc: 12 } }),
  ]);
  const afterFirst = JSON.stringify(first.systems);
  const second = migrateMoveRoutedByIngredientsCheck({ systems: first.systems });
  assert.equal(JSON.stringify(second.systems), afterFirst, 're-run changes nothing');
});

test('operates on the raw un-normalized shape (no assumed defaults; copies only present fields)', () => {
  // Raw persisted routed slot with ONLY a formula — no dc/tiers/thresholdMode.
  const out = migrate([riSystem({ simple: {}, routed: { rollFormula: '1d20' } })]);
  const simple = out.systems[0].craftingCheck.simple;
  assert.equal(simple.rollFormula, '1d20');
  assert.equal('dc' in simple, false, 'absent dc is not fabricated');
  assert.equal('tiers' in simple, false, 'absent tiers is not fabricated');
});

test('is pure: does not mutate the input systems', () => {
  const input = [riSystem({ simple: {}, routed: { rollFormula: '1d20', dc: 12 } })];
  const snapshot = JSON.stringify(input);
  migrate(input);
  assert.equal(JSON.stringify(input), snapshot, 'input is cloned, not mutated');
});

test('non-array systems payload is returned untouched', () => {
  const out = migrateMoveRoutedByIngredientsCheck({ systems: undefined });
  assert.equal(out.systems, undefined);
});

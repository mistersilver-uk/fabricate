/**
 * What a trigger says about itself (issue 1096).
 *
 * The card was headed by the word `When` — the label of its first `<select>` — so a list of
 * three triggers read `When`, `When`, `When`. These pin the composed sentence for every
 * condition shape and every combination of the three independent effects, because a summary
 * that disagreed with the controls under it would be worse than no summary at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { interpolate } from '../src/ui/svelte/apps/manager/checks/checksCopy.js';
import {
  summariseCondition,
  summariseEffect,
} from '../src/ui/svelte/apps/manager/checks/checkTriggerSummary.js';

const GROUPS = [
  { groupId: 0, label: '2d6', sides: 6 },
  { groupId: 1, label: '1d20', sides: 20 },
];
const TIER_NAMES = { 'tier-a': 'Masterwork', 'tier-b': 'Ruined' };

/** Resolve a fragment the way the component does, through its fallbacks. */
function render(fragment) {
  const data = Object.fromEntries(
    Object.entries(fragment.data ?? {}).map(([key, entry]) => [
      key,
      entry && typeof entry === 'object' ? entry.fallback : entry,
    ])
  );
  return interpolate(fragment.fallback, data);
}

test('a dice-group condition names the die, the aggregate and the comparison', () => {
  const summary = summariseCondition(
    { type: 'diceGroup', groupId: 1, aggregate: 'total', operator: '==', value: 20 },
    { diceGroups: GROUPS }
  );
  assert.equal(render(summary), 'Group total of 1d20 is exactly 20');
});

test('it names the group it actually watches, not the first one', () => {
  const summary = summariseCondition(
    { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '>=', value: 5 },
    { diceGroups: GROUPS }
  );
  assert.equal(render(summary), 'Any die of 2d6 is at least 5');
});

test('every operator has a WORD, never the raw symbol', () => {
  for (const [operator, word] of [
    ['==', 'exactly'],
    ['<=', 'at most'],
    ['>=', 'at least'],
    ['<', 'under'],
    ['>', 'over'],
  ]) {
    const summary = summariseCondition({ type: 'rollTotal', operator, value: 15 });
    assert.equal(render(summary), `Roll total is ${word} 15`);
  }
  assert.equal(
    render(summariseCondition({ type: 'rollTotal', operator: 'nonsense', value: 15 })),
    'Roll total is exactly 15',
    'an unknown operator reads as a sentence rather than leaking the token'
  );
});

test('a progressive-value condition says VALUE, not total', () => {
  assert.equal(
    render(summariseCondition({ type: 'progressiveValue', operator: '>=', value: 12 })),
    'Rolled value is at least 12'
  );
});

test('an outcome-tier condition names its tiers, and says so when it names none', () => {
  assert.equal(
    render(
      summariseCondition({ type: 'outcomeTier', tierIds: ['tier-a', 'tier-b'] }, { tierNames: TIER_NAMES })
    ),
    'Outcome tier is Masterwork, Ruined'
  );
  assert.equal(
    render(summariseCondition({ type: 'outcomeTier', tierIds: [] }, { tierNames: TIER_NAMES })),
    'No outcome tier chosen',
    'an empty tier list matches nothing, and the readiness pass raises the same state'
  );
});

test('the effect sentence collects EVERY effect in force, not the first', () => {
  const clauses = summariseEffect(
    {
      outcome: 'failure',
      breakTools: true,
      tierStep: { mode: 'down', steps: 2, tierId: null },
    },
    { showBreakTools: true }
  );
  assert.deepEqual(clauses.map(render), [
    'the check is an automatic failure',
    'the result steps down 2 tier(s)',
    'the required tools break',
  ]);
});

test('tool breakage is stated only where the AUTHORITY lets it run', () => {
  const trigger = { outcome: 'none', breakTools: true, tierStep: { mode: 'none' } };
  assert.deepEqual(summariseEffect(trigger, { showBreakTools: false }).map(render), [
    'nothing changes',
  ]);
  assert.deepEqual(summariseEffect(trigger, { showBreakTools: true }).map(render), [
    'the required tools break',
  ]);
});

test('a progressive check awards rather than passing, and the sentence says so', () => {
  assert.deepEqual(
    summariseEffect({ outcome: 'success', tierStep: { mode: 'none' } }, { progressive: true }).map(
      render
    ),
    ['every result is awarded']
  );
  assert.deepEqual(
    summariseEffect({ outcome: 'failure', tierStep: { mode: 'none' } }, { progressive: true }).map(
      render
    ),
    ['no result is awarded']
  );
});

test('a targeted step names the tier, and says when the target is not set', () => {
  assert.deepEqual(
    summariseEffect(
      { outcome: 'none', tierStep: { mode: 'target', tierId: 'tier-a' } },
      { tierNames: TIER_NAMES }
    ).map(render),
    ['the result becomes Masterwork']
  );
  assert.deepEqual(
    summariseEffect(
      { outcome: 'none', tierStep: { mode: 'target', tierId: 'gone' } },
      { tierNames: TIER_NAMES }
    ).map(render),
    ['the result becomes a tier that is not set']
  );
});

test('a trigger that does nothing SAYS it does nothing', () => {
  assert.deepEqual(
    summariseEffect({ outcome: 'none', breakTools: false, tierStep: { mode: 'none' } }).map(render),
    ['nothing changes']
  );
});

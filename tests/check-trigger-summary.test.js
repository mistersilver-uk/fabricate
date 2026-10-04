/** What a trigger says about itself (issue 1096). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { interpolate } from '../src/ui/svelte/apps/manager/checks/checksCopy.js';
import {
  summariseCondition,
  summariseEffect,
  summariseRule,
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

test('a counting check names its total net successes, and a summing one keeps the roll total', () => {
  const condition = { type: 'rollTotal', operator: '<', value: 0 };
  assert.equal(render(summariseCondition(condition, { counting: true })), 'Net successes is under 0');
  assert.equal(render(summariseCondition(condition, { counting: false })), 'Roll total is under 0');
  assert.equal(render(summariseCondition(condition)), 'Roll total is under 0');
  assert.equal(
    render(
      summariseCondition(
        { type: 'diceGroup', groupId: 0, aggregate: 'allDice', operator: '==', value: 1 },
        { counting: true, diceGroups: [{ groupId: 0, label: 'd10', sides: 10 }] }
      )
    ),
    'All dice of d10 is exactly 1',
    'only the total changes its subject'
  );
});

const EN = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], EN);

/** Every condition shape, so each in-sentence key the summary can name is reached. */
const CONDITIONS = [
  ...['total', 'anyDie', 'allDice', 'lowestDie', 'highestDie'].map((aggregate) => [
    { type: 'diceGroup', groupId: 1, aggregate, operator: '==', value: 1 },
    {},
  ]),
  [{ type: 'progressiveValue', operator: '>=', value: 3 }, {}],
  [{ type: 'outcomeTier', tierIds: ['tier-a'] }, {}],
  [{ type: 'outcomeTier', tierIds: [] }, {}],
  [{ type: 'rollTotal', operator: '<', value: 0 }, { counting: true }],
  [{ type: 'rollTotal', operator: '<', value: 0 }, {}],
];

test('mid-sentence casing is its own key, translated lower case, never a lowered string', () => {
  for (const [condition, context] of CONDITIONS) {
    const summary = summariseCondition(condition, {
      diceGroups: GROUPS,
      tierNames: TIER_NAMES,
      ...context,
      inSentence: true,
    });
    assert.equal(lookup(summary.key), summary.fallback, `${summary.key} is in lang/en.json`);
    for (const entry of Object.values(summary.data)) {
      if (!entry?.key) continue;
      assert.equal(lookup(entry.key), entry.fallback, `${entry.key} is in lang/en.json`);
    }
    assert.ok(summary.key.endsWith('InSentence'), `${summary.key} is the in-sentence key`);
    assert.match(render(summary), /^[^A-Z]/u, `${render(summary)} opens lower case mid-sentence`);
  }
});

test('the rule sentence names its frame, its join and one clause key per effect in force', () => {
  const rule = summariseRule(
    {
      condition: { type: 'outcomeTier', tierIds: ['tier-a'] },
      outcome: 'none',
      breakTools: true,
      tierStep: { mode: 'target', tierId: 'tier-b' },
    },
    { tierNames: TIER_NAMES, showBreakTools: true }
  );
  const namespace = 'FABRICATE.Admin.Manager.Checks.Breakage.';
  assert.equal(rule.frameKey, `${namespace}SummarySentence`);
  assert.equal(rule.joinKey, `${namespace}SummaryJoin`);
  assert.deepEqual(rule.clauseKeys, [`${namespace}SummaryStepTarget`, `${namespace}SummaryBreakTools`]);
  assert.deepEqual(rule.params[rule.frameKey], {
    condition: {
      key: `${namespace}SummaryOutcomeTierInSentence`,
      params: { tiers: 'Masterwork' },
    },
  });
  assert.deepEqual(rule.params[`${namespace}SummaryStepTarget`], { tier: 'Ruined' });
  assert.match(lookup(rule.frameKey), /\{clauses\}/u, 'the frame takes the joined clauses');
});

test('an unset step target is a translated fragment, not English pinned in the summary', () => {
  const rule = summariseRule({ condition: {}, tierStep: { mode: 'target', tierId: 'gone' } });
  const { tier } = rule.params['FABRICATE.Admin.Manager.Checks.Breakage.SummaryStepTarget'];
  assert.deepEqual(tier, {
    key: 'FABRICATE.Admin.Manager.Checks.Breakage.SummaryStepTargetUnset',
    params: {},
  });
});

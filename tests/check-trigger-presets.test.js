/**
 * The common-trigger presets (issue 1096). The load-bearing claim is not that a preset appears — it
 * is that **a preset authors an ORDINARY trigger**.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCheckBreakageCondition } from '../src/toolBreakageRuntime.js';
import { interpolate } from '../src/ui/svelte/apps/manager/checks/checksCopy.js';
import {
  buildPresetTrigger,
  checkTriggerPresets,
  countPoolDiceGroup,
  presetPolarity,
  triggerDiceGroups,
} from '../src/ui/svelte/apps/manager/checks/checkTriggerPresets.js';

const D20 = [{ groupId: 0, label: '1d20', sides: 20, count: 1 }];
const MIXED = [
  { groupId: 0, label: '2d6', sides: 6, count: 2 },
  { groupId: 1, label: '1d20', sides: 20, count: 1 },
];

const ids = (() => {
  let n = 0;
  return () => `preset-${(n += 1)}`;
})();

test('a routed preset authors a real tier-step trigger, field for field', () => {
  const trigger = buildPresetTrigger({
    presetId: 'high',
    kind: 'routed',
    diceGroups: D20,
    showBreakTools: false,
    newId: () => 'fixed-id',
  });
  assert.deepEqual(trigger, {
    id: 'fixed-id',
    condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 20 },
    outcome: 'none',
    breakTools: false,
    tierStep: { mode: 'up', steps: 1, tierId: null },
  });
});

test('the low preset is the same trigger against the worst face, stepping down', () => {
  const trigger = buildPresetTrigger({
    presetId: 'low',
    kind: 'routed',
    diceGroups: D20,
    newId: () => 'fixed-id',
  });
  assert.deepEqual(trigger, {
    id: 'fixed-id',
    condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
    outcome: 'none',
    breakTools: false,
    tierStep: { mode: 'down', steps: 1, tierId: null },
  });
});

test('a simple check gets a forced VERDICT, because it has no tiers to step', () => {
  const high = buildPresetTrigger({ presetId: 'high', kind: 'simple', diceGroups: D20, newId: ids });
  const low = buildPresetTrigger({ presetId: 'low', kind: 'simple', diceGroups: D20, newId: ids });
  assert.equal(high.outcome, 'success');
  assert.equal(low.outcome, 'failure');
  assert.deepEqual(high.tierStep, { mode: 'none', steps: 1, tierId: null });
  assert.deepEqual(low.tierStep, { mode: 'none', steps: 1, tierId: null });
});

test('a progressive check gets the same verdict shape, which is award-all / award-none', () => {
  const high = buildPresetTrigger({
    presetId: 'high',
    kind: 'progressive',
    diceGroups: D20,
    newId: ids,
  });
  assert.equal(high.outcome, 'success');
  assert.deepEqual(high.tierStep, { mode: 'none', steps: 1, tierId: null });
});

test('the preset is INDISTINGUISHABLE from a hand-added trigger', () => {
  // `CheckTriggers.addTrigger`'s shape, restated here rather than imported: this file must
  // fail if the editor's own default drifts away from the preset's, and importing the same
  // constant from both sides would make the comparison vacuous.
  const handAdded = {
    id: 'x',
    condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
    outcome: 'none',
    breakTools: true,
    tierStep: { mode: 'none', steps: 1, tierId: null },
  };
  const preset = buildPresetTrigger({
    presetId: 'low',
    kind: 'simple',
    diceGroups: D20,
    showBreakTools: true,
    newId: () => 'x',
  });
  assert.deepEqual(
    Object.keys(preset).sort(),
    Object.keys(handAdded).sort(),
    'a preset trigger carries exactly the fields a hand-added one carries — no marker, no id'
  );
  assert.equal(preset.breakTools, handAdded.breakTools, 'it honours the breakage authority');
});

test('the presets name the leading d20, not merely the first group', () => {
  const offered = checkTriggerPresets({ kind: 'routed', diceGroups: MIXED });
  assert.deepEqual(
    offered.map((preset) => preset.data.die),
    ['1d20', '1d20'],
    '"a natural 20" means the d20, and index order alone would pick the 2d6'
  );
  const trigger = buildPresetTrigger({
    presetId: 'high',
    kind: 'routed',
    diceGroups: MIXED,
    newId: ids,
  });
  assert.equal(trigger.condition.groupId, 1);
  assert.equal(trigger.condition.value, 20);
});

test('a formula that rolls no dice is offered NO preset, rather than a broken one', () => {
  assert.deepEqual(checkTriggerPresets({ kind: 'routed', diceGroups: [] }), []);
  assert.equal(
    buildPresetTrigger({ presetId: 'high', kind: 'routed', diceGroups: [], newId: ids }),
    null,
    'a preset pointing at a group that does not exist would author a condition matching nothing'
  );
});

test('an unknown preset id builds nothing', () => {
  assert.equal(
    buildPresetTrigger({ presetId: 'sideways', kind: 'routed', diceGroups: D20, newId: ids }),
    null
  );
});

test('the offered labels carry the die and the faces they promise', () => {
  const [high, low] = checkTriggerPresets({ kind: 'routed', diceGroups: D20 });
  assert.equal(high.data.face, '20');
  assert.equal(low.data.face, '1');
  assert.equal(high.data.effect.fallback, 'step up a tier');
  assert.equal(low.data.effect.fallback, 'step down a tier');
});

// ── Preset polarity (issue 2005): the best face follows the check's direction ──────────────
const OVER = { product: 'sum', direction: 'over' };
const UNDER = { product: 'sum', direction: 'under' };
const COUNT_OVER = { product: 'count', direction: 'over' };
const COUNT_UNDER = { product: 'count', direction: 'under' };

test('presetPolarity names the best face: low under, high over, for sums and counts', () => {
  assert.equal(presetPolarity(OVER), 'high');
  assert.equal(presetPolarity(UNDER), 'low');
  assert.equal(presetPolarity(COUNT_OVER), 'high');
  assert.equal(presetPolarity(COUNT_UNDER), 'low');
  assert.equal(presetPolarity(null), 'high', 'an absent evaluation is the legacy roll-high check');
  assert.equal(presetPolarity({}), 'high');
});

test('a roll-under best preset fires on face 1 and its worst preset on the maximum', () => {
  const best = buildPresetTrigger({
    presetId: 'high',
    kind: 'routed',
    diceGroups: D20,
    newId: () => 'b',
    evaluation: UNDER,
  });
  const worst = buildPresetTrigger({
    presetId: 'low',
    kind: 'routed',
    diceGroups: D20,
    newId: () => 'w',
    evaluation: UNDER,
  });
  assert.equal(best.condition.value, 1, 'the best face under is 1');
  assert.deepEqual(best.tierStep, { mode: 'up', steps: 1, tierId: null }, 'and it still helps');
  assert.equal(worst.condition.value, 20, 'the worst face under is the maximum');
  assert.deepEqual(worst.tierStep, { mode: 'down', steps: 1, tierId: null });
  const [high, low] = checkTriggerPresets({ kind: 'routed', diceGroups: D20, evaluation: UNDER });
  assert.deepEqual([high.data.face, low.data.face], ['1', '20']);
});

test('a counted check keeps the net ranking: the best preset still helps in both directions', () => {
  for (const evaluation of [COUNT_OVER, COUNT_UNDER]) {
    const best = buildPresetTrigger({
      presetId: 'high',
      kind: 'routed',
      diceGroups: D20,
      newId: () => 'c',
      evaluation: { ...evaluation, pool: { die: 20 } },
    });
    assert.deepEqual(best.tierStep, { mode: 'up', steps: 1, tierId: null }, evaluation.direction);
    assert.equal(best.condition.value, evaluation.direction === 'under' ? 1 : 20);
  }
});

test('a roll-high evaluation authors exactly the legacy trigger, field for field', () => {
  for (const presetId of ['high', 'low']) {
    for (const kind of ['routed', 'simple', 'progressive']) {
      const legacy = buildPresetTrigger({ presetId, kind, diceGroups: MIXED, newId: () => 'x' });
      const over = buildPresetTrigger({
        presetId,
        kind,
        diceGroups: MIXED,
        newId: () => 'x',
        evaluation: OVER,
      });
      assert.deepEqual(over, legacy, `${presetId}/${kind}`);
    }
  }
});

// ── Count presets (issue 2006, N13–N15): the pool's one group, Botch, labels with faces ─────────
const countEvaluation = ({ direction = 'over', die = 10, cancel = false } = {}) => ({
  product: 'count',
  direction,
  pool: { die, cancel: { enabled: cancel, faces: { kind: 'worst', value: null } } },
});

/** A preset's label as the component renders it, through its fallbacks. */
function label(preset) {
  const data = Object.fromEntries(
    Object.entries(preset.data).map(([key, entry]) => [key, entry?.fallback ?? entry])
  );
  return interpolate(preset.fallback, data);
}

const offeredLabels = (args) => checkTriggerPresets(args).map(label);

test('count presets read the pool, never the retained formula', () => {
  assert.deepEqual(countPoolDiceGroup(countEvaluation({ die: 6 })), {
    groupId: 0,
    raw: 'd6',
    count: null,
    sides: 6,
    label: 'd6',
  });
  assert.equal(countPoolDiceGroup({ product: 'sum', pool: { die: 6 } }), null);
  const evaluation = countEvaluation();
  for (const diceGroups of [[], D20, MIXED]) {
    assert.deepEqual(offeredLabels({ kind: 'routed', diceGroups, evaluation }), [
      'Any die shows its best face (10) → step up a tier',
      'Every die shows its worst face (1) → step down a tier',
    ]);
    const best = buildPresetTrigger({ presetId: 'high', kind: 'routed', diceGroups, evaluation, newId: ids });
    assert.deepEqual(best.condition, {
      type: 'diceGroup',
      groupId: 0,
      aggregate: 'anyDie',
      operator: '==',
      value: 10,
    });
  }
});

test('a simple count check fails on the worst face, and on a Botch only while cancelling', () => {
  assert.deepEqual(offeredLabels({ kind: 'simple', evaluation: countEvaluation() }), [
    'Every die shows its worst face (1) → automatic failure',
  ]);
  const evaluation = countEvaluation({ cancel: true });
  assert.deepEqual(offeredLabels({ kind: 'simple', evaluation }), [
    'Every die shows its worst face (1) → automatic failure',
    'Botch (net below zero) → automatic failure',
  ]);
  const build = (presetId) =>
    buildPresetTrigger({ presetId, kind: 'simple', evaluation, newId: () => presetId });
  assert.deepEqual(build('low'), {
    id: 'low',
    condition: { type: 'diceGroup', groupId: 0, aggregate: 'allDice', operator: '==', value: 1 },
    outcome: 'failure',
    breakTools: false,
    tierStep: { mode: 'none', steps: 1, tierId: null },
  });
  assert.deepEqual(build('botch'), {
    id: 'botch',
    condition: { type: 'rollTotal', operator: '<', value: 0 },
    outcome: 'failure',
    breakTools: false,
    tierStep: { mode: 'none', steps: 1, tierId: null },
  });
  assert.equal(build('high'), null, 'a simple count check has no best-face preset');
  assert.equal(
    buildPresetTrigger({ presetId: 'botch', kind: 'simple', evaluation: countEvaluation(), newId: ids }),
    null,
    'no cancel, no Botch'
  );
});

test('the Botch fires below zero and never at a net of zero', () => {
  const { condition } = buildPresetTrigger({
    presetId: 'botch',
    kind: 'simple',
    evaluation: countEvaluation({ cancel: true }),
    newId: ids,
  });
  const fires = (total) => evaluateCheckBreakageCondition(condition, { data: { total, diceGroups: [] } });
  assert.deepEqual([fires(-2), fires(-1), fires(0), fires(1)], [true, true, false, false]);
});

test('a routed count Botch targets the lowest tier, and is withheld with no tier to target', () => {
  const evaluation = countEvaluation({ cancel: true });
  assert.deepEqual(offeredLabels({ kind: 'routed', evaluation, lowestTierId: 't-ruined' }), [
    'Any die shows its best face (10) → step up a tier',
    'Every die shows its worst face (1) → step down a tier',
    'Botch (net below zero) → lowest tier',
  ]);
  assert.deepEqual(
    checkTriggerPresets({ kind: 'routed', evaluation }).map((preset) => preset.id),
    ['high', 'low'],
    'a Botch with no tier to send the roll to is not offered'
  );
  assert.deepEqual(
    buildPresetTrigger({
      presetId: 'botch',
      kind: 'routed',
      evaluation,
      lowestTierId: 't-ruined',
      showBreakTools: true,
      newId: () => 'b',
    }),
    {
      id: 'b',
      condition: { type: 'rollTotal', operator: '<', value: 0 },
      outcome: 'none',
      breakTools: true,
      tierStep: { mode: 'target', steps: 1, tierId: 't-ruined' },
    }
  );
  const worst = buildPresetTrigger({ presetId: 'low', kind: 'routed', evaluation, newId: ids });
  assert.deepEqual(worst.tierStep, { mode: 'down', steps: 1, tierId: null });
  assert.equal(worst.condition.aggregate, 'allDice');
});

test('a count/under pool is best on 1 and worst on its highest face', () => {
  const evaluation = countEvaluation({ direction: 'under', die: 20, cancel: true });
  assert.deepEqual(offeredLabels({ kind: 'routed', evaluation, lowestTierId: 't' }).slice(0, 2), [
    'Any die shows its best face (1) → step up a tier',
    'Every die shows its worst face (20) → step down a tier',
  ]);
  const worst = buildPresetTrigger({ presetId: 'low', kind: 'simple', evaluation, newId: ids });
  assert.equal(worst.condition.value, 20, 'the worst face under is the die size, never 1');
});

test('a progressive count check takes the simple list with the award copy', () => {
  assert.deepEqual(
    offeredLabels({ kind: 'progressive', evaluation: countEvaluation({ cancel: true }) }),
    ['Every die shows its worst face (1) → award nothing', 'Botch (net below zero) → award nothing']
  );
  const icons = checkTriggerPresets({ kind: 'simple', evaluation: countEvaluation({ cancel: true }) });
  assert.deepEqual(icons.map((preset) => preset.icon), ['fas fa-skull', 'fas fa-skull']);
});

test('a trigger reads the formula groups, a repeated one numbered, or a counting pool alone', () => {
  const text = (_key, fallback) => fallback;
  const groups = triggerDiceGroups({ rollFormula: '1d6 + 1d20 + 1d6' }, text);
  assert.deepEqual(
    groups.map(({ groupId, label, sides }) => [groupId, label, sides]),
    [
      [0, '1d6 #1', 6],
      [1, '1d20', 20],
      [2, '1d6 #2', 6],
    ]
  );
  const pool = { product: 'count', pool: { die: 10 } };
  assert.deepEqual(triggerDiceGroups({ evaluation: pool, rollFormula: '1d20 + 5' }, text), [
    countPoolDiceGroup(pool),
  ]);
});


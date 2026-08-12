/**
 * The common-trigger presets (issue 1096).
 *
 * The load-bearing claim is not that a preset appears — it is that **a preset authors an
 * ORDINARY trigger**. So every assertion here is against the exact object produced, field for
 * field, and one of them compares it to what `CheckTriggers.addTrigger` would have produced
 * from the same inputs: if the two ever diverge, "add this for me" has become a second kind of
 * trigger, which is the one outcome this feature must not have.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPresetTrigger,
  checkTriggerPresets,
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
  assert.equal(high.data.max, '20');
  assert.equal(low.data.min, '1');
  assert.equal(high.data.effect.fallback, 'step up a tier');
  assert.equal(low.data.effect.fallback, 'step down a tier');
});

/** The Checks route's per-activity words (issue 2006 moved them out of `ChecksView.svelte`). */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityWordFor,
  failurePolicyInertNote,
  recordNounFor,
  recordNounPluralFor,
  subsystemModeLabel,
} from '../src/ui/svelte/apps/manager/checks/checksActivityCopy.js';

const text = (_key, fallback) => fallback;

test('each activity names its records and itself in its own words', () => {
  assert.deepEqual(
    ['crafting', 'salvage', 'gathering', 'unknown'].map((activity) => [
      recordNounFor(activity, text),
      recordNounPluralFor(activity, text),
      activityWordFor(activity, text),
    ]),
    [
      ['recipe', 'Recipes', 'crafting'],
      ['salvageable item', 'Salvageable items', 'salvage'],
      ['gathering task', 'Gathering tasks', 'gathering'],
      ['recipe', 'Recipes', ''],
    ]
  );
});

test('an authored mode reads its picker words, and an unmapped one reads as itself', () => {
  assert.equal(subsystemModeLabel('crafting', 'routedByIngredients', text), 'Routed by ingredients');
  assert.equal(subsystemModeLabel('alchemy', 'none', text), 'No check');
  assert.equal(subsystemModeLabel('gathering', 'd100', text), 'd100 roll');
  assert.equal(subsystemModeLabel('salvage', 'future', text), 'future');
});

test('the failure policy states why it has no reach, and nothing where it applies', () => {
  const note = (input) => failurePolicyInertNote(input, text);
  assert.match(note({ activity: 'gathering', gatheringD100: true }), /d100 gathering roll/);
  assert.equal(note({ activity: 'gathering', gatheringD100: false }), '');
  assert.match(note({ activity: 'crafting', resolutionMode: 'routedByIngredients' }), /routed-by/);
  assert.match(note({ activity: 'salvage', salvageProgressive: true }), /progressive check/);
  assert.equal(note({ activity: 'crafting', resolutionMode: 'routedByCheck' }), '');
});

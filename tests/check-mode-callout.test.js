/**
 * The roll section's mode callout (issue 1096).
 *
 * The callout is MODE-AWARE, so the thing worth proving is not that `routedByCheck` reads
 * well — it is that every mode the studio can render has its own entry, that nothing invents
 * an entry for a mode nothing can select, and that gathering's two DORMANT modes are not
 * presented as live configurations.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  CHECK_MODE_KEYS,
  checkModeKey,
  describeCheckMode,
} from '../src/ui/svelte/apps/manager/checks/checkModeCallout.js';

const LANG = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));

/**
 * Every (activity, mode) pair the Checks Studio can render.
 *
 * Written out RATHER THAN derived from the module under test, so this list is an independent
 * statement of what the product supports: deriving it would make the exhaustiveness assertion
 * compare the module to itself and pass on any subset.
 */
const REACHABLE = [
  ['crafting', 'simple', ''],
  ['crafting', 'routedByIngredients', ''],
  ['crafting', 'routedByCheck', ''],
  ['crafting', 'progressive', ''],
  // No `['crafting', 'alchemy', 'none']`. That is the OFF state of an optional check, not a
  // mode: its route renders the shared switched-off panel, so the roll section — and this
  // callout with it — never renders. Leaving it listed would have made the "nothing can
  // select this" gate below pass over an entry nothing can select.
  ['crafting', 'alchemy', 'simple'],
  ['crafting', 'alchemy', 'tiered'],
  ['salvage', 'simple', ''],
  ['salvage', 'progressive', ''],
  ['salvage', 'routed', ''],
  ['gathering', 'd100', ''],
  ['gathering', 'progressive', ''],
  ['gathering', 'routed', ''],
];

function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), LANG);
}

test('every mode the studio can render is described', () => {
  for (const [activity, mode, alchemyCheckMode] of REACHABLE) {
    const described = describeCheckMode({ activity, mode, alchemyCheckMode, outcomeCount: 5 });
    assert.ok(
      described,
      `${activity}/${mode}${alchemyCheckMode ? `/${alchemyCheckMode}` : ''} has no callout, so ` +
        'the roll section would open with nothing saying what the mode does'
    );
    assert.ok(described.title.fallback.length > 0, `${described.key} has no title`);
    assert.ok(
      described.body.fallback.length > 40,
      `${described.key} has no explanation worth the name`
    );
    assert.deepEqual(
      described.facts.map((entry) => entry.id),
      ['check', 'outcomes', 'results'],
      `${described.key} does not state the prototype's three facts`
    );
  }
});

test('no entry describes a mode nothing can select', () => {
  const reachable = new Set(
    REACHABLE.map(([activity, mode, alchemyCheckMode]) =>
      checkModeKey({ activity, mode, alchemyCheckMode })
    )
  );
  for (const key of CHECK_MODE_KEYS) {
    assert.ok(reachable.has(key), `"${key}" describes a mode this studio cannot render`);
  }
});

test('an unrenderable pair describes nothing rather than describing the wrong mode', () => {
  assert.equal(describeCheckMode({ activity: 'gathering', mode: 'routedByCheck' }), null);
  assert.equal(describeCheckMode({ activity: 'crafting', mode: 'd100' }), null);
  assert.equal(describeCheckMode({}), null);
});

test('the two alchemy check shapes state OPPOSITE check facts', () => {
  // Pinned because the `Check ·` fact is exactly what sent a GM looking for an off switch:
  // alchemy simple read `Required` while carrying a perfectly good off state. Nothing else
  // asserts fact VALUES, so a revert to `check:required` would otherwise pass every gate.
  const simple = describeCheckMode({
    activity: 'crafting',
    mode: 'alchemy',
    alchemyCheckMode: 'simple',
  });
  const tiered = describeCheckMode({
    activity: 'crafting',
    mode: 'alchemy',
    alchemyCheckMode: 'tiered',
  });
  assert.equal(
    simple.facts.find((entry) => entry.id === 'check').value.fallback,
    'Optional',
    'alchemy simple can be switched off, so its callout must not claim the mode requires it'
  );
  assert.equal(
    tiered.facts.find((entry) => entry.id === 'check').value.fallback,
    'Required',
    'alchemy tiered routes result groups by outcome tier and cannot resolve without a roll'
  );
  assert.doesNotMatch(
    simple.body.fallback,
    /mandator/i,
    'and its explanation must not either'
  );
});

test('the alchemy OFF state is not a callout at all', () => {
  assert.equal(
    describeCheckMode({ activity: 'crafting', mode: 'alchemy', alchemyCheckMode: 'none' }),
    null,
    'its route renders the shared switched-off panel, which has no roll section to open'
  );
});

test('the outcome-tier fact carries the authored count, not a literal placeholder', () => {
  const described = describeCheckMode({
    activity: 'crafting',
    mode: 'routedByCheck',
    outcomeCount: 5,
  });
  const outcomes = described.facts.find((entry) => entry.id === 'outcomes');
  assert.equal(outcomes.value.fallback, '{count} tiers');
  assert.equal(outcomes.data.count, '5');
});

test("gathering's routed mode is dormant and reuses the shipped dormancy sentence", () => {
  const routed = describeCheckMode({ activity: 'gathering', mode: 'routed' });
  const progressive = describeCheckMode({ activity: 'gathering', mode: 'progressive' });
  for (const described of [routed, progressive]) {
    assert.equal(described.dormant, true, `${described.key} is presented as a live mode`);
    assert.equal(
      described.body.key,
      'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDormantBody',
      'the dormancy sentence must be the one the Modifiers section already ships, not a ' +
        'second vocabulary for the same fact'
    );
    // The sentence must still SAY the modes are dormant, and must not do it by naming an
    // internal issue: this is a GM-facing guide, and a tracker reference is a maintainer
    // note that belongs in the module comment (where it still is), not on the screen.
    assert.match(described.body.fallback, /not available yet/i);
    assert.doesNotMatch(
      described.body.fallback,
      /\bissues?\s+\d+/i,
      'user-facing copy must not name an internal issue number'
    );
    const check = described.facts.find((entry) => entry.id === 'check');
    assert.equal(
      check.value.key,
      'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDormantHeading'
    );
    assert.equal(check.value.fallback, 'Not in use yet');
  }
});

test('no crafting or salvage mode is marked dormant', () => {
  for (const [activity, mode, alchemyCheckMode] of REACHABLE) {
    if (activity === 'gathering') continue;
    const described = describeCheckMode({ activity, mode, alchemyCheckMode });
    assert.equal(described.dormant, false, `${described.key} must be a live configuration`);
  }
});

test('gathering d100 is live, and says the roll is not authored here', () => {
  const described = describeCheckMode({ activity: 'gathering', mode: 'd100' });
  assert.equal(described.dormant, false);
  const check = described.facts.find((entry) => entry.id === 'check');
  assert.equal(check.value.fallback, 'Fixed d100');
});

test('every localization key the callout can ask for exists in lang/en.json', () => {
  for (const [activity, mode, alchemyCheckMode] of REACHABLE) {
    const described = describeCheckMode({ activity, mode, alchemyCheckMode });
    const keys = [
      described.title.key,
      described.body.key,
      ...described.facts.flatMap((entry) => [entry.label.key, entry.value.key]),
    ];
    for (const key of keys) {
      assert.equal(typeof lookup(key), 'string', `${key} is missing from lang/en.json`);
    }
  }
});

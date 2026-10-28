/** The roll section's mode callout (issue 1096). */
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

/** Every (activity, mode) pair the Checks Studio can render. */
const REACHABLE = [
  ['crafting', 'simple', ''],
  ['crafting', 'routedByIngredients', ''],
  ['crafting', 'routedByCheck', ''],
  ['crafting', 'progressive', ''],
  // No `['crafting', 'alchemy', 'none']`.
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
  // Pinned because the `Check ·` fact is exactly what sent a GM looking for an off switch: alchemy
  // simple read `Required` while carrying a perfectly good off state.
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

test("gathering's routed and progressive modes are live and state their own behaviour", () => {
  for (const mode of ['routed', 'progressive']) {
    const described = describeCheckMode({ activity: 'gathering', mode });
    assert.match(described.body.key, /\.Checks\.Mode\.Gathering(Routed|Progressive)Body$/);
    assert.doesNotMatch(
      described.body.fallback,
      /not available yet|ship|these modifiers|\bissues?\s+\d+/i,
      'the body stands alone and names no internal issue'
    );
    assert.notEqual(described.icon, 'fas fa-clock', `${described.key} is not presented as pending`);
    const check = described.facts.find((entry) => entry.id === 'check');
    assert.equal(check.value.fallback, 'Required');
  }
  assert.match(
    describeCheckMode({ activity: 'gathering', mode: 'progressive' }).body.fallback,
    /Progressive is a legacy mode/
  );
});

test('no mode reports a dormant state', () => {
  for (const [activity, mode, alchemyCheckMode] of REACHABLE) {
    const described = describeCheckMode({ activity, mode, alchemyCheckMode });
    assert.ok(!Object.hasOwn(described, 'dormant'), `${described.key} carries a dormant flag`);
  }
});

test('gathering d100 is live, and says the roll is not authored here', () => {
  const described = describeCheckMode({ activity: 'gathering', mode: 'd100' });
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

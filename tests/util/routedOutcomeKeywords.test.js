import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAIL_KEYWORDS,
  HAZARD_KEYWORDS,
  MISS_KEYWORDS,
  isFailKeyword,
  isMissKeyword,
  isReservedRoutedName,
  matchResultGroupsByName,
  normalizeRoutedName,
  routedHasOutcomeTiers,
  routedOutcomeTierCount,
} from '../../src/utils/routedOutcomeKeywords.js';

// ---------------------------------------------------------------------------
// normalizeRoutedName
// ---------------------------------------------------------------------------

test('normalizeRoutedName trims and lowercases', () => {
  assert.equal(normalizeRoutedName('  Iron Ore  '), 'iron ore');
  assert.equal(normalizeRoutedName('FAIL'), 'fail');
});

test('normalizeRoutedName coerces nullish and falsy to an empty string', () => {
  assert.equal(normalizeRoutedName(null), '');
  assert.equal(normalizeRoutedName(undefined), '');
  assert.equal(normalizeRoutedName(0), '');
  assert.equal(normalizeRoutedName(false), '');
});

// ---------------------------------------------------------------------------
// keyword families
// ---------------------------------------------------------------------------

test('isFailKeyword matches the fail and hazard families', () => {
  for (const word of [...FAIL_KEYWORDS, ...HAZARD_KEYWORDS]) {
    assert.equal(isFailKeyword(word), true, `${word} should be a fail keyword`);
  }
  assert.equal(isFailKeyword('  Failure  '), true);
  assert.equal(isFailKeyword('iron'), false);
});

test('isMissKeyword matches the miss family only', () => {
  for (const word of MISS_KEYWORDS) {
    assert.equal(isMissKeyword(word), true, `${word} should be a miss keyword`);
  }
  assert.equal(isMissKeyword('fail'), false);
  assert.equal(isMissKeyword('iron'), false);
});

test('isReservedRoutedName covers fail, miss, and hazard families', () => {
  for (const word of [...FAIL_KEYWORDS, ...MISS_KEYWORDS, ...HAZARD_KEYWORDS]) {
    assert.equal(isReservedRoutedName(word), true, `${word} should be reserved`);
  }
  assert.equal(isReservedRoutedName('Iron'), false);
});

// ---------------------------------------------------------------------------
// matchResultGroupsByName — the shared routed name-match sub-step
// ---------------------------------------------------------------------------

const GROUPS = Object.freeze([
  { id: 'g-1', name: 'Iron' },
  { id: 'g-2', name: 'iron' }, // normalized duplicate of g-1
  { id: 'g-3', name: 'Silver' },
]);

test('matchResultGroupsByName matches case-insensitively and keeps all matches by default', () => {
  const matched = matchResultGroupsByName('IRON', GROUPS);
  assert.deepEqual(
    matched.map((g) => g.id),
    ['g-1', 'g-2']
  );
});

test('matchResultGroupsByName firstOnly keeps only the first match (crafting)', () => {
  const matched = matchResultGroupsByName('iron', GROUPS, { firstOnly: true });
  assert.deepEqual(
    matched.map((g) => g.id),
    ['g-1']
  );
});

test('matchResultGroupsByName returns an empty array when nothing matches', () => {
  assert.deepEqual(matchResultGroupsByName('gold', GROUPS), []);
  assert.deepEqual(matchResultGroupsByName('gold', GROUPS, { firstOnly: true }), []);
});

test('matchResultGroupsByName tolerates a missing/non-array groups argument', () => {
  assert.deepEqual(matchResultGroupsByName('iron', null), []);
  assert.deepEqual(matchResultGroupsByName('iron', undefined), []);
  assert.deepEqual(matchResultGroupsByName('iron', 'not-an-array'), []);
});

test('matchResultGroupsByName trims the outcome and group names before comparing', () => {
  const groups = [{ id: 'g-1', name: '  Iron Ore ' }];
  assert.deepEqual(
    matchResultGroupsByName('iron ore', groups).map((g) => g.id),
    ['g-1']
  );
});

test('matchResultGroupsByName tolerates groups with a nullish name', () => {
  const groups = [{ id: 'g-1' }, { id: 'g-2', name: null }, { id: 'g-3', name: 'Iron' }];
  assert.deepEqual(
    matchResultGroupsByName('iron', groups).map((g) => g.id),
    ['g-3']
  );
  // An empty outcome matches the empty-normalized (nameless) groups.
  assert.deepEqual(
    matchResultGroupsByName('', groups).map((g) => g.id),
    ['g-1', 'g-2']
  );
});

// ---------------------------------------------------------------------------
// routedOutcomeTierCount
// ---------------------------------------------------------------------------

test('routedOutcomeTierCount counts the active list by id, success and failure alike', () => {
  const routed = {
    type: 'relative',
    relativeOutcomes: [
      { id: 'crit', name: 'Critical', success: true },
      { id: 'ok', name: 'Success', success: true },
      { id: 'miss', name: 'Miss', success: false }
    ],
    fixedOutcomes: [{ id: 'fixed-1', name: 'Fixed', success: true }]
  };
  assert.equal(routedOutcomeTierCount(routed), 3);
  assert.equal(routedOutcomeTierCount({ ...routed, type: 'fixed' }), 1);
});

test('routedOutcomeTierCount ignores tiers without an id and tolerates missing input', () => {
  assert.equal(routedOutcomeTierCount(null), 0);
  assert.equal(routedOutcomeTierCount(undefined), 0);
  assert.equal(routedOutcomeTierCount({}), 0);
  assert.equal(routedOutcomeTierCount({ relativeOutcomes: 'not-an-array' }), 0);
  assert.equal(
    routedOutcomeTierCount({ relativeOutcomes: [{ name: 'nameless' }, null, { id: 'ok' }] }),
    1
  );
});

test('routedOutcomeTierCount agrees with routedHasOutcomeTiers on every shape', () => {
  const shapes = [
    null,
    {},
    { relativeOutcomes: [] },
    { relativeOutcomes: [{ name: 'no id' }] },
    // An id-bearing tier the GM has not named yet: still a tier.
    { relativeOutcomes: [{ id: 'unnamed' }] },
    { type: 'fixed', fixedOutcomes: [{ id: 'a' }, { id: 'b' }], relativeOutcomes: [] }
  ];
  for (const routed of shapes) {
    assert.equal(
      routedOutcomeTierCount(routed) > 0,
      routedHasOutcomeTiers(routed),
      `count and has-any should agree for ${JSON.stringify(routed)}`
    );
  }
});

// 1.28.0 — lifting the character prerequisite library and the modifier library to world scope
// (issue 1308).
//
// The cases below are the ones the currency and travel migrations already pin, plus the three
// this migration is the first to face: TWO libraries under one key (so the idempotence guard and
// the wrote-anything predicate are disjunctions, and one library may be junk while the other is
// valid), and id collisions that are the NORMAL case rather than a near-impossibility, because
// preset ids are stable semantic slugs rather than randomIDs.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorldCharacterLibraries,
  migrateCharacterLibrariesToWorldScope,
  stripSystemCharacterLibraries,
} from '../src/migration/migrateCharacterLibrariesToWorldScope.js';

const SMITH = { id: 'smithsTools', name: "Smith's Tools", path: 'tools.smith.value', op: 'gte', value: 1 };
const MED = { id: 'med', label: 'Medicine', expression: '@abilities.med.mod' };

function system(id, overrides = {}) {
  return { id, name: id.toUpperCase(), ...overrides };
}

test('unions both libraries across systems, keyed by id, first system winning', () => {
  const built = buildWorldCharacterLibraries([
    system('a', { characterPrerequisites: [SMITH], modifiers: [MED] }),
    system('b', {
      characterPrerequisites: [{ id: 'arcana', name: 'Arcana', path: 'skills.arc.rank', op: 'gte', value: 1 }],
      modifiers: [{ id: 'sur', label: 'Survival', expression: '@skills.sur.mod' }],
    }),
  ]);
  assert.deepEqual(
    built.characterPrerequisites.map((entry) => entry.id),
    ['smithsTools', 'arcana']
  );
  assert.deepEqual(
    built.modifiers.map((entry) => entry.id),
    ['med', 'sur']
  );
  assert.equal(built._collisions, undefined, 'no disagreement, so nothing to report');
});

// The seeded-preset case, and the reason collisions are filtered by CONTENT. A GM who seeded the
// same bundle into two systems collides on every entry while both copies agree exactly; reporting
// those would bury the one collision that actually changed a rule.
test('an IDENTICAL colliding entry is merged silently, not reported', () => {
  const built = buildWorldCharacterLibraries([
    system('a', { characterPrerequisites: [SMITH], modifiers: [MED] }),
    system('b', { characterPrerequisites: [{ ...SMITH }], modifiers: [{ ...MED }] }),
  ]);
  assert.equal(built.characterPrerequisites.length, 1);
  assert.equal(built.modifiers.length, 1);
  assert.equal(built._collisions, undefined);
});

// The harm this migration is unusual in carrying: the reference still RESOLVES, to a different
// rule. Nothing on screen says so, which is why it has to be reported.
test('a colliding entry that MEANS something different is reported by name', () => {
  const built = buildWorldCharacterLibraries([
    system('a', { characterPrerequisites: [SMITH] }),
    system('b', { characterPrerequisites: [{ ...SMITH, value: 2 }] }),
  ]);
  assert.equal(built.characterPrerequisites.length, 1);
  assert.equal(built.characterPrerequisites[0].value, 1, 'the first system wins');
  assert.deepEqual(built._collisions, [
    { library: 'characterPrerequisites', entryId: 'smithsTools', keptFrom: 'a', discardedFrom: 'b' },
  ]);
});

test('sameness is judged on the NORMALIZED entry, so key order is not a disagreement', () => {
  const built = buildWorldCharacterLibraries([
    system('a', { modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }] }),
    system('b', { modifiers: [{ expression: '  @abilities.med.mod  ', id: 'med', label: 'Medicine' }] }),
  ]);
  assert.equal(built._collisions, undefined);
});

test('a malformed entry or system is SKIPPED, never repaired, and nothing throws', () => {
  assert.doesNotThrow(() => buildWorldCharacterLibraries(null));
  const built = buildWorldCharacterLibraries([
    null,
    'nope',
    system('a', { characterPrerequisites: 'not an array', modifiers: [MED, null, { id: '' }, 7] }),
  ]);
  assert.deepEqual(built.characterPrerequisites, []);
  assert.deepEqual(
    built.modifiers.map((entry) => entry.id),
    ['med']
  );
});

// No precedent for this in the currency or travel migrations, which each carry ONE list.
test('one junk library does not stop the other being lifted', () => {
  const built = buildWorldCharacterLibraries([
    system('a', { characterPrerequisites: { nope: true }, modifiers: [MED] }),
  ]);
  assert.deepEqual(built.characterPrerequisites, []);
  assert.deepEqual(
    built.modifiers.map((entry) => entry.id),
    ['med']
  );
});

test('deep-copies entries, so the world library cannot alias the system it came from', () => {
  const source = system('a', { modifiers: [MED] });
  const built = buildWorldCharacterLibraries([source]);
  built.modifiers[0].label = 'Changed';
  assert.equal(source.modifiers[0].label, 'Medicine');
});

test('the strip drops both keys and leaves everything else alone', () => {
  const [stripped] = stripSystemCharacterLibraries([
    system('a', { characterPrerequisites: [SMITH], modifiers: [MED], tools: ['keep'] }),
  ]);
  assert.equal('characterPrerequisites' in stripped, false);
  assert.equal('modifiers' in stripped, false);
  assert.deepEqual(stripped.tools, ['keep']);
});

// Reference identity, and it is load-bearing: the runner detects change by JSON comparison over
// the whole corpus, so rebuilding every system would rewrite the entire crafting-systems setting
// in every already-migrated world on every boot.
test('an already-stripped system is returned BY REFERENCE, so change detection stays honest', () => {
  const clean = system('a', { tools: [] });
  const [result] = stripSystemCharacterLibraries([clean]);
  assert.equal(result, clean);
});

test('lifts, strips and reports in one pass', () => {
  const result = migrateCharacterLibrariesToWorldScope({
    systems: [
      system('a', { characterPrerequisites: [SMITH], modifiers: [MED] }),
      system('b', { characterPrerequisites: [{ ...SMITH, value: 9 }] }),
    ],
    characterLibraries: {},
  });
  assert.deepEqual(
    result.characterLibraries.characterPrerequisites.map((entry) => entry.id),
    ['smithsTools']
  );
  assert.equal('modifiers' in result.systems[0], false);
  assert.equal(result._characterLibraryCollisions.length, 1);
  assert.equal(
    '_collisions' in result.characterLibraries,
    false,
    'the transient report never reaches the persisted setting'
  );
});

// The idempotence guard, as a DISJUNCTION. A world whose GM authored only modifiers must not have
// the prerequisite half re-merged from stale system blocks on every boot.
test('a populated world library is NEVER re-merged, even when the other library is empty', () => {
  const stored = { characterPrerequisites: [], modifiers: [MED] };
  const result = migrateCharacterLibrariesToWorldScope({
    systems: [system('a', { characterPrerequisites: [SMITH] })],
    characterLibraries: stored,
  });
  assert.equal(result.characterLibraries, stored, 'the GM-owned library is authoritative');
});

test('re-running over already-stripped systems changes nothing', () => {
  const first = migrateCharacterLibrariesToWorldScope({
    systems: [system('a', { characterPrerequisites: [SMITH], modifiers: [MED] })],
    characterLibraries: {},
  });
  const second = migrateCharacterLibrariesToWorldScope({
    systems: first.systems,
    characterLibraries: first.characterLibraries,
  });
  assert.deepEqual(second.characterLibraries, first.characterLibraries);
  assert.equal(second.systems[0], first.systems[0], 'and no system is rebuilt');
});

// The no-op that must NOT write. Emitting a freshly built pair of empty arrays over a stored `{}`
// would register as a change and write the setting in every world that never authored either
// library — an unexplained write in an otherwise no-op upgrade.
test('a world with nothing to lift returns the STORED object, so no write is registered', () => {
  const stored = {};
  const result = migrateCharacterLibrariesToWorldScope({
    systems: [system('a'), system('b')],
    characterLibraries: stored,
  });
  assert.equal(result.characterLibraries, stored);
});

test('a world with ZERO systems is a no-op and does not throw', () => {
  const stored = {};
  assert.doesNotThrow(() => migrateCharacterLibrariesToWorldScope({}));
  assert.equal(
    migrateCharacterLibrariesToWorldScope({ systems: [], characterLibraries: stored })
      .characterLibraries,
    stored
  );
});

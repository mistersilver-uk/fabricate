/**
 * Issue 1286 — `Component.complications` normalisation.
 *
 * The persisted record is TOP-LEVEL on the component (not under `salvage`), because a
 * complication is scoped to a component's participation in ANY progressive activity, and
 * because `salvage` is only valid when `features.salvage` is true — a complication on a
 * crafting OUTPUT component must survive on a system with salvage off.
 *
 * The load-bearing guarantee here is the NO-MIGRATION one: `_normalizeComponent` is an
 * allowlist rebuild, so a component's persisted bytes after a save are exactly what that
 * literal emits. A component that authored no complications must therefore keep NO
 * `complications` key at all, and an authored empty array must normalize to the same
 * absence — there is no authored-empty state to distinguish (unlike `checkModifierIds`,
 * where an empty pick is a real pick of zero).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authoredComplications,
  COMPLICATION_ACTIVITIES,
  COMPLICATION_MATCH_MODES,
  COMPLICATION_SEVERITIES,
  COMPLICATION_STAGE_CONDITIONS,
  COMPLICATION_VISIBILITIES,
} from '../src/utils/componentComplications.js';

// Minimal stubs so `CraftingSystemManager` can load without a Foundry runtime. The
// complication attach never reaches these: it mints through the injected `mintId`.
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined,
  },
};
globalThis.game = { user: { isGM: true } };
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

/** A deterministic id mint, so a shape assertion never depends on a random id. */
function countingMint() {
  let minted = 0;
  return () => `minted-${++minted}`;
}

// ---------------------------------------------------------------------------
// Absence preservation — the no-migration guarantee
// ---------------------------------------------------------------------------

test('an absent complications value attaches nothing', () => {
  assert.deepEqual(authoredComplications(undefined), {});
  assert.deepEqual(authoredComplications(null), {});
});

test('an authored empty array normalizes to ABSENT, not to an empty list', () => {
  const attach = authoredComplications([]);
  assert.deepEqual(attach, {});
  assert.equal(Object.hasOwn(attach, 'complications'), false);
});

test('a non-array authored value attaches nothing', () => {
  for (const value of ['[]', 7, true, {}, { 0: {} }]) {
    assert.deepEqual(
      authoredComplications(value),
      {},
      `expected ${JSON.stringify(value)} to attach nothing`
    );
  }
});

test('a list whose every member is a non-object attaches nothing', () => {
  assert.deepEqual(authoredComplications([null, 'x', 3, [], undefined]), {});
});

test('only non-object/array members are dropped; the rest keep authored order', () => {
  const { complications } = authoredComplications(
    [{ name: 'first' }, null, ['nope'], { name: 'second' }],
    countingMint()
  );
  assert.deepEqual(
    complications.map((complication) => complication.name),
    ['first', 'second']
  );
});

// ---------------------------------------------------------------------------
// The shape and its defaults
// ---------------------------------------------------------------------------

test('a bare authored complication normalizes to the full shape with safe defaults', () => {
  const { complications } = authoredComplications([{}], countingMint());
  assert.deepEqual(complications, [
    {
      id: 'minted-1',
      name: '',
      description: '',
      severity: 'minor',
      // The one default chosen for SAFETY rather than for behaviour preservation: there is
      // no pre-existing behaviour to preserve, so an unstated audience is the GM's.
      visibility: 'gmOnly',
      activities: { crafting: false, salvage: false, gathering: false },
      match: 'any',
      when: {
        stageAwarded: false,
        stagePartial: false,
        stageMissed: false,
        checkTrigger: null,
      },
      rollCondition: { enabled: false, expr: '', cmp: '', value: '' },
      effectRoll: { enabled: false, expr: '', label: '' },
    },
  ]);
  // `macroUuid` is attached only when authored, so the absent case carries no key.
  assert.equal(Object.hasOwn(complications[0], 'macroUuid'), false);
});

test('an authored id survives; only a missing one is minted', () => {
  const { complications } = authoredComplications(
    [{ id: 'cx-authored' }, { id: '   ' }, {}],
    countingMint()
  );
  assert.deepEqual(
    complications.map((complication) => complication.id),
    ['cx-authored', 'minted-1', 'minted-2']
  );
});

test('the default mint uses foundry.utils.randomID when a world is running', () => {
  const { complications } = authoredComplications([{}]);
  assert.match(complications[0].id, /^random-\d+$/);
});

test('the default mint falls back to the platform CSPRNG with no Foundry runtime', () => {
  // The reason `mintId` is injectable at all: `foundry.utils.randomID()` is not callable
  // under `node --test`. The fallback must still mint, or an id-less complication would
  // persist as `undefined` and acquire a fresh id on every save.
  const runtime = globalThis.foundry;
  globalThis.foundry = undefined;
  try {
    const { complications } = authoredComplications([{}, {}]);
    const [first, second] = complications.map((complication) => complication.id);
    assert.match(first, /^[0-9a-f]{16}$/, 'expected a CSPRNG-derived id');
    assert.notEqual(first, second, 'two freshly minted ids must differ');
  } finally {
    globalThis.foundry = runtime;
  }
});

test('the closed vocabularies are frozen and carry exactly their declared tokens', () => {
  assert.deepEqual([...COMPLICATION_SEVERITIES], ['minor', 'major', 'severe']);
  assert.deepEqual([...COMPLICATION_VISIBILITIES], ['gmOnly', 'visible']);
  assert.deepEqual([...COMPLICATION_MATCH_MODES], ['any', 'all']);
  assert.deepEqual([...COMPLICATION_ACTIVITIES], ['crafting', 'salvage', 'gathering']);
  assert.deepEqual(
    [...COMPLICATION_STAGE_CONDITIONS],
    ['stageAwarded', 'stagePartial', 'stageMissed']
  );
  for (const vocabulary of [
    COMPLICATION_SEVERITIES,
    COMPLICATION_VISIBILITIES,
    COMPLICATION_MATCH_MODES,
    COMPLICATION_ACTIVITIES,
    COMPLICATION_STAGE_CONDITIONS,
  ]) {
    assert.ok(Object.isFrozen(vocabulary), 'every exported vocabulary is frozen');
  }
});

test('a token outside its closed vocabulary clamps to that vocabulary’s default', () => {
  const { complications } = authoredComplications(
    [{ severity: 'catastrophic', visibility: 'public', match: 'either' }],
    countingMint()
  );
  const [complication] = complications;
  assert.equal(complication.severity, 'minor');
  // A visibility Fabricate does not know must read as the GM-only one, never as visible.
  assert.equal(complication.visibility, 'gmOnly');
  assert.equal(complication.match, 'any');
});

test('every authored token in vocabulary survives verbatim', () => {
  const { complications } = authoredComplications(
    [{ severity: 'severe', visibility: 'visible', match: 'all' }],
    countingMint()
  );
  const [complication] = complications;
  assert.equal(complication.severity, 'severe');
  assert.equal(complication.visibility, 'visible');
  assert.equal(complication.match, 'all');
});

test('activity and stage flags are strict booleans, so a truthy junk value is not an opt-in', () => {
  const { complications } = authoredComplications(
    [
      {
        activities: { crafting: true, salvage: 'yes', gathering: 0 },
        when: { stageAwarded: 1, stagePartial: true, stageMissed: null },
      },
    ],
    countingMint()
  );
  const [complication] = complications;
  assert.deepEqual(complication.activities, {
    crafting: true,
    salvage: false,
    gathering: false,
  });
  assert.equal(complication.when.stageAwarded, false);
  assert.equal(complication.when.stagePartial, true);
  assert.equal(complication.when.stageMissed, false);
});

test('a non-object activities/when member falls back to all-off rather than throwing', () => {
  const { complications } = authoredComplications(
    [{ activities: 'salvage', when: null }],
    countingMint()
  );
  const [complication] = complications;
  assert.deepEqual(complication.activities, {
    crafting: false,
    salvage: false,
    gathering: false,
  });
  assert.deepEqual(complication.when, {
    stageAwarded: false,
    stagePartial: false,
    stageMissed: false,
    checkTrigger: null,
  });
});

test('when.checkTrigger is a trigger id or null, never an empty string', () => {
  const { complications } = authoredComplications(
    [
      { when: { checkTrigger: ' trg-nat-1 ' } },
      { when: { checkTrigger: '' } },
      { when: { checkTrigger: 42 } },
    ],
    countingMint()
  );
  assert.equal(complications[0].when.checkTrigger, 'trg-nat-1');
  assert.equal(complications[1].when.checkTrigger, null);
  // A non-string id is a trigger id nobody authored; it resolves to nothing and the clause
  // is inert (fail-open), which is what `null` already means.
  assert.equal(complications[2].when.checkTrigger, null);
});

// ---------------------------------------------------------------------------
// Operands: preserved, never repaired
// ---------------------------------------------------------------------------

test('the prototype’s `ne` comparator normalizes to the operator table’s `neq`', () => {
  const { complications } = authoredComplications(
    [{ rollCondition: { enabled: true, expr: '1d20', cmp: 'ne', value: '1' } }],
    countingMint()
  );
  assert.equal(complications[0].rollCondition.cmp, 'neq');
});

test('a comparator outside the table is PRESERVED, so a validator can still report it', () => {
  const { complications } = authoredComplications(
    [{ rollCondition: { cmp: 'exists' } }, { rollCondition: { cmp: 'wat' } }],
    countingMint()
  );
  // `exists` is a real prerequisite operator but not one of the six NUMERIC ones a
  // complication may use; repairing it here would hide the authoring mistake.
  assert.equal(complications[0].rollCondition.cmp, 'exists');
  assert.equal(complications[1].rollCondition.cmp, 'wat');
});

test('rollCondition.value stays a STRING, because it may itself carry roll data', () => {
  const { complications } = authoredComplications(
    [{ rollCondition: { value: 5 } }, { rollCondition: { value: '1d4' } }],
    countingMint()
  );
  assert.equal(complications[0].rollCondition.value, '5');
  assert.equal(complications[1].rollCondition.value, '1d4');
});

test('a malformed dice expression is preserved rather than repaired or dropped', () => {
  const authored = [
    {
      rollCondition: { enabled: true, expr: 'not a formula', cmp: 'gte', value: 'also not' },
      effectRoll: { enabled: true, expr: '2d6 shrapnel?', label: 'Shrapnel' },
    },
  ];
  const { complications } = authoredComplications(authored, countingMint());
  assert.deepEqual(complications[0].rollCondition, {
    enabled: true,
    expr: 'not a formula',
    cmp: 'gte',
    value: 'also not',
  });
  assert.deepEqual(complications[0].effectRoll, {
    enabled: true,
    expr: '2d6 shrapnel?',
    label: 'Shrapnel',
  });
});

test('macroUuid is trimmed, and a blank one attaches no key at all', () => {
  const { complications } = authoredComplications(
    [{ macroUuid: '  Macro.abc  ' }, { macroUuid: '   ' }, { macroUuid: null }],
    countingMint()
  );
  assert.equal(complications[0].macroUuid, 'Macro.abc');
  assert.equal(Object.hasOwn(complications[1], 'macroUuid'), false);
  assert.equal(Object.hasOwn(complications[2], 'macroUuid'), false);
});

test('normalisation is idempotent, so a re-save is byte-stable', () => {
  const authored = [
    {
      id: 'cx-1',
      name: 'Shrapnel Burst',
      description: 'The vessel bursts.',
      severity: 'major',
      visibility: 'visible',
      activities: { crafting: false, salvage: true, gathering: false },
      match: 'all',
      when: {
        stageAwarded: false,
        stagePartial: false,
        stageMissed: true,
        checkTrigger: 'trg-nat-1',
      },
      rollCondition: { enabled: true, expr: '1d20', cmp: 'neq', value: '1' },
      effectRoll: { enabled: true, expr: '2d6', label: 'Shrapnel' },
      macroUuid: 'Macro.abc',
    },
  ];
  const once = authoredComplications(authored, countingMint());
  const twice = authoredComplications(once.complications, countingMint());
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(twice), JSON.stringify(once), 'key order is stable too');
});

// ---------------------------------------------------------------------------
// The attach inside `_normalizeComponent`
// ---------------------------------------------------------------------------

test('a component that authored no complications keeps NO complications key', () => {
  const manager = makeManager();
  const component = manager._normalizeComponent({ id: 'c1', name: 'Iron Ore' });
  assert.equal(
    Object.hasOwn(component, 'complications'),
    false,
    'the persisted shape must be unchanged for every existing component'
  );
});

test('a component authoring an EMPTY complications list also keeps no key', () => {
  const manager = makeManager();
  const component = manager._normalizeComponent({ id: 'c1', complications: [] });
  assert.equal(Object.hasOwn(component, 'complications'), false);
});

test('an authored complication survives `_normalizeComponent` in its normalized shape', () => {
  const manager = makeManager();
  const component = manager._normalizeComponent({
    id: 'c1',
    name: 'Iron Ore',
    complications: [{ name: 'Shrapnel Burst', severity: 'major', macroUuid: 'Macro.abc' }],
  });
  assert.equal(component.complications.length, 1);
  assert.equal(component.complications[0].name, 'Shrapnel Burst');
  assert.equal(component.complications[0].severity, 'major');
  assert.equal(component.complications[0].visibility, 'gmOnly');
  assert.equal(component.complications[0].macroUuid, 'Macro.abc');
  assert.ok(component.complications[0].id, 'the attach mints an id when none is authored');
});

test('complications sits TOP-LEVEL, immediately after difficulty, and never inside salvage', () => {
  const manager = makeManager();
  const component = manager._normalizeComponent({
    id: 'c1',
    difficulty: 3,
    complications: [{ name: 'Shrapnel Burst' }],
    salvage: { enabled: true },
  });
  const keys = Object.keys(component);
  assert.equal(
    keys[keys.indexOf('difficulty') + 1],
    'complications',
    'the spread belongs directly after `difficulty`, the sibling that also spans all three activities'
  );
  assert.ok(keys.indexOf('complications') < keys.indexOf('salvage'));
  assert.equal(Object.hasOwn(component.salvage, 'complications'), false);
});

test('complications survive a system whose salvage feature is OFF', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: false },
    components: [{ id: 'c1', complications: [{ name: 'Shrapnel Burst' }] }],
  });
  const [component] = system.components;
  assert.equal(component.complications.length, 1, 'a crafting-output complication must survive');
});

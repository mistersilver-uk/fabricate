/** Issue 1364 (epic 1357, PR 4) — the PURE half of the world-scope entity merge. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { membershipKey } from '../src/systems/scopedDefinitions.js';
import {
  INCOMING_SYSTEM_TOKEN,
  membershipKeySet,
  mergedEntityIds,
  mergedMembershipUnion,
  recheckWorldDefault,
  sliceRecords,
} from '../src/systems/worldScopeImportMerge.js';

/** One membership-union entry, in the shape the re-check consumes. */
function member(entityId, systemId, record = {}) {
  return { entityId, systemId, record: { entityId, systemId, ...record } };
}

/**
 * Run one case against the literal corpus it declares.
 *
 * @returns {{record: object|null, declined: Array<{section: string, referenceValue: string}>}}
 */
function recheck(scenario) {
  return recheckWorldDefault({
    entityType: scenario.entityType,
    record: scenario.record,
    worldComponentIds:
      scenario.worldComponentIds === null ? null : new Set(scenario.worldComponentIds ?? []),
    membershipUnion: scenario.members ?? [],
    componentMembers: new Set(
      (scenario.componentMembers ?? []).map(([componentId, systemId]) =>
        membershipKey(componentId, systemId)
      )
    ),
  });
}

// CONSTRAINT 0 — the every-member precondition is the MIGRATION'S predicate

const PRECONDITION_CASES = [
  {
    name: 'a member whose `category` is BLANK has authored nothing, so the default is declined',
    // REDDENS WHEN: the precondition is read as a bare key-presence test — `''` carries the key,
    // `coerceComponentSection` coerces it to ABSENCE on the way into the store, and the imported
    // system then resolves `ore`, a value no GM there authored.
    entityType: 'components',
    record: { id: 'c1', category: 'ore' },
    members: [member('c1', 'sys-a', { category: '' })],
    expectSections: [],
    expectDeclined: ['category'],
  },
  {
    name: 'a WHITESPACE-ONLY `category` is the same absence, and is declined identically',
    // REDDENS WHEN: the predicate tests `!== undefined`, or tests the raw string's truthiness
    // without trimming — `'  '` is truthy.
    entityType: 'components',
    record: { id: 'c1', category: 'ore' },
    members: [member('c1', 'sys-a', { category: '   ' })],
    expectSections: [],
    expectDeclined: ['category'],
  },
  {
    name: 'an ABSENT `category` key is declined too — the baseline the blank arms extend',
    entityType: 'components',
    record: { id: 'c1', category: 'ore' },
    members: [member('c1', 'sys-a'), member('c1', 'sys-b', { category: 'metal' })],
    expectSections: [],
    expectDeclined: ['category'],
  },
  {
    name: 'a default every member genuinely authored LANDS',
    // The positive half, so no arm above can pass by declining everything.
    entityType: 'components',
    record: { id: 'c1', category: 'ore' },
    members: [member('c1', 'sys-a', { category: 'metal' }), member('c1', 'sys-b', { category: 'ore' })],
    expectSections: ['category'],
    expectDeclined: [],
  },
  {
    name: 'a member of a DIFFERENT entity is not consulted',
    entityType: 'components',
    record: { id: 'c1', category: 'ore' },
    members: [member('c1', 'sys-a', { category: 'metal' }), member('c2', 'sys-b')],
    expectSections: ['category'],
    expectDeclined: [],
  },
];

// CONSTRAINT (a) — the reserved `general` category is never persisted at world scope

const RESERVED_CATEGORY_CASES = [
  {
    name: 'the reserved `general` category is DECLINED even when every member authored it',
    // REDDENS WHEN: the components arm is replaced by an unconditional `{ ok: true }`.
    entityType: 'components',
    record: { id: 'c1', category: 'general' },
    members: [member('c1', 'sys-a', { category: 'general' })],
    expectSections: [],
    expectDeclined: ['category'],
  },
];

// The UNDECIDABLE-ROSTER rule — `worldComponentIds === null`

const UNDECIDABLE_CASES = [
  {
    name: 'an essence `effectSource` naming a bare component id is declined when the roster is undecidable',
    // REDDENS WHEN: the undecidable branch is written `: true` instead of `: value.includes('.')`.
    entityType: 'essences',
    record: { id: 'fire', effectSource: { sourceComponentId: 'c9' } },
    members: [member('fire', 'sys-a')],
    worldComponentIds: null,
    expectSections: [],
    expectDeclined: ['c9'],
  },
  {
    name: 'a DOTTED `effectSource` reference is a document UUID and survives an undecidable roster',
    // The positive half, so the rule above cannot pass by declining every undecidable section.
    // REDDENS WHEN: the undecidable branch declines unconditionally.
    entityType: 'essences',
    record: { id: 'fire', effectSource: { sourceItemUuid: 'Item.abcdef' } },
    members: [member('fire', 'sys-a')],
    worldComponentIds: null,
    expectSections: ['effectSource'],
    expectDeclined: [],
  },
  {
    name: 'a tool `onBreak` replacing with a bare component id is declined when the roster is undecidable',
    // REDDENS WHEN: the undecidable branch is written `: true`.
    entityType: 'tools',
    record: { id: 't1', onBreak: { replacementTarget: { type: 'component', componentId: 'c9' } } },
    members: [
      member('t1', 'sys-a', {
        onBreak: { replacementTarget: { type: 'component', componentId: 'c9' } },
      }),
    ],
    worldComponentIds: null,
    expectSections: [],
    expectDeclined: ['c9'],
  },
  {
    name: 'a tool `onBreak` replacing with an ITEM UUID carries no component reference and survives',
    entityType: 'tools',
    record: { id: 't1', onBreak: { replacementTarget: { type: 'itemUuid', itemUuid: 'Item.x' } } },
    members: [
      member('t1', 'sys-a', {
        onBreak: { replacementTarget: { type: 'itemUuid', itemUuid: 'Item.x' } },
      }),
    ],
    worldComponentIds: null,
    expectSections: ['onBreak'],
    expectDeclined: [],
  },
];

// The DECIDABLE roster — the shipped `isWorldAddressable` predicate

const DECIDABLE_CASES = [
  {
    name: 'a tool `onBreak` naming a component the MERGED roster holds is addressable',
    entityType: 'tools',
    record: { id: 't1', onBreak: { replacementTarget: { type: 'component', componentId: 'c9' } } },
    members: [
      member('t1', 'sys-a', {
        onBreak: { replacementTarget: { type: 'component', componentId: 'c9' } },
      }),
    ],
    worldComponentIds: ['c9'],
    expectSections: ['onBreak'],
    expectDeclined: [],
  },
  {
    name: 'an essence `effectSource` naming a component the merged roster LACKS is declined',
    entityType: 'essences',
    record: { id: 'fire', effectSource: { sourceComponentId: 'c9' } },
    members: [member('fire', 'sys-a')],
    worldComponentIds: ['c1'],
    expectSections: [],
    expectDeclined: ['c9'],
  },
  {
    name: 'a `repairRequirements` group every member system also holds the component for is lifted',
    entityType: 'tools',
    record: { id: 't1', repairRequirements: [{ id: 'g1', options: [{ componentId: 'c9' }] }] },
    members: [member('t1', 'sys-a')],
    worldComponentIds: ['c9'],
    componentMembers: [['c9', 'sys-a']],
    expectSections: ['repairRequirements'],
    expectDeclined: [],
  },
  {
    name: 'a `repairRequirements` group a member system does NOT hold the component for is declined',
    entityType: 'tools',
    record: { id: 't1', repairRequirements: [{ id: 'g1', options: [{ componentId: 'c9' }] }] },
    members: [member('t1', 'sys-a'), member('t1', 'sys-b')],
    worldComponentIds: ['c9'],
    componentMembers: [['c9', 'sys-a']],
    expectSections: [],
    expectDeclined: ['c9'],
  },
];

for (const scenario of [
  ...PRECONDITION_CASES,
  ...RESERVED_CATEGORY_CASES,
  ...UNDECIDABLE_CASES,
  ...DECIDABLE_CASES,
]) {
  test(`recheckWorldDefault: ${scenario.name}`, () => {
    const { record, declined } = recheck(scenario);
    assert.deepEqual(
      record ? Object.keys(record).filter((key) => key !== 'id') : [],
      scenario.expectSections,
      'the surviving sections'
    );
    assert.deepEqual(
      declined.map((entry) => entry.referenceValue),
      scenario.expectDeclined,
      'the reported decline values'
    );
    // A record left carrying only its `id` is NOT written at all, applying the election's own
    // rule; a record with something left keeps its id.
    if (scenario.expectSections.length === 0) assert.ok(!record, 'an id-only record is not written');
    else assert.equal(record.id, scenario.record.id, 'and a surviving record keeps its id');
  });
}

// The CORPUS READERS the re-check decides against. `recheckWorldDefault` is only as honest as the
// corpus it is handed, and all four readers below were unexercised: the suite imported one of the
// module's five functions.

/** A slice in the PERSISTED map shape. */
function mapSlice(subKey, records) {
  return { [subKey]: Object.fromEntries(records.map((record, index) => [`k${index}`, record])) };
}

test('sliceRecords: reads BOTH shapes and drops anything that is not a record', () => {
  // The envelope carries arrays and the store persists maps, and this reader is what lets one
  // corpus be assembled from both without either side converting first.
  const records = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(sliceRecords({ entities: records }, 'entities'), records, 'the ARRAY form');
  assert.deepEqual(
    sliceRecords(mapSlice('entities', records), 'entities'),
    records,
    'and the persisted MAP form, whose keys are discarded'
  );
  assert.deepEqual(
    sliceRecords({ entities: [null, 'x', 7, [], { id: 'a' }] }, 'entities'),
    [{ id: 'a' }],
    'a non-record entry is dropped rather than repaired — an array is not a record either'
  );
  for (const slice of [null, undefined, [], 'not a slice']) {
    assert.deepEqual(sliceRecords(slice, 'entities'), [], 'a non-slice reads as EMPTY');
  }
});

test('mergedEntityIds: unions the DESTINATION and the INCOMING roster', () => {
  // THE MUTATION THIS EXISTS FOR: iterating `[persistedSlice]` alone.
  const destination = { entities: [{ id: 'dest' }] };
  const incoming = { entities: [{ id: 'inc' }] };

  assert.deepEqual([...mergedEntityIds(destination, null)], ['dest'], 'the DESTINATION leg alone');
  assert.deepEqual([...mergedEntityIds(null, incoming)], ['inc'], 'the INCOMING leg alone');
  assert.deepEqual(
    [...mergedEntityIds(destination, incoming)].sort(),
    ['dest', 'inc'],
    'and the union of the two'
  );
  assert.deepEqual(
    [...mergedEntityIds(mapSlice('entities', [{ id: ' padded ' }]), { entities: [{ id: '' }] })],
    ['padded'],
    'ids are trimmed, a blank id names nothing, and the persisted map shape is read'
  );
});

test('mergedMembershipUnion: the incoming half counts as ONE SYNTHETIC system', () => {
  // The incoming records are counted under a synthetic token and NEVER under the payload's own
  // system id, because that id names the destination's system in neither mode: copy mode has not
  // minted one yet, and a keep-mode overwrite may have resolved an existing system by NAME.
  const union = mergedMembershipUnion(
    { membership: [{ entityId: 'e1', systemId: 'dest-sys' }] },
    { membership: [{ entityId: 'e1', systemId: 'payload-sys' }] }
  );
  assert.deepEqual(
    union.map((entry) => [entry.entityId, entry.systemId]),
    [
      ['e1', 'dest-sys'],
      ['e1', INCOMING_SYSTEM_TOKEN],
    ],
    'the destination keeps its own system id and the incoming record is re-tokened'
  );
  assert.equal(union[1].record.systemId, 'payload-sys', 'the RECORD is carried through untouched');

  assert.deepEqual(
    mergedMembershipUnion(
      { membership: [{ entityId: 'e1' }] },
      { membership: [{ systemId: 'payload-sys' }] }
    ),
    [],
    'a persisted record with no systemId and an incoming record with no entityId are both dropped'
  );
});

test('membershipKeySet: keys the union with the shipped separator', () => {
  // Constraint (d) asks its question in `(componentId, systemId)` space, so this set has to agree
  // with the store's own key derivation rather than with a second spelling of it.
  assert.deepEqual(
    [...membershipKeySet([{ entityId: 'c1', systemId: 'sys-a' }, { entityId: 'c1', systemId: 'sys-b' }])],
    [membershipKey('c1', 'sys-a'), membershipKey('c1', 'sys-b')],
    'one key per pair, derived exactly as the store derives it'
  );
});

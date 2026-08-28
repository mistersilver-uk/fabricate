/**
 * Issue 1364 (epic 1357, PR 4) — the PURE half of the world-scope entity merge.
 *
 * `src/systems/worldScopeImportMerge.js` states unit-testability as "the reason that matters" for
 * living beside the importer rather than inside it, and this is the suite that cashes that in: a
 * LITERAL CORPUS table over `recheckWorldDefault`, with no importer, no store and no Foundry
 * anywhere in the closure.
 *
 * It exists because the end-to-end acceptance arms cannot reach several of these rules cheaply,
 * and three of them were MEASURED GREEN under their own mutations before this file:
 *
 * - the every-member precondition read as a bare KEY-PRESENCE test, which a hand-authored
 *   `category: ''` walks straight through — the store coerces the blank to ABSENCE, so the
 *   imported system then RESOLVES the world default the precondition was asked to decide;
 * - the reserved-`general` constraint, whose whole removal left every acceptance arm green;
 * - the undecidable-roster rule's ADDRESSABILITY half, which the acceptance suite exercises only
 *   through `repairRequirements` (short-circuited before the check) and `breakage` (no reference
 *   at all), leaving the dotted-value test unreached in both directions.
 *
 * Each case names the mutation that reddens it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { membershipKey } from '../src/systems/scopedDefinitions.js';
import { recheckWorldDefault } from '../src/systems/worldScopeImportMerge.js';

/** One membership-union entry, in the shape the re-check consumes. */
function member(entityId, systemId, record = {}) {
  return { entityId, systemId, record: { entityId, systemId, ...record } };
}

/**
 * Run one case against the literal corpus it declares.
 *
 * @param {object} scenario
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

// ---------------------------------------------------------------------------
// CONSTRAINT 0 — the every-member precondition is the MIGRATION'S predicate
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CONSTRAINT (a) — the reserved `general` category is never persisted at world scope
// ---------------------------------------------------------------------------

const RESERVED_CATEGORY_CASES = [
  {
    name: 'the reserved `general` category is DECLINED even when every member authored it',
    // REDDENS WHEN: the components arm is replaced by an unconditional `{ ok: true }`. Persisting
    // it would silently reset every inheriting system's category to `general` on the first
    // resolve, because the world category is absence-preserving and `general` is the implicit
    // bucket the resolver falls back to.
    entityType: 'components',
    record: { id: 'c1', category: 'general' },
    members: [member('c1', 'sys-a', { category: 'general' })],
    expectSections: [],
    expectDeclined: ['category'],
  },
];

// ---------------------------------------------------------------------------
// The UNDECIDABLE-ROSTER rule — `worldComponentIds === null`
// ---------------------------------------------------------------------------

const UNDECIDABLE_CASES = [
  {
    name: 'an essence `effectSource` naming a bare component id is declined when the roster is undecidable',
    // REDDENS WHEN: the undecidable branch is written `: true` instead of `: value.includes('.')`.
    // The acceptance suite cannot see that mutation: its only undecidable arms are
    // `repairRequirements`, which is refused before the addressability check runs, and
    // `breakage`, which carries no reference at all.
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

// ---------------------------------------------------------------------------
// The DECIDABLE roster — the shipped `isWorldAddressable` predicate
// ---------------------------------------------------------------------------

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

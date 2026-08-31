/**
 * The pure half of the scoped-entity list shells (issue 1380, epic 1357).
 *
 * Three things are asserted here that a mounted test cannot state cheaply or at all:
 *
 *  - the TWO IDENTITY SHAPE FACTS are DERIVED from the lifted identity field lists, with the
 *    key-space bridge pinned NON-VACUOUS before any per-type answer is read. A broken bridge
 *    answers `false` everywhere, and `sourceLinked: false` on a component is indistinguishable
 *    from the correct `false` on an essence — so the set-equality assertions below are only
 *    worth anything after the lists they read are proved non-empty;
 *  - the TWO MEMOS, by counting. `searchOf` is invoked exactly once per entry per
 *    `(entries, searchOf)` change, and the system-row resolution is O(N) index reads rather than
 *    O(N x S). Both are stated as integers rather than as inequalities so an implementation that
 *    filters twice is caught rather than argued about;
 *  - that this module RESTATES NEITHER shipped pure model. Selection reduction and page
 *    arithmetic each already exist once, and a second copy is what the file they live in exists
 *    to prevent.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { WORLD_IDENTITY_FIELDS } from '../src/migration/worldScopeEntityGrouping.js';
// BY PATH, and the path matters. `src/systems/importReferenceResolver.js` exports a same-named
// `WORLD_SCOPE_ENTITY_TYPES` whose values are PLURAL; under that import
// `WORLD_SCOPE_DESCRIPTORS['components']` is `undefined`, `projectWorldScopeEntity` takes its
// empty branch, and every per-type clause below passes vacuously off an empty projection. The
// defined-guard in the first test is what makes that a red rather than a green.
import {
  emptyWorldScopeEntityState,
  projectWorldScopeEntity,
  WORLD_SCOPE_DESCRIPTORS,
} from '../src/ui/svelte/stores/worldScopeProjection.js';
import { paginateRows } from '../src/utils/browserPagination.js';
import {
  describeBulkSelection,
  pruneBulkSelection,
  setBulkSelection,
  toggleBulkSelection,
} from '../src/utils/bulkSelectionModel.js';
import {
  createScopedEntityListModel,
  defaultScopedSearchText,
  scopedEntryName,
  SCOPED_LIST_SORTS,
  SYSTEM_MEMBERSHIP_FILTERS,
  WORLD_MEMBERSHIP_FILTERS,
} from '../src/utils/scopedEntityListModel.js';

const repoRoot = resolve(import.meta.dirname, '..');
const ENTITY_TYPES = ['component', 'essence', 'tool'];

/** The plural keys the derivation bridges to, restated here so the bridge itself is measured. */
const IDENTITY_KEYS = { component: 'components', essence: 'essences', tool: 'tools' };

function projectionOf(entityType, entities = []) {
  return projectWorldScopeEntity({
    entityType,
    corpus: { entities, defaults: [], membership: [] },
    systems: [],
  });
}

describe('the two identity shape facts are derived, and the bridge is pinned', () => {
  it('resolves a descriptor for each SINGULAR entity type', () => {
    // NON-VACUITY FIRST. Every clause below reads `WORLD_SCOPE_DESCRIPTORS[type]`; imported from
    // the wrong module that lookup is `undefined` for all three and each of them passes over an
    // empty projection.
    for (const entityType of ENTITY_TYPES) {
      assert.ok(
        WORLD_SCOPE_DESCRIPTORS[entityType],
        `${entityType} resolves no descriptor — the import is the plural module and every ` +
          'per-type assertion in this file is vacuous'
      );
    }
  });

  it('reads a NON-EMPTY identity field list for every key the derivation bridges to', () => {
    // The bridge is the defect surface: the identity lists are keyed PLURAL and the descriptors
    // SINGULAR, so a derivation that dropped it reads `undefined` three times and answers
    // `false` everywhere. This pins each list it must reach.
    for (const entityType of ENTITY_TYPES) {
      const fields = WORLD_IDENTITY_FIELDS[IDENTITY_KEYS[entityType]];
      assert.ok(
        Array.isArray(fields) && fields.length > 0,
        `WORLD_IDENTITY_FIELDS.${IDENTITY_KEYS[entityType]} is empty or absent, so a derivation ` +
          'over it cannot answer true for anything and the set equalities below are satisfied ' +
          'by a broken bridge'
      );
    }
  });

  it('answers sourceLinked TRUE for exactly the component and the tool', () => {
    const linked = ENTITY_TYPES.filter((type) => projectionOf(type).sourceLinked === true);
    assert.deepEqual(linked, ['component', 'tool']);
  });

  it('answers hasColorToken TRUE for exactly the essence', () => {
    const tinted = ENTITY_TYPES.filter((type) => projectionOf(type).hasColorToken === true);
    assert.deepEqual(tinted, ['essence']);
  });

  it('echoes both facts on the UNAVAILABLE projection too', () => {
    // A screen that read them only off an available projection would suppress the source badge
    // and the tint the moment the corpus failed to read — a different render for a different
    // reason, which is the shape of a defect nobody reports.
    assert.equal(emptyWorldScopeEntityState('component').sourceLinked, true);
    assert.equal(emptyWorldScopeEntityState('component').hasColorToken, false);
    assert.equal(emptyWorldScopeEntityState('essence').sourceLinked, false);
    assert.equal(emptyWorldScopeEntityState('essence').hasColorToken, true);
  });

  it('leaves `enabled` ABSENT on a component row rather than false', () => {
    // `'enabled' in row` is the only correct read: a consumer branching on truthiness is
    // satisfied by an absent key today and by a persisted `false` tomorrow.
    const component = projectWorldScopeEntity({
      entityType: 'component',
      corpus: { entities: [{ id: 'ash' }], defaults: [], membership: [] },
      systems: [{ id: 'sys-a', name: 'Forge' }],
    });
    assert.equal('enabled' in component.entries[0].systems[0], false);
    const essence = projectWorldScopeEntity({
      entityType: 'essence',
      corpus: { entities: [{ id: 'ash' }], defaults: [], membership: [] },
      systems: [{ id: 'sys-a', name: 'Forge' }],
    });
    assert.equal('enabled' in essence.entries[0].systems[0], true);
  });
});

describe('scopedEntityListModel filters', () => {
  const entries = [
    { id: 'a', entity: { name: 'Ash', description: 'Grey powder' }, membershipCount: 2, systems: [] },
    { id: 'b', entity: { name: 'Bone', description: 'White' }, membershipCount: 0, systems: [] },
    { id: 'c', entity: { name: 'Coal', description: 'Ashen black' }, membershipCount: 1, systems: [] },
  ];

  it('matches the search over the derived string, not just the name', () => {
    const model = createScopedEntityListModel();
    const { rows } = model.project({ entries, query: 'ash' });
    assert.deepEqual(
      rows.map((row) => row.id),
      ['a', 'c']
    );
  });

  it('offers the WORLD membership vocabulary over membershipCount', () => {
    const model = createScopedEntityListModel();
    assert.deepEqual(WORLD_MEMBERSHIP_FILTERS, ['all', 'member', 'unused']);
    assert.deepEqual(
      model.project({ entries, membership: 'member' }).rows.map((row) => row.id),
      ['a', 'c']
    );
    assert.deepEqual(
      model.project({ entries, membership: 'unused' }).rows.map((row) => row.id),
      ['b']
    );
    assert.equal(model.project({ entries, membership: 'all' }).rows.length, 3);
  });

  it('offers the SYSTEM membership vocabulary over the resolved row', () => {
    assert.deepEqual(SYSTEM_MEMBERSHIP_FILTERS, ['all', 'in', 'out']);
    const scoped = entries.map((entry, position) => ({
      ...entry,
      systems: [
        { systemId: 'sys-a', systemName: 'Forge', member: position !== 1, inherited: {} },
        { systemId: 'sys-b', systemName: 'Loom', member: false, inherited: {} },
      ],
    }));
    const model = createScopedEntityListModel();
    assert.deepEqual(
      model.project({ entries: scoped, systemId: 'sys-a', membership: 'in' }).rows.map((r) => r.id),
      ['a', 'c']
    );
    assert.deepEqual(
      model.project({ entries: scoped, systemId: 'sys-a', membership: 'out' }).rows.map((r) => r.id),
      ['b']
    );
    // The SAME entries against a different system, so the answer is the row's and not the entry's.
    assert.equal(
      model.project({ entries: scoped, systemId: 'sys-b', membership: 'in' }).rows.length,
      0
    );
  });

  it('applies a lane filter only when its value is neither blank nor `all`', () => {
    const model = createScopedEntityListModel();
    const filters = [
      { id: 'kind', matches: (entry, value) => entry.entity.description.includes(value) },
    ];
    assert.equal(model.project({ entries, filters, filterValues: { kind: '' } }).rows.length, 3);
    assert.equal(model.project({ entries, filters, filterValues: { kind: 'all' } }).rows.length, 3);
    assert.deepEqual(
      model
        .project({ entries, filters, filterValues: { kind: 'White' } })
        .rows.map((row) => row.id),
      ['b']
    );
  });

  it('sorts by the shipped vocabulary and by a lane descriptor', () => {
    const model = createScopedEntityListModel();
    assert.deepEqual(SCOPED_LIST_SORTS, ['name-asc', 'name-desc', 'systems-desc']);
    assert.deepEqual(
      model.project({ entries, sort: 'name-asc' }).rows.map((row) => row.id),
      ['a', 'b', 'c']
    );
    assert.deepEqual(
      model.project({ entries, sort: 'name-desc' }).rows.map((row) => row.id),
      ['c', 'b', 'a']
    );
    assert.deepEqual(
      model.project({ entries, sort: 'systems-desc' }).rows.map((row) => row.id),
      ['a', 'c', 'b']
    );
    const sorts = [{ id: 'by-id-desc', compare: (left, right) => (left.id < right.id ? 1 : -1) }];
    assert.deepEqual(
      model.project({ entries, sort: 'by-id-desc', sorts }).rows.map((row) => row.id),
      ['c', 'b', 'a']
    );
  });

  it('falls back to the id when an entry has no name', () => {
    assert.equal(scopedEntryName({ id: 'ash', entity: {} }), 'ash');
    assert.equal(scopedEntryName({ id: 'ash', entity: { name: '  ' } }), 'ash');
    assert.equal(defaultScopedSearchText({ entity: { name: 'Ash', description: 'Grey' } }), 'ash grey');
  });
});

describe('the two memos, counted', () => {
  const CORPUS_SIZE = 2000;

  function corpus(size = CORPUS_SIZE) {
    return Array.from({ length: size }, (unused, position) => ({
      id: `e-${position}`,
      entity: { name: `Ash ${position}`, description: 'Grey powder' },
      membershipCount: position % 3,
      systems: [],
    }));
  }

  it('invokes searchOf EXACTLY once per entry per (entries, searchOf) change', () => {
    // THE QUERY MATCHES EVERY ROW ON PURPOSE. `Array.prototype.sort` invokes its comparator zero
    // times over a set of one, so a narrow query would let a comparator that re-derives the
    // search string survive this count entirely.
    const entries = corpus();
    let calls = 0;
    const searchOf = (entry) => {
      calls += 1;
      return `${entry.entity.name} ${entry.entity.description}`.toLowerCase();
    };
    const model = createScopedEntityListModel();

    const first = model.project({ entries, searchOf, query: 'ash' });
    assert.equal(first.rows.length, CORPUS_SIZE, 'the query must match every row, or see above');
    assert.equal(calls, CORPUS_SIZE);

    // A second pass over the SAME entries and searchOf, with a different query and a different
    // sort: the index is reused, so the count does not move.
    const second = model.project({ entries, searchOf, query: 'ash 1', sort: 'name-desc' });
    assert.equal(calls, CORPUS_SIZE, 'a second pass rebuilt the index');
    // …and the memo is not merely stale: the second pass answers its own query.
    assert.ok(second.rows.length > 0 && second.rows.length < CORPUS_SIZE);
    assert.ok(second.rows.every((row) => row.entity.name.toLowerCase().includes('ash 1')));

    // A NEW entries array rebuilds it, once per entry again.
    model.project({ entries: corpus(), searchOf, query: 'ash' });
    assert.equal(calls, CORPUS_SIZE * 2);
  });

  it('resolves the system row in O(N) index reads rather than O(N x S)', () => {
    const SYSTEM_COUNT = 8;
    const ENTRY_COUNT = 50;
    let reads = 0;
    const entries = Array.from({ length: ENTRY_COUNT }, (unused, position) => {
      const rows = Array.from({ length: SYSTEM_COUNT }, (ignored, index) => ({
        systemId: `sys-${index}`,
        systemName: `System ${index}`,
        member: index === SYSTEM_COUNT - 1,
        inherited: {},
      }));
      return {
        id: `e-${position}`,
        entity: { name: `Ash ${position}` },
        membershipCount: 1,
        // Counts INDEX reads only; a property read on a resolved row is not an array access.
        systems: new Proxy(rows, {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1;
            return Reflect.get(target, key, receiver);
          },
        }),
      };
    });

    const model = createScopedEntityListModel();
    // The LAST system, so a naive `.find()` per entry walks the whole row array every time.
    const { rows, systemRows } = model.project({
      entries,
      systemId: `sys-${SYSTEM_COUNT - 1}`,
      membership: 'in',
    });
    assert.equal(rows.length, ENTRY_COUNT, 'every entry is a member, so nothing is filtered out');
    assert.equal(systemRows.get('e-0').systemId, `sys-${SYSTEM_COUNT - 1}`, 'and the row is right');
    assert.ok(
      reads <= ENTRY_COUNT + SYSTEM_COUNT,
      `resolution took ${reads} index reads for ${ENTRY_COUNT} entries over ${SYSTEM_COUNT} ` +
        `systems; O(N) is at most ${ENTRY_COUNT + SYSTEM_COUNT} and a find-per-row is ` +
        `${ENTRY_COUNT * SYSTEM_COUNT}`
    );

    const before = reads;
    model.project({ entries, systemId: `sys-${SYSTEM_COUNT - 1}`, membership: 'all' });
    assert.equal(reads, before, 'a second pass over the same (entries, systemId) re-resolved');
  });
});

describe('nothing shipped is restated', () => {
  const source = readFileSync(resolve(repoRoot, 'src/utils/scopedEntityListModel.js'), 'utf8');
  const framePath = 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte';
  const frame = readFileSync(resolve(repoRoot, framePath), 'utf8');

  it('imports the shipped selection reducer and page arithmetic INTO THE FRAME', () => {
    // Asserted on the frame rather than on the model because the model must not own either: the
    // composition is what reaches for them. Pinned by equality on the imported bindings so
    // deleting one and inlining its arithmetic reds here rather than only in a behaviour test.
    for (const name of [
      'toggleBulkSelection',
      'setBulkSelection',
      'describeBulkSelection',
      'pruneBulkSelection',
    ]) {
      assert.equal(
        frame.includes(name),
        true,
        `${framePath} must compose ${name} from src/utils/bulkSelectionModel.js`
      );
    }
    assert.match(frame, /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\/bulkSelectionModel\.js'/);
    assert.match(frame, /import \{ paginateRows \} from '[^']*browserPagination\.js'/);
    // The bindings resolve to the real exports, so the string match above is about the module the
    // repository actually ships rather than about a same-named local.
    for (const fn of [
      toggleBulkSelection,
      setBulkSelection,
      describeBulkSelection,
      pruneBulkSelection,
      paginateRows,
    ]) {
      assert.equal(typeof fn, 'function');
    }
  });

  it('exports no selection reducer and no page arithmetic of its own', () => {
    const exported = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map(
      (match) => match[1]
    );
    assert.ok(exported.length > 0, 'the export scrape found nothing, so this assertion is vacuous');
    for (const banned of [
      'toggleBulkSelection',
      'setBulkSelection',
      'describeBulkSelection',
      'pruneBulkSelection',
      'cycleTriStateStaging',
      'paginateRows',
    ]) {
      assert.equal(
        exported.includes(banned),
        false,
        `${banned} already exists once in this repository; a second copy is what the module it ` +
          'lives in exists to prevent'
      );
    }
    assert.equal(source.includes('pageCount'), false, 'page arithmetic belongs to paginateRows');
  });
});

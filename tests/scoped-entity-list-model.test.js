/**
 * The pure half of the scoped-entity list shells (issue 1380, epic 1357). the TWO IDENTITY SHAPE
 * FACTS are DERIVED from the lifted identity field lists, with the key-space bridge pinned
 * NON-VACUOUS before any per-type answer is read.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WORLD_IDENTITY_FIELDS } from '../src/systems/worldScopeEntityGrouping.js';
// BY PATH, and the path matters.
import {
  emptyWorldScopeEntityState,
  projectWorldScopeEntity,
  WORLD_SCOPE_DESCRIPTORS,
} from '../src/ui/svelte/stores/worldScopeProjection.js';
// ALL THREE SHIPPED SORTS, run rather than restated.
import { sortComponents } from '../src/ui/model/componentBrowserModel.js';
import { sortEssences } from '../src/ui/model/essenceBrowserModel.js';
import { sortRecipes } from '../src/ui/model/recipeBrowserModel.js';
import {
  createScopedEntityListModel,
  defaultScopedSearchText,
  scopedEntryName,
  SCOPED_LIST_SORTS,
  SYSTEM_MEMBERSHIP_FILTERS,
  WORLD_MEMBERSHIP_FILTERS,
} from '../src/ui/model/scopedEntityListModel.js';
import * as listModel from '../src/ui/model/scopedEntityListModel.js';
import { defineStructureContract } from './helpers/structureContract.js';

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

  // The pins above use this file's OWN COPY of the bridge, so this row reads production's.
  defineStructureContract(
    'reads the bridge OUT OF THE PRODUCTION MODULE, one plural key per singular type',
    { file: 'src/ui/svelte/stores/worldScopeProjection.js', constant: 'IDENTITY_FIELD_KEY' },
    { contains: [`Object.freeze({ component: 'components', essence: 'essences', tool: 'tools' })`] }
  );

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

  it('publishes a PER-ENTRY source-link answer over all three fields', () => {
    // The descriptor says whether the TYPE has the fields; this says whether this entity filled one
    // in, and it is what decides which badge a GM sees.
    const projected = projectWorldScopeEntity({
      entityType: 'component',
      corpus: {
        entities: [
          { id: 'origin', originItemUuid: 'Item.a' },
          { id: 'registered', registeredItemUuid: 'Item.b' },
          { id: 'alias', aliasItemUuids: ['Item.c'] },
          { id: 'empty-alias', aliasItemUuids: [] },
          { id: 'none' },
        ],
        defaults: [],
        membership: [],
      },
      systems: [],
    });
    assert.deepEqual(
      projected.entries.map((entry) => [entry.id, entry.hasSourceLink]),
      [
        ['origin', true],
        ['registered', true],
        ['alias', true],
        ['empty-alias', false],
        ['none', false],
      ]
    );
    // An essence has none of the fields, so the answer is structurally false rather than a
    // question about its record.
    const essence = projectWorldScopeEntity({
      entityType: 'essence',
      corpus: { entities: [{ id: 'ash', originItemUuid: 'Item.x' }], defaults: [], membership: [] },
      systems: [],
    });
    assert.equal(essence.entries[0].hasSourceLink, false);
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
    {
      id: 'a',
      entity: { name: 'Ash', description: 'Grey powder' },
      membershipCount: 2,
      systems: [],
    },
    { id: 'b', entity: { name: 'Bone', description: 'White' }, membershipCount: 0, systems: [] },
    {
      id: 'c',
      entity: { name: 'Coal', description: 'Ashen black' },
      membershipCount: 1,
      systems: [],
    },
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
      model
        .project({ entries: scoped, systemId: 'sys-a', membership: 'out' })
        .rows.map((r) => r.id),
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
    // EVERY KEY CARRIES BOTH DIRECTIONS (issue 1372).
    assert.deepEqual(SCOPED_LIST_SORTS, ['name-asc', 'name-desc', 'systems-asc', 'systems-desc']);
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
    // THE MIRROR, and it is not merely the reverse of the line above: the NAME tie-break runs in
    // the same direction on both, so entities on an equal membership count keep one stable
    // neighbourhood whichever way the count is ordered.
    assert.deepEqual(
      model.project({ entries, sort: 'systems-asc' }).rows.map((row) => row.id),
      ['b', 'c', 'a']
    );
    const sorts = [{ id: 'by-id-desc', compare: (left, right) => (left.id < right.id ? 1 : -1) }];
    assert.deepEqual(
      model.project({ entries, sort: 'by-id-desc', sorts }).rows.map((row) => row.id),
      ['c', 'b', 'a']
    );
  });

  it('orders names EXACTLY as the three shipped browser models do', () => {
    // PINNED BY RUNNING THE SHIPPED SORT, NOT BY RESTATING IT ───────────────────────────── This
    // case previously built its expectation from a hand-written `localeCompare` inside this file
    // and claimed that pinned the order "against the shipped comparator".
    const NAMES = ['Zinc', 'Écorce', 'Ash 10', 'Ash 2', 'Ash', 'ash', 'Birch'];
    const named = (name, index) => ({
      id: `e-${index}`,
      entity: { name },
      membershipCount: 0,
      systems: [],
    });
    const model = createScopedEntityListModel();
    const { rows } = model.project({ entries: NAMES.map((name, index) => named(name, index)) });

    // ALL THREE, because the claim is about all three.
    const rowsOf = (name) => ({ name });
    const orders = {
      components: sortComponents(NAMES.map(rowsOf)).map((row) => row.name),
      essences: sortEssences(NAMES.map(rowsOf)).map((row) => row.name),
      recipes: sortRecipes(NAMES.map(rowsOf)).map((row) => row.name),
    };
    assert.deepEqual(orders.essences, orders.components, 'two studios already disagree');
    assert.deepEqual(orders.recipes, orders.components, 'two studios already disagree');

    assert.deepEqual(
      rows.map((row) => row.entity.name),
      orders.components,
      'this list and the studios one route away must order one corpus one way'
    );

    // THE FIXTURE INCLUDES A CASE-ONLY PAIR ON PURPOSE.
    assert.ok(
      NAMES.filter((name) => name.toLowerCase() === 'ash').length === 2,
      'the case-only pair is gone, so the lowercased-key regression is unobservable here'
    );

    // NON-VACUITY. A raw code-point compare is what this collator replaced, and it must produce
    // a DIFFERENT answer on this fixture, or the assertion above is satisfied by the thing it
    // exists to reject.
    const codePoint = [...NAMES].sort((left, right) => {
      if (left < right) return -1;
      return left > right ? 1 : 0;
    });
    assert.notDeepEqual(
      codePoint,
      orders.components,
      'the fixture no longer distinguishes a locale compare from a code-point one'
    );
  });

  it('falls back to the id when an entry has no name', () => {
    assert.equal(scopedEntryName({ id: 'ash', entity: {} }), 'ash');
    assert.equal(scopedEntryName({ id: 'ash', entity: { name: '  ' } }), 'ash');
    assert.equal(
      defaultScopedSearchText({ entity: { name: 'Ash', description: 'Grey' } }),
      'ash grey'
    );
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
    // THE QUERY MATCHES EVERY ROW ON PURPOSE.
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
  // Asserted on the frame rather than on the model because the model must not own either: the
  // composition is what reaches for them.
  defineStructureContract(
    'the FRAME composes the shipped selection reducer and page arithmetic',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    {
      imports: [
        '../../../../../utils/bulkSelectionModel.js',
        '../../../../model/browserPagination.js',
      ],
      calls: [
        'toggleBulkSelection',
        'setBulkSelection',
        'describeBulkSelection',
        'pruneBulkSelection',
        'paginateRows',
      ],
    }
  );

  it('the model exports no selection reducer and no page arithmetic of its own', () => {
    const exported = Object.keys(listModel);
    assert.ok(exported.includes('createScopedEntityListModel'), 'the namespace is the real model');
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
  });

  defineStructureContract(
    'page arithmetic belongs to paginateRows',
    'src/ui/model/scopedEntityListModel.js',
    {
      namesNo: ['pageCount'],
      mentionsNo: ['pageCount'],
    }
  );
  defineStructureContract('which is where the name lives', 'src/ui/model/browserPagination.js', {
    names: ['pageCount'],
  });
});

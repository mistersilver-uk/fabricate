/**
 * The shared bulk-selection composable (issue 1706). Both sources are reactive — a `SvelteMap`
 * behind a property proxy for the lifted browser state, a `SvelteSet` for the filtered corpus —
 * because the composable's deriveds must be invalidated by the caller's own source, as a view's
 * `$derived` list and `$state` browser object are; a plain object is read once and then cached
 * forever, which would make every liveness assertion here vacuous. The reduction's own arithmetic
 * belongs to `tests/bulk-selection-model.test.js` over `src/utils/bulkSelectionModel.js` and is not
 * restated: this suite proves the wiring forwards to it.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';
import { describeBulkSelection } from '../src/utils/bulkSelectionModel.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/bulkSelection.svelte.js';

/**
 * The lifted browser state a view binds: a `$state` proxy in the app, and here a per-key reactive
 * map behind the same property access, since no rune can be written in a plain test file.
 */
function liftedState(initial = {}) {
  const fields = new SvelteMap(Object.entries(initial));
  return new Proxy(
    {},
    {
      get: (_, key) => fields.get(key),
      set: (_, key, value) => {
        fields.set(key, value);
        return true;
      },
      has: (_, key) => fields.has(key),
    }
  );
}

const sorted = (ids) => [...ids].sort((a, b) => a.localeCompare(b));

describe('bulkSelection', () => {
  let compiler;
  let createBulkSelection;
  let createBulkSelectionOwner;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-bulk-selection-');
    ({ createBulkSelection, createBulkSelectionOwner } =
      await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One browser-view selection over a live filtered corpus, with the page as its first `size` ids. */
  function openSelection({ filtered = ['a', 'b', 'c'], pageSize = 2, selected = [], onCleared } = {}) {
    const corpus = new SvelteSet(filtered);
    const state = liftedState({ ids: new Set(selected) });
    const filteredIds = () => [...corpus];
    const pageIds = () => [...corpus].slice(0, pageSize);
    const selection = createBulkSelection({
      state: () => state,
      key: 'ids',
      filteredIds,
      pageIds,
      onCleared,
    });
    return { selection, state, corpus, filteredIds, pageIds };
  }

  it('forwards to describeBulkSelection rather than re-deriving the reduction', () => {
    const { selection, filteredIds, pageIds } = openSelection({ selected: ['a'] });

    assert.deepEqual(
      selection.summary,
      describeBulkSelection({
        pageIds: pageIds(),
        filteredIds: filteredIds(),
        selectedIds: selection.selectedIds,
      })
    );
  });

  it('toggles into a NEW Set and never mutates the stored one', () => {
    const { selection, state } = openSelection({ selected: ['a'] });
    const before = state.ids;

    selection.toggle('b');
    flushSync();

    assert.notEqual(state.ids, before, 'the reactive unit is the field, so a write replaces the Set');
    assert.deepEqual(sorted(before), ['a'], 'and the Set that was stored is left untouched');
    assert.deepEqual(sorted(selection.selectedIds), ['a', 'b']);

    selection.toggle('a');
    flushSync();
    assert.deepEqual(sorted(selection.selectedIds), ['b'], 'toggling a selected id drops it');
  });

  it('acts on exactly the page from the page box, leaving an off-page selection alone', () => {
    const { selection, state } = openSelection({ selected: ['c'] });

    selection.setPageSelected(true);
    flushSync();
    assert.deepEqual(sorted(selection.selectedIds), ['a', 'b', 'c'], 'the page joins the selection');

    selection.setPageSelected(false);
    flushSync();
    assert.deepEqual(
      sorted(state.ids),
      ['c'],
      'clearing the page must never reach a row the page does not render'
    );
  });

  it('reaches an id the page omits through selectAllResults', () => {
    const { selection, pageIds } = openSelection();

    assert.ok(!pageIds().includes('c'), 'the control: the page cannot reach that id');
    selection.selectAllResults();
    flushSync();

    assert.deepEqual(sorted(selection.selectedIds), ['a', 'b', 'c']);
  });

  it('clears by writing first and then announcing, exactly once', () => {
    const log = [];
    const { selection, state } = openSelection({
      selected: ['a', 'b'],
      onCleared: () => log.push(`cleared size=${state.ids.size}`),
    });

    selection.clear();
    flushSync();

    assert.deepEqual(log, ['cleared size=0'], 'the callback sees the emptied field, and runs once');
    assert.equal(selection.selectedIds.size, 0);
  });

  it('clears without an onCleared callback, which every call site leaves optional', () => {
    const { selection, state } = openSelection({ selected: ['a'] });

    assert.doesNotThrow(() => selection.clear());
    flushSync();
    assert.equal(state.ids.size, 0, 'the write still happened');
  });

  it('resets silently, because a crafting-system switch is not an emptying the GM performed', () => {
    let announced = 0;
    const { selection, state } = openSelection({
      selected: ['a', 'b'],
      onCleared: () => (announced += 1),
    });

    selection.reset();
    flushSync();

    assert.equal(state.ids.size, 0, 'the selection is emptied');
    assert.equal(announced, 0, 'and nothing is announced');
  });

  it('prunes a phantom id, and holds the Set identity when nothing dropped', () => {
    const { selection, state } = openSelection({ selected: ['a', 'gone'] });

    selection.prune(['a', 'b', 'c']);
    flushSync();
    assert.deepEqual(sorted(selection.selectedIds), ['a'], 'an id with no row cannot survive');

    const settled = state.ids;
    selection.prune(['a', 'b', 'c']);
    flushSync();
    assert.equal(state.ids, settled, 'an unchanged selection is not reassigned, so no effect loops');
  });

  it('moves selectAllResultsCount when the filtered source grows after construction', () => {
    const { selection, corpus } = openSelection({ selected: ['a'] });
    assert.equal(selection.summary.selectAllResultsCount, 3);

    corpus.add('d');
    corpus.add('e');
    flushSync();

    assert.equal(
      selection.summary.selectAllResultsCount,
      5,
      'the thunk is read inside the composable`s own derived, so the caller`s list stays live'
    );
  });

  it('re-targets every read and write when the object state() returns is swapped', () => {
    const first = liftedState({ ids: new Set(['a']) });
    const second = liftedState({ ids: new Set(['b', 'c']) });
    // `ui` is `$derived(browserState ?? ownBrowserState)` in every view, so the object the thunk
    // answers changes identity the moment the root binds; the holder is that live indirection.
    const holder = new SvelteMap([['ui', first]]);
    const selection = createBulkSelection({
      state: () => holder.get('ui'),
      key: 'ids',
      filteredIds: () => ['a', 'b', 'c'],
      pageIds: () => ['a', 'b', 'c'],
    });
    assert.deepEqual(sorted(selection.selectedIds), ['a']);

    holder.set('ui', second);
    flushSync();
    assert.deepEqual(sorted(selection.selectedIds), ['b', 'c'], 'the read follows the new object');

    selection.toggle('a');
    flushSync();
    assert.deepEqual(sorted(second.ids), ['a', 'b', 'c'], 'and so does the write');
    assert.deepEqual(sorted(first.ids), ['a'], 'while the object it left is untouched');
  });

  it('counts, projects and empties the owner side against the same lifted field', () => {
    const announced = [];
    const state = liftedState({ ids: new Set(['c', 'a']) });
    const corpus = new SvelteSet([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const owner = createBulkSelectionOwner({
      state: () => state,
      key: 'ids',
      rows: () => [...corpus],
      announce: (message) => announced.push(message ?? 'default'),
    });

    assert.equal(owner.count, 2);
    assert.deepEqual(
      owner.rows.map((row) => row.id),
      ['a', 'c'],
      'the rows are the corpus filtered by the selection, so they keep the corpus order'
    );

    // The count is the IDS, never the projected rows: between a delete and the view's prune a
    // selected id resolves to no row, and the panel still names what the GM ticked.
    state.ids = new Set(['a', 'c', 'deleted']);
    flushSync();
    assert.equal(owner.count, 3, 'an id with no row still counts');
    assert.equal(owner.rows.length, 2, 'while the projection carries only the rows that resolve');

    owner.clear('12 components updated.');
    flushSync();
    assert.equal(state.ids.size, 0, 'the field is emptied');
    assert.deepEqual(announced, ['12 components updated.'], 'and the caller`s message is announced');

    owner.announceCleared('nothing changed');
    flushSync();
    assert.deepEqual(announced, ['12 components updated.', 'nothing changed']);
  });

  it('re-projects the owner rows when the corpus grows under a settled selection', () => {
    const state = liftedState({ ids: new Set(['a', 'c']) });
    const corpus = new SvelteSet([{ id: 'a' }, { id: 'b' }]);
    const owner = createBulkSelectionOwner({
      state: () => state,
      key: 'ids',
      rows: () => [...corpus],
    });

    assert.deepEqual(
      owner.rows.map((row) => row.id),
      ['a'],
      'the control: the corpus resolves no row for the second selected id yet'
    );

    corpus.add({ id: 'c' });
    flushSync();
    assert.deepEqual(
      owner.rows.map((row) => row.id),
      ['a', 'c'],
      'the corpus thunk is read inside the owner`s own derived, so the root`s rows stay live'
    );
  });

  it('changes owner.ids identity on an equal-size write while owner.count stays equal', () => {
    const state = liftedState({ ids: new Set(['a', 'b']) });
    const owner = createBulkSelectionOwner({
      state: () => state,
      key: 'ids',
      rows: () => [],
    });
    const before = owner.ids;

    state.ids = new Set(['c', 'd']);
    flushSync();

    assert.notEqual(owner.ids, before, 'a write always replaces the Set, whatever its size');
    assert.equal(owner.count, 2, 'while the count, derived from size, recomputes to the same number');
  });

  it('returns the SAME rows array on a second owner read with nothing changed', () => {
    const owner = createBulkSelectionOwner({
      state: () => liftedState({ ids: new Set(['a']) }),
      key: 'ids',
      rows: () => [{ id: 'a' }, { id: 'b' }],
    });

    assert.equal(
      owner.rows,
      owner.rows,
      'a getter that recomputed would mint a new array per read and churn every panel prop'
    );
  });

  it('returns the SAME Set on a second selectedIds read with nothing changed', () => {
    const { selection, state } = openSelection({ selected: ['a'] });

    assert.equal(
      selection.selectedIds,
      selection.selectedIds,
      'a getter that recomputed would mint a new Set per read and re-run every impact derivation'
    );

    // The FALLBACK is the only branch on which a recomputing getter is visible: with the field
    // present both reads answer the one stored Set whether the read is memoised or not.
    state.ids = undefined;
    flushSync();
    assert.equal(
      selection.selectedIds,
      selection.selectedIds,
      'including with no field to read, where each read would otherwise build its own empty Set'
    );
  });
});

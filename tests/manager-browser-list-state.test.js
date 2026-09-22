/**
 * The shared browse-list composable (issue 1716). The lifted state a view binds is a `$state`
 * proxy in the app, so the fixture here is per-key reactive too: a plain object is read once and
 * cached by the first derived, which would make every liveness assertion vacuous. The fixture also
 * logs its writes, because one contract — the clamp that must write nothing at all — is observable
 * as an absent write and not as a value.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/browserListState.svelte.js';

/** A lifted browser-state double: reactive per key, and recording every key written to it. */
function trackedState(seed = {}) {
  const fields = new SvelteMap(Object.entries(seed));
  const written = [];
  const facade = new Proxy(
    {},
    {
      get: (_, key) => fields.get(key),
      set: (_, key, value) => {
        written.push(key);
        fields.set(key, value);
        return true;
      },
    }
  );
  return { facade, written };
}

/** A reactive corpus the page window reads through its thunk, so a test can grow it live. */
function trackedRows(initial = []) {
  const lengths = new SvelteMap([['rows', initial]]);
  return {
    rows: () => lengths.get('rows'),
    replace: (next) => lengths.set('rows', next),
  };
}

const numbers = (count) => Array.from({ length: count }, (_, index) => index + 1);

describe('browserListState', () => {
  let compiler;
  let createBrowserListState;
  let createBrowserPageWindow;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-browser-list-state-');
    ({ createBrowserListState, createBrowserPageWindow } =
      await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One sentinel over a lifted state seeded with a GM's filter choices. */
  function openList({ seed = {}, resetAxes = {}, onSystemSwitch } = {}) {
    const { facade, written } = trackedState(seed);
    const list = createBrowserListState({ state: () => facade, resetAxes, onSystemSwitch });
    return { list, state: facade, written };
  }

  /** One page window over a live corpus. */
  function openWindow({ seed = {}, rows = [], defaultPageSize = 10 } = {}) {
    const { facade, written } = trackedState(seed);
    const corpus = trackedRows(rows);
    const page = createBrowserPageWindow({
      state: () => facade,
      rows: corpus.rows,
      defaultPageSize,
    });
    return { page, state: facade, written, corpus };
  }

  it('resets exactly the declared axes and leaves an undeclared one alone', () => {
    const { list, state } = openList({
      seed: { statusFilter: 'active', sortKey: 'difficulty' },
      resetAxes: { statusFilter: 'all' },
    });

    list.syncSystem('sys-2');
    flushSync();

    assert.equal(
      state.statusFilter,
      'all',
      'a declared axis names a vocabulary the new system does not share'
    );
    assert.equal(state.sortKey, 'difficulty', 'an undeclared axis is a preference and survives');
    assert.equal(state.systemId, 'sys-2', 'and the sentinel now names the new system');
  });

  it('resets pageIndex when the caller declares it', () => {
    const { list, state } = openList({
      seed: { pageIndex: 3 },
      resetAxes: { pageIndex: 0 },
    });

    list.syncSystem('sys-2');
    flushSync();

    assert.equal(state.pageIndex, 0, 'the studios declare it, so page 4 of the old corpus goes');
  });

  it('leaves pageIndex untouched when the caller does not declare it', () => {
    // EnvironmentsBrowserView's shipped contract: its resets only widen the corpus, so a GM
    // reading page 4 stays on page 4.
    const { list, state } = openList({
      seed: { pageIndex: 3, biomeFilter: 'forest' },
      resetAxes: { biomeFilter: 'all' },
    });

    list.syncSystem('sys-2');
    flushSync();

    assert.equal(state.biomeFilter, 'all');
    assert.equal(state.pageIndex, 3, 'a factory that reset the page would add a reset it omits');
  });

  it('writes the sentinel last, after the resets and the callback alike', () => {
    const { facade, written } = trackedState({ systemId: 'sys-1', statusFilter: 'active' });
    const seenDuringCallback = [];
    const list = createBrowserListState({
      state: () => facade,
      resetAxes: { statusFilter: 'all' },
      onSystemSwitch: () => seenDuringCallback.push([facade.systemId, facade.statusFilter]),
    });

    list.syncSystem('sys-2');
    flushSync();

    assert.deepEqual(
      seenDuringCallback,
      [['sys-1', 'all']],
      'the callback sees the resets done and the outgoing system still in place'
    );
    assert.deepEqual(written, ['statusFilter', 'systemId'], 'and the sentinel is the last write');
  });

  it('is a no-op on a second call with the same id, leaving a GM-set filter alone', () => {
    const { list, state, written } = openList({
      seed: { systemId: 'sys-1', statusFilter: 'all' },
      resetAxes: { statusFilter: 'all' },
    });

    list.syncSystem('sys-2');
    flushSync();
    state.statusFilter = 'disabled';
    const after = written.length;

    list.syncSystem('sys-2');
    flushSync();

    assert.equal(state.statusFilter, 'disabled', 'the filter the GM set survives the repeat call');
    assert.equal(written.length, after, 'and the guard wrote nothing at all');
  });

  it('writes and returns without throwing when onSystemSwitch is absent', () => {
    const { list, state } = openList({ resetAxes: { statusFilter: 'all' } });

    assert.doesNotThrow(() => list.syncSystem('sys-2'));
    flushSync();
    assert.equal(state.systemId, 'sys-2');
  });

  it('re-targets every read when the object state() returns is swapped', () => {
    let current = trackedState({ systemId: 'sys-1' });
    const list = createBrowserListState({
      state: () => current.facade,
      resetAxes: { statusFilter: 'all' },
    });

    current = trackedState({ systemId: 'sys-2', statusFilter: 'active' });
    list.syncSystem('sys-2');
    flushSync();

    assert.equal(
      current.facade.statusFilter,
      'active',
      'the guard read the sentinel on the new object, so the switch was a no-op'
    );
    assert.deepEqual(current.written, [], 'a stale capture would have reset this object instead');
  });

  it('re-targets every write when the object state() returns is swapped', () => {
    let current = trackedState({ systemId: 'sys-1' });
    const stale = current;
    const list = createBrowserListState({
      state: () => current.facade,
      resetAxes: { statusFilter: 'all' },
    });

    current = trackedState({ systemId: 'sys-1' });
    list.syncSystem('sys-2');
    flushSync();

    assert.deepEqual(current.written, ['statusFilter', 'systemId'], 'the new object took them');
    assert.deepEqual(stale.written, [], 'and the object the factory saw first took none');
  });

  it('slices exactly the requested window and nothing either side of it', () => {
    const { page } = openWindow({ seed: { pageIndex: 1, pageSize: 4 }, rows: numbers(10) });

    assert.deepEqual(page.pageRows, [5, 6, 7, 8]);
  });

  it('answers an out-of-range index with nothing rather than with the last page', () => {
    // The shipped divergence from `ui-manager-shell`'s "clamped to the last valid page":
    // `paginateRows` would answer [9, 10] here, and adopting it would be a behaviour change.
    const { page } = openWindow({ seed: { pageIndex: 7, pageSize: 4 }, rows: numbers(10) });

    assert.deepEqual(page.pageRows, []);
  });

  it('re-projects when the corpus grows after construction', () => {
    const { page, corpus } = openWindow({ seed: { pageIndex: 1, pageSize: 2 }, rows: numbers(2) });

    assert.deepEqual(page.pageRows, [], 'the control: the second page holds nothing yet');

    corpus.replace(numbers(4));
    flushSync();

    assert.deepEqual(page.pageRows, [3, 4], 'the rows thunk is read inside the derived the factory owns');
  });

  it('returns the same array on a second read with nothing changed', () => {
    const { page } = openWindow({ seed: { pageIndex: 0, pageSize: 2 }, rows: numbers(4) });

    assert.equal(
      page.pageRows,
      page.pageRows,
      'a recomputing getter would mint a fresh slice per read and churn every `{#each}` key'
    );
  });

  it('keeps a page whose last row sits exactly on the boundary', () => {
    // 15 rows at size 5: index 3 starts at 15, which is out of range, and index 2 starts at 10,
    // which is not. A clamp written with `>` instead of `>=` would keep index 3.
    const onBoundary = openWindow({ seed: { pageIndex: 3, pageSize: 5 }, rows: numbers(15) });
    onBoundary.page.clampPage();
    flushSync();
    assert.equal(onBoundary.state.pageIndex, 0, '15 rows do not reach a page starting at row 16');

    const inRange = openWindow({ seed: { pageIndex: 2, pageSize: 5 }, rows: numbers(15) });
    inRange.page.clampPage();
    flushSync();
    assert.equal(inRange.state.pageIndex, 2, 'while the last page that holds rows is left alone');
  });

  it('resets to page zero when the corpus narrows under a non-zero index', () => {
    const { page, state, corpus } = openWindow({
      seed: { pageIndex: 2, pageSize: 4 },
      rows: numbers(12),
    });

    corpus.replace(numbers(3));
    page.clampPage();
    flushSync();

    assert.equal(state.pageIndex, 0);
  });

  it('writes nothing at all over an empty corpus while pageIndex is unset', () => {
    // The only observation that separates the `index > 0` guard from its absence: with no rows
    // the mutant writes 0 over an already-zero index, which Svelte drops, so a value assertion
    // passes on it either way.
    const { page, state, written } = openWindow({ seed: {}, rows: [] });

    page.clampPage();
    flushSync();

    assert.deepEqual(written, [], 'the guard returned before touching the lifted state');
    assert.equal(state.pageIndex, undefined, 'so the field the caller never set stays unset');
  });
});

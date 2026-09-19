/**
 * The shared Player Result Order composable (issue 1695). The subject lives in a reactive
 * `SvelteMap` because the composable's deriveds must be invalidated by the thunk's own source, as a
 * store's `$derived` selection is; a plain object would be read once and then cached forever.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { expectedMemberKinds, storeMemberKinds } from '../helpers/storeMemberKinds.js';

const MODULE_PATH = 'src/ui/svelte/stores/playerResultOrder.svelte.js';

const STAGES = [
  { id: 's1', name: 'Rough', difficulty: 2, threshold: 2 },
  { id: 's2', name: 'Fine', difficulty: 3, threshold: 5 },
  { id: 's3', name: 'Master', difficulty: 4, threshold: 9 },
];

const REVERTED = 'Could not save your order. Restored the last saved order.';

const ids = (list) => list.map((stage) => stage.id);

/** A subject a test can swap, as a store's own `$derived` swaps on selection. */
function subjectSource(initial) {
  const bag = new SvelteMap([['current', initial]]);
  return {
    subject: () => bag.get('current') ?? null,
    swapTo(next) {
      bag.set('current', next);
    },
  };
}

/** The normalized subject shape each store maps its own domain object to. */
function progressive(orderId, extra = {}) {
  return { orderId, stages: STAGES, awardMode: 'equal', allowReorder: true, ...extra };
}

let compiler;
let createPlayerResultOrder;

/**
 * One composable plus the write log and the subject handle. `rejectWrite` makes the persisting seam
 * throw, which is the only way the revert path is reachable.
 */
function setup({ stored = {}, rejectWrite = false, debounceMs, markFiredStages, orderId = 'a' } = {}) {
  const writes = [];
  const source = subjectSource(progressive(orderId));
  const order = createPlayerResultOrder({
    scope: 'recipe',
    subject: source.subject,
    read: () => stored,
    write: async (key, list) => {
      writes.push({ key, order: list });
      if (rejectWrite) throw new Error('setting rejected');
      return {};
    },
    revertMessage: () => REVERTED,
    markFiredStages,
    ...(debounceMs === undefined ? {} : { debounceMs }),
  });
  order.seed();
  flushSync();
  return { order, writes, source };
}

describe('createPlayerResultOrder', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-player-result-order-');
    // The composable's real import graph, walked rather than restated.
    ({ createPlayerResultOrder } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  it('returns exactly the members both stores delegate to, each still the same kind', () => {
    const { order } = setup();
    assert.deepEqual(
      storeMemberKinds(order),
      expectedMemberKinds({
        getters: ['announcement', 'isCustom', 'key', 'orderedStages', 'orders'],
        methods: ['flush', 'reorder', 'reset', 'seed'],
      })
    );
  });

  it('namespaces the write key by scope and the subject id', () => {
    const { order } = setup({ orderId: 'blade' });
    assert.equal(order.key, 'recipe:blade');
  });

  it('seeds the stored orders and applies them to the subject', () => {
    const { order } = setup({ stored: { 'recipe:a': ['s3', 's1'] } });
    assert.deepEqual(ids(order.orderedStages), ['s3', 's1', 's2']);
  });

  it('tolerates a non-object stored map rather than seeding junk', () => {
    const { order } = setup({ stored: 'not-a-map' });
    assert.deepEqual(order.orders, {});
    assert.deepEqual(ids(order.orderedStages), ['s1', 's2', 's3']);
  });

  // Identity is the contract downstream state depends on, so each way of "nothing moved" is pinned.

  it('returns the authored stages BY IDENTITY when no order is stored', () => {
    const { order } = setup();
    assert.equal(order.orderedStages, STAGES);
  });

  it('returns the authored stages BY IDENTITY when reorder is disallowed', () => {
    const { order, source } = setup({ stored: { 'recipe:a': ['s3', 's2', 's1'] } });
    assert.deepEqual(ids(order.orderedStages), ['s3', 's2', 's1'], 'honoured while allowed');

    source.swapTo(progressive('a', { allowReorder: false }));
    flushSync();
    assert.equal(order.orderedStages, STAGES, 'and then ignored entirely');
  });

  it('returns an unusable subject BY IDENTITY, with no key to write under', () => {
    const { order, source } = setup();
    source.swapTo({ orderId: null, stages: STAGES, awardMode: 'equal', allowReorder: true });
    flushSync();
    assert.equal(order.key, null);
    assert.equal(order.orderedStages, STAGES);
  });

  it('recomputes each row THRESHOLD for the order the roll is actually spent down', () => {
    const { order } = setup({ stored: { 'recipe:a': ['s3', 's1', 's2'] } });
    // Cumulative over difficulties 4, 2, 3 — never the authored 9, 2, 5 carried along by the move.
    assert.deepEqual(
      order.orderedStages.map((stage) => stage.threshold),
      [4, 6, 9]
    );
  });

  it('marks the final list through markFiredStages, after the reorder and the recompute', () => {
    const marked = [];
    const { order } = setup({
      stored: { 'recipe:a': ['s3', 's1', 's2'] },
      markFiredStages: (stages) => {
        marked.push(ids(stages));
        return stages.map((stage) => ({ ...stage, fired: stage.id === 's3' }));
      },
    });
    assert.deepEqual(ids(order.orderedStages), ['s3', 's1', 's2']);
    assert.deepEqual(marked.at(-1), ['s3', 's1', 's2'], 'the hook sees the FINAL order');
    assert.equal(order.orderedStages[0].fired, true);
  });

  // isCustom

  it('isCustom is false for the authored order and true once the player has moved a row', () => {
    const { order } = setup();
    assert.equal(order.isCustom, false);
    order.reorder(2, 0, 'moved');
    flushSync();
    assert.equal(order.isCustom, true);
  });

  it('isCustom is false for a stored order that REPRODUCES the authored sequence', () => {
    // Dragged away and back, or re-authored into it: a Reset offered here does nothing when pressed.
    const { order } = setup({ stored: { 'recipe:a': ['s1', 's2', 's3'] } });
    assert.equal(order.isCustom, false);
  });

  it('isCustom is false when the subject has no stages at all', () => {
    const { order, source } = setup();
    source.swapTo({ orderId: 'a', stages: [], awardMode: 'equal', allowReorder: true });
    flushSync();
    assert.equal(order.isCustom, false);
  });

  // The reorder gesture

  it('reorder moves the row optimistically, announces it, and stores IDS', () => {
    const { order, writes } = setup();
    order.reorder(2, 0, 'Master moved to position 1 of 3');
    flushSync();

    assert.deepEqual(ids(order.orderedStages), ['s3', 's1', 's2'], 'before any write resolves');
    assert.equal(order.announcement, 'Master moved to position 1 of 3');
    assert.deepEqual(order.orders['recipe:a'], ['s3', 's1', 's2']);
    assert.equal(writes.length, 0, 'and nothing is written yet');
  });

  it('reorder is a no-op when the GM has pinned the order', async () => {
    const { order, writes, source } = setup();
    source.swapTo(progressive('a', { allowReorder: false }));
    flushSync();

    order.reorder(2, 0, 'nope');
    flushSync();
    await order.flush();

    assert.deepEqual(ids(order.orderedStages), ['s1', 's2', 's3']);
    assert.equal(order.announcement, '', 'and nothing is announced');
    assert.equal(writes.length, 0);
  });

  it('reorder refuses an out-of-range index or target rather than dropping a stage', () => {
    const { order } = setup();
    for (const [index, target] of [
      [0, 3],
      [0, -1],
      [-1, 0],
      [3, 0],
    ]) {
      order.reorder(index, target, 'out of range');
      flushSync();
      assert.equal(order.orderedStages, STAGES, `${index}→${target} changed nothing`);
    }
  });

  it('reset persists an EMPTY order, not the authored ids, so a later GM re-author is followed', async () => {
    const { order, writes } = setup({ stored: { 'recipe:a': ['s3', 's1', 's2'] } });
    order.reset('Order reset to the GM default.');
    flushSync();

    assert.deepEqual(order.orders['recipe:a'], []);
    assert.equal(order.orderedStages, STAGES);
    assert.equal(order.announcement, 'Order reset to the GM default.');
    await order.flush();
    assert.deepEqual(writes, [{ key: 'recipe:a', order: [] }]);
  });

  it('reset is a no-op when the GM has pinned the order', async () => {
    const { order, writes, source } = setup({ stored: { 'recipe:a': ['s3', 's1', 's2'] } });
    source.swapTo(progressive('a', { allowReorder: false }));
    flushSync();

    order.reset('nope');
    await order.flush();
    assert.equal(writes.length, 0);
  });

  // The debounce

  it('coalesces N intermediate moves into ONE write on settle', async () => {
    const { order, writes } = setup({ debounceMs: 20 });
    order.reorder(2, 1, 'a');
    order.reorder(1, 0, 'b');
    order.reorder(0, 1, 'c');
    flushSync();
    assert.equal(writes.length, 0, 'nothing is written mid-drag');

    await new Promise((settle) => setTimeout(settle, 80));
    assert.equal(writes.length, 1, 'exactly one write on settle');
    assert.equal(writes[0].key, 'recipe:a');
  });

  it('flush commits immediately (the drop path) without waiting for the debounce', async () => {
    const { order, writes } = setup({ debounceMs: 10_000 });
    order.reorder(2, 0, 'a');
    const result = await order.flush();

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(writes, [{ key: 'recipe:a', order: ['s3', 's1', 's2'] }]);
  });

  it('flush resolves ok with nothing pending, so a double call writes once', async () => {
    const { order, writes } = setup({ debounceMs: 10_000 });
    order.reorder(2, 0, 'a');
    assert.deepEqual(await order.flush(), { ok: true });
    assert.deepEqual(await order.flush(), { ok: true });
    assert.equal(writes.length, 1);
  });

  /**
   * The write key is captured when the debounce is ARMED, never re-derived at flush. A subject
   * change inside the window would otherwise commit the moved order under a key naming a different
   * recipe or participation, silently — the defect issue 859 fixed for salvage, generalized here.
   * `debounceMs` is large enough that the real timer cannot fire first and pass this vacuously.
   */
  it('commits under the key captured when the debounce was ARMED, not the current subject', async () => {
    const { order, writes, source } = setup({ debounceMs: 10_000 });
    order.reorder(2, 0, 'Master moved to position 1 of 3');
    flushSync();

    source.swapTo(progressive('b'));
    flushSync();
    assert.equal(order.key, 'recipe:b', 'the subject really did change inside the window');
    assert.equal(writes.length, 0, 'and the debounce had not fired');

    await order.flush();
    assert.deepEqual(writes, [{ key: 'recipe:a', order: ['s3', 's1', 's2'] }]);
  });

  // The revert path

  it('a REJECTED write reverts to the last persisted order and announces the revert', async () => {
    const { order } = setup({
      stored: { 'recipe:a': ['s2', 's1', 's3'] },
      rejectWrite: true,
      debounceMs: 10_000,
    });
    order.reorder(2, 0, 'Master moved to position 1 of 3');
    flushSync();
    assert.deepEqual(ids(order.orderedStages), ['s3', 's2', 's1'], 'optimistic: the row moved');

    const result = await order.flush();
    flushSync();

    assert.deepEqual(result, { ok: false }, 'signalled by return status, never by rejecting');
    assert.deepEqual(order.orders['recipe:a'], ['s2', 's1', 's3']);
    assert.deepEqual(ids(order.orderedStages), ['s2', 's1', 's3']);
    assert.equal(order.announcement, REVERTED, 'through the SAME live region the move used');
  });

  it('a rejected FIRST-EVER write DELETES the key rather than stranding it', async () => {
    const { order } = setup({ rejectWrite: true, debounceMs: 10_000 });
    order.reorder(2, 0, 'moved');
    const result = await order.flush();
    flushSync();

    assert.deepEqual(result, { ok: false });
    assert.equal(order.orders['recipe:a'], undefined, 'no phantom stored order survives the revert');
    assert.equal(order.orderedStages, STAGES);
  });

  it('a SUCCESSFUL write becomes the new revert target', async () => {
    let fail = false;
    const writes = [];
    const source = subjectSource(progressive('a'));
    const order = createPlayerResultOrder({
      scope: 'recipe',
      subject: source.subject,
      read: () => ({}),
      write: async (key, list) => {
        writes.push({ key, order: list });
        if (fail) throw new Error('rejected');
        return {};
      },
      revertMessage: () => REVERTED,
      debounceMs: 10_000,
    });
    order.seed();

    order.reorder(2, 0, 'first');
    await order.flush();
    flushSync();
    assert.deepEqual(ids(order.orderedStages), ['s3', 's1', 's2']);

    fail = true;
    order.reorder(2, 0, 'second');
    await order.flush();
    flushSync();
    assert.deepEqual(
      ids(order.orderedStages),
      ['s3', 's1', 's2'],
      'reverts to the first persisted order, not the authored one'
    );
  });
});

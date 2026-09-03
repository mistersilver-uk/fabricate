/**
 * Issue 651 — `progressiveResultOrder.js`: the D5 reconciliation contract.
 *
 * Progressive awarding spends a roll DOWN the list, so every clause of this contract
 * guards a silent failure: a dropped result silently denies a player an award, and an
 * unranked stage displacing a ranked one silently demotes the player's choice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { progressiveOrderKey, applyPlayerResultOrder } = await import(
  '../src/utils/progressiveResultOrder.js'
);

const r = (id, extra = {}) => ({ id, ...extra });

// ---------------------------------------------------------------------------
// progressiveOrderKey
// ---------------------------------------------------------------------------

test('progressiveOrderKey namespaces by scope', () => {
  assert.equal(progressiveOrderKey({ scope: 'recipe', id: 'abc' }), 'recipe:abc');
  assert.equal(progressiveOrderKey({ scope: 'salvage', id: 'comp-1' }), 'salvage:comp-1');
});

test('progressiveOrderKey keeps the two namespaces distinct for a colliding id', () => {
  // Recipe ids and component ids are drawn from different id spaces and CAN collide.
  assert.notEqual(
    progressiveOrderKey({ scope: 'recipe', id: 'same' }),
    progressiveOrderKey({ scope: 'salvage', id: 'same' })
  );
});

test('progressiveOrderKey returns null for an unusable scope or id', () => {
  assert.equal(progressiveOrderKey({ scope: 'gathering', id: 'x' }), null);
  assert.equal(progressiveOrderKey({ scope: 'recipe', id: '' }), null);
  assert.equal(progressiveOrderKey({ scope: 'recipe', id: '   ' }), null);
  assert.equal(progressiveOrderKey({ scope: 'recipe', id: undefined }), null);
  assert.equal(progressiveOrderKey({ scope: 'recipe', id: 42 }), null);
  assert.equal(progressiveOrderKey({}), null);
  assert.equal(progressiveOrderKey(), null);
});

// ---------------------------------------------------------------------------
// applyPlayerResultOrder — the core contract
// ---------------------------------------------------------------------------

test('reorders results to match the stored order', () => {
  const results = [r('a'), r('b'), r('c')];
  const out = applyPlayerResultOrder(results, ['c', 'a', 'b']);
  assert.deepEqual(
    out.map((x) => x.id),
    ['c', 'a', 'b']
  );
});

test('tail-appends unranked results in AUTHORED order, never displacing a ranked one', () => {
  // A GM adding a stage must not be able to silently demote a player's ranked stage:
  // the new stage is awarded only if budget remains.
  const results = [r('new-1'), r('a'), r('new-2'), r('b')];
  const out = applyPlayerResultOrder(results, ['b', 'a']);
  assert.deepEqual(
    out.map((x) => x.id),
    ['b', 'a', 'new-1', 'new-2']
  );
});

test('never drops a result — out.length === results.length', () => {
  const results = [r('a'), r('b'), r('c'), r('d')];
  for (const order of [['a'], ['d', 'c'], ['z'], ['a', 'b', 'c', 'd'], ['b', 'z', 'd']]) {
    assert.equal(
      applyPlayerResultOrder(results, order).length,
      results.length,
      `length preserved for order ${JSON.stringify(order)}`
    );
  }
});

test('skips ids in the order that match no result', () => {
  const results = [r('a'), r('b')];
  const out = applyPlayerResultOrder(results, ['ghost', 'b', 'also-gone', 'a']);
  assert.deepEqual(
    out.map((x) => x.id),
    ['b', 'a']
  );
});

test('returns elements ===-identical to the inputs (no cloning)', () => {
  // Downstream `costFor` and the `{ ...result, quantity: 1 }` spread depend on identity.
  const a = r('a');
  const b = r('b');
  const out = applyPlayerResultOrder([a, b], ['b', 'a']);
  assert.equal(out[0], b);
  assert.equal(out[1], a);
});

test('a null/empty order returns the input BY IDENTITY', () => {
  const results = [r('a'), r('b')];
  assert.equal(applyPlayerResultOrder(results, null), results);
  assert.equal(applyPlayerResultOrder(results, undefined), results);
  assert.equal(applyPlayerResultOrder(results, []), results);
  assert.equal(applyPlayerResultOrder(results, 'not-an-array'), results);
});

test('a non-array results input is returned unchanged', () => {
  assert.equal(applyPlayerResultOrder(null, ['a']), null);
  assert.equal(applyPlayerResultOrder(undefined, ['a']), undefined);
});

// ---------------------------------------------------------------------------
// Duplicate ids — first match wins, both sides
// ---------------------------------------------------------------------------

test('duplicate ids IN THE ORDER: first match wins, no doubling', () => {
  const results = [r('a'), r('b')];
  const out = applyPlayerResultOrder(results, ['a', 'a', 'b']);
  assert.deepEqual(
    out.map((x) => x.id),
    ['a', 'b']
  );
  assert.equal(out.length, 2, 'the repeated id does not duplicate the result');
});

test('duplicate ids IN RESULTS: the second copy tail-appends rather than vanishing', () => {
  // This is the case that can break length-preservation: a naive filter/map keyed on id
  // would drop or double the second copy.
  const first = r('dup', { tag: 'first' });
  const second = r('dup', { tag: 'second' });
  const out = applyPlayerResultOrder([first, second, r('b')], ['dup', 'b']);
  assert.equal(out.length, 3, 'no result is dropped');
  assert.equal(out[0], first, 'the FIRST copy wins the ranked slot');
  assert.equal(out[1].id, 'b');
  assert.equal(out[2], second, 'the second copy tail-appends');
});

test('duplicate ids in BOTH the order and results: each mention consumes one copy', () => {
  const first = r('dup', { tag: 'first' });
  const second = r('dup', { tag: 'second' });
  const out = applyPlayerResultOrder([r('b'), first, second], ['dup', 'dup']);
  assert.equal(out.length, 3);
  assert.deepEqual([out[0], out[1]], [first, second]);
  assert.equal(out[2].id, 'b');
});

// ---------------------------------------------------------------------------
// Junk tolerance
// ---------------------------------------------------------------------------

test('an order longer than results is harmless', () => {
  const results = [r('a')];
  const out = applyPlayerResultOrder(results, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(
    out.map((x) => x.id),
    ['a']
  );
});

test('non-string entries in the order are skipped', () => {
  const results = [r('a'), r('b')];
  const out = applyPlayerResultOrder(results, [null, 0, { id: 'a' }, ['b'], undefined, 'b', 'a']);
  assert.deepEqual(
    out.map((x) => x.id),
    ['b', 'a']
  );
});

test('an id-less result is never reorderable and retains authored order', () => {
  const noId = { name: 'anonymous' };
  const out = applyPlayerResultOrder([r('a'), noId, r('b')], ['b', 'a']);
  assert.deepEqual([out[0].id, out[1].id], ['b', 'a']);
  assert.equal(out[2], noId, 'it matches nothing and tail-appends');
  assert.equal(out.length, 3);
});

test('id-less results × index-shaped junk: [0, 1] must NOT match id: undefined', () => {
  // The product case. A legacy index-shaped order meeting id-less results is where a
  // loose `==`/truthiness match would silently "reorder" by matching undefined to 0.
  const first = { id: undefined, name: 'first' };
  const second = { name: 'second' };
  const third = { id: null, name: 'third' };
  const results = [first, second, third];

  for (const order of [
    [0, 1],
    [0, 1, 2],
    ['0', '1'],
    [undefined, null],
    [false, ''],
  ]) {
    const out = applyPlayerResultOrder(results, order);
    assert.deepEqual(out, results, `authored order retained for ${JSON.stringify(order)}`);
    assert.equal(out.length, 3);
  }
});

test('index-shaped junk does not reorder results that DO have ids', () => {
  const results = [r('a'), r('b'), r('c')];
  const out = applyPlayerResultOrder(results, [2, 0, 1]);
  assert.deepEqual(
    out.map((x) => x.id),
    ['a', 'b', 'c']
  );
});

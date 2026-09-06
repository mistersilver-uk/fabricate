/**
 * `createMemoizedLoad` (issue 1565) — the memoization `src/main.js` has carried since issue 150,
 * moved behind a seam a test can actually execute.
 *
 * THE THREE PROPERTIES, and why each is here rather than assumed:
 *
 *  1. REPEAT callers after a success share the resolved attempt. This is the property issue 150
 *     shipped for (a non-GM never downloads the manager subtree, and a GM downloads it once).
 *  2. CONCURRENT callers during one attempt share it. A memo that stored the RESULT rather than
 *     the in-flight promise would satisfy (1) and fail this, entering `import()` twice on a
 *     double click.
 *  3. A REJECTION leaves the memo EMPTY. Note what is deliberately NOT claimed: the next call
 *     re-invokes the loader, and for a real dynamic `import()` that second attempt resolves from
 *     the host's own recorded failure without a fetch. So this asserts the memo's state, not a
 *     recovery — see the module's own header.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoizedLoad } from '../src/utils/memoizedModuleLoad.js';

/** A promise whose settlement this test controls, plus the loader call count. */
function deferredLoader() {
  const calls = [];
  const load = () => {
    let settle;
    const promise = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    calls.push(settle);
    return promise;
  };
  return { load, calls };
}

test('repeat callers after a success invoke the loader exactly once', async () => {
  let calls = 0;
  const memoized = createMemoizedLoad(() => {
    calls += 1;
    return Promise.resolve({ AppClass: 'manager' });
  });

  const first = await memoized();
  const second = await memoized();
  const third = await memoized();

  assert.equal(calls, 1, 'the loader runs once across three opens');
  assert.equal(first.AppClass, 'manager');
  assert.ok(first === second && second === third, 'every caller receives the same resolved value');
});

test('concurrent callers during one attempt share it and settle together', async () => {
  const { load, calls } = deferredLoader();
  const memoized = createMemoizedLoad(load);

  const a = memoized();
  const b = memoized();
  assert.equal(calls.length, 1, 'a second open while the first is in flight does not re-enter');
  assert.ok(a === b, 'both callers hold the same promise');

  calls[0].resolve('AppClass');
  assert.deepEqual(await Promise.all([a, b]), ['AppClass', 'AppClass']);
});

test('a rejection does not leave the memo populated, and every waiting caller sees it', async () => {
  const { load, calls } = deferredLoader();
  const memoized = createMemoizedLoad(load);
  const failure = new TypeError('Failed to fetch dynamically imported module: chunks/x.js');

  const a = memoized();
  const b = memoized();
  // Identity is asserted BEFORE anything is awaited on purpose. A memo that stored the result
  // instead of the in-flight promise leaves `b` a SECOND attempt that this fixture never
  // settles, so awaiting it first would hang the suite (`node --test` reports that as
  // `cancelled`, five minutes later) instead of failing it here.
  assert.ok(a === b, 'a concurrent open during a failing attempt shares that attempt');
  calls[0].reject(failure);

  await assert.rejects(() => a, (error) => error === failure);
  await assert.rejects(() => b, (error) => error === failure);

  // The memo is empty, so the next open starts a fresh attempt rather than being handed the
  // rejected promise for the rest of the session.
  const c = memoized();
  assert.equal(calls.length, 2, 'the next open re-enters the loader');
  assert.ok(c !== a, 'and receives a new promise rather than the retained rejection');
  calls[1].resolve('AppClass');
  assert.equal(await c, 'AppClass');
});

test('a loader that throws synchronously rejects the attempt and clears the memo', async () => {
  let calls = 0;
  const failure = new Error('module map is unavailable');
  const memoized = createMemoizedLoad(() => {
    calls += 1;
    throw failure;
  });

  // The caller gets a REJECTION, not a synchronous throw: every call site is a `.then`/`await`
  // chain, so a synchronous escape would bypass the `catch` that reports the failure.
  await assert.rejects(() => memoized(), (error) => error === failure);
  await assert.rejects(() => memoized(), (error) => error === failure);
  assert.equal(calls, 2, 'the memo did not retain the failed attempt');
});

/**
 * Proves that the Svelte runtime is importable and functional inside
 * `node --test` without any DOM environment.
 *
 * A `writable` store exercises the core Svelte reactivity primitive that all
 * Fabricate stores will build upon. If this import fails, the Svelte package
 * is not installed or its ESM exports are broken.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writable, get } from 'svelte/store';

describe('Svelte writable store (runtime smoke test)', () => {
  it('can be created with an initial value', () => {
    const store = writable(42);
    assert.equal(get(store), 42);
  });

  it('notifies subscribers when the value is set', () => {
    const store = writable('initial');
    const received = [];

    const unsubscribe = store.subscribe(value => received.push(value));

    store.set('updated');

    unsubscribe();

    // subscribe() always emits the current value immediately, then each
    // subsequent change.
    assert.deepEqual(received, ['initial', 'updated']);
  });

  it('notifies subscribers when the value is updated via update()', () => {
    const store = writable(10);
    const received = [];

    const unsubscribe = store.subscribe(value => received.push(value));

    store.update(n => n + 5);

    unsubscribe();

    assert.deepEqual(received, [10, 15]);
  });

  it('stops notifying after unsubscribe', () => {
    const store = writable('a');
    const received = [];

    const unsubscribe = store.subscribe(value => received.push(value));
    unsubscribe();

    // This set should NOT be delivered to the already-unsubscribed listener.
    store.set('b');

    assert.deepEqual(received, ['a']);
  });

  it('get() reads the current value without subscribing', () => {
    const store = writable({ count: 0 });
    store.update(s => ({ ...s, count: s.count + 1 }));

    const snapshot = get(store);
    assert.equal(snapshot.count, 1);
  });
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  subscribeInventoryChange,
  subscribeCraftingDataChange,
} from '../../src/ui/svelte/util/foundryBridge.js';

// Minimal fake of Foundry's Hooks: records handlers per name so tests can fire them
// and assert on/off wiring.
function makeHooks() {
  const handlers = new Map();
  let nextId = 0;
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Map());
      const id = ++nextId;
      handlers.get(name).set(id, fn);
      return id;
    },
    off(name, id) {
      handlers.get(name)?.delete(id);
    },
    fire(name, ...args) {
      for (const fn of [...(handlers.get(name)?.values() ?? [])]) fn(...args);
    },
    count(name) {
      return handlers.get(name)?.size ?? 0;
    },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('subscribeInventoryChange', () => {
  let hooks;
  beforeEach(() => {
    hooks = makeHooks();
    globalThis.Hooks = hooks;
  });
  afterEach(() => {
    delete globalThis.Hooks;
  });

  it('registers create/update/delete item hooks and unsubscribes cleanly', () => {
    const unsubscribe = subscribeInventoryChange(() => {});
    assert.equal(hooks.count('createItem'), 1);
    assert.equal(hooks.count('updateItem'), 1);
    assert.equal(hooks.count('deleteItem'), 1);
    unsubscribe();
    assert.equal(hooks.count('createItem'), 0);
    assert.equal(hooks.count('updateItem'), 0);
    assert.equal(hooks.count('deleteItem'), 0);
  });

  it('fires the handler for a relevant actor on create, update, and delete', async () => {
    let calls = 0;
    subscribeInventoryChange(() => (calls += 1), {
      isRelevantActor: (id) => id === 'actor-1',
      debounceMs: 5,
    });

    hooks.fire('createItem', { actor: { id: 'actor-1' } });
    await wait(15);
    hooks.fire('updateItem', { actor: { id: 'actor-1' } });
    await wait(15);
    hooks.fire('deleteItem', { parent: { id: 'actor-1' } });
    await wait(15);

    assert.equal(calls, 3);
  });

  it('ignores irrelevant actors and world (no-parent) items', async () => {
    let calls = 0;
    subscribeInventoryChange(() => (calls += 1), {
      isRelevantActor: (id) => id === 'actor-1',
      debounceMs: 5,
    });

    hooks.fire('updateItem', { actor: { id: 'actor-2' } }); // wrong actor
    hooks.fire('createItem', {}); // world/sidebar item, no actor parent
    hooks.fire('deleteItem', { parent: null });
    await wait(15);

    assert.equal(calls, 0);
  });

  it('coalesces a burst of relevant changes into a single handler call', async () => {
    let calls = 0;
    subscribeInventoryChange(() => (calls += 1), {
      isRelevantActor: () => true,
      debounceMs: 20,
    });

    // A craft: delete N ingredients + create the product, all within the window.
    for (let i = 0; i < 5; i += 1) hooks.fire('deleteItem', { actor: { id: 'a' } });
    hooks.fire('createItem', { actor: { id: 'a' } });
    await wait(40);

    assert.equal(calls, 1);
  });

  it('reads the relevance predicate at fire time (tracks live selection)', async () => {
    let selected = 'actor-1';
    let calls = 0;
    subscribeInventoryChange(() => (calls += 1), {
      isRelevantActor: (id) => id === selected,
      debounceMs: 5,
    });

    hooks.fire('updateItem', { actor: { id: 'actor-2' } });
    await wait(15);
    assert.equal(calls, 0, 'actor-2 not relevant yet');

    selected = 'actor-2';
    hooks.fire('updateItem', { actor: { id: 'actor-2' } });
    await wait(15);
    assert.equal(calls, 1, 'actor-2 became relevant');
  });

  it('cancels a pending debounced call on unsubscribe', async () => {
    let calls = 0;
    const unsubscribe = subscribeInventoryChange(() => (calls += 1), {
      isRelevantActor: () => true,
      debounceMs: 20,
    });

    hooks.fire('createItem', { actor: { id: 'a' } });
    unsubscribe();
    await wait(40);

    assert.equal(calls, 0);
  });

  it('no-ops when Hooks is absent', () => {
    delete globalThis.Hooks;
    assert.doesNotThrow(() => {
      const unsubscribe = subscribeInventoryChange(() => {});
      unsubscribe();
    });
  });
});

describe('subscribeCraftingDataChange', () => {
  let hooks;
  beforeEach(() => {
    hooks = makeHooks();
    globalThis.Hooks = hooks;
  });
  afterEach(() => {
    delete globalThis.Hooks;
  });

  it('fires the handler on both systems and recipes changes', () => {
    let calls = 0;
    subscribeCraftingDataChange(() => (calls += 1));

    hooks.fire('fabricate.craftingSystemsChanged', []);
    hooks.fire('fabricate.recipesChanged', {});

    assert.equal(calls, 2);
  });

  it('unsubscribes both hooks', () => {
    const unsubscribe = subscribeCraftingDataChange(() => {});
    assert.equal(hooks.count('fabricate.craftingSystemsChanged'), 1);
    assert.equal(hooks.count('fabricate.recipesChanged'), 1);
    unsubscribe();
    assert.equal(hooks.count('fabricate.craftingSystemsChanged'), 0);
    assert.equal(hooks.count('fabricate.recipesChanged'), 0);
  });

  it('no-ops when Hooks is absent', () => {
    delete globalThis.Hooks;
    assert.doesNotThrow(() => subscribeCraftingDataChange(() => {})());
  });
});

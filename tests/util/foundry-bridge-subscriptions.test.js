import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CRAFTING_DATA_CHANGED_HOOK as PRODUCER_HOOK } from '../../src/systems/craftingDataChange.js';
import { INVALIDATION_DOMAIN_NAMES } from '../../src/systems/invalidationDomains.js';
import {
  subscribeInventoryChange,
  subscribeCraftingDataChange,
  subscribeActorRunFlagChange,
  CRAFTING_DATA_CHANGED_HOOK,
  readCraftingDataFallbackCount,
  resetCraftingDataFallbackCount,
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
    resetCraftingDataFallbackCount();
  });
  afterEach(() => {
    delete globalThis.Hooks;
  });

  /** One well-formed scoped payload naming exactly the given domains. */
  const change = (...domains) => ({ source: 'recipes', scopes: [{ systemId: 'sys-a', domains }] });

  it('binds ONLY the unpublished scoped hook, not the two published ones', () => {
    // The zero-argument bindings on `fabricate.craftingSystemsChanged` / `fabricate.recipesChanged`
    // discarded the payload, so no narrowing was possible however good a delta was emitted
    // (issue 1078). They are gone; the two hooks keep firing for third-party subscribers, and
    // every publisher of one also publishes the scoped signal.
    const unsubscribe = subscribeCraftingDataChange(() => {});
    assert.equal(hooks.count(CRAFTING_DATA_CHANGED_HOOK), 1);
    assert.equal(hooks.count('fabricate.craftingSystemsChanged'), 0);
    assert.equal(hooks.count('fabricate.recipesChanged'), 0);
    unsubscribe();
    assert.equal(hooks.count(CRAFTING_DATA_CHANGED_HOOK), 0);
  });

  it('mirrors the producer-side DOMAIN NAMES exactly', () => {
    // The routing predicate holds the seven names as a literal for the same reason it holds the
    // hook name as one — no new import may enter this module. This is what stops the mirror
    // drifting, and an eighth domain added to the taxonomy without updating the mirror would
    // route every change naming it BROADLY, which is safe but is the narrowing silently lost.
    const seen = [];
    subscribeCraftingDataChange((payload) => seen.push(payload.scopes[0].domains[0]));
    for (const domain of INVALIDATION_DOMAIN_NAMES) {
      hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change(domain));
    }
    assert.deepEqual(seen, [...INVALIDATION_DOMAIN_NAMES]);
    assert.equal(
      readCraftingDataFallbackCount(),
      0,
      'every shipped domain name must be one this module recognises; a name it does not know ' +
        'falls to the broad fallback and would move this counter'
    );
  });

  it('routes broadly when EVERY domain a change names is unrecognised', () => {
    // The one input class that would otherwise route NARROW when it must route broad: an
    // unknown name yields a non-empty set intersecting no subscriber's wanted set, so nothing
    // refreshes and the counter does not move — a stale read model wearing the appearance of
    // correct narrowing. Unreachable from today's producers, and reachable the moment #1092
    // replicates a payload between clients on different module versions.
    let calls = 0;
    subscribeCraftingDataChange(() => (calls += 1), { domains: ['labelling'] });

    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('a-domain-from-a-newer-build'));

    assert.equal(calls, 1, 'an unrecognised classification is not a licence to skip the store');
    assert.equal(readCraftingDataFallbackCount(), 1, 'and it is counted as the fallback it is');
  });

  it('narrows on the RECOGNISED names when a change mixes known and unknown', () => {
    const seen = [];
    subscribeCraftingDataChange(() => seen.push('labelling-subscriber'), { domains: ['labelling'] });
    subscribeCraftingDataChange(() => seen.push('narrative-subscriber'), { domains: ['narrative'] });

    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('labelling', 'a-domain-from-a-newer-build'));

    assert.deepEqual(seen, ['labelling-subscriber'], 'the known half still narrows');
    assert.equal(readCraftingDataFallbackCount(), 0);
  });

  it('mirrors the producer-side hook name exactly', () => {
    // The consumer holds the name as a LITERAL rather than importing it, because ~75 mounted
    // harnesses declare `foundryBridge.js` and one new static import would make every one of
    // them fail until it declared the new transitive module. This is what stops the two drifting.
    assert.equal(CRAFTING_DATA_CHANGED_HOOK, PRODUCER_HOOK);
  });

  it('fires for every change when no domain set is given', () => {
    let calls = 0;
    subscribeCraftingDataChange(() => (calls += 1));

    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('narrative'));
    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('held-inventory'));

    assert.equal(calls, 2, 'an unscoped subscriber is the pre-#1078 behaviour and stays default');
    assert.equal(readCraftingDataFallbackCount(), 0, 'and it is not the broad FALLBACK');
  });

  it('delivers only the changes that name a domain the subscriber consumes', () => {
    const seen = [];
    subscribeCraftingDataChange((payload) => seen.push(payload.scopes[0].domains), {
      domains: ['labelling', 'component-definitions'],
    });

    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('narrative'));
    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('labelling'));
    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('held-inventory', 'component-definitions'));

    assert.deepEqual(seen, [['labelling'], ['held-inventory', 'component-definitions']]);
    assert.equal(readCraftingDataFallbackCount(), 0);
  });

  it('hands the subscriber the payload rather than dropping it', () => {
    let received = null;
    subscribeCraftingDataChange((payload) => (received = payload), { domains: ['labelling'] });

    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, change('labelling'));

    assert.equal(received?.source, 'recipes');
    assert.deepEqual(received?.scopes?.[0]?.systemId, 'sys-a');
  });

  it('routes broadly and COUNTS it when the change names no domain', () => {
    let calls = 0;
    subscribeCraftingDataChange(() => (calls += 1), { domains: ['labelling'] });

    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, { source: 'recipes', scopes: [] });
    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, undefined);
    hooks.fire(CRAFTING_DATA_CHANGED_HOOK, { source: 'recipes', scopes: 'not an array' });

    assert.equal(calls, 3, 'an unattributable change reaches every subscriber');
    assert.equal(
      readCraftingDataFallbackCount(),
      3,
      'and the counter is what lets a per-domain fixture assert its narrowing was ROUTING ' +
        'rather than a change it happened to miss'
    );
  });

  it('no-ops when Hooks is absent', () => {
    delete globalThis.Hooks;
    assert.doesNotThrow(() => subscribeCraftingDataChange(() => {})());
  });
});

describe('subscribeActorRunFlagChange', () => {
  let hooks;
  beforeEach(() => {
    hooks = makeHooks();
    globalThis.Hooks = hooks;
    // hasProperty resolves a POSIX-dotted path against a nested change diff.
    globalThis.foundry = {
      utils: {
        hasProperty: (object, path) =>
          String(path)
            .split('.')
            .every((seg) => {
              if (object == null || typeof object !== 'object' || !(seg in object)) return false;
              object = object[seg];
              return true;
            }),
      },
    };
  });
  afterEach(() => {
    delete globalThis.Hooks;
    delete globalThis.foundry;
  });

  const craftingRunChange = {
    flags: { fabricate: { fabricate: { craftingRuns: { active: {} } } } },
  };

  it('registers and unsubscribes the updateActor hook', () => {
    const unsubscribe = subscribeActorRunFlagChange(() => {});
    assert.equal(hooks.count('updateActor'), 1);
    unsubscribe();
    assert.equal(hooks.count('updateActor'), 0);
  });

  it('fires for a relevant actor when the diff touches a run-container flag', () => {
    let calls = 0;
    subscribeActorRunFlagChange(() => (calls += 1), { isRelevantActor: (id) => id === 'actor-1' });
    hooks.fire('updateActor', { id: 'actor-1' }, craftingRunChange);
    assert.equal(calls, 1);
  });

  it('ignores irrelevant actors and non-run-flag diffs (e.g. an HP tick)', () => {
    let calls = 0;
    subscribeActorRunFlagChange(() => (calls += 1), { isRelevantActor: (id) => id === 'actor-1' });

    hooks.fire('updateActor', { id: 'actor-2' }, craftingRunChange); // wrong actor
    hooks.fire('updateActor', { id: 'actor-1' }, { system: { attributes: { hp: { value: 3 } } } });
    // The single-scope (wrong-depth) crafting path must not match.
    hooks.fire('updateActor', { id: 'actor-1' }, { flags: { fabricate: { craftingRuns: {} } } });

    assert.equal(calls, 0);
  });

  it('matches the single-scope gathering flag path', () => {
    let calls = 0;
    subscribeActorRunFlagChange(() => (calls += 1));
    hooks.fire(
      'updateActor',
      { id: 'a' },
      { flags: { fabricate: { gatheringRuns: { history: [] } } } }
    );
    assert.equal(calls, 1);
  });

  it('no-ops when Hooks is absent', () => {
    delete globalThis.Hooks;
    assert.doesNotThrow(() => subscribeActorRunFlagChange(() => {})());
  });
});

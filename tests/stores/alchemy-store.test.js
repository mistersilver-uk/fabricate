import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';

let compiler;
let createAlchemyStore;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function concreteRecipe(id, name, concrete, resultName = 'Result') {
  const groups = Object.entries(concrete).map(([componentId, quantity]) => ({
    options: [{ componentId, name: componentId, img: null, quantity }],
  }));
  return {
    id,
    name,
    img: null,
    concrete,
    result: { componentId: `${id}-out`, name: resultName, img: null, quantity: 1 },
    signatureSummary: [{ setId: `${id}-set`, groups, essences: [], result: null }],
  };
}

function richRecipe(id, name) {
  return {
    id,
    name,
    img: null,
    concrete: null, // rich signature -> fail-safe to untried
    result: { componentId: `${id}-out`, name: 'Rich', img: null, quantity: 1 },
    signatureSummary: [
      {
        setId: `${id}-set`,
        groups: [{ options: [{ componentId: 'a', name: 'A', img: null, quantity: 1 }, { componentId: 'b', name: 'B', img: null, quantity: 1 }] }],
        essences: [{ id: 'fire', name: 'Fire', icon: null, quantity: 1 }],
        result: null,
      },
    ],
  };
}

function baseListing(overrides = {}) {
  return {
    denied: false,
    selectedActorId: 'pc',
    activeSystemId: 'sys-a',
    activeSystemName: 'Herbalism',
    systems: [{ id: 'sys-a', name: 'Herbalism', img: null, description: '', knownCount: 1, totalCount: 2 }],
    recipes: [concreteRecipe('vigor', 'Elixir of Vigor', { emberroot: 1, springwater: 2 }, 'Vigor')],
    undiscoveredCount: 1,
    components: [
      { componentId: 'emberroot', name: 'Emberroot', img: null, held: 4 },
      { componentId: 'springwater', name: 'Spring Water', img: null, held: 6 },
      { componentId: 'ashsalt', name: 'Ashsalt', img: null, held: 3 },
    ],
    fizzleKeys: [],
    ...overrides,
  };
}

function makeServices(overrides = {}) {
  const calls = { list: [], submit: [], notify: [], setSystem: [] };
  let listing = overrides.listing ?? baseListing();
  let alchemySystem = overrides.alchemySystem ?? 'sys-a';
  const services = {
    listAlchemyForActor: async (opts) => {
      calls.list.push(opts);
      return typeof listing === 'function' ? listing(opts) : listing;
    },
    submitAlchemyAttempt:
      overrides.submitAlchemyAttempt ??
      (async (opts) => {
        calls.submit.push(opts);
        return { success: true, results: [], message: '' };
      }),
    notify: (message) => calls.notify.push(message),
    craftErrorMessage: () => 'failed',
    getSelectedCraftingActorId: () => overrides.actorId ?? 'pc',
    getCraftingComponentSourceIds: () => overrides.sourceIds ?? [],
    getSelectedAlchemySystemId: () => alchemySystem,
    setSelectedAlchemySystemId: (id) => {
      calls.setSystem.push(id);
      alchemySystem = id;
    },
  };
  return {
    services,
    calls,
    setListing: (next) => {
      listing = next;
    },
  };
}

async function loadedStore(setup = {}) {
  const harness = makeServices(setup);
  const store = createAlchemyStore({ services: harness.services });
  await store.load();
  flushSync();
  return { store, ...harness };
}

// ---------------------------------------------------------------------------

describe('alchemyStore', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-alchemy-store-');
    compiler.copyPlain('src/utils/alchemySignatureKey.js');
    ({ createAlchemyStore } = await compiler.load('src/ui/svelte/stores/alchemyStore.svelte.js'));
  });

  after(() => compiler.cleanup());

  it('loads the listing scoped to the active system and sets loadedOnce', async () => {
    const { store, calls } = await loadedStore();
    assert.equal(store.loadedOnce, true);
    assert.equal(store.knownCount, 1);
    assert.equal(store.undiscoveredCount, 1);
    assert.equal(calls.list[0].craftingSystemId, 'sys-a');
  });

  it('is `empty` with an empty bench and Brew disabled', async () => {
    const { store } = await loadedStore();
    assert.equal(store.mode, 'empty');
    assert.equal(store.brewEnabled, false);
  });

  it('empty inventory -> empty mode + Brew disabled', async () => {
    const { store } = await loadedStore({ listing: baseListing({ components: [] }) });
    assert.equal(store.components.length, 0);
    assert.equal(store.mode, 'empty');
    assert.equal(store.brewEnabled, false);
  });

  it('selecting a known concrete recipe auto-loads its signature and reads `ready`', async () => {
    const { store } = await loadedStore();
    store.selectRecipe('vigor');
    flushSync();
    assert.deepEqual(
      Object.fromEntries(store.benchChips.map((c) => [c.componentId, c.qty])),
      { emberroot: 1, springwater: 2 }
    );
    assert.equal(store.mode, 'ready');
    assert.equal(store.target.id, 'vigor');
    assert.equal(store.brewEnabled, true);
  });

  it('a strict subset of the selected recipe reads `assembling` with the still-needed rows', async () => {
    const { store } = await loadedStore();
    store.selectRecipe('vigor');
    flushSync();
    store.removeOne('springwater'); // now emberroot:1, springwater:1 -> subset
    flushSync();
    assert.equal(store.mode, 'assembling');
    assert.equal(store.brewEnabled, false, 'assembling cannot brew');
    assert.deepEqual(store.missing, [{ componentId: 'springwater', name: 'Spring Water', img: null, need: 1 }]);
  });

  it('the 1x vs 2x quantity boundary flips assembling -> ready', async () => {
    const { store } = await loadedStore();
    store.selectRecipe('vigor');
    flushSync();
    store.removeOne('springwater'); // springwater:1 (short) -> assembling
    flushSync();
    assert.equal(store.mode, 'assembling');
    store.add('springwater'); // back to springwater:2 -> ready
    flushSync();
    assert.equal(store.mode, 'ready');
  });

  it('a bench matching NO known concrete recipe reads `untried` (undiscovered -> untried)', async () => {
    // ashsalt is owned but no KNOWN recipe uses it; this is exactly the case of an
    // undiscovered recipe or a never-tried dead-end -> both present as untried.
    const { store } = await loadedStore();
    store.add('ashsalt');
    flushSync();
    assert.equal(store.mode, 'untried');
    assert.equal(store.brewEnabled, true, 'the player can experiment');
  });

  it('a remembered fizzle flips untried -> no-reaction', async () => {
    const { store } = await loadedStore({ listing: baseListing({ fizzleKeys: ['ashsalt:1'] }) });
    store.add('ashsalt');
    flushSync();
    assert.equal(store.mode, 'no-reaction');
    assert.equal(store.brewEnabled, true, 'the player may experiment anyway');
  });

  it('a rich-signature known recipe fails safe to `untried` (never a false ready/assembling)', async () => {
    const listing = baseListing({
      recipes: [richRecipe('volatile', 'Volatile Elixir')],
      components: [{ componentId: 'a', name: 'A', img: null, held: 2 }],
    });
    const { store } = await loadedStore({ listing });
    store.selectRecipe('volatile');
    flushSync();
    // No auto-fill (concrete is null) and no false ready/assembling.
    assert.equal(store.benchEmpty, true);
    store.add('a');
    flushSync();
    assert.equal(store.mode, 'untried');
  });

  it('a known recipe whose components are no longer held cannot assemble (zero availability)', async () => {
    const listing = baseListing({
      recipes: [concreteRecipe('vigor', 'Elixir of Vigor', { emberroot: 1, springwater: 2 })],
      components: [], // owns none
    });
    const { store } = await loadedStore({ listing });
    store.selectRecipe('vigor');
    flushSync();
    assert.equal(store.benchEmpty, true, 'nothing auto-fills when unheld');
    assert.equal(store.mode, 'empty');
  });

  it('duplicate/overlapping learned signatures resolve `ready` deterministically (first in order)', async () => {
    const listing = baseListing({
      recipes: [
        concreteRecipe('first', 'First Brew', { emberroot: 1 }, 'A'),
        concreteRecipe('second', 'Second Brew', { emberroot: 1 }, 'B'),
      ],
    });
    const { store } = await loadedStore({ listing });
    store.add('emberroot');
    flushSync();
    assert.equal(store.mode, 'ready');
    assert.equal(store.target.id, 'first', 'first-in-listing wins deterministically');
  });

  it('Switch discipline resets bench / selection / last-brew / search and reloads', async () => {
    const { store, calls } = await loadedStore({
      listing: baseListing({
        systems: [
          { id: 'sys-a', name: 'A', img: null, description: '', knownCount: 1, totalCount: 1 },
          { id: 'sys-b', name: 'B', img: null, description: '', knownCount: 0, totalCount: 1 },
        ],
      }),
    });
    store.selectRecipe('vigor');
    store.setSearch('vig');
    flushSync();
    assert.equal(store.canSwitch, true);
    store.switchDiscipline();
    flushSync();
    assert.equal(store.selectedRecipeId, null);
    assert.equal(store.benchEmpty, true);
    assert.equal(store.search, '');
    assert.equal(store.lastBrew, null);
    assert.ok(calls.setSystem.includes(''), 'active system is cleared on switch');
  });

  it('choosing a discipline scopes the reload to that system id', async () => {
    const { store, calls } = await loadedStore({
      alchemySystem: '',
      listing: baseListing({
        activeSystemId: null,
        systems: [
          { id: 'sys-a', name: 'A', img: null, description: '', knownCount: 0, totalCount: 1 },
          { id: 'sys-b', name: 'B', img: null, description: '', knownCount: 0, totalCount: 1 },
        ],
      }),
    });
    assert.equal(store.needsChooser, true);
    store.chooseSystem('sys-b');
    flushSync();
    await Promise.resolve();
    assert.ok(calls.list.some((opts) => opts.craftingSystemId === 'sys-b'));
  });

  it('exactly one discipline auto-enters (no chooser)', async () => {
    const { store, calls } = await loadedStore({
      alchemySystem: '',
      listing: baseListing({ systems: [{ id: 'sys-a', name: 'A', img: null, description: '', knownCount: 1, totalCount: 1 }] }),
    });
    assert.equal(store.needsChooser, false);
    assert.equal(store.activeSystemId, 'sys-a');
    assert.ok(calls.setSystem.includes('sys-a'));
  });

  it('brew submits the expanded bench, clears it, and banners a discovery', async () => {
    const harness = makeServices();
    // After the brew, reload reveals the newly-learned recipe.
    const store = createAlchemyStore({ services: harness.services });
    await store.load();
    flushSync();
    store.add('ashsalt');
    store.add('ashsalt'); // untried, 2x ashsalt
    flushSync();
    harness.setListing(
      baseListing({
        recipes: [
          concreteRecipe('vigor', 'Elixir of Vigor', { emberroot: 1, springwater: 2 }, 'Vigor'),
          concreteRecipe('smoke', 'Smoke Bomb', { ashsalt: 2 }, 'Smoke'),
        ],
        undiscoveredCount: 0,
      })
    );
    await store.brew();
    flushSync();
    assert.deepEqual(harness.calls.submit[0].submittedComponentIds, ['ashsalt', 'ashsalt']);
    assert.equal(harness.calls.submit[0].interactive, true);
    assert.equal(store.benchEmpty, true, 'the bench clears after a brew');
    assert.equal(store.lastBrew.ok, true);
    assert.equal(store.lastBrew.discovered, 'Smoke Bomb');
  });

  it('a fizzled brew banners a no-reaction (no discovery) and runs no roll expectation', async () => {
    const harness = makeServices({
      submitAlchemyAttempt: async () => ({ success: false, disposition: 'no-match', message: 'FIZZLE', consumed: true }),
    });
    const store = createAlchemyStore({ services: harness.services });
    await store.load();
    flushSync();
    store.add('ashsalt');
    flushSync();
    await store.brew();
    flushSync();
    assert.equal(store.lastBrew.ok, false);
    assert.equal(store.lastBrew.discovered, null);
    assert.equal(store.benchEmpty, true);
  });

  it('a dismissed interactive roll is returned quietly (bench preserved)', async () => {
    const harness = makeServices({
      submitAlchemyAttempt: async () => ({ success: false, cancelled: true }),
    });
    const store = createAlchemyStore({ services: harness.services });
    await store.load();
    flushSync();
    store.selectRecipe('vigor');
    flushSync();
    const result = await store.brew();
    flushSync();
    assert.equal(result.cancelled, true);
    assert.equal(store.benchEmpty, false, 'a cancelled roll leaves the bench intact');
  });
});

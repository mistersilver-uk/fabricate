import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';
import { fakeCraftingStore, listing, recipe } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-crafting-view-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/CraftingView.svelte'
});

function services(store, extra = {}) {
  return { crafting: store, craftingSources: null, actorBar: null, ...extra };
}

describe('CraftingView mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the loading state before the first load resolves', async () => {
    const store = fakeCraftingStore({ loading: true, loadedOnce: false, recipes: [] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="loading"]'), 'loading state shown');
    assert.equal(target.querySelector('[data-crafting-state="populated"]'), null);
  });

  it('renders the error state when the store reports an error', async () => {
    const store = fakeCraftingStore({ error: 'boom', recipes: [] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="error"]'), 'error state shown');
  });

  it('renders the no-actor state when the listing has no selected actor', async () => {
    const store = fakeCraftingStore({ recipes: [], listing: listing([], { selectedActorId: null }) });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="no-actor"]'), 'no-actor state shown');
    assert.equal(target.querySelector('[data-crafting-state="empty"]'), null);
  });

  it('renders the empty state when an actor is selected but has no recipes', async () => {
    const store = fakeCraftingStore({ recipes: [] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="empty"]'), 'empty state shown');
  });

  it('renders the populated 3-column layout with a recipe', async () => {
    const store = fakeCraftingStore({ recipes: [recipe()] });
    const target = await harness.mount({ services: services(store) });

    assert.equal(target.querySelector('[data-crafting-state="loading"]'), null, 'loading cleared');
    assert.ok(target.querySelector('[data-crafting-state="populated"]'), 'populated layout shown');
    assert.ok(target.querySelector('.crafting-view-column-left'), 'left column present');
    assert.ok(target.querySelector('.crafting-view-column-center'), 'center column present');
    assert.ok(target.querySelector('.crafting-view-column-right'), 'right column present');
    // The browser lists the recipe and the detail dispatcher resolves the body.
    assert.ok(target.querySelector('[data-recipe-id="recipe-1"]'), 'recipe row rendered in browser');
    assert.ok(target.querySelector('[data-crafting-detail-state="selected"]'), 'detail shows the selected recipe');
  });

  it('shows the shopping list in the right column by default (no completed run)', async () => {
    const store = fakeCraftingStore({ recipes: [recipe()] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-shopping]'), 'shopping list rendered');
    assert.equal(target.querySelector('[data-crafting-run-summary]'), null, 'no run summary without a result');
  });

  it('swaps the right column to the run summary once the selected recipe has a roll result', async () => {
    const built = recipe();
    const store = fakeCraftingStore({
      recipes: [built],
      lastRollResult: { 'recipe-1': { success: true, items: [{ name: 'Healing Potion', qty: 1 }] } }
    });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-run-summary]'), 'run summary rendered for a completed run');
    assert.equal(target.querySelector('[data-crafting-shopping]'), null, 'shopping list hidden while the run summary is shown');
  });
});

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-shopping-list-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/ShoppingList.svelte'
});

function aggregate(overrides = {}) {
  return {
    ingredients: [
      { componentId: 'c1', description: 'Spring Water', totalNeed: 4, have: 2, missing: 2, satisfied: false },
      { componentId: 'c2', description: 'Red Herb', totalNeed: 2, have: 2, missing: 0, satisfied: true }
    ],
    essences: [],
    tools: [],
    allSatisfied: false,
    totalRecipes: 1,
    totalQuantity: 2,
    ...overrides
  };
}

describe('ShoppingList mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the empty state with no queued recipes', async () => {
    const target = await harness.mount({ aggregate: null, entries: [] });
    assert.ok(target.querySelector('[data-crafting-shopping-empty]'), 'empty state shown');
    assert.equal(target.querySelector('[data-shopping-entry]'), null, 'no queue entries');
  });

  it('lists queued recipes and the aggregated Have/Need/Missing materials', async () => {
    const entries = [{ recipeId: 'recipe-1', quantity: 2, name: 'Healing Potion', img: null }];
    const target = await harness.mount({ aggregate: aggregate(), entries });

    assert.ok(target.querySelector('[data-shopping-entry="recipe-1"]'), 'queued recipe rendered');
    assert.ok(target.querySelector('[data-shopping-materials]'), 'materials section rendered');

    const rows = target.querySelectorAll('.crafting-shopping-mat');
    assert.equal(rows.length, 2, 'one row per aggregated material');
    // The unsatisfied ingredient renders a Missing tag (danger tone); the satisfied
    // one does not.
    const missingTags = target.querySelectorAll('[data-crafting-qty-tone="danger"]');
    assert.equal(missingTags.length, 1, 'only the unsatisfied material shows a Missing tag');
  });

  it('shows the all-satisfied note when every material is covered', async () => {
    const entries = [{ recipeId: 'recipe-1', quantity: 1, name: 'Healing Potion', img: null }];
    const satisfied = aggregate({
      ingredients: [{ componentId: 'c1', description: 'Spring Water', totalNeed: 2, have: 2, missing: 0, satisfied: true }],
      allSatisfied: true
    });
    const target = await harness.mount({ aggregate: satisfied, entries });
    assert.ok(target.querySelector('[data-shopping-satisfied]'), 'all-satisfied note shown');
  });

  it('invokes onRemove when a queue entry remove button is clicked', async () => {
    const removed = [];
    const entries = [{ recipeId: 'recipe-1', quantity: 1, name: 'Healing Potion', img: null }];
    const target = await harness.mount({
      aggregate: aggregate(),
      entries,
      onRemove: (id) => removed.push(id)
    });

    target.querySelector('.crafting-shopping-remove').click();
    flushSync();
    assert.deepEqual(removed, ['recipe-1'], 'onRemove called with the recipe id');
  });
});

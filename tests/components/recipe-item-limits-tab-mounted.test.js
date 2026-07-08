import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-limits-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte'
});

function itemDraft(overrides = {}) {
  return { id: 'ri1', caps: { item: { limitUses: false, maxUses: 3, whenSpent: 'destroyed', ...overrides }, learn: {} } };
}
function learnDraft(overrides = {}) {
  return { id: 'ri1', caps: { item: {}, learn: { limitLearning: false, learningMode: 'once', learnsAllowed: 1, ...overrides } } };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemLimitsTab (mounted)', () => {
  it('renders only the item Uses card in item mode', async () => {
    const root = await harness.mount({ recipeItem: itemDraft(), visibilityMode: 'item' });
    assert.ok(root.querySelector('[data-recipe-item-limits-card="item"]'));
    assert.equal(root.querySelector('[data-recipe-item-limits-card="knowledge"]'), null);
  });

  it('renders only the knowledge Learning card in knowledge mode', async () => {
    const root = await harness.mount({ recipeItem: learnDraft(), visibilityMode: 'knowledge' });
    assert.ok(root.querySelector('[data-recipe-item-limits-card="knowledge"]'));
    assert.equal(root.querySelector('[data-recipe-item-limits-card="item"]'), null);
  });

  it('emits a limitUses patch and hides detail while off', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: itemDraft({ limitUses: false }), visibilityMode: 'item', onPatch: (p) => patches.push(p) });
    assert.equal(root.querySelector('[data-recipe-item-uses-stepper]'), null, 'uses detail hidden while limited-use is off');
    root.querySelector('[data-recipe-item-limit-uses]').click();
    assert.deepEqual(patches, [{ caps: { item: { limitUses: true } } }]);
  });

  it('steps uses per copy (min 1) via nested caps patch', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: itemDraft({ limitUses: true, maxUses: 1 }), visibilityMode: 'item', onPatch: (p) => patches.push(p) });
    assert.equal(root.querySelector('[data-recipe-item-uses-value]').textContent.trim(), '1');
    // Decrement is clamped at 1 -> no patch.
    root.querySelector('[data-recipe-item-uses-dec]').click();
    assert.equal(patches.length, 0);
    root.querySelector('[data-recipe-item-uses-inc]').click();
    assert.deepEqual(patches, [{ caps: { item: { maxUses: 2 } } }]);
  });

  it('emits a whenSpent patch from the segmented control', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: itemDraft({ limitUses: true }), visibilityMode: 'item', onPatch: (p) => patches.push(p) });
    const inertRadio = root.querySelector('[data-recipe-item-when-spent-option="inert"] input[type="radio"]');
    inertRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(patches, [{ caps: { item: { whenSpent: 'inert' } } }]);
  });

  it('emits a limitLearning patch and a learningMode patch', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learningMode: 'once' }), visibilityMode: 'knowledge', onPatch: (p) => patches.push(p) });
    const ntimes = root.querySelector('[data-recipe-item-learning-mode-option="ntimes"] input[type="radio"]');
    ntimes.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(patches, [{ caps: { learn: { learningMode: 'ntimes' } } }]);
  });

  it('disables and pins the learns stepper to 1 in once mode', async () => {
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learningMode: 'once', learnsAllowed: 5 }), visibilityMode: 'knowledge' });
    assert.equal(root.querySelector('[data-recipe-item-learns-value]').textContent.trim(), '1');
    assert.equal(root.querySelector('[data-recipe-item-learns-inc]').disabled, true);
    assert.equal(root.querySelector('[data-recipe-item-learns-dec]').disabled, true);
  });

  it('steps learns allowed in ntimes mode', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learningMode: 'ntimes', learnsAllowed: 2 }), visibilityMode: 'knowledge', onPatch: (p) => patches.push(p) });
    assert.equal(root.querySelector('[data-recipe-item-learns-value]').textContent.trim(), '2');
    root.querySelector('[data-recipe-item-learns-inc]').click();
    assert.deepEqual(patches, [{ caps: { learn: { learnsAllowed: 3 } } }]);
  });

  it('emits a prerequisite patch (id or null) from the selector', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learningMode: 'ntimes', learnsAllowed: 2 }),
      visibilityMode: 'knowledge',
      linkedRecipes: [{ id: 'r1', name: 'Alloy Bronze' }],
      onPatch: (p) => patches.push(p)
    });
    const select = root.querySelector('[data-recipe-item-prerequisite]');
    select.value = 'r1';
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(patches, [{ caps: { learn: { prerequisite: 'r1' } } }]);
  });

  it('renders a live learning explanation that reflects the mode', async () => {
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learningMode: 'party', learnsAllowed: 4 }), visibilityMode: 'knowledge' });
    const explain = root.querySelector('[data-recipe-item-learn-explain]').textContent;
    assert.match(explain, /party/i);
    assert.match(explain, /4/);
  });
});

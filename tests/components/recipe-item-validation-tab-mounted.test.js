import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-validation-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte'
});

function draft(overrides = {}) {
  return { id: 'ri1', originItemUuid: '', linkedRecipeIds: [], caps: { item: {}, learn: {} }, ...overrides };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

function check(root, id) {
  return root.querySelector(`[data-recipe-item-check="${id}"]`);
}

describe('RecipeItemValidationTab (mounted)', () => {
  it('flags a missing linked item and missing recipes as critical', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: null, visibilityMode: 'item' });
    assert.equal(check(root, 'itemLinked').getAttribute('data-ok'), 'false');
    assert.equal(check(root, 'recipeLinked').getAttribute('data-ok'), 'false');
    // usesValid holds (limited-use is off), so only itemLinked + recipeLinked fail.
    const pill = root.querySelector('[data-recipe-item-validation-pill]');
    assert.equal(pill.getAttribute('data-critical-count'), '2');
    assert.ok(pill.classList.contains('is-danger'));
  });

  it('passes all checks when linked, with recipes and valid uses', async () => {
    const root = await harness.mount({
      recipeItem: draft({ linkedRecipeIds: ['r1'], caps: { item: { limitUses: true, maxUses: 2 }, learn: {} } }),
      linkedItem: { uuid: 'Item.a' },
      visibilityMode: 'item'
    });
    assert.equal(check(root, 'itemLinked').getAttribute('data-ok'), 'true');
    assert.equal(check(root, 'recipeLinked').getAttribute('data-ok'), 'true');
    assert.equal(check(root, 'usesValid').getAttribute('data-ok'), 'true');
    const pill = root.querySelector('[data-recipe-item-validation-pill]');
    assert.equal(pill.getAttribute('data-critical-count'), '0');
    assert.ok(pill.classList.contains('is-active'));
  });

  it('shows the uses check only in item mode', async () => {
    const itemRoot = await harness.mount({ recipeItem: draft({ linkedRecipeIds: ['r1'] }), linkedItem: { uuid: 'Item.a' }, visibilityMode: 'item' });
    assert.ok(check(itemRoot, 'usesValid'));
    assert.equal(check(itemRoot, 'learnsValid'), null);
    harness.remount();
    const knowRoot = await harness.mount({ recipeItem: draft({ linkedRecipeIds: ['r1'] }), linkedItem: { uuid: 'Item.a' }, visibilityMode: 'knowledge' });
    assert.ok(check(knowRoot, 'learnsValid'));
    assert.equal(check(knowRoot, 'usesValid'), null);
  });

  it('flags an invalid ntimes learns count in knowledge mode', async () => {
    const root = await harness.mount({
      recipeItem: draft({ linkedRecipeIds: ['r1'], caps: { item: {}, learn: { limitLearning: true, learningMode: 'ntimes', learnsAllowed: 0 } } }),
      linkedItem: { uuid: 'Item.a' },
      visibilityMode: 'knowledge'
    });
    assert.equal(check(root, 'learnsValid').getAttribute('data-ok'), 'false');
  });

  it('prefers an explicit validation prop over the local computation', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: null,
      visibilityMode: 'item',
      validation: { checks: [{ id: 'itemLinked', ok: true, label: 'Custom rule' }] }
    });
    const only = root.querySelectorAll('[data-recipe-item-check]');
    assert.equal(only.length, 1);
    assert.equal(only[0].getAttribute('data-ok'), 'true');
    assert.match(only[0].textContent, /Custom rule/);
  });
});

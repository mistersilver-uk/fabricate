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

function blockingTile(root) {
  return root.querySelector('[data-recipe-item-count-blocking]');
}

function summary(root) {
  return root.querySelector('[data-recipe-item-validation-summary]');
}

describe('RecipeItemValidationTab (mounted)', () => {
  it('flags a missing linked item and missing recipes as blocking, with the summary card + count tiles', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: null, visibilityMode: 'item' });
    // Row hooks + per-row status treatment (bordered rows with pass/block pills).
    assert.equal(check(root, 'itemLinked').getAttribute('data-ok'), 'false');
    assert.equal(check(root, 'recipeLinked').getAttribute('data-ok'), 'false');
    assert.ok(check(root, 'itemLinked').classList.contains('is-block'));
    assert.ok(check(root, 'itemLinked').querySelector('.manager-recipe-val-pill.is-block'));
    // usesValid holds (limited-use is off), so it passes.
    assert.equal(check(root, 'usesValid').getAttribute('data-ok'), 'true');
    assert.ok(check(root, 'usesValid').classList.contains('is-pass'));
    assert.ok(check(root, 'usesValid').querySelector('.manager-recipe-val-pill.is-pass'));
    // A grouped bordered-row block with the Requirements group header.
    assert.ok(root.querySelector('[data-recipe-item-validation-group="requirements"] .manager-recipe-val-group-label'));
    // Summary card reads blocked; the two count tiles reflect 1 passing / 2 blocking,
    // and the critical-count observable now lives on the blocking tile.
    assert.equal(summary(root).getAttribute('data-recipe-item-validation-summary'), 'blocked');
    assert.ok(summary(root).classList.contains('is-blocked'));
    assert.equal(root.querySelector('[data-recipe-item-count-passing]').textContent.trim(), '1');
    assert.equal(blockingTile(root).textContent.trim(), '2');
    assert.equal(blockingTile(root).getAttribute('data-critical-count'), '2');
    // Exactly two count tiles — no Warnings tile (books validation is two-state).
    assert.equal(root.querySelectorAll('[data-recipe-item-validation-counts] .manager-recipe-rail-count').length, 2);
    assert.equal(root.querySelector('.manager-recipe-rail-count.is-warning'), null);
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
    assert.ok(check(root, 'itemLinked').querySelector('.manager-recipe-val-pill.is-pass'));
    assert.equal(summary(root).getAttribute('data-recipe-item-validation-summary'), 'clear');
    assert.ok(summary(root).classList.contains('is-clear'));
    assert.equal(root.querySelector('[data-recipe-item-count-passing]').textContent.trim(), '3');
    assert.equal(blockingTile(root).textContent.trim(), '0');
    assert.equal(blockingTile(root).getAttribute('data-critical-count'), '0');
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

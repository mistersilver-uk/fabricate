import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-limits-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // The Limits tab's "Character prerequisites to learn" picker imports the pure
    // prerequisite engine (issue 544).
    'src/systems/characterPrerequisites.js',
  ],
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
  return { id: 'ri1', caps: { item: {}, learn: { limitLearning: false, learnScope: 'perInstance', learnsAllowed: 1, ...overrides } } };
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

  it('lists character prerequisites and toggles one into caps.learn (issue 544)', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft(),
      visibilityMode: 'knowledge',
      characterPrerequisites: [
        { id: 'p1', name: 'Expert Crafter', path: 'skills.cra.rank', op: 'gte', value: 2 },
      ],
      onPatch: (p) => patches.push(p),
    });
    const section = root.querySelector('[data-recipe-item-character-prereqs]');
    assert.ok(section, 'the character-prerequisites section renders');
    assert.match(section.textContent, /@skills\.cra\.rank ≥ 2/, 'shows the live preview');
    root.querySelector('[data-recipe-item-character-prereq="p1"] input').click();
    assert.deepEqual(patches, [{ caps: { learn: { characterPrerequisiteIds: ['p1'] } } }]);
  });

  it('shows an empty-state when no character prerequisites are defined', async () => {
    const root = await harness.mount({
      recipeItem: learnDraft(),
      visibilityMode: 'knowledge',
      characterPrerequisites: [],
    });
    assert.ok(root.querySelector('[data-recipe-item-character-prereqs-empty]'));
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

  it('emits a learnScope patch from the segmented control', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance' }), visibilityMode: 'knowledge', onPatch: (p) => patches.push(p) });
    const total = root.querySelector('[data-recipe-item-learn-scope-option="total"] input[type="radio"]');
    total.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(patches, [{ caps: { learn: { learnScope: 'total' } } }]);
  });

  it('keeps the learns stepper active in both scopes (no forced pin)', async () => {
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 5 }), visibilityMode: 'knowledge' });
    assert.equal(root.querySelector('[data-recipe-item-learns-value]').textContent.trim(), '5');
    assert.equal(root.querySelector('[data-recipe-item-learns-inc]').disabled, false);
    assert.equal(root.querySelector('[data-recipe-item-learns-dec]').disabled, false);
  });

  it('steps recipes allowed', async () => {
    const patches = [];
    const root = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 2 }), visibilityMode: 'knowledge', onPatch: (p) => patches.push(p) });
    assert.equal(root.querySelector('[data-recipe-item-learns-value]').textContent.trim(), '2');
    root.querySelector('[data-recipe-item-learns-inc]').click();
    assert.deepEqual(patches, [{ caps: { learn: { learnsAllowed: 3 } } }]);
  });

  it('emits a prerequisite patch (id or null) from the selector', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 2 }),
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

  it('renders a live learning explanation that reflects the scope', async () => {
    const total = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learnScope: 'total', learnsAllowed: 4 }), visibilityMode: 'knowledge' });
    const totalText = total.querySelector('[data-recipe-item-learn-explain]').textContent;
    assert.match(totalText, /total/i);
    assert.match(totalText, /4/);
    harness.remount();
    const perCopy = await harness.mount({ recipeItem: learnDraft({ limitLearning: true, learnScope: 'perInstance', learnsAllowed: 2 }), visibilityMode: 'knowledge' });
    assert.match(perCopy.querySelector('[data-recipe-item-learn-explain]').textContent, /copy/i);
  });
});

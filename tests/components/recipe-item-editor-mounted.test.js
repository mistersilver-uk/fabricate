import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-editor-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/recipeItemAccessBadge.js',
    // The Limits tab's character-prerequisite picker imports the pure engine (issue 544).
    'src/systems/characterPrerequisites.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/ItemPickerModal.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte',
    'src/ui/svelte/apps/manager/RecipeItemEditor.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/RecipeItemEditor.svelte'
});

const LINKED_ITEM = { uuid: 'Item.abc', name: 'Ashfall Compendium', img: '', type: 'Tome' };
const LINKED_RECIPES = [
  { id: 'r1', name: 'Alloy Bronze', category: 'Smithing' },
  { id: 'r2', name: 'Refine Steel', category: 'Smithing' }
];

function draft(overrides = {}) {
  return { id: 'ri1', sourceItemUuid: 'Item.abc', enabled: true, caps: { item: { limitUses: false, maxUses: 3, whenSpent: 'destroyed' }, learn: { limitLearning: false, learnScope: 'perInstance', learnsAllowed: 1 } }, ...overrides };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemEditor (mounted)', () => {
  it('shows an empty state when no recipe item is supplied', async () => {
    const root = await harness.mount({ recipeItem: null });
    assert.ok(root.querySelector('.manager-empty'));
    assert.equal(root.querySelector('[data-recipe-item-editor]'), null);
  });

  it('renders the active tab panel and the right rail', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: LINKED_ITEM, linkedRecipes: LINKED_RECIPES, activeTab: 'overview', visibilityMode: 'item' });
    assert.ok(root.querySelector('[data-recipe-item-tab="overview"]'), 'overview tab panel renders');
    assert.ok(root.querySelector('[data-recipe-item-rail]'), 'right rail renders');
    assert.ok(root.querySelector('[data-recipe-item-preview]'), 'preview card renders');
    assert.ok(root.querySelector('[data-recipe-item-rules]'), 'effective rules render');
  });

  it('switches the rendered tab with the activeTab prop', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: LINKED_ITEM, linkedRecipes: LINKED_RECIPES, activeTab: 'limits', visibilityMode: 'item' });
    assert.ok(root.querySelector('[data-recipe-item-tab="limits"]'));
    assert.equal(root.querySelector('[data-recipe-item-tab="overview"]'), null);
  });

  it('routes the tab strip selection through onSelectTab', async () => {
    const calls = [];
    const root = await harness.mount({ recipeItem: draft(), linkedItem: LINKED_ITEM, linkedRecipes: LINKED_RECIPES, activeTab: 'overview', onSelectTab: (id) => calls.push(id) });
    root.querySelector('[data-recipe-item-tab-button="contents"]').click();
    assert.deepEqual(calls, ['contents']);
  });

  it('derives the contents count badge and a passing validation badge', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: LINKED_ITEM, linkedRecipes: LINKED_RECIPES, activeTab: 'overview', visibilityMode: 'item' });
    assert.equal(root.querySelector('[data-recipe-item-tab-badge="contents"]').textContent.trim(), '2');
    const validation = root.querySelector('[data-recipe-item-tab-badge="validation"]');
    assert.equal(validation.textContent.trim(), '✓');
    assert.ok(validation.classList.contains('is-active'));
  });

  it('turns the validation badge danger when the linked item is missing', async () => {
    const root = await harness.mount({ recipeItem: draft({ sourceItemUuid: '' }), linkedItem: null, linkedRecipes: [], activeTab: 'overview', visibilityMode: 'item' });
    const validation = root.querySelector('[data-recipe-item-tab-badge="validation"]');
    // itemLinked + recipeLinked both fail = 2 critical.
    assert.equal(validation.textContent.trim(), '2');
    assert.ok(validation.classList.contains('is-danger'));
  });

  it('recomputes the item-mode preview and effective rules from caps', async () => {
    const root = await harness.mount({
      recipeItem: draft({ caps: { item: { limitUses: true, maxUses: 5, whenSpent: 'inert' }, learn: {} } }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'item'
    });
    // Item mode: the use cap is the badge under the name; the CTA is CRAFT-based.
    assert.match(root.querySelector('[data-recipe-item-preview-badge]').textContent, /5 uses/);
    assert.match(root.querySelector('[data-recipe-item-preview-cta]').textContent, /Craft 2 recipes/i);
    const rules = root.querySelector('[data-recipe-item-rules]').textContent;
    assert.match(rules, /5 uses per copy/);
    assert.match(rules, /inert/i);
  });

  it('shows knowledge-mode preview and rules when the visibility mode is knowledge', async () => {
    const root = await harness.mount({
      recipeItem: draft({ caps: { item: {}, learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 3 } } }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'knowledge'
    });
    assert.match(root.querySelector('[data-recipe-item-preview-badge]').textContent, /up to 3 per copy/i);
    assert.match(root.querySelector('[data-recipe-item-rules]').textContent, /every recipe/i);
  });

  it('shows the no-recipes CTA and disables it when nothing is linked inside', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: LINKED_ITEM, linkedRecipes: [], activeTab: 'overview', visibilityMode: 'item' });
    const cta = root.querySelector('[data-recipe-item-preview-cta]');
    // The preview CTA is presentational (a preview of the player's control), not an
    // interactive button — it must not be a focusable/activatable dead affordance.
    assert.equal(cta.tagName, 'DIV', 'preview CTA is non-interactive');
    assert.ok(cta.classList.contains('is-disabled'), 'the no-recipes CTA is visually disabled');
    assert.match(cta.textContent, /No recipes/i);
  });

  it('surfaces requirements as "Needs:" effective-rules rows AND preview-card chips (issue 544)', async () => {
    const root = await harness.mount({
      recipeItem: draft({ caps: { item: {}, learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 3, prerequisiteIds: ['r1'], characterPrerequisiteIds: ['p1'] } } }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      characterPrerequisites: [{ id: 'p1', name: 'Wizardly', icon: 'fas fa-hat-wizard', path: 'skills.arc.rank', op: 'gte', value: 2 }],
      activeTab: 'overview',
      visibilityMode: 'knowledge'
    });
    // The separate Requirements rail section is gone.
    assert.equal(root.querySelector('[data-recipe-item-requirements]'), null, 'no separate Requirements section');

    // Effective rules now carry one "Needs: <name>" ROW per requirement, both kinds.
    const rules = root.querySelector('[data-recipe-item-rules]').textContent;
    assert.match(rules, /Needs: Alloy Bronze/, 'a Required Knowledge rule row');
    assert.match(rules, /Needs: Wizardly/, 'a Learning prerequisite rule row');
    // The character-prereq rule sub shows the human-readable preview (@path op value).
    assert.match(rules, /arc\.rank/, 'the prereq preview appears as the rule sub');

    // Preview card shows the read-only "Needs:" chips (both kinds) with icons.
    const needs = root.querySelector('[data-recipe-item-preview-needs]');
    assert.ok(needs, 'the preview card renders a Needs chip row');
    const rkChip = needs.querySelector('[data-recipe-item-needs-chip="r1"]');
    assert.ok(rkChip, 'a Required Knowledge Needs chip renders');
    assert.match(rkChip.textContent, /Needs: Alloy Bronze/);
    assert.ok(rkChip.querySelector('i.fa-scroll'), 'the Required Knowledge chip has a leading scroll icon');
    // Mirrors the player chip: a trailing lock glyph (the GM preview has no actor, so
    // it shows the not-yet-qualified/locked appearance).
    assert.ok(rkChip.querySelector('i.fa-lock'), 'the preview chip carries a trailing lock glyph');
    assert.equal(rkChip.querySelector('button'), null, 'the preview chip is read-only (no remove)');
    const cpChip = needs.querySelector('[data-recipe-item-needs-chip="p1"]');
    assert.ok(cpChip, 'a Learning prerequisite Needs chip renders');
    assert.match(cpChip.textContent, /Needs: Wizardly/);
    assert.ok(cpChip.querySelector('i.fa-hat-wizard'), 'the prereq chip uses the prereq’s own leading icon');
    assert.ok(cpChip.querySelector('i.fa-lock'), 'the prereq preview chip also carries a trailing lock glyph');
  });

  it('drops the "Needs:" rules and preview chips when Limited learning is off (gates toggle-gated)', async () => {
    const root = await harness.mount({
      recipeItem: draft({ caps: { item: {}, learn: { limitLearning: false, prerequisiteIds: ['r1'], characterPrerequisiteIds: ['p1'] } } }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      characterPrerequisites: [{ id: 'p1', name: 'Wizardly', icon: 'fas fa-hat-wizard', path: 'x', op: 'gte', value: 1 }],
      activeTab: 'overview',
      visibilityMode: 'knowledge'
    });
    assert.equal(root.querySelector('[data-recipe-item-preview-needs]'), null, 'no preview Needs chips when off');
    assert.equal(/Needs:/i.test(root.querySelector('[data-recipe-item-rules]').textContent), false, 'no Needs rules when off');
  });
});

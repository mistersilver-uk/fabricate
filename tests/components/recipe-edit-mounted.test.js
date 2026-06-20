import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES
} from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/dropUtils.js',
  'src/ui/svelte/actions/dragDrop.js',
  // recipeImageIcons re-exports DEFAULT_RECIPE_IMAGE from the Recipe model
  // (the single low-layer source of truth), so the harness must copy that
  // module and its transitive model dependencies.
  'src/ui/svelte/util/recipeImageIcons.js',
  'src/models/Recipe.js',
  'src/models/Ingredient.js',
  'src/models/IngredientSet.js',
  'src/models/IngredientGroup.js',
  'src/models/Result.js',
  'src/utils/recipeCategories.js',
  'src/config/flags.js',
  // The validation tab consumes the pure readiness evaluator.
  'src/ui/svelte/apps/manager/recipe/recipeReadiness.js',
  // RecipeToolsSection embeds SearchablePopover for the Tools picker; the harness
  // must copy its supporting raw modules (portal/dismiss/layout helpers).
  ...SEARCHABLE_POPOVER_RAW_MODULES
];

// The new tab + section components the editor shell composes.
const RECIPE_COMPILED = [
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeToolsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeEditorTabs.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeStepAccordion.svelte',
  'src/ui/svelte/apps/manager/RecipeStepsCard.svelte',
  'src/ui/svelte/apps/manager/RecipeEditView.svelte'
];

const editHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-edit-',
  rawModules: RAW_MODULES,
  compiledModules: RECIPE_COMPILED,
  componentPath: 'src/ui/svelte/apps/manager/RecipeEditView.svelte'
});

const inspectorHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-inspector-',
  rawModules: RAW_MODULES,
  compiledModules: ['src/ui/svelte/apps/manager/RecipeItemInspector.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/RecipeItemInspector.svelte'
});

const stepsHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-steps-',
  rawModules: RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeToolsSection.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeStepAccordion.svelte',
    'src/ui/svelte/apps/manager/RecipeStepsCard.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/RecipeStepsCard.svelte'
});

const RECIPE = Object.freeze({
  id: 'r1',
  name: 'Healing Draught',
  description: 'A restorative brew.',
  img: 'icons/consumables/potions/potion-tube-corked-red.webp',
  enabled: true,
  recipeItemId: ''
});

function identityProps(overrides = {}) {
  return {
    recipe: RECIPE,
    saving: false,
    onBack: () => {},
    onSave: () => true,
    onDirtyChange: () => {},
    onDraftChange: () => {},
    onPickImagePath: null,
    ...overrides
  };
}

function inspectorProps(overrides = {}) {
  return {
    recipe: RECIPE,
    recipeItemDefinitions: [],
    onAddRecipeItem: () => false,
    onSetRecipeItem: () => {},
    onOpenItem: () => {},
    onCopyItemUuid: () => {},
    ...overrides
  };
}

const CURRENCY_UNITS = Object.freeze([
  { id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins' }
]);

const TOOLS_LIBRARY = Object.freeze([
  Object.freeze({ id: 'tool-hammer', label: 'Hammer', componentId: 'cmp-hammer' }),
  Object.freeze({ id: 'tool-anvil', label: 'Anvil', componentId: 'cmp-anvil' })
]);

const STEPS = Object.freeze([
  Object.freeze({
    id: 'step-1',
    name: 'Gather reagents',
    description: 'Collect the base herbs.',
    timeRequirement: { minutes: 30, hours: 2, days: 0, months: 0, years: 0 },
    currencyRequirement: { unit: 'gp', amount: 5 }
  }),
  Object.freeze({ id: 'step-2', name: 'Distil', description: '', timeRequirement: null, currencyRequirement: null })
]);

// Let Svelte's scheduler flush DOM updates triggered by an event handler.
function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function stepsProps(overrides = {}) {
  return {
    steps: STEPS,
    currencyUnits: CURRENCY_UNITS,
    onAddStep: () => {},
    onReorderSteps: () => {},
    onUpdateStep: () => {},
    onDeleteStep: () => {},
    ...overrides
  };
}

function clickTab(target, tab) {
  target.querySelector(`[data-recipe-tab-button="${tab}"]`).click();
}

// Drive a drop through the dragDrop action using a plain Event + a dataTransfer
// stub (text/plain JSON), not a synthetic native DragEvent.
function dispatchDrop(node, payload) {
  const event = new globalThis.window.Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = { getData: (type) => (type === 'text/plain' ? JSON.stringify(payload) : '') };
  node.dispatchEvent(event);
}

describe('RecipeEditView (mounted)', () => {
  before(async () => {
    await editHarness.setup();
  });

  after(() => {
    editHarness.teardown();
  });

  it('renders the four editor tabs with Overview active by default', async () => {
    const target = await editHarness.mount(identityProps());
    const tabs = [...target.querySelectorAll('[data-recipe-tab-button]')].map((btn) => btn.getAttribute('data-recipe-tab-button'));
    assert.deepEqual(tabs, ['overview', 'ingredients', 'results', 'validation'], 'four tabs render in order');
    assert.equal(target.querySelector('[role="tabpanel"]').getAttribute('id'), 'recipe-panel-overview', 'overview panel is shown first');
    assert.ok(target.querySelector('[data-recipe-tab="overview"]'), 'overview tab content renders');
    editHarness.remount();
  });

  it('renders the identity inputs in Overview and no recipe-item card', async () => {
    const target = await editHarness.mount(identityProps());
    assert.ok(target.querySelector('[data-recipe-field="name"]'), 'name input renders');
    assert.ok(target.querySelector('[data-recipe-field="description"]'), 'description textarea renders');
    assert.ok(target.querySelector('[data-recipe-field="enabled"]'), 'enabled toggle renders');
    assert.equal(target.querySelector('[data-recipe-section="recipe-item"]'), null, 'no recipe-item card in the view');
    assert.equal(target.querySelector('[data-recipe-section="steps"]'), null, 'no steps card for a single-step recipe');
    editHarness.remount();
  });

  it('swaps the visible tabpanel when a tab is clicked', async () => {
    const target = await editHarness.mount(identityProps({ toolsLibrary: TOOLS_LIBRARY }));
    // Overview hosts Tools; Ingredients/Results are on their own tabs.
    assert.ok(target.querySelector('[data-recipe-section="tools"]'), 'tools section lives in Overview');
    assert.equal(target.querySelector('[data-recipe-section="ingredients"]'), null, 'ingredients not in Overview');

    clickTab(target, 'ingredients');
    await flushRender();
    assert.equal(target.querySelector('[role="tabpanel"]').getAttribute('id'), 'recipe-panel-ingredients', 'panel switched to ingredients');
    assert.ok(target.querySelector('[data-recipe-section="ingredients"]'), 'ingredients section renders on its tab');
    assert.equal(target.querySelector('[data-recipe-section="tools"]'), null, 'tools no longer rendered');

    clickTab(target, 'results');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="results"]'), 'results section renders on its tab');

    clickTab(target, 'validation');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-tab="validation"]'), 'validation tab renders');
    editHarness.remount();
  });

  it('shows the steps card in Overview only when the recipe is multi-step', async () => {
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] }
    }));
    const stepsCard = target.querySelector('[data-recipe-section="steps"]');
    assert.ok(stepsCard, 'steps card present for a multi-step recipe');
    assert.ok(target.querySelector('[data-recipe-tab="overview"]').contains(stepsCard), 'steps card lives in the Overview tab');
    editHarness.remount();
  });

  it('marks the draft dirty and pushes a draft when the name changes', async () => {
    const dirtyCalls = [];
    const draftCalls = [];
    const target = await editHarness.mount(identityProps({
      onDirtyChange: (dirty) => dirtyCalls.push(dirty),
      onDraftChange: (draft) => draftCalls.push(draft)
    }));
    const nameInput = target.querySelector('[data-recipe-field="name"]');
    nameInput.value = 'Greater Healing Draught';
    nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await Promise.resolve();

    assert.ok(dirtyCalls.includes(true), 'onDirtyChange(true) fired');
    const lastDraft = draftCalls.at(-1);
    assert.equal(lastDraft.name, 'Greater Healing Draught', 'draft carries the edited name');
    assert.equal(lastDraft.dirty, true, 'draft is dirty');
    editHarness.remount();
  });

  it('renders an editable image picker button when no recipe item is linked', async () => {
    const target = await editHarness.mount(identityProps({ onPickImagePath: async () => '' }));
    assert.ok(target.querySelector('button[data-recipe-field="img"]'), 'editable image picker button renders');
    assert.equal(target.querySelector('[data-recipe-item-locked-image]'), null, 'no locked-image span when unlinked');
    editHarness.remount();
  });

  it('locks the image picker to the linked recipe item image when recipeItemId is set', async () => {
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, recipeItemId: 'ri1' },
      linkedItemImage: 'icons/consumables/potions/potion-tube-corked-blue.webp',
      onPickImagePath: async () => 'icons/should-not-be-used.webp'
    }));
    const locked = target.querySelector('[data-recipe-item-locked-image]');
    assert.ok(locked, 'locked-image span renders when linked');
    assert.ok(locked.classList.contains('is-recipe-item-linked'), 'uses the recipe-specific locked class');
    assert.ok(locked.querySelector('.fa-lock'), 'shows a lock icon');
    assert.equal(target.querySelector('button[data-recipe-field="img"]'), null, 'no editable picker button when locked');
    const img = locked.querySelector('img');
    assert.ok(
      img.getAttribute('src').includes('potion-tube-corked-blue'),
      'shows the linked item image'
    );
    editHarness.remount();
  });

  it('invokes onSave with identity-only draft updates on submit', async () => {
    const saved = [];
    const target = await editHarness.mount(identityProps({ onSave: (id, updates) => { saved.push([id, updates]); return true; } }));
    const nameInput = target.querySelector('[data-recipe-field="name"]');
    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    target.querySelector('#manager-recipe-edit-form').dispatchEvent(new globalThis.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    assert.equal(saved.length, 1, 'onSave invoked once');
    assert.equal(saved[0][0], 'r1', 'passes the recipe id');
    assert.equal(saved[0][1].name, 'Renamed', 'passes the edited name');
    assert.equal('recipeItemId' in saved[0][1], false, 'identity updates do not carry recipeItemId');
    editHarness.remount();
  });

  it('saves via the header submit button while a non-Overview tab is active', async () => {
    const saved = [];
    const target = await editHarness.mount(identityProps({ onSave: (id, updates) => { saved.push([id, updates]); return true; } }));
    // Edit the name in Overview, then switch to Results and submit the form.
    const nameInput = target.querySelector('[data-recipe-field="name"]');
    nameInput.value = 'From Results Tab';
    nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    clickTab(target, 'results');
    await flushRender();
    assert.equal(target.querySelector('[data-recipe-field="name"]'), null, 'identity inputs are not on the Results tab');
    // The submit button lives in the shared header (form=manager-recipe-edit-form);
    // dispatching submit on the form mirrors clicking it from any tab.
    target.querySelector('#manager-recipe-edit-form').dispatchEvent(new globalThis.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    assert.equal(saved.length, 1, 'onSave fired from a non-Overview tab');
    assert.equal(saved[0][1].name, 'From Results Tab', 'the in-component state (not form fields) is saved');
    editHarness.remount();
  });

  it('renders the single-step ingredient/results/tools sections on their tabs', async () => {
    const target = await editHarness.mount(identityProps({ toolsLibrary: TOOLS_LIBRARY }));
    assert.ok(target.querySelector('[data-recipe-section="tools"]'), 'tools section renders in Overview');
    assert.match(target.textContent, /No tools yet/, 'tools empty text shown');

    clickTab(target, 'ingredients');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="ingredients"]'), 'ingredients section renders');
    assert.match(target.textContent, /No ingredients yet/, 'ingredients empty text shown');
    assert.ok(target.querySelector('[data-recipe-add="ingredient-set"]'), 'add ingredient set button shown');

    clickTab(target, 'results');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="results"]'), 'results section renders');
    assert.match(target.textContent, /No results yet/, 'results empty text shown');
    assert.ok(target.querySelector('[data-recipe-add="result-group"]'), 'add result group button shown');
    editHarness.remount();
  });

  it('appends an ingredient set via onUpdateRecipe when + Add set is clicked', async () => {
    const patches = [];
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, ingredientSets: [{ id: 'set-1' }] },
      onUpdateRecipe: (patch) => patches.push(patch)
    }));
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-add="ingredient-set"]').click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    assert.equal(patches[0].ingredientSets.length, 2, 'the ingredient set array grew by one');
    assert.equal('id' in patches[0].ingredientSets[1], false, 'the appended set carries no id (store assigns one)');
    editHarness.remount();
  });

  it('appends a result group via onUpdateRecipe when + Add result group is clicked', async () => {
    const patches = [];
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, resultGroups: [{ id: 'grp-1' }] },
      onUpdateRecipe: (patch) => patches.push(patch)
    }));
    clickTab(target, 'results');
    await flushRender();
    target.querySelector('[data-recipe-add="result-group"]').click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    assert.equal(patches[0].resultGroups.length, 2, 'the result group array grew by one');
    editHarness.remount();
  });

  it('opens the tools popover in Overview, lists the library, and adds a chosen tool', async () => {
    const patches = [];
    const target = await editHarness.mount(identityProps({
      toolsLibrary: TOOLS_LIBRARY,
      onUpdateRecipe: (patch) => patches.push(patch)
    }));
    const trigger = target.querySelector('[data-recipe-section="tools"] .manager-recipe-tools-trigger');
    assert.ok(trigger, 'tools picker trigger renders in Overview');
    trigger.click();
    await flushRender();
    const options = [...document.querySelectorAll('.manager-travel-option')];
    assert.equal(options.length, 2, 'the popover lists both library tools');
    options.find((option) => /Hammer/.test(option.textContent)).click();
    await flushRender();
    assert.equal(patches.length, 1, 'choosing a tool patches the recipe');
    assert.deepEqual(patches[0].toolIds, ['tool-hammer'], 'the chosen tool id is appended to toolIds');
    editHarness.remount();
  });

  it('renders a selected tool as a removable row that calls onUpdateRecipe', async () => {
    const patches = [];
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, toolIds: ['tool-hammer'] },
      toolsLibrary: TOOLS_LIBRARY,
      onUpdateRecipe: (patch) => patches.push(patch)
    }));
    const row = target.querySelector('[data-recipe-tool-id="tool-hammer"]');
    assert.ok(row, 'a row renders for the selected tool');
    assert.match(row.textContent, /Hammer/, 'the row shows the resolved tool label');
    row.querySelector('[data-recipe-remove="tool"]').click();
    assert.equal(patches.length, 1, 'removing fires onUpdateRecipe');
    assert.deepEqual(patches[0].toolIds, [], 'the removed tool id is filtered out');
    editHarness.remount();
  });

  it('renders per-step ingredient groupings in a collapsible step accordion for a multi-step recipe', async () => {
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge' }, { id: 'sb', name: 'Quench' }] }
    }));
    clickTab(target, 'ingredients');
    await flushRender();
    // One accordion row per step, collapsed by default (no section until expanded).
    assert.ok(target.querySelector('[data-recipe-step-id="sa"]'), 'an accordion row renders per step');
    assert.ok(target.querySelector('[data-recipe-step-id="sb"]'), 'second step accordion row renders');
    assert.equal(target.querySelector('[data-recipe-section="step-sa-ingredients"]'), null, 'collapsed step has no ingredients section');
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="step-sa-ingredients"]'), 'expanding a step reveals its ingredients section (prefixed by step id)');
    editHarness.remount();
  });

  it('routes a per-step ingredient add through onUpdateStep for a multi-step recipe', async () => {
    const updates = [];
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge', ingredientSets: [{ id: 'pre' }] }] },
      onUpdateStep: (id, patch) => updates.push([id, patch])
    }));
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    target.querySelector('[data-recipe-section="step-sa-ingredients"] [data-recipe-add="ingredient-set"]').click();
    assert.equal(updates.length, 1, 'onUpdateStep invoked once');
    assert.equal(updates[0][0], 'sa', 'patches the right step');
    assert.equal(updates[0][1].ingredientSets.length, 2, 'the step ingredient set array grew by one');
    editHarness.remount();
  });

  it('reorders steps from the Results tab via the shared onReorderSteps (keeping ingredients in sync)', async () => {
    const moves = [];
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge' }, { id: 'sb', name: 'Quench' }] },
      onReorderSteps: (from, to) => moves.push([from, to])
    }));
    clickTab(target, 'results');
    await flushRender();
    // Dragging a step header in Results reorders the shared steps array, so the same
    // move applies to the Ingredients (and Overview) views.
    const firstHeader = target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-head');
    firstHeader.dispatchEvent(new globalThis.window.Event('dragstart', { bubbles: true }));
    target.querySelector('[data-recipe-step-id="sb"]').dispatchEvent(new globalThis.window.Event('drop', { bubbles: true, cancelable: true }));
    assert.deepEqual(moves, [[0, 1]], 'reordering in Results fires the shared onReorderSteps(from, to)');
    editHarness.remount();
  });

  it('routes a per-step result add through onUpdateStep for a multi-step recipe', async () => {
    const updates = [];
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge' }] },
      onUpdateStep: (id, patch) => updates.push([id, patch])
    }));
    clickTab(target, 'results');
    await flushRender();
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    target.querySelector('[data-recipe-section="step-sa-results"] [data-recipe-add="result-group"]').click();
    assert.equal(updates.length, 1, 'onUpdateStep invoked once');
    assert.equal(updates[0][0], 'sa', 'patches the right step');
    assert.equal(updates[0][1].resultGroups.length, 1, 'a single group is appended to the empty step scope');
    editHarness.remount();
  });
});

describe('RecipeItemInspector (mounted)', () => {
  before(async () => {
    await inspectorHarness.setup();
    // The harness installs game.i18n but not fromUuid; provide a default stub.
    globalThis.foundry = {};
    globalThis.fromUuid = async () => null;
  });

  after(() => {
    delete globalThis.fromUuid;
    delete globalThis.foundry;
    inspectorHarness.teardown();
  });

  beforeEach(() => {
    globalThis.fromUuid = async () => null;
  });

  it('renders the recipe-item card with an empty dropzone', async () => {
    const target = await inspectorHarness.mount(inspectorProps());
    assert.ok(target.querySelector('[data-recipe-section="recipe-item"]'), 'recipe-item card renders');
    assert.ok(target.querySelector('[data-recipe-item-dropzone]'), 'empty dropzone present');
    inspectorHarness.remount();
  });

  it('links an item on a valid Item drop and ignores a non-Item drop', async () => {
    const added = [];
    const set = [];
    const target = await inspectorHarness.mount(inspectorProps({
      onAddRecipeItem: (uuid) => { added.push(uuid); return { item: { id: 'ri1' }, action: 'added' }; },
      onSetRecipeItem: (id) => set.push(id)
    }));
    const dropzone = target.querySelector('[data-recipe-item-dropzone]');
    assert.ok(dropzone, 'empty dropzone present');

    // Non-Item drop is a no-op.
    dispatchDrop(dropzone, { type: 'Scene', uuid: 'Scene.s1' });
    await Promise.resolve();
    assert.equal(added.length, 0, 'non-Item drop ignored');

    // Valid Item drop links it.
    dispatchDrop(dropzone, { type: 'Item', uuid: 'Item.it1' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(added, ['Item.it1'], 'onAddRecipeItem called with the item uuid');
    assert.deepEqual(set, ['ri1'], 'onSetRecipeItem called with the new definition id');
    inspectorHarness.remount();
  });

  it('still links a deduped (skipped) drop', async () => {
    const set = [];
    const target = await inspectorHarness.mount(inspectorProps({
      onAddRecipeItem: () => ({ item: { id: 'ri-existing' }, action: 'skipped' }),
      onSetRecipeItem: (id) => set.push(id)
    }));
    dispatchDrop(target.querySelector('[data-recipe-item-dropzone]'), { type: 'Item', uuid: 'Item.dupe' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(set, ['ri-existing'], 'skipped action still sets the recipeItemId');
    inspectorHarness.remount();
  });

  it('renders the missing state when fromUuid resolves to null', async () => {
    globalThis.fromUuid = async () => null;
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, recipeItemId: 'ri1' },
      recipeItemDefinitions: [{ id: 'ri1', name: 'Old Item', img: 'icons/svg/item-bag.svg', sourceItemUuid: 'Item.gone' }]
    }));
    // Let the async resolution $effect settle before asserting.
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(
      target.querySelector('[data-recipe-item-missing]'),
      'missing state renders when the source item no longer resolves'
    );
    // The link is retained (the linked container, not the empty dropzone).
    assert.ok(target.querySelector('[data-recipe-item-linked]'), 'the link is retained in the missing state');
    inspectorHarness.remount();
  });

  it('disables the category selector and shows only General when no categories exist', async () => {
    const target = await inspectorHarness.mount(inspectorProps({ categories: [] }));
    const select = target.querySelector('[data-recipe-category-select]');
    assert.ok(select, 'category selector renders');
    assert.equal(select.disabled, true, 'selector is disabled with no custom categories');
    const options = [...select.querySelectorAll('option')];
    assert.equal(options.length, 1, 'only one option present');
    assert.equal(options[0].value, 'general', 'the sole option is the General fallback');
    inspectorHarness.remount();
  });

  it('enables the selector with custom categories and reports the current category', async () => {
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, category: 'Potions' },
      categories: ['Potions', 'Weapons']
    }));
    const select = target.querySelector('[data-recipe-category-select]');
    assert.equal(select.disabled, false, 'selector is interactive with custom categories');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    assert.deepEqual(values, ['general', 'Potions', 'Weapons'], 'General precedes the custom categories');
    assert.equal(select.value, 'Potions', 'reflects the recipe category');
    inspectorHarness.remount();
  });

  it('calls onSetCategory when a different category is chosen', async () => {
    const chosen = [];
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, category: 'general' },
      categories: ['Potions'],
      onSetCategory: (category) => chosen.push(category)
    }));
    const select = target.querySelector('[data-recipe-category-select]');
    select.value = 'Potions';
    select.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await Promise.resolve();
    assert.deepEqual(chosen, ['Potions'], 'onSetCategory receives the selected category');
    inspectorHarness.remount();
  });

  it('hides the step-mode toggle when multi-step is not enabled and the recipe is single-step', async () => {
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, steps: [] },
      multiStepEnabled: false
    }));
    assert.equal(target.querySelector('[data-recipe-section="recipe-step-mode"]'), null, 'step-mode card is hidden');
    inspectorHarness.remount();
  });

  it('shows the step-mode toggle for a single-step recipe when multi-step is enabled', async () => {
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, steps: [] },
      multiStepEnabled: true
    }));
    assert.ok(target.querySelector('[data-recipe-section="recipe-step-mode"]'), 'step-mode card renders when enabled');
    inspectorHarness.remount();
  });

  it('still shows the step-mode toggle for a multi-step recipe even when the feature is off (to allow revert)', async () => {
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
      multiStepEnabled: false
    }));
    assert.ok(target.querySelector('[data-recipe-section="recipe-step-mode"]'), 'step-mode card stays visible so multi-step can be reverted');
    inspectorHarness.remount();
  });

  it('shows single-step selected and fires onEnterMultiStep when switching to multi', async () => {
    const entered = [];
    const reverted = [];
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, steps: [] },
      multiStepEnabled: true,
      onEnterMultiStep: () => entered.push(true),
      onRevertToSingleStep: () => reverted.push(true)
    }));
    const single = target.querySelector('[data-recipe-step-mode-option="single"]');
    const multi = target.querySelector('[data-recipe-step-mode-option="multi"]');
    assert.ok(single.classList.contains('is-selected'), 'single is selected when there are no steps');
    assert.equal(multi.classList.contains('is-selected'), false, 'multi is not selected');

    single.click();
    assert.equal(entered.length, 0, 'clicking the already-active single mode is a no-op');

    multi.click();
    assert.deepEqual(entered, [true], 'clicking multi fires onEnterMultiStep');
    assert.equal(reverted.length, 0, 'revert not called when entering multi');
    inspectorHarness.remount();
  });

  it('shows multi-step selected and fires onRevertToSingleStep when switching to single', async () => {
    const entered = [];
    const reverted = [];
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
      onEnterMultiStep: () => entered.push(true),
      onRevertToSingleStep: () => reverted.push(true)
    }));
    const single = target.querySelector('[data-recipe-step-mode-option="single"]');
    const multi = target.querySelector('[data-recipe-step-mode-option="multi"]');
    assert.ok(multi.classList.contains('is-selected'), 'multi is selected when steps exist');

    multi.click();
    assert.equal(reverted.length, 0, 'clicking the already-active multi mode is a no-op');

    single.click();
    assert.deepEqual(reverted, [true], 'clicking single fires onRevertToSingleStep');
    assert.equal(entered.length, 0, 'enter not called when reverting');
    inspectorHarness.remount();
  });
});

describe('RecipeStepsCard (mounted)', () => {
  before(async () => {
    await stepsHarness.setup();
  });

  after(() => {
    stepsHarness.teardown();
  });

  it('renders a row per step with name and description, plus an add button', async () => {
    const target = await stepsHarness.mount(stepsProps());
    const rows = target.querySelectorAll('[data-recipe-step-id]');
    assert.equal(rows.length, 2, 'one row per step');
    assert.match(target.textContent, /Gather reagents/, 'first step name shown');
    assert.match(target.textContent, /Collect the base herbs\./, 'first step description shown');
    assert.ok(target.querySelector('[data-recipe-step-add]'), 'add-a-step button present');
    stepsHarness.remount();
  });

  it('shows formatted time/currency pips, and placeholder pips when a step has no requirements', async () => {
    const target = await stepsHarness.mount(stepsProps());
    const time1 = target.querySelector('[data-recipe-step-time="step-1"]');
    const currency1 = target.querySelector('[data-recipe-step-currency="step-1"]');
    assert.match(time1.textContent, /2 hours 30 minutes/, 'time formatted from non-zero units');
    assert.match(currency1.textContent, /5 Gold/, 'currency resolves the unit label');
    assert.equal(time1.classList.contains('is-empty'), false, 'a populated time pip is not muted');

    const time2 = target.querySelector('[data-recipe-step-time="step-2"]');
    const currency2 = target.querySelector('[data-recipe-step-currency="step-2"]');
    assert.match(time2.textContent, /Instantaneous/, 'no time requirement shows the Instantaneous placeholder');
    assert.match(currency2.textContent, /No cost/, 'no currency requirement shows the No cost placeholder');
    assert.ok(time2.classList.contains('is-empty'), 'placeholder time pip is muted');
    assert.ok(currency2.classList.contains('is-empty'), 'placeholder currency pip is muted');
    stepsHarness.remount();
  });

  it('expands a row on click and edits name via onchange', async () => {
    const updates = [];
    const target = await stepsHarness.mount(stepsProps({ onUpdateStep: (id, patch) => updates.push([id, patch]) }));
    assert.equal(target.querySelector('[data-recipe-step-field="name"]'), null, 'collapsed by default');
    const main = target.querySelector('[data-recipe-step-id="step-1"] .manager-recipe-steps-row-main');
    main.click();
    await flushRender();
    const nameInput = target.querySelector('[data-recipe-step-field="name"]');
    assert.ok(nameInput, 'name input visible when expanded');
    nameInput.value = 'Forage';
    nameInput.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.deepEqual(updates, [['step-1', { name: 'Forage' }]], 'onUpdateStep called with the new name');
    stepsHarness.remount();
  });

  it('fires onAddStep and onDeleteStep', async () => {
    const added = [];
    const deleted = [];
    const target = await stepsHarness.mount(stepsProps({
      onAddStep: () => added.push(true),
      onDeleteStep: (id) => deleted.push(id)
    }));
    target.querySelector('[data-recipe-step-add]').click();
    assert.deepEqual(added, [true], 'add button fires onAddStep');
    target.querySelector('[data-recipe-step-delete="step-2"]').click();
    assert.deepEqual(deleted, ['step-2'], 'delete button fires onDeleteStep with the step id');
    stepsHarness.remount();
  });

  it('reorders via dragging a step header onto another row', async () => {
    const moves = [];
    const target = await stepsHarness.mount(stepsProps({ onReorderSteps: (from, to) => moves.push([from, to]) }));
    // Only the header is draggable; the row is the drop target.
    const firstHeader = target.querySelector('[data-recipe-step-id="step-1"] .manager-recipe-steps-row-head');
    assert.equal(firstHeader.getAttribute('draggable'), 'true', 'the header is the drag source');
    assert.equal(target.querySelector('[data-recipe-step-move]'), null, 'the up/down arrows are gone');
    firstHeader.dispatchEvent(new globalThis.window.Event('dragstart', { bubbles: true }));
    target.querySelector('[data-recipe-step-id="step-2"]').dispatchEvent(new globalThis.window.Event('drop', { bubbles: true, cancelable: true }));
    assert.deepEqual(moves, [[0, 1]], 'dropping step 1 onto step 2 reorders from index 0 to 1');
    stepsHarness.remount();
  });

  it('renders only the tools section (step-prefixed) inside an expanded step', async () => {
    const target = await stepsHarness.mount(stepsProps({ toolsLibrary: TOOLS_LIBRARY }));
    assert.equal(target.querySelector('[data-recipe-section="step-step-1-tools"]'), null, 'collapsed step has no tools section');
    target.querySelector('[data-recipe-step-id="step-1"] .manager-recipe-steps-row-main').click();
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="step-step-1-tools"]'), 'tools section renders prefixed by step id');
    // Ingredients/results moved to their own tabs and are no longer inside steps.
    assert.equal(target.querySelector('[data-recipe-section="step-step-1-ingredients"]'), null, 'no ingredients section inside the step');
    assert.equal(target.querySelector('[data-recipe-section="step-step-1-results"]'), null, 'no results section inside the step');
    stepsHarness.remount();
  });

  it('routes a step tool removal through onUpdateStep', async () => {
    const updates = [];
    const steps = [{ id: 'step-1', name: 'Forge', description: '', toolIds: ['tool-hammer'] }];
    const target = await stepsHarness.mount(stepsProps({
      steps,
      toolsLibrary: TOOLS_LIBRARY,
      onUpdateStep: (id, patch) => updates.push([id, patch])
    }));
    target.querySelector('[data-recipe-step-id="step-1"] .manager-recipe-steps-row-main').click();
    await flushRender();
    target.querySelector('[data-recipe-section="step-step-1-tools"] [data-recipe-remove="tool"]').click();
    assert.equal(updates.length, 1, 'onUpdateStep invoked once');
    assert.deepEqual(updates[0][1].toolIds, [], 'the removed tool id is filtered out of the step scope');
    stepsHarness.remount();
  });
});

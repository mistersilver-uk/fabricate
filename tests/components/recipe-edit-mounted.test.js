import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

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
  'src/config/flags.js'
];

const editHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-edit-',
  rawModules: RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/RecipeStepsCard.svelte',
    'src/ui/svelte/apps/manager/RecipeEditView.svelte'
  ],
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
  compiledModules: ['src/ui/svelte/apps/manager/RecipeStepsCard.svelte'],
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

  it('renders the identity inputs and no recipe-item card', async () => {
    const target = await editHarness.mount(identityProps());
    assert.ok(target.querySelector('[data-recipe-field="name"]'), 'name input renders');
    assert.ok(target.querySelector('[data-recipe-field="description"]'), 'description textarea renders');
    assert.ok(target.querySelector('[data-recipe-field="enabled"]'), 'enabled toggle renders');
    assert.equal(target.querySelector('[data-recipe-section="recipe-item"]'), null, 'no recipe-item card in the view');
    assert.equal(target.querySelector('.manager-recipe-workspace'), null, 'no bespoke workspace');
    assert.equal(target.querySelector('[data-recipe-section="steps"]'), null, 'no steps card for a single-step recipe');
    editHarness.remount();
  });

  it('renders the steps card after the identity form only when the recipe is multi-step', async () => {
    const target = await editHarness.mount(identityProps({
      recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] }
    }));
    const stepsCard = target.querySelector('[data-recipe-section="steps"]');
    assert.ok(stepsCard, 'steps card present for a multi-step recipe');
    const form = target.querySelector('#manager-recipe-edit-form');
    assert.ok(form && !form.contains(stepsCard), 'steps card is rendered outside the identity form');
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

  it('shows single-step selected and fires onEnterMultiStep when switching to multi', async () => {
    const entered = [];
    const reverted = [];
    const target = await inspectorHarness.mount(inspectorProps({
      recipe: { ...RECIPE, steps: [] },
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
});

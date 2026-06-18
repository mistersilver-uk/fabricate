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
  compiledModules: ['src/ui/svelte/apps/manager/RecipeEditView.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/RecipeEditView.svelte'
});

const inspectorHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-inspector-',
  rawModules: RAW_MODULES,
  compiledModules: ['src/ui/svelte/apps/manager/RecipeItemInspector.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/RecipeItemInspector.svelte'
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
});

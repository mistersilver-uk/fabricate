import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-edit-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js'
  ],
  compiledModules: ['src/ui/svelte/apps/manager/RecipeEditView.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/RecipeEditView.svelte'
});

const RECIPE = Object.freeze({
  id: 'r1',
  name: 'Healing Draught',
  description: 'A restorative brew.',
  img: 'icons/consumables/potions/potion-tube-corked-red.webp',
  enabled: true,
  recipeItemId: ''
});

function baseProps(overrides = {}) {
  return {
    recipe: RECIPE,
    recipeItemDefinitions: [],
    knowledgeMode: 'itemOrLearned',
    saving: false,
    onBack: () => {},
    onSave: () => true,
    onDirtyChange: () => {},
    onDraftChange: () => {},
    onPickImagePath: null,
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
    await harness.setup();
    // The harness installs game.i18n but not fromUuid; provide a default stub.
    globalThis.foundry = {};
    globalThis.fromUuid = async () => null;
  });

  after(() => {
    delete globalThis.fromUuid;
    delete globalThis.foundry;
    harness.teardown();
  });

  beforeEach(() => {
    globalThis.fromUuid = async () => null;
  });

  it('renders the identity inputs', async () => {
    const target = await harness.mount(baseProps());
    assert.ok(target.querySelector('[data-recipe-field="name"]'), 'name input renders');
    assert.ok(target.querySelector('[data-recipe-field="description"]'), 'description textarea renders');
    assert.ok(target.querySelector('[data-recipe-field="enabled"]'), 'enabled toggle renders');
    harness.remount();
  });

  it('shows the recipe-item card for itemOrLearned and hides it for learned', async () => {
    let target = await harness.mount(baseProps({ knowledgeMode: 'itemOrLearned' }));
    assert.ok(target.querySelector('[data-recipe-section="recipe-item"]'), 'card shown for itemOrLearned');
    assert.equal(target.querySelector('.manager-recipe-workspace.is-inspector-hidden'), null, 'inspector not hidden');
    harness.remount();

    target = await harness.mount(baseProps({ knowledgeMode: 'item' }));
    assert.ok(target.querySelector('[data-recipe-section="recipe-item"]'), 'card shown for item');
    harness.remount();

    target = await harness.mount(baseProps({ knowledgeMode: 'learned' }));
    assert.equal(target.querySelector('[data-recipe-section="recipe-item"]'), null, 'card hidden for learned');
    assert.ok(target.querySelector('.manager-recipe-workspace.is-inspector-hidden'), 'central column full width');
    harness.remount();
  });

  it('marks the draft dirty and pushes a draft when the name changes', async () => {
    const dirtyCalls = [];
    const draftCalls = [];
    const target = await harness.mount(baseProps({
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
    harness.remount();
  });

  it('invokes onSave with the draft updates on submit', async () => {
    const saved = [];
    const target = await harness.mount(baseProps({ onSave: (id, updates) => { saved.push([id, updates]); return true; } }));
    const nameInput = target.querySelector('[data-recipe-field="name"]');
    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    target.querySelector('#manager-recipe-edit-form').dispatchEvent(new globalThis.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    assert.equal(saved.length, 1, 'onSave invoked once');
    assert.equal(saved[0][0], 'r1', 'passes the recipe id');
    assert.equal(saved[0][1].name, 'Renamed', 'passes the edited name');
    assert.equal(saved[0][1].recipeItemId, null, 'unlinked recipe carries a null recipeItemId');
    harness.remount();
  });

  it('links an item on a valid Item drop and ignores a non-Item drop', async () => {
    const added = [];
    const set = [];
    let target = await harness.mount(baseProps({
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
    harness.remount();
  });

  it('still links a deduped (skipped) drop', async () => {
    const set = [];
    const target = await harness.mount(baseProps({
      onAddRecipeItem: () => ({ item: { id: 'ri-existing' }, action: 'skipped' }),
      onSetRecipeItem: (id) => set.push(id)
    }));
    dispatchDrop(target.querySelector('[data-recipe-item-dropzone]'), { type: 'Item', uuid: 'Item.dupe' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(set, ['ri-existing'], 'skipped action still sets the recipeItemId');
    harness.remount();
  });

  it('renders the missing state when fromUuid resolves to null', async () => {
    globalThis.fromUuid = async () => null;
    const target = await harness.mount(baseProps({
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
    harness.remount();
  });
});

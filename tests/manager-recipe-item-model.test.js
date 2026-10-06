/**
 * The recipe-item model (issue 1721): the Books & Scrolls selection and the recipe-item editor's
 * staged draft. The definitions, the recipes and the visibility mode sit in a `SvelteMap` behind
 * their thunks, as the shell's `$derived` values do, so a change after construction reaches every
 * read.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { SvelteMap } from 'svelte/reactivity';

import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODEL_PATH = 'src/ui/svelte/apps/manager/recipe-item/recipeItemModel.svelte.js';
const TOME_UUID = 'Item.tome';
// No `resolvedName`, so the editor's preview names it only through the seeded snapshot.
const TOME = Object.freeze({
  id: 'tome',
  name: 'Tome',
  img: 't.webp',
  originItemUuid: TOME_UUID,
  enabled: true,
  recipeIds: ['r1'],
  caps: { learn: { limitLearning: true, learnsAllowed: 2 } },
});
const RECIPES = Object.freeze([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);

describe('recipe-item model', () => {
  let compiler;
  let createRecipeItemModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-recipe-item-model-');
    ({ createRecipeItemModel } = await compiler.loadWithClosure(MODEL_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One model over live definitions, with every write, route and fetch logged. */
  function openModel({ store: overrides = {}, services = {}, allowExit = true } = {}) {
    const live = new SvelteMap([
      ['definitions', [TOME]],
      ['viewState', { recipes: RECIPES }],
      ['visibilityMode', 'knowledge'],
    ]);
    const calls = [];
    const views = [];
    const expanded = [];
    const worldItemOptions = [];
    const store = {
      saveRecipeItem: async (...args) => {
        calls.push(['saveRecipeItem', ...args]);
        return true;
      },
      deleteRecipeItemDefinition: async (id) => {
        calls.push(['deleteRecipeItemDefinition', id]);
        return true;
      },
      updateRecipeItemCaps: (...args) => {
        calls.push(['updateRecipeItemCaps', ...args]);
      },
      addRecipeItemFromUuid: async (...args) => {
        calls.push(['addRecipeItemFromUuid', ...args]);
        return 'tome';
      },
      ...overrides,
    };
    const model = createRecipeItemModel({
      store: () => store,
      services: () => ({ getWorldItemOptions: () => [{ uuid: 'Item.world' }], ...services }),
      viewState: () => live.get('viewState'),
      selectedSystemId: () => 'sys',
      recipeItemDefinitions: () => live.get('definitions'),
      visibilityMode: () => live.get('visibilityMode'),
      worldItemOptions: () => worldItemOptions.at(-1) ?? [],
      navRail: () => ({
        expandGroup: (group) => {
          expanded.push(group);
        },
      }),
      setWorldItemOptions: (options) => {
        worldItemOptions.push(options);
      },
      setActiveView: (view) => {
        views.push(view);
      },
      afterTruthyResult: (result, callback) => {
        if (result !== false) callback();
        return result;
      },
      confirmRouteExit: (view) => {
        calls.push(['confirmRouteExit', view]);
        return allowExit;
      },
    });
    return { model, live, calls, views, expanded, worldItemOptions };
  }

  it('seeds the draft, baseline and snapshot on edit, resetting the tab and flags', async () => {
    const { model, views, expanded, worldItemOptions } = openModel({
      store: { saveRecipeItem: async () => false },
    });
    model.editRecipeItem('tome');
    model.recipeItemActiveTab = 'limits';
    model.patchRecipeItemDraft({ enabled: false });
    await model.saveRecipeItemDraft();
    assert.equal(model.recipeItemSaveFailed, true);

    model.editRecipeItem('tome');
    assert.equal(model.selectedRecipeItemId, 'tome');
    assert.equal(model.recipeItemActiveTab, 'overview');
    assert.equal(model.recipeItemSaveFailed, false);
    assert.equal(model.recipeItemEditSaving, false);
    assert.deepEqual(model.recipeItemDraft, TOME);
    assert.notEqual(model.recipeItemDraft, TOME, 'the draft is a copy, not the definition');
    assert.equal(model.recipeItemEditDirty, false);
    assert.equal(model.canSaveRecipeItemEdit, false);
    assert.deepEqual(model.recipeItemEditorLinkedItem, {
      uuid: TOME_UUID,
      name: 'Tome',
      img: 't.webp',
      type: '',
      description: '',
    });
    assert.deepEqual(
      model.recipeItemEditorLinkedRecipes.map((recipe) => recipe.id),
      ['r1']
    );
    assert.deepEqual(
      model.recipeItemEditorAvailableRecipes.map((recipe) => recipe.id),
      ['r2', 'r3']
    );
    assert.deepEqual(views, ['recipe-item-edit', 'recipe-item-edit']);
    assert.deepEqual(expanded, ['crafting', 'crafting']);
    await Promise.resolve();
    assert.deepEqual(worldItemOptions, [[{ uuid: 'Item.world' }], [{ uuid: 'Item.world' }]]);
  });

  it('opens nothing when the route exit is refused', () => {
    const { model, views } = openModel({ allowExit: false });
    model.editRecipeItem('tome');
    assert.equal(model.recipeItemDraft, null);
    assert.deepEqual(views, []);
  });

  it('merges a nested patch and replaces an array outright', () => {
    const { model } = openModel();
    model.editRecipeItem('tome');
    model.patchRecipeItemDraft({ caps: { learn: { learnsAllowed: 3 } }, recipeIds: ['r3'] });
    assert.deepEqual(model.recipeItemDraft.caps, {
      learn: { limitLearning: true, learnsAllowed: 3 },
    });
    assert.deepEqual(model.recipeItemDraft.recipeIds, ['r3']);
    assert.equal(model.recipeItemEditDirty, true);
    assert.equal(model.canSaveRecipeItemEdit, true);
  });

  it('links a recipe once and unlinks it by id', () => {
    const { model } = openModel();
    model.editRecipeItem('tome');
    model.linkRecipeToItem('r1');
    model.linkRecipeToItem('r2');
    assert.deepEqual(model.recipeItemDraft.recipeIds, ['r1', 'r2']);
    model.unlinkRecipeFromItem('r1');
    assert.deepEqual(model.recipeItemDraft.recipeIds, ['r2']);
  });

  for (const [label, saveRecipeItem] of [
    ['a `false` answer', async () => false],
    [
      'a throw',
      async () => {
        throw new Error('refused');
      },
    ],
  ]) {
    it(`marks the save failed and stays in the editor on ${label}`, async () => {
      const { model, views } = openModel({ store: { saveRecipeItem } });
      model.editRecipeItem('tome');
      model.patchRecipeItemDraft({ enabled: false });
      assert.equal(await model.saveRecipeItemDraft(), false);
      assert.equal(model.recipeItemSaveFailed, true);
      assert.equal(model.recipeItemEditSaving, false);
      assert.equal(model.recipeItemEditDirty, true, 'the baseline is unchanged');
      assert.deepEqual(views, ['recipe-item-edit']);
    });
  }

  it('refuses a second save while one is in flight', async () => {
    let settle;
    const { model, calls } = openModel({
      store: {
        saveRecipeItem: (...args) => {
          calls.push(['saveRecipeItem', ...args]);
          return new Promise((resolve) => {
            settle = resolve;
          });
        },
      },
    });
    model.editRecipeItem('tome');
    const first = model.saveRecipeItemDraft();
    assert.equal(model.recipeItemEditSaving, true);
    assert.equal(await model.saveRecipeItemDraft(), false);
    settle(true);
    assert.equal(await first, true);
    assert.equal(calls.filter((call) => call[0] === 'saveRecipeItem').length, 1);
  });

  it('rebaselines a successful save and routes back to Books & Scrolls', async () => {
    const { model, calls, views } = openModel();
    model.editRecipeItem('tome');
    model.patchRecipeItemDraft({ enabled: false, caps: { learn: { learnsAllowed: 4 } } });
    assert.equal(await model.saveRecipeItemDraft(), true);
    assert.deepEqual(
      calls.find((call) => call[0] === 'saveRecipeItem'),
      [
        'saveRecipeItem',
        'tome',
        {
          enabled: false,
          originItemUuid: TOME_UUID,
          recipeIds: ['r1'],
          caps: { learn: { limitLearning: true, learnsAllowed: 4 } },
        },
      ]
    );
    assert.equal(model.recipeItemEditDirty, false);
    assert.equal(model.recipeItemSaveFailed, false);
    assert.deepEqual(views, ['recipe-item-edit', 'books-scrolls']);
  });

  it('stays in the editor when the delete answers `false`, and clears it otherwise', async () => {
    const refused = openModel({ store: { deleteRecipeItemDefinition: async () => false } });
    refused.model.editRecipeItem('tome');
    await refused.model.deleteRecipeItemFromEdit();
    assert.deepEqual(refused.model.recipeItemDraft, TOME);
    assert.deepEqual(refused.views, ['recipe-item-edit']);

    const deleted = openModel();
    deleted.model.editRecipeItem('tome');
    await deleted.model.deleteRecipeItemFromEdit();
    assert.equal(deleted.model.recipeItemDraft, null);
    assert.equal(deleted.model.recipeItemEditorLinkedItem, null);
    assert.deepEqual(deleted.views, ['recipe-item-edit', 'books-scrolls']);
  });

  it('restores the baseline and its preview on discard', async () => {
    const { model } = openModel({
      services: { resolveToolSource: async (uuid) => ({ uuid, name: 'Guide', img: '' }) },
    });
    model.editRecipeItem('tome');
    assert.equal(await model.linkRecipeItemSource('Item.guide'), true);
    assert.equal(model.recipeItemEditorLinkedItem.name, 'Guide');
    model.unlinkRecipeItemSource();
    assert.equal(model.recipeItemEditorLinkedItem, null);
    model.discard();
    assert.deepEqual(model.recipeItemDraft, TOME);
    assert.equal(model.recipeItemEditorLinkedItem.name, 'Tome');
  });

  for (const [label, created, opened] of [
    ['a bare id', 'tome', 'tome'],
    ['an `.item.id`', { item: { id: 'tome' } }, 'tome'],
    ['an `.id`', { id: 'tome' }, 'tome'],
    ['no id', { ok: true }, null],
  ]) {
    it(`opens the editor for a drop that answers ${label}`, async () => {
      const { model, calls } = openModel({
        store: {
          addRecipeItemFromUuid: async (...args) => {
            calls.push(['addRecipeItemFromUuid', ...args]);
            return created;
          },
        },
      });
      await model.dropRecipeItem('Item.dropped');
      assert.deepEqual(calls[0], ['addRecipeItemFromUuid', 'sys', 'Item.dropped']);
      assert.equal(model.selectedRecipeItemId, opened ?? '');
      assert.equal(model.recipeItemDraft?.id ?? null, opened);
    });
  }

  it('writes the quick limit as the visibility mode shapes it', () => {
    const { model, live, calls } = openModel();
    model.toggleRecipeItemQuickLimit('tome', true);
    live.set('visibilityMode', 'item');
    model.toggleRecipeItemQuickLimit('tome', false);
    assert.deepEqual(calls, [
      [
        'updateRecipeItemCaps',
        'tome',
        { learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 1 } },
      ],
      ['updateRecipeItemCaps', 'tome', { item: { limitUses: false, maxUses: 1 } }],
    ]);
  });

  it('reads the inspector row off the live definitions', () => {
    const { model, live } = openModel();
    model.selectRecipeItem('scroll');
    assert.equal(model.selectedRecipeItem, null);
    live.set('definitions', [TOME, { id: 'scroll' }]);
    assert.deepEqual(model.selectedRecipeItem, { id: 'scroll' });
  });

  it('keeps a tab choice the editor was left on', () => {
    const { model } = openModel();
    model.editRecipeItem('tome');
    model.recipeItemActiveTab = 'limits';
    assert.equal(model.recipeItemActiveTab, 'limits');
  });

  it('refuses a delete with no draft or while a save is in flight', async () => {
    const none = openModel();
    await none.model.deleteRecipeItemFromEdit();
    assert.deepEqual(none.calls, []);

    let settle;
    const { model, calls } = openModel({
      store: {
        saveRecipeItem: () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      },
    });
    model.editRecipeItem('tome');
    const saving = model.saveRecipeItemDraft();
    await model.deleteRecipeItemFromEdit();
    assert.ok(calls.every((call) => call[0] !== 'deleteRecipeItemDefinition'));
    settle(true);
    await saving;
  });

  it('clears the baseline and the failed flag when a delete lands', async () => {
    const { model } = openModel({ store: { saveRecipeItem: async () => false } });
    model.editRecipeItem('tome');
    await model.saveRecipeItemDraft();
    assert.equal(model.recipeItemSaveFailed, true);
    await model.deleteRecipeItemFromEdit();
    assert.equal(model.recipeItemDraftBaseline, null);
    assert.equal(model.recipeItemSaveFailed, false);
  });

  it('clears a failed flag at the start of the next save', async () => {
    let answer = false;
    const { model } = openModel({ store: { saveRecipeItem: async () => answer } });
    model.editRecipeItem('tome');
    await model.saveRecipeItemDraft();
    assert.equal(model.recipeItemSaveFailed, true);
    answer = true;
    await model.saveRecipeItemDraft();
    assert.equal(model.recipeItemSaveFailed, false);
  });

  it('saves a bare draft with the payload defaults', async () => {
    const { model, calls, live } = openModel();
    live.set('definitions', [{ id: 'bare' }]);
    model.editRecipeItem('bare');
    await model.saveRecipeItemDraft();
    assert.deepEqual(
      calls.find((call) => call[0] === 'saveRecipeItem'),
      ['saveRecipeItem', 'bare', { enabled: true, originItemUuid: null, recipeIds: [], caps: {} }]
    );
  });

  it('resets the saving flag when an edit opens mid-save', async () => {
    let settle;
    const { model } = openModel({
      store: {
        saveRecipeItem: () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      },
    });
    model.editRecipeItem('tome');
    const saving = model.saveRecipeItemDraft();
    assert.equal(model.recipeItemEditSaving, true);
    model.editRecipeItem('tome');
    assert.equal(model.recipeItemEditSaving, false);
    settle(true);
    await saving;
  });

  it('ignores a recipe link or unlink with no draft or no id', () => {
    const { model } = openModel();
    model.linkRecipeToItem('r2');
    model.unlinkRecipeFromItem('r1');
    assert.equal(model.recipeItemDraft, null);
    model.editRecipeItem('tome');
    model.linkRecipeToItem('');
    model.unlinkRecipeFromItem('');
    assert.deepEqual(model.recipeItemDraft.recipeIds, ['r1']);
  });

  it('opens nothing for a drop with no uuid', async () => {
    const { model, calls } = openModel();
    await model.dropRecipeItem('');
    assert.deepEqual(calls, []);
    assert.equal(model.recipeItemDraft, null);
  });

  it('links nothing when the resolver finds no item, or there is no uuid', async () => {
    let asked = 0;
    const { model } = openModel({
      services: {
        resolveToolSource: async () => {
          asked += 1;
          return null;
        },
      },
    });
    model.editRecipeItem('tome');
    assert.equal(await model.linkRecipeItemSource('Item.gone'), false);
    assert.deepEqual(model.recipeItemDraft, TOME);
    assert.equal(model.recipeItemEditorLinkedItem.name, 'Tome');
    assert.equal(await model.linkRecipeItemSource(''), false);
    assert.equal(asked, 1, 'an empty uuid never reaches the resolver');
  });

  it('forgets the unlinked preview rather than reviving it on a relink by patch', async () => {
    const { model } = openModel({
      services: { resolveToolSource: async (uuid) => ({ uuid, name: 'Guide', img: '' }) },
    });
    model.editRecipeItem('tome');
    await model.linkRecipeItemSource('Item.guide');
    model.unlinkRecipeItemSource();
    model.patchRecipeItemDraft({ originItemUuid: 'Item.guide' });
    assert.equal(model.recipeItemEditorLinkedItem.name, '');
  });

  it('offers an empty option list when the world has none to give', async () => {
    const { model, worldItemOptions } = openModel({
      services: { getWorldItemOptions: () => undefined },
    });
    model.editRecipeItem('tome');
    await Promise.resolve();
    assert.deepEqual(worldItemOptions, [[]]);
  });

  it('treats only a boolean `true` as a limited quick limit', () => {
    const { model, calls } = openModel();
    model.toggleRecipeItemQuickLimit('tome', 'on');
    assert.equal(calls[0][2].learn.limitLearning, false);
  });
});

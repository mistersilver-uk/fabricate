/**
 * Disabling the multi-step feature (issue 710) is NON-destructive and behaviour-
 * changing, so `adminStore.toggleFeature('multiStepRecipes', false)` opens a
 * warning/confirm dialog when the system has multi-step recipes: only on confirm
 * does the toggle persist, the step data is never rewritten, and enabling never
 * prompts. These tests drive the store's public toggle through a mock service graph.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';

function multiStepRecipe(id) {
  return {
    id,
    name: `Layered ${id}`,
    craftingSystemId: 'sys-ms',
    enabled: true,
    // Two authored steps — a genuine multi-step recipe that collapses when the
    // feature is off. The bytes here are snapshotted to prove they survive a toggle.
    steps: [
      { id: `${id}-a`, name: 'Prep', ingredientSets: [], resultGroups: [{ id: 'g-a', results: [] }] },
      { id: `${id}-b`, name: 'Finish', ingredientSets: [], resultGroups: [{ id: 'g-b', results: [] }] },
    ],
    ingredientSets: [],
    resultGroups: [],
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId };
    },
  };
}

function buildStore({ recipes, confirmResult = true }) {
  const system = {
    id: 'sys-ms',
    name: 'Multi System',
    description: '',
    features: { multiStepRecipes: true },
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
  };
  const updateCalls = [];
  const confirmCalls = [];
  const settings = { lastManagedCraftingSystem: 'sys-ms' };

  const services = {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    getCraftingSystemManager: () => ({
      getSystems: () => [system],
      getSystem: (id) => (id === system.id ? system : null),
      getItems: () => [],
      updateSystem: async (id, updates) => {
        updateCalls.push({ id, updates });
        return system;
      },
    }),
    getRecipeManager: () => ({
      getRecipes: (filter) =>
        filter?.craftingSystemId === system.id || !filter?.craftingSystemId ? recipes : [],
      getRecipe: (id) => recipes.find((r) => r.id === id) || null,
    }),
    getScriptMacros: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async (options) => {
      confirmCalls.push(options);
      return confirmResult;
    },
    localize: (key) => key,
    copyToClipboard: async () => {},
    openRecipeEditor: () => {},
    renderImportDialog: async () => {},
  };

  return { store: createAdminStore(services), updateCalls, confirmCalls, recipes };
}

describe('adminStore — disable multi-step confirm (issue 710)', () => {
  it('opens the confirm and does NOT persist when the GM declines', async () => {
    const { store, updateCalls, confirmCalls, recipes } = buildStore({
      recipes: [multiStepRecipe('r1')],
      confirmResult: false,
    });
    await store.selectSystem('sys-ms');
    const before = JSON.stringify(recipes[0].steps);

    const result = await store.toggleFeature('multiStepRecipes', false);

    assert.equal(result, false, 'the toggle is refused');
    assert.equal(confirmCalls.length, 1, 'the warning dialog was shown');
    assert.equal(updateCalls.length, 0, 'the feature flag is NOT written when declined');
    assert.equal(JSON.stringify(recipes[0].steps), before, 'step data is untouched');
  });

  it('persists the disable when the GM confirms, leaving step data byte-for-byte intact', async () => {
    const { store, updateCalls, confirmCalls, recipes } = buildStore({
      recipes: [multiStepRecipe('r1')],
      confirmResult: true,
    });
    await store.selectSystem('sys-ms');
    const before = JSON.stringify(recipes[0].steps);

    const result = await store.toggleFeature('multiStepRecipes', false);

    assert.equal(result, true, 'the toggle proceeds');
    assert.equal(confirmCalls.length, 1, 'the warning dialog was shown once');
    assert.equal(updateCalls.length, 1, 'the feature flag is written after confirm');
    assert.deepEqual(updateCalls[0].updates, { features: { multiStepRecipes: false } });
    assert.equal(
      JSON.stringify(recipes[0].steps),
      before,
      'the multi-step recipe steps are preserved verbatim through the toggle'
    );
  });

  it('does NOT prompt when there are no multi-step recipes to collapse', async () => {
    const singleStep = { ...multiStepRecipe('r1'), steps: [] };
    const { store, updateCalls, confirmCalls } = buildStore({
      recipes: [singleStep],
      confirmResult: true,
    });
    await store.selectSystem('sys-ms');

    await store.toggleFeature('multiStepRecipes', false);

    assert.equal(confirmCalls.length, 0, 'no dialog for a system with no multi-step recipes');
    assert.equal(updateCalls.length, 1, 'the flag is written directly');
  });

  it('never prompts when ENABLING the feature', async () => {
    const { store, updateCalls, confirmCalls } = buildStore({
      recipes: [multiStepRecipe('r1')],
      confirmResult: true,
    });
    await store.selectSystem('sys-ms');

    await store.toggleFeature('multiStepRecipes', true);

    assert.equal(confirmCalls.length, 0, 'enabling the feature is never gated by a dialog');
    assert.equal(updateCalls.length, 1, 'the flag is written directly');
    assert.deepEqual(updateCalls[0].updates, { features: { multiStepRecipes: true } });
  });
});

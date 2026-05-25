import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal foundry globals for module loading
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {
        async _prepareContext() { return {}; }
      }
    },
    ux: { TextEditor: { implementation: null } }
  }
};

globalThis.game = { settings: { get: () => undefined } };

const {
  getCraftingAppClass,
  getGatheringAppClass,
  getCraftingSystemManagerAppClass,
  getRecipeEditorAppClass,
  registerSvelteCraftingApp,
  registerSvelteGatheringApp,
  registerCraftingSystemManagerApp,
  registerSvelteRecipeEditorApp
} = await import('../src/ui/appFactory.js');

// --- getCraftingAppClass ---

test('getCraftingAppClass throws when no Svelte class registered', () => {
  registerSvelteCraftingApp(null);
  assert.throws(() => getCraftingAppClass(), /SvelteCraftingApp not registered/);
});

test('getCraftingAppClass returns registered Svelte class', () => {
  class MockSvelteCraftingApp {}
  registerSvelteCraftingApp(MockSvelteCraftingApp);
  assert.equal(getCraftingAppClass(), MockSvelteCraftingApp);
  registerSvelteCraftingApp(null);
});

// --- getGatheringAppClass ---

test('getGatheringAppClass throws when no Svelte class registered', () => {
  registerSvelteGatheringApp(null);
  assert.throws(() => getGatheringAppClass(), /SvelteGatheringApp not registered/);
});

test('getGatheringAppClass returns registered Svelte class', () => {
  class MockSvelteGatheringApp {}
  registerSvelteGatheringApp(MockSvelteGatheringApp);
  assert.equal(getGatheringAppClass(), MockSvelteGatheringApp);
  registerSvelteGatheringApp(null);
});

// --- getCraftingSystemManagerAppClass ---

test('getCraftingSystemManagerAppClass throws when no v2 manager class registered', () => {
  registerCraftingSystemManagerApp(null);
  assert.throws(() => getCraftingSystemManagerAppClass(), /CraftingSystemManagerApp not registered/);
});

test('getCraftingSystemManagerAppClass returns registered v2 manager class', () => {
  class MockCraftingSystemManagerApp {}
  registerCraftingSystemManagerApp(MockCraftingSystemManagerApp);
  assert.equal(getCraftingSystemManagerAppClass(), MockCraftingSystemManagerApp);
  registerCraftingSystemManagerApp(null);
});

// --- getRecipeEditorAppClass ---

test('getRecipeEditorAppClass throws when no Svelte class registered', () => {
  registerSvelteRecipeEditorApp(null);
  assert.throws(() => getRecipeEditorAppClass(), /SvelteRecipeEditorApp not registered/);
});

test('getRecipeEditorAppClass returns registered Svelte class', () => {
  class MockSvelteRecipeEditorApp {}
  registerSvelteRecipeEditorApp(MockSvelteRecipeEditorApp);
  assert.equal(getRecipeEditorAppClass(), MockSvelteRecipeEditorApp);
  registerSvelteRecipeEditorApp(null);
});

// --- Multiple registrations ---

test('registering a new class replaces the previous one', () => {
  class First {}
  class Second {}
  registerSvelteCraftingApp(First);
  assert.equal(getCraftingAppClass(), First);
  registerSvelteCraftingApp(Second);
  assert.equal(getCraftingAppClass(), Second);
  registerSvelteCraftingApp(null);
});

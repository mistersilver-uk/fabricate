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
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  registerFabricateApp,
  registerCraftingSystemManagerApp
} = await import('../src/ui/appFactory.js');

// --- getFabricateAppClass ---

test('getFabricateAppClass throws when no Svelte class registered', () => {
  registerFabricateApp(null);
  assert.throws(() => getFabricateAppClass(), /SvelteFabricateApp not registered/);
});

test('getFabricateAppClass returns registered Svelte class', () => {
  class MockSvelteFabricateApp {}
  registerFabricateApp(MockSvelteFabricateApp);
  assert.equal(getFabricateAppClass(), MockSvelteFabricateApp);
  registerFabricateApp(null);
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

// --- Multiple registrations ---

test('registering a new class replaces the previous one', () => {
  class First {}
  class Second {}
  registerFabricateApp(First);
  assert.equal(getFabricateAppClass(), First);
  registerFabricateApp(Second);
  assert.equal(getFabricateAppClass(), Second);
  registerFabricateApp(null);
});

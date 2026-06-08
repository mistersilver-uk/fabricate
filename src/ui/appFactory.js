// Registry for Svelte app classes — populated via register*() calls
// from side-effect imports in main.js. This avoids a static import
// chain that requires the Svelte compiler in Node test environments.
let _fabricateApp = null;
let _craftingSystemManagerApp = null;
let _interactableBrowserApp = null;

export function registerFabricateApp(cls) {
  _fabricateApp = cls;
}

export function registerCraftingSystemManagerApp(cls) {
  _craftingSystemManagerApp = cls;
}

export function registerInteractableBrowserApp(cls) {
  _interactableBrowserApp = cls;
}

export function getFabricateAppClass() {
  if (!_fabricateApp) {
    throw new Error('Fabricate | SvelteFabricateApp not registered. Ensure SvelteFabricateApp.svelte.js is imported.');
  }
  return _fabricateApp;
}

export function getCraftingSystemManagerAppClass() {
  if (!_craftingSystemManagerApp) {
    throw new Error('Fabricate | CraftingSystemManagerApp not registered. Ensure SvelteCraftingSystemManagerApp.svelte.js is imported.');
  }
  return _craftingSystemManagerApp;
}

export function getInteractableBrowserAppClass() {
  if (!_interactableBrowserApp) {
    throw new Error('Fabricate | InteractableBrowserApp not registered. Ensure InteractableBrowserApp.svelte.js is imported.');
  }
  return _interactableBrowserApp;
}

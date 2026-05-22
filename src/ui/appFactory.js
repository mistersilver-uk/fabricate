// Registry for Svelte app classes — populated via register*() calls
// from side-effect imports in main.js. This avoids a static import
// chain that requires the Svelte compiler in Node test environments.
let _svelteCraftingApp = null;
let _svelteGatheringApp = null;
let _craftingSystemManagerApp = null;
let _svelteRecipeEditorApp = null;

export function registerSvelteCraftingApp(cls) {
  _svelteCraftingApp = cls;
}

export function registerSvelteGatheringApp(cls) {
  _svelteGatheringApp = cls;
}

export function registerCraftingSystemManagerApp(cls) {
  _craftingSystemManagerApp = cls;
}

export function registerSvelteRecipeEditorApp(cls) {
  _svelteRecipeEditorApp = cls;
}

export function getCraftingAppClass() {
  if (!_svelteCraftingApp) {
    throw new Error('Fabricate | SvelteCraftingApp not registered. Ensure SvelteCraftingApp.svelte.js is imported.');
  }
  return _svelteCraftingApp;
}

export function getGatheringAppClass() {
  if (!_svelteGatheringApp) {
    throw new Error('Fabricate | SvelteGatheringApp not registered. Ensure SvelteGatheringApp.svelte.js is imported.');
  }
  return _svelteGatheringApp;
}

export function getCraftingSystemManagerAppClass() {
  if (!_craftingSystemManagerApp) {
    throw new Error('Fabricate | CraftingSystemManagerApp not registered. Ensure SvelteCraftingSystemManagerApp.svelte.js is imported.');
  }
  return _craftingSystemManagerApp;
}

export function getRecipeEditorAppClass() {
  if (!_svelteRecipeEditorApp) {
    throw new Error('Fabricate | SvelteRecipeEditorApp not registered. Ensure SvelteRecipeEditorApp.svelte.js is imported.');
  }
  return _svelteRecipeEditorApp;
}

// Registry for Svelte app classes — populated via register*() calls
// from side-effect imports in main.js. This avoids a static import
// chain that requires the Svelte compiler in Node test environments.
let _svelteCraftingApp = null;
let _svelteGatheringApp = null;
let _craftingSystemManagerV2App = null;
let _svelteRecipeEditorApp = null;

export function registerSvelteCraftingApp(cls) {
  _svelteCraftingApp = cls;
}

export function registerSvelteGatheringApp(cls) {
  _svelteGatheringApp = cls;
}

export function registerCraftingSystemManagerV2App(cls) {
  _craftingSystemManagerV2App = cls;
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

export function getCraftingSystemManagerV2AppClass() {
  if (!_craftingSystemManagerV2App) {
    throw new Error('Fabricate | CraftingSystemManagerV2App not registered. Ensure SvelteCraftingSystemManagerV2App.svelte.js is imported.');
  }
  return _craftingSystemManagerV2App;
}

export function getRecipeEditorAppClass() {
  if (!_svelteRecipeEditorApp) {
    throw new Error('Fabricate | SvelteRecipeEditorApp not registered. Ensure SvelteRecipeEditorApp.svelte.js is imported.');
  }
  return _svelteRecipeEditorApp;
}

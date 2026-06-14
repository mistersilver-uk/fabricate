// Registry for Svelte app classes — populated via register*() calls
// from side-effect imports in main.js. This avoids a static import
// chain that requires the Svelte compiler in Node test environments.
let _fabricateApp = null;
let _craftingSystemManagerApp = null;
let _interactableBrowserApp = null;
let _interactionPromptApp = null;
let _interactableConfigApp = null;
let _interactablesManagerApp = null;

export function registerFabricateApp(cls) {
  _fabricateApp = cls;
}

export function registerCraftingSystemManagerApp(cls) {
  _craftingSystemManagerApp = cls;
}

export function registerInteractableBrowserApp(cls) {
  _interactableBrowserApp = cls;
}

export function registerInteractionPromptApp(cls) {
  _interactionPromptApp = cls;
}

export function registerInteractableConfigApp(cls) {
  _interactableConfigApp = cls;
}

export function registerInteractablesManagerApp(cls) {
  _interactablesManagerApp = cls;
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

export function getInteractionPromptAppClass() {
  if (!_interactionPromptApp) {
    throw new Error('Fabricate | InteractionPromptApp not registered. Ensure InteractionPromptApp.svelte.js is imported.');
  }
  return _interactionPromptApp;
}

export function getInteractableConfigAppClass() {
  if (!_interactableConfigApp) {
    throw new Error('Fabricate | InteractableConfigApp not registered. Ensure InteractableConfigApp.svelte.js is imported.');
  }
  return _interactableConfigApp;
}

export function getInteractablesManagerAppClass() {
  if (!_interactablesManagerApp) {
    throw new Error('Fabricate | InteractablesManagerApp not registered. Ensure InteractablesManagerApp.svelte.js is imported.');
  }
  return _interactablesManagerApp;
}

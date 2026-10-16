/** The player Alchemy tab's mounted tree and a store standing in for its own (issues 1514, 1778). */
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from './foundryBridgeModules.js';
import { PLAYER_APP_COMPILED_MODULES } from './svelte-component-harness.js';

/** `createMountedComponentHarness` options for `AlchemyView`, less `repoRoot` and `tmpPrefix`. */
export const ALCHEMY_VIEW_HARNESS = Object.freeze({
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/rollPromptOrigin.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  compiledModules: [
    // The shared not-yet-ready chrome, the standing statement the workbench composes.
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
    'src/ui/svelte/apps/alchemy/AlchemyDisciplineChooser.svelte',
    'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte',
    'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte',
    'src/ui/svelte/apps/alchemy/Workbench.svelte',
    'src/ui/svelte/apps/alchemy/AlchemyView.svelte',
  ],
  // THE PRODUCTION HOST IS THE PLAYER WINDOW, not the manager.
  rootClass: 'fabricate-app',
  componentPath: 'src/ui/svelte/apps/alchemy/AlchemyView.svelte',
});

/** A POJO standing in for the alchemy store, at the branch the caller names. */
export function fakeAlchemyStore(overrides = {}) {
  return {
    loading: false,
    loadedOnce: true,
    error: null,
    denied: false,
    needsChooser: false,
    listing: { selectedActorId: 'actor-1', activeSystemName: 'Alchemy' },
    systems: [],
    knownRecipes: [],
    knownCount: 0,
    undiscoveredCount: 0,
    search: '',
    selectedRecipeId: null,
    canSwitch: false,
    mode: 'empty',
    target: null,
    benchChips: [],
    benchEmpty: true,
    benchEssences: [],
    missing: [],
    brewEnabled: false,
    brewInFlight: false,
    lastBrew: null,
    components: [],
    componentSearch: '',
    hasOwnedComponents: false,
    load() {},
    chooseSystem() {},
    setSearch() {},
    selectRecipe() {},
    switchDiscipline() {},
    clear() {},
    add() {},
    removeOne() {},
    removeAll() {},
    brew() {},
    setComponentSearch() {},
    ...overrides,
  };
}

/** The view's `services` prop around `store`. */
export function alchemyServices(store) {
  return { alchemy: store, craftingSources: null, actorBar: null };
}

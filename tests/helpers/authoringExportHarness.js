/**
 * Shared harness for the import/export authoring round-trip tests: ONE in-memory
 * settings map + the REAL GatheringEnvironmentStore, so an export reads exactly
 * what an import persisted. Extracted from `authoring-export-roundtrip.test.js`
 * so multiple test files share a single harness and the resolution logic cannot
 * drift (Sonar new-code duplication mitigation).
 *
 * This file is a HELPER, never a `*.test.js`.
 */

import { buildExportPayload } from '../../src/systems/CraftingSystemExporter.js';
import { GatheringEnvironmentStore } from '../../src/systems/GatheringEnvironmentStore.js';

export const VERSION = '9.9.9';

// Deterministic, collision-free id generator for the store/importer shims. NOT
// Math.random: SonarCloud promotes Math.random() (S2245) to a vulnerability that
// fails the PR gate. A monotonic counter is deterministic and unique, which is
// all the copy-mode id-rebind path needs.
let idCounter = 0;
function deterministicId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// Foundry globals used by the importer's component-resolution + env store. Guarded
// so importing this helper never clobbers a global another module already set.
globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => deterministicId('id') },
};
globalThis.game = globalThis.game || {};
globalThis.game.user = globalThis.game.user || { isGM: true };
globalThis.game.packs = globalThis.game.packs || [];
globalThis.fromUuid = globalThis.fromUuid || (async () => null); // all external refs absent

/**
 * Stand up the shared single-store harness for a fixture.
 *
 * @param {{ system: object, recipes: object[], environments: object[], gatheringConfig: object }} fixture
 * @returns {{ settings: Map, getSetting: Function, setSetting: Function, systemManager: object, recipeManager: object, environmentStore: GatheringEnvironmentStore }}
 */
export function makeHarness(fixture) {
  const settings = new Map();
  settings.set('gatheringConfig', structuredClone(fixture.gatheringConfig));
  const getSetting = (key) => settings.get(key);
  const setSetting = async (key, value) => {
    settings.set(key, structuredClone(value));
  };

  const systems = new Map([[fixture.system.id, structuredClone(fixture.system)]]);
  const systemManager = {
    getSystems: () => [...systems.values()],
    getSystem: (id) => systems.get(id) || null,
    getItems: (id) => systems.get(id)?.components || [],
    createSystem: async (data) => {
      const sys = structuredClone({ ...data, id: data.id || `sys-${systems.size + 1}` });
      systems.set(sys.id, sys);
      return structuredClone(sys);
    },
    updateSystem: async (id, data) => {
      const sys = structuredClone({ ...data, id });
      systems.set(id, sys);
      return structuredClone(sys);
    },
  };

  const recipesById = new Map(fixture.recipes.map((r) => [r.id, structuredClone(r)]));
  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) =>
      [...recipesById.values()]
        .filter((r) => !craftingSystemId || r.craftingSystemId === craftingSystemId)
        .map((r) => ({ ...structuredClone(r), toJSON: () => structuredClone(r) })),
    getRecipe: (id) => recipesById.get(id) || null,
    createRecipe: async (data) => {
      recipesById.set(data.id, structuredClone(data));
      return data;
    },
    updateRecipe: async (id, data) => {
      recipesById.set(id, structuredClone(data));
      return data;
    },
    notifyRecipesChanged: () => {},
  };

  const environmentStore = new GatheringEnvironmentStore({
    getSetting,
    setSetting,
    systemManager,
    getSystems: () => [...systems.values()],
    randomID: () => deterministicId('env'),
  });
  // Seed environments (normalize on load; no validation on the seed path).
  settings.set('gatheringEnvironments', structuredClone(fixture.environments));
  environmentStore.load();

  return { settings, getSetting, setSetting, systemManager, recipeManager, environmentStore };
}

/**
 * Faithful reproduction of `src/main.js`'s `game.fabricate.exportSystem` argument
 * resolution: resolve the environment store's FULL global list and the raw
 * `gatheringConfig` setting, then hand all five args to `buildExportPayload`. The
 * `?? []` / `|| {}` defaults mirror the public-API path exactly. Pinned to the
 * real `src/main.js` closure by a source-contract guard in
 * `tests/export-system-gathering-bundle.test.js`.
 *
 * @param {ReturnType<typeof makeHarness>} h
 * @param {string} systemId
 * @returns {object} export envelope
 */
export function exportViaPublicApiResolution(h, systemId) {
  const system = h.systemManager.getSystem(systemId);
  const recipes = h.recipeManager.getRecipes({ craftingSystemId: systemId }).map((r) => r.toJSON());
  const gatheringEnvironments = h.environmentStore?.list?.() ?? [];
  const gatheringConfig = h.getSetting('gatheringConfig') || {};
  return buildExportPayload(system, recipes, VERSION, gatheringEnvironments, gatheringConfig);
}

/**
 * Faithful reproduction of `src/ui/svelte/stores/adminStore.js`'s `exportSystem`
 * argument resolution. Uses the `typeof …list === 'function'` guard idiom the UI
 * path uses; given the same store + settings it must produce an envelope
 * equivalent to {@link exportViaPublicApiResolution}. The two idioms converging is
 * precisely the regression the fix restores.
 *
 * @param {ReturnType<typeof makeHarness>} h
 * @param {string} systemId
 * @returns {object} export envelope
 */
export function exportViaAdminStoreResolution(h, systemId) {
  const system = h.systemManager.getSystem(systemId);
  const recipes = h.recipeManager.getRecipes({ craftingSystemId: systemId }).map((r) => r.toJSON());
  const environmentStore = h.environmentStore;
  const gatheringEnvironments =
    typeof environmentStore?.list === 'function' ? environmentStore.list() : [];
  const gatheringConfig = h.getSetting?.('gatheringConfig') || {};
  return buildExportPayload(system, recipes, VERSION, gatheringEnvironments, gatheringConfig);
}

/**
 * Generic current-state export (the public-API resolution), retained for the
 * round-trip test that predates the split.
 *
 * @param {ReturnType<typeof makeHarness>} h
 * @param {string} systemId
 * @returns {object} export envelope
 */
export function exportCurrent(h, systemId) {
  return exportViaPublicApiResolution(h, systemId);
}

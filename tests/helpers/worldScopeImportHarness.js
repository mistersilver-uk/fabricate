/**
 * A DESTINATION WORLD for the world-scope entity import/export suite (issue 1364, epic 1357).
 *
 * It stands up the whole composition a real import runs through: one settings map, the three REAL
 * world-scope entity stores reading and WRITING through it, a real `CraftingSystemManager` over
 * the same map, and a `CompendiumImporter` with those three stores injected as seams.
 *
 * ## THE SETTING SEAM MUST READ BACK, and that is not a convenience
 *
 * The migration suite's `makeScopeStore` closes over a FIXED value (`getSetting: () => value`,
 * `setSetting: async () => {}`), which is right for a pure differential and wrong here: the import
 * writes the same setting TWICE — the rosters and defaults before the system is created, the
 * membership records after — so a record-only seam would leave the second write reading pre-import
 * state and silently dropping whatever the first one added.
 *
 * ## SEEDED VERSUS UNMIGRATED IS THE DISTINCTION THE WHOLE MERGE TURNS ON
 *
 * A key left ABSENT from the seed reads back as `undefined`, which is what an unmigrated world
 * looks like: `isSeeded('entities')` answers false and the merge writes nothing at all. A key
 * seeded with `{ entities: [], defaults: {}, membership: {} }` is a MIGRATED world that happens to
 * hold nothing, and the merge writes into it. Passing `{}` would be neither — it carries no
 * sub-key, so `carriedSubKeys` reports every one of them unseeded.
 *
 * This file is a HELPER, never a `*.test.js`.
 */

import { installFoundryEnv } from './foundryEnv.js';

/** The three scope settings, and the entity type each belongs to. */
export const SCOPE_SETTING_KEYS = Object.freeze({
  components: 'componentScope',
  essences: 'essenceScope',
  tools: 'toolScope',
});

/** A seeded-but-empty scope value: a MIGRATED world that holds nothing yet. */
export function emptySeededScope() {
  return { entities: [], defaults: {}, membership: {} };
}

/**
 * Stand up a destination world.
 *
 * @param {object} [options]
 * @param {object} [options.componentScope] Seed for `fabricate.componentScope`; OMIT for an
 *   unmigrated world.
 * @param {object} [options.essenceScope]
 * @param {object} [options.toolScope]
 * @param {object[]} [options.systems] Crafting systems the destination already holds.
 * @returns {Promise<object>} the world.
 */
export async function destinationWorld(options = {}) {
  const env = installFoundryEnv();
  for (const [entityType, key] of Object.entries(SCOPE_SETTING_KEYS)) {
    if (options[key] !== undefined) env.settings.set(key, structuredClone(options[key]));
    else if (options[entityType] !== undefined) {
      env.settings.set(key, structuredClone(options[entityType]));
    }
  }
  if (Array.isArray(options.systems)) {
    env.settings.set('craftingSystems', structuredClone(options.systems));
  }

  const { getSetting, setSetting } = await import('../../src/config/settings.js');
  const {
    createComponentScopeStore,
    createEssenceScopeStore,
    createToolScopeStore,
  } = await import('../../src/systems/worldScopeStores.js');
  const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
  const { CompendiumImporter } = await import('../../src/systems/CompendiumImporter.js');

  const seams = { getSetting, setSetting };
  const stores = {
    components: createComponentScopeStore(seams),
    essences: createEssenceScopeStore(seams),
    tools: createToolScopeStore(seams),
  };
  for (const store of Object.values(stores)) store.load();

  const recipeManager = {
    getRecipes: () => [],
    getRecipe: () => null,
    createRecipe: async (data) => data,
    updateRecipe: async (_id, data) => data,
    notifyRecipesChanged: () => {},
    save: async () => {},
  };
  const systemManager = new CraftingSystemManager(recipeManager, {
    componentScopeStore: stores.components,
    essenceScopeStore: stores.essences,
    toolScopeStore: stores.tools,
  });
  // `reload()` is the manager's own read of the persisted corpus, through its real repository and
  // its real `_normalizeSystem`. A seeded destination system therefore arrives NORMALIZED, which
  // is what `_findExistingSystem`'s id-then-name resolution runs against.
  systemManager.reload();
  systemManager.initialized = true;

  const importer = new CompendiumImporter(systemManager, recipeManager, {
    getSetting,
    setSetting,
    isGM: () => true,
    reportProgress: () => {},
    componentScopeStore: stores.components,
    essenceScopeStore: stores.essences,
    toolScopeStore: stores.tools,
  });

  return {
    settings: env.settings,
    getSetting,
    setSetting,
    stores,
    systemManager,
    recipeManager,
    importer,
    /** The PERSISTED scope value, read back from the settings map rather than from the cache. */
    persisted: (entityType) => env.settings.get(SCOPE_SETTING_KEYS[entityType]),
    /** The destination world-entity index, exactly as the two live call sites build it. */
    worldEntityIndex: () => ({
      components: stores.components.listEntities(),
      essences: stores.essences.listEntities(),
      tools: stores.tools.listEntities(),
    }),
  };
}

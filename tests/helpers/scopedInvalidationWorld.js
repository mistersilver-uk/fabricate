/** A settings-backed two-manager world, wired exactly as a REMOTE client's is (issue 1078). */
import { SETTING_KEYS } from '../../src/config/settings.js';

import { installFoundryEnv } from './foundryEnv.js';

installFoundryEnv();

export const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');
export const { RecipeManager } = await import('../../src/systems/RecipeManager.js');
export const { Recipe } = await import('../../src/models/Recipe.js');
export const { REVISION_SCOPES } = await import('../../src/systems/revisionTokens.js');

export const SYS_A = 'sys-a';
export const SYS_B = 'sys-b';

/** One crafting system in its PERSISTED shape, with a named component library. */
export function persistedSystem(id, componentNames) {
  return {
    id,
    name: `System ${id}`,
    resolutionMode: 'alchemy',
    items: componentNames.map((name, index) => ({
      id: `${id}-c${index}`,
      name,
      registeredItemUuid: `Item.${id}-c${index}`,
    })),
  };
}

/** One recipe in its persisted shape, requiring the named component. */
export function persistedRecipe(id, systemId, componentId, overrides = {}) {
  return Recipe.fromJSON({
    id,
    name: `Recipe ${id}`,
    craftingSystemId: systemId,
    enabled: true,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ componentId, quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  }).toJSON();
}

/**
 * A wired manager pair over one settings-backed world, loaded from the persisted corpus exactly as
 * a REMOTE client loads: through `reload()`, from the replicated setting.
 *
 * @param {object[]} [world.systems] persisted systems.
 * @param {object[]} [world.recipes] persisted recipes.
 */
export function remoteClient({ systems = [], recipes = [] } = {}) {
  const env = installFoundryEnv();
  // A holder rather than two locals: the pair is mutually referential in production too —
  // the recipe manager resolves its system-manager collaborator lazily through a thunk.
  const pair = {};
  pair.recipeManager = new RecipeManager({ getCraftingSystemManager: () => pair.systemManager });
  pair.systemManager = new CraftingSystemManager(pair.recipeManager);

  /** Replicate a new corpus into the world settings, as another client's save would. */
  const write = (nextSystems, nextRecipes) => {
    if (nextSystems) env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, nextSystems);
    if (nextRecipes) env.settings.set(SETTING_KEYS.RECIPES, nextRecipes);
  };

  write(systems, recipes);
  pair.systemManager.reload();
  pair.recipeManager.reload();
  return { env, ...pair, write };
}

/** The default two-system, two-recipe world every guard test reads. */
export function twoSystemWorld() {
  return remoteClient({
    systems: [persistedSystem(SYS_A, ['Iron Ore', 'Copper Ore']), persistedSystem(SYS_B, ['Tin Ore'])],
    recipes: [
      persistedRecipe('r-a1', SYS_A, `${SYS_A}-c0`),
      persistedRecipe('r-a2', SYS_A, `${SYS_A}-c1`),
      persistedRecipe('r-b1', SYS_B, `${SYS_B}-c0`),
    ],
  });
}

/** The persisted corpus currently in the world settings. */
export const storedSystems = (env) => env.settings.get(SETTING_KEYS.CRAFTING_SYSTEMS);
export const storedRecipes = (env) => env.settings.get(SETTING_KEYS.RECIPES);

/** The persisted corpus with ONE record rewritten, exactly as another client's save leaves it. */
export const withSystem = (env, systemId, rewrite) =>
  storedSystems(env).map((system) => (system.id === systemId ? rewrite(system) : system));
export const withRecipe = (env, recipeId, rewrite) =>
  storedRecipes(env).map((recipe) => (recipe.id === recipeId ? rewrite(recipe) : recipe));

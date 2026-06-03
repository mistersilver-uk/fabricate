/**
 * Decide whether the Fabricate shell should surface the Alchemy tab.
 *
 * The tab appears only when there is at least one *enabled* crafting system in
 * alchemy resolution mode that owns at least one recipe. Pure and
 * dependency-injected so it can be unit tested without Foundry globals.
 *
 * @param {{ getCraftingSystemManager?: () => any, getRecipeManager?: () => any }} services
 *   Thin accessors for the crafting system and recipe managers.
 * @returns {boolean}
 */
export function isAlchemyTabAvailable(services) {
  const systemManager = services?.getCraftingSystemManager?.();
  const recipeManager = services?.getRecipeManager?.();
  if (typeof systemManager?.getSystems !== 'function' || typeof recipeManager?.getRecipes !== 'function') {
    return false;
  }
  const systems = Array.from(systemManager.getSystems() ?? []);
  return systems.some(system =>
    system?.resolutionMode === 'alchemy' &&
    system?.enabled !== false &&
    (recipeManager.getRecipes({ craftingSystemId: system.id })?.length ?? 0) > 0
  );
}

// The shell surfaces the Alchemy tab only when at least one ENABLED crafting system in alchemy
// resolution mode owns at least one recipe. Dependency-injected, so it is unit-testable with no
// Foundry globals.
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

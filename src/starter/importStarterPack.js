/**
 * Imports a Fabricate starter content pack from the module's bundled JSON files.
 * @param {string} [packId='alchemists-supplies'] - The starter pack identifier
 * @returns {Promise<{system: object, recipes: object[], macroTemplates: object}>}
 */
export async function importStarterPack(packId = 'alchemists-supplies') {
  const modulePath = `modules/fabricate/packs/starter-${packId}.json`;
  const response = await fetch(modulePath);
  if (!response.ok) {
    throw new Error(`Failed to load starter pack: ${modulePath} (${response.status})`);
  }
  const data = await response.json();

  if (!data.system || !Array.isArray(data.recipes)) {
    throw new Error('Invalid starter pack format: missing system or recipes');
  }

  // Create the crafting system
  const systemManager = game.fabricate.getCraftingSystemManager();
  const system = await systemManager.createSystem(data.system);

  // Create recipes, replacing placeholder system ID
  const recipeManager = game.fabricate.getRecipeManager();
  const recipes = [];
  for (const recipeData of data.recipes) {
    const resolved = { ...recipeData, craftingSystemId: system.id };
    const recipe = await recipeManager.createRecipe(resolved, { notify: false });
    recipes.push(recipe);
  }

  ui?.notifications?.info?.(
    `Imported starter pack "${system.name}" with ${recipes.length} recipes.`
  );

  return {
    system,
    recipes,
    macroTemplates: data.macroTemplates || {}
  };
}

// Fabricate Macro: List All Recipes
// Shows all available recipes in the console

const recipes = fabricate.listRecipes();

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║           Fabricate - ALL RECIPES                 ║');
console.log('╚═══════════════════════════════════════════════════════╝');

if (recipes.length === 0) {
  console.log('No recipes found. Create some recipes first!');
  ui.notifications.warn('No recipes found');
} else {
  recipes.forEach((recipe, index) => {
    console.log(`\n${index + 1}. ${recipe.name}`);
    console.log(`   ID: ${recipe.id}`);
    console.log(`   Description: ${recipe.description || 'None'}`);
    console.log(`   Ingredients: ${recipe.ingredients.length}`);
    console.log(`   Tools: ${recipe.toolIds?.length ?? 0}`);
    console.log(`   Result: ${recipe.getResultDescription()}`);
    console.log(`   Type: ${recipe.isSimpleRecipe() ? 'Simple' : 'Advanced'}`);
    console.log(`   Category: ${recipe.category}`);
    console.log(`   Enabled: ${recipe.enabled ? 'Yes' : 'No'}`);
  });

  ui.notifications.info(`Found ${recipes.length} recipes (check console F12)`);
}


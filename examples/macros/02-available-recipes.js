// Fabricate v2 Macro: Check Available Recipes
// Shows recipes you can craft with current inventory

const actor = game.user.character;

if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  const available = fabricate.getAvailableRecipes(actor);
  const allRecipes = fabricate.listRecipes({ enabled: true });

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║       FABRICATE v2 - AVAILABLE RECIPES                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\nCharacter: ${actor.name}`);
  console.log(`Can craft: ${available.length} / ${allRecipes.length} recipes\n`);

  if (available.length === 0) {
    console.log('❌ No recipes available with current inventory');
  } else {
    console.log('✅ CAN CRAFT:');
    available.forEach((recipe, index) => {
      console.log(`  ${index + 1}. ${recipe.name}`);
      console.log(`     → ${recipe.getResultDescription()}`);
    });
  }

  // Show what's missing for unavailable recipes
  const unavailable = allRecipes.filter(r => !available.includes(r));
  if (unavailable.length > 0) {
    console.log('\n❌ CANNOT CRAFT (missing items):');
    unavailable.forEach((recipe, index) => {
      const check = game.fabricate.getRecipeManager().canCraft(actor, recipe);
      console.log(`  ${index + 1}. ${recipe.name}`);

      if (check.missing.ingredients.length > 0) {
        console.log('     Missing ingredients:');
        check.missing.ingredients.forEach(m => {
          console.log(`       - ${m.ingredient.getDescription()}: need ${m.need}, have ${m.have}`);
        });
      }

      if (check.missing.catalysts.length > 0) {
        console.log('     Missing catalysts:');
        check.missing.catalysts.forEach(c => {
          console.log(`       - ${c.name}`);
        });
      }
    });
  }

  ui.notifications.info(`Can craft ${available.length} recipes (check console F12)`);
}

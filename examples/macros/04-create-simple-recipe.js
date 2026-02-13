// Fabricate v2 Macro: Create Simple Recipe
// Template for creating a basic recipe

// ⚠️ EDIT THESE VALUES ⚠️
const RECIPE_NAME = 'Iron Sword';
const INGREDIENT_1_UUID = 'Item.xxxxxxxxxxxxx'; // Replace with actual UUID
const INGREDIENT_1_QTY = 2;
const INGREDIENT_2_UUID = 'Item.yyyyyyyyyyyyy'; // Replace with actual UUID
const INGREDIENT_2_QTY = 1;
const RESULT_UUID = 'Item.zzzzzzzzzzzzz'; // Replace with actual UUID
const RESULT_QTY = 1;

// Create the recipe
try {
  const recipe = await fabricate.createSimpleRecipe(
    RECIPE_NAME,
    [
      { itemUuid: INGREDIENT_1_UUID, quantity: INGREDIENT_1_QTY },
      { itemUuid: INGREDIENT_2_UUID, quantity: INGREDIENT_2_QTY }
    ],
    {
      itemUuid: RESULT_UUID,
      quantity: RESULT_QTY
    }
  );

  console.log(`✅ Recipe created: ${recipe.name}`);
  ui.notifications.info(`Recipe "${recipe.name}" created successfully!`);
} catch (err) {
  console.error('❌ Error creating recipe:', err);
  ui.notifications.error(`Failed to create recipe: ${err.message}`);
}

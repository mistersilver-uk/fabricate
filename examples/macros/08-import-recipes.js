// Fabricate v2 Macro: Import Recipes
// Import recipes from JSON

// Paste your JSON here (between the backticks)
const recipesJson = `
[
  {
    "id": "example",
    "name": "Example Recipe",
    "description": "Replace this with your actual recipe JSON",
    "ingredients": [],
    "catalysts": [],
    "result": {
      "itemId": null,
      "itemUuid": null,
      "quantity": 1,
      "isVariable": false,
      "transferEffects": false
    },
    "process": {
      "type": "instant"
    },
    "category": "general",
    "tags": [],
    "enabled": true,
    "system": "all"
  }
]
`;

try {
  const recipes = JSON.parse(recipesJson);

  new Dialog({
    title: 'Import Recipes',
    content: `
      <p>Found <strong>${recipes.length}</strong> recipe(s) to import.</p>
      <p>Overwrite existing recipes with the same ID?</p>
    `,
    buttons: {
      overwrite: {
        icon: '<i class="fas fa-check"></i>',
        label: 'Overwrite Existing',
        callback: async () => {
          await game.fabricate.getRecipeManager().importRecipes(recipes, true);
          ui.notifications.info(`Imported ${recipes.length} recipes (overwrote duplicates)`);
        }
      },
      skip: {
        icon: '<i class="fas fa-forward"></i>',
        label: 'Skip Existing',
        callback: async () => {
          await game.fabricate.getRecipeManager().importRecipes(recipes, false);
          ui.notifications.info('Imported recipes (skipped duplicates)');
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Cancel'
      }
    },
    default: 'skip'
  }).render(true);

} catch (err) {
  console.error('Failed to parse JSON:', err);
  ui.notifications.error('Invalid JSON format. Check console for details.');
}

// Fabricate v2 Macro: Export Recipes
// Export all recipes as JSON (copies to clipboard)

const recipes = game.fabricate.getRecipeManager().exportRecipes();
const json = JSON.stringify(recipes, null, 2);

// Try to copy to clipboard
try {
  const textarea = document.createElement('textarea');
  textarea.value = json;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (success) {
    ui.notifications.info(`Exported ${recipes.length} recipes to clipboard!`);
  } else {
    ui.notifications.warn('Could not copy to clipboard. Check console.');
  }
} catch (err) {
  ui.notifications.warn('Could not copy to clipboard. Check console.');
}

// Always log to console as backup
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║         FABRICATE v2 - EXPORTED RECIPES               ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('\nCopy this JSON to share or backup your recipes:\n');
console.log(json);

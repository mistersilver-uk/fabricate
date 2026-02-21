// Fabricate Macro: Craft Item
// Select a recipe from a dialog and craft it

const actor = game.user.character;

if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  const recipes = fabricate.listRecipes({ enabled: true });

  if (recipes.length === 0) {
    ui.notifications.warn('No recipes available. Create some recipes first!');
  } else {
    // Create a simple dialog to select recipe
    const options = recipes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    new Dialog({
      title: 'Craft Item',
      content: `
        <form>
          <div class="form-group">
            <label>Select Recipe:</label>
            <select id="recipe-select" style="width: 100%;">
              ${options}
            </select>
          </div>
        </form>
      `,
      buttons: {
        craft: {
          icon: '<i class="fas fa-hammer"></i>',
          label: 'Craft',
          callback: async (html) => {
            const recipeId = html.find('#recipe-select').val();
            const recipe = recipes.find(r => r.id === recipeId);

            if (!recipe) {
              ui.notifications.error('Recipe not found');
              return;
            }

            // Check if can craft
            const canCraft = game.fabricate.getRecipeManager().canCraft(actor, recipe);
            if (!canCraft.canCraft) {
              let msg = `Cannot craft ${recipe.name}:\n`;
              canCraft.missing.ingredients.forEach(m => {
                msg += `- ${m.ingredient.getDescription()}: need ${m.need}, have ${m.have}\n`;
              });
              canCraft.missing.catalysts.forEach(c => {
                msg += `- Missing catalyst: ${c.name}\n`;
              });
              ui.notifications.error(msg);
              return;
            }

            // Attempt to craft
            const result = await fabricate.craft(actor, recipe.id);

            if (result.success) {
              ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<div class="fabricate-craft-success">
                  <h3>Crafting Success!</h3>
                  <p><strong>${recipe.name}</strong> has been crafted.</p>
                  <p>${result.message}</p>
                </div>`
              });
            } else {
              ui.notifications.error(result.message);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel'
        }
      },
      default: 'craft'
    }).render(true);
  }
}


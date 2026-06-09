---
layout: default
title: Example Macros
parent: Macros & Examples
nav_order: 1
---

# Example Macros

Ready-to-use Foundry macros for common Fabricate tasks. Copy these into new Script macros in Foundry.

---

## List All Recipes

Shows all recipes in the console with details.

```javascript
const recipes = fabricate.listRecipes();

if (recipes.length === 0) {
  ui.notifications.warn('No recipes found');
} else {
  recipes.forEach((recipe, i) => {
    console.log(`${i + 1}. ${recipe.name}`);
    console.log(`   ID: ${recipe.id}`);
    console.log(`   Category: ${recipe.category}`);
    console.log(`   Result: ${recipe.getResultDescription()}`);
    console.log(`   Type: ${recipe.isSimpleRecipe() ? 'Simple' : 'Advanced'}`);
  });
  ui.notifications.info(`Found ${recipes.length} recipes (check console F12)`);
}
```

## Check Available Recipes

Shows which recipes your character can craft and what's missing for others.

```javascript
const actor = game.user.character;
if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  const rm = game.fabricate.getRecipeManager();
  const available = fabricate.getAvailableRecipes(actor);
  const all = fabricate.listRecipes({ enabled: true });

  console.log(`Character: ${actor.name}`);
  console.log(`Can craft: ${available.length} / ${all.length}\n`);

  available.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} -> ${r.getResultDescription()}`);
  });

  // Show missing items for unavailable recipes
  const unavailable = all.filter(r => !available.includes(r));
  unavailable.forEach(recipe => {
    const check = rm.canCraft(actor, recipe);
    console.log(`\n  Cannot craft: ${recipe.name}`);
    check.missing.ingredients.forEach(m => {
      const name = rm.resolveComponentName(recipe, m.ingredient.match?.componentId);
      console.log(`    - ${name}: need ${m.need}, have ${m.have}`);
    });
  });

  ui.notifications.info(`Can craft ${available.length} recipes (check console F12)`);
}
```

## Get Item UUIDs

Lists all items in your inventory with their UUIDs. Useful when creating recipes via macros.

```javascript
const actor = game.user.character;
if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  actor.items.forEach(item => {
    const qty = item.system.quantity || 1;
    const tags = item.getFlag('fabricate', 'tags') || [];
    console.log(`${item.name} (x${qty}) - UUID: ${item.uuid}`);
    if (tags.length) console.log(`  Tags: ${tags.join(', ')}`);
  });
  ui.notifications.info(`Listed ${actor.items.size} items (check console F12)`);
}
```

## Create a Simple Recipe

Template macro -- edit the values to match your items.

```javascript
const RECIPE_NAME = 'Iron Sword';
const INGREDIENTS = [
  { itemUuid: 'Item.xxxxxxxxxxxxx', quantity: 2 },  // e.g. Iron Ingot
  { itemUuid: 'Item.yyyyyyyyyyyyy', quantity: 1 }   // e.g. Wood
];
const RESULT = { itemUuid: 'Item.zzzzzzzzzzzzz', quantity: 1 };  // Iron Sword

try {
  const recipe = await fabricate.createSimpleRecipe(RECIPE_NAME, INGREDIENTS, RESULT);
  console.log(`Recipe created: ${recipe.name} (${recipe.id})`);
  ui.notifications.info(`Recipe "${recipe.name}" created!`);
} catch (err) {
  console.error('Error creating recipe:', err);
  ui.notifications.error(`Failed: ${err.message}`);
}
```

## Craft via Dialog

Opens a dialog to pick a recipe and craft it.

```javascript
const actor = game.user.character;
if (!actor) {
  ui.notifications.warn('Please select a character first');
} else {
  const recipes = fabricate.listRecipes({ enabled: true });
  if (recipes.length === 0) {
    ui.notifications.warn('No recipes available');
  } else {
    const options = recipes.map(r =>
      `<option value="${r.id}">${r.name}</option>`
    ).join('');

    new Dialog({
      title: 'Craft Item',
      content: `<form>
        <div class="form-group">
          <label>Recipe:</label>
          <select id="recipe-select">${options}</select>
        </div>
      </form>`,
      buttons: {
        craft: {
          icon: '<i class="fas fa-hammer"></i>',
          label: 'Craft',
          callback: async (html) => {
            const recipeId = html.find('#recipe-select').val();
            const result = await fabricate.craft(actor, recipeId);
            // Fabricate automatically posts a chat message summarising the result
            // (controlled by the system's chatOutput feature toggle).
            // Use ui.notifications here only for inline feedback, not ChatMessage.create(),
            // to avoid a duplicate chat card.
            if (result.success) {
              ui.notifications.info(result.message);
            } else {
              ui.notifications.error(result.message);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel'
        }
      }
    }).render(true);
  }
}
```

## Tag Items in Bulk

Apply Fabricate tags to inventory items using pattern matching rules. Edit the `rules` array to match your items.

```javascript
const actor = game.user.character;
if (!actor) { ui.notifications.warn('Select a character first'); return; }

const rules = [
  { match: 'Iron Ingot',   tags: ['metal', 'metal:iron'], tier: 'common' },
  { match: 'Steel Ingot',  tags: ['metal', 'metal:steel'], tier: 'uncommon' },
  { match: 'Mithril Ingot', tags: ['metal', 'metal:mithril'], tier: 'rare' },
  { match: /Wood|Lumber/,  tags: ['wood', 'material'], tier: 'common' },
  { match: /Herb/,         tags: ['herb', 'ingredient'], tier: 'common' },
  { match: /Forge/,        tags: ['tool:forge'], tier: null }
];

let tagged = 0;
for (const item of actor.items) {
  for (const rule of rules) {
    const matches = typeof rule.match === 'string'
      ? item.name === rule.match
      : rule.match.test(item.name);

    if (matches) {
      await item.setFlag('fabricate', 'tags', rule.tags);
      if (rule.tier) await item.setFlag('fabricate', 'tier', rule.tier);
      console.log(`Tagged: ${item.name} -> [${rule.tags.join(', ')}]`);
      tagged++;
      break;
    }
  }
}

ui.notifications.info(`Tagged ${tagged} items`);
```

## Export Recipes

Exports all recipes as JSON and copies to clipboard.

```javascript
const recipes = game.fabricate.getRecipeManager().exportRecipes();
const json = JSON.stringify(recipes, null, 2);

try {
  await navigator.clipboard.writeText(json);
  ui.notifications.info(`Exported ${recipes.length} recipes to clipboard!`);
} catch {
  ui.notifications.warn('Could not copy to clipboard. Check console (F12).');
}
console.log('Exported recipes:', json);
```

## Import Recipes

Paste your recipe JSON into the `recipesJson` variable.

```javascript
const recipesJson = `[]`;  // <-- Paste your JSON here

try {
  const recipes = JSON.parse(recipesJson);

  new Dialog({
    title: 'Import Recipes',
    content: `<p>Import <strong>${recipes.length}</strong> recipe(s)?</p>
      <p>Overwrite existing recipes with the same ID?</p>`,
    buttons: {
      overwrite: {
        label: 'Overwrite Existing',
        callback: async () => {
          await game.fabricate.getRecipeManager().importRecipes(recipes, true);
          ui.notifications.info(`Imported ${recipes.length} recipes (overwrote duplicates)`);
        }
      },
      skip: {
        label: 'Skip Existing',
        callback: async () => {
          await game.fabricate.getRecipeManager().importRecipes(recipes, false);
          ui.notifications.info(`Imported recipes (skipped duplicates)`);
        }
      },
      cancel: { label: 'Cancel' }
    }
  }).render(true);
} catch (err) {
  ui.notifications.error('Invalid JSON. Check console.');
  console.error(err);
}
```

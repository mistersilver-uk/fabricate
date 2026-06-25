# Fabricate - Example Macros

This folder contains ready-to-use macros for Fabricate.

## How to Use

1. In Foundry VTT, create a new **Script Macro**
2. Copy the contents of one of these files
3. Paste into the macro editor
4. Save and run!

## Macro List

### 01-list-recipes.js

Lists all recipes in the console with full details.

**Usage:** Just click to run.
Check console (F12) for output.

---

### 02-available-recipes.js

Shows which recipes you can craft with your current inventory, and what's missing for the others.

**Usage:** Select a character, then run the macro.

---

### 03-get-item-uuids.js

Lists all items in your inventory with their UUIDs (needed for creating recipes).

**Usage:** Select a character, then run the macro.
Copy UUIDs from console.

---

### 04-create-simple-recipe.js

Template for creating a basic recipe.

**Usage:**

1. Edit the variables at the top (UUIDs, quantities, recipe name)
2. Run the macro to create the recipe

---

### 05-craft-item.js

Interactive crafting interface with recipe selection dialog.

**Usage:** Select a character, run the macro, choose a recipe, and craft!

---

### 06-tag-items.js

Bulk tag items in your inventory for use with tag-based recipes.

**Usage:**

1. Edit the `taggingRules` array to match your items
2. Select a character and run

**Example Rules:**

```javascript
{ match: 'Iron Ingot', tags: ['metal', 'metal:iron'], tier: 'common' },
{ match: /Wood|Lumber/, tags: ['wood'], tier: 'common' },
```

---

### 07-export-recipes.js

Export all recipes as JSON (for backup or sharing).

**Usage:** Run macro, recipes are copied to clipboard and logged to console.

---

### 08-import-recipes.js

Import recipes from JSON.

**Usage:**

1. Paste recipe JSON into the macro (replace the example)
2. Run macro
3. Choose whether to overwrite existing recipes

---

## Tips

- **Console:** Press F12 to open the browser console for detailed output
- **Character Selection:** Many macros require you to have a character selected
- **UUIDs:** Use macro 03 to get item UUIDs before creating recipes
- **Testing:** Test macros in a test world first
- **Customization:** Feel free to modify these macros for your needs!

## Example Workflow

1. Run `03-get-item-uuids.js` to find item UUIDs
2. Edit `04-create-simple-recipe.js` with those UUIDs
3. Run it to create your recipe
4. Use `05-craft-item.js` to craft items
5. Export with `07-export-recipes.js` to share with others

## Need More Help?

See `docs/quickstart.md` in the main folder for detailed instructions.

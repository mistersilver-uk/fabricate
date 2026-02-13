# Fabricate v2 - Universal Crafting System

A system-agnostic, flexible crafting module for Foundry Virtual Tabletop that supports any tabletop RPG system and any crafting system you can imagine.

## Features

### Progressive Complexity
Fabricate v2 is designed to scale from simple to complex:

- **Simple Recipes**: Basic A + B = C crafting for straightforward systems
- **Catalysts**: Non-consumable tools and workstations
- **Variable Outputs**: Item properties that vary based on ingredients used
- **Active Effect Transfer**: Effects from ingredients transfer to crafted items
- **Tag-Based Ingredients**: Flexible matching (e.g., "any metal" instead of "iron")
- **Quality Tiers**: Ingredient quality affects output quality

### System Agnostic
Works with any game system in Foundry VTT:
- D&D 5e
- Pathfinder 2e
- Savage Worlds
- Custom systems
- And more!

## Installation

1. In Foundry VTT, go to **Add-on Modules**
2. Click **Install Module**
3. Search for "Fabricate v2" or paste the manifest URL
4. Click **Install**
5. Enable the module in your world

## Quick Start

### Using the Crafting Interface

**For Players:**
1. Open the **Items** sidebar (left side of Foundry)
2. Click the **Craft Item** button (hammer icon)
3. Select which actor will craft
4. Browse available recipes
5. Click "Craft" on any recipe you have materials for

The crafting interface shows:
- **[OK] Green border**: Recipes you can craft now
- **[X] Red border**: Missing required items
- **Search bar**: Find recipes by name
- **Filters**: Show only craftable recipes, filter by category

### Creating Recipes (For GMs)

**Option 1: Using Macros (Easiest)**

Use the provided macros in `examples/macros/`:
- `04-create-simple-recipe.js` - Template for basic recipes
- See `QUICKSTART.md` for detailed instructions

**Option 2: Via Console**

```javascript
// Create a simple Iron Sword recipe
fabricate.createSimpleRecipe('Iron Sword', [
  { itemUuid: 'Item.abc123', quantity: 2 }, // 2 Iron Ingots
  { itemUuid: 'Item.def456', quantity: 1 }  // 1 Wood
], {
  itemUuid: 'Item.ghi789', // Iron Sword
  quantity: 1
});
```

### Crafting an Item

Players can craft using the **Craft** button on their character sheet, or via chat command:

```
/craft Iron Sword
```

Or via macro:
```javascript
fabricate.craft(game.user.character, 'recipeId');
```

## Advanced Features

### Catalysts (Non-Consumable Tools)

Catalysts are items required for crafting but not consumed:

```javascript
const { Recipe, Ingredient, Catalyst } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Steel Blade',
  ingredientSets: [
    {
      id: 'steel-input',
      ingredients: [
        new Ingredient({ itemUuid: 'Item.steel', quantity: 3 })
      ]
    }
  ],
  catalysts: [
    new Catalyst({
      name: 'Forge',
      tag: 'tool:forge',
      required: true,
      degradesOnUse: true,
      degradeAmount: 1
    })
  ],
  results: [
    {
      id: 'steel-blade',
      itemUuid: 'Item.steelBlade',
      quantity: 1
    }
  ]
});

game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

### Variable Outputs

Create items whose properties vary based on ingredients:

```javascript
const { Recipe, Ingredient, IngredientSet, Result } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Magical Sword',
  ingredientSets: [
    new IngredientSet({
      id: 'metal-input',
      ingredients: [
        new Ingredient({
          tag: 'metal',
          quantity: 2,
          tier: null // Accept any tier
        })
      ],
      resultMapping: ['magic-sword']
    })
  ],
  results: [
    new Result({
      id: 'magic-sword',
      itemUuid: 'Item.genericSword',
      quantity: 1,
      propertyFormulas: {
        'system.damage.parts.0.0': '1d8 + ingredientTier', // Damage scales with ingredient tier
        'system.weight': '3 - (ingredientTier * 0.5)' // Better materials = lighter
      }
    })
  ],
  isVariable: true
});
```

### Active Effect Transfer

Transfer magical properties from ingredients to the crafted item:

```javascript
const { Recipe, Ingredient, Result } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Poisoned Blade',
  ingredientSets: [
    {
      id: 'poisoned-blade-input',
      ingredients: [
        new Ingredient({
          itemUuid: 'Item.sword',
          quantity: 1
        }),
        new Ingredient({
          itemUuid: 'Item.poison',
          quantity: 1,
          extractEffects: true, // Extract effects from this ingredient
          effectFilter: 'poison' // Only extract effects with "poison" in the name
        })
      ]
    }
  ],
  results: [
    new Result({
      id: 'poisoned-blade',
      itemUuid: 'Item.poisonedSword',
      quantity: 1
    })
  ],
  transferEffects: true
});
```

### Tag-Based Ingredients

Use tags for flexible ingredient matching:

```javascript
// First, tag your items
await item.setFlag('fabricate-v2', 'tags', ['metal', 'metal:iron']);
await item.setFlag('fabricate-v2', 'tier', 'common');

// Then create recipes using tags
const recipe = new Recipe({
  name: 'Any Metal Sword',
  ingredientSets: [
    {
      id: 'tagged-metal-input',
      ingredients: [
        new Ingredient({
          tag: 'metal', // Matches any item with 'metal' tag
          quantity: 2,
          tier: 'common' // Optional: require specific tier
        })
      ]
    }
  ],
  results: [
    {
      id: 'tagged-sword',
      itemUuid: 'Item.sword',
      quantity: 1
    }
  ]
});
```

### Alternative Ingredients

Allow multiple options for an ingredient:

```javascript
const ingredient = new Ingredient({
  tag: 'wood',
  quantity: 1,
  alternatives: [
    new Ingredient({ itemUuid: 'Item.oak', quantity: 1 }),
    new Ingredient({ itemUuid: 'Item.pine', quantity: 2 }) // Takes 2 pine instead of 1 oak
  ]
});
```

## API Reference

### Global API

```javascript
// Access via global scope
fabricate.createSimpleRecipe(name, ingredients, result)
fabricate.craft(actor, recipeId, options)
fabricate.listRecipes(filters)
fabricate.getAvailableRecipes(actorOrActors)

// Access via game object
game.fabricate.getRecipeManager()
game.fabricate.getCraftingEngine()
game.fabricate.craft(actor, recipe, options)
```

### Classes

```javascript
const { Recipe, IngredientSet, Ingredient, Result, Catalyst, RecipeManager, CraftingEngine } = game.fabricate.api;
```

#### Recipe

```javascript
new Recipe({
  name: 'Recipe Name',
  description: 'Recipe description',
  ingredientSets: [IngredientSet, ...],
  catalysts: [Catalyst, ...],
  results: [Result, ...],
  isVariable: false,
  transferEffects: false,
  requiresAllSets: false,
  category: 'general',
  tags: [],
  enabled: true,
  system: 'all'
})
```

#### Ingredient

```javascript
new Ingredient({
  itemUuid: null,
  quantity: 1,
  tag: null,
  tier: null,
  alternatives: [],
  extractEffects: false,
  effectFilter: null
})
```

#### Catalyst

```javascript
new Catalyst({
  itemUuid: null,
  tag: null,
  name: 'Catalyst Name',
  required: true,
  mustBeEquipped: false,
  mustBeInInventory: true,
  degradesOnUse: false,
  degradeAmount: 1,
  durabilityAttribute: 'system.durability',
  qualityBonus: false,
  qualityAttribute: 'system.quality'
})
```

## Examples

### Example 1: Simple Alchemy

```javascript
// Health Potion: 2 Healing Herbs -> 1 Health Potion
fabricate.createSimpleRecipe('Health Potion', [
  { itemUuid: 'Item.healingHerb', quantity: 2 }
], {
  itemUuid: 'Item.healthPotion',
  quantity: 1
});
```

### Example 2: Blacksmithing with Forge

```javascript
const { Recipe, Ingredient, Catalyst, Result } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Iron Sword',
  ingredientSets: [
    {
      id: 'iron-sword-input',
      ingredients: [
        new Ingredient({ tag: 'metal:iron', quantity: 2 }),
        new Ingredient({ tag: 'wood', quantity: 1 })
      ]
    }
  ],
  catalysts: [
    new Catalyst({
      name: 'Blacksmith Forge',
      tag: 'tool:forge',
      required: true
    })
  ],
  results: [
    new Result({
      id: 'iron-sword-result',
      itemUuid: 'Item.ironSword',
      quantity: 1
    })
  ]
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

### Example 3: Enchanted Item with Effect Transfer

```javascript
const { Recipe, Ingredient, Result } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Flaming Sword',
  ingredientSets: [
    {
      id: 'flaming-sword-input',
      ingredients: [
        new Ingredient({ itemUuid: 'Item.sword', quantity: 1 }),
        new Ingredient({
          itemUuid: 'Item.fireGem',
          quantity: 1,
          extractEffects: true,
          effectFilter: 'fire'
        })
      ]
    }
  ],
  results: [
    new Result({
      id: 'flaming-sword-result',
      itemUuid: 'Item.flamingSword',
      quantity: 1
    })
  ],
  transferEffects: true
});
```

### Example 4: Quality-Based Output

```javascript
const { Recipe, Ingredient, IngredientSet, Result } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Quality Blade',
  ingredientSets: [
    new IngredientSet({
      id: 'quality-blade-input',
      ingredients: [
        new Ingredient({
          tag: 'metal',
          quantity: 3
          // No tier specified - accepts any tier
        })
      ],
      resultMapping: ['quality-blade-result']
    })
  ],
  results: [
    new Result({
      id: 'quality-blade-result',
      itemUuid: 'Item.blade',
      quantity: 1,
      propertyFormulas: {
        'system.damage.parts.0.0': '1d6 + Math.floor(ingredientTier)',
        'system.price': '50 * ingredientTier'
      }
    })
  ],
  isVariable: true
});
```

## Formula System

Formulas use a safe expression parser that supports mathematical operations without using `eval()`.

**Supported Features:**
- Basic math operators: `+`, `-`, `*`, `/`, `()`
- Dice notation: `1d6`, `2d8`, `3d10`
- Math functions: `Math.floor()`, `Math.ceil()`, `Math.round()`
- Context variables: `ingredientCount`, `ingredientTier`, `catalystQuality`

**Context Variables:**
- `ingredientCount` - Number of ingredients consumed
- `ingredientTier` - Average tier of ingredients (common=1, uncommon=2, rare=3, legendary=4)
- `catalystQuality` - Average quality bonus from catalysts

**Example formulas:**
- `1d8 + ingredientTier`
- `10 * ingredientCount`
- `100 + (ingredientTier * catalystQuality)`
- `Math.floor(1d6 + ingredientTier / 2)`
- `2d6 * catalystQuality`

## Import/Export

### Export Recipes
```javascript
const recipes = game.fabricate.getRecipeManager().exportRecipes();
const json = JSON.stringify(recipes, null, 2);
// Save to file or share
```

### Import Recipes
```javascript
const recipesData = JSON.parse(jsonString);
await game.fabricate.getRecipeManager().importRecipes(recipesData, false);
```

## Settings

- **Enable Crafting System**: Enable/disable the module globally
- **Show Simple Recipes Only**: Hide advanced features in the UI
- **Auto-Craft**: Skip confirmation dialogs when crafting

## Roadmap

- [ ] Visual recipe editor UI
- [ ] Player crafting interface
- [ ] Time-based crafting with progress tracking
- [ ] Multi-step recipes (craft A, then use A to craft B)
- [ ] Recipe discovery/learning system
- [ ] Compendium packs with example recipes
- [ ] Safe formula parser (replace eval)
- [ ] Skill check integration for various systems
- [ ] Crafting stations (placed items as catalysts)
- [ ] Batch crafting
- [ ] Recipe categories and filtering
- [ ] Permissions system (who can craft what)

## Support

- **Issues**: [GitHub Issues](https://github.com/misterpotts/fabricate-v2/issues)
- **Documentation**: [GitHub Wiki](https://github.com/misterpotts/fabricate-v2/wiki)

## License

Licensed under the **Fabricate Community License v1.0** (`LicenseRef-Fabricate-Community-1.0`).
Commercial use requires a separate commercial license. See `LICENSE`.

## Credits

Created by MisterPotts

Inspired by the original Fabricate module by MisterPotts.

## Development

### Building

```bash
npm install
npm run build    # Build once
npm run dev      # Build and watch for changes
```

### Project Structure

```text
fabricate-v2/
|-- src/
|   |-- main.js                 # Module entry point
|   |-- models/
|   |   |-- Recipe.js           # Recipe data model
|   |   |-- Ingredient.js       # Ingredient data model
|   |   `-- Catalyst.js         # Catalyst data model
|   |-- systems/
|   |   |-- RecipeManager.js    # Recipe CRUD operations
|   |   `-- CraftingEngine.js   # Crafting logic
|   `-- ui/                     # UI components
|-- styles/
|   `-- fabricate.css           # Module styles
|-- lang/
|   `-- en.json                 # Localization
|-- module.json                 # Foundry manifest
|-- package.json                # NPM configuration
`-- vite.config.js              # Build configuration
```

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

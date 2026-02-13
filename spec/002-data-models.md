# Specification 002: Data Models

## Purpose

Define the data structures for recipes, ingredients, and catalysts that support both simple and advanced crafting scenarios.

## Recipe

### Purpose

Represents a complete crafting recipe with inputs (ingredients, catalysts) and output (result item or items).

### Properties

```javascript
{
  id: string,                    // Unique identifier (UUID) for the recipe
  name: string,                  // Display name
  description: string,           // Recipe description
  category: string,              // Optional category for organization
  enabled: boolean,              // Whether recipe is active

  // Input requirements (at least one set must be satisfied)
  ingredientSets: IngredientSet[], // Alternative ingredient combinations
  catalysts: Catalyst[],           // Non-consumable requirements

  // Output (multiple items can be produced)
  results: Result[],               // Items to create

  // Recipe behavior
  isVariable: boolean,             // Whether output varies based on inputs
  transferEffects: boolean,        // Transfer effects from ingredients to results
  requiresAllSets: boolean,        // false = OR logic, true = AND logic (default: false)

  // Metadata
  metadata: {
    created: number,               // Creation timestamp
    modified: number,              // Last modification timestamp
    author: string,                // Optional creator identifier
    version: string                // Optional version tracking
  }
}
```

### Methods

**Factory Methods**

- `Recipe.createSimple(name, ingredients, result)` - Create simple recipe
- `Recipe.fromJSON(data)` - Deserialize from JSON

**Validation**

- `validate()` - Returns `{valid: boolean, errors: string[]}`
- `isSimpleRecipe()` - Check if recipe uses only simple features

**Serialization**

- `toJSON()` - Serialize to JSON for storage

### Requirements

1. **ID Generation**: UUIDs generated using `foundry.utils.randomID()`
2. **Validation Rules**:
   - Name must not be empty
   - Must have at least one ingredient set
   - Each ingredient set must have at least one ingredient
   - Must have at least one result
   - All result itemUuids must be valid Foundry Source UUIDs
   - All result quantities must be positive
   - If `isVariable` is true, each ingredient set must have valid `resultMapping` IDs
3. **Simple Recipe Criteria**:
   - Single ingredient set with exact item matching (no tags)
   - No catalysts
   - No essence requirements
   - No variable output (`isVariable: false`)
   - No effect transfer (`transferEffects: false`)

## IngredientSet

### Purpose

Represents a set of ingredients that can satisfy a recipe's input requirements. Multiple ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC").

### Properties

```javascript
{
  id: string,                // Unique identifier within the recipe
  name: string,              // Optional display name (e.g., "Using Iron", "Using Steel")
  ingredients: Ingredient[], // Items required for this set
  essences: {                // Required essences (from ingredient properties)
    [essenceType]: number    // e.g., { 'light': 1, 'fire': 2 }
  },
  resultMapping: string[]    // Result IDs to produce when this set is used (for variable recipes)
}
```

### Methods

**Validation**

- `validate()` - Returns `{valid: boolean, errors: string[]}`
- `canBeCraftedBy(actor)` - Check if actor has required ingredients

**Factory**

- `IngredientSet.fromJSON(data)` - Deserialize from JSON

### Essence Matching Logic

When an ingredient set specifies essence requirements:

1. **Essence Accumulation**: Sum all essences from the provided ingredients
2. **Requirement Check**: Verify accumulated essences meet or exceed required amounts
3. **Multi-source**: Essences can come from any combination of ingredients
4. **Partial Contribution**: Multiple items can contribute to the same essence requirement

**Example**: Recipe requires `{ 'light': 3, 'fire': 1 }`
- Item A has `{ 'light': 2 }`
- Item B has `{ 'light': 1, 'fire': 1 }`
- Combined: `{ 'light': 3, 'fire': 1 }` ✓ Satisfies requirement

### Requirements

1. Must have at least one ingredient OR at least one essence requirement
2. All ingredients must be valid
3. `essences` object keys are essence type strings, values are required quantities
4. Essence requirements are validated by summing essences from all provided ingredients
5. `resultMapping` array must reference valid Result IDs when used in variable recipes
6. When recipe has `isVariable: false`, `resultMapping` is ignored

## Result

### Purpose

Represents an item produced by a recipe. Recipes can produce multiple different items.

### Properties

```javascript
{
  id: string,                    // Unique identifier within the recipe (for mapping)
  itemUuid: string,              // Foundry Source UUID (core.sourceId flag) of item to create
  quantity: number,              // Number of items created (default: 1)
  propertyFormulas: {            // Dynamic property calculation
    [propertyPath]: string       // e.g., "system.damage.parts": "1d6 + tier"
  }
}
```

### Methods

**Factory**

- `Result.fromJSON(data)` - Deserialize from JSON

**Validation**

- `validate()` - Returns `{valid: boolean, errors: string[]}`

### Requirements

1. `itemUuid` must be a valid Foundry Source UUID (e.g., "Compendium.pack-id.item-id")
2. `quantity` must be positive
3. Property formulas are evaluated at craft time and can reference ingredient properties
4. `id` must be unique within the recipe's results array

## Ingredient

### Purpose

Represents a required consumable component for crafting.

### Properties

```javascript
{
  // Item Matching
  itemUuid: string | null,    // Foundry Source UUID (core.sourceId flag)
  quantity: number,           // Required quantity (default: 1)

  // Advanced Matching (flexible)
  tag: string | null,         // Tag for flexible matching (e.g., "metal")
  tier: string | null,        // Quality tier (e.g., "common", "rare")
  alternatives: Ingredient[], // Alternative ingredients

  // Effect Transfer
  extractEffects: boolean     // Whether to extract active effects
}
```

### Methods

**Matching**

- `matches(item)` - Check if item satisfies ingredient requirement.
Module settings should allow fallback to name matching, which should be disabled by default.

**Factory**

- `Ingredient.fromJSON(data)` - Deserialize from JSON

### Matching Logic

1. **Exact Match**: If `itemUuid` is set, match item by Source UUID exactly
2. **Tag Match**: If `tag` is set, check item's `fabricate-v2.tags` flag
3. **Tier Match**: If `tier` is set, check item's `fabricate-v2.tier` flag
4. **Alternative Match**: Check alternatives recursively
5. **Priority**: Exact > Tag > Alternative

### Requirements

1. At least one of `itemUuid` or `tag` must be set
2. `quantity` must be positive
3. `itemUuid` should reference the Foundry Source UUID (core.sourceId flag)
4. Tag matching requires items to have `fabricate-v2.tags` flag set
5. Tier matching requires items to have `fabricate-v2.tier` flag set

## Catalyst

### Purpose

Represents a required non-consumable component (tools, workstations, etc.).

### Properties

```javascript
{
  // Matching
  itemUuid: string | null,    // Foundry Source UUID (core.sourceId flag)
  tag: string | null,         // Tag for flexible matching

  // Requirements
  required: boolean,          // Whether catalyst is mandatory (default: true)
  mustBeEquipped: boolean,    // Whether catalyst must be equipped (default: false)

  // Degradation
  degradesOnUse: boolean,     // Whether catalyst degrades (default: false)
  degradeAmount: number       // Amount to degrade (default: 1)
}
```

### Methods

**Validation**

- `validate(actor, scene)` - Check if actor has catalyst
  - Returns: `{valid: boolean, message: string, item: Item}`

**Matching**

- `matches(item)` - Check if item satisfies catalyst requirement

**Factory**

- `Catalyst.fromJSON(data)` - Deserialize from JSON

### Validation Logic

1. Find all items owned by actor that match catalyst
2. If `mustBeEquipped`, filter to equipped items only
3. Check scene proximity if catalyst has location requirements
4. Return first matching item

### Requirements

1. At least one of `itemUuid` or `tag` must be set
2. `itemUuid` should reference the Foundry Source UUID (core.sourceId flag)
3. If `degradesOnUse`, item must have a quantity or uses system
4. Catalysts are validated but never consumed (unless degraded)
5. Failed catalyst validation prevents crafting

## Item Flags

### Tags Flag

```javascript
item.setFlag('fabricate-v2', 'tags', ['metal', 'ore', 'iron']);
```

- Tags are arrays of strings
- Used for flexible ingredient matching
- Example tags: "metal", "herb:healing", "gem:precious"

### Tier Flag

```javascript
item.setFlag('fabricate-v2', 'tier', 'rare');
```

- Tier is a single string
- Used for quality-based ingredient matching
- Example tiers: "common", "uncommon", "rare", "epic", "legendary"

### Essences Flag

```javascript
item.setFlag('fabricate-v2', 'essences', {
  'light': 2,
  'fire': 1
});
```

- Essences is an object mapping essence types to quantities
- Represents magical or elemental properties the item possesses
- Used for essence-based ingredient matching
- An item can have multiple essence types simultaneously
- Example essence types: "light", "fire", "water", "earth", "shadow", "nature"
- Essence quantities represent the strength/amount of that essence in the item

## Examples

### Simple Recipe (Single Input, Single Output)

```javascript
const recipe = Recipe.createSimple(
  'Iron Sword',
  [
    { itemUuid: 'Compendium.items.iron-ingot', quantity: 2 },
    { itemUuid: 'Compendium.items.wood', quantity: 1 }
  ],
  { itemUuid: 'Compendium.items.iron-sword', quantity: 1 }
);
```

### Multiple Results (Smelting Ore)

```javascript
const recipe = new Recipe({
  name: 'Smelt Iron Ore',
  ingredientSets: [{
    id: 'default',
    ingredients: [
      { itemUuid: 'Compendium.items.iron-ore', quantity: 1 }
    ]
  }],
  catalysts: [
    { tag: 'furnace', required: true }
  ],
  results: [
    { id: 'ingot', itemUuid: 'Compendium.items.iron-ingot', quantity: 2 },
    { id: 'slag', itemUuid: 'Compendium.items.slag', quantity: 1 }
  ],
  isVariable: false,
  transferEffects: false
});
```

### Alternative Ingredients (2xA OR 1xB + 1xC)

```javascript
const recipe = new Recipe({
  name: 'Healing Potion',
  ingredientSets: [
    {
      id: 'two-herbs',
      name: 'Using Two Herbs',
      ingredients: [
        { tag: 'herb:healing', quantity: 2 }
      ]
    },
    {
      id: 'essence-water',
      name: 'Using Essence and Water',
      ingredients: [
        { itemUuid: 'Compendium.items.healing-essence', quantity: 1 },
        { itemUuid: 'Compendium.items.pure-water', quantity: 1 }
      ]
    }
  ],
  results: [
    { id: 'potion', itemUuid: 'Compendium.items.healing-potion', quantity: 1 }
  ],
  isVariable: false
});
```

### Variable Output (Different Metals = Different Swords)

```javascript
const recipe = new Recipe({
  name: 'Metal Sword',
  ingredientSets: [
    {
      id: 'iron-set',
      name: 'Using Iron',
      ingredients: [
        { itemUuid: 'Compendium.items.iron-ingot', quantity: 2 }
      ],
      resultMapping: ['iron-sword']
    },
    {
      id: 'steel-set',
      name: 'Using Steel',
      ingredients: [
        { itemUuid: 'Compendium.items.steel-ingot', quantity: 2 }
      ],
      resultMapping: ['steel-sword']
    },
    {
      id: 'mithril-set',
      name: 'Using Mithril',
      ingredients: [
        { itemUuid: 'Compendium.items.mithril-ingot', quantity: 2 }
      ],
      resultMapping: ['mithril-sword']
    }
  ],
  catalysts: [
    { tag: 'forge', required: true },
    { tag: 'smithing-hammer', required: true, mustBeEquipped: true }
  ],
  results: [
    { id: 'iron-sword', itemUuid: 'Compendium.items.iron-sword', quantity: 1 },
    { id: 'steel-sword', itemUuid: 'Compendium.items.steel-sword', quantity: 1 },
    { id: 'mithril-sword', itemUuid: 'Compendium.items.mithril-sword', quantity: 1 }
  ],
  isVariable: true,
  transferEffects: false
});
```

### Advanced: Tags with Property Formulas

```javascript
const recipe = new Recipe({
  name: 'Any Metal Sword',
  ingredientSets: [{
    id: 'any-metal',
    ingredients: [
      { tag: 'metal:ingot', quantity: 2 },
      { tag: 'wood:handle', quantity: 1 }
    ]
  }],
  catalysts: [
    { tag: 'forge', required: true }
  ],
  results: [{
    id: 'sword',
    itemUuid: 'Compendium.items.generic-sword',
    quantity: 1,
    propertyFormulas: {
      'system.damage.parts': '1d8 + @tier',
      'system.price.value': '@material.value * 10'
    }
  }],
  isVariable: false,
  transferEffects: true
});
```

### Essence Requirements: Alternative Paths

```javascript
const recipe = new Recipe({
  name: 'Enchanted Blade',
  description: 'Forge a magical sword using light essence and quality materials',
  ingredientSets: [
    {
      id: 'light-steel',
      name: 'Light-Infused Steel',
      ingredients: [
        { itemUuid: 'Compendium.items.steel-sword', quantity: 1 }
      ],
      essences: {
        'light': 1  // Steel sword must have light essence
      },
      resultMapping: ['light-blade']
    },
    {
      id: 'fire-iron',
      name: 'Fire Crystal Alternative',
      ingredients: [
        { itemUuid: 'Compendium.items.iron-sword', quantity: 1 },
        { itemUuid: 'Compendium.items.fire-crystal', quantity: 1 }
      ],
      essences: {},  // No essence requirement, using fire crystal instead
      resultMapping: ['fire-blade']
    }
  ],
  catalysts: [
    { tag: 'enchanting-altar', required: true }
  ],
  results: [
    { id: 'light-blade', itemUuid: 'Compendium.items.light-blade', quantity: 1 },
    { id: 'fire-blade', itemUuid: 'Compendium.items.fire-blade', quantity: 1 }
  ],
  isVariable: true
});
```

### Essence Requirements: Combined Sources

```javascript
const recipe = new Recipe({
  name: 'Prismatic Gem',
  description: 'Combine multiple essence sources to create a powerful gem',
  ingredientSets: [{
    id: 'multi-essence',
    ingredients: [
      { tag: 'gem', quantity: 3 }  // Any 3 gems that collectively have required essences
    ],
    essences: {
      'light': 2,
      'fire': 1,
      'water': 1
    }
  }],
  results: [{
    id: 'prismatic',
    itemUuid: 'Compendium.items.prismatic-gem',
    quantity: 1
  }],
  isVariable: false,
  transferEffects: true
});

// Example valid ingredient combinations:
// - Ruby (fire: 2) + Sapphire (water: 2) + Diamond (light: 2) ✓
// - Topaz (light: 1, fire: 1) + Aquamarine (water: 1, light: 1) + Garnet (fire: 1) ✓
// - Emerald (nature: 2) + Ruby (fire: 2) + Diamond (light: 2) ✗ (missing water)
```

### Essence Requirements: Exact Item + Essence

```javascript
const recipe = new Recipe({
  name: 'Holy Avenger',
  description: 'Infuse a masterwork sword with pure light essence',
  ingredientSets: [{
    id: 'holy-infusion',
    ingredients: [
      { itemUuid: 'Compendium.items.masterwork-longsword', quantity: 1 },
      { tag: 'holy-relic', quantity: 1 }
    ],
    essences: {
      'light': 5  // Combined from both items
    }
  }],
  catalysts: [
    { tag: 'sacred-altar', required: true },
    { tag: 'priest', required: true }
  ],
  results: [{
    id: 'holy-avenger',
    itemUuid: 'Compendium.items.holy-avenger',
    quantity: 1
  }],
  isVariable: false,
  transferEffects: true
});
```

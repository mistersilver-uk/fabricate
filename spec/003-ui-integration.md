# Specification 003: UI Integration

## Purpose

Define Foundry UI behavior for GM configuration and player crafting with feature-gated recipe authoring.

## Integration Points

### Items Directory Buttons

- `Craft Item` (all users with valid actor access)
- `Crafting Admin` (GMs only)

## GM Crafting Admin

### Window Layout

- Tabs: `Systems`, `Items`, `Recipes`, `Rules`
- Left sidebar for crafting-system selection
- Main panel for active-tab content

### Systems Tab

- Base fields: `Name`, `Description`, `Show advanced options`
- Advanced configuration appears as a **vertical stack of cards**
- Each card contains:
  - Header
  - Short description
  - Enable/disable checkbox
  - Card-specific configuration inputs (only when enabled)

### Required Advanced Feature Cards

1. **Recipe Categories**
   - Enables category field/filtering in recipe UIs
   - Config: list of category values
2. **Item Tags**
   - Used only for categorization/sorting/searching in system item management UI
   - Not used for recipe ingredient/catalyst matching
   - Config: list of allowed tags
3. **Essences**
   - Enables ingredient-set essence requirements
   - Config: essence definitions with `name`, `description`, and optional associated managed item
4. **Complex Recipes**
   - Enables multiple ingredient sets, multiple result groups, and routing controls
5. **Property Calculation Macros**
   - Enables selecting macros for result property calculation
6. **Crafting Checks**
   - Enables system-level check macro configuration
   - Config: check mode and outcome list
7. **Outcome Routing**
   - Enables mapping check outcomes to recipe result groups
   - Only meaningful when `Crafting Checks` and `Complex Recipes` are enabled

## Items Tab

- Drag/drop world or compendium items into managed item library
- Item cards support editing:
  - Name/image/source UUID
  - Tags (if `Item Tags` feature enabled)
  - Essences by configured definition (if `Essences` feature enabled)
- Search/sort/filter by item name and tags

## Recipe List (Recipes Tab)

- Shows recipes scoped to selected crafting system
- Columns/actions adapt to enabled features (e.g., category shown only if enabled)

## Recipe Editor

### Rendering Rules

- UI must not show controls, helper text, or descriptions for disabled features.
- Feature gating is driven by selected crafting system config.

### Base (always shown)

- Name, description, enabled state
- Managed-item ingredient rows
- Managed-item catalyst rows
- One default result group with at least one result

### When `Complex Recipes` is disabled

- Editor is constrained to:
  - first ingredient set only
  - first result group only
- Hide all add/remove/navigate controls for extra sets/groups
- Hide outcome-routing controls

### When `Complex Recipes` is enabled

- Show ingredient-set carousel/add/remove controls
- Show result-group carousel/add/remove controls

### When `Essences` is enabled

- Show ingredient-set essence requirements UI
- Show essence pickers by configured definition (name + description)
- Use optional associated managed item metadata in tooltips/previews where available

### When `Property Calculation Macros` is enabled

- Replace property-expression JSON UI with macro selection UI
- Allow selecting macro UUID per result (or shared recipe-level macro if configured later)

### When `Crafting Checks` is enabled

- Show system-level check macro settings in admin
- In recipe editor, show outcome visibility/routing controls only if `Outcome Routing` is also enabled

### Ingredient Matching Constraint

- Ingredients and catalysts are managed-item based only.
- Tag/tier ingredient matching UI is removed.

## Crafting App (Player)

- Recipe availability computed from managed-item matching and optional essences
- "Raw essence" items contribute based on their configured essence quantities
- If crafting checks are enabled, check outcome influences pass/fail and optional routed result group
- If effect transfer is enabled, essence-associated item effects are eligible for transfer to results
- Players receive clear messaging for:
  - missing requirements
  - check failure/outcome
  - crafted result summary

## Data Storage

- Crafting systems: `fabricate-v2.craftingSystems`
- Recipes: `fabricate-v2.recipes`
- User prefs: `fabricate-v2.lastCraftingActor`, `fabricate-v2.lastComponentSources`, `fabricate-v2.lastManagedCraftingSystem`

## Compatibility

- Foundry v13+ (ApplicationV2)
- No pre-release backward-compatibility requirements for saved data shape

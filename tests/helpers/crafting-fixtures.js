// Shared fixtures for the player Crafting tab mounted-component tests. Hoisted so
// the recipe/craftability/store shapes are defined once rather than duplicated
// across each crafting test file (the SonarCloud new-code duplication gate counts
// duplicated fixture lines exactly like production code).

export function craftability(overrides = {}) {
  return {
    canCraft: true,
    ingredientStates: [
      {
        componentId: 'c-water',
        name: 'Spring Water',
        img: 'icons/consumables/potions/potion-tube-blue.webp',
        description: '2x Spring Water',
        need: 2,
        have: 2,
        satisfied: true
      }
    ],
    essenceStates: [],
    toolStates: [],
    missing: [],
    ...overrides
  };
}

export function recipe(overrides = {}) {
  const setId = overrides.defaultSetId ?? 'set-a';
  return {
    id: 'recipe-1',
    name: 'Healing Potion',
    img: 'icons/consumables/potions/potion-tube-red.webp',
    systemId: 'system-1',
    systemName: 'Alchemy',
    category: 'general',
    categoryLabel: 'General',
    modeToken: 'simple',
    modeLabel: 'Simple',
    redaction: { redacted: false, hiddenFields: [] },
    flavor: 'A restorative brew.',
    browseStatus: 'available',
    blockingReasons: [],
    ingredientSets: [{ id: setId, label: 'Option A', craftability: craftability(), products: [] }],
    defaultSetId: setId,
    check: null,
    outcomeTiers: null,
    result: { items: [{ name: 'Healing Potion', img: null, qty: 1 }], time: null, timeLabel: null, xp: null },
    ...overrides
  };
}

export function listing(recipes, overrides = {}) {
  return {
    selectedActorId: 'Actor.actor-1',
    actor: { id: 'actor-1', name: 'Aria' },
    componentSourceIds: ['actor-1'],
    worldTime: 0,
    recipes,
    counts: { available: recipes.length, total: recipes.length },
    ...overrides
  };
}

// A minimal fake of the craftingStore API surface (plain getters + no-op actions)
// for mounting CraftingView in a chosen state without compiling the runes store.
export function fakeCraftingStore(overrides = {}) {
  const recipes = overrides.recipes ?? [];
  const selected = recipes[0] ?? null;
  const loadedOnce = overrides.loadedOnce ?? true;
  return {
    listing: overrides.listing ?? (loadedOnce ? listing(recipes) : null),
    loading: false,
    error: null,
    loadedOnce,
    selectedRecipeId: selected?.id ?? null,
    search: '',
    page: 0,
    pageSize: 12,
    pageCount: 1,
    selectedIngredientSetId: null,
    shoppingEntries: [],
    craftInFlight: false,
    lastRollResult: {},
    recents: [],
    worldTimeTick: 0,
    favouriteIds: overrides.favouriteIds ?? [],
    favouritesOnly: overrides.favouritesOnly ?? false,
    craftableOnly: overrides.craftableOnly ?? false,
    systemFilter: overrides.systemFilter ?? null,
    availableSystems: overrides.availableSystems ?? [],
    categoryFilter: overrides.categoryFilter ?? null,
    availableCategories: overrides.availableCategories ?? [],
    visibleRecipes: recipes,
    pageItems: recipes,
    selectedRecipe: selected,
    selectedSet: selected?.ingredientSets?.[0] ?? null,
    selectedCraftability: selected?.ingredientSets?.[0]?.craftability ?? null,
    shoppingAggregate: { ingredients: [], essences: [], tools: [], allSatisfied: true, totalRecipes: 0, totalQuantity: 0 },
    load() {},
    select() {},
    setSearch() {},
    setFavouritesOnly() {},
    setCraftableOnly() {},
    setSystemFilter() {},
    setCategoryFilter() {},
    toggleFavourite() {},
    setPage() {},
    setPageSize() {},
    chooseIngredientSet() {},
    addToShoppingList() {},
    removeFromShoppingList() {},
    clearShoppingList() {},
    craft() {},
    tickWorldTime() {},
    markRecent() {},
    ...overrides
  };
}

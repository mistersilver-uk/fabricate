// Shared fixtures for the player Crafting tab mounted-component tests. Hoisted so
// the recipe/craftability/store shapes are defined once rather than duplicated
// across each crafting test file (the SonarCloud new-code duplication gate counts
// duplicated fixture lines exactly like production code).

import { buildRequirementSlots, resolveOpenSlotId } from '../../src/ui/svelte/util/requirementSlots.js';

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

// ── Issue 917: essence pool / requirement rail fixtures ─────────────────────
//
// The pool is the read-side projection of the resolved essence block: what each
// requirement needs and was DELIVERED (an essence amount), what each carrier holds
// and contributes (item units), and the allocation tying the two together. The two
// units are deliberately distinct — `delivered`/`owned` on a requirement are essence
// amounts, `allocatedUnits`/`ownedUnits` on a carrier are item units — so a fixture
// that conflates them would hide exactly the defect these surfaces exist to remove.

export function essencePool(overrides = {}) {
  return {
    scopeKey: 'set-a',
    requirements: [
      {
        groupId: 'g-radiant',
        essenceId: 'radiant',
        name: 'Radiant',
        icon: 'fas fa-sun',
        colorToken: 'butter',
        need: 4,
        delivered: 2,
        owned: 6,
        satisfied: false
      }
    ],
    carriers: [
      {
        itemKey: 'Item.dusk-1',
        componentId: 'c-duskcrystal',
        name: 'Duskcrystal',
        img: 'icons/commodities/gems/gem-faceted-navette-purple.webp',
        ownedUnits: 3,
        allocatedUnits: 1,
        perUnit: { radiant: 2 }
      }
    ],
    allocation: { 'Item.dusk-1': 1 },
    totals: { radiant: 2 },
    suggested: { 'Item.dusk-1': 2 },
    ...overrides
  };
}

/** A set with ONE essence requirement, partly delivered from a single carrier. */
export function essenceCraftability(overrides = {}) {
  return craftability({
    canCraft: false,
    ingredientStates: [
      {
        groupId: 'g-radiant',
        componentId: null,
        name: 'Radiant',
        img: null,
        isEssence: true,
        icon: 'fas fa-sun',
        colorToken: 'butter',
        description: '4x Radiant essence',
        need: 4,
        delivered: 2,
        owned: 6,
        satisfied: false
      }
    ],
    essencePool: essencePool(),
    ...overrides
  });
}

/**
 * The D-ESS proof fixture: TWO essence requirements funded from one shared pool of
 * DUAL carriers (each unit credits both essences). One requirement is met and one is
 * short, which is the state the `-essence-pool-shared` evidence frame captures.
 */
export function sharedEssenceCraftability(overrides = {}) {
  const requirements = [
    {
      groupId: 'g-radiant',
      essenceId: 'radiant',
      name: 'Radiant',
      icon: 'fas fa-sun',
      colorToken: 'butter',
      need: 2,
      delivered: 2,
      owned: 4,
      satisfied: true
    },
    {
      groupId: 'g-shadow',
      essenceId: 'shadow',
      name: 'Shadow',
      icon: 'fas fa-moon',
      colorToken: 'lavender',
      need: 3,
      delivered: 1,
      owned: 2,
      satisfied: false
    }
  ];
  return craftability({
    canCraft: false,
    ingredientStates: requirements.map((requirement) => ({
      groupId: requirement.groupId,
      componentId: null,
      name: requirement.name,
      img: null,
      isEssence: true,
      icon: requirement.icon,
      colorToken: requirement.colorToken,
      description: `${requirement.need}x ${requirement.name} essence`,
      need: requirement.need,
      delivered: requirement.delivered,
      owned: requirement.owned,
      satisfied: requirement.satisfied
    })),
    essencePool: essencePool({
      requirements,
      carriers: [
        {
          itemKey: 'Item.dusk-1',
          componentId: 'c-duskcrystal',
          name: 'Duskcrystal',
          img: 'icons/commodities/gems/gem-faceted-navette-purple.webp',
          ownedUnits: 3,
          allocatedUnits: 1,
          perUnit: { radiant: 2, shadow: 1 }
        },
        {
          itemKey: 'Item.prism-1',
          componentId: 'c-prismash',
          name: 'Prism Ash',
          img: 'icons/commodities/materials/powder-pink.webp',
          ownedUnits: 2,
          allocatedUnits: 0,
          perUnit: { radiant: 1, ember: 1 }
        }
      ],
      allocation: { 'Item.dusk-1': 1 },
      totals: { radiant: 2, shadow: 1 },
      suggested: { 'Item.dusk-1': 2, 'Item.prism-1': 1 }
    }),
    ...overrides
  });
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
    // Multi-step run position (issue 917). Equal ids (both null here) mean the step
    // being displayed IS the step the engine would execute, so the rail is
    // interactive — which is the single-step case and today's default.
    activeStepIndex: 0,
    activeStepId: null,
    displayedStepId: null,
    activeStepTimeGateArmed: false,
    check: null,
    outcomeTiers: null,
    duration: null,
    result: { items: [{ name: 'Healing Potion', img: null, qty: 1 }], timeLabel: null, xp: null },
    ...overrides
  };
}

// An explicit multi-step (`simple`-mode) recipe model as the CraftingListingBuilder
// projects it (issue 765): a populated `steps[]` per-step requirement projection, the
// first step's sets on `ingredientSets`, a terminal PRODUCES `result`, and no check
// card. Steps carry INPUTS-only craftability; the emphasized product is `result`.
export function multiStepRecipe(overrides = {}) {
  const stepOne = {
    id: 'step-1',
    label: 'Cut',
    duration: { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
    ingredientSets: [
      {
        id: 'set-1',
        label: 'Option A',
        craftability: craftability({
          ingredientStates: [
            {
              componentId: 'c-leather',
              name: 'Rough Leather Scraps',
              img: 'icons/commodities/leather/leather-scraps-tan.webp',
              description: '5x Rough Leather Scraps',
              need: 5,
              have: 5,
              satisfied: true
            },
            {
              componentId: 'c-cloth',
              name: 'Cloth Scrap',
              img: 'icons/commodities/cloth/cloth-bolt-grey.webp',
              description: '15x Cloth Scrap',
              need: 15,
              have: 15,
              satisfied: true
            }
          ]
        }),
        products: []
      }
    ],
    products: []
  };
  const stepTwo = {
    id: 'step-2',
    label: 'Raise',
    duration: { minutes: 0, hours: 1, days: 0, months: 0, years: 0 },
    ingredientSets: [
      {
        id: 'set-2',
        label: 'Option A',
        craftability: craftability({
          ingredientStates: [
            {
              componentId: 'c-lumber',
              name: 'Lumber',
              img: 'icons/commodities/wood/lumber-stack.webp',
              description: '1x Lumber',
              need: 1,
              have: 1,
              satisfied: true
            }
          ]
        }),
        products: []
      }
    ],
    products: []
  };
  return recipe({
    id: 'recipe-tent',
    name: 'Tent',
    modeToken: 'simple',
    modeLabel: 'Simple',
    check: null,
    ingredientSets: stepOne.ingredientSets,
    defaultSetId: 'set-1',
    steps: [stepOne, stepTwo],
    duration: { minutes: 30, hours: 1, days: 0, months: 0, years: 0 },
    result: {
      items: [{ name: 'Tent', img: 'icons/environment/settlement/tent.webp', qty: 1 }],
      timeLabel: null,
      xp: null
    },
    ...overrides
  });
}

/**
 * A two-step recipe whose FIRST step carries the shared essence block. Step 1 is the
 * step the engine would execute (so its rail is interactive); step 2 is a plain
 * component step and must render read-only preview whatever the store holds.
 */
export function steppedEssenceRecipe(overrides = {}) {
  const stepOne = {
    id: 'step-ess-1',
    label: 'Infuse',
    duration: null,
    ingredientSets: [
      { id: 'set-ess-1', label: 'Option A', craftability: sharedEssenceCraftability(), products: [] }
    ],
    products: []
  };
  const stepTwo = {
    id: 'step-ess-2',
    label: 'Temper',
    duration: null,
    ingredientSets: [
      { id: 'set-ess-2', label: 'Option A', craftability: essenceCraftability(), products: [] }
    ],
    products: []
  };
  return recipe({
    id: 'recipe-sunblade',
    name: 'Sunblade',
    modeToken: 'simple',
    modeLabel: 'Simple',
    ingredientSets: stepOne.ingredientSets,
    defaultSetId: 'set-ess-1',
    steps: [stepOne, stepTwo],
    activeStepIndex: 0,
    activeStepId: 'step-ess-1',
    displayedStepId: 'step-ess-1',
    activeStepTimeGateArmed: false,
    ...overrides
  });
}

// Since issue 1075 the listing carries cheap SUMMARY rows and the rich model is hydrated
// per selected recipe. These fixtures are rich models, so one object serves as both facets.
export function listing(recipes, overrides = {}) {
  return {
    selectedActorId: 'Actor.actor-1',
    actor: { id: 'actor-1', name: 'Aria' },
    componentSourceIds: ['actor-1'],
    worldTime: 0,
    summaries: recipes,
    total: recipes.length,
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
  const selectedCraftability =
    overrides.selectedCraftability ?? selected?.ingredientSets?.[0]?.craftability ?? null;
  const scopeKey = selected?.ingredientSets?.[0]?.id ?? null;
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
    selectedIngredientOptions: {},
    shoppingEntries: [],
    craftInFlight: false,
    lastRollResult: {},
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
    // The hydrated rich model and the ROW it was hydrated from (issue 1075). The fake
    // serves the same object for both, which is what the real store does once hydration
    // has answered; `selectedSummary` is what the browser list highlights.
    selectedSummary: selected,
    selectedRecipe: selected,
    selectedSet: selected?.ingredientSets?.[0] ?? null,
    selectedCraftability,
    // Issue 917 rail state. `openSlotId` is resolved through the SAME helper the real
    // store uses, so the fake auto-advances to the first unsatisfied slot exactly as
    // the store does — a hard-coded null would make every mounted CraftingView test
    // pass against a rail that never opens anything.
    selectedEssenceAllocation: {},
    essenceScopeKey: scopeKey,
    railSlots: buildRequirementSlots(selectedCraftability),
    openSlotId: resolveOpenSlotId({
      slots: buildRequirementSlots(selectedCraftability),
      scopeKey,
      rememberedKey: null
    }),
    slotAnnouncement: '',
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
    chooseIngredientOption() {},
    openSlot() {},
    setEssenceAllocation() {},
    pickForMe() {},
    addToShoppingList() {},
    removeFromShoppingList() {},
    clearShoppingList() {},
    craft() {},
    tickWorldTime() {},
    ...overrides
  };
}

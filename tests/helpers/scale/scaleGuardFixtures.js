/** Parameterised fixtures for the deterministic scale guards (issue 1072). */

/** Deterministic, no RNG: a guard that cannot reproduce its own counts is not a guard. */
const COMPONENT_TAGS = ['metal', 'herb', 'reagent'];

/**
 * @param {number} count
 * @returns {Array<{id: string, name: string, tags: string[]}>}
 */
export function makeComponentLibrary(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `c-${index}`,
    name: `Component ${index}`,
    img: 'icons/svg/item-bag.svg',
    tags: [COMPONENT_TAGS[index % COMPONENT_TAGS.length]],
  }));
}

/**
 * @param {object} [options]
 * @param {string} [options.id]
 * @param {number} [options.componentCount]
 * @param {string} [options.resolutionMode]
 * @returns {object}
 */
export function makeCraftingSystem({
  id = 'sys-scale',
  componentCount = 8,
  resolutionMode = 'simple',
} = {}) {
  return {
    id,
    name: 'Scale System',
    resolutionMode,
    features: { essences: false },
    craftingCheck: { simple: { rollFormula: '1d20', dc: 15 }, routed: {}, progressive: {} },
    recipeVisibility: { knowledge: { learn: { consumeOnLearn: true } } },
    components: makeComponentLibrary(componentCount),
    tools: [],
    essenceDefinitions: [],
    itemTags: [...COMPONENT_TAGS],
  };
}

/**
 * A system-manager collaborator implementing the full `{getSystem, getRecipesForSystem,
 * getComponentsForSystem}` contract, so a probe can wrap it the same way it wraps the real
 * `CraftingSystemManager`.
 */
export function makeSystemManager(system, getRecipes = () => []) {
  return {
    getSystem: (id) => (id === system.id ? system : null),
    getSystems: () => [system],
    getRecipesForSystem: (id) => (id === system.id ? getRecipes() : []),
    getComponentsForSystem: (id) => (id === system.id ? system.components : []),
    getRecipeItemDefinition: () => null,
  };
}

/**
 * A recipe in the shape the player listing builder projects: one component ingredient per set, plus
 * the `getExecutionSteps()` the builder reads its first step from.
 */
export function makeListingRecipe({
  id,
  systemId = 'sys-scale',
  setCount = 1,
  componentId = 'c-0',
  enabled = true,
} = {}) {
  const ingredientSets = Array.from({ length: setCount }, (_, index) => ({
    id: `${id}-set-${index}`,
    name: `Set ${index}`,
    ingredientGroups: [
      {
        id: `${id}-g-${index}`,
        options: [{ match: { type: 'component', componentId }, quantity: 1 }],
      },
    ],
  }));
  const resultGroups = [
    { id: `${id}-rg`, name: 'Default', checkOutcomeIds: [], results: [{ componentId, quantity: 1 }] },
  ];
  return {
    id,
    name: `Recipe ${id}`,
    img: 'icons/svg/item-bag.svg',
    craftingSystemId: systemId,
    description: '',
    enabled,
    recipeItemId: null,
    linkedRecipeItemUuid: null,
    ingredientSets,
    resultGroups,
    getExecutionSteps() {
      return [{ id: `${id}-step`, name: 'Step', ingredientSets, resultGroups }];
    },
  };
}

/**
 * A recipe whose single ingredient set names one component — the minimal shape `SignatureValidator`
 * expands (issue 1081).
 *
 * @param {string[]} [options.tagPlaceholders] tag names a second, tag-matching set accepts.
 */
export function makeSignatureRecipe({ id, componentId, enabled = true, tagPlaceholders = [] }) {
  const ingredientSets = [
    {
      id: `${id}-set`,
      name: 'Set',
      ingredientGroups: [
        {
          id: `${id}-group`,
          options: [{ match: { type: 'component', componentId }, quantity: 1 }],
        },
      ],
    },
  ];
  if (tagPlaceholders.length > 0) {
    ingredientSets.push({
      id: `${id}-tag-set`,
      name: 'Tag set',
      ingredientGroups: [
        {
          id: `${id}-tag-group`,
          options: [{ match: { type: 'tags', tags: [...tagPlaceholders] }, quantity: 1 }],
        },
      ],
    });
  }
  return {
    id,
    name: `Recipe ${id}`,
    enabled,
    craftingSystemId: 'sys-scale',
    // A populated result group is required for ACTIVATION validation, which is the public route
    // into the signature gate.
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ingredientSets,
  };
}

/** The source uuid of book `index` in a book-gated fixture. */
export function scaleBookUuid(index) {
  return `Compendium.fabricate-scale.books.Item.book-${index}`;
}

/**
 * A BOOK-GATED system: `bookCount` authored recipe-item definitions with membership resolved the
 * modern way (issue 511's `recipeIds[]`), in a caller-chosen resolution and visibility mode.
 *
 * @param {number} options.recipeCount How many recipes the books between them contain.
 */
export function makeBookGatedSystem({
  recipeCount,
  bookCount = 2,
  componentCount = 8,
  resolutionMode = 'alchemy',
  visibilityMode = 'item',
}) {
  const system = makeCraftingSystem({ componentCount, resolutionMode });
  return {
    ...system,
    visibilityMode,
    alchemy: { enabled: true, learnOnCraft: false, checkMode: 'none' },
    membershipResolvesByRecipeIds: true,
    recipeItemDefinitions: Array.from({ length: bookCount }, (_unused, bookIndex) => ({
      id: `book-${bookIndex}`,
      name: `Scale Tome ${bookIndex}`,
      originItemUuid: scaleBookUuid(bookIndex),
      aliasItemUuids: [],
      caps: {},
      recipeIds: Array.from({ length: recipeCount }, (_ignored, recipeIndex) => `r-${recipeIndex}`)
        .filter((_id, recipeIndex) => recipeIndex % bookCount === bookIndex),
    })),
  };
}

/**
 * An actor holding `itemCount` stacks that resolve to nothing, PLUS one document per uuid in
 * `bookUuids`.
 */
export function makeBookHoldingActor({ id = 'actor-scale', itemCount = 10, bookUuids = [] } = {}) {
  const actor = makeActor({ id, itemCount });
  return {
    ...actor,
    items: [
      ...actor.items,
      ...bookUuids.map((uuid, index) => ({
        id: `book-item-${index}`,
        uuid,
        name: `Scale Tome ${index}`,
        img: 'icons/svg/book.svg',
        type: 'loot',
        flags: {},
        system: { quantity: 1 },
      })),
    ],
  };
}

/** A recipe belonging to one of {@link makeBookGatedSystem}'s books. */
export function makeBookGatedRecipe({ index, systemId = 'sys-scale', componentCount = 8 }) {
  const recipe = makeListingRecipe({
    id: `r-${index}`,
    systemId,
    componentId: `c-${index % componentCount}`,
  });
  // No `linkedRecipeItemUuid`: membership is the modern `recipeIds[]` basis, so the legacy
  // synthetic-definition leg stays out of what these guards measure.
  return { ...recipe, recipeItemId: null };
}

/** An actor holding `itemCount` stacks that resolve to NO managed component. */
export function makeActor({ id = 'actor-scale', itemCount = 10 } = {}) {
  return {
    id,
    name: 'Scale Actor',
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index}`,
      uuid: `Actor.${id}.Item.item-${index}`,
      name: `Mundane Gear ${index}`,
      img: 'icons/svg/item-bag.svg',
      type: 'loot',
      flags: {},
      system: { quantity: 1 },
    })),
  };
}

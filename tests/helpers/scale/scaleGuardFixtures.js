/**
 * Parameterised fixtures for the deterministic scale guards (issue 1072).
 *
 * Every factory takes its scale as an argument, because the guards work by measuring the
 * SAME operation at two sizes of ONE axis and comparing. The parent epic is explicit that
 * the dangerous terms are products (`items × components`, `recipes × items`), so a fixture
 * that grew both axes together could not attribute a regression to either — and a fixture
 * that grew neither would measure nothing at all.
 *
 * These are deliberately NOT the issue-1071 benchmark profiles. Those exist to produce
 * committed baseline envelopes at realistic corpus sizes; these exist to make one counter
 * move by a known factor as fast as possible, because this suite runs inside the ordinary
 * `npm test` and owes the whole programme a sub-30-second budget. Sensitivity here comes
 * from the ratio between two runs, not from size.
 */

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
 * A system-manager collaborator implementing the full
 * `{getSystem, getRecipesForSystem, getComponentsForSystem}` contract, so a probe can wrap
 * it the same way it wraps the real `CraftingSystemManager`.
 *
 * @param {object} system
 * @param {() => object[]} getRecipes
 * @returns {object}
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
 * A recipe in the shape the player listing builder projects: one component ingredient per
 * set, plus the `getExecutionSteps()` the builder reads its first step from.
 *
 * @param {object} options
 * @returns {object}
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
 * A recipe whose single ingredient set names one component — the minimal shape
 * `SignatureValidator` expands. Distinct `componentId`s never collide, so a fixture built
 * from distinct ids measures the FULL pairwise scan without any early exit shortening it.
 *
 * `tagPlaceholders` adds a SECOND ingredient set matching on tags rather than on a
 * component, and it is opt-in for a reason (issue 1081). Every recipe here matched only on
 * `{type: 'component'}`, so a cohort built from this factory contains no tag placeholder
 * anywhere — and a guard comparing a pre-counted tag map against a walked one was therefore
 * comparing two EMPTY maps and would have agreed however wrong either side was. Callers that
 * assert on tag placeholder counts pass this; the signature-collision guards, which measure
 * the component-matching scan, deliberately do not.
 *
 * @param {object} options
 * @param {string[]} [options.tagPlaceholders] tag names a second, tag-matching set accepts.
 * @returns {object}
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
    // A populated result group is required for ACTIVATION validation, which is the public
    // route into the signature gate. Without it the recipe is refused as incomplete and a
    // collision assertion would pass on the wrong error.
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
 * A book-gated ALCHEMY system: `item` visibility mode, `bookCount` authored recipe-item
 * definitions, and membership resolved the modern way (issue 511's `recipeIds[]`).
 *
 * `item` mode is the only alchemy mode that consults held inventory at all — `global` and
 * `knowledge` both answer reveal from the actor's `learnedRecipes` flag and never reach the
 * candidate walk. A fixture in any other mode measures nothing on the path issue 1228 fixes,
 * which is exactly why the committed `alchemy-signatures` profile could not see the defect.
 *
 * @param {object} options
 * @param {number} options.recipeCount How many recipes the books between them contain.
 * @param {number} [options.bookCount]
 * @param {number} [options.componentCount]
 * @returns {object}
 */
export function makeBookGatedAlchemySystem({ recipeCount, bookCount = 2, componentCount = 8 }) {
  const system = makeCraftingSystem({ componentCount, resolutionMode: 'alchemy' });
  return {
    ...system,
    visibilityMode: 'item',
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
 *
 * The mundane majority is the axis the visibility guards scale. A book count held constant
 * while the mundane count quadruples is what turns "the matcher is offered the books" into a
 * falsifiable equality: without the per-pass snapshot the offer count follows `itemCount`, and
 * with a snapshot built from the wrong collaborator set it follows it too — while the
 * inventory-READ counters stay perfectly flat in the second case.
 *
 * @param {object} [options]
 * @returns {{id: string, name: string, items: object[]}}
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

/**
 * An alchemy recipe belonging to one of {@link makeBookGatedAlchemySystem}'s books.
 *
 * @param {object} options
 * @returns {object}
 */
export function makeBookGatedAlchemyRecipe({ index, systemId = 'sys-scale', componentCount = 8 }) {
  const recipe = makeListingRecipe({
    id: `r-${index}`,
    systemId,
    componentId: `c-${index % componentCount}`,
  });
  // No `linkedRecipeItemUuid`: membership is the modern `recipeIds[]` basis, so the legacy
  // synthetic-definition leg stays out of what these guards measure.
  return { ...recipe, recipeItemId: null };
}

/**
 * An actor holding `itemCount` stacks that resolve to NO managed component.
 *
 * That composition is the point, not a convenience. The field report behind this programme
 * was a character carrying hundreds of ordinary items, and an item matching nothing is the
 * EXPENSIVE case: it falls through both durable identity tiers and pays a full linear scan
 * of the component library before returning null. A fixture of neatly-matching items would
 * exercise the cheap early-exit path and measure the wrong branch.
 *
 * It is also load bearing for the `items x components` guard in
 * `tests/scale-regression-guards.test.js`. A resolved item costs one `candidatesExamined` bump
 * on the index HIT, so making this actor hold a PROPORTION of matching stacks — the obvious
 * "make the fixture more realistic" edit — makes that guard's library-examination count grow
 * with the item count and turns it red against entirely correct `O(1)` index lookups, under a
 * message blaming the `items x components` product term. A CONSTANT number of matching stacks
 * would be safe (the same fixed cost at every item count); a proportional one is not. Change
 * the guard and this fixture together, or not at all.
 *
 * @param {object} [options]
 * @returns {{id: string, name: string, items: object[]}}
 */
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

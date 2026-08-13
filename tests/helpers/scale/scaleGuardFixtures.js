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
 * @param {object} options
 * @returns {object}
 */
export function makeSignatureRecipe({ id, componentId, enabled = true }) {
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
    ingredientSets: [
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
    ],
  };
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

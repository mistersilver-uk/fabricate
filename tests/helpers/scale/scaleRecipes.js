/**
 * Synthetic recipe corpora for the scale profiles (issue 1071).
 *
 * Everything here emits PLAIN recipe payloads — the wire shape that comes out of the
 * `recipes` world setting — never `Recipe` instances. That split is deliberate and issue 1071
 * names it as a decision that must be stated rather than left implicit:
 *
 * - Profiles measuring ALGORITHMIC behaviour (filtering, browser models, graph construction,
 *   signature validation) consume these payloads directly. They are roughly an order of
 *   magnitude cheaper to build than hydrated models and exercise no normalisation, which is
 *   the point: the number should be the algorithm's, not the constructor's.
 * - Profiles measuring SERIALIZATION or RECONSTRUCTION (`RecipeManager.save()`,
 *   `CraftingSystemManager.save()`, corpus reload) hydrate these same payloads through
 *   `Recipe.fromJSON` first, so what is timed is the real round trip.
 *
 * Mixing the two silently makes numbers incomparable, so `scaleProfiles.js` records which
 * construction each profile used and the baseline carries it.
 *
 * IDS ARE ALWAYS EXPLICIT. `Recipe` and `IngredientSet` both fall back to
 * `foundry.utils.randomID()` for a missing id, which would make a corpus depend on the global
 * id counter's position — i.e. on what else ran first in the process — rather than on
 * `{profile, seed}` alone. Every id below is derived from its index.
 */
import { SCALE_CATEGORIES, SCALE_ESSENCES, SCALE_TAGS } from './scaleComponents.js';
import { intBetween, pickOne } from './scaleRandom.js';

/**
 * A recipe-item (book) source uuid. The knowledge profile's gate resolves owned book items
 * against these, so the generator and the inventory generator share one format.
 *
 * @param {string} systemId
 * @param {number} index
 * @returns {string}
 */
export function recipeItemSourceUuid(systemId, index) {
  return `Compendium.fabricate-bench.books.Item.${systemId}-book-${index}`;
}

function resultGroup(recipeId, components, random) {
  const produced = pickOne(random, components);
  return {
    id: `${recipeId}-rg0`,
    name: 'Output',
    checkOutcomeIds: [],
    results: [{ componentId: produced.id, quantity: intBetween(random, 1, 3) }],
  };
}

/**
 * A SIMPLE recipe: one ingredient set, one group, one component option, one result.
 *
 * This is the shape that dominates a real library and the one the 10,000-recipe corpus is
 * built from.
 *
 * @param {object} options
 * @param {number} options.index
 * @param {string} options.systemId
 * @param {object[]} options.components
 * @param {() => number} options.random
 * @returns {object}
 */
export function simpleRecipePayload({ index, systemId, components, random }) {
  const id = `${systemId}-r-${index}`;
  const consumed = components[index % components.length];
  return {
    id,
    name: `Bench Recipe ${index}`,
    description: `Bench recipe ${index} for the deterministic performance corpus.`,
    img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
    category: SCALE_CATEGORIES[index % SCALE_CATEGORIES.length],
    craftingSystemId: systemId,
    enabled: true,
    tags: [SCALE_TAGS[index % SCALE_TAGS.length]],
    // Pinned so the corpus does not depend on the wall clock; `Recipe`'s constructor
    // defaults `metadata` from `Date.now()` and `game.user.name` when it is absent.
    metadata: { created: 0, modified: 0, author: 'benchmark', version: '1.0.0' },
    ingredientSets: [
      {
        id: `${id}-s0`,
        name: 'Set 1',
        ingredientGroups: [
          {
            id: `${id}-s0-g0`,
            name: 'Base material',
            options: [
              {
                quantity: intBetween(random, 1, 3),
                match: { type: 'component', componentId: consumed.id },
              },
            ],
          },
        ],
      },
    ],
    resultGroups: [resultGroup(id, components, random)],
  };
}

/**
 * A RICH recipe: several alternative ingredient sets, multi-option groups mixing component,
 * tag and essence matches, set-level essence requirements, and library tool references.
 *
 * This is the adversarial-but-supported shape. Each extra option multiplies the ingredient
 * solver's branching and each extra set multiplies `evaluateCraftability`'s outer loop, so it
 * is the profile that exercises `IngredientSet.resolveIngredientSelection` for real.
 *
 * @param {object} options
 * @param {number} options.index
 * @param {string} options.systemId
 * @param {object[]} options.components
 * @param {object[]} options.tools
 * @param {() => number} options.random
 * @param {number} [options.setCount]
 * @param {number} [options.groupsPerSet]
 * @param {number} [options.optionsPerGroup]
 * @returns {object}
 */
export function richRecipePayload({
  index,
  systemId,
  components,
  tools,
  random,
  setCount = 3,
  groupsPerSet = 3,
  optionsPerGroup = 3,
}) {
  const base = simpleRecipePayload({ index, systemId, components, random });
  const id = base.id;
  const ingredientSets = [];
  for (let setIndex = 0; setIndex < setCount; setIndex++) {
    const groups = [];
    for (let groupIndex = 0; groupIndex < groupsPerSet; groupIndex++) {
      const options = [];
      for (let optionIndex = 0; optionIndex < optionsPerGroup; optionIndex++) {
        const kind = (setIndex + groupIndex + optionIndex) % 3;
        const candidate = components[(index + setIndex * 7 + optionIndex * 13) % components.length];
        if (kind === 0) {
          options.push({
            quantity: intBetween(random, 1, 2),
            match: { type: 'component', componentId: candidate.id },
          });
        } else if (kind === 1) {
          options.push({
            quantity: 1,
            match: {
              type: 'tags',
              tags: [SCALE_TAGS[(index + optionIndex) % SCALE_TAGS.length]],
              tagMatch: 'any',
            },
          });
        } else {
          options.push({
            quantity: 1,
            match: {
              type: 'essence',
              essenceId: SCALE_ESSENCES[(index + groupIndex) % SCALE_ESSENCES.length],
              amount: intBetween(random, 1, 2),
            },
          });
        }
      }
      groups.push({
        id: `${id}-s${setIndex}-g${groupIndex}`,
        name: `Group ${groupIndex + 1}`,
        options,
      });
    }
    ingredientSets.push({
      id: `${id}-s${setIndex}`,
      name: `Set ${setIndex + 1}`,
      ingredientGroups: groups,
      toolIds: tools.length > 0 ? [tools[(index + setIndex) % tools.length].id] : [],
    });
  }
  return {
    ...base,
    complex: true,
    ingredientSets,
    toolIds: tools.length > 0 ? [tools[index % tools.length].id] : [],
  };
}

/**
 * A KNOWLEDGE-gated recipe: a simple recipe that additionally carries a recipe-item (book)
 * reference, so the visibility service's book resolution runs for real.
 *
 * @param {object} options
 * @param {number} options.index
 * @param {string} options.systemId
 * @param {object[]} options.components
 * @param {() => number} options.random
 * @param {number} options.bookCount How many distinct books the corpus spreads across.
 * @returns {object}
 */
export function knowledgeRecipePayload({ index, systemId, components, random, bookCount }) {
  const base = simpleRecipePayload({ index, systemId, components, random });
  return {
    ...base,
    recipeItemId: `${systemId}-book-${index % bookCount}`,
    linkedRecipeItemUuid: recipeItemSourceUuid(systemId, index % bookCount),
  };
}

/**
 * An ALCHEMY recipe whose ingredient sets are built to produce a CONTROLLED collision
 * distribution under `SignatureValidator`.
 *
 * `collisionRatio` of the corpus draws its group components from a small shared pool, so
 * those recipes' signatures genuinely overlap and the validator's conflict list is non-empty;
 * the rest draw from disjoint index windows and never collide. A corpus with no collisions at
 * all would let a "fixed" validator return early and look free.
 *
 * @param {object} options
 * @param {number} options.index
 * @param {string} options.systemId
 * @param {object[]} options.components
 * @param {() => number} options.random
 * @param {number} options.collidingCount Recipes below this index share the collision pool.
 * @param {number} [options.poolSize]
 * @returns {object}
 */
export function alchemyRecipePayload({
  index,
  systemId,
  components,
  random,
  collidingCount,
  poolSize = 8,
}) {
  const id = `${systemId}-r-${index}`;
  const colliding = index < collidingCount;
  const groupCount = 2;
  const groups = [];
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const componentIndex = colliding
      ? (index + groupIndex) % poolSize
      : (poolSize + index * groupCount + groupIndex) % components.length;
    groups.push({
      id: `${id}-s0-g${groupIndex}`,
      name: `Reagent ${groupIndex + 1}`,
      options: [
        {
          quantity: 1,
          match: { type: 'component', componentId: components[componentIndex].id },
        },
      ],
    });
  }
  return {
    id,
    name: `Bench Signature ${index}`,
    description: '',
    img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
    category: SCALE_CATEGORIES[index % SCALE_CATEGORIES.length],
    craftingSystemId: systemId,
    enabled: true,
    tags: [],
    metadata: { created: 0, modified: 0, author: 'benchmark', version: '1.0.0' },
    ingredientSets: [{ id: `${id}-s0`, name: 'Signature', ingredientGroups: groups }],
    resultGroups: [resultGroup(id, components, random)],
  };
}

/**
 * A recipe corpus wired into a producer/consumer GRAPH of BOUNDED width and depth.
 *
 * Bounding is not tidiness. `buildRecipeGraph` emits one edge per (producer, consumer) pair
 * per shared component, so an unbounded fan-out is quadratic in recipes and the benchmark
 * becomes the pathology it is meant to measure; and `layoutGraph`'s cycle-detection DFS is
 * recursive and unguarded, so an unbounded CHAIN stack-overflows before layout gets slow.
 * `layerCount` caps the depth and `fanOut` caps the width.
 *
 * @param {object} options
 * @param {number} options.count
 * @param {string} options.systemId
 * @param {object[]} options.components
 * @param {() => number} options.random
 * @param {number} options.layerCount Bounded chain depth.
 * @param {number} options.fanOut How many recipes SHARE one produced component — the width
 *   knob. A hub component with `fanOut` producers and `fanOut` consumers yields `fanOut^2`
 *   edges, so total edge count grows as `count * fanOut` and stays predictable.
 * @returns {object[]}
 */
export function buildGraphCorpus({ count, systemId, components, random, layerCount, fanOut }) {
  const recipes = [];
  const perLayer = Math.max(1, Math.ceil(count / layerCount));
  const hubsPerLayer = Math.max(1, Math.ceil(perLayer / fanOut));
  // Hub components are drawn from a dedicated window of the library so a hub id is a pure
  // function of `(layer, hub)` — the producer/consumer wiring, and therefore the edge count,
  // must not depend on how the library happened to be generated.
  const hubComponentId = (layer, hub) =>
    components[(layer * hubsPerLayer + hub) % components.length].id;
  for (let index = 0; index < count; index++) {
    const layer = Math.floor(index / perLayer);
    const positionInLayer = index % perLayer;
    const hub = Math.floor(positionInLayer / fanOut) % hubsPerLayer;
    // Produce this layer's hub output, consume the SAME hub position one layer above.
    // Strictly layer-decreasing, so the graph is acyclic by construction and the depth is
    // exactly `layerCount` — which is what keeps `layoutGraph`'s recursive, unguarded
    // cycle-detection DFS off the stack limit.
    const producedId = hubComponentId(layer, hub);
    const consumedId =
      layer === 0
        ? components[(index * 31 + 1) % components.length].id
        : hubComponentId(layer - 1, hub);
    const id = `${systemId}-r-${index}`;
    recipes.push({
      id,
      name: `Bench Graph Recipe ${index}`,
      img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
      category: SCALE_CATEGORIES[layer % SCALE_CATEGORIES.length],
      craftingSystemId: systemId,
      enabled: true,
      metadata: { created: 0, modified: 0, author: 'benchmark', version: '1.0.0' },
      ingredientSets: [
        {
          id: `${id}-s0`,
          ingredientGroups: [
            {
              id: `${id}-s0-g0`,
              options: [{ quantity: 1, match: { type: 'component', componentId: consumedId } }],
            },
          ],
        },
      ],
      resultGroups: [
        {
          id: `${id}-rg0`,
          checkOutcomeIds: [],
          results: [{ componentId: producedId, quantity: intBetween(random, 1, 2) }],
        },
      ],
    });
  }
  return recipes;
}

/**
 * THE DEPTH AXIS: a strictly linear dependency chain of exactly `count` recipes (issue 1082).
 *
 * {@link buildGraphCorpus} varies WIDTH — fan-out at a bounded depth — and cannot produce this
 * shape. Its hub component ids are drawn modulo the shared component library, so asking it for
 * a 20,000-layer chain over a 2,000-component library wraps every 2,000 layers and yields a
 * broad, cyclic graph rather than a deep one. Depth needs its own generator with its own
 * component id space, and it needs one because depth is where the layout used to CRASH: the
 * cycle-detection DFS was recursive and unguarded, and it threw
 * `RangeError: Maximum call stack size exceeded` at a measured depth of 8,193 — inside the
 * 10,000-recipe corpus this programme supports.
 *
 * Recipe `i` consumes chain component `i - 1` and produces chain component `i`, so the graph
 * has exactly `count` nodes, `count - 1` edges, no cycles, and a deepest layer of `count - 1`.
 * Those four figures are all machine-invariant, which is what lets a baseline assert the depth
 * rather than trust the generator.
 *
 * @param {object} options
 * @param {number} options.count Chain depth, in recipes.
 * @param {string} options.systemId
 * @param {() => number} options.random
 * @returns {object[]}
 */
export function buildGraphChainCorpus({ count, systemId, random }) {
  const recipes = [];
  for (let index = 0; index < count; index++) {
    const id = `${systemId}-chain-${index}`;
    recipes.push({
      id,
      name: `Bench Chain Link ${index}`,
      img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp',
      category: SCALE_CATEGORIES[index % SCALE_CATEGORIES.length],
      craftingSystemId: systemId,
      enabled: true,
      metadata: { created: 0, modified: 0, author: 'benchmark', version: '1.0.0' },
      ingredientSets:
        index === 0
          ? []
          : [
              {
                id: `${id}-s0`,
                ingredientGroups: [
                  {
                    id: `${id}-s0-g0`,
                    options: [
                      {
                        quantity: 1,
                        match: {
                          type: 'component',
                          componentId: `${systemId}-chain-c-${index - 1}`,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
      resultGroups: [
        {
          id: `${id}-rg0`,
          checkOutcomeIds: [],
          results: [
            {
              componentId: `${systemId}-chain-c-${index}`,
              quantity: intBetween(random, 1, 2),
            },
          ],
        },
      ],
    });
  }
  return recipes;
}

/**
 * A corpus of `count` recipes of one shape.
 *
 * @param {object} options
 * @param {'simple'|'rich'|'knowledge'|'alchemy'} options.shape
 * @param {number} options.count
 * @param {string} options.systemId
 * @param {object[]} options.components
 * @param {object[]} [options.tools]
 * @param {() => number} options.random
 * @param {object} [options.shapeOptions]
 * @returns {object[]}
 */
export function buildRecipeCorpus({
  shape,
  count,
  systemId,
  components,
  tools = [],
  random,
  shapeOptions = {},
}) {
  const builders = {
    simple: (index) => simpleRecipePayload({ index, systemId, components, random }),
    rich: (index) => richRecipePayload({ index, systemId, components, tools, random }),
    knowledge: (index) =>
      knowledgeRecipePayload({
        index,
        systemId,
        components,
        random,
        bookCount: shapeOptions.bookCount ?? 8,
      }),
    alchemy: (index) =>
      alchemyRecipePayload({
        index,
        systemId,
        components,
        random,
        collidingCount: shapeOptions.collidingCount ?? Math.floor(count / 10),
      }),
  };
  const build = builders[shape];
  if (!build) throw new Error(`Unknown recipe shape "${shape}"`);
  const recipes = [];
  for (let index = 0; index < count; index++) recipes.push(build(index));
  return recipes;
}

/**
 * The scale-profile registry (issue 1071). `alchemy-signatures` is capped at 2,000 enabled
 * signatures, not 5,000.
 */
import { buildComponentLibrary, buildToolLibrary } from './scaleComponents.js';
import { INVENTORY_SERIES, buildHeldInventory } from './scaleInventory.js';
import { createSeededRandom } from './scaleRandom.js';
import {
  buildGraphChainCorpus,
  buildGraphCorpus,
  buildRecipeCorpus,
  recipeItemSourceUuid,
} from './scaleRecipes.js';

/** The system id every profile builds under. Flag-key safe (no dots). */
export const BENCH_SYSTEM_ID = 'benchsys';

/** The default seed. Every profile is reproducible from `{profile, seed}` alone. */
export const DEFAULT_SEED = 1071;

/**
 * The harness version. Bump it when a generator changes shape in a way that legitimately moves
 * every committed count, so a baseline diff carries the reason with it. 2 — `pickDistinct` became a
 * partial Fisher-Yates instead of bounded rejection sampling.
 */
export const HARNESS_VERSION = 2;

/** A token inventory for the corpus-axis profiles: present, but never the thing being varied. */
const CORPUS_AXIS_STACKS = 20;

/**
 * THE COMPONENT-LIBRARY AXIS (issue 1204): the library sizes `component-library` sweeps. The third
 * axis, and until #1204 the one no committed case varied.
 */
export const COMPONENT_LIBRARY_SERIES = Object.freeze([1000, 5000, 10_000]);

/** Held stacks pinned across the component-library sweep — `held-inventory`'s top series point. */
const COMPONENT_LIBRARY_HELD_STACKS = 1000;

/** Recipes pinned across the component-library sweep, matching `held-inventory`'s pinned corpus. */
const COMPONENT_LIBRARY_RECIPES = 6;

/**
 * Every component id one component's SALVAGE block references, which is the only kind of
 * component-to-component reference `buildComponentLibrary` can emit.
 *
 * @param {object} entry A generated component.
 * @returns {string[]} The component ids it names, in walk order.
 */
function salvageComponentRefs(entry) {
  const refs = [];
  for (const group of entry?.salvage?.resultGroups ?? []) {
    for (const result of group?.results ?? []) {
      if (result?.componentId != null) refs.push(result.componentId);
    }
  }
  for (const catalyst of entry?.salvage?.catalysts ?? []) {
    const id = catalyst?.componentId ?? catalyst?.match?.componentId;
    if (id != null) refs.push(id);
  }
  return refs;
}

/**
 * Assert that a library PREFIX is closed under its own SALVAGE references. `buildComponentLibrary`
 * gives every fourth component a salvage result naming `c-((index + 1) % count)`, where `count` is
 * the size the library was BUILT at.
 *
 * @returns {object[]} `prefix`, so it can be used inline.
 */
function libraryPrefixClosedUnderSalvage(prefix) {
  const present = new Set(prefix.map((entry) => entry.id));
  for (const entry of prefix) {
    for (const referenced of salvageComponentRefs(entry)) {
      if (present.has(referenced)) continue;
      throw new Error(
        `component-library: the ${prefix.length}-component prefix dangles salvage reference ` +
          `"${referenced}" from "${entry.id}". Every series point must be closed under its own ` +
          `salvage references, or the points differ by more than size. Choose series bounds ` +
          `that are multiples of 4.`
      );
    }
  }
  return prefix;
}

function baseSystem({ systemId, components, tools, overrides = {} }) {
  return {
    id: systemId,
    name: 'Benchmark Crafting System',
    enabled: true,
    resolutionMode: 'simple',
    visibilityMode: 'global',
    components,
    tools,
    itemTags: [],
    features: { enableEssences: true, enableTags: true, salvage: true },
    essenceDefinitions: [],
    recipeItemDefinitions: [],
    craftingCheck: { simple: { rollFormula: '1d20', dc: 15 }, routed: {}, progressive: {} },
    recipeVisibility: { knowledge: { mode: 'itemOrLearned', learn: { consumeOnLearn: false } } },
    ...overrides,
  };
}

/** Every registered profile (issue 1071). */
export const SCALE_PROFILES = Object.freeze({
  'simple-corpus': {
    description: '10,000 simple recipes over a 5,000-component library; token 20-stack inventory.',
    construction: 'literal payloads; the serialization cases hydrate them through Recipe.fromJSON',
    requiresNodeModules: false,
    scale: { components: 5000, recipes: 10_000, tools: 0, heldStacks: CORPUS_AXIS_STACKS },
    build(random) {
      const components = buildComponentLibrary({
        count: 5000,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const recipes = buildRecipeCorpus({
        shape: 'simple',
        count: 10_000,
        systemId: BENCH_SYSTEM_ID,
        components,
        random,
      });
      const inventory = buildHeldInventory({
        stacks: CORPUS_AXIS_STACKS,
        components,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 1,
      });
      return {
        system: baseSystem({ systemId: BENCH_SYSTEM_ID, components, tools: [] }),
        components,
        tools: [],
        recipes,
        inventory,
      };
    },
  },

  'rich-corpus': {
    description:
      '5,000 alternative/tag/tool/essence-heavy recipes over 5,000 components and 200 tools.',
    construction: 'literal payloads; the ingredient-solver cases hydrate a bounded subset',
    requiresNodeModules: false,
    scale: { components: 5000, recipes: 5000, tools: 200, heldStacks: CORPUS_AXIS_STACKS },
    build(random) {
      const components = buildComponentLibrary({
        count: 5000,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const tools = buildToolLibrary({ count: 200, systemId: BENCH_SYSTEM_ID, components });
      const recipes = buildRecipeCorpus({
        shape: 'rich',
        count: 5000,
        systemId: BENCH_SYSTEM_ID,
        components,
        tools,
        random,
      });
      const inventory = buildHeldInventory({
        stacks: CORPUS_AXIS_STACKS,
        components,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 1,
      });
      return {
        system: baseSystem({ systemId: BENCH_SYSTEM_ID, components, tools }),
        components,
        tools,
        recipes,
        inventory,
      };
    },
  },

  'knowledge-corpus': {
    description:
      '5,000 knowledge/book-gated recipes across 8 books and 4 component-source actors.',
    construction: 'literal payloads',
    requiresNodeModules: false,
    scale: { components: 5000, recipes: 5000, books: 8, heldStacks: CORPUS_AXIS_STACKS },
    build(random) {
      const components = buildComponentLibrary({
        count: 5000,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const bookCount = 8;
      const recipes = buildRecipeCorpus({
        shape: 'knowledge',
        count: 5000,
        systemId: BENCH_SYSTEM_ID,
        components,
        random,
        shapeOptions: { bookCount },
      });
      // The acting character holds HALF the books and has learned a slice of the corpus, so both
      // knowledge grant paths (`hasMatchedItem` and `hasLearned`) run for real.
      const inventory = buildHeldInventory({
        stacks: CORPUS_AXIS_STACKS,
        components,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 3,
        bookUuids: Array.from({ length: bookCount / 2 }, (_unused, index) =>
          recipeItemSourceUuid(BENCH_SYSTEM_ID, index)
        ),
        learnedRecipeIds: recipes.slice(0, 250).map((recipe) => recipe.id),
      });
      return {
        system: baseSystem({
          systemId: BENCH_SYSTEM_ID,
          components,
          tools: [],
          overrides: {
            visibilityMode: 'knowledge',
            recipeItemDefinitions: Array.from({ length: bookCount }, (_unused, index) => ({
              id: `${BENCH_SYSTEM_ID}-book-${index}`,
              name: `Bench Tome ${index}`,
              originItemUuid: recipeItemSourceUuid(BENCH_SYSTEM_ID, index),
              aliasItemUuids: [],
              caps: {},
            })),
          },
        }),
        components,
        tools: [],
        recipes,
        inventory,
      };
    },
  },

  'alchemy-signatures': {
    description:
      '2,000 enabled alchemy signatures with a controlled 10% collision pool over 500 components.',
    construction: 'literal payloads',
    requiresNodeModules: false,
    ceiling:
      'Capped at 2,000, not the 5,000 target: validateSystem is quadratic (~6.1 s per audit at ' +
      '5,000), and the pre-fix N-audits-per-N-rows behaviour extrapolates to ~8.5 hours for one ' +
      'GM manager open. Prove #1074 with the comparison counter, never with wall clock.',
    scale: { components: 500, recipes: 2000, collidingRecipes: 200 },
    build(random) {
      const components = buildComponentLibrary({
        count: 500,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const recipes = buildRecipeCorpus({
        shape: 'alchemy',
        count: 2000,
        systemId: BENCH_SYSTEM_ID,
        components,
        random,
        shapeOptions: { collidingCount: 200 },
      });
      const inventory = buildHeldInventory({
        stacks: CORPUS_AXIS_STACKS,
        components,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 1,
      });
      return {
        system: baseSystem({
          systemId: BENCH_SYSTEM_ID,
          components,
          tools: [],
          overrides: {
            resolutionMode: 'alchemy',
            alchemy: { enabled: true, learnOnCraft: false },
          },
        }),
        components,
        tools: [],
        recipes,
        inventory,
      };
    },
  },

  'alchemy-knowledge': {
    description:
      'THE ALCHEMY REVEAL PATH. 500 book-gated alchemy signatures in `item` visibility mode, ' +
      'across 8 books (half held) and a 200-stack inventory, with 100 recipes brew-discovered ' +
      'so the workbench actually PROJECTS revealed rows.',
    construction:
      'literal payloads — neither case reads a `Recipe` method, and hydrating would fold ' +
      'constructor cost into a number that is about the reveal gate',
    requiresNodeModules: false,
    ceiling:
      'Bounded at 500 recipes and 200 held stacks, and the two together are the point rather ' +
      'than a compromise: the term this profile exists to record is the PRODUCT recipes x ' +
      'items, so both axes have to be non-trivial at once and neither may be large. Before ' +
      'issue 1228 the workbench evaluated reveal for every recipe TWICE (chooser summary plus ' +
      'the active panel) with no snapshot, so it walked the whole inventory 2N times; at these ' +
      'bounds that is already six figures of offered documents, which is enough for a ' +
      'reintroduction to move the committed count by orders of magnitude.',
    scale: {
      components: 500,
      recipes: 500,
      books: 8,
      heldStacks: 200,
      learnedRecipes: 100,
      collidingRecipes: 50,
      sourceActorCount: 2,
    },
    build(random) {
      const components = buildComponentLibrary({
        count: 500,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const bookCount = 8;
      const recipes = buildRecipeCorpus({
        shape: 'alchemy',
        count: 500,
        systemId: BENCH_SYSTEM_ID,
        components,
        random,
        shapeOptions: { collidingCount: 50 },
      });
      // Half the books are held and 100 recipes are brew-discovered, so BOTH reveal branches run
      // for real (issue 1217).
      const inventory = buildHeldInventory({
        stacks: 200,
        components,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 2,
        bookUuids: Array.from({ length: bookCount / 2 }, (_unused, index) =>
          recipeItemSourceUuid(BENCH_SYSTEM_ID, index)
        ),
        learnedRecipeIds: recipes.slice(0, 100).map((recipe) => recipe.id),
      });
      return {
        system: baseSystem({
          systemId: BENCH_SYSTEM_ID,
          components,
          tools: [],
          overrides: {
            resolutionMode: 'alchemy',
            // `learnOnCraft` ON so the seeded `learnedRecipes` flag reveals its slice: a brew
            // discovery is unioned across every mode, and with it OFF the learned recipes
            // would be inert and the projection unmeasured again.
            alchemy: { enabled: true, learnOnCraft: true, checkMode: 'none' },
            // The ONE mode that consults held inventory. `global` and `knowledge` both answer
            // reveal from the learned flag and never reach the candidate walk.
            visibilityMode: 'item',
            // Membership on the canonical `recipeIds[]` basis (issue 511), which needs the
            // marker set — with it unset membership falls back to the recipe's legacy scalar,
            // which this corpus does not carry, and every recipe would resolve to no book.
            membershipResolvesByRecipeIds: true,
            recipeItemDefinitions: Array.from({ length: bookCount }, (_unused, index) => ({
              id: `${BENCH_SYSTEM_ID}-book-${index}`,
              name: `Bench Grimoire ${index}`,
              originItemUuid: recipeItemSourceUuid(BENCH_SYSTEM_ID, index),
              aliasItemUuids: [],
              caps: {},
              recipeIds: recipes
                .filter((_recipe, recipeIndex) => recipeIndex % bookCount === index)
                .map((recipe) => recipe.id),
            })),
          },
        }),
        components,
        tools: [],
        recipes,
        inventory,
      };
    },
  },

  'recipe-graph': {
    description:
      'Sparse (1,000 recipes, fan-out 1), dense (500 recipes, fan-out 8) and deep ' +
      '(20,000-recipe linear chain) dependency graphs.',
    construction: 'literal payloads',
    requiresNodeModules: false,
    ceiling:
      'Fan-out is bounded because edge count is producer x consumer, so an unbounded dense ' +
      'corpus makes the benchmark the pathology it measures. DEPTH is deliberately NOT ' +
      'bounded: the deep shape exists to sit past the depth at which the pre-fix recursive ' +
      'cycle-detection DFS threw RangeError (measured 8,193 on this checkout, issue 1082). A ' +
      'shallower chain would pass against the broken implementation and prove nothing.',
    scale: {
      components: 2000,
      sparseRecipes: 1000,
      sparseFanOut: 1,
      denseRecipes: 500,
      denseFanOut: 8,
      layerCount: 12,
      deepRecipes: 20_000,
      deepChainDepth: 20_000,
    },
    build(random) {
      const components = buildComponentLibrary({
        count: 2000,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const sparse = buildGraphCorpus({
        count: 1000,
        systemId: BENCH_SYSTEM_ID,
        components,
        random,
        layerCount: 12,
        fanOut: 1,
      });
      const dense = buildGraphCorpus({
        count: 500,
        systemId: `${BENCH_SYSTEM_ID}d`,
        components,
        random,
        layerCount: 12,
        fanOut: 8,
      });
      const inventory = buildHeldInventory({
        stacks: CORPUS_AXIS_STACKS,
        components,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 1,
      });
      // Drawn LAST, after every pre-existing generator.
      const deep = buildGraphChainCorpus({
        count: 20_000,
        systemId: `${BENCH_SYSTEM_ID}c`,
        random,
      });
      return {
        system: baseSystem({ systemId: BENCH_SYSTEM_ID, components, tools: [] }),
        components,
        tools: [],
        recipes: sparse,
        graphs: { sparse, dense, deep },
        inventory,
      };
    },
  },

  'held-inventory': {
    description:
      'THE INVENTORY AXIS. 100 / 500 / 1,000 held stacks (70% resolving to NO component) across ' +
      'one crafting actor and 2 source actors, against a 5,000-component library and a pinned ' +
      '20-recipe corpus.',
    construction: 'literal payloads',
    requiresNodeModules: false,
    ceiling:
      'The recipe corpus is pinned at 6 BY DESIGN. evaluateCraftability is ' +
      'recipes x items x components — measured on this checkout at ~137 ms per recipe at 1,000 ' +
      'held stacks against 5,000 components, i.e. ~11 s for a 20-row open — so this profile ' +
      'varies inventory and nothing else, and keeps the row count low enough for the drift ' +
      'test to re-derive every count inside npm test. Its counterpart corpus axis lives in ' +
      'simple-corpus.',
    scale: {
      components: 5000,
      recipes: 6,
      inventorySeries: [...INVENTORY_SERIES],
      unmatchedRatio: 0.7,
      sourceActorCount: 2,
      bulkSalvageRows: 5,
    },
    build(random) {
      const components = buildComponentLibrary({
        count: 5000,
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const recipes = buildRecipeCorpus({
        shape: 'simple',
        count: 6,
        systemId: BENCH_SYSTEM_ID,
        components,
        random,
      });
      // ONE inventory per series point, all against the SAME library and the SAME corpus.
      const series = INVENTORY_SERIES.map((stacks) =>
        buildHeldInventory({
          stacks,
          components,
          systemId: BENCH_SYSTEM_ID,
          random,
          sourceActorCount: 2,
        })
      );
      return {
        system: baseSystem({ systemId: BENCH_SYSTEM_ID, components, tools: [] }),
        components,
        tools: [],
        recipes,
        inventory: series[0],
        inventorySeries: series,
      };
    },
  },

  'component-library': {
    description:
      'THE COMPONENT-LIBRARY AXIS. 1,000 / 5,000 / 10,000 components as nested prefixes of ONE ' +
      'library, against a pinned 1,000-stack inventory (70% resolving to NO component) and a ' +
      'pinned 6-recipe corpus.',
    construction: 'literal payloads; the listing cases hydrate the pinned 6-recipe corpus',
    requiresNodeModules: false,
    ceiling:
      'The inventory is pinned at 1,000 stacks and the corpus at 6 recipes BY DESIGN: this ' +
      'profile varies the library and nothing else, and its counterpart axes are held-inventory ' +
      '(items, pinned library) and simple-corpus (recipes, pinned library). Reading the three ' +
      'together is what makes cost = a*components + b*items two independent slopes rather than ' +
      'one aggregate number. Bounded at 10,000 components because the point is the SLOPE, and a ' +
      'third point already fixes it.',
    scale: {
      // The library the series is SLICED FROM, which is the largest series point.
      components: COMPONENT_LIBRARY_SERIES.at(-1),
      componentSeries: [...COMPONENT_LIBRARY_SERIES],
      recipes: COMPONENT_LIBRARY_RECIPES,
      heldStacks: COMPONENT_LIBRARY_HELD_STACKS,
      unmatchedRatio: 0.7,
      sourceActorCount: 2,
    },
    build(random) {
      // ONE library, sliced into NESTED prefixes, rather than three independently generated
      // libraries.
      const components = buildComponentLibrary({
        count: COMPONENT_LIBRARY_SERIES.at(-1),
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const componentSeries = COMPONENT_LIBRARY_SERIES.map((count) =>
        libraryPrefixClosedUnderSalvage(components.slice(0, count))
      );
      // Corpus and inventory are drawn against the SMALLEST prefix, so every authored ingredient
      // and every matched stack exists — identically — at every point of the series.
      const smallest = componentSeries[0];
      const recipes = buildRecipeCorpus({
        shape: 'simple',
        count: COMPONENT_LIBRARY_RECIPES,
        systemId: BENCH_SYSTEM_ID,
        components: smallest,
        random,
      });
      const inventory = buildHeldInventory({
        stacks: COMPONENT_LIBRARY_HELD_STACKS,
        components: smallest,
        systemId: BENCH_SYSTEM_ID,
        random,
        sourceActorCount: 2,
      });
      return {
        system: baseSystem({ systemId: BENCH_SYSTEM_ID, components, tools: [] }),
        components,
        tools: [],
        recipes,
        inventory,
        // The series a case selects its library from. The committed `components` checksum
        // covers every point, because every point is a prefix of the array it is taken over.
        componentSeries,
      };
    },
  },
});

/** Every registered profile name, in a stable order. */
export const SCALE_PROFILE_NAMES = Object.freeze(Object.keys(SCALE_PROFILES));

/** The profiles that exist to be seeded into a live Foundry world and have NO headless cases. */
export const FOUNDRY_ONLY_SCALE_PROFILE_NAMES = Object.freeze(
  SCALE_PROFILE_NAMES.filter((profile) => SCALE_PROFILES[profile].foundryOnly === true)
);

/**
 * The profiles the HEADLESS benchmark sweep runs: every registered profile that is not
 * foundry-only. This is the list `scripts/benchmark-performance.mjs` defaults to and the list the
 * committed class-1 baselines are required for.
 */
export const SWEPT_SCALE_PROFILE_NAMES = Object.freeze(
  SCALE_PROFILE_NAMES.filter((profile) => SCALE_PROFILES[profile].foundryOnly !== true)
);

/** Build one profile's fixture from `{profile, seed}` and nothing else. */
export function buildScaleFixture({ profile, seed = DEFAULT_SEED }) {
  const definition = SCALE_PROFILES[profile];
  if (!definition) {
    throw new Error(
      `Unknown scale profile "${profile}". Known profiles: ${SCALE_PROFILE_NAMES.join(', ')}`
    );
  }
  const random = createSeededRandom(seed);
  const built = definition.build(random);
  return {
    profile,
    seed,
    harnessVersion: HARNESS_VERSION,
    description: definition.description,
    construction: definition.construction,
    requiresNodeModules: definition.requiresNodeModules,
    ceiling: definition.ceiling ?? null,
    // Carried onto the built fixture so a consumer holding only the fixture — the Foundry perf
    // runner does — can see which arm of the harness the profile belongs to without importing
    // the registry.
    foundryOnly: definition.foundryOnly === true,
    foundryOnlyReason: definition.foundryOnlyReason ?? null,
    scale: definition.scale,
    ...built,
  };
}

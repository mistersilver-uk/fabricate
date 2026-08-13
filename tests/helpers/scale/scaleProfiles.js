/**
 * The scale-profile registry (issue 1071).
 *
 * A profile is a FIXTURE, not a measurement: `{profile, seed}` in, a complete synthetic world
 * out, with nothing timed and nothing measured. Benchmark cases (`benchmarkCases.js`) then run
 * against a profile. Keeping the two apart is what makes "benchmark generation/setup is
 * excluded from timed regions" enforceable rather than aspirational — the runner builds the
 * fixture, stops, and only then starts the clock.
 *
 * ## The two axes, and why they are separate profiles
 *
 * Every profile except `held-inventory` scales the CORPUS and holds inventory at a token 20
 * stacks. `held-inventory` does the exact opposite: it pins the corpus at 20 recipes and
 * varies held stacks across 100 / 500 / 1,000 against the full 5,000-component library. That
 * separation is the whole point — a profile that grew both together could not attribute a
 * regression to either, and the field failure this programme exists to fix was an
 * inventory-axis failure that every corpus-shaped criterion would have reported as green.
 *
 * ## Declared measurement ceilings
 *
 * Three profiles are deliberately smaller than the epic's target scale, and each one is
 * bounded for a reason that is recorded on the profile itself so a baseline reader does not
 * have to guess:
 *
 * - `alchemy-signatures` is capped at 2,000 enabled signatures, not 5,000.
 *   `SignatureValidator.validateSystem` is cleanly quadratic; at 5,000 one audit extrapolates
 *   to ~6.1 s, and the PRE-FIX N-audits-per-N-rows behaviour #1074 targets extrapolates to
 *   roughly 8.5 hours for one GM manager open. The "before" number at full scale cannot be
 *   obtained and is not needed: the fix is proved by the comparison counter, not by a clock.
 * - `recipe-graph` bounds both depth and fan-out. `buildRecipeGraph` emits one edge per
 *   (producer, consumer) pair, so an unbounded dense corpus makes the benchmark the pathology
 *   it is measuring; and `layoutGraph`'s cycle-detection DFS is recursive and unguarded, so an
 *   unbounded chain stack-overflows before layout ever gets slow.
 * - `held-inventory` pins the recipe corpus at 6. `evaluateCraftability` is
 *   `recipes × items × components`; measured on this checkout at 1,000 held stacks against
 *   5,000 components it costs ~137 ms PER RECIPE, so a 10,000-recipe player open at full
 *   inventory is a ~23-minute measurement. Six rows is enough to show the series — the counts
 *   are still nine figures — and keeps the drift test's re-derivation inside `npm test`.
 *
 * The corpus axis for the SAME path lives on `simple-corpus` as its own 25 / 50 / 100 row
 * series against a token 20-stack inventory. Two orthogonal series over one code path is what
 * makes a regression attributable to an axis instead of merely visible.
 */
import { buildComponentLibrary, buildToolLibrary } from './scaleComponents.js';
import { INVENTORY_SERIES, buildHeldInventory } from './scaleInventory.js';
import { createSeededRandom } from './scaleRandom.js';
import { buildGraphCorpus, buildRecipeCorpus, recipeItemSourceUuid } from './scaleRecipes.js';

/** The system id every profile builds under. Flag-key safe (no dots). */
export const BENCH_SYSTEM_ID = 'benchsys';

/** The default seed. Every profile is reproducible from `{profile, seed}` alone. */
export const DEFAULT_SEED = 1071;

/**
 * The harness version. Bump it when a generator changes shape in a way that legitimately moves
 * every committed count, so a baseline diff carries the reason with it.
 *
 * 2 — `pickDistinct` became a partial Fisher-Yates instead of bounded rejection sampling. Same
 *     contract, different draw sequence, so every component's essence and tag picks moved and
 *     with them every fixture checksum and every downstream count.
 */
export const HARNESS_VERSION = 2;

/** A token inventory for the corpus-axis profiles: present, but never the thing being varied. */
const CORPUS_AXIS_STACKS = 20;

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

/**
 * Every registered profile.
 *
 * Each entry declares its scale, its fixture CONSTRUCTION (`literal` payloads vs hydrated
 * models — issue 1071 requires this be stated per profile because mixing them silently makes
 * numbers incomparable), whether it needs an `npm ci` (`requiresNodeModules`), and any ceiling
 * it is bounded by.
 */
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
      // The acting character holds HALF the books and has learned a slice of the corpus, so
      // both knowledge grant paths (`hasMatchedItem` and `hasLearned`) run for real. A
      // fixture granting everything would make the gate return on its first branch.
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

  'recipe-graph': {
    description:
      'Sparse (1,000 recipes, fan-out 1) and dense (500 recipes, fan-out 8) dependency graphs.',
    construction: 'literal payloads',
    requiresNodeModules: false,
    ceiling:
      'Depth and fan-out are both bounded. Edge count is producer x consumer, so an unbounded ' +
      'dense corpus makes the benchmark the pathology it measures; and layoutGraph cycle ' +
      'detection is a recursive unguarded DFS, so an unbounded chain stack-overflows first.',
    scale: {
      components: 2000,
      sparseRecipes: 1000,
      sparseFanOut: 1,
      denseRecipes: 500,
      denseFanOut: 8,
      layerCount: 12,
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
      return {
        system: baseSystem({ systemId: BENCH_SYSTEM_ID, components, tools: [] }),
        components,
        tools: [],
        recipes: sparse,
        graphs: { sparse, dense },
        inventory: buildHeldInventory({
          stacks: CORPUS_AXIS_STACKS,
          components,
          systemId: BENCH_SYSTEM_ID,
          random,
          sourceActorCount: 1,
        }),
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
      // This is the independence the acceptance criteria require: the only thing that varies
      // between `series[0]` and `series[2]` is the held-stack count.
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
});

/** Every registered profile name, in a stable order. */
export const SCALE_PROFILE_NAMES = Object.freeze(Object.keys(SCALE_PROFILES));

/**
 * Build one profile's fixture from `{profile, seed}` and nothing else.
 *
 * @param {object} options
 * @param {string} options.profile
 * @param {number} [options.seed]
 * @returns {{profile: string, seed: number, harnessVersion: number, description: string,
 *   construction: string, requiresNodeModules: boolean, ceiling: string|null,
 *   scale: object, system: object, components: object[], tools: object[], recipes: object[],
 *   inventory: object, inventorySeries?: object[], graphs?: object}}
 */
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
    scale: definition.scale,
    ...built,
  };
}

/**
 * The scale-profile registry (issue 1071).
 *
 * A profile is a FIXTURE, not a measurement: `{profile, seed}` in, a complete synthetic world
 * out, with nothing timed and nothing measured. Benchmark cases (`benchmarkCases.js`) then run
 * against a profile. Keeping the two apart is what makes "benchmark generation/setup is
 * excluded from timed regions" enforceable rather than aspirational — the runner builds the
 * fixture, stops, and only then starts the clock.
 *
 * ## The three axes, and why they are separate profiles
 *
 * The corpus-axis profiles scale the CORPUS and hold inventory at a token 20 stacks.
 * `held-inventory` does the exact opposite: it pins the corpus at 20 recipes and varies held
 * stacks across 100 / 500 / 1,000 against the full 5,000-component library. `component-library`
 * (issue 1204) pins BOTH and varies the library across 1,000 / 5,000 / 10,000. That separation
 * is the whole point — a profile that grew two axes together could not attribute a regression
 * to either, and the field failure this programme exists to fix was an inventory-axis failure
 * that every corpus-shaped criterion would have reported as green. The library axis arrived
 * last, and {@link COMPONENT_LIBRARY_SERIES} records why.
 *
 * ## Declared measurement ceilings
 *
 * Four profiles bound an axis rather than running it at the epic's target scale, and each one
 * is bounded for a reason that is recorded on the profile itself so a baseline reader does not
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
 * - `component-library` pins the corpus at 6 and the inventory at 1,000 stacks for the same
 *   reason one level across: it varies the library and must vary nothing else, and a case that
 *   moved a second axis could not attribute a count to either. Its library goes ABOVE the
 *   epic's 5,000 target rather than below it, because the point of the profile is the SLOPE and
 *   a third point past the target is what fixes one.
 *
 * The corpus axis for the SAME path lives on `simple-corpus` as its own 25 / 50 / 100 row
 * series against a token 20-stack inventory. Two orthogonal series over one code path is what
 * makes a regression attributable to an axis instead of merely visible.
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
 * every committed count, so a baseline diff carries the reason with it.
 *
 * 2 — `pickDistinct` became a partial Fisher-Yates instead of bounded rejection sampling. Same
 *     contract, different draw sequence, so every component's essence and tag picks moved and
 *     with them every fixture checksum and every downstream count.
 */
export const HARNESS_VERSION = 2;

/** A token inventory for the corpus-axis profiles: present, but never the thing being varied. */
const CORPUS_AXIS_STACKS = 20;

/**
 * THE COMPONENT-LIBRARY AXIS (issue 1204): the library sizes `component-library` sweeps.
 *
 * The third axis, and until #1204 the one no committed case varied. `held-inventory` varies
 * items against a pinned 5,000-component library and `simple-corpus` varies recipes against the
 * same pinned library, so both hold `components` constant — which means the listing half of
 * #1070's "not proportional to `items x components`" rested on a pinned equality at ONE library
 * size rather than on a series. Two series over one path is what turns
 * `cost = a*components + b*items` from an assertion into two readable slopes.
 * @type {readonly number[]}
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
 * Both legs are taken from the repository's own enumeration of the salvage sites —
 * `src/systems/importReferenceResolver.js` § "Component salvage result refs + legacy salvage
 * catalysts" remaps `salvage.resultGroups[].results[]` AND `salvage.catalysts[]`, reading a
 * component id from either the bare `componentId` field or a nested `match.componentId`. The
 * catalyst leg cannot fire today because the generator emits no catalysts; it is here so that
 * teaching the generator to emit them cannot silently escape the closure check below, which is
 * the failure mode a hand-maintained mirror of a builder always has.
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
 * Assert that a library PREFIX is closed under its own SALVAGE references.
 *
 * Salvage rather than "component references" in general, and the narrower claim is the honest
 * one: {@link salvageComponentRefs} is what this checks, and the other component-to-component
 * reference kinds the same resolver remaps (a tool's `componentId`, an essence definition's
 * `sourceComponentId`) are not emitted by `buildComponentLibrary` at all and are not this
 * function's subject.
 *
 * `buildComponentLibrary` gives every fourth component a salvage result naming
 * `c-((index + 1) % count)`, where `count` is the size the library was BUILT at. A prefix of
 * that library therefore dangles a salvage reference whenever its last component is
 * salvage-enabled, and a dangling reference resolves to no component in the inventory
 * listing's by-id library map — a per-series-point behavioural difference with nothing to do
 * with library size, which is precisely what a controlled series must not contain.
 *
 * Today's series bounds cannot produce one (every bound is a multiple of 4, so every prefix
 * ends on an index congruent to 3 and salvage is enabled only on multiples of 4). This makes
 * that a checked property rather than an arithmetic coincidence a later edit to
 * {@link COMPONENT_LIBRARY_SERIES} could silently break.
 *
 * @param {object[]} prefix
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
      // Drawn LAST, after every pre-existing generator. Each of these builders consumes the
      // shared seeded stream, so inserting the depth axis anywhere earlier would shift every
      // later draw and move committed checksums that nothing about this axis should touch.
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
      // The library the series is SLICED FROM, which is the largest series point. Declared
      // under the same key every other profile uses so `benchmark-harness.test.js`'s
      // "honours its declared scale" check covers this profile too rather than skipping it.
      components: COMPONENT_LIBRARY_SERIES.at(-1),
      componentSeries: [...COMPONENT_LIBRARY_SERIES],
      recipes: COMPONENT_LIBRARY_RECIPES,
      heldStacks: COMPONENT_LIBRARY_HELD_STACKS,
      unmatchedRatio: 0.7,
      sourceActorCount: 2,
    },
    build(random) {
      // ONE library, sliced into NESTED prefixes, rather than three independently generated
      // libraries. Independent libraries would draw different essences and tags at the same
      // index — so `c-5` would not be the same component at 1,000 and at 10,000 — and a count
      // that moved across the series could then be blamed on content rather than on size. A
      // prefix makes the 1,000-component world literally a sub-library of the 10,000-component
      // one, which is the same discipline held-inventory applies to its inventory series.
      const components = buildComponentLibrary({
        count: COMPONENT_LIBRARY_SERIES.at(-1),
        random,
        systemId: BENCH_SYSTEM_ID,
      });
      const componentSeries = COMPONENT_LIBRARY_SERIES.map((count) =>
        libraryPrefixClosedUnderSalvage(components.slice(0, count))
      );
      // Corpus and inventory are drawn against the SMALLEST prefix, so every authored
      // ingredient and every matched stack exists — identically — at every point of the series.
      // Drawn against the full library they would reference components the smaller points do
      // not contain, and the series would measure recipe solvability as well as library size.
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

/**
 * Build one profile's fixture from `{profile, seed}` and nothing else.
 *
 * @param {object} options
 * @param {string} options.profile
 * @param {number} [options.seed]
 * @returns {{profile: string, seed: number, harnessVersion: number, description: string,
 *   construction: string, requiresNodeModules: boolean, ceiling: string|null,
 *   scale: object, system: object, components: object[], tools: object[], recipes: object[],
 *   inventory: object, inventorySeries?: object[], componentSeries?: object[][],
 *   graphs?: object}}
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

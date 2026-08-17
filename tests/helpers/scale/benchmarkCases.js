/**
 * The benchmark case registry (issue 1071).
 *
 * One case = one isolated hot path, one profile, one measured region. A case has three parts
 * and the split between them is the harness's central discipline:
 *
 * - `setup(context)` builds whatever the case needs and is NEVER timed. Hydrating 10,000
 *   recipes through `Recipe.fromJSON` costs real milliseconds; folding that into a case that
 *   claims to measure filtering would make the number meaningless.
 * - `run(state)` is the ONLY timed and counted region.
 * - `counts(state, result, counters)` adds case-specific class-1 facts (payload bytes, node
 *   and edge counts, row counts) on top of whatever the counter seams observed.
 *
 * ## Named hot paths and where each is measured
 *
 * | Issue-1071 hot path                          | Case id prefix                          |
 * |----------------------------------------------|-----------------------------------------|
 * | `RecipeManager.getRecipes()`                 | `recipeManager.getRecipes.*`            |
 * | `CraftingListingBuilder.buildListing()`      | `craftingListing.buildListing*`         |
 * | `CraftingListingBuilder.buildRecipeDetail()` | `craftingListing.buildRecipeDetail*`    |
 * | `RecipeVisibilityService.getVisibleRecipes()`| `recipeVisibility.getVisibleRecipes*`   |
 * | `InventoryListingBuilder.buildListing()`     | `inventoryListing.buildListing*`        |
 * | `AlchemyListingBuilder.buildListing()`       | `alchemyListing.buildListing`           |
 * | Identity resolution — MISS and HIT apart     | `identity.*`                            |
 * | `CraftingEngine.findComponentItems`          | `craftingEngine.findComponentItems*`    |
 * | `SignatureValidator.validateSystem()`        | `signatureValidator.validateSystem`     |
 * | Recipe graph construction / layout           | `graph.*`                               |
 * | `IngredientSet.resolveIngredientSelection()` | `ingredientSet.resolveIngredientSelection` |
 * | `RecipeManager.save()` / `CraftingSystemManager.save()` | `*.save`                     |
 * | `CraftingSystemManager` normalization/import | `craftingSystemManager.normalizeImport` |
 * | Pure browser models + pagination             | `recipeBrowserModel.*`, `componentBrowserModel.*`, `browserPagination.*` |
 */
import {
  SETTING_DOCUMENT_ENVELOPE_BYTES,
  assertEscapedArrayIdentity,
  assertWholeArrayIdentity,
  connectPayloadAt,
  connectPayloadSeries,
  escapedRecordBytes,
  findConnectCrossover,
  serializedRecordBytes,
} from './connectPayloadModel.js';
import { INVENTORY_SERIES } from './scaleInventory.js';
import { COMPONENT_LIBRARY_SERIES } from './scaleProfiles.js';
import {
  createBenchWorld,
  hydrateRecipes,
  useHydratedRecipes,
  withFreshRecordIds,
} from './scaleWorld.js';

/** How many rows a bulk salvage/destroy run is simulated at. Bounded: the run is O(rows x items x components). */
const BULK_ROWS = 5;

/**
 * The CORPUS-axis series for the player crafting open: 25 / 50 / 100 rows against a token
 * 20-stack inventory.
 *
 * The inventory-axis counterpart lives in `held-inventory` and varies stacks against a pinned
 * corpus. Running one path along two orthogonal series is what makes a regression attributable
 * to an axis rather than merely visible in one aggregate number.
 * @type {readonly number[]}
 */
const CORPUS_ROW_SERIES = Object.freeze([25, 50, 100]);

/** Rows the alchemy workbench listing is bounded to. */
const ALCHEMY_ROWS = 100;

/**
 * Rows the GM recipe-browser case is bounded to.
 *
 * Bounded hard, and by the PRE-FIX cost rather than the post-fix one. Before issue 1074 the
 * row projection ran one full O(sets²) audit per row, so this case is O(rows³): measured on
 * this checkout at 23 ms for 25 rows, 1.27 s for 100 and 10.4 s for 200. Two hundred is the
 * largest bound at which a regression re-exposes itself in seconds rather than in hours,
 * which is what makes this a guard a reviewer can actually run rather than one that would
 * only ever be skipped. Post-fix it is a fraction of a second.
 */
const GM_ROWS = 200;

/**
 * The recipe library's default page size (`RECIPE_DEFAULT_PAGE_SIZE`).
 *
 * Restated here rather than imported so a benchmark case never depends on a `src/` constant
 * that a product decision could move underneath a committed baseline — the number a baseline
 * was measured at has to be readable in this file.
 */
const GM_BROWSER_PAGE_SIZE = 25;

/**
 * Recipes the adversarial ingredient-solver case runs.
 *
 * Bounded hard. Each rich recipe carries 3 sets x 3 groups x 3 options, and every matcher
 * invocation costs a full 5,000-component candidate scan, so 200 recipes measured 38 s and
 * 1.03 BILLION candidate examinations on this checkout. Twelve keeps the same shape and the
 * same per-node signal at a cost the drift test can re-derive.
 */
const SOLVER_RECIPES = 12;

/**
 * Record counts the connect-payload overhead is reported at, spanning four orders of magnitude
 * from one record to each profile's full corpus.
 *
 * A SWEEP rather than a single reading, because ADR 0001's condition is stated in corpus size —
 * "B(1) is sufficient if real worlds sit far enough below 10,000 records" — so the reading has
 * to be taken at sizes real worlds actually sit at and not only at the target scale. Four points
 * is enough to show whether the curve has a knee; committing every intermediate point would add
 * class-1 keys that carry the same one fact.
 * @type {readonly number[]}
 */
const CONNECT_SWEEP_SIMPLE = Object.freeze([1, 100, 1000, 10_000]);

/** The same sweep against `rich-corpus`, whose corpus tops out at 5,000. */
const CONNECT_SWEEP_RICH = Object.freeze([1, 100, 1000, 5000]);

/**
 * Serialized payload bytes for a world-setting write.
 *
 * `#1070` names whole-corpus serialization as its #1 persistence risk and asks for the BYTES,
 * not just the time, because bytes are machine-invariant and time is not: every connected
 * client re-runs `JSON.stringify` over this exact payload twice to detect the change.
 *
 * @param {Map<string, unknown>} settings
 * @param {string} key
 * @returns {number}
 */
function settingBytes(settings, key) {
  const value = settings.get(key);
  return value === undefined ? 0 : JSON.stringify(value).length;
}

function worldFor(context, options = {}) {
  return createBenchWorld({
    modules: context.modules,
    fixture: context.fixture,
    counters: context.counters,
    ...options,
  });
}

/**
 * One connect-payload case: what a corpus costs a connecting client as one whole-array `world`
 * setting versus one `world` setting key per record.
 *
 * ADR 0001 selected B(1) — one setting key per record — against its own spike's recommendation,
 * and made the selection conditional on a measurement it asked issue 1080 to take: the record
 * count at which the per-key `Setting` envelope makes the connect payload worse than doing
 * nothing. This case is that measurement. It implements NO backend and changes no persistence:
 * it reads the array the shipped `SettingsCraftingDefinitionRepository` actually writes and
 * models the same records under the other layout.
 *
 * Two shapes are registered, not one, because the answer is a property of the RECORD SHAPE
 * rather than of the record count. A simple recipe and a rich one differ by roughly 5x in
 * serialized size, and the envelope is a fixed cost, so the relative penalty differs by roughly
 * 5x with them. A single-shape measurement would read as a single number and be quoted as one.
 *
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.profile
 * @param {string} options.shape Prose naming the corpus this case measures.
 * @param {number[]} options.sweep Record counts to report the overhead ratio at.
 * @param {string} [options.freshIdComparison] The consequence of the fresh id space ON THIS
 *   PROFILE. Parameterised because the shared template previously asserted a comparison to
 *   `recipeManager.save.serializedBytes` on every profile, and only `simple-corpus` registers
 *   that case at all.
 * @returns {object}
 */
function connectPayloadCase({ id, profile, shape, sweep, freshIdComparison = '' }) {
  return {
    id,
    profile,
    description:
      `CONNECT PAYLOAD (#1080): ${shape} as one whole-array \`world\` setting versus one ` +
      "`world` setting key per record (ADR 0001's B(1)), including the live-measured " +
      `${SETTING_DOCUMENT_ENVELOPE_BYTES}-byte \`Setting\` envelope. ` +
      'The overhead is reported at several corpus sizes because ADR 0001 conditioned its ' +
      'choice on corpus size, and the reading barely moves across three orders of magnitude ' +
      "of it. Both layouts are counted exclusive of the container `Setting` document's own " +
      'envelope, which is how ADR 0001 counts them. Hydrated against a FRESH id space, so the ' +
      `bytes depend on {profile, seed} alone rather than on how many earlier cases hydrated.${freshIdComparison}`,
    setup: async (context) => {
      const world = worldFor(context);
      useHydratedRecipes(
        world,
        withFreshRecordIds(() => hydrateRecipes(world.modules, context.fixture.recipes))
      );
      // The real repository write, not a re-implementation of it: the payload measured here is
      // the payload production replicates.
      await world.recipeManager.save();
      const payloads = world.settings.get('recipes');
      return {
        payloads,
        recordBytes: serializedRecordBytes(payloads),
        // The same corpus as a `Setting#value` string field actually carries it. Committed
        // because it is the one sensitivity this measurement has, and because the previous
        // attempt to state it was hand-computed on an order-dependent corpus and came out
        // wrong — see `escapedRecordBytes`.
        escapedBytes: escapedRecordBytes(payloads),
      };
    },
    run: ({ recordBytes }) => ({
      series: connectPayloadSeries({ recordBytes, sizes: sweep }),
      crossover: findConnectCrossover({ recordBytes }),
    }),
    counts: ({ payloads, recordBytes, escapedBytes }, { series, crossover }) => {
      const corpus = connectPayloadAt({ recordBytes, records: recordBytes.length });
      const escaped = connectPayloadAt({
        recordBytes: escapedBytes,
        records: escapedBytes.length,
      });
      return {
        connectRecords: corpus.records,
        connectEnvelopeBytesPerRecord: SETTING_DOCUMENT_ENVELOPE_BYTES,
        wholeArrayConnectBytes: corpus.wholeArrayBytes,
        perRecordKeyConnectBytes: corpus.perRecordKeyBytes,
        connectDeltaBytes: corpus.deltaBytes,
        // Guarded for the empty corpus like every other count here. Unguarded the division is
        // `-2 / 0`, so the count would be `-Infinity` and would land in a committed class-1
        // file as `null` — a value that reads as a missing measurement rather than as a
        // degenerate one. Unreachable from the registered profiles, and there is no seam to
        // reach it from a test because this factory is module-private; the branch is here
        // because every other count in this file guards `count === 0` and one that did not
        // would be the odd one out.
        connectDeltaBytesPerRecord:
          corpus.records === 0 ? 0 : Math.round(corpus.deltaBytes / corpus.records),
        // `0` means B(1) never costs more than the whole array within this corpus — the ONLY
        // outcome that satisfies ADR 0001's condition. Any other value is the record count at
        // which it first does, on the accounting convention `connectPayloadModel.js` states in
        // its header: both layouts exclusive of the container `Setting`'s own envelope, as
        // ADR 0001's own connect table counts them. Charging the baseline that one envelope too
        // reports 2 here instead of 1 and moves nothing else by more than 340 bytes.
        connectCrossoverRecords: crossover?.records ?? 0,
        connectCrossoverDeltaBytesBelow: crossover?.below.deltaBytes ?? 0,
        connectCrossoverDeltaBytesAt: crossover?.at.deltaBytes ?? 0,
        // The baseline term is an arithmetic claim about JSON punctuation that every conclusion
        // here subtracts from, so it is checked against real `JSON.stringify` on the real corpus
        // and committed as a fact rather than left to a comment.
        wholeArrayPunctuationModelHolds: assertWholeArrayIdentity(payloads).matches ? 1 : 0,
        // The escaped model — `Setting#value` is a string field, so a transmitted document
        // escapes the JSON inside it. Four keys, because this is the ONLY sensitivity the
        // measurement has and it must be re-derivable rather than recomputed by hand: the two
        // byte counts, the ratio they move, and the punctuation identity that lets the escaped
        // bytes be fed to the unescaped formulae. The DELTA is deliberately not committed
        // twice: escaping adds the same term to both layouts, so `escaped*ConnectBytes`
        // subtract to exactly `connectDeltaBytes` above, and the drift test asserts that.
        escapedWholeArrayConnectBytes: escaped.wholeArrayBytes,
        escapedPerRecordKeyConnectBytes: escaped.perRecordKeyBytes,
        escapedConnectOverheadBasisPoints: escaped.overheadBasisPoints,
        escapedArrayPunctuationModelHolds: assertEscapedArrayIdentity(payloads).matches ? 1 : 0,
        ...Object.fromEntries(
          series.map((row) => [
            `connectOverheadBasisPoints@${row.records}`,
            row.overheadBasisPoints,
          ])
        ),
      };
    },
  };
}

/**
 * The corpus-axis cases: filtering, browser models, serialization, normalization.
 * @returns {object[]}
 */
function simpleCorpusCases() {
  return [
    {
      id: 'recipeManager.getRecipes.unfiltered',
      profile: 'simple-corpus',
      description: 'Materialise the whole 10,000-recipe map with no filters.',
      setup: (context) => worldFor(context),
      run: (world) => world.recipeManager.getRecipes(),
      counts: (_world, recipes) => ({ recipesReturned: recipes.length }),
    },
    {
      id: 'recipeManager.getRecipes.search',
      profile: 'simple-corpus',
      description:
        'The player/GM search path: enabled + system + tag + free-text over 10,000 recipes.',
      setup: (context) => worldFor(context),
      run: (world) =>
        world.recipeManager.getRecipes({
          enabled: true,
          craftingSystemId: world.system.id,
          tags: ['metal'],
          search: 'recipe 4',
        }),
      counts: (_world, recipes) => ({ recipesReturned: recipes.length }),
    },
    {
      id: 'recipeBrowserModel.buildRecipeBrowserModel',
      profile: 'simple-corpus',
      description: 'The pure GM recipe browser projection: filter, sort, group, paginate.',
      setup: (context) => ({
        world: worldFor(context),
        recipes: context.fixture.recipes,
      }),
      run: ({ world, recipes }) =>
        world.modules.recipeBrowser.buildRecipeBrowserModel(recipes, {
          status: 'on',
          lock: 'all',
          category: 'all',
          sortKey: 'name',
          sortDirection: 'asc',
          groupByCategory: true,
          pageIndex: 0,
          pageSize: 25,
        }),
      counts: (_state, model) => ({
        pagedRows: model.page.length,
        filteredRows: model.filtered.length,
        totalRows: model.totalCount,
        categoryGroups: model.groups.length,
      }),
    },
    {
      id: 'componentBrowserModel.filterSortPaginate',
      profile: 'simple-corpus',
      description: 'The pure GM component browser projection over a 5,000-component library.',
      setup: (context) => ({
        world: worldFor(context),
        // The browser model consumes PROJECTED rows, not domain components: it reads
        // `essences` as an array of `{id, name}` and `salvageSummary.resultGroupCount`, where
        // the domain component carries an essence-quantity MAP and a full salvage definition.
        // Projecting here (untimed) keeps the timed region on the model rather than on a shape
        // adaptation the real GM store performs upstream — and, more to the point, a fixture
        // handed the wrong shape filters to zero rows and reports a fast, meaningless number.
        components: context.fixture.components.map((component) => ({
          ...component,
          essences: Object.keys(component.essences ?? {}).map((id) => ({ id, name: id })),
          salvageSummary: { resultGroupCount: component.salvage?.resultGroups?.length ?? 0 },
        })),
      }),
      run: ({ world, components }) => {
        const model = world.modules.componentBrowser;
        const filtered = model.filterComponents(components, { category: 'all', essence: 'fire' });
        const sorted = model.sortComponents(filtered, {
          key: 'category',
          direction: 'asc',
          categoryMajor: true,
        });
        const grouped = model.groupComponentsByCategory(sorted, {});
        return { page: model.paginateComponents(sorted, { pageIndex: 0, pageSize: 25 }), grouped };
      },
      counts: (_state, result) => ({
        pagedRows: result.page.components.length,
        totalRows: result.page.totalCount,
        categoryGroups: result.grouped.length,
      }),
    },
    {
      id: 'browserPagination.paginateRows',
      profile: 'simple-corpus',
      description: 'The shared page-window primitive over 10,000 rows.',
      setup: (context) => ({ world: worldFor(context), rows: context.fixture.recipes }),
      run: ({ world, rows }) =>
        world.modules.pagination.paginateRows(rows, { pageIndex: 20, pageSize: 25 }, 25),
      counts: (_state, page) => ({ pagedRows: page.rows.length, pageCount: page.pageCount }),
    },
    {
      id: 'recipe.hydrateCorpus',
      profile: 'simple-corpus',
      description:
        'RECONSTRUCTION: Recipe.fromJSON over the whole 10,000-recipe corpus. Uses real model ' +
        'constructors, not literals, because reconstruction is what it measures.',
      setup: (context) => ({ world: worldFor(context), payloads: context.fixture.recipes }),
      run: ({ world, payloads }) => hydrateRecipes(world.modules, payloads),
      counts: (_state, recipes) => ({
        hydratedRecipes: recipes.length,
        hydratedIngredientSets: recipes.reduce(
          (total, recipe) => total + recipe.ingredientSets.length,
          0
        ),
      }),
    },
    {
      id: 'recipeManager.save',
      profile: 'simple-corpus',
      description:
        'SERIALIZATION: RecipeManager.save() replaces the whole `recipes` world setting. Real ' +
        'Recipe#toJSON output; the byte count is the replicated payload every client re-parses.',
      setup: (context) => {
        const world = worldFor(context);
        useHydratedRecipes(world, hydrateRecipes(world.modules, context.fixture.recipes));
        return world;
      },
      run: async (world) => {
        await world.recipeManager.save();
        return world;
      },
      counts: (world) => ({
        serializedRecipes: world.recipeManager.recipes.size,
        serializedBytes: settingBytes(world.settings, 'recipes'),
      }),
    },
    {
      id: 'craftingSystemManager.save',
      profile: 'simple-corpus',
      description:
        'SERIALIZATION: CraftingSystemManager.save() replaces the whole `craftingSystems` ' +
        'setting, so a single component edit replicates the entire 5,000-component library.',
      setup: async (context) => {
        const world = worldFor(context);
        const manager = new world.modules.CraftingSystemManager(world.recipeManager);
        manager.systems = new Map([[world.system.id, world.system]]);
        manager.initialized = true;
        return { world, manager };
      },
      run: async ({ manager, world }) => {
        await manager.save();
        return { manager, world };
      },
      counts: ({ world, manager }) => ({
        serializedSystems: manager.systems.size,
        serializedBytes: settingBytes(world.settings, 'craftingSystems'),
      }),
    },
    {
      id: 'craftingSystemManager.normalizeImport',
      profile: 'simple-corpus',
      description:
        'The normalization/import path #1076 targets: initialize() reads the persisted setting ' +
        'and runs _normalizeSystem over the whole 5,000-component library.',
      setup: async (context) => {
        const world = worldFor(context);
        world.settings.set('craftingSystems', [world.system]);
        return world;
      },
      run: async (world) => {
        const manager = new world.modules.CraftingSystemManager(world.recipeManager);
        await manager.initialize();
        return manager;
      },
      counts: (_world, manager) => ({
        normalizedSystems: manager.systems.size,
        normalizedComponents: [...manager.systems.values()].reduce(
          (total, system) => total + (system.components?.length ?? 0),
          0
        ),
      }),
    },
    ...CORPUS_ROW_SERIES.map((rows) => ({
      id: `craftingListing.buildListing.corpusAxis@${rows}`,
      profile: 'simple-corpus',
      description:
        `The player crafting SUMMARY phase over ${rows} rows against a token 20-stack ` +
        'inventory — the corpus-wide browse half only (issue 1075). The CORPUS axis of the ' +
        'same path the held-inventory profile varies by held stacks. Per-recipe detail ' +
        'hydration is bounded by page size rather than by this axis and is not measured here.',
      setup: (context) => {
        const recipes = hydrateRecipes(context.modules, context.fixture.recipes.slice(0, rows));
        return worldFor(context, { recipes });
      },
      run: (world) =>
        world.craftingListing.buildListing({
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
          viewer: world.viewer,
        }),
      counts: (_world, listing) => ({
        listedRecipes: listing.summaries.length,
        availableRecipes: listing.counts.available,
      }),
    })),
    // Registered LAST, and it matters. Every case before it hydrates against the ambient
    // process-lifetime id counter, so inserting a hydrating case earlier would widen the ids
    // `recipeManager.save` mints and move its committed `serializedBytes`.
    connectPayloadCase({
      id: 'persistence.connectPayload.simpleRecipes',
      profile: 'simple-corpus',
      shape: '10,000 simple recipes',
      sweep: CONNECT_SWEEP_SIMPLE,
      freshIdComparison:
        ' It therefore reads at or below `recipeManager.save.serializedBytes`, which measures ' +
        'the same corpus hydrated against the ambient counter this case resets.',
    }),
  ];
}

/** The alternative/tag/tool/essence-heavy cases. */
function richCorpusCases() {
  return [
    {
      id: 'ingredientSet.resolveIngredientSelection',
      profile: 'rich-corpus',
      description:
        `The bounded backtracking ingredient solver over ${SOLVER_RECIPES} adversarial ` +
        'multi-option recipes (3 sets x 3 groups x 3 options each). Hydrated, because the ' +
        'solver is a model method; the matcher-invocation count is the per-node work term ' +
        '#1083 targets, and the candidate-examination count is what each node actually costs.',
      setup: (context) => {
        const world = worldFor(context);
        const recipes = hydrateRecipes(
          world.modules,
          context.fixture.recipes.slice(0, SOLVER_RECIPES)
        );
        const items = [
          ...world.craftingActor.items,
          ...world.sourceActors.flatMap((actor) => [...actor.items]),
        ];
        return { world, recipes, items, counters: context.counters };
      },
      run: ({ world, recipes, items, counters }) => {
        const selections = [];
        for (const recipe of recipes) {
          for (const set of recipe.ingredientSets) {
            selections.push(
              set.resolveIngredientSelection(items, (ingredient, item) => {
                counters.bump('ingredientMatcherInvocations');
                return world.recipeManager.ingredientMatchesItem(recipe, ingredient, item);
              })
            );
          }
        }
        return selections;
      },
      // `searchNodes` is the acceptance number for #1083 and is read straight off the seam
      // #1072 exposed (`searchStats`), never re-derived here. It is the ONLY count that can
      // show search being avoided rather than merely made cheaper: the matcher and candidate
      // counters fall when a node gets cheaper too, so on their own they cannot distinguish
      // the two, and the node cap is stated in nodes.
      counts: (_state, selections) => ({
        selectionsResolved: selections.length,
        selectionsSatisfied: selections.filter((selection) => selection.success).length,
        searchNodes: selections.reduce(
          (total, selection) => total + (selection.searchStats?.nodes ?? 0),
          0
        ),
        searchCapHits: selections.filter((selection) => selection.searchStats?.capHit).length,
      }),
    },
    {
      id: 'recipeVisibility.getVisibleRecipes.global',
      profile: 'rich-corpus',
      description: 'The corpus-wide visibility pass in global mode over 5,000 rich recipes.',
      setup: (context) => worldFor(context),
      run: (world) =>
        world.recipeVisibility.getVisibleRecipes({
          viewer: world.viewer,
          craftingSystemId: world.system.id,
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
        }),
      counts: (_world, entries) => ({ visibleRecipes: entries.length }),
    },
    connectPayloadCase({
      id: 'persistence.connectPayload.richRecipes',
      profile: 'rich-corpus',
      shape: '5,000 alternative/tag/tool/essence-heavy recipes',
      sweep: CONNECT_SWEEP_RICH,
    }),
  ];
}

/** The knowledge/book-gated cases. */
function knowledgeCorpusCases() {
  return [
    {
      id: 'recipeVisibility.getVisibleRecipes.knowledge',
      profile: 'knowledge-corpus',
      description:
        'The knowledge gate over 5,000 book-gated recipes, 4 actors and 8 books — both grant ' +
        'branches (held book, learned) are live in the fixture.',
      setup: (context) => worldFor(context),
      run: (world) =>
        world.recipeVisibility.getVisibleRecipes({
          viewer: world.viewer,
          craftingSystemId: world.system.id,
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
        }),
      counts: (_world, entries) => ({ visibleRecipes: entries.length }),
    },
    {
      id: 'inventoryListing.buildListing.corpusAxis',
      profile: 'knowledge-corpus',
      description:
        'The Inventory tab open. Runs the corpus-wide visibility pass a SECOND time via ' +
        '_resolveAllowedRecipeIds, which is the double pass #1077 targets.',
      setup: (context) => worldFor(context),
      run: (world) =>
        world.inventoryListing.buildListing({
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
          viewer: world.viewer,
        }),
      counts: (_world, listing) => ({
        rows: listing.rows.length,
        componentRows: listing.counts.components,
        essenceRows: listing.counts.essences,
      }),
    },
  ];
}

/** The alchemy signature cases. */
function alchemyCases() {
  return [
    {
      id: 'signatureValidator.validateSystem',
      profile: 'alchemy-signatures',
      description:
        'The pairwise enabled-signature audit over 2,000 signatures. The comparison counter is ' +
        'the number #1074 must move; the wall clock at full 5,000 scale is unobtainable.',
      setup: (context) => {
        const world = worldFor(context);
        const validator = world.signatureValidator;
        const original = validator.signaturesOverlap.bind(validator);
        validator.signaturesOverlap = (left, right) => {
          context.counters.bump('signatureComparisons');
          return original(left, right);
        };
        return world;
      },
      run: (world) => world.signatureValidator.validateSystem(world.system.id),
      counts: (_world, result) => ({ conflicts: result.conflicts.length }),
    },
    {
      id: 'adminRecipeRows.buildRecipeList',
      profile: 'alchemy-signatures',
      description:
        'The GM recipe browser COHORT projection over the signature corpus, bounded to ' +
        `${GM_ROWS} rows. This is the tier the browser model filters, sorts, counts and ` +
        'paginates, so it runs for every matching definition and must stay cheap: since ' +
        'issue 1081 it derives no recipe body, no requirements preview and no activation ' +
        'verdict. The `blockedRows` count below is taken OUTSIDE the timed region, which ' +
        'is the whole point — reading it is what materialises the tier this case proves ' +
        'the cohort no longer pays for.',
      setup: (context) => {
        const recipes = hydrateRecipes(context.modules, context.fixture.recipes.slice(0, GM_ROWS));
        const world = worldFor(context, { recipes });
        // A corpus copy is a `getRecipes` call that materialises a cohort array. Counted on
        // the manager rather than inside `src/`, matching how every other fixture-side
        // counter here rides on the inputs instead of the code under measurement.
        const readRecipes = world.recipeManager.getRecipes.bind(world.recipeManager);
        world.recipeManager.getRecipes = (filters) => {
          context.counters.bump('recipeCorpusCopies');
          return readRecipes(filters);
        };
        // The signature counters are module-level and process-global, so they are zeroed
        // here — between `setup` and the single counted `run` — rather than read as a delta.
        world.modules.signatureCounters.reset();
        return world;
      },
      run: (world) =>
        world.modules.recipeRowProjection.buildRecipeList(
          world.craftingSystemManager,
          world.recipeManager,
          world.system,
          ''
        ),
      counts: (world, list) => ({
        rows: list.recipes.length,
        blockedRows: list.recipes.filter((row) => row.enableBlocked).length,
        ...world.modules.signatureCounters.read(),
      }),
    },
    {
      id: 'adminRecipeRows.browsePage',
      profile: 'alchemy-signatures',
      description:
        'What a GM actually does: project the cohort, then filter, sort, count, paginate ' +
        `and RENDER page 1 of it — ${GM_BROWSER_PAGE_SIZE} rows out of ${GM_ROWS}. This is ` +
        'the case issue 1081 exists to move, and the criteria are the two page-scope ' +
        'counters: one report build for the whole open, and per-row detail work bounded by ' +
        'the page rather than by the cohort.',
      setup: (context) => {
        const recipes = hydrateRecipes(context.modules, context.fixture.recipes.slice(0, GM_ROWS));
        const world = worldFor(context, { recipes });
        const readRecipes = world.recipeManager.getRecipes.bind(world.recipeManager);
        world.recipeManager.getRecipes = (filters) => {
          context.counters.bump('recipeCorpusCopies');
          return readRecipes(filters);
        };
        world.modules.signatureCounters.reset();
        return world;
      },
      run: (world) => {
        const list = world.modules.recipeRowProjection.buildRecipeList(
          world.craftingSystemManager,
          world.recipeManager,
          world.system,
          ''
        );
        const model = world.modules.recipeBrowser.buildRecipeBrowserModel(list.recipes, {
          status: 'all',
          lock: 'all',
          category: 'all',
          sortKey: 'name',
          sortDirection: 'asc',
          groupByCategory: true,
          pageIndex: 0,
          pageSize: GM_BROWSER_PAGE_SIZE,
        });
        // Reading the fields a rendered row renders is what materialises the detail tier,
        // so the timed region covers the same work the browser performs on screen.
        for (const row of model.page) {
          void row.requirementsPreview.length;
          void row.structureLabel;
          void row.incomplete;
          void row.enableBlocked;
        }
        return { list, model };
      },
      counts: (world, { list, model }) => ({
        rows: list.recipes.length,
        pagedRows: model.page.length,
        blockedPageRows: model.page.filter((row) => row.enableBlocked).length,
        ...world.modules.signatureCounters.read(),
      }),
    },
    {
      id: 'adminRecipeRows.sortByAttention',
      profile: 'alchemy-signatures',
      description:
        'The WORST case for the activation gate: the `attention` sort key reads ' +
        '`enableBlocked` for every row in the filtered cohort before pagination, so it ' +
        'cannot be page-scoped and must instead be amortised. `reportBuilds` is the ' +
        `criterion — ${GM_ROWS} rows must still cost ONE full-system audit, not ` +
        `${GM_ROWS} of them.`,
      setup: (context) => {
        const recipes = hydrateRecipes(context.modules, context.fixture.recipes.slice(0, GM_ROWS));
        const world = worldFor(context, { recipes });
        world.modules.signatureCounters.reset();
        return world;
      },
      run: (world) => {
        const list = world.modules.recipeRowProjection.buildRecipeList(
          world.craftingSystemManager,
          world.recipeManager,
          world.system,
          ''
        );
        return world.modules.recipeBrowser.buildRecipeBrowserModel(list.recipes, {
          status: 'all',
          lock: 'all',
          category: 'all',
          sortKey: 'attention',
          sortDirection: 'desc',
          groupByCategory: false,
          pageIndex: 0,
          pageSize: GM_BROWSER_PAGE_SIZE,
        });
      },
      counts: (world, model) => ({
        rows: model.filtered.length,
        blockedRows: model.filtered.filter((row) => row.enableBlocked).length,
        ...world.modules.signatureCounters.read(),
      }),
    },
    {
      id: 'alchemyListing.buildListing',
      profile: 'alchemy-signatures',
      description: 'The alchemy workbench open, bounded to 100 rows of the signature corpus.',
      setup: (context) => {
        const recipes = hydrateRecipes(
          context.modules,
          context.fixture.recipes.slice(0, ALCHEMY_ROWS)
        );
        return worldFor(context, { recipes });
      },
      run: (world) =>
        world.alchemyListing.buildListing({
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
          viewer: world.viewer,
          craftingSystemId: world.system.id,
        }),
      counts: (_world, listing) => ({
        knownRecipes: Array.isArray(listing?.recipes) ? listing.recipes.length : 0,
        chooserSystems: Array.isArray(listing?.systems) ? listing.systems.length : 0,
      }),
    },
  ];
}

/**
 * The dependency-graph cases.
 *
 * `deep` is the DEPTH axis (issue 1082) and it is not a bigger version of the other two. A
 * 20,000-link linear chain is the shape that made the pre-fix layout throw
 * `RangeError: Maximum call stack size exceeded` — its cycle-detection DFS was recursive and
 * unguarded, and it failed at a measured depth of 8,193. That case therefore does not merely
 * get slower without the fix; it does not complete at all, which is why its committed counts
 * are a crash regression guard rather than a performance one.
 */
function graphCases() {
  const shapes = ['sparse', 'dense', 'deep'];
  return shapes.flatMap((shape) => [
    {
      id: `graph.buildRecipeGraph.${shape}`,
      profile: 'recipe-graph',
      description: `Producer/consumer edge derivation over the bounded ${shape} corpus.`,
      setup: (context) => ({
        world: worldFor(context),
        recipes: context.fixture.graphs[shape],
      }),
      run: ({ world, recipes }) =>
        world.modules.graph.buildRecipeGraph(recipes, world.fixture.components),
      counts: (_state, built) => ({ nodes: built.nodes.length, edges: built.edges.length }),
    },
    {
      id: `graph.layoutGraph.${shape}`,
      profile: 'recipe-graph',
      description: `Layered layout + edge paths over the bounded ${shape} graph.`,
      setup: (context) => ({
        world: worldFor(context),
        recipes: context.fixture.graphs[shape],
        // The adjacency-lookup seam (issue 1082). `graphIncomingEdgesExamined` is what makes
        // "layout performs no repeated whole-edge filtering per node" a committed number: the
        // pre-fix ordering pass filtered ALL edges once per node per layer and examined
        // 1,068,168 edge entries on the 3,568-edge dense fixture, so a reintroduced rescan
        // moves this count by orders of magnitude rather than subtly.
        counters: context.counters,
      }),
      // The graph is rebuilt inside the timed region on purpose: `layoutGraph` MUTATES the
      // nodes it is given (x/y/layer), so timing repeated calls over one graph would measure
      // an increasingly pre-solved layout rather than the layout.
      run: ({ world, recipes, counters }) =>
        world.modules.graph.layoutGraph(
          world.modules.graph.buildRecipeGraph(recipes, world.fixture.components),
          { instrumentation: counters }
        ),
      counts: (_state, laid) => ({
        nodes: laid.nodes.length,
        edges: laid.edges.length,
        cycleEdges: laid.edges.filter((edge) => edge.isCycleEdge).length,
        // The depth the layout actually resolved. A chain that silently stopped part-way
        // would still report the right node and edge counts; only this one moves.
        deepestLayer: laid.nodes.reduce((deepest, node) => Math.max(deepest, node.layer), 0),
      }),
    },
  ]);
}

/**
 * The inventory-axis cases — the SERIES, reported at every point of
 * {@link INVENTORY_SERIES} rather than averaged into one number.
 *
 * One data point cannot show super-linear growth, and super-linear growth is the entire defect
 * class. Every case below is generated once per series point against the SAME 5,000-component
 * library and the SAME 20-recipe corpus, so the only thing that differs between `@100` and
 * `@1000` is the held-stack count.
 */
function heldInventoryCases() {
  return INVENTORY_SERIES.flatMap((stacks, seriesIndex) => {
    const suffix = `@${stacks}`;
    const inventoryFor = (context) => context.fixture.inventorySeries[seriesIndex];
    const worldAt = (context, options = {}) =>
      worldFor(context, { inventory: inventoryFor(context), ...options });

    return [
      {
        id: `identity.resolveComponentForItem.miss${suffix}`,
        profile: 'held-inventory',
        description:
          'THE MISS CASE. Items with no Fabricate flags and no matching source reference, ' +
          'against a 5,000-component library: both durable tiers miss and the raw-reference ' +
          'tier scans the library in full before returning null.',
        setup: (context) => ({
          world: worldAt(context),
          items: inventoryFor(context).byKind.unmatched,
        }),
        run: ({ world, items }) => {
          let resolved = 0;
          for (const item of items) {
            if (world.modules.sourceUuid.resolveComponentForItem(item, world.components, world.system.id)) {
              resolved += 1;
            }
          }
          return resolved;
        },
        counts: ({ items }, resolved) => ({ itemsResolved: items.length, matches: resolved }),
      },
      {
        id: `identity.findMatchingComponent.miss${suffix}`,
        profile: 'held-inventory',
        description:
          'The same miss case through the FULL resolver including the name fallback — a ' +
          'SECOND complete library scan per item (essenceResolver -> componentNameMatch).',
        setup: (context) => ({
          world: worldAt(context),
          items: inventoryFor(context).byKind.unmatched,
        }),
        run: ({ world, items }) => {
          world.modules.componentNameMatch.resetNameOnlyMatchTelemetry();
          let resolved = 0;
          for (const item of items) {
            if (world.modules.essenceResolver.findMatchingComponent(item, world.components, world.system.id)) {
              resolved += 1;
            }
          }
          return resolved;
        },
        counts: ({ items }, resolved) => ({ itemsResolved: items.length, matches: resolved }),
      },
      {
        id: `identity.resolveComponentForItem.hit${suffix}`,
        profile: 'held-inventory',
        description:
          'THE HIT CASE, kept separate on purpose. A durable roles-map flag resolves on tier 1; ' +
          'averaging it with the miss case above hides a two-orders-of-magnitude difference.',
        setup: (context) => ({
          world: worldAt(context),
          items: inventoryFor(context).byKind.durable,
        }),
        run: ({ world, items }) => {
          let resolved = 0;
          for (const item of items) {
            if (world.modules.sourceUuid.resolveComponentForItem(item, world.components, world.system.id)) {
              resolved += 1;
            }
          }
          return resolved;
        },
        counts: ({ items }, resolved) => ({ itemsResolved: items.length, matches: resolved }),
      },
      {
        id: `craftingEngine.findComponentItems${suffix}`,
        profile: 'held-inventory',
        description:
          'The craft/salvage execution matcher for ONE component: O(items x components), ' +
          'because itemResolvesToComponent re-runs full candidate resolution per item.',
        setup: (context) => {
          const world = worldAt(context);
          // A component the inventory ACTUALLY holds. Probing one nobody holds would report
          // `matchedItems: 0` forever, which is indistinguishable from an inventory that
          // silently failed to generate.
          const [heldId] = inventoryFor(context).craftingActorComponentIds;
          return { world, component: world.components.find((entry) => entry.id === heldId) };
        },
        run: ({ world, component }) =>
          world.craftingEngine.findComponentItems(world.craftingActor, component, world.system),
        counts: (_state, items) => ({ matchedItems: items.length }),
      },
      {
        id: `craftingEngine.findComponentItems.bulk${suffix}`,
        profile: 'held-inventory',
        description:
          `A bulk salvage/destroy run of ${BULK_ROWS} rows, which calls the matcher ONCE PER ` +
          'ROW — so the run is O(rows x items x components). Bounded at 5 rows because the ' +
          'product is already tens of millions of candidate examinations.',
        setup: (context) => {
          const world = worldAt(context);
          const heldIds = new Set(
            inventoryFor(context).craftingActorComponentIds.slice(0, BULK_ROWS)
          );
          return {
            world,
            rows: world.components.filter((entry) => heldIds.has(entry.id)),
          };
        },
        run: ({ world, rows }) =>
          rows.map((component) =>
            world.craftingEngine.findComponentItems(world.craftingActor, component, world.system)
          ),
        counts: (_state, matches) => ({
          rows: matches.length,
          matchedItems: matches.reduce((total, items) => total + items.length, 0),
        }),
      },
      ...playerAppListingCases({
        profile: 'held-inventory',
        suffix,
        hydratedWorld: (context) =>
          worldAt(context, { recipes: hydrateRecipes(context.modules, context.fixture.recipes) }),
        craftingDescription:
          'The player crafting SUMMARY phase at this inventory size — the corpus-wide browse ' +
          'half only (issue 1075). Corpus pinned at 20 recipes so the ONLY thing varying ' +
          'across the series is held-stack count. The detail phase a real app open also runs ' +
          'is measured on the component-library axis instead (issue 1204).',
        inventoryDescription:
          'The Inventory tab open at this inventory size, same pinned 20-row corpus.',
      }),
    ];
  });
}

/**
 * The two whole-app listing cases every inventory-bearing axis reports, parameterised by the
 * axis rather than restated per profile.
 *
 * Extracted when the component-library axis landed (issue 1204) and gained the same pair. The
 * two copies would have been near-identical, and SonarCloud counts `tests/**` duplication
 * exactly like `src/` — but the stronger reason is that these two cases are the SAME
 * measurement taken along two axes, and a reader comparing the series has to be able to see
 * that they were not measured slightly differently.
 *
 * `hydratedWorld` is the only real parameter. Both builders read `getExecutionSteps()`, which a
 * literal payload does not carry, so every caller hydrates its corpus first.
 *
 * @param {object} options
 * @param {string} options.profile
 * @param {string} options.suffix The series-point suffix, e.g. `@1000` or `.library@5000`.
 * @param {(context: object) => object} options.hydratedWorld
 * @param {string} options.craftingDescription
 * @param {string} options.inventoryDescription
 * @returns {object[]}
 */
function playerAppListingCases({
  profile,
  suffix,
  hydratedWorld,
  craftingDescription,
  inventoryDescription,
}) {
  const openedBy = (world) => ({
    craftingActor: world.craftingActor,
    componentSourceActors: world.sourceActors,
    viewer: world.viewer,
  });
  return [
    {
      id: `craftingListing.buildListing${suffix}`,
      profile,
      description: craftingDescription,
      setup: hydratedWorld,
      run: (world) => world.craftingListing.buildListing(openedBy(world)),
      counts: (_world, listing) => ({
        listedRecipes: listing.summaries.length,
        availableRecipes: listing.counts.available,
      }),
    },
    {
      id: `inventoryListing.buildListing${suffix}`,
      profile,
      description: inventoryDescription,
      setup: hydratedWorld,
      run: (world) => world.inventoryListing.buildListing(openedBy(world)),
      counts: (_world, listing) => ({
        rows: listing.rows.length,
        componentRows: listing.counts.components,
      }),
    },
  ];
}

/**
 * The COMPONENT-LIBRARY axis cases (issue 1204) — the other half of the same series.
 *
 * `heldInventoryCases` above varies items against a pinned library; these vary the library
 * against a pinned 1,000-stack inventory and a pinned 6-recipe corpus. The two together are
 * what make `cost = a*components + b*items` readable as two independent slopes, which is what
 * "not proportional to `items x components`" actually asserts: an additive model produces two
 * straight lines, and a product term makes each series' slope depend on where the OTHER axis
 * was pinned. Neither series alone can distinguish those.
 *
 * All three cases run against `context.fixture` with `components` swapped for the series
 * point's prefix. `createBenchWorld` derives its system from `fixture.system` and wraps
 * `fixture.components` in `countingCandidates`, so overriding that one field is the whole of
 * what varies — the corpus, the inventory, the actors and the managers are rebuilt identically
 * at every point.
 */
function componentLibraryCases() {
  return COMPONENT_LIBRARY_SERIES.flatMap((componentCount, seriesIndex) => {
    const suffix = `.library@${componentCount}`;
    // Every case on this axis wants the same world: this series point's library, the pinned
    // corpus hydrated (all three read `getExecutionSteps`, which a literal payload lacks) and
    // the pinned inventory.
    const hydratedWorldAt = (context) =>
      createBenchWorld({
        modules: context.modules,
        counters: context.counters,
        fixture: {
          ...context.fixture,
          components: context.fixture.componentSeries[seriesIndex],
        },
        recipes: hydrateRecipes(context.modules, context.fixture.recipes),
      });

    return [
      ...playerAppListingCases({
        profile: 'component-library',
        suffix,
        hydratedWorld: hydratedWorldAt,
        craftingDescription:
          'The player crafting SUMMARY phase against this library size — the corpus-wide ' +
          'browse half (issue 1075) with inventory and corpus pinned, so the ONLY thing ' +
          'varying across the series is component count.',
        inventoryDescription:
          'The Inventory tab open against this library size, same pinned inventory.',
      }),
      {
        id: `craftingListing.buildRecipeDetail${suffix}`,
        profile: 'component-library',
        description:
          'Detail hydration for ONE recipe against this library size. `held-inventory` ' +
          'explicitly excludes this phase as "bounded by page size rather than by either ' +
          'axis", which left a real app open half-measured: the inspector opens on the same ' +
          'click as the listing. Measured here because a per-recipe library term would be ' +
          'invisible to both listing cases.',
        setup: (context) => {
          const world = hydratedWorldAt(context);
          // Handed the recipe rather than an id: the summary phase the player app runs first
          // already holds it, and the exact-evaluation cost is identical either way.
          return { world, recipe: world.recipeManager.recipes.values().next().value };
        },
        run: ({ world, recipe }) =>
          world.craftingListing.buildRecipeDetail({
            recipe,
            craftingActor: world.craftingActor,
            componentSourceActors: world.sourceActors,
            viewer: world.viewer,
          }),
        // Non-vacuity of the case itself, and the fields are the ones the model actually
        // carries rather than the ones it reads as though it should. A `null` model (an
        // invisible recipe, a blocked system) reports zero on all three, and so does a model
        // that hydrated but answered "missing materials" for every set — which is exactly the
        // fast-number-for-nothing failure `scaleWorld.js` warns about on this path.
        counts: (_state, model) => {
          const sets = model?.ingredientSets ?? [];
          return {
            hydratedSets: sets.length,
            craftableSets: sets.filter((set) => set.craftability?.canCraft === true).length,
            resolvedIngredientStates: sets.reduce(
              (total, set) => total + (set.craftability?.ingredientStates?.length ?? 0),
              0
            ),
          };
        },
      },
    ];
  });
}

/** Every registered case, in a stable order. */
export const BENCHMARK_CASES = Object.freeze([
  ...simpleCorpusCases(),
  ...richCorpusCases(),
  ...knowledgeCorpusCases(),
  ...alchemyCases(),
  ...graphCases(),
  ...heldInventoryCases(),
  ...componentLibraryCases(),
]);

/**
 * The cases belonging to one profile.
 *
 * @param {string} profile
 * @returns {object[]}
 */
export function casesForProfile(profile) {
  return BENCHMARK_CASES.filter((benchmarkCase) => benchmarkCase.profile === profile);
}

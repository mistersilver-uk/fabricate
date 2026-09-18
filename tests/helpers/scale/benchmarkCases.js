/**
 * The benchmark case registry (issue 1071). `setup(context)` builds whatever the case needs and is
 * NEVER timed.
 */
import { countingEnumerations } from './scaleCounters.js';
import { INVENTORY_SERIES } from './scaleInventory.js';
import { COMPONENT_LIBRARY_SERIES } from './scaleProfiles.js';
import { createBenchWorld, hydrateRecipes, useHydratedRecipes } from './scaleWorld.js';

// STATICALLY IMPORTED, unlike `worldScopeStores` and `scopedEntityReads`, which the module bag
// loads lazily because they reach `src/config/settings.js` and that must not be evaluated before
// `installFoundryEnv()`.
import { createWorldVocabularyStore } from '../../../src/systems/WorldVocabularyStore.js';
import { buildWorldScopeState } from '../../../src/ui/svelte/stores/worldScopeProjection.js';

/** How many rows a bulk salvage/destroy run is simulated at. Bounded: the run is O(rows x items x components). */
const BULK_ROWS = 5;

/**
 * The CORPUS-axis series for the player crafting open: 25 / 50 / 100 rows against a token 20-stack
 * inventory.
 */
const CORPUS_ROW_SERIES = Object.freeze([25, 50, 100]);

/** How many world-scope entities each issue-1359 case seeds (issue 1359, epic 1357). */
const WORLD_SCOPE_ENTITIES = 2500;

/**
 * How many times the scoped union case REPEATS the same read. The point is not the wall clock: it
 * is that `identityIndexBuilds` stays at ONE across all of them.
 */
const SCOPED_UNION_READS = 25;

/** The prefix that turns an in-system component id into one the in-system array does NOT carry. */
const WORLD_ONLY_ID_PREFIX = 'world-only-';

/**
 * The world component scope payload for one bench world, in the PERSISTED shape.
 *
 * @param {boolean} [options.overlap] Whether the roster reuses in-system ids. Defaults to `true`.
 */
function worldComponentScope(world, { overlap = true } = {}) {
  const scoped = world.fixture.components.slice(0, WORLD_SCOPE_ENTITIES);
  const entities = [];
  const defaults = {};
  const membership = {};
  for (const component of scoped) {
    const id = overlap ? component.id : `${WORLD_ONLY_ID_PREFIX}${component.id}`;
    entities.push({ id, name: component.name, img: component.img });
    defaults[id] = { id, category: component.category };
    membership[`${id}|${world.system.id}`] = {
      entityId: id,
      systemId: world.system.id,
      inherit: {},
    };
  }
  return { entities, defaults, membership };
}

/**
 * A real `CraftingSystemManager` holding the bench system, with a LOADED world component scope
 * store injected — the seam `src/main.js` fills from `game.fabricate`.
 */
function scopedManager(world) {
  world.settings.set('componentScope', worldComponentScope(world));
  const store = world.modules.worldScopeStores.createComponentScopeStore();
  store.load();
  const manager = new world.modules.CraftingSystemManager(world.recipeManager, {
    componentScopeStore: store,
  });
  manager.systems = new Map([[world.system.id, world.system]]);
  manager.initialized = true;
  return { manager, store };
}

/** How many times the world-scope publish is measured (issue 1392, epic 1357, PR 7a). */
const WORLD_SCOPE_PUBLISHES = 5;

/** The world vocabulary payload for one bench world, derived from the fixture's OWN vocabulary. */
function worldVocabularyPayload(world) {
  const entry = (name) => ({ id: String(name).trim().toLowerCase(), name: String(name) });
  const distinct = (values) => [...new Set(values.filter(Boolean))];
  return {
    componentCategories: distinct(world.fixture.components.map((c) => c.category)).map(entry),
    componentTags: distinct(world.fixture.components.flatMap((c) => c.tags ?? [])).map(entry),
    recipeCategories: distinct(world.fixture.recipes.map((r) => r.category)).map(entry),
  };
}

/** Rows the alchemy workbench listing is bounded to. */
const ALCHEMY_ROWS = 100;

/** Rows the GM recipe-browser case is bounded to (issue 1074). */
const GM_ROWS = 200;

/** The recipe library's default page size (`RECIPE_DEFAULT_PAGE_SIZE`). */
const GM_BROWSER_PAGE_SIZE = 25;

/** Recipes the adversarial ingredient-solver case runs. */
const SOLVER_RECIPES = 12;

/** Serialized payload bytes for a world-setting write. */
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

/** The corpus-axis cases: filtering, browser models, serialization, normalization. */
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
        // The browser model consumes PROJECTED rows, not domain components: it reads `essences` as
        // an array of `{id, name}` and `salvageSummary.resultGroupCount`, where the domain
        // component carries an essence-quantity MAP and a full salvage definition.
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
    {
      id: 'craftingSystemManager.scopedUnionRead',
      profile: 'simple-corpus',
      description:
        'The world-scope READ UNION (issue 1359) over a 2,500-entity world component corpus ' +
        'unioned with the 5,000-component in-system library, read ' +
        `${SCOPED_UNION_READS} times through the REAL CraftingSystemManager. ` +
        'identityIndexBuilds must stay at 1: it is the committed proof that the memo is HIT ' +
        'rather than rebuilt per call, and scopedUnionWorldWins is the committed proof that the ' +
        'WORLD half participated at all.',
      setup: (context) => {
        const world = worldFor(context);
        return { world, ...scopedManager(world) };
      },
      run: ({ manager, world }) => {
        let union = null;
        for (let read = 0; read < SCOPED_UNION_READS; read++) {
          union = manager.resolveScopedComponents(world.system);
        }
        return union;
      },
      counts: ({ world }, union) => ({
        scopedUnionReads: SCOPED_UNION_READS,
        scopedUnionRows: union.length,
        // THE ROW COUNT ALONE IS BLIND. This roster overlaps the in-system array exactly, so
        // `scopedUnionRows` is 5,000 whether the world half participated or was dropped on the
        // floor.
        scopedUnionWorldWins: union.filter((entry) => entry.member === true).length,
        worldScopeEntities: WORLD_SCOPE_ENTITIES,
        // The join payload cost of the new key, at this scale.
        worldScopeBytes: settingBytes(world.settings, 'componentScope'),
      }),
      teardown: ({ world }) => {
        // The harness shares ONE settings map across every case in a profile, so a case that left
        // this key behind would silently change what `craftingSystemManager.normalizeImport` and
        // `craftingSystemManager.save` measure afterwards.
        world.settings.delete('componentScope');
      },
    },
    {
      id: 'craftingSystemManager.normalizeImport.worldScoped',
      profile: 'simple-corpus',
      description:
        'The other half of issue 1359: initialize() runs _normalizeSystem over the whole ' +
        '5,000-component library while the world component scope is SEEDED with a roster of ' +
        '2,500 ids the in-system array does NOT carry, so scopedBasisComponentIds is 7,500 — ' +
        'the committed proof that the Valid Id Basis really does union the world roster with ' +
        'the in-system array instead of taking its degenerate branch.',
      setup: (context) => {
        const world = worldFor(context);
        // DISJOINT, unlike the read-union case above.
        world.settings.set('componentScope', worldComponentScope(world, { overlap: false }));
        world.settings.set('craftingSystems', [world.system]);
        const store = world.modules.worldScopeStores.createComponentScopeStore();
        store.load();
        return { world, store };
      },
      run: async ({ world, store }) => {
        const manager = new world.modules.CraftingSystemManager(world.recipeManager, {
          componentScopeStore: store,
        });
        await manager.initialize();
        return manager;
      },
      counts: ({ world }, manager) => ({
        normalizedSystems: manager.systems.size,
        normalizedComponents: [...manager.systems.values()].reduce(
          (total, system) => total + (system.components?.length ?? 0),
          0
        ),
        // MANAGER-DERIVED, and the only count here that can move.
        scopedBasisComponentIds: manager._scopeBasis(manager.getSystem(world.system.id))
          .componentIds.size,
        worldScopeEntities: WORLD_SCOPE_ENTITIES,
        worldScopeBytes: settingBytes(world.settings, 'componentScope'),
      }),
      teardown: ({ world }) => {
        world.settings.delete('componentScope');
      },
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
    // APPENDED, never inserted ahead of the cases above.
    {
      id: 'craftingSystemManager.getComponentsForSystem.worldScoped',
      profile: 'simple-corpus',
      description:
        'THE REPOINTED READ ACCESSOR (issue 1370). `getComponentsForSystem` is the door every ' +
        'manager-holding reader now enters through, and this reads it ' +
        `${SCOPED_UNION_READS} times against a SEEDED 2,500-entity world corpus unioned with ` +
        'the 5,000-component in-system library. identityIndexBuilds must stay at 1: the ' +
        'accessor is called once per read and a memo rebuilt per call would be 25 builds, each ' +
        'O(world entities + memberships), on a path the crafting UI opens on.',
      setup: (context) => {
        const world = worldFor(context);
        return { world, ...scopedManager(world) };
      },
      run: ({ manager, world }) => {
        let components = null;
        for (let read = 0; read < SCOPED_UNION_READS; read++) {
          components = manager.getComponentsForSystem(world.system.id);
        }
        return components;
      },
      counts: ({ world }, components) => ({
        scopedUnionReads: SCOPED_UNION_READS,
        scopedUnionRows: components.length,
        // THE ROW COUNT ALONE IS BLIND, exactly as in `scopedUnionRead`: this roster overlaps the
        // in-system array, so the row count is 5,000 whether or not the world half participated
        // (issue 1370).
        scopedUnionMergedRows: components.filter((entry) => entry.member === true).length,
        worldScopeEntities: WORLD_SCOPE_ENTITIES,
        worldScopeBytes: settingBytes(world.settings, 'componentScope'),
      }),
      teardown: ({ world }) => {
        // The harness shares ONE settings map across a profile, so a case that left this key
        // behind would change what every later case measures.
        world.settings.delete('componentScope');
      },
    },
    {
      id: 'scopedEntityReads.resolvedComponentsFor.worldScoped',
      profile: 'simple-corpus',
      description:
        'THE OTHER SPELLING of the same door (issue 1370): the shared read seam, taken by the ' +
        'readers that hold a system RECORD and no manager. Same corpus, same read count, and ' +
        'the same committed identityIndexBuilds of 1 — the two spellings share ONE body, so a ' +
        'change that memoized only the manager path would move this number and not the other.',
      setup: (context) => {
        const world = worldFor(context);
        world.settings.set('componentScope', worldComponentScope(world));
        const store = world.modules.worldScopeStores.createComponentScopeStore();
        store.load();
        return { world, corpus: store.corpus() };
      },
      run: ({ world, corpus }) => {
        let components = null;
        for (let read = 0; read < SCOPED_UNION_READS; read++) {
          components = world.modules.scopedEntityReads.resolvedComponentsFor(world.system, corpus);
        }
        return components;
      },
      counts: ({ world }, components) => ({
        scopedUnionReads: SCOPED_UNION_READS,
        scopedUnionRows: components.length,
        // See the sibling case above for why this is not spelled `scopedUnionWorldWins`.
        scopedUnionMergedRows: components.filter((entry) => entry.member === true).length,
        worldScopeEntities: WORLD_SCOPE_ENTITIES,
        worldScopeBytes: settingBytes(world.settings, 'componentScope'),
      }),
      teardown: ({ world }) => {
        world.settings.delete('componentScope');
      },
    },
    // APPENDED, never inserted ahead of the cases above — see the append rule stated on the
    // issue-1370 case earlier in this profile.
    {
      id: 'worldScopeProjection.buildWorldScopeState',
      profile: 'simple-corpus',
      description:
        'THE MANAGER WORLD PUBLISH (issue 1392). `buildWorldScopeState` runs on every ' +
        'settings-bridge reload and every crafting data change, and the World Vocabulary leg ' +
        `added a reference count over the whole world to it. Measured ${WORLD_SCOPE_PUBLISHES} ` +
        'times against a SEEDED 2,500-entity world component corpus, the 5,000-component ' +
        'in-system library and the whole 10,000-recipe corpus. The pass is O(records) against a ' +
        'shipped `_worldEssenceUsage` that is O(essences x records), but it is MEASURED rather ' +
        'than assumed — and `referencedVocabularyRows` is what stops the number being reported ' +
        'for a join that matched nothing.',
      setup: (context) => {
        const world = worldFor(context);
        world.settings.set('componentScope', worldComponentScope(world));
        const component = world.modules.worldScopeStores.createComponentScopeStore();
        component.load();
        world.settings.set('worldVocabulary', worldVocabularyPayload(world));
        // The SAME `Map` the scope store above reads through `game.settings`, bound explicitly
        // because this store takes its seams by injection and has no module-level default.
        const vocabulary = createWorldVocabularyStore({
          getSetting: (key) => world.settings.get(key),
          setSetting: async (key, value) => world.settings.set(key, value),
        });
        vocabulary.load();
        return { world, stores: { component, vocabulary } };
      },
      run: ({ world, stores }) => {
        let published = null;
        for (let publish = 0; publish < WORLD_SCOPE_PUBLISHES; publish++) {
          published = buildWorldScopeState({
            stores,
            systems: [world.system],
            recipes: world.fixture.recipes,
          });
        }
        return published;
      },
      counts: ({ world }, published) => {
        const vocabulary = published.worldScope.vocabulary;
        const rows = [
          ...vocabulary.componentCategories,
          ...vocabulary.componentTags,
          ...vocabulary.recipeCategories,
        ];
        return {
          worldScopePublishes: WORLD_SCOPE_PUBLISHES,
          worldVocabularyTotal: vocabulary.total,
          worldVocabularyRows: rows.length,
          // NON-DEGENERACY. The row count alone is blind: it is the same whether the reference
          // counter matched every entry or none of them.
          referencedVocabularyRows: rows.filter((entry) => entry.totalUsage > 0).length,
          gatedVocabularyRows: rows.filter((entry) => entry.silentlyDeletable === false).length,
          worldScopeEntries: published.worldScope.component.entries.length,
          worldVocabularyBytes: settingBytes(world.settings, 'worldVocabulary'),
        };
      },
      teardown: ({ world }) => {
        // The harness shares ONE settings map across a profile, so a case that left either key
        // behind would change what every later case measures.
        world.settings.delete('componentScope');
        world.settings.delete('worldVocabulary');
      },
    },
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
      // `searchNodes` is the acceptance number for #1083 and is read straight off the seam #1072
      // exposed (`searchStats`), never re-derived here.
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
        // A corpus copy is a `getRecipes` call that materialises a cohort array.
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

/** Crafting runs the Journal case projects, split across its two phases. */
const JOURNAL_ACTIVE_RUNS = 25;
const JOURNAL_HISTORY_RUNS = 25;

/** Where in the corpus the Journal's runs are drawn from, and it is not the front. */
const JOURNAL_RUN_OFFSET = 200;

/** One synthetic crafting run per recipe, in the shape `RunJournalBuilder` projects. */
function journalRuns(recipes, systemId, phase) {
  return recipes.map((recipe, index) => ({
    id: `${phase}-run-${index}`,
    recipeId: recipe.id,
    craftingSystemId: systemId,
    status: phase === 'history' ? 'succeeded' : 'inProgress',
    startedAt: 0,
    updatedAt: 0,
    finishedAt: phase === 'history' ? 0 : null,
    currentStepIndex: 0,
    steps: [{ stepId: `${recipe.id}-s0`, stepName: 'Brew', index: 0, status: 'inProgress' }],
  }));
}

/** THE ALCHEMY REVEAL PATH (issue 1228). */
function alchemyKnowledgeCases() {
  return [
    {
      id: 'alchemyListing.buildListing.itemMode',
      profile: 'alchemy-knowledge',
      description:
        'The alchemy workbench open on an `item`-visibility-mode discipline: 500 book-gated ' +
        'signatures, 4 of 8 books held, 200 held stacks. Reveal is evaluated TWICE per recipe ' +
        '(the chooser summary and the active panel), and before issue 1228 each of those ' +
        're-enumerated every source actor\'s whole inventory. `candidateItemOffers` is the ' +
        'committed criterion; `knownRecipes` is the non-vacuity guard beside it, because a ' +
        'workbench that revealed nothing would report a fast number for a listing that ' +
        'answered nothing (issue 1217 records exactly that state on `alchemy-signatures`).',
      setup: (context) => {
        const world = worldFor(context);
        world.modules.visibilityCounters.reset();
        return world;
      },
      run: (world) =>
        world.alchemyListing.buildListing({
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
          viewer: world.viewer,
          craftingSystemId: world.system.id,
        }),
      counts: (world, listing) => ({
        knownRecipes: listing.recipes.length,
        undiscoveredRecipes: listing.undiscoveredCount,
        chooserSystems: listing.systems.length,
        ownedComponentRows: listing.components.length,
        ...world.modules.visibilityCounters.read(),
      }),
    },
    {
      id: 'runJournal.buildListing',
      profile: 'alchemy-knowledge',
      description:
        `The player Journal open with ${JOURNAL_ACTIVE_RUNS} active and ` +
        `${JOURNAL_HISTORY_RUNS} historical crafting runs of book-gated alchemy recipes. ` +
        'Redaction asks the visibility service whether the viewer may see each run\'s recipe, ' +
        'which is the same per-recipe candidate walk the workbench makes — one whole inventory ' +
        'enumeration per run before issue 1228.',
      setup: (context) => {
        const world = worldFor(context);
        const systemId = world.system.id;
        const corpus = context.fixture.recipes;
        const split = JOURNAL_RUN_OFFSET + JOURNAL_ACTIVE_RUNS;
        const active = journalRuns(corpus.slice(JOURNAL_RUN_OFFSET, split), systemId, 'active');
        const history = journalRuns(
          corpus.slice(split, split + JOURNAL_HISTORY_RUNS),
          systemId,
          'history'
        );
        const journal = new world.modules.RunJournalBuilder({
          craftingRunManager: { getActiveRuns: () => active, getRunHistory: () => history },
          recipeManager: world.recipeManager,
          recipeVisibility: world.recipeVisibility,
          resolutionModeService: world.resolutionModeService,
          getSystem: (id) => world.craftingSystemManager.getSystem(id),
          getViewer: () => world.viewer,
          localize: (key) => key,
          nowWorldTime: () => 0,
          resolveComponentForItem: world.modules.essenceResolver.findMatchingComponent,
        });
        world.modules.visibilityCounters.reset();
        return { world, journal };
      },
      run: ({ world, journal }) => journal.buildListing({ actor: world.craftingActor }),
      counts: ({ world }, listing) => ({
        activeRuns: listing.activeRuns.length,
        historyRuns: listing.history.length,
        // Non-vacuity of the redaction question itself: a pass in which every run were
        // redacted (or none were) would still report the right run counts, and only this
        // split shows the gate answering both ways over the corpus.
        redactedRuns: [...listing.activeRuns, ...listing.history].filter((run) => run.redacted)
          .length,
        ...world.modules.visibilityCounters.read(),
      }),
    },
    {
      id: 'craftingListing.buildListing.bookResidue',
      profile: 'alchemy-knowledge',
      description:
        'The MAIN player crafting screen against a system that shows its whole library but ' +
        'still carries recipe items — a world migrated off `item` visibility, or a GM who ' +
        'authored books and then opened the library. `global` mode leaves `access.knowledge` ' +
        'null, so the per-row EXHAUSTION read has no evidence from the visibility pass to ' +
        'answer from, and falls through to its own candidate collection once per visible row. ' +
        'Runs the SAME fixture as the two cases above with only the two mode fields ' +
        'overridden, so a reader comparing the three is comparing one corpus and one ' +
        'inventory rather than three.',
      setup: (context) => {
        const world = worldFor(context, {
          fixture: {
            ...context.fixture,
            system: {
              ...context.fixture.system,
              // The ONLY two fields that differ from the profile's own system.
              resolutionMode: 'simple',
              visibilityMode: 'global',
            },
          },
        });
        world.modules.visibilityCounters.reset();
        return world;
      },
      run: (world) =>
        world.craftingListing.buildListing({
          craftingActor: world.craftingActor,
          componentSourceActors: world.sourceActors,
          viewer: world.viewer,
        }),
      counts: (world, listing) => ({
        listedRecipes: listing.summaries.length,
        availableRecipes: listing.counts.available,
        // The exhaustion ANSWER, committed as an answer-equality term rather than as a non-vacuity
        // one, and it reads ZERO: this profile authors no use caps, so every held book is uncapped
        // and no row is exhausted.
        exhaustedRows: listing.summaries.filter((summary) => summary.exhausted === true).length,
        ...world.modules.visibilityCounters.read(),
      }),
    },
  ];
}

/** The dependency-graph cases (issue 1082). */
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
        // The adjacency-lookup seam (issue 1082).
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
 * The inventory-axis cases — the SERIES, reported at every point of {@link INVENTORY_SERIES} rather
 * than averaged into one number.
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
 * The two whole-app listing cases every inventory-bearing axis reports, parameterised by the axis
 * rather than restated per profile (issue 1204).
 *
 * @param {string} options.suffix The series-point suffix, e.g. `@1000` or `.library@5000`.
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
 * `heldInventoryCases` above varies items against a pinned library; these vary the library against
 * a pinned 1,000-stack inventory and a pinned 6-recipe corpus.
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
        // Non-vacuity of the case itself, and the fields are the ones the model actually carries
        // rather than the ones it reads as though it should.
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
      // APPENDED after the three cases above, never inserted ahead of them: a profile's FIRST case
      // absorbs a one-off index build over the fixture's shared empty `essenceDefinitions` array,
      // so `identityIndexBuilds` reads `1 + (first case ? 1 : 0)` and
      // `craftingListing.buildListing.library@1000` carries the committed `2`
      // (`benchmarks/README.md`).
      {
        id: `bulkDestroy.resolveRows${suffix}`,
        profile: 'component-library',
        description:
          `A real ${BULK_ROWS}-row BulkDestroyService.run() against this library size — the ` +
          'per-row `system.components` lookup plus the per-row matcher pass, which together ' +
          'were an additive `rows x components` term (issue 1202). Recorded on this axis ' +
          'because the term is invisible on any axis that pins the library.',
        setup: (context) => {
          const world = hydratedWorldAt(context);
          // Rows are taken from the END of THIS series point's library, and that choice is the
          // whole point of the case. The actor therefore holds none of them and every row is
          // correctly classified `depleted`.
          countingEnumerations(world.components, context.counters, {
            key: 'componentEnumerationsWalked',
            entriesKey: 'componentEntriesWalked',
          });
          const deletes = [];
          const service = new context.modules.BulkDestroyService({
            getCraftingSystem: (id) => world.craftingSystemManager.getSystem(id),
            findComponentItems: (actor, component, system) =>
              world.craftingEngine.findComponentItems(actor, component, system),
            // Never reached, and `deleteCalls` below is the proof.
            deleteItems: async (_actor, ids) => {
              deletes.push(ids);
              return [];
            },
          });
          const targets = world.components.slice(-BULK_ROWS).map((component) => ({
            actor: world.craftingActor,
            actorId: world.craftingActor.id,
            actorName: world.craftingActor.name,
            systemId: world.system.id,
            componentId: component.id,
          }));
          return { service, targets, deletes };
        },
        run: ({ service, targets }) => service.run({ targets }),
        counts: ({ deletes }, report) => ({
          rows: report.items.length,
          // Every row must have RESOLVED its component and then found no stacks.
          depletedRows: report.items.filter((item) => item.skipReason === 'depleted').length,
          deleteCalls: deletes.length,
          unitsDeleted: report.unitsDeleted,
        }),
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
  ...alchemyKnowledgeCases(),
  ...graphCases(),
  ...heldInventoryCases(),
  ...componentLibraryCases(),
]);

/** The cases belonging to one profile. */
export function casesForProfile(profile) {
  return BENCHMARK_CASES.filter((benchmarkCase) => benchmarkCase.profile === profile);
}

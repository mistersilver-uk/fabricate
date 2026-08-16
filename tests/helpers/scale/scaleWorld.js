/**
 * The Foundry-free world a scale fixture is measured in (issue 1071).
 *
 * No Foundry installation, licence or runtime is involved: the managers and listing builders
 * under measurement read a handful of globals (`game`, `foundry.utils`, `ui.notifications`)
 * and take every collaborator by injection, so the whole crafting read path runs under plain
 * Node. `tests/helpers/foundryEnv.js` supplies those globals and is reused rather than
 * restated — SonarCloud counts `tests/**` duplication exactly like `src/`.
 *
 * ## Why the `src/` imports are DYNAMIC
 *
 * `installFoundryEnv()` must run before the module graph under measurement is evaluated, and a
 * static `import` is hoisted above every statement in the importing module. Loading `src/`
 * through `await import(...)` inside a function is the repo's established order-safe pattern
 * and keeps this helper usable from a `node:test` suite and from `scripts/` alike.
 *
 * ## Two crafting-system managers, on purpose
 *
 * Read-path cases get a light `getSystem`/`getSystems`/`getRecipesForSystem` stub holding the
 * fixture's already-shaped system. Persistence cases get a REAL `CraftingSystemManager`, whose
 * `_normalizeSystem` and `save()` are themselves the thing being measured. Using the real
 * manager everywhere would fold normalisation cost into every read number; using the stub
 * everywhere would leave both `save()` paths — the #1 risk named in #1070 — unmeasured.
 */
import { installFoundryEnv } from '../foundryEnv.js';

import { countingActor, countingCandidates } from './scaleCounters.js';

let cachedModules = null;

/**
 * Load (once) every `src/` module the harness measures.
 *
 * @returns {Promise<object>} The loaded module namespaces.
 */
export async function loadBenchmarkModules() {
  if (cachedModules) return cachedModules;

  // Install the globals BEFORE the graph is evaluated. `installFoundryEnv` also seeds
  // `game.settings` with a Map-backed store, which is what the two `save()` cases write into.
  const env = installFoundryEnv();
  globalThis.Hooks = { callAll() {}, call() {}, on() {}, once() {} };

  const [
    recipeManagerModule,
    craftingSystemManagerModule,
    craftingListingModule,
    inventoryListingModule,
    alchemyListingModule,
    visibilityModule,
    resolutionModeModule,
    signatureValidatorModule,
    craftingEngineModule,
    recipeModule,
    ingredientSetModule,
    sourceUuidModule,
    essenceResolverModule,
    componentNameMatchModule,
    definitionIndexModule,
    recipeBrowserModule,
    componentBrowserModule,
    paginationModule,
    graphModule,
    recipeRowProjectionModule,
  ] = await Promise.all([
    import('../../../src/systems/RecipeManager.js'),
    import('../../../src/systems/CraftingSystemManager.js'),
    import('../../../src/systems/CraftingListingBuilder.js'),
    import('../../../src/systems/InventoryListingBuilder.js'),
    import('../../../src/systems/AlchemyListingBuilder.js'),
    import('../../../src/systems/RecipeVisibilityService.js'),
    import('../../../src/systems/ResolutionModeService.js'),
    import('../../../src/systems/SignatureValidator.js'),
    import('../../../src/systems/CraftingEngine.js'),
    import('../../../src/models/Recipe.js'),
    import('../../../src/models/IngredientSet.js'),
    import('../../../src/utils/sourceUuid.js'),
    import('../../../src/utils/essenceResolver.js'),
    import('../../../src/utils/componentNameMatch.js'),
    import('../../../src/utils/definitionIndex.js'),
    import('../../../src/utils/recipeBrowserModel.js'),
    import('../../../src/utils/componentBrowserModel.js'),
    import('../../../src/utils/browserPagination.js'),
    import('../../../src/ui/svelte/util/recipeGraphBuilder.js'),
    import('../../../src/ui/svelte/stores/adminRecipeRowProjection.js'),
  ]);

  cachedModules = {
    env,
    RecipeManager: recipeManagerModule.RecipeManager,
    CraftingSystemManager: craftingSystemManagerModule.CraftingSystemManager,
    CraftingListingBuilder: craftingListingModule.CraftingListingBuilder,
    InventoryListingBuilder: inventoryListingModule.InventoryListingBuilder,
    AlchemyListingBuilder: alchemyListingModule.AlchemyListingBuilder,
    RecipeVisibilityService: visibilityModule.RecipeVisibilityService,
    ResolutionModeService: resolutionModeModule.ResolutionModeService,
    SignatureValidator: signatureValidatorModule.SignatureValidator,
    CraftingEngine: craftingEngineModule.CraftingEngine,
    Recipe: recipeModule.Recipe,
    IngredientSet: ingredientSetModule.IngredientSet,
    sourceUuid: sourceUuidModule,
    essenceResolver: essenceResolverModule,
    componentNameMatch: componentNameMatchModule,
    definitionIndex: definitionIndexModule,
    recipeBrowser: recipeBrowserModule,
    componentBrowser: componentBrowserModule,
    pagination: paginationModule,
    graph: graphModule,
    // The GM recipe-browser row projection. A pure leaf under `stores/` with no `.svelte`
    // import, extracted by issue 1090 precisely so a benchmark can call it directly.
    recipeRowProjection: recipeRowProjectionModule,
    signatureCounters: {
      read: signatureValidatorModule.readSignatureCounters,
      reset: signatureValidatorModule.resetSignatureCounters,
    },
  };
  return cachedModules;
}

/**
 * Assemble a measurable world over one fixture and one inventory.
 *
 * `inventory` is a parameter rather than being read off the fixture, because that is exactly
 * what makes the held-inventory axis independent: the same corpus, the same library and the
 * same managers are rebuilt around 100, 500 and 1,000 held stacks with nothing else changed.
 *
 * @param {object} options
 * @param {object} options.modules Result of {@link loadBenchmarkModules}.
 * @param {object} options.fixture Result of `buildScaleFixture`.
 * @param {object} [options.inventory] Defaults to the fixture's own inventory.
 * @param {object[]} [options.recipes] Recipe payloads (or hydrated models) to seed the manager
 *   with. Defaults to the whole corpus; a case bounds it when the path under measurement is a
 *   product of recipes and items and the full corpus would take minutes rather than seconds.
 * @param {{bump: Function, get: Function, snapshot: Function}} options.counters
 * @param {boolean} [options.viewerIsGM]
 * @returns {object} The wired world.
 */
export function createBenchWorld({
  modules,
  fixture,
  inventory = fixture.inventory,
  recipes = fixture.recipes,
  counters,
  viewerIsGM = false,
}) {
  // The component library is the candidate set every identity resolution scans. Wrapping it
  // is what turns "this felt slow" into a committed, machine-invariant number.
  const components = countingCandidates(
    fixture.components,
    counters,
    'componentCandidatesExamined'
  );
  const system = { ...fixture.system, components };

  const recipeManager = new modules.RecipeManager();
  const recipesById = new Map();
  for (const payload of recipes) {
    // Read paths never call a `Recipe` method that a payload lacks except `getExecutionSteps`,
    // which the listing builder needs; hydration for those cases is the caller's choice via
    // `hydrateRecipes`. Store payloads so the ALGORITHMIC profiles stay literal-cheap.
    recipesById.set(payload.id, payload);
  }
  recipeManager.recipes = recipesById;
  recipeManager.initialized = true;

  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getSystems: () => [system],
    getComponentsForSystem: (id) => (id === system.id ? components : []),
    getRecipesForSystem: (id) => recipeManager.getRecipes({ craftingSystemId: id }),
    getRecipeItemDefinition: () => null,
    getRecipeItemDefinitions: (id) =>
      id === system.id ? (system.recipeItemDefinitions ?? []) : [],
    getItems: () => components,
  };

  globalThis.game.fabricate = { getCraftingSystemManager: () => craftingSystemManager };
  globalThis.game.user = { id: 'bench-user', isGM: viewerIsGM, name: 'Bench' };

  const craftingActor = countingActor(inventory.craftingActor, counters, 'craftingActorItems');
  const sourceActors = inventory.sourceActors.map((actor, index) =>
    countingActor(actor, counters, `sourceActor${index}Items`)
  );
  globalThis.game.actors = [craftingActor, ...sourceActors];

  const recipeVisibility = new modules.RecipeVisibilityService(
    recipeManager,
    craftingSystemManager
  );
  const resolutionModeService = new modules.ResolutionModeService(craftingSystemManager);
  const signatureValidator = new modules.SignatureValidator(craftingSystemManager);

  const craftingListing = new modules.CraftingListingBuilder({
    recipeManager,
    recipeVisibility,
    resolutionModeService,
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 0,
    // The summary phase's held-quantity tallies (issue 1075) resolve item identity through
    // the SAME full resolver `main.js` wires and `InventoryListingBuilder` already uses.
    // Wiring it here is what keeps the benchmark honest on both axes: with no resolver the
    // tallies stay empty, every row reports "missing materials", and the case would report a
    // fast number for a listing that answered nothing. It also keeps the candidate-scan
    // counters live on the summary path, since `components` is the counting array.
    resolveComponentForItem: modules.essenceResolver.findMatchingComponent,
  });
  const inventoryListing = new modules.InventoryListingBuilder({
    recipeManager,
    craftingSystemManager,
    recipeVisibility,
    localize: (key) => key,
    nowWorldTime: () => 0,
  });
  const alchemyListing = new modules.AlchemyListingBuilder({
    recipeManager,
    craftingSystemManager,
    signatureValidator,
    recipeVisibility,
    localize: (key) => key,
  });
  const craftingEngine = new modules.CraftingEngine(recipeManager);

  return {
    modules,
    fixture,
    system,
    components,
    recipeManager,
    craftingSystemManager,
    recipeVisibility,
    resolutionModeService,
    signatureValidator,
    craftingListing,
    inventoryListing,
    alchemyListing,
    craftingEngine,
    craftingActor,
    sourceActors,
    viewer: { id: 'bench-user', isGM: viewerIsGM },
    settings: modules.env.settings,
  };
}

/**
 * Hydrate a fixture's recipe payloads into real `Recipe` instances.
 *
 * Kept out of `createBenchWorld` so it is the SERIALIZATION cases that pay for it, and so a
 * profile's declared construction (`literal` vs `model`) is honoured rather than assumed.
 *
 * @param {object} modules
 * @param {object[]} payloads
 * @returns {object[]}
 */
export function hydrateRecipes(modules, payloads) {
  return payloads.map((payload) => modules.Recipe.fromJSON(payload));
}

/**
 * Swap a world's recipe map for hydrated models, so `RecipeManager.save()` serializes real
 * `Recipe#toJSON` output rather than the payloads it was seeded with.
 *
 * @param {object} world
 * @param {object[]} recipes
 * @returns {void}
 */
export function useHydratedRecipes(world, recipes) {
  world.recipeManager.recipes = new Map(recipes.map((recipe) => [recipe.id, recipe]));
}

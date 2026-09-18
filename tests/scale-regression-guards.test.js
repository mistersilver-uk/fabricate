/**
 * Deterministic scale regression guards (issue 1072). A wall-clock assertion is not a regression
 * guard, it is a flaky test — CI timing varies far more than the effects worth catching.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import {
  countingActor,
  countingCandidates,
  countingEnumerations,
  countCalls,
} from './helpers/scale/scaleCounters.js';
import {
  atMostLinear,
  countingFacade,
  countingSettings,
  createOperationCounters,
} from './helpers/scale/scaleProbes.js';
import {
  makeActor,
  makeBookGatedRecipe,
  makeBookGatedSystem,
  makeBookHoldingActor,
  makeCraftingSystem,
  makeListingRecipe,
  makeSignatureRecipe,
  makeSystemManager,
  scaleBookUuid,
} from './helpers/scale/scaleGuardFixtures.js';

installFoundryEnv();

const { AlchemyListingBuilder } = await import('../src/systems/AlchemyListingBuilder.js');
const { RunJournalBuilder } = await import('../src/systems/RunJournalBuilder.js');
const { RecipeVisibilityService, readVisibilityCounters, resetVisibilityCounters } = await import(
  '../src/systems/RecipeVisibilityService.js'
);
const { CraftingListingBuilder } = await import('../src/systems/CraftingListingBuilder.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { SignatureValidator, readSignatureCounters, resetSignatureCounters } = await import(
  '../src/systems/SignatureValidator.js'
);
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { readIdentityCounters, resetIdentityCounters } = await import(
  '../src/utils/definitionIndex.js'
);
const { findMatchingComponent } = await import('../src/utils/essenceResolver.js');

const PLAYER = { id: 'user-1', isGM: false };

// Guard 1 & 2 — the player listing path

/**
 * Build and measure one player Crafting listing. `componentResolutions` counts calls to the
 * injected resolver itself, which is the ONE seam the per-item path must cross (issue 1204).
 */
function measureListing({
  totalRecipes,
  visibleRecipes,
  componentCount = 8,
  itemCount = 10,
  setCount = 1,
}) {
  const counters = createOperationCounters();
  const authored = makeCraftingSystem({ componentCount });
  const system = {
    ...authored,
    components: countingEnumerations(
      countingCandidates(authored.components, counters, 'componentCandidatesExamined'),
      counters,
      { key: 'componentCandidatesExamined', entriesKey: 'componentEntriesWalked' }
    ),
  };
  const recipes = Array.from({ length: totalRecipes }, (_, index) =>
    makeListingRecipe({ id: `r-${index}`, systemId: system.id, setCount })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const recipeManager = new RecipeManager({ getCraftingSystemManager: () => systemManager });

  // The per-item seam, counted on the seam itself. `countCalls` replaces the property with a
  // counting wrapper in place, so the builder below is handed the wrapper and not the original.
  const resolver = { resolveComponentForItem: findMatchingComponent };
  countCalls(resolver, 'resolveComponentForItem', counters, 'componentResolutions');

  const builder = new CraftingListingBuilder({
    recipeManager: countingFacade(recipeManager, counters, {
      prefix: 'recipeManager',
      methods: ['evaluateCraftability'],
    }),
    recipeVisibility: {
      getVisibleRecipes: () =>
        recipes.slice(0, visibleRecipes).map((recipe) => ({ recipe, access: { reason: 'ok' } })),
      isKnowledgeItemExhausted: () => false,
    },
    resolutionModeService: new ResolutionModeService(systemManager),
    craftingSystemManager: systemManager,
    localize: (key) => key,
    nowWorldTime: () => 0,
    // The one seam through which the summary phase reaches the component library.
    resolveComponentForItem: resolver.resolveComponentForItem,
  });

  const craftingActor = countingActor(makeActor({ itemCount }), counters, 'actorItems');
  // `definitionIndex`'s counters are module-global, so they are zeroed immediately before the
  // measured call and read immediately after.
  resetIdentityCounters();
  const listing = builder.buildListing({ craftingActor, viewer: PLAYER });
  const summaryIdentity = readIdentityCounters();

  return {
    counters,
    listing,
    summaryIdentity,
    /**
     * Every candidate the SUMMARY phase examined against the component library, however the
     * examination was expressed. Read eagerly, before any `hydrate()` can add to it.
     */
    libraryExaminations:
      counters.get('componentCandidatesExamined') +
      Math.max(
        0,
        counters.get('componentEntriesWalked') - summaryIdentity.indexBuilds * componentCount
      ) +
      summaryIdentity.candidatesExamined,
    /**
     * How many times the SUMMARY phase crossed the per-item component-resolution seam. Read
     * eagerly for the same reason as {@link libraryExaminations}.
     */
    componentResolutions: counters.get('componentResolutions'),
    // The DETAIL phase for one row (issue 1075).
    hydrate: (index = 0) =>
      builder.buildRecipeDetail({
        recipe: recipes[index],
        craftingActor,
        viewer: PLAYER,
      }),
  };
}

describe('issue 1072 guard — player listing cost tracks what is VISIBLE, not the corpus', () => {
  it('never evaluates craftability for a recipe the viewer cannot see', () => {
    // The headline criterion: opening the player app must not do work proportional to the whole
    // installed corpus.
    const { counters, listing, hydrate } = measureListing({ totalRecipes: 40, visibleRecipes: 5 });

    assert.equal(listing.summaries.length, 5, 'fixture must project only the visible recipes');
    assert.equal(
      counters.get('recipeManagerEvaluateCraftability'),
      0,
      'the summary phase must not evaluate exact craftability for ANY row'
    );

    const detail = hydrate(0);
    const evaluations = counters.get('recipeManagerEvaluateCraftability');
    assert.ok(detail, 'non-vacuity: the detail phase must have produced a model');
    assert.ok(evaluations > 0, 'non-vacuity: the probe must actually be able to count');
    assert.ok(
      evaluations <= 2,
      `hydrating ONE recipe with 1 set evaluated craftability ${evaluations} times ` +
        `(budget: one per set plus one for the craft button). A count near the visible set ` +
        `means detail hydration stopped being per-recipe.`
    );
  });

  it('never examines the component library once per held item', () => {
    // THE `items x components` GUARD (issue 1204), and the one this file previously only claimed to
    // have.
    const CONTROL_ITEMS = 10;
    const SCALED_ITEMS = 40;
    const SMALL_LIBRARY = 64;
    const LARGE_LIBRARY = 256;
    const at = (componentCount, itemCount) =>
      measureListing({ totalRecipes: 10, visibleRecipes: 5, componentCount, itemCount });

    const smallLibrary = at(SMALL_LIBRARY, CONTROL_ITEMS);
    const smallLibraryFatInventory = at(SMALL_LIBRARY, SCALED_ITEMS);
    const largeLibrary = at(LARGE_LIBRARY, CONTROL_ITEMS);
    const largeLibraryFatInventory = at(LARGE_LIBRARY, SCALED_ITEMS);

    // NON-VACUITY, stated on the ITEM axis, which is the axis the equalities below are stated on.
    // Counting the SEAM cannot be faked that way.
    assert.equal(
      smallLibrary.componentResolutions,
      CONTROL_ITEMS,
      `a ${CONTROL_ITEMS}-item inventory crossed the component-resolution seam ` +
        `${smallLibrary.componentResolutions} times. Zero means the summary phase never reaches ` +
        `the component library and every equality below is vacuous; more than one per held ` +
        `document means the resolution stopped being once-per-item.`
    );
    assert.equal(
      smallLibraryFatInventory.componentResolutions,
      SCALED_ITEMS,
      `a ${SCALED_ITEMS}-item inventory crossed the component-resolution seam ` +
        `${smallLibraryFatInventory.componentResolutions} times; the budget is one per held ` +
        `document. Asserted at both item counts so the seam is proven live on the axis the ` +
        `equalities below hold it flat on.`
    );
    // The library axis, kept because it is cheap and still true — a growing library must cost
    // more to index — but NOT relied on for non-vacuity, for the reason above.
    assert.ok(
      largeLibrary.libraryExaminations > smallLibrary.libraryExaminations,
      `growing the library from ${SMALL_LIBRARY} to ${LARGE_LIBRARY} components left library ` +
        `examinations at ${smallLibrary.libraryExaminations}. The one-off identity index is ` +
        `O(library), so this number must track library size.`
    );

    // TRAP, for whoever edits `makeActor` next.
    assert.equal(
      smallLibraryFatInventory.libraryExaminations,
      smallLibrary.libraryExaminations,
      `quadrupling held items over a ${SMALL_LIBRARY}-component library moved library ` +
        `examinations from ${smallLibrary.libraryExaminations} to ` +
        `${smallLibraryFatInventory.libraryExaminations}. Per-item library work is the ` +
        `items x components term.`
    );
    assert.equal(
      largeLibraryFatInventory.libraryExaminations,
      largeLibrary.libraryExaminations,
      `the same quadrupling over a ${LARGE_LIBRARY}-component library moved library ` +
        `examinations from ${largeLibrary.libraryExaminations} to ` +
        `${largeLibraryFatInventory.libraryExaminations}. Asserted at two library sizes on ` +
        `purpose: a per-item cost that is proportional to the library is the product term, and ` +
        `it is 4x more visible here than above.`
    );

    // The same defect stated on its cause rather than on its symptom, and kept LAST so the
    // equalities above are what a red run reports first.
    assert.ok(
      smallLibrary.summaryIdentity.indexBuilds <= 1,
      `one listing pass built the identity index ` +
        `${smallLibrary.summaryIdentity.indexBuilds} times. The O(library) walk is paid once ` +
        `per open, not once per row and not once per held item.`
    );
  });

  it('scans the inventory the same number of times regardless of library size', () => {
    // The weaker, genuinely library-INDEPENDENT halves.
    const small = measureListing({ totalRecipes: 10, visibleRecipes: 5, componentCount: 4 });
    const large = measureListing({ totalRecipes: 10, visibleRecipes: 5, componentCount: 64 });

    // The inventory half, measured on the SUMMARY phase — read before hydrating, so the
    // detail phase's own reads cannot be mistaken for a summary-phase regression.
    const summaryScans = small.counters.get('actorItemsScanned');
    assert.ok(summaryScans > 0, 'non-vacuity: the summary phase really did walk the inventory');
    assert.equal(
      large.counters.get('actorItemsScanned'),
      summaryScans,
      'inventory scanning must not depend on component-library size (the items x components term)'
    );

    // The craftability half is measured on the DETAIL phase, because since #1075 the summary phase
    // evaluates exact craftability ZERO times BY CONSTRUCTION.
    small.hydrate(0);
    large.hydrate(0);
    const evaluations = small.counters.get('recipeManagerEvaluateCraftability');
    assert.ok(evaluations > 0, 'non-vacuity: hydrating one recipe must actually evaluate');
    assert.equal(
      large.counters.get('recipeManagerEvaluateCraftability'),
      evaluations,
      'craftability evaluations must not depend on component-library size'
    );
  });

  it('re-reads the inventory at most linearly in held items', () => {
    // The `recipes × items` product term, measured on the axis the field report hit: a test
    // character carrying hundreds of stacks.
    const base = measureListing({ totalRecipes: 10, visibleRecipes: 5, itemCount: 10 });
    const scaled = measureListing({ totalRecipes: 10, visibleRecipes: 5, itemCount: 40 });

    const baseline = base.counters.get('actorItemsScanned');
    assert.ok(baseline > 0, 'non-vacuity: the actor probe must have counted item reads');

    const verdict = atMostLinear({
      baseline,
      scaled: scaled.counters.get('actorItemsScanned'),
      factor: 4,
      axis: 'held items',
      what: 'listing inventory scanning',
    });
    assert.ok(verdict.ok, verdict.message);
  });

  it('does not re-read the inventory per visible recipe AT ALL', () => {
    // The other half of the same product, scaled independently so a regression can be attributed to
    // one axis.
    const base = measureListing({ totalRecipes: 40, visibleRecipes: 4, itemCount: 10 });
    const scaled = measureListing({ totalRecipes: 40, visibleRecipes: 16, itemCount: 10 });

    const baseline = base.counters.get('actorItemsScanned');
    assert.ok(baseline > 0, 'non-vacuity: the actor probe must have counted item reads');
    assert.equal(
      scaled.counters.get('actorItemsScanned'),
      baseline,
      `quadrupling the visible recipes moved inventory scanning from ${baseline} to ` +
        `${scaled.counters.get('actorItemsScanned')}. The summary phase must read the ` +
        `inventory once per pass, not once per recipe.`
    );

    // Non-vacuity of the CONSTANT itself: the same counter still moves on the axis it is SUPPOSED
    // to move on.
    const moreItems = measureListing({ totalRecipes: 40, visibleRecipes: 4, itemCount: 40 });
    assert.ok(
      moreItems.counters.get('actorItemsScanned') > baseline,
      'non-vacuity: scanning still tracks the item axis, so the equality is a property'
    );
  });
});

// Guard 3 — the alchemy signature audit

/** Count the pairwise signature comparisons one full-system audit performs. */
function measureAudit({ enabled, disabled = 0, componentCount = 16 }) {
  const counters = createOperationCounters();
  const system = makeCraftingSystem({ componentCount, resolutionMode: 'alchemy' });
  const recipes = [
    ...Array.from({ length: enabled }, (_, index) =>
      makeSignatureRecipe({ id: `on-${index}`, componentId: `c-${index % componentCount}` })
    ),
    ...Array.from({ length: disabled }, (_, index) =>
      makeSignatureRecipe({ id: `off-${index}`, componentId: `c-0`, enabled: false })
    ),
  ];
  const validator = new SignatureValidator(makeSystemManager(system, () => recipes));
  countCalls(validator, 'signaturesOverlap', counters, 'signatureComparisons');
  validator.validateSystem(system.id);
  return counters.get('signatureComparisons');
}

describe('issue 1072 guard — the alchemy signature audit stays enabled-scoped', () => {
  it('compares at most every enabled pair once', () => {
    const enabled = 8;
    const comparisons = measureAudit({ enabled });
    const pairs = (enabled * (enabled - 1)) / 2;

    assert.ok(comparisons > 0, 'non-vacuity: the comparison counter must have moved');
    assert.ok(
      comparisons <= pairs,
      `${comparisons} comparisons for ${enabled} enabled recipes exceeds the ${pairs} ` +
        `distinct pairs. Comparing a pair twice, or comparing across systems, is a regression.`
    );
  });

  it('charges nothing for disabled recipes', () => {
    // Issue 649 scoped the scan to enabled recipes — the exact complement of the runtime matcher's
    // own `if (!recipe.enabled) continue;`.
    assert.equal(
      measureAudit({ enabled: 6, disabled: 24 }),
      measureAudit({ enabled: 6, disabled: 0 }),
      'disabled recipes must not enter the pairwise scan'
    );
  });

  it('does not multiply the pairwise scan by the component library', () => {
    // Independence again: the audit is quadratic in RECIPES (which #1074 addresses) and must stay
    // independent of library size.
    assert.equal(
      measureAudit({ enabled: 6, componentCount: 64 }),
      measureAudit({ enabled: 6, componentCount: 8 }),
      'pairwise comparison count must not depend on component-library size'
    );
  });

  it('performs at most one full-system audit when a single recipe is enabled', () => {
    // Originally counted through a PROXY — `getComponentsForSystem` calls, on the premise that
    // `validateSystem` reads the component library exactly once per audit (issue 1074).
    const counters = createOperationCounters();
    resetSignatureCounters();
    const system = makeCraftingSystem({ componentCount: 8, resolutionMode: 'alchemy' });
    const stored = [
      makeSignatureRecipe({ id: 'r-candidate', componentId: 'c-0', enabled: false }),
      ...Array.from({ length: 20 }, (_, index) =>
        makeSignatureRecipe({ id: `r-${index}`, componentId: `c-${(index % 6) + 1}` })
      ),
    ];
    const manager = new RecipeManager({
      getCraftingSystemManager: () =>
        countingFacade(
          makeSystemManager(system, () => stored),
          counters,
          {
            prefix: 'audit',
            methods: ['getComponentsForSystem'],
          }
        ),
    });
    for (const recipe of stored) manager.recipes.set(recipe.id, recipe);

    manager.canActivateRecipe('r-candidate');

    const audits = readSignatureCounters().reportBuilds;
    assert.ok(
      audits <= 1,
      `enabling one recipe in a 21-recipe alchemy system ran ${audits} full-system audits; ` +
        `the budget is one. An audit per recipe is the multiplication #1074 exists to remove.`
    );
    assert.ok(
      counters.get('auditGetComponentsForSystem') > 0,
      'the manager must still reach the library through the collaborator (issue 1072), not ' +
        'through a global shim'
    );
  });

  it('proves the audit counter can move', () => {
    // The non-vacuity control for the guard above.
    const counters = createOperationCounters();
    const system = makeCraftingSystem({ componentCount: 8, resolutionMode: 'alchemy' });
    const probed = countingFacade(
      makeSystemManager(system, () => []),
      counters,
      {
        prefix: 'audit',
        methods: ['getComponentsForSystem'],
      }
    );
    new SignatureValidator(probed).validateSystem(system.id);
    assert.equal(counters.get('auditGetComponentsForSystem'), 1);
  });
});

// Guard 4 & 5 — persistence write amplification and the batching boundary

/** A GM environment whose `game.settings` counts serialized payload bytes per key. */
function installCountingPersistence(counters) {
  installFoundryEnv();
  const store = countingSettings(counters);
  globalThis.game.settings = { get: store.get, set: store.set };
  return store;
}

/** Fixed-width ids and names, so EVERY stored record serializes to the same number of bytes. */
const recipeId = (index) => `r-${String(index).padStart(3, '0')}`;

/**
 * A replacement name with EXACTLY the byte length of the generated one (`Recipe 001` -> `Edited
 * 001`), so an edit changes the corpus content without changing its size.
 */
const editedName = (index) => `Edited ${String(index).padStart(3, '0')}`;

function storedRecipe(index) {
  const id = recipeId(index);
  return Recipe.fromJSON({
    id,
    name: `Recipe ${String(index).padStart(3, '0')}`,
    craftingSystemId: 'sys-scale',
    enabled: false,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-g`, name: 'Ingredients', options: [{ componentId: 'c-0', quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.x', quantity: 1 }] },
    ],
  });
}

function managerWithCorpus(counters, size) {
  const store = installCountingPersistence(counters);
  const system = makeCraftingSystem({ componentCount: 4 });
  const manager = new RecipeManager({
    getCraftingSystemManager: () => makeSystemManager(system, () => [...manager.recipes.values()]),
  });
  for (let index = 0; index < size; index++) {
    manager.recipes.set(recipeId(index), storedRecipe(index));
  }
  return { manager, store };
}

describe('issue 1072 guard — persistence writes are counted in bytes, not calls', () => {
  it('writes the recipes setting exactly once per single-record edit', async () => {
    const counters = createOperationCounters();
    const { manager } = managerWithCorpus(counters, 12);

    await manager.updateRecipe(recipeId(3), { name: editedName(3) });

    assert.equal(
      counters.get('settingWritesRecipes'),
      1,
      'one edit must produce one persistence write, not one per stored recipe'
    );
  });

  it('does not amplify a single-record edit beyond the corpus serialization', async () => {
    // Today this is an EQUALITY — the whole corpus is rewritten, which is the defect #1080 removes.
    const counters = createOperationCounters();
    const { manager } = managerWithCorpus(counters, 12);
    const corpusBytes = Buffer.byteLength(
      JSON.stringify([...manager.recipes.values()].map((recipe) => recipe.toJSON())),
      'utf8'
    );

    await manager.updateRecipe(recipeId(3), { name: editedName(3) });

    const written = counters.get('settingBytesRecipes');
    assert.ok(written > 0, 'non-vacuity: the byte counter must have moved');
    assert.ok(
      written <= corpusBytes,
      `a single-record edit serialized ${written} bytes against a ${corpusBytes}-byte corpus`
    );
  });

  it('keeps a batch to ONE persistence boundary rather than one write per record', async () => {
    // The strongest guard in this file, because the invariant is already true and load bearing:
    // `persist: false` (issue 776) is the only existing mitigation for write amplification and the
    // pattern #1086/#1089 generalise.
    const counters = createOperationCounters();
    const { manager } = managerWithCorpus(counters, 10);

    for (let index = 0; index < 6; index++) {
      await manager.updateRecipe(recipeId(index), { name: `Batched ${index}` }, { persist: false });
    }
    assert.equal(
      counters.get('settingWritesRecipes'),
      0,
      'a deferred batch must not persist per record'
    );

    await manager.save();
    assert.equal(counters.get('settingWritesRecipes'), 1, 'the batch settles in one write');
  });

  it('proves the batching boundary is what suppresses the writes', async () => {
    // Negative control for the guard above: the same six edits WITHOUT `persist: false` must
    // produce six writes.
    const counters = createOperationCounters();
    const { manager } = managerWithCorpus(counters, 10);

    for (let index = 0; index < 6; index++) {
      await manager.updateRecipe(recipeId(index), { name: `Eager ${index}` });
    }
    assert.equal(counters.get('settingWritesRecipes'), 6);
  });

  it('grows a single-record write at most linearly in corpus size', async () => {
    // Linear is the CURRENT (and bad) behaviour, and #1080 will make it constant.
    const small = createOperationCounters();
    const { manager: smallManager } = managerWithCorpus(small, 10);
    await smallManager.updateRecipe(recipeId(1), { name: editedName(1) });

    const large = createOperationCounters();
    const { manager: largeManager } = managerWithCorpus(large, 40);
    await largeManager.updateRecipe(recipeId(1), { name: editedName(1) });

    const verdict = atMostLinear({
      baseline: small.get('settingBytesRecipes'),
      scaled: large.get('settingBytesRecipes'),
      factor: 4,
      axis: 'corpus size',
      what: 'single-record persistence',
    });
    assert.ok(verdict.ok, verdict.message);
  });
});

// Guard 6 — the VISIBILITY phase's per-recipe offer count (issue 1228)

/**
 * How many held documents the per-recipe recipe-item matcher is OFFERED across one pass. The
 * counter below is stated on the OFFER, so it sees both.
 */
function measureAlchemyReveal({ recipeCount, itemCount, heldBooks = 1 }) {
  const counters = createOperationCounters();
  const system = makeBookGatedSystem({ recipeCount });
  const recipes = Array.from({ length: recipeCount }, (_unused, index) =>
    makeBookGatedRecipe({ index, systemId: system.id })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find((recipe) => recipe.id === id) ?? null,
  };
  const builder = new AlchemyListingBuilder({
    recipeManager,
    craftingSystemManager: systemManager,
    recipeVisibility: new RecipeVisibilityService(recipeManager, systemManager),
    localize: (key) => key,
  });
  const craftingActor = countingActor(
    makeBookHoldingActor({
      itemCount,
      bookUuids: Array.from({ length: heldBooks }, (_unused, index) => scaleBookUuid(index)),
    }),
    counters,
    'actorItems'
  );

  resetVisibilityCounters();
  const listing = builder.buildListing({
    craftingActor,
    viewer: PLAYER,
    craftingSystemId: system.id,
  });
  return {
    listing,
    ...readVisibilityCounters(),
    itemsScanned: counters.get('actorItemsScanned'),
  };
}

/**
 * The same measurement on the player CRAFTING listing's exhaustion read. The system is
 * `global`-visibility with the books still on it, and that combination is the whole fixture rather
 * than an arbitrary one.
 */
function measureCraftingExhaustion({ recipeCount, itemCount, heldBooks = 1 }) {
  const counters = createOperationCounters();
  const system = makeBookGatedSystem({
    recipeCount,
    resolutionMode: 'simple',
    visibilityMode: 'global',
  });
  const recipes = Array.from({ length: recipeCount }, (_unused, index) =>
    makeBookGatedRecipe({ index, systemId: system.id })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const recipeManager = new RecipeManager({ getCraftingSystemManager: () => systemManager });
  recipeManager.recipes = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  recipeManager.initialized = true;

  const builder = new CraftingListingBuilder({
    recipeManager,
    // The REAL service, not the stub `measureListing` uses. The defect lives in the service's
    // rescan branch, so a stubbed `isKnowledgeItemExhausted` measures nothing.
    recipeVisibility: new RecipeVisibilityService(recipeManager, systemManager),
    resolutionModeService: new ResolutionModeService(systemManager),
    craftingSystemManager: systemManager,
    localize: (key) => key,
    nowWorldTime: () => 0,
    resolveComponentForItem: findMatchingComponent,
  });
  const craftingActor = countingActor(
    makeBookHoldingActor({
      itemCount,
      bookUuids: Array.from({ length: heldBooks }, (_unused, index) => scaleBookUuid(index)),
    }),
    counters,
    'actorItems'
  );

  resetVisibilityCounters();
  const listing = builder.buildListing({ craftingActor, viewer: PLAYER });
  return {
    listing,
    ...readVisibilityCounters(),
    itemsScanned: counters.get('actorItemsScanned'),
  };
}

/** The same measurement on the Journal's redaction pass, which asks the same question per RUN. */
function measureJournalRedaction({ runCount, itemCount, heldBooks = 1 }) {
  const system = makeBookGatedSystem({ recipeCount: runCount });
  const recipes = Array.from({ length: runCount }, (_unused, index) =>
    makeBookGatedRecipe({ index, systemId: system.id })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find((recipe) => recipe.id === id) ?? null,
  };
  const runs = recipes.map((recipe, index) => ({
    id: `run-${index}`,
    recipeId: recipe.id,
    craftingSystemId: system.id,
    status: 'inProgress',
    currentStepIndex: 0,
    startedAt: 0,
    updatedAt: 0,
    steps: [{ stepId: `${recipe.id}-step`, index: 0, status: 'inProgress' }],
  }));
  const builder = new RunJournalBuilder({
    craftingRunManager: { getActiveRuns: () => runs, getRunHistory: () => [] },
    recipeManager,
    recipeVisibility: new RecipeVisibilityService(recipeManager, systemManager),
    getSystem: (id) => systemManager.getSystem(id),
    getViewer: () => PLAYER,
    localize: (key) => key,
  });
  const actor = makeBookHoldingActor({
    itemCount,
    bookUuids: Array.from({ length: heldBooks }, (_unused, index) => scaleBookUuid(index)),
  });

  resetVisibilityCounters();
  const listing = builder.buildListing({ actor, viewer: PLAYER });
  return { listing, ...readVisibilityCounters() };
}

describe('issue 1228 guard — the visibility phase offers the BOOKS, not the inventory', () => {
  const CONTROL_ITEMS = 10;
  const SCALED_ITEMS = 40;
  const RECIPES = 8;

  it('offers the same documents per recipe however much mundane gear the actor carries', () => {
    const base = measureAlchemyReveal({ recipeCount: RECIPES, itemCount: CONTROL_ITEMS });
    const fat = measureAlchemyReveal({ recipeCount: RECIPES, itemCount: SCALED_ITEMS });

    // NON-VACUITY FIRST. A pass that never reached the candidate walk — a fixture in the wrong
    // visibility mode, a recipe with no book membership — reports zero on both counters, and `0 ===
    // 0` would read as a green independence guard forever.
    assert.ok(
      base.candidateWalks > 0,
      'non-vacuity: the fixture must actually reach the recipe-item candidate walk'
    );
    assert.ok(
      base.candidateItemOffers > 0,
      'non-vacuity: the walk must actually be offered documents'
    );
    assert.ok(
      base.listing.recipes.length > 0,
      'non-vacuity: a held book must actually reveal recipes, or reveal is answering trivially'
    );

    assert.equal(
      fat.candidateItemOffers,
      base.candidateItemOffers,
      `quadrupling the actor's mundane gear moved the per-recipe offer count from ` +
        `${base.candidateItemOffers} to ${fat.candidateItemOffers}. The workbench must offer ` +
        `each recipe's matcher the HELD BOOKS, not the whole inventory — either the per-pass ` +
        `snapshot stopped being threaded, or it is being built without its recipe-item matcher.`
    );
    assert.equal(
      fat.candidateWalks,
      base.candidateWalks,
      'the number of recipes asked must not depend on inventory size'
    );
  });

  it('still tracks the axis it SHOULD track, so the equality is a property', () => {
    // The equality above holds equally well for a counter that stopped observing anything.
    const base = measureAlchemyReveal({ recipeCount: RECIPES, itemCount: CONTROL_ITEMS });
    const moreRecipes = measureAlchemyReveal({
      recipeCount: RECIPES * 2,
      itemCount: CONTROL_ITEMS,
    });
    const moreBooks = measureAlchemyReveal({
      recipeCount: RECIPES,
      itemCount: CONTROL_ITEMS,
      heldBooks: 2,
    });

    assert.ok(
      moreRecipes.candidateItemOffers > base.candidateItemOffers,
      'non-vacuity: doubling the corpus must still cost more offers — the pass asks per recipe'
    );
    assert.ok(
      moreBooks.candidateItemOffers > base.candidateItemOffers,
      'non-vacuity: holding a second BOOK must cost more offers — that is what the offer IS'
    );
  });

  it('reads the inventory once per pass, which is the half a read counter CAN see', () => {
    // Kept alongside the offer counter rather than instead of it.
    const base = measureAlchemyReveal({ recipeCount: RECIPES, itemCount: CONTROL_ITEMS });
    const moreRecipes = measureAlchemyReveal({
      recipeCount: RECIPES * 2,
      itemCount: CONTROL_ITEMS,
    });
    assert.ok(base.itemsScanned > 0, 'non-vacuity: the actor probe must have counted item reads');
    assert.equal(
      moreRecipes.itemsScanned,
      base.itemsScanned,
      `doubling the corpus moved inventory scanning from ${base.itemsScanned} to ` +
        `${moreRecipes.itemsScanned}. The workbench must read the inventory once per pass.`
    );
  });

  it("the player crafting listing's exhaustion read is bounded the same way", () => {
    // The MAIN player screen, and the largest of the three: it is asked once per VISIBLE ROW,
    // and the visible set on a `global`-visibility system is the whole corpus.
    const base = measureCraftingExhaustion({ recipeCount: RECIPES, itemCount: CONTROL_ITEMS });
    const fat = measureCraftingExhaustion({ recipeCount: RECIPES, itemCount: SCALED_ITEMS });

    assert.equal(
      base.listing.summaries.length,
      RECIPES,
      'non-vacuity: a `global`-visibility system must project every recipe'
    );
    assert.ok(
      base.candidateWalks > 0,
      'non-vacuity: the exhaustion read must actually reach the candidate walk. Zero means ' +
        'the fixture took the evidence branch instead, and the equality below is vacuous.'
    );
    assert.equal(
      fat.candidateItemOffers,
      base.candidateItemOffers,
      `quadrupling the actor's mundane gear moved the per-row offer count from ` +
        `${base.candidateItemOffers} to ${fat.candidateItemOffers}. The summary phase asks ` +
        `the exhaustion question once per visible row, so an unthreaded rescan there is ` +
        `recipes x items on the main player screen.`
    );

    // The axis it SHOULD track, so the equality above is a property rather than a dead probe.
    const moreRecipes = measureCraftingExhaustion({
      recipeCount: RECIPES * 2,
      itemCount: CONTROL_ITEMS,
    });
    assert.ok(
      moreRecipes.candidateItemOffers > base.candidateItemOffers,
      'non-vacuity: doubling the corpus must still cost more offers — one per visible row'
    );
  });

  it("the Journal's redaction pass is bounded the same way", () => {
    const base = measureJournalRedaction({ runCount: 6, itemCount: CONTROL_ITEMS });
    const fat = measureJournalRedaction({ runCount: 6, itemCount: SCALED_ITEMS });

    assert.ok(base.candidateWalks > 0, 'non-vacuity: redaction must reach the candidate walk');
    assert.equal(
      base.listing.activeRuns.length,
      6,
      'non-vacuity: the pass must actually project every run'
    );
    assert.equal(
      fat.candidateItemOffers,
      base.candidateItemOffers,
      `quadrupling the actor's mundane gear moved the per-run offer count from ` +
        `${base.candidateItemOffers} to ${fat.candidateItemOffers}. Redaction asks the ` +
        `visibility service once per run, and one whole inventory walk per run is what ` +
        `issue 1228 removed.`
    );
  });
});

// Determinism

describe('issue 1072 — the guards are deterministic', () => {
  it('produces identical counts across repeated runs', () => {
    // The acceptance criterion asks for identical counter values across three consecutive CI runs.
    const runs = Array.from({ length: 3 }, () =>
      measureListing({ totalRecipes: 12, visibleRecipes: 6, itemCount: 8 }).counters.snapshot()
    );
    assert.deepEqual(runs[1], runs[0]);
    assert.deepEqual(runs[2], runs[0]);

    const audits = Array.from({ length: 3 }, () => measureAudit({ enabled: 6, disabled: 3 }));
    assert.deepEqual(audits, [audits[0], audits[0], audits[0]]);
  });
});

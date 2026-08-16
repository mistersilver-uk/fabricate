/**
 * Deterministic scale regression guards (issue 1072).
 *
 * ## Why every assertion here is a count
 *
 * A wall-clock assertion is not a regression guard, it is a flaky test — CI timing varies
 * far more than the effects worth catching. The alchemy signature curve makes the point
 * beyond argument: `validateSystem()` is quadratic and already costs 979 ms at N=2,000, so
 * at this programme's target scale the PRE-fix behaviour extrapolates to hours and can
 * never be timed at all. Only an operation count can prove that class of fix, and the same
 * fixture produces the same count on every machine and every Node build.
 *
 * ## Why the guards are shaped as bounds and ratios, not pinned numbers
 *
 * Every path guarded here is about to be optimised by a sibling issue. A guard that pinned
 * today's exact whole-corpus count would go RED the moment its path got faster, and would
 * be deleted by whoever landed the fix — so it would protect nothing for the only period it
 * mattered. Each guard therefore asserts either:
 *
 *   - an UPPER BOUND satisfied by today's behaviour and still satisfied by the planned
 *     optimisation (so it survives the fix and fails only on regression), or
 *   - an INDEPENDENCE relation: scale one axis, assert the count did not move. These are
 *     the guards that catch the failure the parent epic actually names — the scaling terms
 *     are PRODUCTS (`items × components`, `recipes × items`), and a product term is exactly
 *     a count that moves when the axis it should be independent of is scaled.
 *
 * That is also why the fixtures stay tiny and the suite stays well inside its budget.
 * Sensitivity comes from scaling ONE axis and comparing two runs, never from fixture size.
 * A guard run against a large fixture on one axis measures nothing extra; a guard that
 * scaled both axes at once could not attribute a regression to either.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { countingActor, countCalls } from './helpers/scale/scaleCounters.js';
import {
  atMostLinear,
  countingFacade,
  countingSettings,
  createOperationCounters,
} from './helpers/scale/scaleProbes.js';
import {
  makeActor,
  makeCraftingSystem,
  makeListingRecipe,
  makeSignatureRecipe,
  makeSystemManager,
} from './helpers/scale/scaleGuardFixtures.js';

installFoundryEnv();

const { CraftingListingBuilder } = await import('../src/systems/CraftingListingBuilder.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { SignatureValidator, readSignatureCounters, resetSignatureCounters } = await import(
  '../src/systems/SignatureValidator.js'
);
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

const PLAYER = { id: 'user-1', isGM: false };

// ---------------------------------------------------------------------------
// Guard 1 & 2 — the player listing path
// ---------------------------------------------------------------------------

/**
 * Build and measure one player Crafting listing.
 *
 * The recipe manager is the REAL one, so `evaluateCraftability` performs its real
 * per-recipe inventory re-flattening (`sourceActors.flatMap(a => [...a.items])`) and the
 * actor probe sees it. A stubbed craftability would make the inventory axis unobservable,
 * which is the axis the field report behind this programme was actually about.
 */
function measureListing({
  totalRecipes,
  visibleRecipes,
  componentCount = 8,
  itemCount = 10,
  setCount = 1,
}) {
  const counters = createOperationCounters();
  const system = makeCraftingSystem({ componentCount });
  const recipes = Array.from({ length: totalRecipes }, (_, index) =>
    makeListingRecipe({ id: `r-${index}`, systemId: system.id, setCount })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const recipeManager = new RecipeManager({ getCraftingSystemManager: () => systemManager });

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
  });

  const craftingActor = countingActor(makeActor({ itemCount }), counters, 'actorItems');
  const listing = builder.buildListing({ craftingActor, viewer: PLAYER });

  return {
    counters,
    listing,
    // The DETAIL phase for one row (issue 1075). Handed the recipe directly rather than by
    // id because this fixture's manager holds no recipe map; the exact-evaluation cost the
    // probe measures is identical either way.
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
    // The headline criterion: opening the player app must not do work proportional to the
    // whole installed corpus. This guard's original budget was the VISIBLE set — one
    // evaluation per set plus one per recipe — and it recorded that "page-scoping lands with
    // #1075 and will only lower this". It did, all the way to the floor: the summary phase
    // performs NO exact evaluation at any corpus size, because material availability comes
    // from #1077's indexed projection instead.
    //
    // So the bound is now zero rather than `2 x visible`. That is a stronger guard, but only
    // if it can still fail, which is why the non-vacuity proof moved to the detail phase
    // rather than being dropped: it demonstrates both that the probe counts and that the
    // cost went somewhere bounded rather than disappearing into an unmeasured path.
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

  it('costs the same regardless of how large the component library is', () => {
    // Independence, not a bound: the read must not be O(recipes × components). Doubling the
    // library while holding recipes and inventory fixed must not move either counter.
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

    // The craftability half is measured on the DETAIL phase, because since #1075 the summary
    // phase evaluates exact craftability ZERO times BY CONSTRUCTION. Comparing the two
    // library sizes there would be `0 === 0` forever — an assertion reporting confidence it
    // cannot earn. Exact evaluation still exists; it moved, so the guard moves with it.
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
    // character carrying hundreds of stacks. Holding recipes fixed and scaling inventory
    // must scale the scan at most linearly — a super-linear result means an item-by-item
    // rescan was nested inside something that already walks items.
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
    // The other half of the same product, scaled independently so a regression can be
    // attributed to one axis. Since #1075 this is no longer an at-most-linear bound: the
    // summary phase reads the inventory ONCE per pass through the per-pass snapshot, so the
    // count is CONSTANT in visible recipes. An `atMostLinear` verdict would pass for a
    // regression back to a per-recipe rescan (4x recipes, 4x scans is exactly linear), which
    // is the regression this guard is named for — so the assertion is an equality.
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

    // Non-vacuity of the CONSTANT itself: the same counter still moves on the axis it is
    // SUPPOSED to move on. Without this the equality above holds equally well for a probe
    // that stopped observing anything.
    const moreItems = measureListing({ totalRecipes: 40, visibleRecipes: 4, itemCount: 40 });
    assert.ok(
      moreItems.counters.get('actorItemsScanned') > baseline,
      'non-vacuity: scanning still tracks the item axis, so the equality is a property'
    );
  });
});

// ---------------------------------------------------------------------------
// Guard 3 — the alchemy signature audit
// ---------------------------------------------------------------------------

/**
 * Count the pairwise signature comparisons one full-system audit performs.
 *
 * `countCalls` patches the instance the harness just constructed — never a prototype, which
 * would leak the count into every other case in the process and turn it into a running total.
 */
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
    // Issue 649 scoped the scan to enabled recipes — the exact complement of the runtime
    // matcher's own `if (!recipe.enabled) continue;`. A GM who disables half a colliding
    // corpus must actually pay less, and dropping that filter is a silent quadratic
    // regression on the largest systems.
    assert.equal(
      measureAudit({ enabled: 6, disabled: 24 }),
      measureAudit({ enabled: 6, disabled: 0 }),
      'disabled recipes must not enter the pairwise scan'
    );
  });

  it('does not multiply the pairwise scan by the component library', () => {
    // Independence again: the audit is quadratic in RECIPES (which #1074 addresses) and
    // must stay independent of library size. An implementation that moved the component
    // walk into the pairwise loop would be quadratic in recipes AND linear in components.
    assert.equal(
      measureAudit({ enabled: 6, componentCount: 64 }),
      measureAudit({ enabled: 6, componentCount: 8 }),
      'pairwise comparison count must not depend on component-library size'
    );
  });

  it('performs at most one full-system audit when a single recipe is enabled', () => {
    // Originally counted through a PROXY — `getComponentsForSystem` calls, on the premise
    // that `validateSystem` reads the component library exactly once per audit. Issue 1074
    // retired that premise (the revision guard reads the library too, which is an O(1)
    // identity check and not an audit) and replaced it with a direct audit counter inside
    // `SignatureValidator`, so the assertion now reads the real number instead of a stand-in
    // for it. The delegation the proxy also demonstrated is kept below as a lower bound, and
    // the sibling assertion still proves the proxy can move at all.
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
        countingFacade(makeSystemManager(system, () => stored), counters, {
          prefix: 'audit',
          methods: ['getComponentsForSystem'],
        }),
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
    // The non-vacuity control for the guard above. Without it, a `_signatureSource` that
    // stopped delegating to the manager would silently report zero audits forever and the
    // upper bound would hold for the worst possible reason.
    const counters = createOperationCounters();
    const system = makeCraftingSystem({ componentCount: 8, resolutionMode: 'alchemy' });
    const probed = countingFacade(makeSystemManager(system, () => []), counters, {
      prefix: 'audit',
      methods: ['getComponentsForSystem'],
    });
    new SignatureValidator(probed).validateSystem(system.id);
    assert.equal(counters.get('auditGetComponentsForSystem'), 1);
  });
});

// ---------------------------------------------------------------------------
// Guard 4 & 5 — persistence write amplification and the batching boundary
// ---------------------------------------------------------------------------

/**
 * A GM environment whose `game.settings` counts serialized payload bytes per key.
 *
 * Bytes rather than calls, because the defect is write SIZE: `RecipeManager.save()` replaces
 * the whole `recipes` world setting, so one edit serializes and replicates the entire corpus
 * (measured at 22.3 MB for 10,000 recipes). That is a single call — invisible to a call
 * counter, obvious to a byte counter.
 */
function installCountingPersistence(counters) {
  installFoundryEnv();
  const store = countingSettings(counters);
  globalThis.game.settings = { get: store.get, set: store.set };
  return store;
}

/**
 * Fixed-width ids and names, so EVERY stored record serializes to the same number of bytes.
 *
 * Not cosmetic. With bare `r-${index}` the 40-record corpus carries two-digit ids the
 * 10-record corpus does not, so its per-record payload is genuinely larger and the byte
 * ratio comes out at 4.01x — enough to trip a strict linear bound with no regression
 * present. The alternative was to slacken the bound with a tolerance, which would have
 * blunted the only guard in this file that can see write amplification.
 */
const recipeId = (index) => `r-${String(index).padStart(3, '0')}`;

/**
 * A replacement name with EXACTLY the byte length of the generated one (`Recipe 001` ->
 * `Edited 001`), so an edit changes the corpus content without changing its size.
 *
 * Same reasoning as the padded ids, one level up: serialized size is `a * records + b`, and
 * a rename that shortened one record would push `b` negative, making `4 * small` smaller
 * than the genuinely-linear `large` by a handful of bytes. The guard would then fail on
 * fixture arithmetic rather than on the quadratic write amplification it is looking for.
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
    // Today this is an EQUALITY — the whole corpus is rewritten, which is the defect #1080
    // removes. Asserted as an upper bound so the guard survives that fix and fails only if
    // an edit ever writes MORE than the corpus (e.g. a second full write of a sibling key).
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
    // The strongest guard in this file, because the invariant is already true and load
    // bearing: `persist: false` (issue 776) is the only existing mitigation for write
    // amplification and the pattern #1086/#1089 generalise. Losing it silently turns a
    // 200-recipe import into 200 full-corpus serializations.
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
    // Negative control for the guard above: the same six edits WITHOUT `persist: false`
    // must produce six writes. Without this, a `updateRecipe` that had stopped persisting
    // entirely would satisfy the batch guard perfectly.
    const counters = createOperationCounters();
    const { manager } = managerWithCorpus(counters, 10);

    for (let index = 0; index < 6; index++) {
      await manager.updateRecipe(recipeId(index), { name: `Eager ${index}` });
    }
    assert.equal(counters.get('settingWritesRecipes'), 6);
  });

  it('grows a single-record write at most linearly in corpus size', async () => {
    // Linear is the CURRENT (and bad) behaviour, and #1080 will make it constant. The bound
    // is what a regression would breach: a write that grew quadratically — for instance by
    // re-serializing the corpus once per stored record — is the failure mode that turns a
    // large world unusable, and it is invisible to any call-count assertion.
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

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('issue 1072 — the guards are deterministic', () => {
  it('produces identical counts across repeated runs', () => {
    // The acceptance criterion asks for identical counter values across three consecutive
    // CI runs. Asserting it in-process is strictly stronger for the property that actually
    // threatens these guards — a fixture that used RNG, iteration order or wall clock would
    // diverge here immediately, and would otherwise only surface as an intermittent CI red.
    const runs = Array.from({ length: 3 }, () =>
      measureListing({ totalRecipes: 12, visibleRecipes: 6, itemCount: 8 }).counters.snapshot()
    );
    assert.deepEqual(runs[1], runs[0]);
    assert.deepEqual(runs[2], runs[0]);

    const audits = Array.from({ length: 3 }, () => measureAudit({ enabled: 6, disabled: 3 }));
    assert.deepEqual(audits, [audits[0], audits[0], audits[0]]);
  });
});

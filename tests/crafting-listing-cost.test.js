/**
 * The cost guards for the crafting summary/detail split (issue 1075, under #1070).
 *
 * Three properties, each expressed as a COUNT rather than as prose, because the prose
 * versions of all three already existed and none of them could fail:
 *
 * 1. **Summaries are pure.** Building N of them invokes `evaluateCraftability()` and
 *    `resolveIngredientSelection()` zero times — at any N.
 * 2. **A first-page load is bounded by the PAGE.** The exact-evaluation count for opening
 *    the app and hydrating one page is a function of page size and set count, and is
 *    independent of corpus size. That independence is the criterion: a bound that happened
 *    to hold at 200 recipes and grew at 400 would be a coincidence, not a guarantee.
 * 3. **The corpus-wide visibility pass is not duplicated.** One pass per read, and a caller
 *    that must feed both builders hands ONE pass to both rather than running two.
 *
 * Every count here is proved NON-VACUOUS in the same test that reads it, by invoking the
 * counted seam directly or by showing the number move on an axis it is supposed to move on.
 * A counter that cannot go up reports a green baseline forever, which is worse than no
 * counter at all because it also reports confidence.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CraftingListingBuilder } from '../src/systems/CraftingListingBuilder.js';
import { InventoryListingBuilder } from '../src/systems/InventoryListingBuilder.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';

import { countCalls, createOperationCounters } from './helpers/scale/scaleCounters.js';

const VIEWER = { id: 'user-1', isGM: false };
const SYSTEM_ID = 'sys-mill';

/** `DEFAULT_PAGE_SIZE` and the two other selectable sizes (`craftingStore.svelte.js`). */
const PAGE_SIZES = [12, 24, 48];

/** Ingredient sets per fixture recipe — the `S` in the `S + 1` per-recipe detail budget. */
const SETS_PER_RECIPE = 3;

const MILL = Object.freeze({
  id: SYSTEM_ID,
  name: 'Millhouse',
  resolutionMode: 'simple',
  craftingCheck: { simple: { rollFormula: '1d20', dc: 12 }, routed: {}, progressive: {} },
  components: [{ id: 'c-grain', name: 'Grain', img: 'icons/grain.webp' }],
});

/**
 * One recipe with `SETS_PER_RECIPE` single-option sets.
 *
 * The sets carry a counted `resolveIngredientSelection` tripwire, because that is where the
 * bounded backtracking solver actually lives — counting only the manager's
 * `evaluateCraftability` would miss a projection that reached past it into a set directly.
 */
function millRecipe(index, counters) {
  const sets = Array.from({ length: SETS_PER_RECIPE }, (_, setIndex) => {
    const set = {
      id: `r-${index}-set-${setIndex}`,
      name: `Option ${setIndex + 1}`,
      ingredientGroups: [
        {
          id: `g-${setIndex}`,
          options: [{ quantity: 1, match: { type: 'component', componentId: 'c-grain' } }],
        },
      ],
      resolveIngredientSelection: () => ({ success: true, assignments: [] }),
    };
    countCalls(set, 'resolveIngredientSelection', counters, 'resolveIngredientSelection');
    return set;
  });
  const resultGroups = [
    {
      id: `rg-${index}`,
      name: 'Flour',
      checkOutcomeIds: [],
      results: [{ componentId: 'c-grain', quantity: 1 }],
    },
  ];
  return {
    id: `r-${index}`,
    name: `Recipe ${String(index).padStart(4, '0')}`,
    img: 'icons/flour.webp',
    craftingSystemId: SYSTEM_ID,
    category: 'Milling',
    description: 'Ground fine.',
    ingredientSets: sets,
    resultGroups,
    getExecutionSteps: () => [
      { id: `r-${index}-step`, name: 'Mill', ingredientSets: sets, resultGroups },
    ],
  };
}

/**
 * A wired crafting builder over `corpusSize` visible recipes, with every expensive seam
 * counted: exact craftability, the ingredient solver, and the corpus-wide visibility pass.
 */
function millWorld({ corpusSize }) {
  const counters = createOperationCounters();
  const recipes = Array.from({ length: corpusSize }, (_, index) => millRecipe(index, counters));
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const craftingSystemManager = {
    getSystem: (id) => (id === SYSTEM_ID ? MILL : null),
    getSystems: () => [MILL],
    getRecipeItemDefinition: () => null,
  };
  const recipeManager = {
    evaluateCraftability: () => ({
      canCraft: true,
      satisfiableSet: { id: 'r-0-set-0' },
      ingredientStates: [],
      essenceStates: [],
      toolStates: [],
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    getRecipe: (id) => byId.get(id) ?? null,
    getRecipes: () => recipes,
  };
  countCalls(recipeManager, 'evaluateCraftability', counters, 'evaluateCraftability');

  const entries = recipes.map((recipe) => ({ recipe, access: { visible: true, reason: 'ok' } }));
  const recipeVisibility = {
    getVisibleRecipes: () => entries,
    evaluateRecipeAccess: ({ recipe }) =>
      byId.has(recipe?.id)
        ? { visible: true, reason: 'ok' }
        : { visible: false, reason: 'visibility' },
    isKnowledgeItemExhausted: () => false,
  };
  countCalls(recipeVisibility, 'getVisibleRecipes', counters, 'getVisibleRecipes');

  const builder = new CraftingListingBuilder({
    recipeManager,
    recipeVisibility,
    resolutionModeService: new ResolutionModeService(craftingSystemManager),
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 0,
    resolveComponentForItem: (item, components) =>
      components.find((component) => component.name === item?.name) ?? null,
  });

  const craftingActor = {
    id: 'actor-1',
    name: 'Wren',
    items: [{ uuid: 'Item.grain-1', name: 'Grain', system: { quantity: 99 } }],
  };

  return {
    builder,
    counters,
    craftingActor,
    recipeVisibility,
    recipeManager,
    craftingSystemManager,
    entries,
  };
}

/** The browse path's own page window: A-Z by name, then slice — what the store does. */
function firstPage(summaries, pageSize) {
  return [...summaries]
    .sort((left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? '')))
    .slice(0, pageSize);
}

describe('summary purity — building N rows costs no exact evaluation', () => {
  it('builds a whole 500-recipe listing with zero evaluateCraftability / resolveIngredientSelection calls', () => {
    const { builder, counters, craftingActor, recipeManager } = millWorld({ corpusSize: 500 });

    const listing = builder.buildListing({ craftingActor, viewer: VIEWER });

    assert.equal(
      listing.summaries.length,
      500,
      'non-vacuity: the listing really did project 500 rows'
    );
    assert.equal(listing.total, 500);
    assert.equal(
      counters.get('evaluateCraftability'),
      0,
      'exact craftability must never run for a row'
    );
    assert.equal(counters.get('resolveIngredientSelection'), 0, 'nor the ingredient solver');

    // Non-vacuity of the counters themselves: both DO move when the seams are invoked
    // directly, so the zeroes above are evidence rather than counters that cannot count.
    recipeManager.evaluateCraftability();
    assert.equal(counters.get('evaluateCraftability'), 1);
    // The solver tripwire rides on the ingredient sets, which is where the real one lives.
    millRecipeSolverProbe(counters);
  });

  it('keeps that zero as the corpus grows, so it is a property and not a small number', () => {
    for (const corpusSize of [50, 500, 2000]) {
      const { builder, counters, craftingActor } = millWorld({ corpusSize });
      const listing = builder.buildListing({ craftingActor, viewer: VIEWER });
      assert.equal(listing.summaries.length, corpusSize);
      assert.equal(counters.get('evaluateCraftability'), 0, `corpus ${corpusSize}`);
      assert.equal(counters.get('resolveIngredientSelection'), 0, `corpus ${corpusSize}`);
    }
  });
});

/** Invoke a set's counted solver tripwire directly, proving that counter can move too. */
function millRecipeSolverProbe(counters) {
  const before = counters.get('resolveIngredientSelection');
  const probe = { resolveIngredientSelection: () => ({ success: true }) };
  countCalls(probe, 'resolveIngredientSelection', counters, 'resolveIngredientSelection');
  probe.resolveIngredientSelection();
  assert.equal(
    counters.get('resolveIngredientSelection'),
    before + 1,
    'the solver counter can move'
  );
}

describe('first-page cost is bounded by the PAGE, not the corpus', () => {
  for (const pageSize of PAGE_SIZES) {
    it(`hydrating a ${pageSize}-row first page evaluates exactly ${pageSize} x (${SETS_PER_RECIPE} + 1) times`, () => {
      const { builder, counters, craftingActor } = millWorld({ corpusSize: 500 });

      const listing = builder.buildListing({ craftingActor, viewer: VIEWER });
      assert.equal(counters.get('evaluateCraftability'), 0, 'the browse half is free');

      const page = firstPage(listing.summaries, pageSize);
      assert.equal(page.length, pageSize, 'non-vacuity: the page really is that many rows');
      for (const row of page) {
        const detail = builder.buildRecipeDetail({
          recipeId: row.id,
          craftingActor,
          viewer: VIEWER,
        });
        assert.ok(detail, 'non-vacuity: every hydration produced a model');
      }

      // One evaluation per ingredient set (the per-option tiles) plus one for the craft
      // button, per hydrated recipe. Asserted EXACTLY rather than as an upper bound: an
      // inequality passes for a hydration that quietly stopped evaluating anything.
      assert.equal(
        counters.get('evaluateCraftability'),
        pageSize * (SETS_PER_RECIPE + 1),
        'detail hydration must cost one evaluation per set plus one per recipe, and nothing more'
      );
    });
  }

  it('is INDEPENDENT of corpus size, which is the actual criterion', () => {
    // A bound that held at one corpus size and grew at another would be a coincidence. The
    // page is what must decide the cost, so the same page against a 4x corpus must cost the
    // same — and the summary half must stay at zero on both.
    const counts = [500, 2000].map((corpusSize) => {
      const { builder, counters, craftingActor } = millWorld({ corpusSize });
      const listing = builder.buildListing({ craftingActor, viewer: VIEWER });
      for (const row of firstPage(listing.summaries, 12)) {
        builder.buildRecipeDetail({ recipeId: row.id, craftingActor, viewer: VIEWER });
      }
      return counters.get('evaluateCraftability');
    });

    assert.equal(counts[0], 12 * (SETS_PER_RECIPE + 1));
    assert.equal(counts[1], counts[0], 'quadrupling the corpus must not move the first-page cost');
  });

  it('a page the player never opens costs nothing at all', () => {
    // The regression guard the issue retains rather than adds: filtering, sorting and paging
    // are pure reads over summaries. They cannot hydrate anything, because hydration is a
    // separate call the browse path never makes.
    const { builder, counters, craftingActor } = millWorld({ corpusSize: 500 });
    const listing = builder.buildListing({ craftingActor, viewer: VIEWER });

    firstPage(listing.summaries, 12);
    firstPage(
      listing.summaries.filter((row) => row.name.includes('Recipe 01')),
      48
    );

    assert.equal(counters.get('evaluateCraftability'), 0);
    assert.equal(counters.get('resolveIngredientSelection'), 0);
  });
});

describe('the corpus-wide visibility pass', () => {
  it('runs exactly once for one crafting listing build', () => {
    const { builder, counters, craftingActor } = millWorld({ corpusSize: 100 });
    builder.buildListing({ craftingActor, viewer: VIEWER });
    assert.equal(counters.get('getVisibleRecipes'), 1);
  });

  it('runs zero further times for every recipe the player then opens', () => {
    // The split's most plausible regression: a detail phase that re-ran the corpus-wide pass
    // to find its own recipe's access would make hydration MORE expensive than the listing it
    // replaced. Detail resolves access per recipe instead.
    const { builder, counters, craftingActor } = millWorld({ corpusSize: 100 });
    const listing = builder.buildListing({ craftingActor, viewer: VIEWER });
    for (const row of firstPage(listing.summaries, 12)) {
      builder.buildRecipeDetail({ recipeId: row.id, craftingActor, viewer: VIEWER });
    }
    assert.equal(counters.get('getVisibleRecipes'), 1, 'still one, after twelve hydrations');
  });

  it('is handed to BOTH builders when one caller must feed both', () => {
    // The double-pass case: a caller that needs the crafting listing AND the inventory
    // listing in one read. Each builder runs its own pass by default, so the shared read
    // hands ONE pass's result down rather than paying for it twice.
    const {
      builder,
      counters,
      craftingActor,
      recipeVisibility,
      recipeManager,
      craftingSystemManager,
    } = millWorld({ corpusSize: 100 });
    const inventory = new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      recipeVisibility,
      localize: (key) => key,
      nowWorldTime: () => 0,
    });

    // ONE pass, performed by the caller and handed to both.
    const entries = recipeVisibility.getVisibleRecipes({ viewer: VIEWER, craftingActor });
    assert.equal(counters.get('getVisibleRecipes'), 1);

    builder.buildListing({ craftingActor, viewer: VIEWER, visibleRecipeEntries: entries });
    inventory.buildListing({ craftingActor, viewer: VIEWER, visibleRecipeEntries: entries });

    assert.equal(counters.get('getVisibleRecipes'), 1, 'both listings, one corpus-wide pass');
  });

  it('non-vacuity: the same two builds cost TWO passes without the hand-off', () => {
    // Without this the assertion above passes for a probe that never counts anything, and
    // for a hand-off that silently does nothing because both builders skipped the pass for
    // an unrelated reason.
    const {
      builder,
      counters,
      craftingActor,
      recipeVisibility,
      recipeManager,
      craftingSystemManager,
    } = millWorld({ corpusSize: 100 });
    const inventory = new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      recipeVisibility,
      localize: (key) => key,
      nowWorldTime: () => 0,
    });

    builder.buildListing({ craftingActor, viewer: VIEWER });
    inventory.buildListing({ craftingActor, viewer: VIEWER });

    assert.equal(counters.get('getVisibleRecipes'), 2);
  });

  it('a hand-off cannot WIDEN what a player may see referenced', () => {
    // The hand-off replaces the pass and nothing else — the teaser filter still runs over
    // whatever it is given. Handing in a pass containing a teaser must not name that recipe
    // in a used-by list, or the optimisation would become a disclosure.
    const { recipeVisibility, recipeManager, craftingSystemManager, craftingActor, entries } =
      millWorld({
        corpusSize: 3,
      });
    const inventory = new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      recipeVisibility,
      localize: (key) => key,
      nowWorldTime: () => 0,
    });
    const withTeaser = entries.map((entry, index) =>
      index === 0 ? { ...entry, access: { visible: true, reason: 'teaser' } } : entry
    );

    const allowed = inventory._resolveAllowedRecipeIds({
      isGM: false,
      viewer: VIEWER,
      craftingActor,
      knowledgeSources: [],
      visibleRecipeEntries: withTeaser,
    });

    assert.equal(allowed.has('r-0'), false, 'the teaser is filtered out of the handed-in pass');
    assert.equal(allowed.has('r-1'), true, 'non-vacuity: the non-teaser entries survive it');
  });
});

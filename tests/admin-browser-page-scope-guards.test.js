/**
 * Page-scope guards for the two GM browsers (issue 1081, under #1070).
 *
 * The claim these defend is not "it got faster" — it is that the work a browser open
 * performs is bounded by what the GM can see, and that counting, filtering and sorting the
 * WHOLE filtered cohort does not drag the expensive tier along with it.
 *
 * ## Every negative assertion here is paired with a positive control
 *
 * A counter that reads zero because the optimisation worked is indistinguishable from a
 * counter that reads zero because the path was never invoked, the method was renamed, or the
 * fixture filtered to nothing. `scaleProbes.countingFacade` throws on a missing method for
 * exactly that reason. The same standard is held here at the assertion level: every "this
 * did not happen" is followed, in the SAME fixture and against the SAME counter, by the
 * step that makes it happen. If the seam were dead, the control would read zero too and the
 * test would fail.
 *
 * ## Counts, not clocks
 *
 * The same fixture performs the same number of operations on every machine and every Node
 * build, so a count is a value a reviewer can read in a diff. The bounds are stated as
 * EXACT numbers rather than upper bounds because the quantity being pinned is a page size:
 * "at most the page" and "exactly the page" differ by a defect where a row is skipped.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { countCalls } from './helpers/scale/scaleCounters.js';
import { countingFacade, createOperationCounters } from './helpers/scale/scaleProbes.js';
import {
  makeCraftingSystem,
  makeSignatureRecipe,
  makeSystemManager,
} from './helpers/scale/scaleGuardFixtures.js';

installFoundryEnv();

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { readSignatureCounters, resetSignatureCounters } = await import(
  '../src/systems/SignatureValidator.js'
);
const { buildRecipeList } = await import('../src/ui/svelte/stores/adminRecipeRowProjection.js');
const { buildItemCards, hydrateItemCards } = await import(
  '../src/ui/svelte/stores/adminComponentRowProjection.js'
);
const { buildRecipeBrowserModel } = await import('../src/utils/recipeBrowserModel.js');
const { buildComponentBrowserModel } = await import('../src/utils/componentBrowserModel.js');

/** More than two pages, so "the page" and "the cohort" are different numbers. */
const COHORT = 60;
const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// The GM recipe browser
// ---------------------------------------------------------------------------

/**
 * A real `RecipeManager` over an ALCHEMY system holding `COHORT` recipes, with the two
 * expensive per-row seams counted.
 *
 * Alchemy deliberately, because that is the mode whose activation gate reaches the signature
 * audit; every other mode short-circuits before it and could not show the audit count at all.
 */
function makeRecipeWorld(counters) {
  const system = makeCraftingSystem({ componentCount: 8, resolutionMode: 'alchemy' });
  const recipes = Array.from({ length: COHORT }, (_, index) =>
    Recipe.fromJSON({
      ...makeSignatureRecipe({ id: `r-${String(index).padStart(3, '0')}`, componentId: `c-${index % 8}` }),
      name: `Recipe ${String(index).padStart(3, '0')}`,
      craftingSystemId: system.id,
    })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const manager = new RecipeManager({ getCraftingSystemManager: () => systemManager });
  for (const recipe of recipes) manager.recipes.set(recipe.id, recipe);

  // The DETAIL-tier probe. `validate()` is called on the STORED recipe by exactly one thing
  // — `_isRecipeIncomplete`, inside the detail bundle. The activation gate validates a
  // `Recipe.fromJSON` CLONE with `enabled: true`, a different instance, so it cannot bump
  // this counter; that is what keeps the two tiers separately observable. (A `toJSON`
  // counter would NOT: the gate clones the body too, so it reads 2 per rendered row.)
  //
  // Per INSTANCE, never on the prototype: a prototype patch would leak into every other
  // case in this process and turn a per-fixture count into a running total.
  const disposers = recipes.map((recipe) =>
    countCalls(recipe, 'validate', counters, 'recipeDetailProjections')
  );

  return {
    system,
    systemManager,
    recipes,
    dispose: () => disposers.forEach((dispose) => dispose()),
    manager: countingFacade(manager, counters, {
      prefix: 'gate',
      methods: ['canActivateRecipe'],
    }),
  };
}

/** Filter → sort → count → paginate the whole cohort, exactly as the browser view does. */
function browseRecipes(rows, options = {}) {
  return buildRecipeBrowserModel(rows, {
    status: 'all',
    lock: 'all',
    category: 'all',
    sortKey: 'name',
    sortDirection: 'asc',
    groupByCategory: true,
    pageIndex: 0,
    pageSize: PAGE_SIZE,
    ...options,
  });
}

/** Read every field a rendered recipe row renders. */
function renderRecipeRow(row) {
  return [
    row.structureLabel,
    row.requirementsPreview.length,
    row.toolCount,
    row.incomplete,
    row.visibilitySummary,
    row.accessSummary.characterCount,
    row.enableBlocked,
  ];
}

describe('GM recipe browser: off-page definitions are not richly projected', () => {
  it('projects, counts, filters, sorts and paginates the cohort without touching the detail tier', () => {
    const counters = createOperationCounters();
    const world = makeRecipeWorld(counters);
    try {
      const list = buildRecipeList(world.systemManager, world.manager, world.system, '');
      assert.equal(list.recipes.length, COHORT, 'the whole cohort is projected');

      const model = browseRecipes(list.recipes);
      assert.equal(model.filtered.length, COHORT, 'the model saw the whole cohort');
      assert.equal(model.page.length, PAGE_SIZE, 'and rendered one page of it');
      assert.equal(model.categoryTotals.get('general'), COHORT, 'counted over the cohort');

      assert.equal(counters.get('recipeDetailProjections'), 0, 'no detail bundle was built');
      assert.equal(counters.get('gateCanActivateRecipe'), 0, 'no activation gate was run');

      // POSITIVE CONTROL, same fixture, same counters: rendering the page is what performs
      // the work, and it performs exactly one page of it.
      for (const row of model.page) renderRecipeRow(row);
      assert.equal(
        counters.get('recipeDetailProjections'),
        PAGE_SIZE,
        'the detail counter CAN go up — and stops at the page'
      );
      assert.equal(
        counters.get('gateCanActivateRecipe'),
        PAGE_SIZE,
        'the activation counter CAN go up — and stops at the page'
      );

      // And the off-page remainder is still reachable, so the bound above is page scope
      // rather than a projection that quietly dropped 35 rows.
      for (const row of model.filtered.slice(PAGE_SIZE)) renderRecipeRow(row);
      assert.equal(counters.get('recipeDetailProjections'), COHORT);
      assert.equal(counters.get('gateCanActivateRecipe'), COHORT);
    } finally {
      world.dispose();
    }
  });

  it('answers the DC, ingredient and result sort keys over the cohort with no detail tier at all', () => {
    const counters = createOperationCounters();
    const world = makeRecipeWorld(counters);
    try {
      const list = buildRecipeList(world.systemManager, world.manager, world.system, '');

      for (const key of ['dc', 'ingredients', 'results']) {
        const model = browseRecipes(list.recipes, { sortKey: key, sortDirection: 'desc' });
        assert.equal(model.filtered.length, COHORT, `sorting by ${key} kept the cohort`);
      }
      assert.equal(
        counters.get('recipeDetailProjections'),
        0,
        'three cohort sorts built no detail bundle'
      );
      assert.equal(counters.get('gateCanActivateRecipe'), 0, 'and ran no activation gate');

      // POSITIVE CONTROL: the `attention` key is the one that DOES need a verdict per row,
      // and it costs exactly one per row and nothing else — no detail bundle comes with it.
      browseRecipes(list.recipes, { sortKey: 'attention' });
      assert.equal(
        counters.get('gateCanActivateRecipe'),
        COHORT,
        'the attention sort answers every row — proving the counter is live'
      );
      assert.equal(
        counters.get('recipeDetailProjections'),
        0,
        'and still builds no detail bundle'
      );
    } finally {
      world.dispose();
    }
  });

  it('performs ONE full-system signature audit for the whole cohort, not one per row', () => {
    const counters = createOperationCounters();
    const world = makeRecipeWorld(counters);
    try {
      resetSignatureCounters();
      const list = buildRecipeList(world.systemManager, world.manager, world.system, '');
      // The `attention` sort is the widest read of `enableBlocked` there is: every row.
      browseRecipes(list.recipes, { sortKey: 'attention' });

      const audits = readSignatureCounters().reportBuilds;
      assert.equal(
        counters.get('gateCanActivateRecipe'),
        COHORT,
        'POSITIVE CONTROL: the activation gate really did run for every row, so a zero ' +
          'audit count below would mean the gate skipped the signature path, not that it ' +
          'was amortised'
      );
      assert.ok(
        audits >= 1,
        'POSITIVE CONTROL: the audit counter is live — the path compiled a report at all'
      );
      assert.equal(
        audits,
        1,
        `projecting ${COHORT} alchemy rows ran ${audits} full-system audits; the budget is ` +
          'one. An audit per row is the multiplication issue 1074 removed and this browser ' +
          'must keep consuming.'
      );
    } finally {
      world.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// The GM component browser
// ---------------------------------------------------------------------------

/**
 * A component library whose every member carries a compendium link and an EMPTY stored
 * description.
 *
 * Both halves are load-bearing. The link is what makes `fromUuid` reachable at all, and the
 * empty stored description is what makes the enrichment fallback reachable — a fixture with
 * stored prose would measure the branch that never enriches and report a comfortable zero.
 */
function makeComponentLibrary(size) {
  return Array.from({ length: size }, (_, index) => ({
    id: `comp-${String(index).padStart(3, '0')}`,
    name: `Component ${String(index).padStart(3, '0')}`,
    img: 'icons/svg/item-bag.svg',
    description: '',
    category: 'general',
    tags: [],
    essences: {},
    originItemUuid: `Compendium.pack.Item.source-${index}`,
  }));
}

/**
 * Project a component cohort with `fromUuid`, `enrichToHtml` and the memo all counted.
 *
 * The memo probe is what makes the SIGNATURE claim testable from outside: a cache read
 * happens once per `itemCardSignature` computation and never otherwise, so `memoGet` is the
 * number of deep record serializations performed.
 */
async function projectComponents(counters) {
  const components = makeComponentLibrary(COHORT);
  const system = { ...makeCraftingSystem(), components, features: { salvage: true } };
  const cache = new Map();

  const originalFromUuid = globalThis.fromUuid;
  globalThis.fromUuid = async (uuid) => {
    counters.bump('fromUuid');
    return { name: 'Source', system: { description: { value: 'Live prose' } }, uuid };
  };

  const cards = await buildItemCards(
    { getItems: () => components },
    system,
    '',
    {
      showTags: true,
      showEssences: true,
      essenceDefinitionById: new Map(),
      enrichToHtml: async (raw) => {
        counters.bump('enrichToHtml');
        return raw;
      },
      cache: countingFacade(cache, counters, { prefix: 'memo', methods: ['get', 'set'] }),
    }
  );

  return {
    cards,
    cache,
    restore: () => {
      globalThis.fromUuid = originalFromUuid;
    },
  };
}

describe('GM component browser: async fan-out and signature cost are bounded by the page', () => {
  it('projects the whole cohort with zero document resolutions and zero signatures', async () => {
    const counters = createOperationCounters();
    const world = await projectComponents(counters);
    try {
      assert.equal(world.cards.length, COHORT, 'the whole cohort is projected');
      assert.equal(counters.get('fromUuid'), 0, 'no source document was resolved');
      assert.equal(counters.get('enrichToHtml'), 0, 'no description was enriched');
      assert.equal(counters.get('memoGet'), 0, 'no card signature was computed');

      const model = buildComponentBrowserModel(world.cards, {
        category: 'all',
        essence: 'all',
        sortKey: 'name',
        sortDirection: 'asc',
        groupByCategory: true,
        pageIndex: 0,
        pageSize: PAGE_SIZE,
      });
      assert.equal(model.filtered.length, COHORT);
      assert.equal(model.page.length, PAGE_SIZE);
      assert.equal(model.categoryTotals.get('general'), COHORT, 'counted over the cohort');
      assert.equal(counters.get('fromUuid'), 0, 'filtering and paging resolved nothing');
      assert.equal(counters.get('memoGet'), 0, 'and computed no signature');

      // POSITIVE CONTROL: hydrating the page is what performs the work, once per card.
      await hydrateItemCards(model.page);
      assert.equal(counters.get('fromUuid'), PAGE_SIZE, 'the fan-out counter CAN go up');
      assert.equal(counters.get('enrichToHtml'), PAGE_SIZE, 'so can the enrichment counter');
      assert.equal(counters.get('memoGet'), PAGE_SIZE, 'and so can the signature counter');
      assert.equal(world.cache.size, PAGE_SIZE, 'exactly the page is memoized');

      // The remaining 35 are reachable — the bound is page scope, not a dropped tail.
      await hydrateItemCards(world.cards);
      assert.equal(counters.get('fromUuid'), COHORT);
      assert.equal(counters.get('memoGet'), COHORT);
    } finally {
      world.restore();
    }
  });

  it('fills the card in place, so the row, the inspector and the editor cannot disagree', async () => {
    const counters = createOperationCounters();
    const world = await projectComponents(counters);
    try {
      const [card] = world.cards;
      assert.equal(card.description, '', 'un-hydrated: the empty stored description');
      assert.equal(card.sourceOrigin, 'compendium', 'the origin badge needs no document');

      const hydrated = await card.hydrate();
      assert.equal(hydrated, card, 'hydration returns the SAME object it filled');
      assert.equal(card.description, 'Live prose', 'the live fallback landed on the card');
      assert.equal(card.hasDescription, true);
      assert.equal(card.sourceMissing, false);

      // Idempotent: a render effect calling this on every re-render must cost nothing.
      const before = counters.get('fromUuid');
      await card.hydrate();
      await card.hydrate();
      assert.equal(counters.get('fromUuid'), before, 'a re-hydrate resolves nothing again');
    } finally {
      world.restore();
    }
  });

  it('keeps `hydrate` off the card key set, so no reader can mistake it for a field', async () => {
    const counters = createOperationCounters();
    const world = await projectComponents(counters);
    try {
      const [card] = world.cards;
      assert.equal(typeof card.hydrate, 'function', 'the seam exists');
      assert.equal(
        Object.keys(card).includes('hydrate'),
        false,
        'and is non-enumerable, so spread, JSON and the bulk-edit models never see it'
      );
      assert.equal(JSON.stringify(card).includes('hydrate'), false);
      assert.equal({ ...card }.hydrate, undefined);
    } finally {
      world.restore();
    }
  });
});

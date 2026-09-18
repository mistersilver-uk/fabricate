/** Page-scope guards for the two GM browsers (issue 1081, under #1070). */
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
const { buildVocabularyUsage, countRecipeTagPlaceholderUsage } = await import(
  '../src/utils/vocabularyUsage.js'
);

/** More than two pages, so "the page" and "the cohort" are different numbers. */
const COHORT = 60;
const PAGE_SIZE = 25;

/**
 * The tag every recipe in the cohort names in a `tags` ingredient placeholder, cycled by
 * index so the counts are uneven and a wrong cohort produces a visibly wrong record.
 */
const PLACEHOLDER_TAGS = ['metal', 'herb', 'reagent'];
/**
 * A search term matching recipes `Recipe 000`–`Recipe 009` and nothing else, so `buildRecipeList`'s
 * search-filtered subset is a strict, known subset of the roster.
 */
const SEARCH_TERM = '00';
const SEARCHED_COHORT = 10;

// The GM recipe browser

/**
 * A real `RecipeManager` over an ALCHEMY system holding `COHORT` recipes, with the two expensive
 * per-row seams counted.
 */
function makeRecipeWorld(counters) {
  const system = makeCraftingSystem({ componentCount: 8, resolutionMode: 'alchemy' });
  const recipes = Array.from({ length: COHORT }, (_, index) =>
    Recipe.fromJSON({
      ...makeSignatureRecipe({
        id: `r-${String(index).padStart(3, '0')}`,
        componentId: `c-${index % 8}`,
        // Every recipe carries a tag placeholder (issue 1081).
        tagPlaceholders: [PLACEHOLDER_TAGS[index % PLACEHOLDER_TAGS.length]],
      }),
      name: `Recipe ${String(index).padStart(3, '0')}`,
      craftingSystemId: system.id,
    })
  );
  const systemManager = makeSystemManager(system, () => recipes);
  const manager = new RecipeManager({ getCraftingSystemManager: () => systemManager });
  for (const recipe of recipes) manager.recipes.set(recipe.id, recipe);

  // The DETAIL-tier probe. `validate()` is called on the STORED recipe by exactly one thing —
  // `_isRecipeIncomplete`, inside the detail bundle.
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

      // SECOND POSITIVE CONTROL, against the DETAIL counter itself.
      for (const row of browseRecipes(list.recipes).page) renderRecipeRow(row);
      assert.equal(
        counters.get('recipeDetailProjections'),
        PAGE_SIZE,
        'the DETAIL counter CAN go up in this fixture too — rendering a page is what does it'
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

// The GM component browser

/**
 * A component library whose every member carries a compendium link and an EMPTY stored description.
 */
function makeComponentLibrary(size, essences = {}) {
  return Array.from({ length: size }, (_, index) => ({
    id: `comp-${String(index).padStart(3, '0')}`,
    name: `Component ${String(index).padStart(3, '0')}`,
    img: 'icons/svg/item-bag.svg',
    description: '',
    category: 'general',
    tags: [],
    essences,
    originItemUuid: `Compendium.pack.Item.source-${index}`,
  }));
}

/** Project a component cohort with `fromUuid`, `enrichToHtml` and the memo all counted. */
async function projectComponents(
  counters,
  { showEssences = true, essenceDefinitionById = new Map(), componentEssences = {} } = {}
) {
  const components = makeComponentLibrary(COHORT, componentEssences);
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
      showEssences,
      essenceDefinitionById,
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

  /** The SIGNATURE, counted directly rather than through the memo (issue 1371). */
  it('computes NO card signature for the cohort — the deep serialization is page-scoped', async () => {
    const counters = createOperationCounters();
    const world = await projectComponents(counters, {
      showEssences: false,
      componentEssences: { fire: 2 },
      essenceDefinitionById: countingFacade(new Map([['fire', { name: 'Fire' }]]), counters, {
        prefix: 'essence',
        methods: ['get'],
      }),
    });
    try {
      assert.equal(world.cards.length, COHORT, 'the whole cohort is projected');
      assert.equal(
        counters.get('essenceGet'),
        0,
        'projecting the cohort computed NO signature: with essences off, the only reader of ' +
          'the essence catalogue is `itemCardSignature`'
      );

      // POSITIVE CONTROL, same fixture, same counter, same seam: hydrating one page is what
      // computes them, and it computes exactly one page's worth.
      await hydrateItemCards(world.cards.slice(0, PAGE_SIZE));
      assert.equal(
        counters.get('essenceGet'),
        PAGE_SIZE,
        'the signature counter CAN go up — 25 signatures, one catalogue read each'
      );

      // And the tail is reachable, so the bound is page scope rather than a dropped tail.
      await hydrateItemCards(world.cards);
      assert.equal(counters.get('essenceGet'), COHORT, 'one read per essence per signature');
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

// The consumers of the cohort — the guards the store-level ones do not cover

/** A `tags` placeholder ingredient set: the shape `countRecipeTagPlaceholders` exists to find. */
function tagPlaceholderSet(id, tags) {
  return {
    id,
    name: 'Placeholder',
    ingredientGroups: [{ id: `${id}-g`, options: [{ match: { type: 'tags', tags }, quantity: 1 }] }],
  };
}

describe('the Tags & Categories reference count reads the cohort without materialising it', () => {
  /**
   * The nav badge is a SIBLING of the view switch, so it re-derives on every render of the manager
   * in every view — which makes it the one consumer that must never touch the detail tier.
   */
  it('answers the nav badge from pre-counted data, touching no detail tier', () => {
    const counters = createOperationCounters();
    const world = makeRecipeWorld(counters);
    try {
      const list = buildRecipeList(world.systemManager, world.manager, world.system, '');
      const scoped = buildVocabularyUsage(list.recipes, [], {
        recipeTagPlaceholderCounts: list.recipeTagPlaceholderCounts,
      });

      assert.equal(scoped.categoryReferenceCount, COHORT, 'every recipe was still counted');
      assert.equal(
        counters.get('recipeDetailProjections'),
        0,
        'the badge composition built no detail bundle'
      );

      // POSITIVE CONTROL, same fixture, same counter, same seam: the composition WITHOUT the
      // pre-counted tags is the one this change replaced, and it materialises the cohort.
      const walked = buildVocabularyUsage(list.recipes, []);
      assert.equal(
        counters.get('recipeDetailProjections'),
        COHORT,
        'the counter CAN go up — walking the rows for their placeholders is what does it'
      );

      // ANTI-VACUITY, before the agreement is claimed. Both sides of the comparison below are maps,
      // and two empty maps agree — so the pre-counted side is stated as an exact, non-empty record
      // first.
      assert.deepEqual(
        Object.fromEntries(scoped.tagUsage),
        { metal: 20, herb: 20, reagent: 20 },
        'the pre-counted record really carries the cohort placeholders'
      );
      assert.equal(scoped.tagReferenceCount, COHORT, 'one placeholder tag per recipe');

      // And the two answers agree, so this is a choice of WHERE the walk happens rather than
      // a quietly different number on the screen.
      assert.deepEqual([...scoped.tagUsage], [...walked.tagUsage]);
      assert.deepEqual([...scoped.categoryUsage], [...walked.categoryUsage]);
      assert.equal(scoped.tagReferenceCount, walked.tagReferenceCount);
    } finally {
      world.dispose();
    }
  });

  /**
   * WHICH cohort the pre-count is folded over is a rendered number, not an implementation detail:
   * `buildRecipeList` counts the SEARCH-FILTERED subset, the same array the rows are projected
   * from, and moving it to the unfiltered roster would change what the Tags & Categories screen
   * reports without failing anything.
   */
  it('folds the pre-count over the SAME search-filtered cohort the rows come from', () => {
    const counters = createOperationCounters();
    const world = makeRecipeWorld(counters);
    try {
      const all = buildRecipeList(world.systemManager, world.manager, world.system, '');
      const searched = buildRecipeList(
        world.systemManager,
        world.manager,
        world.system,
        SEARCH_TERM
      );

      assert.equal(
        searched.recipes.length,
        SEARCHED_COHORT,
        'PRE-CONDITION: the term selects a strict subset, so the two cohorts are different'
      );
      assert.notDeepEqual(
        searched.recipeTagPlaceholderCounts,
        all.recipeTagPlaceholderCounts,
        'and the two cohorts really do produce different records — otherwise the equality ' +
          'below could not tell them apart'
      );

      // `Recipe 000`–`Recipe 009`, so index % 3 gives metal 4, herb 3, reagent 3.
      assert.deepEqual(
        searched.recipeTagPlaceholderCounts,
        { metal: 4, herb: 3, reagent: 3 },
        'the record is folded over the searched cohort, not the roster'
      );
      assert.equal(
        counters.get('recipeDetailProjections'),
        0,
        'and still built no detail bundle for either list'
      );

      // The screen-level statement: the badge composition over the searched rows agrees with
      // the walk over those same rows.
      const scoped = buildVocabularyUsage(searched.recipes, [], {
        recipeTagPlaceholderCounts: searched.recipeTagPlaceholderCounts,
      });
      const walked = buildVocabularyUsage(searched.recipes, []);
      assert.deepEqual([...scoped.tagUsage], [...walked.tagUsage]);
      assert.equal(
        counters.get('recipeDetailProjections'),
        SEARCHED_COHORT,
        'POSITIVE CONTROL, same fixture and same counter: walking the rows is what ' +
          'materialises them, and it stops at the searched cohort'
      );
    } finally {
      world.dispose();
    }
  });

  /**
   * The fallback the pre-count's JSDoc advertises — "omit it and the walk runs here as it always
   * did" — has to be REACHABLE, and an empty record has to stay authoritative.
   */
  it('walks when the pre-count is absent, and trusts an EMPTY pre-count as an answer', () => {
    const counters = createOperationCounters();
    const world = makeRecipeWorld(counters);
    try {
      const list = buildRecipeList(world.systemManager, world.manager, world.system, '');

      const absent = buildVocabularyUsage(list.recipes, [], {
        recipeTagPlaceholderCounts: undefined,
      });
      assert.equal(
        absent.tagReferenceCount,
        COHORT,
        'an ABSENT pre-count falls back to the walk rather than silently reading zero'
      );

      const empty = buildVocabularyUsage(list.recipes, [], { recipeTagPlaceholderCounts: {} });
      assert.equal(
        empty.tagReferenceCount,
        0,
        'an EMPTY pre-count is a real answer — a system with no placeholders at all — and ' +
          'must not be re-walked'
      );
    } finally {
      world.dispose();
    }
  });

  /**
   * The pre-counted record is folded off the recipe MODELS; the walk it replaces read the
   * `toJSON()`-sourced projection.
   */
  it('counts the same placeholders off a recipe MODEL as off its serialized projection', () => {
    const recipes = [
      Recipe.fromJSON({
        id: 'top-level',
        name: 'Top level sets',
        craftingSystemId: 'sys-scale',
        ingredientSets: [tagPlaceholderSet('s1', ['Herb', 'moon']), tagPlaceholderSet('s2', ['herb'])],
        resultGroups: [{ id: 'rg', results: [{ id: 'res', itemUuid: 'Item.r', quantity: 1 }] }],
      }),
      Recipe.fromJSON({
        id: 'multi-step',
        name: 'Multi step',
        craftingSystemId: 'sys-scale',
        steps: [
          { id: 'st1', name: 'One', ingredientSets: [tagPlaceholderSet('s3', ['ash'])] },
          { id: 'st2', name: 'Two', ingredientSets: [tagPlaceholderSet('s4', ['ash', 'moon'])] },
        ],
      }),
      Recipe.fromJSON({
        id: 'legacy',
        name: 'Legacy bare ingredients',
        craftingSystemId: 'sys-scale',
        // No `ingredientGroups`: the pre-groups authoring shape, which the model converts on
        // construction and `toJSON` re-emits BOTH ways.
        ingredientSets: [
          { id: 's5', name: 'Legacy', ingredients: [{ match: { type: 'tags', tags: ['ROOT'] } }] },
        ],
      }),
    ];

    const fromModels = countRecipeTagPlaceholderUsage(recipes);
    const fromProjections = countRecipeTagPlaceholderUsage(recipes.map((r) => r.toJSON()));

    assert.deepEqual(fromModels, fromProjections);
    assert.deepEqual(
      fromModels,
      { herb: 2, moon: 2, ash: 2, root: 1 },
      'POSITIVE CONTROL: the fixture really does carry placeholders, so the agreement above ' +
        'is not two empty maps agreeing'
    );
  });
});

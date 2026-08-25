/**
 * The GM browser projection modules extracted from `adminStore.js` in issue 1090.
 *
 * Two things are proved here, and only these two — the extraction is behaviour-preserving,
 * so every behavioural claim about what the projections MEAN is already made by the
 * `tests/stores/` suites driving the real store, which pass unmodified.
 *
 * 1. DIRECT INVOCABILITY. Each module is called here with plain fixtures and no
 *    `createAdminStore`, no `svelte/store`, and no reactive wiring, which is what issues
 *    1071 and 1072 need in order to benchmark and count projection work at all.
 *
 * 2. THE ALLOWLISTS. `buildSelectedSystemViewData` and `buildRecipeList` are hand-built
 *    ALLOWLIST projections: a field omitted from either is invisible to the UI however
 *    correctly the model, the normalizer and the write path behave, and it fails NO test
 *    that asserts on behaviour — it just stops appearing on screen. This repo has shipped
 *    that defect more than once (`componentCategories`, `categoryIcons`, `toolBreakage`,
 *    the progressive check config, `timeRequirement`, `craftingModifier`,
 *    `allowPlayerResultReorder`). The field lists below are therefore pinned as EXACT
 *    sets, not subsets: removing a key fails, and so does adding one silently.
 *
 * Adding a field to a projection is expected to fail this suite. Add it to the list here
 * in the same commit, deliberately — that is the point of the pin.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeList } from '../../src/ui/svelte/stores/adminRecipeRowProjection.js';
import {
  buildItemCards,
  hydrateItemCards,
  itemCardSignature,
} from '../../src/ui/svelte/stores/adminComponentRowProjection.js';
import {
  buildSelectedSystemViewData,
  enrichRecipeItemLibrary,
} from '../../src/ui/svelte/stores/adminSystemInspectorProjection.js';
import { countingCandidates } from '../helpers/scale/scaleCounters.js';
import { recipeItemDefinitionsContaining } from '../../src/utils/recipeItemMembership.js';

// --- Pinned allowlists ------------------------------------------------------

const SELECTED_SYSTEM_FIELDS = [
  'alchemy',
  'availableScriptMacros',
  'categories',
  'categoryIcons',
  'componentCategories',
  'componentCategoryIcons',
  'componentTagOptions',
  'craftingCheck',
  'craftingEffect',
  'description',
  'enabled',
  'essenceDefinitions',
  'features',
  'gatheringCraftingCheck',
  // Travel & Realms PARTICIPATION, and nothing else (issue 1282): the realm library, the reveal
  // mode and the modifier visibility are world scope, so a `realms` array here would be a second
  // and always-empty source of truth for whoever reached for it.
  'gatheringRealmSettings',
  'id',
  'itemTags',
  'managedItemOptions',
  // NO `modifiers` and NO `characterPrerequisites` (issue 1308): both libraries are world scope,
  // so projecting either here would be a second and always-empty source of truth, exactly as the
  // realm and currency notes above describe. Their readers take them from the top-level world
  // slices instead.
  'name',
  'recipeItemDefinitions',
  'recipeVisibility',
  'requirements',
  'resolutionMode',
  'salvageCraftingCheck',
  'salvageResolutionMode',
  'sceneOptions',
  'showEssences',
  'showRecipeVisibilityKnowledgeOptions',
  'showRecipeVisibilityPlayerNote',
  'showTags',
  'teaserConfig',
  'toolBreakage',
  'tools',
  'visibilityMode',
];

const RECIPE_ROW_FIELDS = [
  'access',
  'accessSummary',
  'allowPlayerResultReorder',
  'category',
  'checkSummary',
  'checkTierId',
  'complex',
  'craftingModifier',
  'description',
  'enableBlocked',
  'enabled',
  'id',
  'img',
  'incomplete',
  'ingredientCount',
  'ingredients',
  'ingredientSets',
  'isSimple',
  'locked',
  'minSuccessOutcomeId',
  'name',
  'outcomeRouting',
  'recipeItemId',
  'recipeItemIds',
  'recipeItemName',
  'recipeItemSourceUuid',
  'requirementsPreview',
  'resultGroupCount',
  'resultGroups',
  'resultItemCount',
  'resultSelection',
  'stepCount',
  'steps',
  'structureKey',
  'structureLabel',
  'timeRequirement',
  'toolCount',
  'toolIds',
  'tools',
  'visibility',
  'visibilitySummary',
];

// The keys `buildItemCards` DERIVES. The card also spreads the stored component, so the
// full key set varies with the fixture and only the derived half can be pinned exactly.
const ITEM_CARD_DERIVED_FIELDS = [
  'description',
  'essences',
  'hasDescription',
  'hasRegisteredItemUuid',
  'img',
  'registeredItemUuidDisplay',
  'salvageSummary',
  'showEssences',
  'showTags',
  'sourceMissing',
  'sourceOrigin',
  'sourceOriginLabel',
  'tags',
];

const RECIPE_ITEM_DEFINITION_FIELDS = [
  'caps',
  'derivedType',
  'description',
  'enabled',
  'id',
  'img',
  'learnedByCount',
  'linkMissing',
  'originItemUuid',
  'recipeIds',
  'recipes',
  'resolvedImg',
  'resolvedName',
];

// The selection triple + the two derivations every activity check carries (issues 1055,
// 1095). Nested inside the allowlist above, so an exact top-level set cannot see them.
const CHECK_MODIFIER_SELECTION_FIELDS = [
  'defaultModifierIds',
  'defaultModifierPolicy',
  'maxModifierPicks',
  'modifierFormulaInertCause',
];

function sortedKeys(value) {
  return Object.keys(value || {}).sort((a, b) => a.localeCompare(b));
}

// --- Fixtures ---------------------------------------------------------------

function makeRecipe(overrides = {}) {
  const recipe = {
    id: 'r-1',
    name: 'Iron Ingot',
    description: '  padded  ',
    img: 'ingot.png',
    category: 'Smithing',
    enabled: true,
    locked: false,
    allowPlayerResultReorder: true,
    recipeItemId: '',
    visibility: { restricted: true, allowedUserIds: ['u-1', 'u-2'] },
    ingredientSets: [
      {
        id: 'set-1',
        name: 'Ore',
        ingredientGroups: [{ id: 'g-1', options: [{ componentId: 'c-1' }, { componentId: 'c-2' }] }],
        toolIds: ['t-set'],
      },
    ],
    resultGroups: [{ id: 'rg-1', name: 'Out', results: [{ componentId: 'c-out' }] }],
    steps: [],
    toolIds: ['t-recipe'],
    ...overrides,
  };
  return {
    ...recipe,
    isSimpleRecipe: () => overrides.simple !== false,
    validate: () => ({ valid: overrides.valid !== false }),
    validateStructure: () => ({ valid: overrides.structureValid !== false }),
    toJSON: () => ({
      id: recipe.id,
      name: recipe.name,
      craftingSystemId: 'sys-1',
      steps: recipe.steps,
      ingredientSets: recipe.ingredientSets,
      resultGroups: recipe.resultGroups,
      resultSelection: overrides.resultSelection ?? null,
      outcomeRouting: overrides.outcomeRouting ?? null,
      checkTierId: overrides.checkTierId ?? null,
      minSuccessOutcomeId: null,
      craftingModifier: overrides.craftingModifier ?? null,
      timeRequirement: overrides.timeRequirement ?? null,
      complex: false,
      toolIds: recipe.toolIds,
      visibility: recipe.visibility,
      access: { characterIds: ['char-1'], playerIds: ['p-1', 'p-2'] },
    }),
  };
}

function makeSystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Forge',
    description: 'A forge',
    enabled: true,
    resolutionMode: 'routedByCheck',
    visibilityMode: 'knowledge',
    features: { essences: true, salvage: true, gathering: true },
    categories: ['Smithing'],
    componentCategories: ['ore'],
    categoryIcons: { Smithing: 'fas fa-hammer' },
    componentCategoryIcons: { ore: 'fas fa-gem' },
    itemTags: ['raw'],
    components: [],
    tools: [{ id: 'tool-1', name: 'Anvil', sourceUuid: 'Item.anvil', fallbackItemIds: ['Item.alt'] }],
    characterPrerequisites: [],
    requirements: { time: { enabled: true }, currency: { enabled: false, units: [] } },
    craftingCheck: {
      enabled: true,
      mode: 'tiered',
      outcomes: ['hit', 'miss'],
      rollFormula: '1d20',
      maxModifierPicks: 2,
      defaultModifierPolicy: 'playerPicks',
      defaultModifierIds: ['mod-1'],
      routed: { rollFormula: '1d20', dc: 15, tiers: [{ id: 'tier-hard', dc: 18 }] },
      simple: { rollFormula: '1d20', dc: 12 },
      progressive: { rollFormula: '1d20', checkBreakage: { enabled: true } },
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: true },
    },
    toolBreakage: { authority: 'checkDriven' },
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: { enabled: true, simple: { rollFormula: '1d20' } },
    gatheringCraftingCheck: { enabled: false },
    alchemy: null,
    recipeVisibility: { listMode: 'knowledge' },
    recipeItemDefinitions: [
      {
        id: 'book-1',
        name: 'Tome',
        originItemUuid: '',
        img: 'tome.png',
        description: 'A tome',
        enabled: true,
        recipeIds: ['r-1'],
        caps: { maxUses: 2 },
      },
    ],
    teaserConfig: { enabled: false, discoveryMode: 'threshold', fragments: [] },
    ...overrides,
  };
}

const COMPONENTS = [
  {
    id: 'c-1',
    name: 'Iron Ore',
    img: '',
    description: 'Raw ore',
    category: 'ore',
    tags: ['raw'],
    essences: { earth: 2 },
    salvage: { enabled: true, ingredientQuantity: 3, toolIds: ['t-1'], resultGroups: [{ id: 'g' }] },
  },
  {
    id: 'c-2',
    name: 'Coal',
    img: 'coal.png',
    description: '',
    category: 'ore',
    tags: [],
    essences: {},
  },
];

const ESSENCE_BY_ID = new Map([['earth', { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' }]]);

function makeRecipeManager(recipes, blockedIds = []) {
  return {
    getRecipes: () => recipes,
    canActivateRecipe: (recipe) => ({ valid: !blockedIds.includes(recipe.id) }),
  };
}

function makeItemsManager(components) {
  return {
    getItems: (_systemId, searchTerm) =>
      searchTerm
        ? components.filter((c) => c.name.toLowerCase().includes(String(searchTerm).toLowerCase()))
        : components,
  };
}

// --- Tests ------------------------------------------------------------------

describe('adminRecipeRowProjection.buildRecipeList (direct, no store)', () => {
  it('projects rows carrying exactly the pinned allowlist of fields', () => {
    const recipes = [makeRecipe()];
    const result = buildRecipeList(null, makeRecipeManager(recipes), makeSystem(), '');

    assert.equal(result.recipes.length, 1);
    assert.deepEqual(sortedKeys(result.recipes[0]), RECIPE_ROW_FIELDS);
  });

  it('derives the structure, counts, check pill and membership a row cannot compute', () => {
    const recipes = [
      makeRecipe({ id: 'r-ok', checkTierId: 'tier-hard' }),
      makeRecipe({ id: 'r-blocked', name: 'Broken', valid: false, structureValid: false }),
    ];
    const system = makeSystem();
    system.recipeItemDefinitions[0].recipeIds = ['r-ok'];
    const result = buildRecipeList(null, makeRecipeManager(recipes, ['r-blocked']), system, '');
    const [ok, blocked] = result.recipes;

    assert.deepEqual(ok.checkSummary, { kind: 'dc', dc: 18 }, 'the row resolves its tier DC');
    assert.equal(ok.structureKey, 'simple');
    assert.equal(ok.ingredientCount, 2);
    assert.equal(ok.toolCount, 1, 'a simple recipe counts only its ingredient-set tools');
    assert.equal(ok.resultItemCount, 1);
    assert.equal(ok.visibilitySummary, 'Restricted (2)');
    assert.deepEqual(ok.accessSummary, { characterCount: 1, playerCount: 2 });
    assert.deepEqual(ok.recipeItemIds, ['book-1'], 'membership resolves through the book');
    assert.equal(ok.recipeItemName, 'Tome');
    assert.equal(ok.enableBlocked, false);

    assert.equal(blocked.enableBlocked, true, 'activation refusal is projected');
    assert.equal(
      blocked.incomplete,
      false,
      'a structurally broken recipe is un-enableable WITHOUT being incomplete — the two are different facts'
    );
    assert.deepEqual(blocked.recipeItemIds, [], 'a non-member book contributes nothing');
  });

  it('filters by search term while counting categories over the unfiltered library', () => {
    const recipes = [makeRecipe({ id: 'r-1', name: 'Iron Ingot' }), makeRecipe({ id: 'r-2', name: 'Steel Bar', category: 'Alloying' })];
    const result = buildRecipeList(null, makeRecipeManager(recipes), makeSystem(), 'steel');

    assert.deepEqual(
      result.recipes.map((row) => row.id),
      ['r-2']
    );
    assert.deepEqual(
      result.recipeCategories.map((entry) => entry.name).sort((a, b) => a.localeCompare(b)),
      ['Alloying', 'Smithing'],
      'the category rail counts every recipe, not the filtered page'
    );
  });

  it('returns the empty shape with no selected system', () => {
    assert.deepEqual(buildRecipeList(null, makeRecipeManager([]), null, ''), {
      recipes: [],
      recipeCategories: [],
      recipeTagPlaceholderCounts: {},
      showVisibilitySummary: false,
    });
  });
});

/**
 * The two-tier row (issue 1081).
 *
 * The claim is narrow and mechanical: the fields `recipeBrowserModel` reads to filter, sort,
 * count and paginate are computed for EVERY row in the cohort, and everything else is
 * computed only for the rows something actually reads. Every negative assertion below is
 * paired with a positive control in the same fixture — a counter that reads zero because the
 * work was skipped is indistinguishable from one that reads zero because the seam was never
 * wired, and this repository has shipped that mistake before.
 */
describe('adminRecipeRowProjection: summary tier vs detail tier', () => {
  /** A recipe manager whose expensive seams count their calls. */
  function makeCountingRecipeManager(recipes, blockedIds = []) {
    const calls = { canActivateRecipe: 0, toJSON: 0, getRecipes: 0, previewSets: 0 };
    const instrumented = recipes.map((recipe) => ({
      ...recipe,
      // The ALLOCATION-heavy half of the detail tier, counted where it actually happens.
      // `toJSON` and `canActivateRecipe` are the two CHEAP seams — one clone, one verdict —
      // and neither observes `_buildRecipeBrowserDisplay` / `_buildRequirementPreviewStep`,
      // the per-set/per-step object graph the module header calls the expensive half. Those
      // build by `map`ping the step's ingredient sets, while the summary tier's arithmetic
      // fold iterates the same array with `for...of` — so a counting `map` separates them
      // exactly, and an eagerly-built preview is visible here and nowhere else.
      ingredientSets: countingCandidates(
        recipe.ingredientSets,
        {
          bump: () => {
            calls.previewSets += 1;
          },
        },
        'previewSets'
      ),
      toJSON: () => {
        calls.toJSON += 1;
        return recipe.toJSON();
      },
    }));
    return {
      calls,
      recipes: instrumented,
      manager: {
        getRecipes: () => {
          calls.getRecipes += 1;
          return instrumented;
        },
        canActivateRecipe: (recipe) => {
          calls.canActivateRecipe += 1;
          return { valid: !blockedIds.includes(recipe.id) };
        },
      },
    };
  }

  function makeCohort(size) {
    return Array.from({ length: size }, (_, index) =>
      makeRecipe({ id: `r-${index}`, name: `Recipe ${String(index).padStart(3, '0')}` })
    );
  }

  it('projects the whole cohort cheaply: no toJSON and no activation check per row', () => {
    const { calls, manager } = makeCountingRecipeManager(makeCohort(50));
    const result = buildRecipeList(null, manager, makeSystem(), '');

    assert.equal(result.recipes.length, 50, 'the whole cohort is projected');
    assert.equal(calls.toJSON, 0, 'no row body is cloned to build the cohort');
    assert.equal(calls.canActivateRecipe, 0, 'no row runs the activation gate to build the cohort');
    assert.equal(
      calls.previewSets,
      0,
      'and no requirements-preview object graph is built — the sort keys are folded ' +
        'arithmetically over the same sets rather than derived from the preview'
    );
  });

  it('POSITIVE CONTROL: reading a detail field is what performs the work', () => {
    const { calls, manager } = makeCountingRecipeManager(makeCohort(50));
    const rows = buildRecipeList(null, manager, makeSystem(), '').recipes;

    // Exactly the page a default browser open renders.
    for (const row of rows.slice(0, 25)) void row.requirementsPreview;
    assert.equal(calls.toJSON, 25, 'the counters CAN go up — one clone per row read');
    assert.equal(
      calls.previewSets,
      25,
      'including the preview builder — one ingredient set MAPPED per row read. What this ' +
        'counter observes is `map` specifically, which is precisely what separates the ' +
        "preview from the summary tier's `for...of` fold over the same array. So a red here " +
        'means one of two things, and they are not the same thing: the preview went eager ' +
        'again (the regression this guards), or the preview kept its behaviour and stopped ' +
        'using `map`, which blinds the instrument. In the second case re-point the counter ' +
        'at the new iteration — do not relax the assertion, which is how the separation ' +
        'stops being measured at all.'
    );

    for (const row of rows.slice(0, 25)) void row.enableBlocked;
    assert.equal(calls.canActivateRecipe, 25, 'and one activation check per row read');
  });

  it('memoizes each tier per row, so a second read costs nothing', () => {
    const { calls, manager } = makeCountingRecipeManager(makeCohort(3));
    const [row] = buildRecipeList(null, manager, makeSystem(), '').recipes;

    void row.steps;
    void row.requirementsPreview;
    void row.visibility;
    void row.enableBlocked;
    void row.enableBlocked;

    assert.equal(calls.toJSON, 1, 'the detail bundle is produced once for the row');
    assert.equal(calls.canActivateRecipe, 1, 'so is the activation verdict');
  });

  it('carries every SORT KEY in the summary tier, so a cohort sort is not a cohort hydrate', () => {
    const { calls, manager } = makeCountingRecipeManager(makeCohort(20));
    const rows = buildRecipeList(null, manager, makeSystem(), '').recipes;

    // The four sort keys the recipe library offers besides `name`, plus the row's I/O
    // readout, read over the WHOLE filtered cohort before pagination.
    for (const row of rows) {
      assert.equal(typeof row.ingredientCount, 'number');
      assert.equal(typeof row.resultItemCount, 'number');
      assert.equal(typeof row.resultGroupCount, 'number');
      assert.equal(typeof row.checkSummary.dc, 'number');
      assert.equal(typeof row.category, 'string');
      assert.equal(typeof row.enabled, 'boolean');
      assert.equal(typeof row.locked, 'boolean');
    }
    assert.equal(calls.toJSON, 0, 'reading every sort key materialised no detail');
    assert.equal(calls.canActivateRecipe, 0, 'nor any activation verdict');

    // `enableBlocked` is the fifth sort key. It IS answerable across the cohort — it just
    // costs one activation check per row, which is why it is slotted on its own.
    assert.deepEqual(
      rows.map((row) => row.enableBlocked),
      rows.map(() => false)
    );
    assert.equal(calls.canActivateRecipe, 20, 'sorting by attention answers every row');
    assert.equal(calls.toJSON, 0, 'and still materialises no detail bundle');
  });

  it('projects from the roster the caller already fetched, rather than fetching it again', () => {
    const { calls, manager, recipes } = makeCountingRecipeManager(makeCohort(5));

    const result = buildRecipeList(null, manager, makeSystem(), '', { roster: recipes });
    assert.equal(result.recipes.length, 5, 'the supplied roster IS the cohort');
    assert.equal(
      calls.getRecipes,
      0,
      'a supplied roster is used as-is: the store already holds this array for its essence ' +
        'cards, and re-fetching copies the whole library a second time per refresh'
    );

    // POSITIVE CONTROL, same fixture, same counter: omitting the roster fetches one.
    buildRecipeList(null, manager, makeSystem(), '');
    assert.equal(calls.getRecipes, 1, 'the counter CAN go up — and the fallback still works');
  });

  it('resolves book membership through ONE cohort bucket index, not a scan per recipe', () => {
    let definitionsExamined = 0;
    const definitions = countingCandidates(
      Array.from({ length: 8 }, (_, index) => ({
        id: `book-${index}`,
        name: `Book ${index}`,
        originItemUuid: '',
        recipeIds: [`r-${index}`],
      })),
      {
        bump: () => {
          definitionsExamined += 1;
        },
      },
      'definitionsExamined'
    );
    const system = makeSystem({
      recipeItemDefinitions: definitions,
      membershipResolvesByRecipeIds: true,
    });
    const { manager, recipes } = makeCountingRecipeManager(makeCohort(50));

    const rows = buildRecipeList(null, manager, system, '').recipes;
    assert.deepEqual(rows[3].recipeItemIds, ['book-3'], 'membership still resolves correctly');
    assert.equal(
      definitionsExamined,
      0,
      'the buckets are built with one pass over the definitions, so no recipe pays a scan'
    );

    // POSITIVE CONTROL, same fixture, same counter, same seam: the membership leaf's DEFAULT
    // lookup is the `definitions.filter(...)` the index replaces, and it examines every
    // definition for every recipe — the O(books x recipes) term this cohort index removes.
    for (const recipe of recipes) recipeItemDefinitionsContaining(definitions, recipe, true);
    assert.equal(
      definitionsExamined,
      50 * 8,
      'the counter CAN go up, by exactly the product the bucket index turns into a Map.get'
    );
  });

  it('credits a book that lists the same recipe twice ONCE, exactly as filter() did', () => {
    const system = makeSystem({
      membershipResolvesByRecipeIds: true,
      recipeItemDefinitions: [
        { id: 'book-dup', name: 'Duplicated', originItemUuid: '', recipeIds: ['r-0', 'r-0'] },
        { id: 'book-other', name: 'Other', originItemUuid: '', recipeIds: ['r-0'] },
      ],
    });
    const { manager } = makeCountingRecipeManager(makeCohort(1));
    const [row] = buildRecipeList(null, manager, system, '').recipes;

    // A DEFINITION contributes at most one entry; two DIFFERENT books contribute two. Both
    // halves in one assertion, because a dedup that collapsed the second book as well would
    // pass a test that only pinned the first.
    assert.deepEqual(row.recipeItemIds, ['book-dup', 'book-other']);
    assert.deepEqual(
      row.recipeItemIds,
      system.recipeItemDefinitions
        .filter((definition) => definition.recipeIds.some((id) => id === 'r-0'))
        .map((definition) => definition.id),
      'the bucket index reproduces the filter() it replaced, duplicate ids included — ' +
        'otherwise the row renders the same book chip twice'
    );
  });

  it('materialises everything through a JSON round-trip, as the editor draft does', () => {
    const { manager } = makeCountingRecipeManager(makeCohort(1));
    const [row] = buildRecipeList(null, manager, makeSystem(), '').recipes;
    // `cloneRecipeDraft` in the manager root is exactly this.
    const draft = JSON.parse(JSON.stringify(row));

    assert.deepEqual(sortedKeys(draft), RECIPE_ROW_FIELDS, 'a cloned draft carries every field');
    assert.equal(draft.structureKey, 'simple');
    assert.equal(draft.visibilitySummary, 'Restricted (2)');
    assert.equal(Array.isArray(draft.requirementsPreview), true);
  });
});

describe('adminComponentRowProjection.buildItemCards (direct, no store)', () => {
  it('projects every derived card field and reuses a memo hit verbatim', async () => {
    const cache = new Map();
    const system = makeSystem({ components: COMPONENTS });
    const options = {
      showTags: true,
      showEssences: true,
      essenceDefinitionById: ESSENCE_BY_ID,
      enrichToHtml: undefined,
      cache,
    };

    const cold = await buildItemCards(makeItemsManager(COMPONENTS), system, '', options);
    assert.equal(cold.length, 2);
    for (const field of ITEM_CARD_DERIVED_FIELDS) {
      assert.ok(field in cold[0], `the card derives ${field}`);
    }
    assert.deepEqual(cold[0].essences, [
      { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', quantity: 2 },
    ]);
    assert.equal(cold[0].img, 'icons/svg/item-bag.svg', 'an empty img falls back');
    assert.equal(cold[0].salvageSummary.quantityRequired, 3);
    assert.ok(!cold[1].salvageSummary, 'a component with salvage off gets no summary');
    assert.equal(
      cache.size,
      0,
      'projecting the cohort memoizes nothing: the memo keys the HYDRATED half (issue 1081)'
    );

    await hydrateItemCards(cold);
    assert.equal(cache.size, 2, 'each hydrated card is memoized');

    // A second projection rebuilds the cheap cards (they are cheap), and their hydration
    // comes back out of the memo rather than off the source documents again.
    const warm = await buildItemCards(makeItemsManager(COMPONENTS), system, '', options);
    await hydrateItemCards(warm);
    assert.equal(cache.size, 2, 'no new memo entries: both hydrations hit');

    // THE NEW CONTRACT, stated rather than left implicit (issue 1081). A refresh no longer
    // reuses the card OBJECT — the cheap card is rebuilt every time and only its resolved
    // half is memoized — so "an unchanged component reuses the same card object" is simply
    // no longer true and its removal is honest. What replaces it is this pair: fresh objects,
    // and a re-hydration that comes back out of the memo with the same reading. The identity
    // loss is why the selected and edited cards must be re-asked to hydrate after a refresh,
    // so a silent return to object reuse would hide that requirement rather than satisfy it.
    assert.ok(warm[0] !== cold[0], 'a refresh projects a FRESH card object');
    assert.deepEqual(warm[0].sourceOrigin, cold[0].sourceOrigin);
    assert.equal(warm[0].description, cold[0].description);
    assert.equal(warm[0].sourceMissing, cold[0].sourceMissing);
  });

  /**
   * A REJECTED hydration must not be memoized (issue 1081).
   *
   * `hydrate()` memoizes its in-flight promise so a render effect calling it on every
   * re-render costs nothing — but `_documentDescriptionCandidate` awaits Foundry's enricher,
   * which does not catch its own throws the way the document lookup does. Caching the
   * rejected promise turns one transient failure into a permanent one for that card, plus an
   * unhandled rejection on every subsequent render, where the previous behaviour was a loud
   * failure of the whole refresh that the next refresh cleared.
   *
   * It must also be AUDIBLE. All three view-side callers swallow the rejection deliberately —
   * a card that cannot resolve keeps its un-hydrated reading, which renders correctly rather
   * than blankly — so without a log here a persistently failing enricher leaves the GM on a
   * stale description with nothing at all in the console. Pre-1081 the same throw aborted the
   * refresh loudly and tripped the smoke run's console-error gate.
   */
  it('does not memoize a REJECTED hydration, so a later render retries — and says so', async () => {
    const component = {
      id: 'c-throw',
      name: 'Thrown',
      img: '',
      description: '',
      category: 'ore',
      tags: [],
      essences: {},
      originItemUuid: 'Compendium.pack.Item.src',
    };
    const originalFromUuid = globalThis.fromUuid;
    globalThis.fromUuid = async () => ({ system: { description: { value: 'Live prose' } } });
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    let enrichAttempts = 0;
    try {
      const [card] = await buildItemCards(
        makeItemsManager([component]),
        makeSystem({ components: [component] }),
        '',
        {
          showTags: true,
          showEssences: false,
          essenceDefinitionById: new Map(),
          enrichToHtml: async (raw) => {
            enrichAttempts += 1;
            if (enrichAttempts === 1) throw new Error('enricher blew up');
            return raw;
          },
        }
      );

      await assert.rejects(() => card.hydrate(), /enricher blew up/);
      assert.equal(card.description, '', 'the card keeps its un-hydrated reading');

      assert.equal(
        warnings.length,
        1,
        'the failure is LOGGED — every view-side caller swallows this rejection, so without ' +
          'a warning here a persistently failing card is completely silent'
      );
      assert.match(
        String(warnings[0][0]),
        /Fabricate \| could not resolve the source document for component "c-throw"/,
        'and it names the component, so a GM staring at a stale description can be told which'
      );
      assert.match(String(warnings[0][1]), /enricher blew up/, 'carrying the original error');

      await card.hydrate();
      assert.equal(enrichAttempts, 2, 'the retry really re-ran the resolution');
      assert.equal(card.description, 'Live prose', 'and the second attempt fills the card');
      assert.equal(
        warnings.length,
        1,
        'a SUCCESSFUL retry adds nothing — the log follows the rejection, not the render'
      );
    } finally {
      globalThis.fromUuid = originalFromUuid;
      console.warn = originalWarn;
    }
  });

  it('runs uncached when no cache is injected', async () => {
    const cards = await buildItemCards(makeItemsManager(COMPONENTS), makeSystem(), '', {
      showTags: false,
      showEssences: false,
      essenceDefinitionById: new Map(),
    });
    assert.deepEqual(cards[0].tags, [], 'tags are suppressed when the feature is off');
    assert.deepEqual(cards[0].essences, []);
  });

  it('invalidates the memo on a system-level flag change, not just an item edit', () => {
    const first = itemCardSignature(COMPONENTS[0], true, true, true, ESSENCE_BY_ID);
    assert.notEqual(
      first,
      itemCardSignature(COMPONENTS[0], true, true, false, ESSENCE_BY_ID),
      'the salvage feature flag is part of the signature'
    );
    assert.notEqual(
      first,
      itemCardSignature(COMPONENTS[0], true, true, true, new Map([['earth', { name: 'Soil' }]])),
      'a renamed essence invalidates the card that displays it'
    );
    assert.equal(
      first,
      itemCardSignature({ ...COMPONENTS[0] }, true, true, true, ESSENCE_BY_ID),
      'the signature is structural, not identity-based'
    );
  });
});

describe('adminSystemInspectorProjection (direct, no store)', () => {
  it('emits exactly the pinned selectedSystem allowlist', () => {
    const view = buildSelectedSystemViewData(makeSystem(), [], [], [], [], []);
    assert.deepEqual(sortedKeys(view), SELECTED_SYSTEM_FIELDS);
  });

  it('carries the selection triple and inert cause onto all three activity checks', () => {
    const view = buildSelectedSystemViewData(makeSystem(), [], [], [], [], []);
    for (const block of ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck']) {
      for (const field of CHECK_MODIFIER_SELECTION_FIELDS) {
        assert.ok(field in view[block], `${block} carries ${field}`);
      }
    }
    assert.equal(view.craftingCheck.defaultModifierPolicy, 'playerPicks');
    assert.equal(view.craftingCheck.maxModifierPicks, 2, 'the pick cap passes through undefaulted');
    assert.equal(
      view.salvageCraftingCheck.maxModifierPicks,
      undefined,
      'an unbounded cap stays undefined rather than being forged into a number'
    );
    assert.equal(view.gatheringCraftingCheck.modifierFormulaInertCause, 'noCheck');
  });

  it('projects the fields a hand-built allowlist has historically dropped', () => {
    const view = buildSelectedSystemViewData(makeSystem(), [], [], [], [], []);
    assert.deepEqual(view.componentCategories, ['ore']);
    assert.deepEqual(view.categoryIcons, { Smithing: 'fas fa-hammer' });
    assert.deepEqual(view.componentCategoryIcons, { ore: 'fas fa-gem' });
    assert.equal(view.toolBreakage.authority, 'checkDriven');
    assert.deepEqual(view.craftingCheck.progressive, {
      rollFormula: '1d20',
      checkBreakage: { enabled: true },
    });
    assert.equal(
      view.craftingCheck.consumption.consumeIngredientsOnFail,
      false,
      'a default-true policy authored OFF stays off — a dropped one is inverted, not absent'
    );
    assert.equal(
      view.features.refundOnPlayerCancel,
      true,
      'a legacy system missing the key refunds'
    );
    assert.equal(view.craftingEffect !== undefined, true);
  });

  it('normalizes library tools through the model, coalescing the legacy uuid spellings', () => {
    const view = buildSelectedSystemViewData(makeSystem(), [], [], [], [], []);
    assert.equal(view.tools[0].originItemUuid, 'Item.anvil');
    assert.equal(view.tools[0].registeredItemUuid, 'Item.anvil');
    assert.deepEqual(view.tools[0].aliasItemUuids, ['Item.alt']);
  });

  it('paints the Books & Scrolls library synchronously, then enriches it', async () => {
    const view = buildSelectedSystemViewData(makeSystem(), [], [], [], [], []);
    assert.deepEqual(sortedKeys(view.recipeItemDefinitions[0]), RECIPE_ITEM_DEFINITION_FIELDS);
    assert.deepEqual(view.recipeItemDefinitions[0].recipes, [], 'phase 1 resolves nothing');
    assert.equal(view.recipeItemDefinitions[0].derivedType, 'Incomplete');

    const enriched = await enrichRecipeItemLibrary(
      view.recipeItemDefinitions,
      [{ id: 'r-1', name: 'Iron Ingot', category: 'Smithing' }],
      true
    );
    assert.deepEqual(sortedKeys(enriched[0]), RECIPE_ITEM_DEFINITION_FIELDS, 'same shape');
    assert.deepEqual(enriched[0].recipes, [{ id: 'r-1', name: 'Iron Ingot', category: 'Smithing' }]);
    assert.equal(enriched[0].derivedType, 'Scroll', 'one member reads as a scroll');
    assert.equal(enriched[0].learnedByCount, 0);
  });

  it('resolves membership from the book, not the legacy scalar, on a marked system', async () => {
    // `membershipResolvesByRecipeIds: true` retires the legacy `recipe.recipeItemId`
    // index outright, so an emptied book stays empty rather than resurrecting members.
    const view = buildSelectedSystemViewData(
      makeSystem({ recipeItemDefinitions: [{ id: 'book-1', name: 'Tome', recipeIds: [] }] }),
      [],
      [],
      [],
      [],
      []
    );
    const enriched = await enrichRecipeItemLibrary(
      view.recipeItemDefinitions,
      [{ id: 'r-1', name: 'Iron Ingot', recipeItemId: 'book-1' }],
      true
    );
    assert.deepEqual(enriched[0].recipes, []);
  });

  it('returns null with no selected system', () => {
    assert.equal(buildSelectedSystemViewData(null, [], [], [], [], []), null);
  });
});

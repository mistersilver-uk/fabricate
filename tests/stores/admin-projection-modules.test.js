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

// --- Pinned allowlists ------------------------------------------------------

const SELECTED_SYSTEM_FIELDS = [
  'alchemy',
  'availableScriptMacros',
  'categories',
  'categoryIcons',
  'characterPrerequisites',
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
  'id',
  'itemTags',
  'managedItemOptions',
  'modifiers',
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
    modifiers: [{ id: 'mod-1', label: 'Guild', icon: 'fa-solid fa-user', expression: '2' }],
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
  /** A recipe manager whose two expensive seams count their calls. */
  function makeCountingRecipeManager(recipes, blockedIds = []) {
    const calls = { canActivateRecipe: 0, toJSON: 0 };
    const instrumented = recipes.map((recipe) => ({
      ...recipe,
      toJSON: () => {
        calls.toJSON += 1;
        return recipe.toJSON();
      },
    }));
    return {
      calls,
      recipes: instrumented,
      manager: {
        getRecipes: () => instrumented,
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
  });

  it('POSITIVE CONTROL: reading a detail field is what performs the work', () => {
    const { calls, manager } = makeCountingRecipeManager(makeCohort(50));
    const rows = buildRecipeList(null, manager, makeSystem(), '').recipes;

    // Exactly the page a default browser open renders.
    for (const row of rows.slice(0, 25)) void row.requirementsPreview;
    assert.equal(calls.toJSON, 25, 'the counters CAN go up — one clone per row read');

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
    assert.deepEqual(warm[0].sourceOrigin, cold[0].sourceOrigin);
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

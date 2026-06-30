import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CraftingListingBuilder,
  CRAFTING_BROWSE_STATUS,
} from '../src/systems/CraftingListingBuilder.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';

const PLAYER = { id: 'user-1', isGM: false };
const GM = { id: 'gm-1', isGM: true };

const MODE_LABEL_KEYS = {
  simple: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
  routedByIngredients: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByIngredients',
  routedByCheck: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByCheck',
  progressive: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
  alchemy: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy',
};

function makeSystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Smithing',
    resolutionMode: 'simple',
    craftingCheck: {
      simple: { rollFormula: '1d20', dc: 15 },
      routed: {},
      progressive: {},
    },
    recipeVisibility: { knowledge: { learn: { consumeOnLearn: true } } },
    components: [{ id: 'c1', name: 'Iron Sword', img: 'icons/sword.webp' }],
    ...overrides,
  };
}

function makeRecipe(overrides = {}) {
  const sets = overrides.ingredientSets ?? [{ id: 'set-1', name: 'Set One' }];
  const resultGroups = overrides.resultGroups ?? [
    {
      id: 'g1',
      name: 'Default',
      checkOutcomeIds: [],
      results: [{ componentId: 'c1', quantity: 2 }],
    },
  ];
  return {
    id: 'recipe-1',
    name: 'Iron Sword',
    img: 'icons/sword.webp',
    craftingSystemId: 'sys-1',
    description: 'A sturdy blade.',
    recipeItemId: null,
    linkedRecipeItemUuid: null,
    timeRequirement: { hours: 2 },
    ...overrides,
    ingredientSets: sets,
    resultGroups,
    getExecutionSteps() {
      return [{ id: 'step-1', name: 'Step 1', ingredientSets: sets, resultGroups }];
    },
  };
}

function makeCraftability(overrides = {}) {
  return {
    canCraft: true,
    satisfiableSet: { id: 'set-1' },
    ingredientStates: [{ description: '2x Iron', need: 2, have: 2, satisfied: true }],
    essenceStates: [{ type: 'fire', need: 1, have: 1, satisfied: true }],
    toolStates: [{ name: 'Hammer', available: true }],
    missing: { ingredients: [], essences: [], tools: [] },
    ...overrides,
  };
}

function makeBuilder({
  entries = [{ recipe: makeRecipe(), access: { reason: 'ok' } }],
  system = makeSystem(),
  craftability = makeCraftability(),
  exhausted = false,
} = {}) {
  const craftingSystemManager = { getSystem: (id) => (id === system.id ? system : null) };
  const resolutionModeService = new ResolutionModeService(craftingSystemManager);
  const recipeManager = { evaluateCraftability: () => craftability };
  const recipeVisibility = {
    getVisibleRecipes: () => entries,
    isKnowledgeItemExhausted: () => exhausted,
  };
  return new CraftingListingBuilder({
    recipeManager,
    recipeVisibility,
    resolutionModeService,
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 1000,
  });
}

function buildOne(opts, viewer = PLAYER) {
  const listing = makeBuilder(opts).buildListing({
    craftingActor: { id: 'actor-1', items: [] },
    viewer,
  });
  return { listing, recipe: listing.recipes[0] };
}

describe('CraftingListingBuilder — listing shape', () => {
  it('projects worldTime, counts, and the selected actor id', () => {
    const { listing } = buildOne();
    assert.equal(listing.worldTime, 1000);
    assert.equal(listing.selectedActorId, 'actor-1');
    assert.deepEqual(listing.counts, { available: 1, total: 1 });
  });

  it('skips entries with no recipe', () => {
    const { listing } = buildOne({
      entries: [{ access: { reason: 'ok' } }, { recipe: makeRecipe(), access: { reason: 'ok' } }],
    });
    assert.equal(listing.recipes.length, 1);
  });
});

describe('CraftingListingBuilder — per-set craftability', () => {
  it('folds the per-set evaluateCraftability result (essences + tools + ingredients)', () => {
    const craftability = makeCraftability();
    const { recipe } = buildOne({ craftability });
    assert.equal(recipe.ingredientSets.length, 1);
    const set = recipe.ingredientSets[0];
    assert.equal(set.id, 'set-1');
    assert.equal(set.label, 'Set One');
    assert.deepEqual(set.craftability.essenceStates, craftability.essenceStates);
    assert.deepEqual(set.craftability.toolStates, craftability.toolStates);
    assert.deepEqual(set.craftability.ingredientStates, craftability.ingredientStates);
  });

  it('labels an unnamed ingredient set through the fallback key', () => {
    const recipe = makeRecipe({ ingredientSets: [{ id: 'set-x', name: '' }] });
    const { recipe: model } = buildOne({ entries: [{ recipe, access: { reason: 'ok' } }] });
    assert.equal(model.ingredientSets[0].label, 'FABRICATE.App.Crafting.IngredientSetFallback');
  });
});

describe('CraftingListingBuilder — browse status per reason', () => {
  it('available when materials satisfied and access ok', () => {
    const { recipe } = buildOne();
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
    assert.deepEqual(recipe.blockingReasons, []);
  });

  it('missingMaterials when canCraft is false', () => {
    const { recipe } = buildOne({ craftability: makeCraftability({ canCraft: false }) });
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.MISSING_MATERIALS);
    assert.equal(recipe.blockingReasons[0], 'FABRICATE.App.Crafting.Blocking.MissingMaterials');
  });

  it('locked when access reason is locked', () => {
    const { recipe } = buildOne({
      entries: [{ recipe: makeRecipe(), access: { reason: 'locked' } }],
    });
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.LOCKED);
  });

  it('unknown when access reason is knowledge', () => {
    const { recipe } = buildOne({
      entries: [{ recipe: makeRecipe(), access: { reason: 'knowledge' } }],
    });
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.UNKNOWN);
  });

  it('exhausted when the recipe item is used up (and access otherwise ok)', () => {
    const { recipe } = buildOne({ exhausted: true });
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.EXHAUSTED);
  });

  it('a GM never sees an exhausted status (knowledge bypass)', () => {
    const { recipe } = buildOne({ exhausted: true }, GM);
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
  });

  it('canLearn only when a non-GM knowledge recipe has an item reference', () => {
    const recipe = makeRecipe({ recipeItemId: 'item-1' });
    const { recipe: model } = buildOne({
      entries: [{ recipe, access: { reason: 'knowledge' } }],
    });
    assert.equal(model.learn.canLearn, true);
    assert.equal(model.learn.consumeOnLearn, true);
  });
});

describe('CraftingListingBuilder — teaser redaction (non-leak)', () => {
  const teaserEntry = {
    recipe: makeRecipe({ description: 'SECRET blade of fire.' }),
    access: {
      reason: 'teaser',
      teaserState: { hiddenFields: ['ingredients', 'results', 'description'] },
    },
  };

  it('redacts every hidden field for a non-GM viewer', () => {
    const { recipe } = buildOne({ entries: [teaserEntry] });
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.DISCOVERY);
    assert.equal(recipe.redaction.redacted, true);
    assert.equal(recipe.flavor, '', 'description is redacted');
    assert.deepEqual(recipe.ingredientSets, [], 'no ingredient sets leak');
    assert.deepEqual(recipe.result.items, [], 'no result items leak');
    assert.equal(recipe.check, null, 'no check leaks');
    assert.equal(recipe.outcomeTiers, null, 'no outcome tiers leak');
    assert.equal(recipe.learn.canLearn, false);
  });

  it('a GM sees the full recipe even when the access reason is teaser', () => {
    const { recipe } = buildOne({ entries: [teaserEntry] }, GM);
    assert.equal(recipe.redaction.redacted, false);
    assert.equal(recipe.flavor, 'SECRET blade of fire.');
    assert.equal(recipe.ingredientSets.length, 1);
    assert.equal(recipe.result.items.length, 1);
    assert.notEqual(recipe.check, null);
  });
});

describe('CraftingListingBuilder — mode label', () => {
  for (const [mode, key] of Object.entries(MODE_LABEL_KEYS)) {
    it(`labels ${mode} through the resolution-mode key map`, () => {
      const system = makeSystem({ resolutionMode: mode });
      const { recipe } = buildOne({ system });
      assert.equal(recipe.modeToken, mode);
      assert.equal(recipe.modeLabel, key);
    });
  }
});

describe('CraftingListingBuilder — crafting check', () => {
  it('simple mode: check is optional and usable from an authored roll formula', () => {
    const { recipe } = buildOne();
    assert.equal(recipe.check.usable, true);
    assert.equal(recipe.check.optional, true);
    assert.equal(recipe.check.mandatory, false);
  });

  it('simple mode: an empty roll formula is not usable', () => {
    const system = makeSystem({
      craftingCheck: { simple: { rollFormula: '   ' }, routed: {}, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.check.usable, false);
  });

  it('routedByCheck mode: check is mandatory', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: { simple: {}, routed: { rollFormula: '' }, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.check.mandatory, true);
    assert.equal(recipe.check.optional, false);
    assert.equal(recipe.check.usable, false);
  });
});

describe('CraftingListingBuilder — outcome tiers', () => {
  function routedSystem() {
    return makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        simple: {},
        routed: {
          rollFormula: '1d20',
          type: 'fixed',
          fixedOutcomes: [
            { id: 't1', name: 'Success', success: true },
            { id: 't2', name: 'Failure', success: false },
          ],
        },
        progressive: {},
      },
    });
  }

  it('is null for non-routedByCheck modes', () => {
    const { recipe } = buildOne();
    assert.equal(recipe.outcomeTiers, null);
  });

  it('routes only success tiers; a failure tier carries empty awardedResults', () => {
    const { recipe } = buildOne({ system: routedSystem() });
    assert.equal(recipe.outcomeTiers.length, 2);
    const [success, failure] = recipe.outcomeTiers;
    assert.equal(success.success, true);
    // Single-result-group exemption: the lone group is awarded without a name/tier map.
    assert.equal(success.awardedResults.length, 1);
    assert.deepEqual(success.awardedResults[0], {
      name: 'Iron Sword',
      img: 'icons/sword.webp',
      qty: 2,
    });
    assert.equal(failure.success, false);
    assert.deepEqual(failure.awardedResults, [], 'a failure-only tier awards nothing');
  });

  it('routedByCheck top-level result list is empty (awards are per tier)', () => {
    const { recipe } = buildOne({ system: routedSystem() });
    assert.deepEqual(recipe.result.items, []);
  });
});

describe('CraftingListingBuilder — default result projection', () => {
  it('resolves the default result items against the system component library', () => {
    const { recipe } = buildOne();
    assert.deepEqual(recipe.result.items, [
      { name: 'Iron Sword', img: 'icons/sword.webp', qty: 2 },
    ]);
    assert.deepEqual(recipe.result.time, { hours: 2 });
  });

  it('falls back to the unknown-component label for an unresolved component id', () => {
    const recipe = makeRecipe({
      resultGroups: [
        {
          id: 'g1',
          name: 'Default',
          checkOutcomeIds: [],
          results: [{ componentId: 'missing', quantity: 1 }],
        },
      ],
    });
    const { recipe: model } = buildOne({ entries: [{ recipe, access: { reason: 'ok' } }] });
    assert.equal(model.result.items[0].name, 'FABRICATE.Labels.UnknownComponent');
  });
});

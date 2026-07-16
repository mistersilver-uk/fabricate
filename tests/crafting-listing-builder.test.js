import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CraftingListingBuilder,
  CRAFTING_BROWSE_STATUS,
} from '../src/systems/CraftingListingBuilder.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { DEFAULT_RECIPE_IMAGE } from '../src/models/Recipe.js';

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
  isSystemBlockedForRecipes = null,
  recipeItemDefinition = null,
  resolveCheckFormula = null,
} = {}) {
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getRecipeItemDefinition: () => recipeItemDefinition,
  };
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
    ...(isSystemBlockedForRecipes ? { isSystemBlockedForRecipes } : {}),
    ...(resolveCheckFormula ? { resolveCheckFormula } : {}),
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

});

describe('CraftingListingBuilder — system blocked for recipes', () => {
  it('drops a recipe whose system is blocked for a non-GM player', () => {
    const { listing } = buildOne({ isSystemBlockedForRecipes: (id) => id === 'sys-1' });
    assert.equal(listing.recipes.length, 0, 'a blocked system exposes no recipes to a player');
    assert.deepEqual(listing.counts, { available: 0, total: 0 });
  });

  it('retains a recipe from a blocked system for a GM (bypass)', () => {
    const { listing } = buildOne({ isSystemBlockedForRecipes: (id) => id === 'sys-1' }, GM);
    assert.equal(listing.recipes.length, 1, 'a GM is never gated by the block predicate');
    assert.equal(listing.recipes[0].id, 'recipe-1');
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
    assert.deepEqual(recipe.progressiveStages, [], 'no progressive stages leak');
  });

  it('a GM sees the full recipe even when the access reason is teaser', () => {
    const { recipe } = buildOne({ entries: [teaserEntry] }, GM);
    assert.equal(recipe.redaction.redacted, false);
    assert.equal(recipe.flavor, 'SECRET blade of fire.');
    assert.equal(recipe.ingredientSets.length, 1);
    assert.equal(recipe.result.items.length, 1);
    assert.notEqual(recipe.check, null);
  });

  it('a partial teaser hides only the listed field, still surfacing the rest', () => {
    // hiddenFields names ONLY ingredients: results, check, and description still
    // surface, exercising the showResults / showDescription true branches while
    // ingredientSets is redacted to empty.
    const { recipe } = buildOne({
      entries: [
        {
          recipe: makeRecipe({ description: 'A partly hidden brew.' }),
          access: { reason: 'teaser', teaserState: { hiddenFields: ['ingredients'] } },
        },
      ],
    });
    assert.equal(recipe.redaction.redacted, true);
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.DISCOVERY);
    assert.deepEqual(recipe.ingredientSets, [], 'the named ingredients field is still redacted');
    assert.equal(recipe.flavor, 'A partly hidden brew.', 'description surfaces (not hidden)');
    assert.equal(recipe.result.items.length, 1, 'results surface (not hidden)');
    assert.notEqual(recipe.check, null, 'the check surfaces (not hidden)');
  });
});

describe('CraftingListingBuilder — category projection (issue 514)', () => {
  it('projects the reserved general category + its localized label for an uncategorized recipe', () => {
    // makeRecipe() authors no category → normalizeRecipeCategory defaults to general.
    const { recipe } = buildOne();
    assert.equal(recipe.category, 'general', 'defaults to the reserved general token');
    assert.equal(
      recipe.categoryLabel,
      'FABRICATE.Common.General',
      'general localizes (never a bare token) — passthrough localize returns the key'
    );
  });

  it('surfaces a custom category token verbatim as its own label (no prettify)', () => {
    const { recipe } = buildOne({
      entries: [{ recipe: makeRecipe({ category: 'weapons' }), access: { reason: 'ok' } }],
    });
    assert.equal(recipe.category, 'weapons', 'custom token is the raw filter-match key');
    assert.equal(recipe.categoryLabel, 'weapons', 'custom token is surfaced verbatim, not prettified');
  });

  it('rides category + categoryLabel on the shared base so a teaser carries them too', () => {
    const { recipe } = buildOne({
      entries: [
        {
          recipe: makeRecipe({ category: 'potions' }),
          access: { reason: 'teaser', teaserState: { hiddenFields: ['ingredients', 'results', 'description'] } },
        },
      ],
    });
    assert.equal(recipe.redaction.redacted, true, 'the teaser is redacted');
    assert.equal(recipe.category, 'potions', 'category rides on ...base onto the teaser model');
    assert.equal(recipe.categoryLabel, 'potions', 'categoryLabel rides on ...base onto the teaser model');
  });
});

describe('CraftingListingBuilder — recipe image (matches GM Manager precedence)', () => {
  it('resolves a linked recipe item image when img is the default placeholder', () => {
    // The reported bug: a recipe whose icon lives on a linked item keeps the default
    // `recipe.img`, so the row showed the blueprint placeholder. Mirror the Manager and
    // resolve the linked recipe-item definition's image.
    const recipe = makeRecipe({ img: DEFAULT_RECIPE_IMAGE, recipeItemId: 'ri-1' });
    const { recipe: model } = buildOne({
      entries: [{ recipe, access: { reason: 'ok' } }],
      recipeItemDefinition: { img: 'icons/weapons/club.webp' },
    });
    assert.equal(model.img, 'icons/weapons/club.webp');
  });

  it('falls back to the default placeholder for an unlinked, image-less recipe', () => {
    const recipe = makeRecipe({ img: DEFAULT_RECIPE_IMAGE, recipeItemId: null });
    const { recipe: model } = buildOne({ entries: [{ recipe, access: { reason: 'ok' } }] });
    assert.equal(model.img, DEFAULT_RECIPE_IMAGE);
  });

  it('passes through a custom recipe img when there is no linked item', () => {
    const { recipe } = buildOne();
    assert.equal(recipe.img, 'icons/sword.webp');
  });

  it('does not leak a linked item image through a redacted teaser', () => {
    const recipe = makeRecipe({ img: DEFAULT_RECIPE_IMAGE, recipeItemId: 'ri-1' });
    const { recipe: model } = buildOne({
      entries: [
        {
          recipe,
          access: { reason: 'teaser', teaserState: { hiddenFields: ['ingredients'] } },
        },
      ],
      recipeItemDefinition: { img: 'icons/weapons/club.webp' },
    });
    assert.equal(model.redaction.redacted, true);
    assert.notEqual(model.img, 'icons/weapons/club.webp', 'the linked item icon must not leak');
    assert.equal(model.img, DEFAULT_RECIPE_IMAGE);
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

  it('routedByIngredients: an authored simple check reads as required (it is rolled and can fail)', () => {
    const system = makeSystem({
      resolutionMode: 'routedByIngredients',
      craftingCheck: { simple: { rollFormula: '1d20', dc: 12 }, routed: {}, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.check.usable, true);
    assert.equal(recipe.check.mandatory, true, 'an active simple check is not optional');
    assert.equal(recipe.check.optional, false);
    assert.equal(recipe.check.dc, 12, 'the pass/fail gate uses the simple DC');
  });

  it('routedByCheck + fixed: DC is nulled (tiers match by value range, not DC)', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: { simple: {}, routed: { rollFormula: '1d20', dc: 12, type: 'fixed' }, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.check.dc, null);
  });

  it('routedByCheck + relative: DC is preserved', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: { simple: {}, routed: { rollFormula: '1d20', dc: 12, type: 'relative' }, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.check.dc, 12);
  });

  it('routedByIngredients: no simple formula → optional (no check runs)', () => {
    const system = makeSystem({
      resolutionMode: 'routedByIngredients',
      craftingCheck: { simple: {}, routed: {}, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.check.usable, false);
    assert.equal(recipe.check.optional, true);
  });

  it('simple: an authored check is only required when checks are enabled', () => {
    const disabled = makeSystem({
      craftingCheck: { simple: { rollFormula: '1d20', dc: 10 }, routed: {}, progressive: {} },
    });
    assert.equal(buildOne({ system: disabled }).recipe.check.optional, true, 'checks disabled → optional');

    const enabled = makeSystem({
      features: { craftingChecks: true },
      craftingCheck: { simple: { rollFormula: '1d20', dc: 10 }, routed: {}, progressive: {} },
    });
    assert.equal(buildOne({ system: enabled }).recipe.check.mandatory, true, 'checks enabled → required');
  });

  it('alchemy checkMode=none: no check card (null)', () => {
    const system = makeSystem({
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'none' },
      craftingCheck: { simple: { rollFormula: '1d20', dc: 10 }, routed: {}, progressive: {} },
    });
    assert.equal(buildOne({ system }).recipe.check, null, 'None mode surfaces no crafting-check card');
  });

  it('alchemy checkMode=simple: mandatory pass/fail check, ungated by checksEnabled', () => {
    const system = makeSystem({
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'simple' },
      // checks disabled at the master toggle — alchemy simple is still mandatory
      craftingCheck: { enabled: false, simple: { rollFormula: '1d20', dc: 10 }, routed: {}, progressive: {} },
    });
    const check = buildOne({ system }).recipe.check;
    assert.equal(check.usable, true);
    assert.equal(check.mandatory, true, 'alchemy simple is mandatory regardless of checksEnabled');
    assert.equal(check.optional, false);
    assert.equal(check.dc, 10, 'the pass/fail gate uses the simple DC');
  });

  it('alchemy checkMode=tiered: mandatory routed check (routed slot); fixed nulls the DC', () => {
    const system = makeSystem({
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'tiered' },
      craftingCheck: {
        simple: {},
        routed: { rollFormula: '1d20', dc: 12, type: 'fixed' },
        progressive: {},
      },
    });
    const check = buildOne({ system }).recipe.check;
    assert.equal(check.usable, true);
    assert.equal(check.mandatory, true, 'alchemy tiered is mandatory');
    assert.equal(check.dc, null, 'a fixed routed check has no meaningful DC');
  });

  it('resolves the check formula against the actor via the injected resolver', () => {
    const system = makeSystem({
      craftingCheck: {
        simple: { rollFormula: '1d20 + @prof', dc: 15 },
        routed: {},
        progressive: {},
      },
    });
    const seen = [];
    const { recipe } = buildOne({
      system,
      resolveCheckFormula: (formula, actor) => {
        seen.push({ formula, actorId: actor?.id });
        return { display: formula.replace('@prof', '2'), resolved: true };
      },
    });
    assert.equal(recipe.check.resolvedFormula, '1d20 + 2');
    assert.equal(recipe.check.formulaResolved, true);
    assert.deepEqual(seen, [{ formula: '1d20 + @prof', actorId: 'actor-1' }]);
  });

  it('flags an unresolvable check formula as a formula error', () => {
    const { recipe } = buildOne({
      resolveCheckFormula: () => ({ display: '1d20 + NaN', resolved: false }),
    });
    assert.equal(recipe.check.resolvedFormula, '1d20 + NaN');
    assert.equal(recipe.check.formulaResolved, false);
  });

  it('leaves the check unresolved (null) when no resolver is wired', () => {
    const { recipe } = buildOne();
    assert.equal(recipe.check.resolvedFormula, null);
    assert.equal(recipe.check.formulaResolved, null);
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
    assert.deepEqual(success.names, ['Success']);
    // Single-result-group exemption: the lone group is awarded without a name/tier map.
    assert.equal(success.awardedResults.length, 1);
    assert.deepEqual(success.awardedResults[0], {
      name: 'Iron Sword',
      img: 'icons/sword.webp',
      qty: 2,
    });
    assert.equal(failure.success, false);
    assert.deepEqual(failure.names, ['Failure']);
    assert.deepEqual(failure.awardedResults, [], 'a failure-only tier awards nothing');
  });

  it('routedByCheck top-level result list is empty (awards are per tier)', () => {
    const { recipe } = buildOne({ system: routedSystem() });
    assert.deepEqual(recipe.result.items, []);
  });

  // System of five tiers routing to two result groups by explicit tier assignment:
  // Flawed/Standard/Fine → Bronze (Iron Sword ×2), Masterwork → Steel (Steel Sword ×1),
  // Ruined → failure. Used to exercise same-signature collapsing.
  function collapseSetup() {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      components: [
        { id: 'c1', name: 'Iron Sword', img: 'icons/sword.webp' },
        { id: 'c2', name: 'Steel Sword', img: 'icons/steel.webp' },
      ],
      craftingCheck: {
        simple: {},
        routed: {
          rollFormula: '1d20',
          type: 'fixed',
          fixedOutcomes: [
            { id: 't-flawed', name: 'Flawed', success: true },
            { id: 't-standard', name: 'Standard', success: true },
            { id: 't-fine', name: 'Fine', success: true },
            { id: 't-master', name: 'Masterwork', success: true },
            { id: 't-ruined', name: 'Ruined', success: false },
          ],
        },
        progressive: {},
      },
    });
    const recipe = makeRecipe({
      resultGroups: [
        {
          id: 'g-bronze',
          name: 'Bronze',
          checkOutcomeIds: ['t-flawed', 't-standard', 't-fine'],
          results: [{ componentId: 'c1', quantity: 2 }],
        },
        {
          id: 'g-steel',
          name: 'Steel',
          checkOutcomeIds: ['t-master'],
          results: [{ componentId: 'c2', quantity: 1 }],
        },
      ],
    });
    return { system, recipe };
  }

  it('collapses tiers with an identical result signature into one entry', () => {
    const { system, recipe } = collapseSetup();
    const { recipe: model } = buildOne({
      system,
      entries: [{ recipe, access: { reason: 'ok' } }],
    });
    // Flawed/Standard/Fine collapse (Iron Sword ×2); Masterwork distinct; Ruined failure.
    assert.equal(model.outcomeTiers.length, 3);
    const [shared, master, ruined] = model.outcomeTiers;
    assert.deepEqual(shared.names, ['Flawed', 'Standard', 'Fine']);
    assert.equal(shared.success, true);
    assert.deepEqual(shared.awardedResults, [
      { name: 'Iron Sword', img: 'icons/sword.webp', qty: 2 },
    ]);
    assert.deepEqual(master.names, ['Masterwork']);
    assert.deepEqual(master.awardedResults, [
      { name: 'Steel Sword', img: 'icons/steel.webp', qty: 1 },
    ]);
    assert.deepEqual(ruined.names, ['Ruined']);
    assert.deepEqual(ruined.awardedResults, []);
  });

  it('collapses multiple no-award (failure) tiers into a single entry', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        simple: {},
        routed: {
          rollFormula: '1d20',
          type: 'fixed',
          fixedOutcomes: [
            { id: 't1', name: 'Success', success: true },
            { id: 't2', name: 'Ruined', success: false },
            { id: 't3', name: 'Botched', success: false },
          ],
        },
        progressive: {},
      },
    });
    const { recipe } = buildOne({ system });
    assert.equal(recipe.outcomeTiers.length, 2);
    const [success, failure] = recipe.outcomeTiers;
    assert.deepEqual(success.names, ['Success']);
    assert.equal(failure.success, false);
    assert.deepEqual(failure.names, ['Ruined', 'Botched']);
    assert.deepEqual(failure.awardedResults, []);
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

describe('CraftingListingBuilder — per-option products', () => {
  it('projects each ingredient set to the products of its routed result group', () => {
    const system = makeSystem({
      resolutionMode: 'routedByIngredients',
      components: [
        { id: 'c1', name: 'Iron Sword', img: 'icons/iron.webp' },
        { id: 'c2', name: 'Steel Sword', img: 'icons/steel.webp' },
      ],
    });
    const recipe = makeRecipe({
      ingredientSets: [
        { id: 'set-1', name: 'Iron route', resultGroupId: 'g1' },
        { id: 'set-2', name: 'Steel route', resultGroupId: 'g2' },
      ],
      resultGroups: [
        {
          id: 'g1',
          name: 'Iron',
          checkOutcomeIds: [],
          results: [{ componentId: 'c1', quantity: 2 }],
        },
        {
          id: 'g2',
          name: 'Steel',
          checkOutcomeIds: [],
          results: [{ componentId: 'c2', quantity: 1 }],
        },
      ],
    });

    const { recipe: model } = buildOne({
      system,
      entries: [{ recipe, access: { reason: 'ok' } }],
    });

    const [iron, steel] = model.ingredientSets;
    assert.deepEqual(iron.products, [{ name: 'Iron Sword', img: 'icons/iron.webp', qty: 2 }]);
    assert.deepEqual(steel.products, [{ name: 'Steel Sword', img: 'icons/steel.webp', qty: 1 }]);
  });

  it('leaves per-option products empty for routedByCheck (output is per tier)', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: { simple: {}, routed: { rollFormula: '1d20' }, progressive: {} },
    });
    const { recipe } = buildOne({ system });
    for (const set of recipe.ingredientSets) {
      assert.deepEqual(set.products, [], 'a routed-by-check set advertises no per-option products');
    }
  });
});

// ---------------------------------------------------------------------------
// Progressive stage list (issue 651) — the F1 fix + D12a thresholds + redaction
// ---------------------------------------------------------------------------

describe('CraftingListingBuilder — progressive stages (F1)', () => {
  const PROGRESSIVE_SYSTEM = {
    ...makeSystem(),
    resolutionMode: 'progressive',
    craftingCheck: {
      simple: {},
      routed: {},
      progressive: { rollFormula: '2d6', awardMode: 'equal' },
    },
    components: [
      { id: 'c1', name: 'Iron Sword', img: 'icons/sword.webp', difficulty: 3 },
      { id: 'c2', name: 'Steel Sword', img: 'icons/steel.webp', difficulty: 5 },
      { id: 'c3', name: 'Mythril Sword', img: 'icons/mythril.webp', difficulty: 4 },
    ],
  };

  const PROGRESSIVE_GROUPS = [
    {
      id: 'g1',
      name: 'Stages',
      checkOutcomeIds: [],
      results: [
        { id: 'r1', componentId: 'c1', quantity: 1 },
        { id: 'r2', componentId: 'c2', quantity: 1 },
        { id: 'r3', componentId: 'c3', quantity: 1 },
      ],
    },
  ];

  const progressiveOpts = (recipeOverrides = {}, system = PROGRESSIVE_SYSTEM) => ({
    system,
    entries: [
      {
        recipe: makeRecipe({ resultGroups: PROGRESSIVE_GROUPS, ...recipeOverrides }),
        access: { reason: 'ok' },
      },
    ],
  });

  it('F1: a progressive recipe surfaces its FULL authored stage list while browsing', () => {
    // The bug this fixes: browsing has no roll, so `checkResult: null` made
    // `initialRemaining` 0 and `awarded` always []. The player saw an empty output list.
    const { recipe } = buildOne(progressiveOpts());
    assert.equal(
      recipe.progressiveStages.length,
      3,
      'every authored stage shows, not the zero-budget award'
    );
    assert.deepEqual(
      recipe.progressiveStages.map((stage) => stage.id),
      ['r1', 'r2', 'r3'],
      'in authored order'
    );
  });

  it('F1: stages carry the display fields the stage list renders', () => {
    const { recipe } = buildOne(progressiveOpts());
    assert.deepEqual(recipe.progressiveStages[0], {
      id: 'r1',
      componentId: 'c1',
      name: 'Iron Sword',
      img: 'icons/sword.webp',
      difficulty: 3,
      threshold: 3,
    });
  });

  it('D12a: thresholds are CUMULATIVE, computed through the real difficulty lookup', () => {
    // costFor parity: this harness wires a REAL ResolutionModeService, so this asserts
    // the builder spends the same numbers the engine does — not just that the helper works.
    const { recipe } = buildOne(progressiveOpts());
    assert.deepEqual(
      recipe.progressiveStages.map((stage) => stage.threshold),
      [3, 8, 12],
      'equal mode: 3, 3+5, 3+5+4'
    );
  });

  it('D12a: the award mode changes the thresholds (exceed is strict)', () => {
    const system = {
      ...PROGRESSIVE_SYSTEM,
      craftingCheck: {
        ...PROGRESSIVE_SYSTEM.craftingCheck,
        progressive: { rollFormula: '2d6', awardMode: 'exceed' },
      },
    };
    const { recipe } = buildOne(progressiveOpts({}, system));
    assert.deepEqual(
      recipe.progressiveStages.map((stage) => stage.threshold),
      [4, 9, 13],
      'exceed: one above each cumulative sum'
    );
  });

  it('D12a: a stage whose component has no difficulty omits the threshold', () => {
    const system = {
      ...PROGRESSIVE_SYSTEM,
      components: [
        { id: 'c1', name: 'Iron Sword', img: 'icons/sword.webp', difficulty: 3 },
        { id: 'c2', name: 'Steel Sword', img: 'icons/steel.webp' },
        { id: 'c3', name: 'Mythril Sword', img: 'icons/mythril.webp', difficulty: 4 },
      ],
    };
    const { recipe } = buildOne(progressiveOpts({}, system));
    assert.equal(recipe.progressiveStages[1].difficulty, null, 'no invented 0');
    assert.equal(recipe.progressiveStages[1].threshold, null, 'and no invented threshold');
    assert.equal(
      recipe.progressiveStages[2].threshold,
      7,
      'the skipped stage consumes no budget, so the next is 3+4 and not 3+0+4'
    );
  });

  it('a non-progressive recipe has no stage list', () => {
    const { recipe } = buildOne();
    assert.deepEqual(recipe.progressiveStages, []);
  });

  it('projects allowPlayerResultReorder, defaulting true', () => {
    assert.equal(buildOne(progressiveOpts()).recipe.allowPlayerResultReorder, true);
    assert.equal(
      buildOne(progressiveOpts({ allowPlayerResultReorder: false })).recipe
        .allowPlayerResultReorder,
      false,
      'an authored false reaches the player model'
    );
  });

  it('REDACTION: a DISCOVERY teaser leaks NO stages (mutation: delete the guard)', () => {
    // The teaser is the surface whose entire purpose is not showing a player what the
    // recipe makes. A missing guard leaks names, images, difficulties and thresholds.
    const { recipe } = buildOne({
      system: PROGRESSIVE_SYSTEM,
      entries: [
        {
          recipe: makeRecipe({ resultGroups: PROGRESSIVE_GROUPS }),
          access: {
            reason: 'teaser',
            teaserState: { hiddenFields: ['ingredients', 'results', 'description'] },
          },
        },
      ],
    });
    assert.equal(recipe.browseStatus, CRAFTING_BROWSE_STATUS.DISCOVERY);
    assert.deepEqual(recipe.progressiveStages, [], 'no stages leak to an undiscovered recipe');
  });

  it('REDACTION: a teaser that hides only ingredients still shows its stages', () => {
    const { recipe } = buildOne({
      system: PROGRESSIVE_SYSTEM,
      entries: [
        {
          recipe: makeRecipe({ resultGroups: PROGRESSIVE_GROUPS }),
          access: { reason: 'teaser', teaserState: { hiddenFields: ['ingredients'] } },
        },
      ],
    });
    assert.equal(recipe.progressiveStages.length, 3, 'the showResults true branch');
  });
});

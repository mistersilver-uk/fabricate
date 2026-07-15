import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
  },
};

globalThis.game = {
  user: { name: 'Test User', isGM: true },
  fabricate: null,
};

let mockFromUuidResult = null;
globalThis.fromUuid = async () => mockFromUuidResult;

const { Recipe } = await import('../src/models/Recipe.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// The routing basis is now a property of the system MODE, not a per-recipe
// `resultSelection.provider`: `routedByIngredients` routes by the chosen ingredient
// set's `resultGroupId`, `routedByCheck` routes by the routed crafting-check outcome.
function buildSystem(mode = 'routedByCheck', overrides = {}) {
  return {
    id: 'sys-routed',
    resolutionMode: mode,
    craftingCheck: { enabled: true, progressive: null },
    components: [],
    ...overrides,
  };
}

function buildService(system = buildSystem()) {
  return new ResolutionModeService({ getSystem: (id) => (id === system.id ? system : null) });
}

function groups() {
  return [
    { id: 'flawed', name: 'Flawed', results: [{ id: 'r1', componentId: 'flawed-item', quantity: 1 }] },
    { id: 'standard', name: 'Standard', results: [{ id: 'r2', componentId: 'standard-item', quantity: 1 }] },
    { id: 'mythic', name: 'Mythic', results: [{ id: 'r3', componentId: 'mythic-item', quantity: 1 }] },
  ];
}

function step(overrides = {}) {
  return {
    id: 'finish',
    name: 'Finish',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [{ id: 'g1', options: [{ componentId: 'ore', quantity: 1 }] }],
        resultGroupId: 'standard',
      },
    ],
    resultGroups: groups(),
    ...overrides,
  };
}

function recipeWithStep(activeStep) {
  return new Recipe({
    id: 'recipe-1',
    name: 'Recipe',
    craftingSystemId: 'sys-routed',
    ingredientSets: [
      {
        id: 'top-set',
        ingredientGroups: [{ id: 'top-g1', options: [{ componentId: 'ore', quantity: 1 }] }],
      },
    ],
    resultGroups: groups(),
    steps: [activeStep],
  });
}

function resolve(service, recipe, checkResult) {
  return service.resolveResultGroups({
    recipe,
    step: recipe.steps[0],
    ingredientSet: recipe.steps[0].ingredientSets[0],
    checkResult,
  });
}

describe('routed recipe resolution', () => {
  beforeEach(() => {
    mockFromUuidResult = null;
  });

  it('CraftingSystemManager normalizes the bare routed token to routedByIngredients', () => {
    const manager = new CraftingSystemManager(null);
    const system = manager._normalizeSystem({ id: 'sys-routed', resolutionMode: 'routed' });
    assert.equal(system.resolutionMode, 'routedByIngredients');
  });

  it('CraftingSystemManager preserves the two routed modes', () => {
    const manager = new CraftingSystemManager(null);
    for (const mode of ['routedByIngredients', 'routedByCheck']) {
      const system = manager._normalizeSystem({ id: 'sys-routed', resolutionMode: mode });
      assert.equal(system.resolutionMode, mode);
    }
  });

  it('Recipe.validate accepts explicit-step recipes with no top-level result groups', () => {
    const recipe = new Recipe({
      id: 'step-only-recipe',
      name: 'Step Only Recipe',
      craftingSystemId: 'sys-routed',
      steps: [step()],
    });
    assert.equal(recipe.validate().valid, true, recipe.validate().errors.join(', '));
  });

  it('routedByIngredients resolves by ingredientSet.resultGroupId', () => {
    const service = buildService(buildSystem('routedByIngredients'));
    const recipe = recipeWithStep(step());
    const result = resolve(service, recipe, null);
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Standard');
  });

  it('routedByCheck resolves by the crafting-check outcome name', () => {
    const service = buildService(buildSystem('routedByCheck'));
    const recipe = recipeWithStep(step());
    const success = resolve(service, recipe, { outcome: 'mythic' });
    assert.equal(success.meta.disposition, 'success');
    assert.equal(success.groups[0].name, 'Mythic');
  });

  it('routedByCheck honors fail keywords (no group awarded)', () => {
    const service = buildService(buildSystem('routedByCheck'));
    const recipe = recipeWithStep(step());
    const failed = resolve(service, recipe, { outcome: 'fail' });
    assert.equal(failed.meta.disposition, 'fail');
    assert.deepEqual(failed.groups, []);
  });

  // Single-result-group exemption (mirrors routedByIngredients' "one group → no
  // mapping required"). One group whose name does NOT match the outcome and which
  // carries no checkOutcomeIds must still be produced on a non-failure outcome.
  function singleGroupStep() {
    return step({
      resultGroups: [
        { id: 'only', name: 'Anything', results: [{ id: 'r-only', componentId: 'x', quantity: 1 }] },
      ],
    });
  }

  it('routedByCheck: a single, unnamed/unmapped result group is produced on a non-failure outcome', () => {
    const service = buildService(buildSystem('routedByCheck'));
    const recipe = recipeWithStep(singleGroupStep());
    const result = resolve(service, recipe, { outcome: 'partial' });
    assert.equal(result.meta.disposition, 'success', 'no misconfiguration for one group');
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].id, 'only');
  });

  it('routedByCheck: a single result group yields nothing on a failure keyword', () => {
    const service = buildService(buildSystem('routedByCheck'));
    const recipe = recipeWithStep(singleGroupStep());
    const failed = resolve(service, recipe, { outcome: 'fail' });
    assert.equal(failed.meta.disposition, 'fail');
    assert.deepEqual(failed.groups, []);
  });

  it('routedByCheck: MULTIPLE result groups still misconfigure on an unmatched success outcome', () => {
    const service = buildService(buildSystem('routedByCheck'));
    // groups() has three named groups (Flawed/Standard/Mythic); `partial` matches none.
    const recipe = recipeWithStep(step());
    const result = resolve(service, recipe, { outcome: 'partial' });
    assert.equal(
      result.meta.disposition,
      'misconfiguration',
      'multi-group still requires the outcome to map to a group'
    );
    assert.deepEqual(result.groups, []);
  });

  it('Recipe normalizes/serializes result-group checkOutcomeIds (recipe + step)', () => {
    const recipe = new Recipe({
      id: 'recipe-co',
      name: 'Recipe',
      craftingSystemId: 'sys-routed',
      resultGroups: [
        { id: 'g1', name: 'G1', checkOutcomeIds: ['t-a', 't-a', '  t-b  ', ''], results: [] },
      ],
      steps: [
        step({ resultGroups: [{ id: 'sg1', name: 'SG1', checkOutcomeIds: ['t-c'], results: [] }] }),
      ],
    });
    assert.deepEqual(recipe.resultGroups[0].checkOutcomeIds, ['t-a', 't-b']);
    const json = recipe.toJSON();
    assert.deepEqual(json.resultGroups[0].checkOutcomeIds, ['t-a', 't-b']);
    assert.deepEqual(json.steps[0].resultGroups[0].checkOutcomeIds, ['t-c']);
  });

  it('a stray leftover resultSelection.provider does not raise a STRUCTURAL name error', () => {
    // The model is mode-unaware. A routed recipe should never carry a
    // resultSelection (the migration drops it), but a stray leftover `check`
    // provider on result groups with colliding/reserved names must NOT block
    // persistence — structural validation (the persistence gate) waives the
    // alchemy name check.
    const recipe = new Recipe({
      id: 'stray',
      name: 'Stray',
      craftingSystemId: 'sys-routed',
      ingredientSets: [{ id: 'set-1', ingredientGroups: [{ id: 'g', options: [{ componentId: 'ore', quantity: 1 }] }] }],
      resultGroups: [
        { id: 'g1', name: 'Hazard', results: [] },
        { id: 'g2', name: 'hazard', results: [] },
      ],
      resultSelection: { provider: 'check' },
    });
    const structural = recipe.validateStructure();
    assert.equal(structural.valid, true, structural.errors.join(', '));
    assert.equal(
      structural.errors.some((e) => /reserved routing keyword|unique names/.test(e)),
      false,
      'no structural name error from a stray provider'
    );
  });

  it('routedByCheck routes by explicit tier assignment (checkOutcomeIds), overriding name matching', () => {
    const system = buildSystem('routedByCheck', {
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          rollExpression: '1d20',
          relativeOutcomes: [
            { id: 't-myth', name: 'Mythic', success: true, breakTools: false, dc: 10 },
            { id: 't-std', name: 'Standard', success: true, breakTools: false, dc: 0 },
          ],
          fixedOutcomes: [],
        },
      },
    });
    const service = buildService(system);
    const assigned = groups();
    assigned[1].checkOutcomeIds = ['t-myth'];
    const recipe = recipeWithStep(step({ resultGroups: assigned }));
    const result = resolve(service, recipe, { outcome: 'Mythic' });
    assert.equal(result.meta.disposition, 'success');
    assert.equal(result.groups[0].id, 'standard', 'routed to the assigned group, not the same-named one');
  });

  it('routedByCheck: a success:false tier in checkOutcomeIds does NOT route as success', () => {
    const system = buildSystem('routedByCheck', {
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          rollExpression: '1d20',
          relativeOutcomes: [{ id: 't-botch', name: 'Botch', success: false, breakTools: true, dc: -5 }],
          fixedOutcomes: [],
        },
      },
    });
    const service = buildService(system);
    const assigned = groups();
    assigned[1].checkOutcomeIds = ['t-botch'];
    const recipe = recipeWithStep(step({ resultGroups: assigned }));
    const result = resolve(service, recipe, { outcome: 'Botch' });
    assert.notEqual(result.meta.disposition, 'success');
    assert.deepEqual(result.groups, []);
  });

  it('routedByCheck falls back to outcome-name matching when no tier is assigned', () => {
    const system = buildSystem('routedByCheck', {
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          rollExpression: '1d20',
          relativeOutcomes: [{ id: 't-myth', name: 'Mythic', success: true, breakTools: false, dc: 10 }],
          fixedOutcomes: [],
        },
      },
    });
    const service = buildService(system);
    const recipe = recipeWithStep(step());
    const result = resolve(service, recipe, { outcome: 'Mythic' });
    assert.equal(result.meta.disposition, 'success');
    assert.equal(result.groups[0].name, 'Mythic');
  });

  it('routedByCheck: a tier-routed recipe with no group for the resolved tier reports unrouted-tier', () => {
    const system = buildSystem('routedByCheck', {
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          rollExpression: '1d20',
          relativeOutcomes: [
            { id: 't-myth', name: 'Mythic', success: true, breakTools: false, dc: 10 },
            { id: 't-std', name: 'Standard', success: true, breakTools: false, dc: 0 },
          ],
          fixedOutcomes: [],
        },
      },
    });
    const service = buildService(system);
    const assigned = groups();
    assigned[1].checkOutcomeIds = ['t-std'];
    const recipe = recipeWithStep(step({ resultGroups: assigned }));
    const result = resolve(service, recipe, { outcome: 'Mythic' });
    assert.equal(result.meta.disposition, 'unrouted-tier');
    assert.deepEqual(result.groups, []);
  });

  it('routedByCheck: a checkOutcomeIds for a since-deleted tier falls back to name-matching', () => {
    const system = buildSystem('routedByCheck', {
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          rollExpression: '1d20',
          relativeOutcomes: [{ id: 't-std', name: 'Standard', success: true, breakTools: false, dc: 0 }],
          fixedOutcomes: [],
        },
      },
    });
    const service = buildService(system);
    const assigned = groups();
    assigned[2].checkOutcomeIds = ['t-deleted'];
    const recipe = recipeWithStep(step({ resultGroups: assigned }));
    const result = resolve(service, recipe, { outcome: 'Mythic' });
    assert.equal(result.meta.disposition, 'success', 'falls back to name-matching');
    assert.equal(result.groups.length, 1, 'no spurious group from the dangling tier id');
    assert.equal(result.groups[0].name, 'Mythic');
  });

  // The legacy `macroOutcome` / `rollTableOutcome` providers were removed in 1.6.0
  // (issue 424). They no longer normalize onto a recipe.
  for (const legacy of ['macroOutcome', 'rollTableOutcome']) {
    it(`removed legacy provider ${legacy} does not normalize onto the recipe`, () => {
      const activeStep = step({ resultSelection: { provider: legacy } });
      const recipe = recipeWithStep(activeStep);
      assert.equal(recipe.steps[0].resultSelection, null);
    });
  }

  // Back-compat regression guard: legacy persisted `mapped`/`tiered` data still
  // resolves correctly AFTER the canonical pipeline (manager token-normalizer +
  // 1.4.0 migration). `mapped → routedByIngredients`, `tiered → routedByCheck`.
  it('legacy mapped token normalizes to routedByIngredients and resolves by ingredientSet', () => {
    const manager = new CraftingSystemManager(null);
    const system = manager._normalizeSystem({ id: 'sys-routed', resolutionMode: 'mapped' });
    assert.equal(system.resolutionMode, 'routedByIngredients');

    const service = buildService(buildSystem('routedByIngredients'));
    const recipe = recipeWithStep(step());
    const mapped = resolve(service, recipe, null);
    assert.equal(mapped.groups[0].name, 'Standard');
  });

  it('legacy tiered token normalizes to routedByCheck and resolves by check name matching', async () => {
    const manager = new CraftingSystemManager(null);
    const system = manager._normalizeSystem({ id: 'sys-routed', resolutionMode: 'tiered' });
    assert.equal(system.resolutionMode, 'routedByCheck');

    // The 1.4.0 migration renames the routed group to the outcome ('pass') so
    // canonical name-matching reproduces the legacy outcomeRouting { pass: 'mythic' }.
    const { migrateLegacyResolutionModes } =
      await import('../src/migration/migrateLegacyResolutionModes.js');
    const migrated = migrateLegacyResolutionModes({
      systems: [{ id: 'sys-routed', resolutionMode: 'tiered' }],
      recipes: [
        {
          id: 'recipe-1',
          craftingSystemId: 'sys-routed',
          resultGroups: groups(),
          outcomeRouting: { pass: 'mythic' },
        },
      ],
    });
    const migratedRecipe = migrated.recipes[0];
    // routedByCheck carries no resultSelection; routing is by group name.
    assert.equal(migratedRecipe.resultSelection, undefined);
    const passGroup = migratedRecipe.resultGroups.find((g) => g.id === 'mythic');
    assert.equal(passGroup.name, 'pass');

    const service = buildService(buildSystem('routedByCheck'));
    const recipe = recipeWithStep(step({ resultGroups: migratedRecipe.resultGroups }));
    const tiered = resolve(service, recipe, { outcome: 'pass' });
    assert.equal(tiered.groups[0].id, 'mythic');
  });
});

describe('simple mode result resolution (issue 643)', () => {
  const successGroup = { id: 'succ', results: [{ id: 'r1', componentId: 'good', quantity: 1 }] };
  const failureGroup = {
    id: 'fail',
    role: 'failure',
    results: [{ id: 'r2', componentId: 'bad', quantity: 1 }],
  };

  function simpleRecipe(resultGroups) {
    return new Recipe({
      id: 'simple-recipe',
      name: 'Simple',
      craftingSystemId: 'sys-routed',
      ingredientSets: [
        { id: 's1', ingredientGroups: [{ id: 'g', options: [{ componentId: 'ore', quantity: 1 }] }] },
      ],
      resultGroups,
    });
  }

  function resolveSimple(recipe, checkResult) {
    const service = buildService(buildSystem('simple'));
    return service.resolveResultGroups({
      recipe,
      step: null,
      ingredientSet: recipe.ingredientSets[0],
      checkResult,
    });
  }

  it('a check-less / passed simple craft produces the success group (never the failure group)', () => {
    const recipe = simpleRecipe([successGroup, failureGroup]);
    assert.equal(resolveSimple(recipe, null).groups[0].id, 'succ');
    assert.equal(resolveSimple(recipe, { success: true }).groups[0].id, 'succ');
  });

  it('a FAILED simple check produces the reserved failure group', () => {
    const recipe = simpleRecipe([successGroup, failureGroup]);
    const failed = resolveSimple(recipe, { success: false });
    assert.equal(failed.groups.length, 1);
    assert.equal(failed.groups[0].id, 'fail');
    assert.equal(failed.meta.disposition, 'fail');
  });

  it('a FAILED simple check with NO reserved failure group produces nothing', () => {
    const recipe = simpleRecipe([successGroup]);
    assert.deepEqual(resolveSimple(recipe, { success: false }).groups, []);
  });

  it('validates a simple recipe carrying a reserved failure group (one success group + optional failure)', () => {
    const recipe = simpleRecipe([successGroup, failureGroup]);
    assert.equal(recipe.validate().valid, true, recipe.validate().errors.join(', '));
  });
});

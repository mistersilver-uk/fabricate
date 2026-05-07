import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`
  }
};

globalThis.game = {
  user: { name: 'Test User', isGM: true },
  fabricate: null
};

let mockFromUuidResult = null;
globalThis.fromUuid = async () => mockFromUuidResult;

const { Recipe } = await import('../src/models/Recipe.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function buildSystem(overrides = {}) {
  return {
    id: 'sys-routed',
    resolutionMode: 'routed',
    craftingCheck: {
      enabled: true,
      macroUuid: 'Macro.check',
      outcomes: ['flawed', 'standard', 'fine', 'masterwork', 'mythic'],
      progressive: null
    },
    components: [],
    ...overrides
  };
}

function buildService(system = buildSystem()) {
  return new ResolutionModeService({ getSystem: id => (id === system.id ? system : null) });
}

function groups() {
  return [
    { id: 'flawed', name: 'Flawed', results: [{ id: 'r1', componentId: 'flawed-item', quantity: 1 }] },
    { id: 'standard', name: 'Standard', results: [{ id: 'r2', componentId: 'standard-item', quantity: 1 }] },
    { id: 'mythic', name: 'Mythic', results: [{ id: 'r3', componentId: 'mythic-item', quantity: 1 }] }
  ];
}

function step(overrides = {}) {
  return {
    id: 'finish',
    name: 'Finish',
    ingredientSets: [{
      id: 'set-1',
      ingredientGroups: [{ id: 'g1', options: [{ componentId: 'ore', quantity: 1 }] }],
      resultGroupId: 'standard'
    }],
    resultGroups: groups(),
    ...overrides
  };
}

function recipeWithStep(activeStep) {
  return new Recipe({
    id: 'recipe-1',
    name: 'Recipe',
    craftingSystemId: 'sys-routed',
    ingredientSets: [{
      id: 'top-set',
      ingredientGroups: [{ id: 'top-g1', options: [{ componentId: 'ore', quantity: 1 }] }]
    }],
    resultGroups: groups(),
    resultSelection: { provider: 'ingredientSet' },
    steps: [activeStep]
  });
}

describe('routed recipe resolution', () => {
  beforeEach(() => {
    mockFromUuidResult = null;
  });

  it('CraftingSystemManager preserves canonical routed resolution mode', () => {
    const manager = new CraftingSystemManager(null);
    const system = manager._normalizeSystem({ id: 'sys-routed', resolutionMode: 'routed' });

    assert.equal(system.resolutionMode, 'routed');
  });

  it('Recipe preserves step.resultSelection through normalization and toJSON', () => {
    const activeStep = step({ resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.step' } });
    const recipe = recipeWithStep(activeStep);

    assert.equal(recipe.steps[0].resultSelection.provider, 'macroOutcome');
    assert.equal(recipe.toJSON().steps[0].resultSelection.provider, 'macroOutcome');
    assert.equal(recipe.toJSON().steps[0].resultSelection.macroUuid, 'Macro.step');
  });

  it('Recipe.validate accepts explicit-step recipes with no top-level result groups', () => {
    const recipe = new Recipe({
      id: 'step-only-recipe',
      name: 'Step Only Recipe',
      craftingSystemId: 'sys-routed',
      steps: [step({ resultSelection: { provider: 'ingredientSet' } })]
    });

    const result = recipe.validate();

    assert.equal(result.valid, true, result.errors.join(', '));
  });

  it('step.resultSelection overrides recipe-level resultSelection for macroOutcome routing', () => {
    const activeStep = step({ resultSelection: { provider: 'macroOutcome' } });
    const recipe = recipeWithStep(activeStep);
    const service = buildService();

    const result = service.resolveResultGroups({
      recipe,
      step: recipe.steps[0],
      ingredientSet: recipe.steps[0].ingredientSets[0],
      checkResult: { outcome: 'mythic' }
    });

    assert.equal(result.meta.disposition, 'success');
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Mythic');
  });

  it('routed ingredientSet provider resolves by ingredientSet.resultGroupId', () => {
    const activeStep = step({ resultSelection: { provider: 'ingredientSet' } });
    const recipe = recipeWithStep(activeStep);
    const service = buildService();

    const result = service.resolveResultGroups({
      recipe,
      step: recipe.steps[0],
      ingredientSet: recipe.steps[0].ingredientSets[0],
      checkResult: null
    });

    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Standard');
  });

  it('routed macroOutcome returns no output for fail keywords', () => {
    const activeStep = step({ resultSelection: { provider: 'macroOutcome' } });
    const recipe = recipeWithStep(activeStep);
    const service = buildService();

    const result = service.resolveResultGroups({
      recipe,
      step: recipe.steps[0],
      ingredientSet: recipe.steps[0].ingredientSets[0],
      checkResult: { outcome: 'fail' }
    });

    assert.equal(result.meta.disposition, 'fail');
    assert.deepEqual(result.groups, []);
  });

  it('routed rollTableOutcome resolves a drawn group name', async () => {
    const activeStep = step({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'RollTable.quality' }
    });
    const recipe = recipeWithStep(activeStep);
    const service = buildService();
    mockFromUuidResult = { draw: async () => ({ results: [{ text: 'Mythic' }] }) };

    const rollTableResult = await service.resolveByRollTable(recipe, recipe.steps[0], recipe.steps[0].resultGroups);

    assert.equal(rollTableResult.meta.disposition, 'success');
    assert.equal(rollTableResult.groups[0].name, 'Mythic');
  });

  it('legacy mapped and tiered compatibility still resolve as before', () => {
    const mappedService = buildService({ id: 'sys-routed', resolutionMode: 'mapped' });
    const tieredService = buildService({ id: 'sys-routed', resolutionMode: 'tiered' });
    const activeStep = step({
      outcomeRouting: { pass: 'mythic' },
      resultSelection: null
    });
    const recipe = recipeWithStep(activeStep);

    const mapped = mappedService.resolveResultGroups({
      recipe,
      step: recipe.steps[0],
      ingredientSet: recipe.steps[0].ingredientSets[0]
    });
    const tiered = tieredService.resolveResultGroups({
      recipe,
      step: recipe.steps[0],
      ingredientSet: recipe.steps[0].ingredientSets[0],
      checkResult: { outcome: 'pass' }
    });

    assert.equal(mapped.groups[0].name, 'Standard');
    assert.equal(tiered.groups[0].name, 'Mythic');
  });
});

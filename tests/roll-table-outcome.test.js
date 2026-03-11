/**
 * T-088: rollTableOutcome Provider Tests
 *
 * Tests covering:
 * 1. Happy path: table draw returns result name matching a result group
 * 2. Case-insensitive matching: "SWORD" matches ResultGroup "sword"
 * 3. Reserved fail keyword: drawn result "Failed" returns empty/fail outcome
 * 4. Missing table UUID: validation error
 * 5. No matching result group: crafting error
 * 6. Existing legacy mapped/tiered compatibility modes unaffected (regression)
 * 7. Recipe model resultSelection field
 * 8. Recipe validation for rollTableOutcome
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry global stubs
// ---------------------------------------------------------------------------

let mockFromUuidResult = null;

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`
  }
};

globalThis.game = {
  user: { name: 'Test User' }
};

globalThis.fromUuid = async (uuid) => {
  if (typeof mockFromUuidResult === 'function') {
    return mockFromUuidResult(uuid);
  }
  return mockFromUuidResult;
};

// ---------------------------------------------------------------------------
// Module imports
// ---------------------------------------------------------------------------

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { Recipe } = await import('../src/models/Recipe.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResultGroups(names) {
  return names.map((name, i) => ({
    id: `group-${i + 1}`,
    name,
    results: [{ id: `result-${i + 1}`, componentId: `item-${i + 1}`, quantity: 1 }]
  }));
}

function makeRollTable(drawnText, { draw = null } = {}) {
  return {
    draw: draw || (async () => ({
      results: [{ text: drawnText }]
    }))
  };
}

function makeRecipeData(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [{
      id: 'set-1',
      ingredientGroups: [{
        id: 'group-1',
        options: [{ componentId: 'item-1', quantity: 1 }]
      }]
    }],
    resultGroups: makeResultGroups(['Sword', 'Shield']),
    ...overrides
  };
}

function makeService(systemOverrides = {}) {
  const system = {
    resolutionMode: 'mapped',
    ...systemOverrides
  };
  const mgr = { getSystem: () => system };
  return new ResolutionModeService(mgr);
}

// ---------------------------------------------------------------------------
// ResolutionModeService.resolveByRollTable tests
// ---------------------------------------------------------------------------

describe('ResolutionModeService.resolveByRollTable', () => {
  let service;

  beforeEach(() => {
    service = makeService();
    mockFromUuidResult = null;
  });

  it('1. happy path: drawn name matches a result group', async () => {
    const groups = makeResultGroups(['Sword', 'Shield', 'Potion']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('Sword');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'success');
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Sword');
    assert.equal(result.meta.drawnName, 'Sword');
  });

  it('2. case-insensitive matching: "SWORD" matches ResultGroup "sword"', async () => {
    const groups = makeResultGroups(['sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('SWORD');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'success');
    assert.equal(result.groups[0].name, 'sword');
  });

  it('3a. whitespace-padded name " Sword " matches result group "Sword"', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable(' Sword ');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'success');
    assert.equal(result.groups[0].name, 'Sword');
  });

  it('3b. fail keyword "fail" returns disposition fail', async () => {
    const groups = makeResultGroups(['Sword', 'Shield']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('fail');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'fail');
    assert.equal(result.groups.length, 0);
  });

  it('3c. fail keyword "Failed" (case-insensitive) returns disposition fail', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('Failed');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'fail');
    assert.equal(result.groups.length, 0);
  });

  it('3d. miss keyword "nothing" returns disposition miss', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('nothing');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'miss');
    assert.equal(result.groups.length, 0);
  });

  it('3e. miss keyword "whiff" returns disposition miss', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('whiff');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'miss');
  });

  it('4. missing table UUID returns error', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: null } };

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.ok(result.meta.error);
    assert.equal(result.groups.length, 0);
  });

  it('5. table not found (invalid UUID) returns error', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'invalid-uuid' } };
    mockFromUuidResult = null;

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.ok(result.meta.error);
    assert.equal(result.groups.length, 0);
  });

  it('6. no matching result group returns misconfiguration error', async () => {
    const groups = makeResultGroups(['Sword', 'Shield']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = makeRollTable('Potion');

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.disposition, 'misconfiguration');
    assert.ok(result.meta.error);
    assert.equal(result.groups.length, 0);
  });

  it('7. uses text field from drawn result', async () => {
    const groups = makeResultGroups(['Elixir']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = { draw: async () => ({ results: [{ text: 'Elixir' }] }) };

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.equal(result.meta.drawnName, 'Elixir');
    assert.equal(result.meta.disposition, 'success');
  });

  it('8. draw returns no results returns error', async () => {
    const groups = makeResultGroups(['Sword']);
    const recipe = { resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' } };
    mockFromUuidResult = { draw: async () => ({ results: [] }) };

    const result = await service.resolveByRollTable(recipe, null, groups);

    assert.ok(result.meta.error);
    assert.equal(result.groups.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Name normalization helpers
// ---------------------------------------------------------------------------

describe('ResolutionModeService name helpers', () => {
  let service;

  beforeEach(() => {
    service = makeService();
  });

  it('_normalizeName trims and lowercases', () => {
    assert.equal(service._normalizeName('  Hello World  '), 'hello world');
    assert.equal(service._normalizeName('POTION'), 'potion');
    assert.equal(service._normalizeName(''), '');
    assert.equal(service._normalizeName(null), '');
  });

  it('_isFailKeyword identifies all fail keywords', () => {
    assert.ok(service._isFailKeyword('fail'));
    assert.ok(service._isFailKeyword('Fail'));
    assert.ok(service._isFailKeyword('FAIL'));
    assert.ok(service._isFailKeyword('failed'));
    assert.ok(service._isFailKeyword('failure'));
    assert.ok(service._isFailKeyword('f'));
    assert.ok(!service._isFailKeyword('success'));
    assert.ok(!service._isFailKeyword('failing'));
  });

  it('_isMissKeyword identifies all miss keywords', () => {
    assert.ok(service._isMissKeyword('miss'));
    assert.ok(service._isMissKeyword('Miss'));
    assert.ok(service._isMissKeyword('missed'));
    assert.ok(service._isMissKeyword('m'));
    assert.ok(service._isMissKeyword('nothing'));
    assert.ok(service._isMissKeyword('none'));
    assert.ok(service._isMissKeyword('whiff'));
    assert.ok(service._isMissKeyword('Whiffed'));
    assert.ok(!service._isMissKeyword('success'));
    assert.ok(!service._isMissKeyword('missing'));
  });
});

// ---------------------------------------------------------------------------
// Recipe model resultSelection tests
// ---------------------------------------------------------------------------

describe('Recipe.resultSelection field', () => {
  it('accepts rollTableOutcome provider', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-123' }
    }));

    assert.deepEqual(recipe.resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'table-uuid-123',
      macroUuid: null
    });
  });

  it('accepts ingredientSet provider', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'ingredientSet' }
    }));

    assert.equal(recipe.resultSelection.provider, 'ingredientSet');
    assert.equal(recipe.resultSelection.rollTableUuid, null);
    assert.equal(recipe.resultSelection.macroUuid, null);
  });

  it('accepts macroOutcome provider with macroUuid', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'macroOutcome', macroUuid: 'macro-uuid-123' }
    }));

    assert.equal(recipe.resultSelection.provider, 'macroOutcome');
    assert.equal(recipe.resultSelection.macroUuid, 'macro-uuid-123');
  });

  it('defaults to null when resultSelection is absent', () => {
    const recipe = new Recipe(makeRecipeData());
    assert.equal(recipe.resultSelection, null);
  });

  it('ignores unknown provider values', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'unknownProvider' }
    }));
    assert.equal(recipe.resultSelection, null);
  });

  it('includes resultSelection in toJSON()', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' }
    }));
    const json = recipe.toJSON();
    assert.deepEqual(json.resultSelection, {
      provider: 'rollTableOutcome',
      rollTableUuid: 'table-uuid-1',
      macroUuid: null
    });
  });

  it('toJSON() includes null resultSelection when absent', () => {
    const recipe = new Recipe(makeRecipeData());
    const json = recipe.toJSON();
    assert.equal(json.resultSelection, null);
  });
});

// ---------------------------------------------------------------------------
// Recipe validation for rollTableOutcome
// ---------------------------------------------------------------------------

describe('Recipe.validate() for rollTableOutcome', () => {
  it('fails if rollTableOutcome provider has no rollTableUuid', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: null }
    }));
    const { valid, errors } = recipe.validate();
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('rollTableUuid') || e.includes('roll table UUID')));
  });

  it('fails if rollTableOutcome has duplicate result group names (case-insensitive)', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' },
      resultGroups: [
        { id: 'g1', name: 'Sword', results: [{ id: 'r1', componentId: 'item-1', quantity: 1 }] },
        { id: 'g2', name: 'SWORD', results: [{ id: 'r2', componentId: 'item-2', quantity: 1 }] }
      ]
    }));
    const { valid, errors } = recipe.validate();
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('uplicate') || e.includes('name')));
  });

  it('fails if rollTableOutcome result group name is a reserved fail keyword', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' },
      resultGroups: [
        { id: 'g1', name: 'fail', results: [{ id: 'r1', componentId: 'item-1', quantity: 1 }] }
      ]
    }));
    const { valid, errors } = recipe.validate();
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('reserved') || e.includes('keyword')));
  });

  it('fails if rollTableOutcome result group name is a reserved miss keyword', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' },
      resultGroups: [
        { id: 'g1', name: 'nothing', results: [{ id: 'r1', componentId: 'item-1', quantity: 1 }] }
      ]
    }));
    const { valid, errors } = recipe.validate();
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('reserved') || e.includes('keyword')));
  });

  it('passes with valid rollTableOutcome configuration', () => {
    const recipe = new Recipe(makeRecipeData({
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'table-uuid-1' }
    }));
    const { valid } = recipe.validate();
    assert.ok(valid);
  });

  it('non-rollTableOutcome recipes unaffected by new validation', () => {
    const recipe = new Recipe(makeRecipeData());
    const { valid } = recipe.validate();
    assert.ok(valid);
  });
});

// ---------------------------------------------------------------------------
// Regression tests: existing modes unaffected
// ---------------------------------------------------------------------------

describe('Regression: existing resolution modes unaffected', () => {
  it('simple mode: resolveResultGroups still returns first group', () => {
    const service = makeService({ resolutionMode: 'simple' });
    const groups = makeResultGroups(['Sword', 'Shield']);
    const recipe = { craftingSystemId: 'sys-1', resultGroups: groups };
    const step = { resultGroups: groups };

    const result = service.resolveResultGroups({ recipe, step, ingredientSet: null, checkResult: null });

    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Sword');
  });

  it('mapped mode: resolveResultGroups resolves by ingredientSet.resultGroupId', () => {
    const service = makeService({ resolutionMode: 'mapped' });
    const groups = makeResultGroups(['Sword', 'Shield']);
    const recipe = { craftingSystemId: 'sys-1', resultGroups: groups };
    const step = { resultGroups: groups };
    const ingredientSet = { resultGroupId: 'group-2' };

    const result = service.resolveResultGroups({ recipe, step, ingredientSet, checkResult: null });

    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Shield');
  });

  it('legacy tiered compatibility mode: resolveResultGroups resolves by outcomeRouting', () => {
    const service = makeService({ resolutionMode: 'tiered' });
    const groups = makeResultGroups(['Sword', 'Shield']);
    const recipe = {
      craftingSystemId: 'sys-1',
      resultGroups: groups,
      outcomeRouting: { success: 'group-1', failure: 'group-2' }
    };
    const step = { resultGroups: groups };
    const checkResult = { outcome: 'success' };

    const result = service.resolveResultGroups({ recipe, step, ingredientSet: null, checkResult });

    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Sword');
  });

  it('rollTableResult provided: resolveResultGroups uses it directly', () => {
    const service = makeService({ resolutionMode: 'mapped' });
    const groups = makeResultGroups(['Sword', 'Shield']);
    const recipe = { craftingSystemId: 'sys-1', resultGroups: groups };
    const step = { resultGroups: groups };
    const rollTableResult = { groups: [groups[1]], meta: { disposition: 'success' } };

    const result = service.resolveResultGroups({
      recipe, step, ingredientSet: null, checkResult: null, rollTableResult
    });

    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].name, 'Shield');
  });
});

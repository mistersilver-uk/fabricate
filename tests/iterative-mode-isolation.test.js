/** Iterative readiness reaches the system report and nothing else, and differs from progressive. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { validateRecipeForPersistence } = await import('../src/systems/recipeValidation.js');
const { validateCraft } = await import('../src/systems/rolledAmountResolver.js');
const { computeSystemVisibility, evaluateSystemValidation } =
  await import('../src/systems/systemValidation.js');
const { ITERATIVE_CRAFT_REFUSAL } = await import('../src/systems/iterative/iterativeCraftGate.js');

const manager = new CraftingSystemManager({ getRecipes: () => [] });

/** A normalized system in `resolutionMode` carrying the same iterative library. */
const systemIn = (resolutionMode, iterative) =>
  manager._normalizeSystem({
    id: 'sys-it',
    name: 'Forge',
    resolutionMode,
    components: [{ id: 'blade', name: 'Blade', difficulty: 2 }],
    ...(iterative !== undefined && { iterative }),
  });

const LIBRARY = {
  counters: [
    { id: 'heat', label: 'Heat' },
    { id: 'cold', label: 'Cold', limit: 'sideways' },
  ],
  actions: [{ id: 'stoke', label: '  ', check: 'never' }],
};

/** Two ingredient sets, an unrollable amount and no Counter Instance. */
const recipe = () =>
  new Recipe({
    id: 'r-blade',
    name: 'Blade',
    craftingSystemId: 'sys-it',
    iterative: {
      step: { success: [{ source: 'counter', counterId: 'heat', op: '>=', value: 3 }] },
    },
    ingredientSets: [
      { id: 'set-1', ingredientGroups: [] },
      { id: 'set-2', ingredientGroups: [] },
    ],
    resultGroups: [
      {
        id: 'g',
        name: 'Blade',
        results: [{ id: 'res', componentId: 'blade', quantity: 1, quantityFormula: 'nonsense' }],
        producedWhen: [{ end: 'success' }],
      },
    ],
  });

const report = (system) =>
  evaluateSystemValidation(system, { recipes: [recipe()], components: [] });
const codesOf = (issues) => issues.map((issue) => issue.code);
const ITERATIVE_CODE = /^iterative/u;

describe('the system report carries every iterative issue in full', () => {
  const issues = report(systemIn('iterative', LIBRARY)).issues.filter((issue) =>
    ITERATIVE_CODE.test(issue.code)
  );

  it('the premise: the iterative system raises recipe and library issues', () => {
    assert.ok(issues.some((issue) => issue.kind === 'recipe'));
    assert.ok(issues.some((issue) => issue.kind === 'system'));
  });

  it('gives each issue the full shape and English that is not its code', () => {
    for (const issue of issues) {
      assert.deepEqual(
        Object.keys(issue).sort((a, b) => a.localeCompare(b)),
        [
          'blocks',
          'code',
          'entityId',
          'entityKind',
          'entityName',
          'kind',
          'message',
          'nav',
          'severity',
        ],
        issue.code
      );
      assert.ok(['recipe', 'system'].includes(issue.kind));
      const entityKinds = issue.kind === 'recipe' ? ['recipe'] : ['counter', 'action', 'system'];
      assert.ok(entityKinds.includes(issue.entityKind), `${issue.code} ${issue.entityKind}`);
      assert.ok(['critical', 'warning'].includes(issue.severity));
      assert.ok([undefined, 'enable'].includes(issue.blocks), issue.code);
      assert.ok(issue.entityName.length > 0);
      assert.ok(issue.message.length > 0 && issue.message !== issue.code, issue.code);
      assert.ok(/^[A-Z][^.]*\.$/u.test(issue.message), issue.message);
      assert.equal(typeof issue.nav.view, 'string');
    }
  });

  it("names a library issue by the counter's or action's label, else its id", () => {
    const library = issues.filter((issue) => issue.kind === 'system');
    assert.deepEqual(
      library.map((issue) => [issue.entityId, issue.entityName, issue.code]),
      [
        ['cold', 'Cold', 'iterativeInvalidEntry'],
        ['stoke', 'stoke', 'iterativeInvalidEntry'],
      ]
    );
  });
});

describe('iterative issues never hide the system or a recipe', () => {
  it('reports iterativeNoCounters while visibility blocks nothing', () => {
    const system = systemIn('iterative', LIBRARY);
    assert.ok(codesOf(report(system).issues).includes('iterativeNoCounters'));
    assert.equal(report(system).blocksSystem, false);
    const visibility = computeSystemVisibility(system, { recipes: [recipe()], components: [] });
    assert.equal(visibility.blocksSystem, false);
    assert.equal(visibility.hiddenEntityIds.size, 0);
  });

  it('raises nothing for inert iterative data in a simple system', () => {
    const withData = codesOf(report(systemIn('simple', LIBRARY)).issues);
    assert.deepEqual(withData, codesOf(report(systemIn('simple', undefined)).issues));
    assert.ok(withData.every((code) => !ITERATIVE_CODE.test(code)));
  });
});

describe('iterative differs from progressive for the same recipe', () => {
  const service = (system) => new ResolutionModeService({ getSystem: () => system });

  it('validateRecipe asks one set per step and nothing progressive', () => {
    const iterative = service(systemIn('iterative', LIBRARY)).validateRecipe(recipe());
    const progressive = service(systemIn('progressive', LIBRARY)).validateRecipe(recipe());
    assert.deepEqual(codesOf(iterative.issues), ['stepIngredientSetCountExact']);
    assert.match(iterative.issues[0].message, /in iterative mode/u);
    assert.ok(codesOf(progressive.issues).includes('stepIngredientSetCountExact'));
    assert.ok(progressive.errors.some((error) => /progressive crafting check/u.test(error)));
  });

  it('evaluateSystemValidation raises iterative codes and no progressiveNoCheck', () => {
    const iterative = codesOf(report(systemIn('iterative', LIBRARY)).issues);
    const progressive = codesOf(report(systemIn('progressive', LIBRARY)).issues);
    assert.ok(iterative.some((code) => ITERATIVE_CODE.test(code)));
    assert.ok(!iterative.includes('progressiveNoCheck'));
    assert.ok(progressive.includes('progressiveNoCheck'));
    assert.ok(progressive.every((code) => !ITERATIVE_CODE.test(code)));
  });

  it('validateRecipeForPersistence applies the amount floor, which progressive waives (guard)', () => {
    class UnrollableRoll {
      constructor() {
        throw new Error('unrollable');
      }
    }
    const persistence = (system) =>
      validateRecipeForPersistence(recipe(), {
        system: () => system,
        essencesOfSystem: () => [],
        roll: UnrollableRoll,
        resolutionMode: (candidate, options) => service(system).validateRecipe(candidate, options),
      });
    const floor = (validation) =>
      validation.errors.some((error) => /cannot be rolled/u.test(error));
    assert.ok(floor(persistence(systemIn('iterative', LIBRARY))));
    assert.ok(!floor(persistence(systemIn('progressive', LIBRARY))));
  });

  it('validateCraft refuses through a real ResolutionModeService over the normalized system', () => {
    const iterative = validateCraft(recipe(), null, service(systemIn('iterative', LIBRARY)));
    assert.deepEqual(iterative, { valid: false, errors: [ITERATIVE_CRAFT_REFUSAL] });
    const progressive = validateCraft(recipe(), null, service(systemIn('progressive', LIBRARY)));
    assert.ok(!progressive.errors.includes(ITERATIVE_CRAFT_REFUSAL));
  });
});

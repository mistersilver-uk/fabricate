import test from 'node:test';
import assert from 'node:assert/strict';

import { IngredientSet } from '../src/models/IngredientSet.js';
import {
  describeComponentDeleteImpact,
  recipeLostItsShape,
  recipeReferencesAnyComponent,
  recipeReferencesComponent,
  stripComponentsFromRecipeJson,
} from '../src/utils/recipeComponentReferences.js';

/**
 * The component delete's shared cascade leaf and the impact statement that counts through it (issue
 * 1129).
 */

/** A recipe whose single group offers `componentIds` and whose single result is `resultId`. */
function recipe(id, { options = [], resultId = 'output', enabled = true, essences = {} } = {}) {
  return {
    id,
    craftingSystemId: 'sys',
    enabled,
    ingredientSets: [
      {
        id: `${id}-set`,
        essences,
        ingredientGroups: [{ id: `${id}-group`, options: options.map((c) => ({ componentId: c })) }],
        ingredients: options.map((c) => ({ componentId: c })),
      },
    ],
    resultGroups: [{ id: `${id}-rg`, results: [{ componentId: resultId }] }],
  };
}

test('recipeReferencesComponent matches a structured component match and a legacy alias alike', () => {
  const structured = {
    ingredientSets: [
      {
        ingredientGroups: [{ options: [{ match: { type: 'component', componentId: 'iron' } }] }],
      },
    ],
  };
  const legacyAlias = { ingredientSets: [{ ingredients: [{ systemItemId: 'iron' }] }] };
  const asResult = { resultGroups: [{ results: [{ componentId: 'iron' }] }] };

  assert.equal(recipeReferencesComponent(structured, 'iron'), true);
  assert.equal(recipeReferencesComponent(legacyAlias, 'iron'), true);
  assert.equal(recipeReferencesComponent(asResult, 'iron'), true);
  assert.equal(recipeReferencesComponent(structured, 'copper'), false);
});

test('recipeReferencesAnyComponent is false for an empty set rather than vacuously true', () => {
  const r = recipe('r1', { options: ['iron'] });
  assert.equal(recipeReferencesAnyComponent(r, new Set()), false);
  assert.equal(recipeReferencesAnyComponent(r, new Set(['iron'])), true);
  assert.equal(recipeReferencesAnyComponent(r, new Set(['tin', 'iron'])), true);
});

test('stripComponentsFromRecipeJson removes every selected component in ONE pass', () => {
  const r = recipe('r1', { options: ['iron', 'tin', 'copper'] });
  const { json, changed } = stripComponentsFromRecipeJson(r, new Set(['iron', 'tin']));

  assert.equal(changed, true);
  const surviving = json.ingredientSets[0].ingredientGroups[0].options.map((o) => o.componentId);
  assert.deepEqual(surviving, ['copper'], 'only the unselected option survives');
  // Since issue 1135 the flat mirror is DROPPED for a set that has groups rather than recomputed
  // from them: `toJSON` no longer emits the alias.
  assert.ok(
    !('ingredients' in json.ingredientSets[0]),
    'the retired flat alias is not recomputed back onto the wire'
  );
  assert.deepEqual(
    IngredientSet.fromJSON(json.ingredientSets[0]).ingredients.map((i) => i.componentId),
    ['copper'],
    'the in-memory mirror is derived from the surviving groups on read'
  );
});

test('stripComponentsFromRecipeJson does not mutate the recipe it is handed', () => {
  const r = recipe('r1', { options: ['iron', 'copper'] });
  stripComponentsFromRecipeJson(r, new Set(['iron']));

  assert.deepEqual(
    r.ingredientSets[0].ingredientGroups[0].options.map((o) => o.componentId),
    ['iron', 'copper'],
    'the source recipe is untouched'
  );
});

test('stripComponentsFromRecipeJson keeps an ESSENCE-only set alive after its options go', () => {
  const r = recipe('r1', { options: ['iron'], essences: { fire: 2 } });
  const { json } = stripComponentsFromRecipeJson(r, new Set(['iron']));

  assert.equal(json.ingredientSets.length, 1, 'a set carrying essences survives losing its options');
  assert.deepEqual(json.ingredientSets[0].essences, { fire: 2 });
});

test('stripComponentsFromRecipeJson drops a set left with no options and no essences', () => {
  const r = recipe('r1', { options: ['iron'] });
  const { json } = stripComponentsFromRecipeJson(r, new Set(['iron']));
  assert.equal(json.ingredientSets.length, 0);
});

test('stripComponentsFromRecipeJson reports changed:false for an untouched recipe', () => {
  const r = recipe('r1', { options: ['iron'] });
  const { changed } = stripComponentsFromRecipeJson(r, new Set(['gold']));
  assert.equal(changed, false, 'an unreferenced recipe must not be re-saved');
});

test('the cascade keeps a result group that ARRIVED empty and drops only one it emptied', () => {
  // Issue 1907: an empty non-terminal group is authored data, so pruning it would leave the step
  // with no result group at all — a shape `Recipe.validate` rejects, on a recipe left enabled.
  const twoStep = {
    id: 'r-layered',
    craftingSystemId: 'sys',
    enabled: true,
    ingredientSets: [],
    resultGroups: [],
    steps: [
      {
        id: 'step-1',
        ingredientSets: [{ id: 's1', ingredientGroups: [{ options: [{ componentId: 'tin' }] }] }],
        resultGroups: [{ id: 'rg-1', results: [] }],
      },
      {
        id: 'step-2',
        ingredientSets: [{ id: 's2', ingredientGroups: [{ options: [{ componentId: 'tin' }] }] }],
        resultGroups: [
          { id: 'rg-2a', results: [{ componentId: 'doomed' }] },
          { id: 'rg-2b', results: [{ componentId: 'bar' }] },
        ],
      },
    ],
  };

  const { json, changed } = stripComponentsFromRecipeJson(twoStep, new Set(['doomed']));

  assert.equal(changed, true, 'the recipe names the deleted component');
  assert.deepEqual(
    json.steps[0].resultGroups.map((group) => group.id),
    ['rg-1'],
    'the authored empty group on step 1 survives'
  );
  assert.deepEqual(
    json.steps[1].resultGroups.map((group) => group.id),
    ['rg-2b'],
    'only the group the strip itself emptied is pruned'
  );
  assert.equal(recipeLostItsShape(json), false, 'the recipe is not clamped to disabled');
});

test('recipeLostItsShape reads STEP sets and results, not only the recipe-level ones', () => {
  // The behaviour fix at the heart of the shared decision: a multi-step recipe whose
  // recipe-level sets were emptied is still craftable through its steps, and the component
  // delete used to disable it anyway.
  const multiStep = {
    ingredientSets: [],
    resultGroups: [],
    steps: [
      {
        ingredientSets: [{ id: 's', ingredientGroups: [{ options: [{ componentId: 'tin' }] }] }],
        resultGroups: [{ id: 'rg', results: [{ componentId: 'bar' }] }],
      },
    ],
  };
  assert.equal(recipeLostItsShape(multiStep), false, 'steps keep the recipe craftable');

  assert.equal(recipeLostItsShape({ ingredientSets: [], resultGroups: [] }), true);
  assert.equal(
    recipeLostItsShape({ ingredientSets: [{ id: 's' }], resultGroups: [] }),
    true,
    'ingredients without results is still lost'
  );
});

test('describeComponentDeleteImpact counts recipes as a DISTINCT union, never a per-component sum', () => {
  // One recipe naming BOTH selected components. A sum would say 2.
  const recipes = [recipe('r1', { options: ['iron', 'tin'] })];
  const impact = describeComponentDeleteImpact(['iron', 'tin'], recipes);

  assert.equal(impact.deletable, 2);
  assert.equal(impact.recipesRewritten, 1, 'r1 is rewritten once for the whole selection');
});

test('describeComponentDeleteImpact counts a recipe left with no results as disabled', () => {
  // `iron` is r1's only RESULT, so deleting it leaves r1 with nothing to produce.
  const recipes = [recipe('r1', { options: ['tin'], resultId: 'iron' })];
  const impact = describeComponentDeleteImpact(['iron'], recipes);

  assert.equal(impact.recipesRewritten, 1);
  assert.equal(impact.recipesDisabled, 1);
});

test('describeComponentDeleteImpact counts a recipe left with no ingredients as disabled', () => {
  const recipes = [recipe('r1', { options: ['iron'] })];
  const impact = describeComponentDeleteImpact(['iron'], recipes);

  assert.equal(impact.recipesRewritten, 1);
  assert.equal(impact.recipesDisabled, 1);
});

test('describeComponentDeleteImpact does NOT count an already-disabled recipe as newly disabled', () => {
  // The number warns about craftability the GM is about to LOSE. A recipe that was already
  // off has none to lose, and counting it would inflate the warning.
  const recipes = [recipe('r1', { options: ['iron'], enabled: false })];
  const impact = describeComponentDeleteImpact(['iron'], recipes);

  assert.equal(impact.recipesRewritten, 1, 'it is still rewritten');
  assert.equal(impact.recipesDisabled, 0, 'but it does not become newly disabled');
});

test('describeComponentDeleteImpact separates rewritten from disabled', () => {
  const recipes = [
    // Survives: loses one of two options, keeps the other.
    recipe('r1', { options: ['iron', 'copper'] }),
    // Dies: iron was its only option.
    recipe('r2', { options: ['iron'] }),
    // Untouched.
    recipe('r3', { options: ['gold'] }),
  ];
  const impact = describeComponentDeleteImpact(['iron'], recipes);

  assert.equal(impact.recipesRewritten, 2, 'r1 and r2, not r3');
  assert.equal(impact.recipesDisabled, 1, 'only r2 loses its shape');
});

test('describeComponentDeleteImpact is all zeroes for an empty selection', () => {
  const impact = describeComponentDeleteImpact([], [recipe('r1', { options: ['iron'] })]);

  assert.deepEqual(impact, {
    deletable: 0,
    deletableIds: [],
    recipesRewritten: 0,
    recipesDisabled: 0,
  });
});

test('describeComponentDeleteImpact de-duplicates a repeated id rather than counting it twice', () => {
  const impact = describeComponentDeleteImpact(['iron', 'iron'], []);
  assert.equal(impact.deletable, 1);
  assert.deepEqual(impact.deletableIds, ['iron']);
});

test('describeComponentDeleteImpact tolerates a missing recipe list', () => {
  const impact = describeComponentDeleteImpact(['iron'], undefined);
  assert.equal(impact.deletable, 1);
  assert.equal(impact.recipesRewritten, 0);
});

test('describeComponentDeleteImpact accepts Recipe-like objects via toJSON', () => {
  const model = {
    toJSON: () => recipe('r1', { options: ['iron'] }),
  };
  const impact = describeComponentDeleteImpact(['iron'], [model]);

  assert.equal(impact.recipesRewritten, 1);
  assert.equal(impact.recipesDisabled, 1);
});

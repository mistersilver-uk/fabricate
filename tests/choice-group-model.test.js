/**
 * Issue 1773 PR3: the result-side choice group as persisted, validated, refused under progressive,
 * and followed by the reference walks — detection, deletion, import report and copy-mode remap.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';

Object.assign(globalThis, { foundry: { utils: { randomID: () => 'minted' } } });
Object.assign(globalThis, { game: { time: { worldTime: 0 } } });

const { Result } = await import('../src/models/Result.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { versionedResultPlan } = await import('../src/systems/resultKindAward.js');
const { REFERENCE_KINDS, rebindCopyRecipeIds, resolveImportReferences } =
  await import('../src/systems/importReferenceResolver.js');
const { recipeReferencesComponent, stripComponentsFromRecipeJson } =
  await import('../src/utils/recipeComponentReferences.js');

/** Serialisations captured at the base commit (280ccbd05) for the inputs below. */
const BASE = JSON.parse(
  readFileSync(new URL('fixtures/choiceGroupBaseShapes.golden.json', import.meta.url), 'utf8')
);

const baseRecipe = () =>
  new Recipe({
    id: 'recipe',
    name: 'Tonic',
    craftingSystemId: 'sys',
    metadata: { created: 1, modified: 1, author: 'Base', version: '1.0.0' },
    steps: [
      {
        id: 's1',
        name: 'One',
        ingredientSets: [{ id: 'set', ingredientGroups: [] }],
        resultGroups: [
          {
            id: 'g1',
            name: 'Out',
            results: [{ id: 'r1', componentId: 'ore', quantity: 2, quantityFormula: '1d4' }],
          },
          {
            id: 'gf',
            name: 'Fail',
            role: 'failure',
            results: [{ id: 'r2', componentId: 'slag', quantity: 1 }],
          },
        ],
      },
    ],
  });

test('1773 V&A 1: a pre-change recipe and its award plan re-serialise byte-identically', () => {
  const recipe = baseRecipe();
  assert.equal(JSON.stringify(recipe.toJSON()), BASE.recipe);
  assert.equal(JSON.stringify(Recipe.fromJSON(JSON.parse(BASE.recipe)).toJSON()), BASE.recipe);
  assert.equal(JSON.stringify(versionedResultPlan(recipe.steps[0].resultGroups)), BASE.plan);
});

const member = (id, extra = {}) => ({ id, componentId: `comp-${id}`, quantity: 1, ...extra });
const ranged = (id, from, to) => member(id, { selectionRange: { from, to } });

/** One group per chooser x award-strategy cell. */
const CELLS = Object.freeze({
  playerAnyOne: { id: 'g', alternatives: [member('a'), member('b')] },
  playerUpTo: {
    id: 'g',
    awardStrategy: 'upTo',
    awardCount: 2,
    alternatives: [member('a'), member('b'), member('c')],
  },
  rolledAnyOne: {
    id: 'g',
    chooser: 'rolled',
    selectionFormula: '1d6',
    alternatives: [ranged('a', 1, 3), ranged('b', 4, 6)],
  },
  rolledUpToRepeats: {
    id: 'g',
    chooser: 'rolled',
    awardStrategy: 'upTo',
    awardCountFormula: '1d3',
    withReplacement: true,
    selectionFormula: '1d6',
    alternatives: [ranged('a', 1, 3), ranged('b', 4, 6)],
  },
});

test('1773 V&A 11: a group in each chooser x strategy cell round-trips unchanged', () => {
  for (const [cell, payload] of Object.entries(CELLS)) {
    const json = new Result(payload).toJSON();
    assert.deepEqual(new Result(JSON.parse(JSON.stringify(json))).toJSON(), json, cell);
    assert.deepEqual(new Result(json).validate().errors, [], cell);
    const recipe = new Recipe({ name: 'R', resultGroups: [{ id: 's', results: [payload] }] });
    const reread = Recipe.fromJSON(JSON.parse(JSON.stringify(recipe.toJSON())));
    assert.deepEqual(reread.toJSON(), recipe.toJSON(), `${cell} through the recipe`);
  }
  const player = new Result(CELLS.playerAnyOne).toJSON();
  assert.ok(!('chooser' in player) && !('awardStrategy' in player), 'the defaults are omitted');
  assert.deepEqual(Object.keys(player.alternatives[0]).sort(byCodePoint), [
    'componentId',
    'id',
    'itemUuid',
    'propertyMacroUuid',
    'quantity',
    'systemItemId',
  ]);
});

test('1773 V&A 11: switching rolled, up to and repeats to the player chooser writes no repeats', () => {
  const json = new Result({ ...CELLS.rolledUpToRepeats, chooser: 'playerChooses' }).toJSON();
  assert.ok(!('withReplacement' in json));
  const anyOne = new Result({ ...CELLS.rolledAnyOne, withReplacement: true }).toJSON();
  assert.ok(!('withReplacement' in anyOne), 'nor under any one of');
  assert.equal(new Result(CELLS.rolledUpToRepeats).toJSON().withReplacement, true);
});

test('1773 V&A 11: each setting persists only in the cell that reads it', () => {
  const stale = { awardCount: 2, awardCountFormula: '@gone', selectionFormula: '@gone' };
  const anyOne = new Result({ ...CELLS.rolledAnyOne, ...stale }).toJSON();
  assert.ok(!('awardCount' in anyOne) && !('awardCountFormula' in anyOne), 'no count off up to');
  assert.equal(anyOne.selectionFormula, '@gone', 'a rolled group keeps its selection');
  const player = new Result({ ...CELLS.playerUpTo, ...stale, awardCountFormula: null }).toJSON();
  assert.ok(!('selectionFormula' in player), 'no selection under the player chooser');
  assert.equal(player.awardCount, 2, 'an up-to group keeps its count');
});

test('1773: a group unwrapped to a plain result keeps none of its settings', () => {
  const { alternatives: _members, ...settings } = CELLS.rolledUpToRepeats;
  const json = new Result({ ...settings, componentId: 'ore' }).toJSON();
  for (const key of ['chooser', 'awardStrategy', 'awardCountFormula', 'selectionFormula']) {
    assert.ok(!(key in json), key);
  }
});

test('1773: Result.validate refuses every malformed group', () => {
  const errors = (payload) => new Result(payload).validate().errors.join(' | ');
  assert.match(errors({ id: 'g', alternatives: [member('a')] }), /two or more/);
  assert.match(errors({ id: 'g', alternatives: [member('a'), member('a')] }), /distinct ids/);
  assert.match(
    errors({ id: 'g', alternatives: [member('a'), { id: 'b', alternatives: [] }] }),
    /Alternative 2: cannot be a choice group/
  );
  assert.match(errors({ ...CELLS.rolledAnyOne, selectionFormula: '' }), /needs a selection/);
  assert.match(errors({ ...CELLS.playerUpTo, awardCount: null }), /exactly one of/);
  assert.match(errors({ ...CELLS.playerUpTo, awardCountFormula: '1d3' }), /exactly one of/);
  assert.match(errors({ ...CELLS.playerUpTo, awardCount: 0 }), /positive whole/);
  const rolled = (alternatives) => errors({ ...CELLS.rolledAnyOne, alternatives });
  assert.match(rolled([ranged('a', 1, 3), member('b')]), /needs a selecting range/);
  assert.match(rolled([ranged('a', 1, 4), ranged('b', 4, 6)]), /cannot overlap/);
  assert.match(rolled([ranged('a', 3, 1), ranged('b', 4, 6)]), /cannot start above its end/);
  assert.match(rolled([ranged('a', 1, 3.5), ranged('b', 4, 6)]), /between whole numbers/);
  assert.match(errors({ ...CELLS.playerAnyOne, chooser: 'gm' }), /Chooser "gm"/);
  assert.match(
    errors({ ...CELLS.playerAnyOne, alternatives: [member('a'), { id: 'b', quantity: 1 }] }),
    /Alternative 2: Result must have componentId/
  );
  assert.deepEqual(
    new Result(CELLS.playerAnyOne).validate().errors,
    [],
    'a carrier needs no subject'
  );
});

test('1773 V&A 8: a progressive result set refuses a choice group', () => {
  const system = {
    id: 'sys',
    resolutionMode: 'progressive',
    craftingCheck: { progressive: { awardMode: 'equal', rollFormula: '1d20' } },
    components: [{ id: 'ore', difficulty: 2 }],
  };
  const service = new ResolutionModeService({ getSystem: () => system });
  const recipe = (results) => ({
    craftingSystemId: 'sys',
    getExecutionSteps: () => [
      {
        id: 's',
        name: 'Stage',
        ingredientSets: [{ id: 'set', ingredientGroups: [] }],
        resultGroups: [{ id: 'g', results }],
      },
    ],
  });
  const ore = { id: 'r', componentId: 'ore' };
  assert.equal(service.validateRecipe(recipe([ore])).valid, true);
  assert.deepEqual(service.validateRecipe(recipe([ore, CELLS.playerAnyOne])).errors, [
    'Progressive result 2 cannot be a choice group',
  ]);
});

const withGroup = (group) =>
  new Recipe({
    id: 'recipe',
    name: 'Tonic',
    ingredientSets: [{ id: 'set', ingredients: [{ componentId: 'wood', quantity: 1 }] }],
    resultGroups: [{ id: 'out', results: [group] }],
  });

test('1773 V&A 16: a deletion detects a member, unwraps a one-member group and drops an empty one', () => {
  const group = { id: 'g', ...CELLS.rolledAnyOne };
  assert.equal(recipeReferencesComponent(withGroup(group), 'comp-a'), true, 'a member is found');
  const strip = (ids) => stripComponentsFromRecipeJson(withGroup(group), new Set(ids));

  const unwrapped = strip(['comp-a']);
  assert.equal(unwrapped.changed, true);
  const [plain] = unwrapped.json.resultGroups[0].results;
  assert.equal(plain.id, 'b', 'the surviving member stands as the result');
  assert.equal(plain.componentId, 'comp-b');
  for (const key of ['alternatives', 'chooser', 'selectionFormula', 'selectionRange']) {
    assert.ok(!(key in plain), key);
  }
  assert.deepEqual(new Result(plain).validate().errors, []);

  assert.deepEqual(strip(['comp-a', 'comp-b']).json.resultGroups, [], 'an empty carrier is gone');

  const three = withGroup({ ...CELLS.playerUpTo });
  const kept = stripComponentsFromRecipeJson(three, new Set(['comp-c'])).json;
  assert.deepEqual(
    kept.resultGroups[0].results[0].alternatives.map((entry) => entry.id),
    ['a', 'b'],
    'a group left with two stays a group'
  );
});

const knowledge = (id, recipeId) => ({ id, kind: 'knowledge', recipeId, quantity: 1 });

test('1773 V&A 2: copy mode remaps a taught recipe inside alternatives and reports an absent one', async () => {
  const payload = () => ({
    system: { components: [{ id: 'comp-a' }], recipeItemDefinitions: [] },
    currencyConfig: { units: [] },
    recipes: [
      { id: 'taught', name: 'Taught', resultGroups: [] },
      {
        id: 'teacher',
        name: 'Teacher',
        resultGroups: [
          {
            results: [
              {
                id: 'g',
                alternatives: [knowledge('k1', 'taught'), knowledge('k2', 'gone'), member('a')],
              },
            ],
          },
        ],
        steps: [
          {
            resultGroups: [
              { results: [{ id: 'g2', alternatives: [knowledge('k3', 'taught'), member('x')] }] },
            ],
          },
        ],
      },
    ],
  });
  const replaced = await resolveImportReferences(payload());
  assert.deepEqual(replaced.resolved.recipes, payload().recipes, 'replace mode keeps the group');

  let next = 0;
  const copied = rebindCopyRecipeIds(payload(), { generateId: () => `copy-${++next}` });
  const teacher = copied.recipes[1];
  const [k1, k2] = teacher.resultGroups[0].results[0].alternatives;
  assert.equal(k1.recipeId, 'copy-1', 'a member at top level');
  assert.equal(k2.recipeId, 'gone', 'an absent id stays');
  assert.equal(
    teacher.steps[0].resultGroups[0].results[0].alternatives[0].recipeId,
    'copy-1',
    'a member per step'
  );

  const reported = (await resolveImportReferences(copied)).unresolvedReferences;
  assert.deepEqual(
    reported.map(({ kind, referenceValue }) => [kind, referenceValue]),
    [
      [REFERENCE_KINDS.RECIPE_LINK, 'gone'],
      [REFERENCE_KINDS.COMPONENT_LINK, 'comp-x'],
    ]
  );
});

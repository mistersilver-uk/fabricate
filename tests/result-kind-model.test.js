/**
 * Issue 1773 PR1: the `Result` kinds (`component`, `currency`, `knowledge`) as persisted, validated,
 * imported and refused at the gathering, salvage and progressive boundaries.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

Object.assign(globalThis, { foundry: { utils: { randomID: () => 'minted' } } });
Object.assign(globalThis, { game: { time: { worldTime: 0 } } });

const { Result } = await import('../src/models/Result.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { gatheringResultAmountErrors } = await import('../src/systems/gatheringResultGroups.js');
const { normalizeSalvageResult } = await import('../src/systems/normalize/salvage.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { REFERENCE_KINDS, rebindCopyRecipeIds, resolveImportReferences } =
  await import('../src/systems/importReferenceResolver.js');
const { versionedResultPlan } = await import('../src/systems/resultKindAward.js');
const { awardHistory } = await import('../src/systems/resultKindAward.js');
const { attachAwardReceipts, historyEvidenceFields } =
  await import('../src/systems/runHistoryEvidence.js');

/** `Result.toJSON` strings captured at the base commit (9e3c4ed97) for these inputs. */
const BASE_RESULTS = [
  [
    { id: 'r1', componentId: 'ore', quantity: 2 },
    '{"id":"r1","componentId":"ore","systemItemId":"ore","itemUuid":null,"quantity":2,"propertyMacroUuid":null}',
  ],
  [
    {
      id: 'r2',
      systemItemId: 'ore',
      quantity: 3,
      quantityFormula: '1d4+1',
      propertyMacroUuid: 'Macro.x',
    },
    '{"id":"r2","componentId":"ore","systemItemId":"ore","itemUuid":null,"quantity":3,"quantityFormula":"1d4+1","propertyMacroUuid":"Macro.x"}',
  ],
  [
    { id: 'r3', itemUuid: 'Item.abc', quantity: 1 },
    '{"id":"r3","componentId":null,"systemItemId":null,"itemUuid":"Item.abc","quantity":1,"propertyMacroUuid":null}',
  ],
];

const currency = (extra = {}) => ({
  id: 'c1',
  kind: 'currency',
  unit: 'gp',
  quantity: 25,
  ...extra,
});
const knowledge = (extra = {}) => ({ id: 'k1', kind: 'knowledge', recipeId: 'taught', ...extra });

test('1773 V&A 1: a pre-change Result re-serialises byte-identically and gains no new key', () => {
  for (const [input, base] of BASE_RESULTS) {
    assert.equal(JSON.stringify(new Result(input).toJSON()), base);
    assert.equal(JSON.stringify(Result.fromJSON(JSON.parse(base)).toJSON()), base, 'round-trips');
  }
  const explicit = new Result({ id: 'r1', kind: 'component', componentId: 'ore', quantity: 2 });
  assert.equal(JSON.stringify(explicit.toJSON()), BASE_RESULTS[0][1], 'component is the absence');
});

test('1773 V&A 1: a pre-change Recipe, step record and award plan are byte-identical', () => {
  const recipe = new Recipe({
    id: 'recipe',
    name: 'Tonic',
    craftingSystemId: 'sys',
    ingredientSets: [{ id: 'set', ingredientGroups: [] }],
    resultGroups: [{ id: 'g', name: 'Out', results: [BASE_RESULTS[0][0]] }],
  });
  const json = JSON.stringify(recipe.toJSON());
  assert.equal(JSON.stringify(Recipe.fromJSON(JSON.parse(json)).toJSON()), json);
  assert.ok(!json.includes('"kind"'), 'no kind key is written for a component');

  const step = { status: 'succeeded', createdResults: [] };
  assert.deepEqual(historyEvidenceFields(step), {}, 'no credit or grant key appears');
  const items = attachAwardReceipts([], []);
  assert.equal(JSON.stringify(awardHistory(items)), '{"createdResults":[]}');

  const plan = versionedResultPlan([{ results: [BASE_RESULTS[0][0], BASE_RESULTS[2][0]] }]);
  assert.equal(
    JSON.stringify(plan),
    '[{"resultId":"r1","componentId":"ore","itemUuid":null,"quantity":2},' +
      '{"resultId":"r3","componentId":null,"itemUuid":"Item.abc","quantity":1}]'
  );
});

test('1773: every kind round-trips its own fields and omits the rest', () => {
  for (const payload of [
    currency(),
    currency({ label: 'Guild bounty', reason: 'For the commission', quantityFormula: '2d6' }),
    knowledge(),
  ]) {
    const json = new Result(payload).toJSON();
    assert.deepEqual(new Result(json).toJSON(), json);
    for (const [key, value] of Object.entries(payload)) assert.equal(json[key], value, key);
  }
  assert.equal(new Result(knowledge({ quantity: 7 })).quantity, 1, 'knowledge persists one');
  assert.ok(!('unit' in new Result(knowledge()).toJSON()), 'an absent unit is omitted');
});

test('1773: Result.validate requires each kind its own subject and refuses misplaced fields', () => {
  const errors = (payload) => new Result(payload).validate().errors;
  assert.deepEqual(errors(currency()), []);
  assert.deepEqual(errors(knowledge()), []);
  assert.match(errors(currency({ unit: '' })).join(','), /must name a unit/);
  assert.match(errors(knowledge({ recipeId: null })).join(','), /must name a recipe/);
  assert.match(errors(knowledge({ quantityFormula: '1d4' })).join(','), /cannot roll an amount/);
  assert.match(errors(knowledge({ label: 'x' })).join(','), /Only a currency result/);
  assert.match(errors(currency({ propertyMacroUuid: 'Macro.m' })).join(','), /property macro/);
  assert.match(errors({ id: 'a', kind: 'activity', quantity: 1 }).join(','), /"activity" is not/);
  assert.match(errors({ id: 'a', quantity: 1 }).join(','), /componentId or itemUuid/);
});

test('1773 V&A 2: replace mode keeps every kind, copy mode remaps a taught recipe', async () => {
  const payload = () => ({
    system: { components: [], recipeItemDefinitions: [] },
    currencyConfig: { units: [{ id: 'gp' }] },
    recipes: [
      { id: 'taught', name: 'Taught', resultGroups: [] },
      {
        id: 'teacher',
        name: 'Teacher',
        resultGroups: [
          { results: [knowledge(), currency(), knowledge({ id: 'k2', recipeId: 'gone' })] },
        ],
        steps: [
          { resultGroups: [{ results: [knowledge({ id: 'k3' }), currency({ unit: 'mark' })] }] },
        ],
      },
    ],
  });
  const replaced = await resolveImportReferences(payload());
  assert.deepEqual(replaced.resolved.recipes, payload().recipes, 'replace mode keeps each kind');

  let next = 0;
  const copied = rebindCopyRecipeIds(payload(), { generateId: () => `copy-${++next}` });
  const [taught, teacher] = copied.recipes;
  assert.equal(taught.id, 'copy-1');
  assert.equal(teacher.resultGroups[0].results[0].recipeId, 'copy-1', 'top level');
  assert.equal(teacher.steps[0].resultGroups[0].results[0].recipeId, 'copy-1', 'per step');
  assert.equal(teacher.resultGroups[0].results[2].recipeId, 'gone', 'an absent id stays');

  const reported = (await resolveImportReferences(copied)).unresolvedReferences;
  assert.deepEqual(
    reported.map(({ kind, referenceValue }) => [kind, referenceValue]),
    [
      [REFERENCE_KINDS.RECIPE_LINK, 'gone'],
      [REFERENCE_KINDS.CURRENCY_UNIT, 'mark'],
    ]
  );
});

test('1773 V&A 6: a raw gathering or salvage payload carrying another kind is refused', () => {
  const groups = (result) => [{ id: 'g', results: [result] }];
  assert.deepEqual(gatheringResultAmountErrors(groups({ id: 'r', componentId: 'ore' }), null), []);
  assert.deepEqual(gatheringResultAmountErrors(groups(currency()), null), [
    'Gathering result must award a component',
  ]);
  assert.deepEqual(gatheringResultAmountErrors(groups({ id: 'r', alternatives: [] }), null), [
    'Gathering result cannot be a choice group',
  ]);

  assert.equal(normalizeSalvageResult({ id: 'r', componentId: 'ore' })?.componentId, 'ore');
  assert.equal(normalizeSalvageResult(currency()), null, 'a currency salvage row never enters');
  assert.equal(normalizeSalvageResult(knowledge()), null);
  assert.equal(normalizeSalvageResult({ id: 'r', componentId: 'ore', alternatives: [] }), null);
});

test('1773 V&A 8: a progressive result group refuses a non-component kind', () => {
  const system = {
    id: 'sys',
    resolutionMode: 'progressive',
    craftingCheck: { progressive: { awardMode: 'equal', rollFormula: '1d20' } },
    components: [{ id: 'ore', difficulty: 2 }],
  };
  const service = new ResolutionModeService({ getSystem: () => system });
  const step = (results) => ({
    id: 's',
    name: 'Stage',
    ingredientSets: [{ id: 'set', ingredientGroups: [] }],
    resultGroups: [{ id: 'g', results }],
  });
  const recipe = (results) => ({
    craftingSystemId: 'sys',
    getExecutionSteps: () => [step(results)],
  });
  assert.equal(service.validateRecipe(recipe([{ id: 'r', componentId: 'ore' }])).valid, true);
  for (const reward of [currency(), knowledge()]) {
    const result = service.validateRecipe(recipe([{ id: 'r', componentId: 'ore' }, reward]));
    assert.deepEqual(result.errors, ['Progressive result 2 must award a component']);
  }
});

test('1773 V&A 1: a blank currency label or reason is trimmed away rather than written empty', () => {
  const json = new Result(currency({ label: '  ', reason: '' })).toJSON();
  assert.ok(!('label' in json), 'a whitespace label is absent');
  assert.ok(!('reason' in json), 'an empty reason is absent');
});

/** `recipeValidation`'s checks driven directly through their seam bag, plus the manager-surface
 * contract the extraction must not move: every cited member and delegate still resolves. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectEssenceReferences,
  essenceNameMap,
  resolveEssenceValidationSystem,
  validateEnabledEssenceReferences,
  validateEssenceReferences,
  validateRecipeForActivation,
  validateRecipeForPersistence,
  validateTagPlaceholders,
} from '../../src/systems/recipeValidation.js';

globalThis.foundry ??= { utils: { randomID: () => 'rid', getProperty: () => undefined } };
globalThis.game ??= { user: { isGM: true }, actors: [], fabricate: null };
globalThis.ui ??= { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { RecipeManager } = await import('../../src/systems/RecipeManager.js');

/** A seam bag over one system, recording what each check asked for. */
function makeDeps({
  system = null,
  essences = [],
  roll = null,
  resolutionMode = () => ({ valid: true, errors: [] }),
  signatures = () => ({ valid: true, errors: [], issues: [] }),
} = {}) {
  const asked = { systemIds: [], systems: [] };
  return {
    asked,
    deps: {
      system: (systemId) => {
        asked.systemIds.push(systemId);
        return system;
      },
      essencesOfSystem: (resolved) => {
        asked.systems.push(resolved);
        return essences;
      },
      roll,
      resolutionMode,
      signatures,
    },
  };
}

const essencesOn = (overrides = {}) => ({ id: 'sys-1', features: { essences: true }, ...overrides });

test('resolveEssenceValidationSystem answers only when the recipe names a system with essences', () => {
  const { deps } = makeDeps({ system: essencesOn() });
  assert.equal(resolveEssenceValidationSystem({}, deps), null, 'no craftingSystemId');
  assert.equal(
    resolveEssenceValidationSystem({ craftingSystemId: 'sys-1' }, deps)?.id,
    'sys-1',
    'features.essences'
  );

  const legacy = makeDeps({ system: { id: 'sys-1', features: {}, enableEssences: true } });
  assert.equal(
    resolveEssenceValidationSystem({ craftingSystemId: 'sys-1' }, legacy.deps)?.id,
    'sys-1',
    'the legacy enableEssences alias still takes the recipe into play'
  );

  const off = makeDeps({ system: { id: 'sys-1', features: { essences: false } } });
  assert.equal(resolveEssenceValidationSystem({ craftingSystemId: 'sys-1' }, off.deps), null);

  const missing = makeDeps({ system: null });
  assert.equal(resolveEssenceValidationSystem({ craftingSystemId: 'sys-1' }, missing.deps), null);
});

test('resolveEssenceValidationSystem resolves against the recipe it is given, not a cached one', () => {
  const systems = { 'sys-a': essencesOn({ id: 'sys-a' }), 'sys-b': essencesOn({ id: 'sys-b' }) };
  const deps = { system: (systemId) => systems[systemId] ?? null };
  assert.equal(resolveEssenceValidationSystem({ craftingSystemId: 'sys-a' }, deps).id, 'sys-a');
  assert.equal(resolveEssenceValidationSystem({ craftingSystemId: 'sys-b' }, deps).id, 'sys-b');
});

test('collectEssenceReferences walks recipe sets, step sets, legacy maps and group options', () => {
  const recipe = {
    ingredientSets: [
      {
        name: '  Brew  ',
        essences: { fire: 2 },
        ingredientGroups: [
          { options: [{ match: { type: 'essence', essenceId: ' water ', amount: 3 } }] },
          { options: [{ match: { type: 'component', componentId: 'c-1' } }] },
        ],
      },
      { essences: { earth: 0 } },
    ],
    steps: [{ ingredientSets: [{ name: 'Finish', essences: { air: 1 } }] }],
  };

  assert.deepEqual(collectEssenceReferences(recipe), [
    { setLabel: 'Brew', essenceId: 'fire', quantity: 2 },
    { setLabel: 'Brew', essenceId: 'water', quantity: 3 },
    { setLabel: '2', essenceId: 'earth', quantity: 0 },
    { setLabel: 'Finish', essenceId: 'air', quantity: 1 },
  ]);
  assert.deepEqual(collectEssenceReferences(null), []);
});

test('essenceNameMap excludes a definition whose name is blank', () => {
  const map = essenceNameMap([
    { id: 'fire', name: '  Fire  ' },
    { id: 'blank', name: '  ' },
    { id: 'absent' },
    { id: 'wrong-type', name: 42 },
  ]);
  assert.deepEqual([...map.entries()], [['fire', 'Fire']]);
  assert.equal(map.has('blank'), false, 'a whitespace-only name is not a name');
});

test('validateEssenceReferences reports unknown ids and non-positive quantities', () => {
  const { deps } = makeDeps({
    system: essencesOn(),
    essences: [{ id: 'fire', name: 'Fire' }, { id: 'nameless' }],
  });
  const recipe = {
    craftingSystemId: 'sys-1',
    ingredientSets: [
      { name: 'Set A', essences: { fire: 2 } },
      { name: 'Set B', essences: { ghost: 1, fire: 0, nameless: -1 } },
    ],
  };

  const result = validateEssenceReferences(recipe, deps);
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['ingredientSetUnknownEssence', 'ingredientSetEssenceQuantityNamed', 'ingredientSetEssenceQuantity']
  );
  assert.deepEqual(result.errors, result.issues.map((issue) => issue.message));
  assert.equal(
    result.issues[1].params.essence,
    'Fire',
    'a named essence never surfaces its raw id'
  );
});

test('validateEssenceReferences passes a recipe with no essence system in play', () => {
  const { deps, asked } = makeDeps({ system: null });
  assert.deepEqual(validateEssenceReferences({ craftingSystemId: 'sys-1' }, deps), {
    valid: true,
    errors: [],
    issues: [],
  });
  assert.deepEqual(asked.systems, [], 'no definitions are read when essences do not apply');
});

test('validateEnabledEssenceReferences reports one issue per set and essence pair', () => {
  const { deps } = makeDeps({
    system: essencesOn(),
    essences: [
      { id: 'fire', name: 'Fire', enabled: false },
      { id: 'water', name: 'Water', enabled: true },
    ],
  });
  const recipe = {
    craftingSystemId: 'sys-1',
    ingredientSets: [
      {
        name: 'Set A',
        essences: { fire: 1, water: 1, ghost: 1 },
        ingredientGroups: [
          { options: [{ match: { type: 'essence', essenceId: 'fire', amount: 1 } }] },
        ],
      },
    ],
  };

  const result = validateEnabledEssenceReferences(recipe, deps);
  assert.equal(result.issues.length, 1, 'the legacy map and the group option are one fact');
  assert.equal(result.issues[0].code, 'ingredientSetDisabledEssence');
  assert.equal(result.issues[0].params.essence, 'Fire');
});

test('validateEnabledEssenceReferences passes when no definition is disabled', () => {
  const { deps } = makeDeps({ system: essencesOn(), essences: [{ id: 'fire', name: 'Fire' }] });
  const recipe = { craftingSystemId: 'sys-1', ingredientSets: [{ essences: { fire: 1 } }] };
  assert.equal(validateEnabledEssenceReferences(recipe, deps).valid, true);
});

test('validateTagPlaceholders refuses a tag the system does not define', () => {
  const { deps } = makeDeps({ system: { id: 'sys-1', itemTags: ['metal'], tags: ['  rare  '] } });
  const recipe = {
    craftingSystemId: 'sys-1',
    ingredientSets: [
      {
        ingredientGroups: [
          { name: 'Metals', options: [{ match: { type: 'tags', tags: ['metal', 'rare'] } }] },
          { options: [{ match: { type: 'tags', tags: ['ghost', '  '] } }] },
        ],
      },
    ],
  };

  const result = validateTagPlaceholders(recipe, deps);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, 'ingredientGroupUnknownTag');
  assert.deepEqual(result.issues[0].params, { group: '2', tag: 'ghost' });
});

test('validateTagPlaceholders synthesises a group per legacy flat ingredient', () => {
  const { deps } = makeDeps({ system: { id: 'sys-1', itemTags: [] } });
  const recipe = {
    craftingSystemId: 'sys-1',
    ingredientSets: [{ ingredients: [{ match: { type: 'tags', tags: ['ghost'] } }] }],
  };
  assert.equal(validateTagPlaceholders(recipe, deps).issues.length, 1);
});

test('validateTagPlaceholders passes when the recipe names no system', () => {
  const { deps } = makeDeps({ system: null });
  assert.deepEqual(validateTagPlaceholders({}, deps), { valid: true, errors: [], issues: [] });
});

/** A recipe double recording which validator ran and what `Roll` it was handed. */
function makeRecipe({ errors = [], issues = null } = {}) {
  const calls = [];
  return {
    calls,
    recipe: {
      craftingSystemId: null,
      ingredientSets: [],
      validate: (injected) => {
        calls.push(['validate', injected]);
        return issues ? { valid: false, issues } : { valid: errors.length === 0, errors };
      },
      validateStructure: (injected) => {
        calls.push(['validateStructure', injected]);
        return { valid: true, errors: [] };
      },
    },
  };
}

test('validateRecipeForPersistence routes completeness and injects the roll engine', () => {
  const RollDouble = class {};
  const { deps } = makeDeps({ roll: RollDouble });

  const complete = makeRecipe({ errors: ['broken'] });
  const result = validateRecipeForPersistence(complete.recipe, deps);
  assert.equal(complete.calls[0][0], 'validate', 'the default is the complete check');
  assert.equal(complete.calls[0][1].Roll, RollDouble);
  assert.deepEqual(result.errors, ['broken']);
  assert.deepEqual(result.issues, [{ code: null, params: {}, message: 'broken' }]);

  const shell = makeRecipe({ errors: ['broken'] });
  const shellResult = validateRecipeForPersistence(shell.recipe, deps, { requireComplete: false });
  assert.equal(shell.calls[0][0], 'validateStructure');
  assert.equal(shellResult.valid, true);
});

test('validateRecipeForPersistence composes the essence, tag and resolution-mode checks', () => {
  const modeCalls = [];
  const { deps } = makeDeps({
    system: essencesOn({ itemTags: [] }),
    essences: [],
    resolutionMode: (recipe, options) => {
      modeCalls.push(options);
      return { valid: false, errors: ['mode refused'] };
    },
  });
  const { recipe } = makeRecipe();
  recipe.craftingSystemId = 'sys-1';
  recipe.ingredientSets = [
    {
      name: 'Set A',
      essences: { ghost: 1 },
      ingredientGroups: [{ options: [{ match: { type: 'tags', tags: ['unknown'] } }] }],
    },
  ];

  const result = validateRecipeForPersistence(recipe, deps, { requireComplete: false });
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['ingredientSetUnknownEssence', 'ingredientGroupUnknownTag', null]
  );
  assert.deepEqual(modeCalls, [{ requireComplete: false }], 'completeness reaches the mode check');
});

test('validateRecipeForActivation adds signature and disabled-essence issues to persistence', () => {
  const signatureIssue = { code: 'signatureCollision', params: {}, message: 'clash' };
  const { deps } = makeDeps({
    system: essencesOn({ itemTags: [] }),
    essences: [{ id: 'fire', name: 'Fire', enabled: false }],
    signatures: () => ({ valid: false, errors: ['clash'], issues: [signatureIssue] }),
  });
  const { recipe, calls } = makeRecipe();
  recipe.craftingSystemId = 'sys-1';
  recipe.ingredientSets = [{ name: 'Set A', essences: { fire: 1 } }];

  const result = validateRecipeForActivation(recipe, deps);
  assert.equal(calls[0][0], 'validate', 'activation always requires a complete recipe');
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['signatureCollision', 'ingredientSetDisabledEssence']
  );
  assert.deepEqual(result.errors, result.issues.map((issue) => issue.message));
});

test('validateRecipeForActivation tolerates a signature result carrying no issues array', () => {
  const { deps } = makeDeps({ signatures: () => ({ valid: false, errors: ['clash'] }) });
  const { recipe } = makeRecipe();
  const result = validateRecipeForActivation(recipe, deps);
  assert.deepEqual(result.errors, ['clash']);
  assert.deepEqual(result.issues, []);
});

/** The members `openspec/specs/**` and `DOMAIN.md` cite by name. */
const CITED_MEMBERS = [
  'ingredientMatchesItem',
  'toolMatchesItem',
  'resolveRecipeIcon',
  'updateRecipe',
  'reload',
  'createRecipe',
  'evaluateShoppingRequirement',
  'evaluateCraftability',
  'getToolsForSet',
  'canActivateRecipe',
  'getAvailableRecipes',
  '_displayGroups',
  '_validateTagPlaceholders',
  '_chosenOptionByGroup',
  '_matchesTagIngredient',
];

/** The members the extraction keeps as delegates. */
const DELEGATES = [
  'ingredientMatchesItem',
  'toolMatchesItem',
  'toolMatchesItemByIdentity',
  '_matchesTagIngredient',
  '_matchesIngredient',
  '_buildIngredientStates',
  '_buildIngredientChoices',
  '_displayGroups',
  '_chosenOptionByGroup',
  '_resolveIngredientVisual',
  '_resolveGroupDescription',
  '_validateRecipeForPersistence',
  '_validateRecipeForActivation',
  '_validateEssenceReferences',
  '_validateEnabledEssenceReferences',
  '_validateTagPlaceholders',
];

test('every cited member and retained delegate still resolves on a constructed manager', () => {
  const manager = new RecipeManager();
  for (const name of new Set([...CITED_MEMBERS, ...DELEGATES])) {
    assert.equal(typeof manager[name], 'function', `${name} is a member of RecipeManager`);
  }
});

test('the two transplanted tool matchers stay ordinary prototype methods', () => {
  // `tool-surface-resolution` lifts both off an instance with `.bind` onto a CraftingSystemManager;
  // a class field or a static would not be there to lift.
  for (const name of ['toolMatchesItem', 'toolMatchesItemByIdentity']) {
    assert.ok(Object.hasOwn(RecipeManager.prototype, name), `${name} is on the prototype`);
    assert.equal(Object.hasOwn(new RecipeManager(), name), false, `${name} is not a class field`);
  }
});

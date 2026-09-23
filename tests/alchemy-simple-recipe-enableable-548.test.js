/** Regression guard for issue 548 — "new Simple alchemy recipe cannot be enabled". */

import test from 'node:test';
import assert from 'node:assert/strict';

// Foundry globals (the Recipe model calls foundry.utils.randomID on normalize)
globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` },
};
globalThis.game = { user: { name: 'GM' } };

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { Recipe } = await import('../src/models/Recipe.js');

const SYSTEM_ID = 'alchemy-sys';

/**
 * A crafting system in alchemy mode with the DEFAULT check mode (`none`) a system is seeded with
 * when it switches to alchemy — the configuration under which #548 was reported.
 */
function buildAlchemySystem(overrides = {}) {
  return {
    id: SYSTEM_ID,
    resolutionMode: 'alchemy',
    alchemy: { checkMode: 'none' },
    craftingCheck: { enabled: false },
    components: [],
    ...overrides,
  };
}

function buildService(system) {
  return new ResolutionModeService({
    getSystem: (id) => (id === system.id ? system : null),
  });
}

/**
 * Build a REAL {@link Recipe} authored with the minimal content the alchemy activation gate
 * requires: exactly one ingredient set and one success result group.
 */
function buildProviderlessAlchemyRecipe(extra = {}) {
  return new Recipe({
    id: 'mana-potion',
    name: 'Mana Potion',
    craftingSystemId: SYSTEM_ID,
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [
          { id: 'g-1', options: [{ match: { type: 'component', componentId: 'c1' } }] },
        ],
      },
    ],
    resultGroups: [{ id: 'rg-1', name: 'Brew', results: [] }],
    ...extra,
  });
}

// Guard 1 — the core #548 acceptance: enable-able WITHOUT any provider.

test('issue 548 (resolved by 554): a provider-less authored Simple alchemy recipe passes the activation gate', () => {
  const service = buildService(buildAlchemySystem());
  const recipe = buildProviderlessAlchemyRecipe();

  // The model must not manufacture a provider on its own.
  assert.equal(recipe.resultSelection, null, 'a new alchemy recipe carries no resultSelection');

  // This is the exact predicate the enable path runs (requireComplete: true).
  const activation = service.validateRecipe(recipe, { requireComplete: true });
  assert.deepEqual(
    activation,
    { valid: true, errors: [], issues: [] },
    `authored provider-less Simple alchemy recipe must be enable-able, got: ${JSON.stringify(activation)}`
  );
  assert.ok(
    !activation.errors.some((e) => /resultSelection\.provider/i.test(e)),
    'the retired resultSelection.provider must never gate activation again'
  );
});

// Guard 2 — duplication (adminStore.duplicateRecipe) must not propagate an invalid state: the copy
// is likewise enable-able and stays provider-less.

test('issue 548: duplicating a provider-less Simple alchemy recipe yields an equally enable-able copy', () => {
  const service = buildService(buildAlchemySystem());
  const original = buildProviderlessAlchemyRecipe();

  // Mirror adminStore.duplicateRecipe: toJSON(), drop the id, rename, re-create.
  const data = original.toJSON();
  delete data.id;
  data.name = `${data.name} (Copy)`;
  const copy = new Recipe(data);

  assert.equal(copy.resultSelection, null, 'the duplicate does not gain a provider');
  const activation = service.validateRecipe(copy, { requireComplete: true });
  assert.deepEqual(
    activation,
    { valid: true, errors: [], issues: [] },
    `the duplicate must be enable-able, got: ${JSON.stringify(activation)}`
  );
});

// Guard 3 — a stray/legacy resultSelection.provider is IGNORED at activation (the retirement
// contract, pinned from the activation angle to complement resolution-mode-validation.test.js which
// pins it at the service layer).

test('issue 548 (554 retirement): a leftover resultSelection.provider does not gate activation', () => {
  const service = buildService(buildAlchemySystem());
  // A legacy recipe still carrying a stray provider before migration strips it.
  const recipe = buildProviderlessAlchemyRecipe({
    resultSelection: { provider: 'ingredientSet' },
  });

  const activation = service.validateRecipe(recipe, { requireComplete: true });
  assert.deepEqual(
    activation,
    { valid: true, errors: [], issues: [] },
    `a stray provider must be inert, got: ${JSON.stringify(activation)}`
  );

  // And it round-trips through duplication without ever producing an invalid state.
  const data = recipe.toJSON();
  delete data.id;
  const copy = new Recipe(data);
  const copyActivation = service.validateRecipe(copy, { requireComplete: true });
  assert.equal(
    copyActivation.valid,
    true,
    `a duplicated stray-provider recipe stays enable-able, got: ${JSON.stringify(copyActivation)}`
  );
});

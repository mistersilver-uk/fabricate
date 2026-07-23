// Normalizer tests for the crafting check-modifier catalogue (system) and the
// per-recipe `craftingModifier` override (Recipe model) — issue 770.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ── system catalogue normalizer ──────────────────────────────────────────────

test('_normalizeCraftingCheck defaults an absent catalogue to empty + addAll (back-compat)', () => {
  const result = makeManager()._normalizeCraftingCheck({});
  assert.deepEqual(result.checkModifiers, []);
  assert.equal(result.defaultModifierPolicy, 'addAll');
  assert.deepEqual(result.defaultModifierIds, []);
});

test('_normalizeCraftingCheck normalizes catalogue entries, dropping malformed ones', () => {
  const result = makeManager()._normalizeCraftingCheck({
    checkModifiers: [
      { id: 'med', label: 'Medicine', expression: '  @abilities.med.mod  ', icon: 'fas fa-staff' },
      { id: '', label: 'no id', expression: '@x' },
      { label: 'missing id', expression: '@y' },
      { id: 'med', label: 'dup id', expression: '@dup' },
      { id: 'bad', label: 3, expression: 42 },
      'not an object',
    ],
  });
  assert.deepEqual(result.checkModifiers, [
    { id: 'med', label: 'Medicine', expression: '@abilities.med.mod', icon: 'fas fa-staff' },
    { id: 'bad', label: '', expression: '' },
  ]);
});

test('_normalizeCraftingCheck keeps only known policies + catalogue-valid default ids', () => {
  const result = makeManager()._normalizeCraftingCheck({
    checkModifiers: [
      { id: 'med', label: 'Medicine', expression: '@med' },
      { id: 'alch', label: 'Alchemy', expression: '@alch' },
    ],
    defaultModifierPolicy: 'highest',
    defaultModifierIds: ['med', 'ghost', 'alch', 'med'],
  });
  assert.equal(result.defaultModifierPolicy, 'highest');
  assert.deepEqual(result.defaultModifierIds, ['med', 'alch'], 'unknown + duplicate dropped');
});

test('_normalizeCraftingCheck accepts the Phase-2 playerPicks policy', () => {
  assert.equal(
    makeManager()._normalizeCraftingCheck({ defaultModifierPolicy: 'playerPicks' })
      .defaultModifierPolicy,
    'playerPicks'
  );
});

test('_normalizeCraftingCheck coerces a genuinely unknown policy to addAll', () => {
  assert.equal(
    makeManager()._normalizeCraftingCheck({ defaultModifierPolicy: 'bogus' }).defaultModifierPolicy,
    'addAll'
  );
});

test('_normalizeCraftingCheck preserves sibling check fields alongside the catalogue', () => {
  const result = makeManager()._normalizeCraftingCheck({
    simple: { rollFormula: '1d20 + @craftingmod', dc: 12 },
    checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
  });
  assert.equal(result.simple.rollFormula, '1d20 + @craftingmod');
  assert.equal(result.simple.dc, 12);
  assert.equal(result.checkModifiers.length, 1);
});

// ── recipe override normalizer ───────────────────────────────────────────────

test('Recipe.craftingModifier defaults to null (inherit) when absent or malformed', () => {
  assert.equal(new Recipe({ name: 'r' }).craftingModifier, null);
  assert.equal(new Recipe({ name: 'r', craftingModifier: 'nope' }).craftingModifier, null);
  assert.equal(new Recipe({ name: 'r', craftingModifier: {} }).craftingModifier, null);
  assert.equal(
    new Recipe({ name: 'r', craftingModifier: { policy: 'bogus', modifierIds: [] } })
      .craftingModifier,
    null,
    'no valid policy and no ids → inherit'
  );
});

test('Recipe.craftingModifier keeps a valid policy and de-duplicated id subset', () => {
  const recipe = new Recipe({
    name: 'r',
    craftingModifier: { policy: 'byRecipe', modifierIds: ['alch', 'alch', '', 3, 'herb'] },
  });
  assert.deepEqual(recipe.craftingModifier, { policy: 'byRecipe', modifierIds: ['alch', 'herb'] });
});

test('Recipe.craftingModifier accepts the Phase-2 playerPicks policy', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { policy: 'playerPicks', modifierIds: ['med'] } })
      .craftingModifier,
    { policy: 'playerPicks', modifierIds: ['med'] }
  );
});

test('Recipe.craftingModifier allows a policy-only or ids-only override', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { policy: 'highest' } }).craftingModifier,
    {
      policy: 'highest',
    }
  );
  assert.deepEqual(
    new Recipe({ name: 'r', craftingModifier: { modifierIds: ['med'] } }).craftingModifier,
    { modifierIds: ['med'] }
  );
});

test('Recipe.craftingModifier round-trips through toJSON', () => {
  const recipe = new Recipe({
    name: 'r',
    craftingModifier: { policy: 'addAll', modifierIds: ['med'] },
  });
  const restored = Recipe.fromJSON(recipe.toJSON());
  assert.deepEqual(restored.craftingModifier, { policy: 'addAll', modifierIds: ['med'] });
});

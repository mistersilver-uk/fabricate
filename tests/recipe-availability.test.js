import test from 'node:test';
import assert from 'node:assert/strict';

const {
  RECIPE_AVAILABILITY_STATES,
  applyRecipeAvailabilityState,
  getRecipeAvailabilityFlags,
  getRecipeAvailabilityState
} = await import('../src/ui/recipeAvailability.js');

test('getRecipeAvailabilityState returns enabled by default', () => {
  assert.equal(
    getRecipeAvailabilityState({ enabled: true, locked: false }),
    RECIPE_AVAILABILITY_STATES.ENABLED
  );
});

test('getRecipeAvailabilityState returns disabled when enabled is false', () => {
  assert.equal(
    getRecipeAvailabilityState({ enabled: false, locked: false }),
    RECIPE_AVAILABILITY_STATES.DISABLED
  );
});

test('getRecipeAvailabilityState treats enabled=false and locked=true as disabled', () => {
  assert.equal(
    getRecipeAvailabilityState({ enabled: false, locked: true }),
    RECIPE_AVAILABILITY_STATES.DISABLED
  );
});

test('getRecipeAvailabilityState returns locked when enabled and locked are both true', () => {
  assert.equal(
    getRecipeAvailabilityState({ enabled: true, locked: true }),
    RECIPE_AVAILABILITY_STATES.LOCKED
  );
});

test('getRecipeAvailabilityFlags maps disabled to enabled=false and locked=false', () => {
  assert.deepEqual(
    getRecipeAvailabilityFlags(RECIPE_AVAILABILITY_STATES.DISABLED),
    { enabled: false, locked: false }
  );
});

test('getRecipeAvailabilityFlags maps locked to enabled=true and locked=true', () => {
  assert.deepEqual(
    getRecipeAvailabilityFlags(RECIPE_AVAILABILITY_STATES.LOCKED),
    { enabled: true, locked: true }
  );
});

test('applyRecipeAvailabilityState mutates the target with normalized flags', () => {
  const recipe = { enabled: false, locked: true };
  const result = applyRecipeAvailabilityState(recipe, RECIPE_AVAILABILITY_STATES.ENABLED);

  assert.equal(result, recipe);
  assert.deepEqual(recipe, { enabled: true, locked: false });
});

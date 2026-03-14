/**
 * #150: GM-only app registrations (RecipeManagerApp, RecipeEditorApp) must not
 * be eagerly loaded for non-GM players. This file tests the appFactory registry
 * contract that underpins the lazy-load approach.
 *
 * The registry starts unset; getters throw until the respective register*()
 * call runs (which only happens after a conditional dynamic import for GMs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Import fresh registry functions without any side-effect registrations.
const {
  registerSvelteRecipeManagerApp,
  registerSvelteRecipeEditorApp,
  getRecipeManagerAppClass,
  getRecipeEditorAppClass
} = await import('../src/ui/appFactory.js');

test('getRecipeManagerAppClass throws when not yet registered', () => {
  assert.throws(
    () => getRecipeManagerAppClass(),
    /SvelteRecipeManagerApp not registered/
  );
});

test('getRecipeEditorAppClass throws when not yet registered', () => {
  assert.throws(
    () => getRecipeEditorAppClass(),
    /SvelteRecipeEditorApp not registered/
  );
});

test('getRecipeManagerAppClass returns the class after registration', () => {
  class FakeRecipeManagerApp {}
  registerSvelteRecipeManagerApp(FakeRecipeManagerApp);
  assert.strictEqual(getRecipeManagerAppClass(), FakeRecipeManagerApp);
});

test('getRecipeEditorAppClass returns the class after registration', () => {
  class FakeRecipeEditorApp {}
  registerSvelteRecipeEditorApp(FakeRecipeEditorApp);
  assert.strictEqual(getRecipeEditorAppClass(), FakeRecipeEditorApp);
});

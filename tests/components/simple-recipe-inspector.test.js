/**
 * Source-contract tests for the V2 SimpleRecipeInspector component.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/actor-app/SimpleRecipeInspector.svelte'),
  'utf8'
);

test('SimpleRecipeInspector: shows empty hint when recipe is null', () => {
  assert.ok(source.includes('FABRICATE.ActorApp.Crafting.SelectRecipeHint'));
  assert.ok(source.includes('simple-inspector__empty'));
});

test('SimpleRecipeInspector: renders requirement, essence, and catalyst sections only when present', () => {
  assert.ok(source.includes('recipe.ingredients?.length > 0'));
  assert.ok(source.includes('recipe.essences?.length > 0'));
  assert.ok(source.includes('recipe.catalysts?.length > 0'));
});

test('SimpleRecipeInspector: distinguishes satisfied / unsatisfied rows by class', () => {
  assert.ok(source.match(/class:satisfied=\{[^}]+\}/));
  assert.ok(source.match(/class:unsatisfied=\{[^}]+\}/));
});

test('SimpleRecipeInspector: renders active-run section only when recipe has step or remaining time', () => {
  assert.ok(
    source.includes('recipe.activeRunStepLabel || recipe.activeRunRemainingSeconds > 0'),
    'should gate active-run section on the prepared run-summary fields'
  );
});

test('SimpleRecipeInspector: primary action button switches between Learn and Craft based on canLearn', () => {
  assert.ok(source.includes('recipe.canLearn'));
  assert.ok(source.includes('FABRICATE.RecipeCard.Learn'));
  assert.ok(source.includes('recipe.craftButtonLabel'));
});

test('SimpleRecipeInspector: respects teaser by disabling the Add-to-List action', () => {
  assert.ok(source.includes('disabled={recipe.isTeaser}'));
});

test('SimpleRecipeInspector: scoped CSS uses --fab-* tokens', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  const scoped = styleMatch[1];
  assert.ok(scoped.includes('var(--fab-accent)'), 'must use --fab-accent for primary action');
  assert.ok(!scoped.includes('--fabricate-primary'), 'must not reference the legacy --fabricate-primary token');
});

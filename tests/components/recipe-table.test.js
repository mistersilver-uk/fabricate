/**
 * Source-contract tests for the V2 RecipeTable component.
 * Replaces the legacy RecipeCard tests after the actor-crafting-app-v2 rewrite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/actor-app/RecipeTable.svelte'),
  'utf8'
);

test('RecipeTable: declares the table-style header row with V2 column labels', () => {
  assert.ok(source.includes('class="recipe-table__head"'));
  assert.ok(source.includes('FABRICATE.ActorApp.Crafting.ColumnRecipe'));
  assert.ok(source.includes('FABRICATE.ActorApp.Crafting.ColumnStatus'));
  assert.ok(source.includes('FABRICATE.ActorApp.Crafting.ColumnRequirements'));
  assert.ok(source.includes('FABRICATE.ActorApp.Crafting.ColumnResult'));
  assert.ok(source.includes('FABRICATE.ActorApp.Crafting.ColumnActions'));
});

test('RecipeTable: row click selects via onSelectRecipe', () => {
  assert.ok(source.includes('onclick={() => selectRow(recipe.id)}'));
  assert.ok(source.includes('onkeydown={(e) => selectRowFromKeyboard(e, recipe.id)}'));
});

test('RecipeTable: selected row uses --fab-accent visual treatment', () => {
  assert.ok(source.includes('recipe-table__row--selected'));
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch);
  const scoped = styleMatch[1];
  assert.ok(scoped.includes('var(--fab-accent-soft)'));
  assert.ok(scoped.includes('inset 3px 0 0 var(--fab-accent)'));
});

test('RecipeTable: scoped CSS uses container queries, not viewport @media', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  const scoped = styleMatch[1];
  assert.ok(!scoped.match(/@media\s*\(/), 'must not use viewport @media queries');
  assert.ok(scoped.includes('@container actor-app'), 'must use container queries');
});

test('RecipeTable: row action buttons stop propagation so they do not also select the row', () => {
  // The row click selects; action buttons must call event.stopPropagation()
  // before invoking their own callbacks.
  const actionStops = (source.match(/event\.stopPropagation\(\)/g) ?? []).length;
  assert.ok(actionStops >= 3, `expected at least 3 stopPropagation calls in row actions, got ${actionStops}`);
});

test('RecipeTable: respects teaser flag visually', () => {
  assert.ok(source.includes('recipe-table__row--teaser'));
  assert.ok(source.includes('recipe.isTeaser'));
});

test('RecipeTable: renders Add to List action wired to onAddToShoppingList', () => {
  assert.ok(source.includes('onAddToShoppingList(recipe.id, 1)'));
  assert.ok(source.includes('FABRICATE.ShoppingList.AddToList'));
});

test('RecipeTable: renders Favourite toggle wired to onToggleFavourite', () => {
  assert.ok(source.includes('onToggleFavourite(recipe.id)'));
});

test('RecipeTable: primary craft button uses recipe.allowCraftAction gate', () => {
  assert.ok(source.includes('disabled={!recipe.allowCraftAction}'));
  assert.ok(source.includes('recipe.craftButtonLabel'));
});

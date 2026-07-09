/**
 * Tests for the 1.13.0 migration that inverts the recipe ↔ recipe-item link:
 * membership moves from `recipe.recipeItemId` / `linkedRecipeItemUuid` onto each
 * definition's `recipeIds[]` (many-to-many), and the recipe-side fields are stripped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateInvertRecipeItemLink } from '../src/migration/migrateInvertRecipeItemLink.js';

function fixture() {
  return {
    systems: [
      {
        id: 'sys-1',
        recipeItemDefinitions: [
          { id: 'book-1', sourceItemUuid: 'Compendium.world.items.book-1' },
          { id: 'book-2', sourceItemUuid: 'Compendium.world.items.book-2' },
        ],
      },
    ],
    recipes: [
      { id: 'r1', craftingSystemId: 'sys-1', recipeItemId: 'book-1' },
      // Legacy uuid link (no recipeItemId) resolves via sourceItemUuid.
      { id: 'r2', craftingSystemId: 'sys-1', linkedRecipeItemUuid: 'Compendium.world.items.book-2' },
      // Unlinked recipe.
      { id: 'r3', craftingSystemId: 'sys-1' },
      // A standalone alchemy formula item — linkedRecipeItemUuid points at an item that
      // is NOT a recipe-item definition, so it must be preserved (not book membership).
      { id: 'r4', craftingSystemId: 'sys-1', linkedRecipeItemUuid: 'Compendium.world.items.formula-x' },
    ],
  };
}

test('moves book membership onto definition.recipeIds and strips book-only reverse refs', () => {
  const out = migrateInvertRecipeItemLink(fixture());
  const defs = out.systems[0].recipeItemDefinitions;
  const byId = (id) => out.recipes.find((r) => r.id === id);

  assert.deepEqual(defs.find((d) => d.id === 'book-1').recipeIds, ['r1']);
  assert.deepEqual(defs.find((d) => d.id === 'book-2').recipeIds, ['r2']);

  // Book-linked recipes lose both reverse refs.
  assert.equal('recipeItemId' in byId('r1'), false);
  assert.equal('linkedRecipeItemUuid' in byId('r2'), false);
  // The standalone formula link is PRESERVED (not book membership).
  assert.equal(byId('r4').linkedRecipeItemUuid, 'Compendium.world.items.formula-x');
});

test('a recipe with BOTH a book recipeItemId AND a separate alchemy formula link keeps the formula link', () => {
  // Regression: `resolvedToBook` must not be set by the recipeItemId path and then
  // strip an unrelated linkedRecipeItemUuid (a standalone alchemy formula item). The
  // formula link points at an item that is NOT a recipe-item definition, so it survives.
  const data = {
    systems: [
      {
        id: 'sys-1',
        recipeItemDefinitions: [{ id: 'book-1', sourceItemUuid: 'Compendium.world.items.book-1' }],
      },
    ],
    recipes: [
      {
        id: 'r1',
        craftingSystemId: 'sys-1',
        recipeItemId: 'book-1',
        linkedRecipeItemUuid: 'Compendium.world.items.formula-x',
      },
    ],
  };
  const out = migrateInvertRecipeItemLink(data);
  assert.deepEqual(out.systems[0].recipeItemDefinitions[0].recipeIds, ['r1'], 'book membership recorded');
  assert.equal('recipeItemId' in out.recipes[0], false, 'book-only reverse ref stripped');
  assert.equal(
    out.recipes[0].linkedRecipeItemUuid,
    'Compendium.world.items.formula-x',
    'the separate alchemy formula link is NOT destroyed'
  );
});

test('does not mutate the input payload', () => {
  const input = fixture();
  migrateInvertRecipeItemLink(input);
  assert.equal(input.recipes[0].recipeItemId, 'book-1', 'input recipe untouched (cloned)');
  assert.equal(input.systems[0].recipeItemDefinitions[0].recipeIds, undefined);
});

test('is idempotent — a second pass adds nothing and re-strips nothing', () => {
  const first = migrateInvertRecipeItemLink(fixture());
  const second = migrateInvertRecipeItemLink(first);

  assert.deepEqual(
    second.systems[0].recipeItemDefinitions.find((d) => d.id === 'book-1').recipeIds,
    ['r1']
  );
  assert.deepEqual(
    second.systems[0].recipeItemDefinitions.find((d) => d.id === 'book-2').recipeIds,
    ['r2']
  );
});

test('a recipe may already be a member of multiple books (dedup, no duplication)', () => {
  const data = {
    systems: [
      {
        id: 'sys-1',
        recipeItemDefinitions: [{ id: 'book-1', sourceItemUuid: 'u1', recipeIds: ['r1'] }],
      },
    ],
    recipes: [{ id: 'r1', craftingSystemId: 'sys-1', recipeItemId: 'book-1' }],
  };
  const out = migrateInvertRecipeItemLink(data);
  assert.deepEqual(out.systems[0].recipeItemDefinitions[0].recipeIds, ['r1']);
});

test('passes through non-array payloads untouched', () => {
  assert.deepEqual(migrateInvertRecipeItemLink({}), { systems: undefined, recipes: undefined });
});

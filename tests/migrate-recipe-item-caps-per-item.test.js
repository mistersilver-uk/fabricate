/**
 * Tests for the 1.11.0 migration
 * (src/migration/migrateRecipeItemCapsPerItem.js): seeding each recipe item
 * definition's per-item `caps` from the old system-wide
 * `recipeVisibility.knowledge.item` / `.learn`, stripping the relocated fields
 * (while keeping `mode` + `learn.dragDropEnabled`), idempotency, empty-array
 * safety, purity, and a `_normalizeSystem` round-trip.
 *
 * node:test + node:assert/strict. Pure function; Foundry globals only for the
 * normalizer round-trip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateRecipeItemCapsPerItem } from '../src/migration/migrateRecipeItemCapsPerItem.js';

let idCounter = 0;
globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => `id-${++idCounter}` },
};

function cappedSystem(id = 'sys-1') {
  return {
    id,
    name: 'Alchemy',
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true },
        learn: {
          consumeOnLearn: false,
          dragDropEnabled: true,
          limitRecipes: true,
          maxRecipes: 2,
          destroyWhenSpent: true,
        },
      },
    },
    recipeItemDefinitions: [
      { id: 'book-1', name: 'Book One', sourceItemUuid: 'Compendium.w.f.b1' },
      { id: 'book-2', name: 'Book Two', sourceItemUuid: 'Compendium.w.f.b2' },
    ],
  };
}

test('seeds every recipe item definition with the old system-wide caps', () => {
  const out = migrateRecipeItemCapsPerItem({ systems: [cappedSystem()] });
  const [b1, b2] = out.systems[0].recipeItemDefinitions;

  const expected = {
    item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true },
    learn: { consumeOnLearn: false, limitRecipes: true, maxRecipes: 2, destroyWhenSpent: true },
  };
  assert.deepEqual(b1.caps, expected);
  assert.deepEqual(b2.caps, expected);
  // Independent objects, not a shared reference.
  assert.notEqual(b1.caps, b2.caps);
});

test('strips the relocated cap fields but keeps mode + dragDropEnabled', () => {
  const out = migrateRecipeItemCapsPerItem({ systems: [cappedSystem()] });
  const knowledge = out.systems[0].recipeVisibility.knowledge;

  assert.equal('item' in knowledge, false);
  assert.equal(knowledge.mode, 'itemOrLearned');
  assert.equal(knowledge.learn.dragDropEnabled, true);
  for (const field of ['consumeOnLearn', 'limitRecipes', 'maxRecipes', 'destroyWhenSpent']) {
    assert.equal(field in knowledge.learn, false, `${field} should be stripped`);
  }
});

test('an uncapped system seeds uncapped caps', () => {
  const system = {
    id: 'sys-u',
    name: 'Uncapped',
    recipeVisibility: { listMode: 'global', knowledge: { mode: 'item' } },
    recipeItemDefinitions: [{ id: 'book-1', sourceItemUuid: 'Compendium.w.f.b1' }],
  };
  const out = migrateRecipeItemCapsPerItem({ systems: [system] });

  assert.deepEqual(out.systems[0].recipeItemDefinitions[0].caps, {
    item: { limitUses: false, maxUses: undefined, destroyWhenExhausted: false },
    learn: {
      consumeOnLearn: true,
      limitRecipes: false,
      maxRecipes: undefined,
      destroyWhenSpent: false,
    },
  });
});

test('is idempotent — a second run leaves already-seeded caps untouched', () => {
  const first = migrateRecipeItemCapsPerItem({ systems: [cappedSystem()] });
  const second = migrateRecipeItemCapsPerItem({ systems: first.systems });

  assert.deepEqual(second.systems[0].recipeItemDefinitions[0].caps, {
    item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true },
    learn: { consumeOnLearn: false, limitRecipes: true, maxRecipes: 2, destroyWhenSpent: true },
  });
  assert.equal('item' in second.systems[0].recipeVisibility.knowledge, false);
});

test('is pure — does not mutate the input systems', () => {
  const input = cappedSystem();
  migrateRecipeItemCapsPerItem({ systems: [input] });
  assert.equal(input.recipeItemDefinitions[0].caps, undefined);
  assert.equal('item' in input.recipeVisibility.knowledge, true);
});

test('handles systems with no recipe items and missing config safely', () => {
  const systems = [
    { id: 'a', name: 'No defs, no config' },
    { id: 'b', name: 'Empty defs', recipeItemDefinitions: [] },
    { id: 'c', name: 'Config, no defs', recipeVisibility: { knowledge: { mode: 'item', item: { limitUses: true, maxUses: 1 } } } },
  ];
  const out = migrateRecipeItemCapsPerItem({ systems });
  assert.equal(out.systems.length, 3);
  // The relocated fields are still stripped from a defs-less system's config.
  assert.equal('item' in out.systems[2].recipeVisibility.knowledge, false);
});

test('returns the original value when systems is not an array', () => {
  assert.deepEqual(migrateRecipeItemCapsPerItem({ systems: undefined }), { systems: undefined });
  assert.deepEqual(migrateRecipeItemCapsPerItem({}), { systems: undefined });
});

test('seeded caps survive a _normalizeSystem round-trip', async () => {
  const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const out = migrateRecipeItemCapsPerItem({ systems: [cappedSystem()] });
  const normalized = manager._normalizeSystem(out.systems[0]);

  assert.deepEqual(normalized.recipeItemDefinitions[0].caps, {
    item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true, whenSpent: 'destroyed' },
    learn: {
      consumeOnLearn: false,
      limitRecipes: true,
      limitLearning: true,
      maxRecipes: 2,
      learnsAllowed: 2,
      // A legacy per-document cap maps to the per-copy scope; maxRecipes 2 (> 1) keeps
      // the legacy 'ntimes' learning-mode mirror.
      learnScope: 'perInstance',
      learningMode: 'ntimes',
      prerequisite: null,
      destroyWhenSpent: true,
    },
  });
});

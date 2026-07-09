import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeItemPreviewRow } from '../../src/ui/svelte/util/recipeItemPreviewRow.js';
import { DEFAULT_CRAFTING_IMAGE } from '../../src/ui/svelte/util/craftingImageDefaults.js';

// The exact set of top-level keys `InventoryListingBuilder._buildRecipeItemRows`
// emits (the contract `InventoryDetail` reads). Kept in lockstep with
// tests/inventory-listing-builder.test.js.
const EXPECTED_KEYS = [
  'key',
  'recipeItemId',
  'componentId',
  'systemId',
  'systemName',
  'name',
  'img',
  'icon',
  'description',
  'tags',
  'tier',
  'isEssenceSource',
  'isTool',
  'isRecipeItem',
  'learnable',
  'craftable',
  'totalQuantity',
  'sources',
  'essences',
  'usedBy',
  'requiredFor',
  'producedBy',
  'contributors',
  'recipes',
  'requirements',
  'caps',
  'limits',
];

function knowledgeRow(overrides = {}) {
  return buildRecipeItemPreviewRow({
    key: 'recipeitem:preview:book-1',
    name: 'Spellbook',
    img: 'icons/book.webp',
    description: 'A tome.',
    mode: 'knowledge',
    caps: { item: {}, learn: { limitLearning: true, learnsAllowed: 3, learnScope: 'perInstance' } },
    recipes: [{ id: 'r1', name: 'Fireball', img: 'icons/fb.webp' }],
    requirements: [
      { id: 'r-known', kind: 'knowledge', name: 'Cantrip', icon: 'fas fa-scroll', met: true },
      { id: 'p1', kind: 'character', name: 'Expert', icon: 'fas fa-hat-wizard', met: true },
    ],
    ...overrides,
  });
}

test('buildRecipeItemPreviewRow emits exactly the builder row keys', () => {
  const row = knowledgeRow();
  assert.deepEqual(Object.keys(row).sort(), [...EXPECTED_KEYS].sort());
  assert.equal(row.isRecipeItem, true);
  // Superset-safe empty fields InventoryDetail may read.
  assert.deepEqual(row.sources, []);
  assert.deepEqual(row.essences, []);
  assert.deepEqual(row.limits, { uses: null, learning: null });
});

test('knowledge mode ⇒ learnable, caps.learn applicable, caps.item suppressed', () => {
  const row = knowledgeRow();
  assert.equal(row.learnable, true);
  assert.equal(row.craftable, false);
  assert.deepEqual(row.caps.item, { limitUses: false });
  assert.equal(row.caps.learn.limitLearning, true);
  assert.equal(row.caps.learn.learnsAllowed, 3);
  assert.equal(row.caps.learn.learnScope, 'perInstance');
});

test('item mode ⇒ craftable, caps.item applicable, no requirements even with prereq ids', () => {
  const row = buildRecipeItemPreviewRow({
    key: 'k',
    mode: 'item',
    caps: { item: { limitUses: true, maxUses: 3 }, learn: { limitLearning: true } },
    recipes: [{ id: 'r1', name: 'Forge' }],
    requirements: [
      { id: 'r-known', kind: 'knowledge', name: 'Cantrip', icon: 'fas fa-scroll', met: false },
    ],
  });
  assert.equal(row.learnable, false);
  assert.equal(row.craftable, true);
  assert.deepEqual(row.caps.item, { limitUses: true, maxUses: 3 });
  assert.deepEqual(row.caps.learn, { limitLearning: false });
  assert.deepEqual(row.requirements, [], 'item-mode books surface no learning requirements');
  assert.ok(
    row.recipes.every((r) => r.learnBlocked === false),
    'item-mode recipes are never learn-blocked'
  );
});

test('limitLearning off ⇒ requirements dropped and not blocked', () => {
  const row = knowledgeRow({
    caps: { item: {}, learn: { limitLearning: false } },
    requirements: [
      { id: 'r-known', kind: 'knowledge', name: 'Cantrip', icon: 'fas fa-scroll', met: false },
    ],
  });
  assert.deepEqual(row.requirements, []);
  assert.ok(row.recipes.every((r) => r.learnBlocked === false));
  assert.equal(row.caps.learn.limitLearning, false);
});

test('all requirements met ⇒ not blocked; recipes carry the requirement shape', () => {
  const row = knowledgeRow();
  assert.equal(row.requirements.length, 2);
  assert.ok(
    row.recipes.every((r) => r.learnBlocked === false),
    'not blocked when all met'
  );
  assert.equal(row.recipes[0].learnBlockedReason, '');
  assert.deepEqual(Object.keys(row.recipes[0]).sort(), [
    'description',
    'id',
    'img',
    'learnBlocked',
    'learnBlockedReason',
    'learned',
    'name',
  ]);
  assert.equal(row.recipes[0].learned, false);
});

test('an unmet requirement ⇒ blocked with reason listing ONLY the unmet names', () => {
  const row = knowledgeRow({
    requirements: [
      { id: 'r-known', kind: 'knowledge', name: 'Cantrip', icon: 'fas fa-scroll', met: true },
      { id: 'r-missing', kind: 'knowledge', name: 'Ritual', icon: 'fas fa-scroll', met: false },
      {
        id: 'p-fail',
        kind: 'character',
        name: 'Master Only',
        icon: 'fas fa-hat-wizard',
        met: false,
      },
    ],
  });
  assert.ok(
    row.recipes.every((r) => r.learnBlocked === true),
    'blocked when any requirement is unmet'
  );
  assert.equal(row.recipes[0].learnBlockedReason, 'Ritual, Master Only');
});

test('recipe images resolve the generic bag / empty to the blueprint, real paths pass through (issue 544)', () => {
  const row = buildRecipeItemPreviewRow({
    key: 'k',
    mode: 'knowledge',
    caps: { item: {}, learn: { limitLearning: true } },
    recipes: [
      { id: 'bag', name: 'Forge Club', img: 'icons/svg/item-bag.svg' },
      { id: 'empty', name: 'Forge Handaxe', img: '' },
      { id: 'none', name: 'Forge Spear' },
      { id: 'real', name: 'Alloy Bronze', img: 'icons/tools/smithing/anvil.webp' },
    ],
    requirements: [],
  });
  const byId = Object.fromEntries(row.recipes.map((r) => [r.id, r.img]));
  assert.equal(
    byId.bag,
    DEFAULT_CRAFTING_IMAGE,
    'the generic item-bag falls back to the blueprint'
  );
  assert.equal(byId.empty, DEFAULT_CRAFTING_IMAGE, 'an empty image falls back to the blueprint');
  assert.equal(byId.none, DEFAULT_CRAFTING_IMAGE, 'a missing image falls back to the blueprint');
  assert.equal(byId.real, 'icons/tools/smithing/anvil.webp', 'a real authored path is preserved');
});

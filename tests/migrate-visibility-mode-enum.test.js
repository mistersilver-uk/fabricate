/**
 * Tests for the 1.12.0 migration
 * (src/migration/migrateVisibilityModeEnum.js): deriving the flat
 * `visibilityMode` enum from the legacy `recipeVisibility.listMode` +
 * `knowledge.mode` pair, idempotency, purity, non-array safety, and a
 * `_normalizeSystem` round-trip.
 *
 * node:test + node:assert/strict. Pure function; Foundry globals only for the
 * normalizer round-trip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateVisibilityModeEnum } from '../src/migration/migrateVisibilityModeEnum.js';

let idCounter = 0;
globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => `id-${++idCounter}` },
};

function systemWith(recipeVisibility) {
  return { id: 'sys-1', name: 'Alchemy', recipeVisibility };
}

function derive(recipeVisibility) {
  const out = migrateVisibilityModeEnum({ systems: [systemWith(recipeVisibility)] });
  return out.systems[0].visibilityMode;
}

test('listMode global → global', () => {
  assert.equal(derive({ listMode: 'global' }), 'global');
});

test('listMode player → restricted', () => {
  assert.equal(derive({ listMode: 'player' }), 'restricted');
});

test('listMode teaser → global (teaserConfig untouched)', () => {
  const system = { id: 's', recipeVisibility: { listMode: 'teaser' }, teaserConfig: { enabled: true, fragments: [{ id: 'f1' }] } };
  const out = migrateVisibilityModeEnum({ systems: [system] });
  assert.equal(out.systems[0].visibilityMode, 'global');
  assert.deepEqual(out.systems[0].teaserConfig, { enabled: true, fragments: [{ id: 'f1' }] });
});

test('listMode knowledge + mode item → item', () => {
  assert.equal(derive({ listMode: 'knowledge', knowledge: { mode: 'item' } }), 'item');
});

test('listMode knowledge + mode learned → knowledge', () => {
  assert.equal(derive({ listMode: 'knowledge', knowledge: { mode: 'learned' } }), 'knowledge');
});

test('listMode knowledge + mode itemOrLearned → knowledge', () => {
  assert.equal(derive({ listMode: 'knowledge', knowledge: { mode: 'itemOrLearned' } }), 'knowledge');
});

test('listMode knowledge with missing/invalid mode → knowledge', () => {
  assert.equal(derive({ listMode: 'knowledge' }), 'knowledge');
  assert.equal(derive({ listMode: 'knowledge', knowledge: { mode: 'bogus' } }), 'knowledge');
});

test('absent recipeVisibility → knowledge', () => {
  assert.equal(derive(undefined), 'knowledge');
  const out = migrateVisibilityModeEnum({ systems: [{ id: 's' }] });
  assert.equal(out.systems[0].visibilityMode, 'knowledge');
});

test('invalid listMode → knowledge', () => {
  assert.equal(derive({ listMode: 'nonsense' }), 'knowledge');
  assert.equal(derive({}), 'knowledge');
});

test('is idempotent — a second run leaves an already-set visibilityMode untouched', () => {
  const first = migrateVisibilityModeEnum({ systems: [systemWith({ listMode: 'player' })] });
  assert.equal(first.systems[0].visibilityMode, 'restricted');

  // Hand-flip the value, re-run, and confirm the migration does not re-derive it.
  first.systems[0].visibilityMode = 'item';
  const second = migrateVisibilityModeEnum({ systems: first.systems });
  assert.equal(second.systems[0].visibilityMode, 'item');
});

test('an already-set visibilityMode wins over legacy fields', () => {
  const system = { id: 's', visibilityMode: 'global', recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } } };
  const out = migrateVisibilityModeEnum({ systems: [system] });
  assert.equal(out.systems[0].visibilityMode, 'global');
});

test('is pure — does not mutate the input systems', () => {
  const input = systemWith({ listMode: 'player' });
  migrateVisibilityModeEnum({ systems: [input] });
  assert.equal('visibilityMode' in input, false);
});

test('handles multiple systems and skips non-object entries safely', () => {
  const systems = [
    systemWith({ listMode: 'global' }),
    null,
    42,
    systemWith({ listMode: 'knowledge', knowledge: { mode: 'item' } }),
  ];
  const out = migrateVisibilityModeEnum({ systems });
  assert.equal(out.systems[0].visibilityMode, 'global');
  assert.equal(out.systems[1], null);
  assert.equal(out.systems[2], 42);
  assert.equal(out.systems[3].visibilityMode, 'item');
});

test('returns the original value when systems is not an array', () => {
  assert.deepEqual(migrateVisibilityModeEnum({ systems: undefined }), { systems: undefined });
  assert.deepEqual(migrateVisibilityModeEnum({}), { systems: undefined });
});

test('derived visibilityMode survives a _normalizeSystem round-trip', async () => {
  const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const out = migrateVisibilityModeEnum({
    systems: [systemWith({ listMode: 'player' })],
  });
  const normalized = manager._normalizeSystem(out.systems[0]);
  assert.equal(normalized.visibilityMode, 'restricted');
});

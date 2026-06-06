/**
 * Unit tests for getSourceUuid() helper (T-087)
 *
 * Covers:
 *   1. Returns _stats.compendiumSource when present (Foundry v12+)
 *   2. Falls back to flags.core.sourceId when _stats.compendiumSource is absent
 *   3. Returns null when neither field is set
 *   4. Prefers _stats.compendiumSource over flags.core.sourceId when both are set
 *   5. Handles null/undefined item gracefully
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Ensure foundry global is NOT defined so we exercise the no-foundry path
if (typeof globalThis.foundry !== 'undefined') {
  delete globalThis.foundry;
}

const {
  getSourceUuid,
  getDuplicateSourceUuid,
  getItemSourceReferences,
  getComponentSourceReferences,
  itemMatchesComponentSource,
  findStackableMatch
} = await import('../src/utils/sourceUuid.js');

test('1 - returns _stats.compendiumSource when present (v12+ canonical field)', () => {
  const item = {
    _stats: { compendiumSource: 'Compendium.world.items.abc123' },
    flags: {}
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.abc123');
});

test('2 - falls back to flags.core.sourceId when _stats.compendiumSource is absent', () => {
  const item = {
    flags: { core: { sourceId: 'Compendium.world.items.legacy' } }
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.legacy');
});

test('3 - returns null when neither field is set', () => {
  const item = { flags: {}, _stats: {} };
  assert.equal(getSourceUuid(item), null);
});

test('4 - prefers _stats.compendiumSource over flags.core.sourceId when both set', () => {
  const item = {
    _stats: { compendiumSource: 'Compendium.world.items.v12' },
    flags: { core: { sourceId: 'Compendium.world.items.legacy' } }
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.v12');
});

test('5 - returns null for null item', () => {
  assert.equal(getSourceUuid(null), null);
});

test('6 - returns null for undefined item', () => {
  assert.equal(getSourceUuid(undefined), null);
});

test('7 - reads system._stats.compendiumSource as secondary v12+ location', () => {
  const item = {
    system: { _stats: { compendiumSource: 'Compendium.world.items.sys' } },
    flags: {}
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.sys');
});

test('8 - returns null when item has no flags and no _stats', () => {
  assert.equal(getSourceUuid({}), null);
});

test('9 - getItemSourceReferences returns item uuid and canonical source without duplicates', () => {
  const item = {
    uuid: 'Item.actor-owned-1',
    _stats: { compendiumSource: 'Compendium.world.items.iron-ore' },
    flags: {}
  };
  assert.deepEqual(getItemSourceReferences(item), [
    'Item.actor-owned-1',
    'Compendium.world.items.iron-ore'
  ]);
});

test('10 - getComponentSourceReferences includes sourceUuid, sourceItemUuid, and unique fallbacks', () => {
  const component = {
    sourceUuid: 'Compendium.world.items.iron-ore-live',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    fallbackItemIds: ['Compendium.world.items.iron-ore-live', 'Compendium.world.items.iron-ore-old']
  };
  assert.deepEqual(getComponentSourceReferences(component), [
    'Compendium.world.items.iron-ore-live',
    'Compendium.source.items.iron-ore',
    'Compendium.world.items.iron-ore-old'
  ]);
});

test('11 - itemMatchesComponentSource matches canonical sourceItemUuid when live uuid differs', () => {
  const item = {
    uuid: 'Item.actor-owned-2',
    _stats: { compendiumSource: 'Compendium.source.items.iron-ore' },
    flags: {}
  };
  const component = {
    sourceUuid: 'Compendium.world.items.iron-ore-live',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    fallbackItemIds: []
  };
  assert.equal(itemMatchesComponentSource(item, component), true);
});

test('12 - getDuplicateSourceUuid reads item._stats.duplicateSource', () => {
  const item = { _stats: { duplicateSource: 'Item.world-pick' }, flags: {} };
  assert.equal(getDuplicateSourceUuid(item), 'Item.world-pick');
});

test('13 - getDuplicateSourceUuid reads system._stats.duplicateSource (second OR-branch)', () => {
  const item = { system: { _stats: { duplicateSource: 'Item.world-pick-sys' } }, flags: {} };
  assert.equal(getDuplicateSourceUuid(item), 'Item.world-pick-sys');
});

test('14 - getDuplicateSourceUuid returns null when unset / null item', () => {
  assert.equal(getDuplicateSourceUuid({ _stats: {}, flags: {} }), null);
  assert.equal(getDuplicateSourceUuid(null), null);
});

test('15 - getSourceUuid stays null for a duplicate-source-only item (compendium contract separate)', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: null, duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  assert.equal(getSourceUuid(item), null);
});

test('16 - getItemSourceReferences includes duplicateSource as a third reference', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: 'Compendium.world.items.pick', duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  assert.deepEqual(getItemSourceReferences(item), [
    'Item.actor-drag-copy',
    'Compendium.world.items.pick',
    'Item.world-pick'
  ]);
});

test('17 - itemMatchesComponentSource matches a duplicate-source-only item via sourceItemUuid', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: null, duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  const component = {
    sourceUuid: 'Compendium.world.items.pick-live',
    sourceItemUuid: 'Item.world-pick',
    fallbackItemIds: []
  };
  assert.equal(itemMatchesComponentSource(item, component), true);
});

test('18 - itemMatchesComponentSource does NOT match on flags.fabricate.mythwrightId alone', () => {
  const item = {
    uuid: 'Item.actor-seeded',
    _stats: {},
    flags: { fabricate: { mythwrightId: 'mw-pick' } }
  };
  const component = {
    sourceUuid: 'Compendium.world.items.pick-live',
    sourceItemUuid: 'Item.world-pick',
    fallbackItemIds: []
  };
  assert.equal(itemMatchesComponentSource(item, component), false);
});

test('19 - findStackableMatch: returns an existing quantity item sharing the source uuid', () => {
  const source = { uuid: 'Compendium.world.items.raw-ore' };
  const items = [
    { name: 'Sword', uuid: 'Item.sword', system: {} }, // no quantity → not stackable
    { name: 'Raw Ore', uuid: 'Item.owned-ore', system: { quantity: 3 }, flags: { core: { sourceId: 'Compendium.world.items.raw-ore' } } }
  ];
  const match = findStackableMatch(items, source);
  assert.equal(match?.uuid, 'Item.owned-ore');
});

test('20 - findStackableMatch: no match when no item has a quantity field', () => {
  const source = { uuid: 'Compendium.world.items.raw-ore' };
  const items = [
    { name: 'Raw Ore', uuid: 'Item.owned-ore', system: {}, flags: { core: { sourceId: 'Compendium.world.items.raw-ore' } } }
  ];
  assert.equal(findStackableMatch(items, source), null);
});

test('21 - findStackableMatch: no match when source refs do not overlap', () => {
  const source = { uuid: 'Compendium.world.items.raw-ore' };
  const items = [
    { name: 'Gemstone', uuid: 'Item.gem', system: { quantity: 1 }, flags: { core: { sourceId: 'Compendium.world.items.gemstone' } } }
  ];
  assert.equal(findStackableMatch(items, source), null);
});

test('22 - findStackableMatch: empty source refs never match (no false positives)', () => {
  const items = [{ uuid: 'Item.x', system: { quantity: 1 } }];
  assert.equal(findStackableMatch(items, {}), null);
});

/**
 * Tests for compendium drop handling in Recipe Manager (Phase 1 + Phase 2)
 *
 * Phase 1 -- Single item drop UUID resolution:
 *   1. World sidebar item ({ uuid }) returns the uuid unchanged
 *   2. Compendium item ({ pack, id }) returns "Compendium.{pack}.{id}"
 *   3. Both uuid and pack+id present: uuid wins
 *   4. Empty object {} returns null
 *   5. pack present but id missing returns null
 *   6. id present but pack missing returns null
 *   7. null returns null
 *   8. undefined returns null
 *
 * Phase 1 integration (onDropItem callback behaviour):
 *   9. Compendium pack+id drop resolves UUID and calls addItemFromUuid
 *  10. Invalid drop calls notifications.warn and does NOT call addItemFromUuid
 *
 * Phase 2 -- addItemsFromPack:
 *  11. Imports all Item documents from a mock pack
 *  12. Skips items already in the system (deduplication by sourceUuid)
 *  13. Returns correct { added, skipped, total } counts
 *  14. Throws for unknown systemId
 *  15. Throws for unknown packId
 *
 * Defect 1 -- Source-ID-aware overwrite:
 *  16. addItemFromUuid -- exact duplicate returns { item, action: 'skipped' }
 *  17. addItemFromUuid -- new item returns { item, action: 'added' }
 *  18. addItemFromUuid -- exact match with differing metadata overwrites name/img and returns updated
 *  18b. addItemFromUuid -- exact match with same metadata returns skipped
 *  19. addItemFromUuid -- overwrites when dropped UUID is in existing item's fallbackItemIds
 *  20. addItemFromUuid -- fallbackItemIds accumulates without duplicates
 *  20b. addItemFromUuid -- source-chain overwrite with fromUuid returning null keeps existing metadata
 *  21. addItemsFromPack -- returns { added, updated, skipped, total }
 *  22. addItemFromUuid -- rejects non-Item document type
 *
 * Defect 2 -- Entity type handling:
 *  23. resolveDropData -- Item type returns uuid and type
 *  24. resolveDropData -- Actor type returns uuid and type
 *  25. resolveDropData -- Folder type returns folderId and folderDocumentType
 *  26. resolveDropData -- null input returns nulls
 *  27. onDropItem integration -- Actor drop shows warning, does not call addItemFromUuid
 *  28. onDropItem integration -- Folder with Items imports each
 *  29. onDropItem integration -- Folder with no Items shows info notification
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry global stubs
// ---------------------------------------------------------------------------

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty: (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj) ?? undefined
  }
};

const _mockPacks = new Map();
const _mockFolders = new Map();
globalThis.game = {
  user: { isGM: true },
  actors: [],
  packs: {
    get: (id) => _mockPacks.get(id) ?? null
  },
  folders: {
    get: (id) => _mockFolders.get(id) ?? null
  },
  fabricate: null
};
globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};
globalThis.fromUuid = async () => null;

// ---------------------------------------------------------------------------
// Module imports
// ---------------------------------------------------------------------------

const { resolveDropUuid, resolveDropData } = await import('../src/ui/svelte/util/dropUtils.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipeManager(recipes = []) {
  return {
    getRecipes: (filter = {}) => {
      if (filter.craftingSystemId) return recipes.filter(r => r.craftingSystemId === filter.craftingSystemId);
      return recipes;
    },
    deleteRecipe: async () => {},
    updateRecipe: async () => {}
  };
}

function buildManager(systems = []) {
  const mgr = new CraftingSystemManager(makeRecipeManager());
  for (const sys of systems) {
    mgr.systems.set(sys.id, mgr._normalizeSystem(sys));
  }
  mgr.initialized = true;
  mgr.save = async () => {};
  return mgr;
}

// ---------------------------------------------------------------------------
// Phase 1: resolveDropUuid unit tests (8 cases)
// ---------------------------------------------------------------------------

test('resolveDropUuid — world sidebar item with uuid returns uuid', () => {
  assert.equal(resolveDropUuid({ uuid: 'Item.abc123' }), 'Item.abc123');
});

test('resolveDropUuid — compendium item with pack+id returns Compendium.{pack}.{id}', () => {
  assert.equal(
    resolveDropUuid({ pack: 'dnd5e.items', id: 'xyz789' }),
    'Compendium.dnd5e.items.xyz789'
  );
});

test('resolveDropUuid — both uuid and pack+id present: uuid wins', () => {
  assert.equal(
    resolveDropUuid({ uuid: 'Compendium.dnd5e.items.xyz789', pack: 'dnd5e.items', id: 'xyz789' }),
    'Compendium.dnd5e.items.xyz789'
  );
});

test('resolveDropUuid — empty object returns null', () => {
  assert.equal(resolveDropUuid({}), null);
});

test('resolveDropUuid — pack present but id missing returns null', () => {
  assert.equal(resolveDropUuid({ pack: 'dnd5e.items' }), null);
});

test('resolveDropUuid — id present but pack missing returns null', () => {
  assert.equal(resolveDropUuid({ id: 'xyz789' }), null);
});

test('resolveDropUuid — null returns null', () => {
  assert.equal(resolveDropUuid(null), null);
});

test('resolveDropUuid — undefined returns null', () => {
  assert.equal(resolveDropUuid(undefined), null);
});

// ---------------------------------------------------------------------------
// Phase 1 integration: onDropItem callback behaviour (tests 9-10)
// Simulate the callback logic inline — avoids importing the full Svelte app class
// ---------------------------------------------------------------------------

function buildOnDropItem({ addItemFromUuid, refresh, warnFn }) {
  // Mirror the exact logic from SvelteRecipeManagerApp._prepareSvelteProps
  return async (data) => {
    const uuid = resolveDropUuid(data);
    if (!uuid) {
      warnFn('FABRICATE.Admin.Items.DropInvalidItem');
      return;
    }
    await addItemFromUuid('sys1', uuid);
    await refresh();
  };
}

test('onDropItem — compendium pack+id drop resolves UUID and calls addItemFromUuid', async () => {
  const calls = [];
  let refreshed = false;

  const handler = buildOnDropItem({
    addItemFromUuid: async (sysId, uuid) => { calls.push({ sysId, uuid }); },
    refresh: async () => { refreshed = true; },
    warnFn: () => { throw new Error('warn should not be called'); }
  });

  await handler({ pack: 'dnd5e.items', id: 'abc' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].uuid, 'Compendium.dnd5e.items.abc');
  assert.equal(refreshed, true);
});

test('onDropItem — invalid drop calls warn and does NOT call addItemFromUuid', async () => {
  const calls = [];
  let warned = false;

  const handler = buildOnDropItem({
    addItemFromUuid: async (sysId, uuid) => { calls.push({ sysId, uuid }); },
    refresh: async () => {},
    warnFn: () => { warned = true; }
  });

  await handler({});

  assert.equal(calls.length, 0);
  assert.equal(warned, true);
});

// ---------------------------------------------------------------------------
// Phase 2: Bulk compendium pack drop detection (test 11)
// ---------------------------------------------------------------------------

test('bulk pack drop — Foundry v13 { type: "Compendium", collection: "world.pack-name" } is detected', () => {
  // This mirrors the detection logic in SvelteRecipeManagerApp.onDropItem
  const data = { type: 'Compendium', collection: 'world.simple-smithing' };
  const isBulkPackDrop = data?.type === 'Compendium' && data?.collection && !data?.uuid;
  assert.equal(isBulkPackDrop, true);
  assert.equal(data.collection, 'world.simple-smithing');
});

test('bulk pack drop — single compendium item with uuid is NOT detected as bulk', () => {
  const data = { type: 'Item', uuid: 'Compendium.world.pack.item1', pack: 'world.pack', id: 'item1' };
  const isBulkPackDrop = data?.type === 'Compendium' && data?.collection && !data?.uuid;
  assert.equal(isBulkPackDrop, false);
});

// ---------------------------------------------------------------------------
// Phase 2: CraftingSystemManager.addItemsFromPack (tests 13-17)
// ---------------------------------------------------------------------------

test('addItemsFromPack — imports all Item documents from a mock pack', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  _mockPacks.set('world.mypack', {
    getDocuments: async () => [
      { id: 'item-a', documentName: 'Item', name: 'Iron Ore', img: 'ore.png' },
      { id: 'item-b', documentName: 'Item', name: 'Coal', img: 'coal.png' }
    ]
  });

  const result = await mgr.addItemsFromPack('sys1', 'world.mypack');

  assert.equal(result.total, 2);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 0);

  const sys = mgr.getSystem('sys1');
  assert.equal(sys.components.length, 2);
  assert.ok(sys.components.some(i => i.sourceUuid === 'Compendium.world.mypack.item-a'));
  assert.ok(sys.components.some(i => i.sourceUuid === 'Compendium.world.mypack.item-b'));
});

test('addItemsFromPack — skips items already in the system by sourceUuid', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{ id: 'existing-1', name: 'Iron Ore', sourceUuid: 'Compendium.world.mypack.item-a' }]
  }]);

  _mockPacks.set('world.mypack', {
    getDocuments: async () => [
      { id: 'item-a', documentName: 'Item', name: 'Iron Ore', img: 'ore.png' },
      { id: 'item-b', documentName: 'Item', name: 'Coal', img: 'coal.png' }
    ]
  });

  const result = await mgr.addItemsFromPack('sys1', 'world.mypack');

  assert.equal(result.total, 2);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  // Verify the updated field exists
  assert.ok('updated' in result);
});

test('addItemsFromPack — updates existing component when canonical source UUID matches but live UUID changes', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'existing-1',
      name: 'Iron Ore',
      sourceUuid: 'Compendium.world.old-pack.item-a',
      sourceItemUuid: 'Compendium.source.items.iron-ore'
    }]
  }]);

  _mockPacks.set('world.new-pack', {
    getDocuments: async () => [
      { id: 'item-b', documentName: 'Item', name: 'Iron Ore', img: 'ore-new.png' }
    ]
  });

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Compendium.source.items.iron-ore') {
      return { documentName: 'Item', name: 'Iron Ore Source' };
    }
    if (uuid !== 'Compendium.world.new-pack.item-b') return null;
    return {
      documentName: 'Item',
      name: 'Iron Ore',
      img: 'ore-new.png',
      _stats: { compendiumSource: 'Compendium.source.items.iron-ore' }
    };
  };

  const result = await mgr.addItemsFromPack('sys1', 'world.new-pack');

  assert.equal(result.total, 1);
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 0);

  const sys = mgr.getSystem('sys1');
  assert.equal(sys.components.length, 1, 'should not duplicate the component');
  assert.equal(sys.components[0].sourceUuid, 'Compendium.world.new-pack.item-b');
  assert.equal(sys.components[0].sourceItemUuid, 'Compendium.source.items.iron-ore');
  assert.ok(sys.components[0].fallbackItemIds.includes('Compendium.world.old-pack.item-a'));

  globalThis.fromUuid = async () => null;
});

test('addItemsFromPack — filters out non-Item documents and returns correct counts', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [
      { id: 'e1', name: 'Existing A', sourceUuid: 'Compendium.world.mypack.item-a' },
      { id: 'e2', name: 'Existing B', sourceUuid: 'Compendium.world.mypack.item-b' }
    ]
  }]);

  _mockPacks.set('world.mypack', {
    getDocuments: async () => [
      { id: 'item-a', documentName: 'Item', name: 'Iron Ore' },
      { id: 'item-b', documentName: 'Item', name: 'Coal' },
      { id: 'item-c', documentName: 'Item', name: 'Silver' },
      { id: 'actor-d', documentName: 'Actor', name: 'Not an item' } // must be filtered
    ]
  });

  const result = await mgr.addItemsFromPack('sys1', 'world.mypack');

  // Only Item docs counted: item-a (skip), item-b (skip), item-c (add)
  assert.equal(result.total, 3);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.ok('updated' in result);
});

test('addItemsFromPack — throws for unknown systemId', async () => {
  const mgr = buildManager([]);

  await assert.rejects(
    () => mgr.addItemsFromPack('nonexistent-sys', 'world.mypack'),
    /Crafting system not found/
  );
});

test('addItemsFromPack — throws for unknown packId', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  await assert.rejects(
    () => mgr.addItemsFromPack('sys1', 'nonexistent.pack'),
    /Compendium pack not found/
  );
});

// ---------------------------------------------------------------------------
// Defect 1: Source-ID-aware overwrite
// ---------------------------------------------------------------------------

test('addItemFromUuid — exact duplicate returns { item, action: "skipped" }', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{ id: 'comp-1', name: 'Iron Ore', sourceUuid: 'Compendium.world.pack.item-a' }]
  }]);

  // fromUuid returns null by default — exact match should skip before resolving
  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-a');

  assert.equal(result.action, 'skipped');
  assert.equal(result.item.id, 'comp-1');
  // System should still have only one item
  assert.equal(mgr.getSystem('sys1').components.length, 1);
});

test('addItemFromUuid — new item returns { item, action: "added" }', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  globalThis.fromUuid = async (uuid) => ({
    documentName: 'Item',
    name: 'Fresh Coal',
    img: 'coal.png',
    system: { description: { value: '<p>Fresh <strong>coal</strong> for the forge.</p>' } },
    _stats: { compendiumSource: 'Compendium.source.items.coal' }
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-coal');

  assert.equal(result.action, 'added');
  assert.equal(result.item.name, 'Fresh Coal');
  assert.equal(result.item.img, 'coal.png');
  assert.equal(result.item.description, 'Fresh coal for the forge.');
  assert.equal(result.item.sourceUuid, 'Compendium.world.pack.item-coal');
  assert.equal(result.item.sourceItemUuid, 'Compendium.source.items.coal');
  assert.equal(mgr.getSystem('sys1').components.length, 1);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — keeps resolvable canonical source UUID', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Item.world-azuryt') {
      return {
        uuid,
        documentName: 'Item',
        name: 'Azuryt',
        img: 'azuryt.png',
        _stats: { compendiumSource: 'Compendium.crafting.items.Item.azuryt' }
      };
    }
    if (uuid === 'Compendium.crafting.items.Item.azuryt') {
      return { documentName: 'Item', name: 'Azuryt Source' };
    }
    return null;
  };

  const result = await mgr.addItemFromUuid('sys1', 'Item.world-azuryt');

  assert.equal(result.action, 'added');
  assert.equal(result.item.sourceUuid, 'Item.world-azuryt');
  assert.equal(result.item.sourceItemUuid, 'Compendium.crafting.items.Item.azuryt');
  assert.deepEqual(result.item.fallbackItemIds, []);
  assert.deepEqual(result.sourceFallbacks, []);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — falls back to live item UUID when canonical source is broken', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Item.world-azuryt') {
      return {
        uuid,
        documentName: 'Item',
        name: 'Azuryt',
        img: 'azuryt.png',
        _stats: { compendiumSource: 'Compendium.crafting.items.Item.missing-azuryt' }
      };
    }
    return null;
  };

  const result = await mgr.addItemFromUuid('sys1', 'Item.world-azuryt');

  assert.equal(result.action, 'added');
  assert.equal(result.item.sourceUuid, 'Item.world-azuryt');
  assert.equal(result.item.sourceItemUuid, 'Item.world-azuryt');
  assert.deepEqual(result.item.fallbackItemIds, ['Compendium.crafting.items.Item.missing-azuryt']);
  assert.deepEqual(result.sourceFallbacks, [{
    itemName: 'Azuryt',
    brokenUuid: 'Compendium.crafting.items.Item.missing-azuryt',
    fallbackUuid: 'Item.world-azuryt'
  }]);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — exact match with differing metadata overwrites name/img and returns updated', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Iron Ore',
      img: 'ore-old.png',
      description: 'Old description',
      sourceUuid: 'Compendium.world.pack.item-a'
    }]
  }]);

  globalThis.fromUuid = async () => ({
    documentName: 'Item',
    name: 'Updated Iron Ore',
    img: 'ore2.png',
    system: { description: { value: '<p>Smelts into sturdy ingots.</p>' } },
    _stats: { compendiumSource: 'Compendium.source.items.iron-ore' }
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-a');

  // Source resolved with different name/img — should be updated
  assert.equal(result.action, 'updated');
  assert.equal(result.item.id, 'comp-1');
  assert.equal(result.item.name, 'Updated Iron Ore');
  assert.equal(result.item.img, 'ore2.png');
  assert.equal(result.item.description, 'Smelts into sturdy ingots.');
  assert.equal(result.item.sourceItemUuid, 'Compendium.source.items.iron-ore');
  // System should still have only one item
  assert.equal(mgr.getSystem('sys1').components.length, 1);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — updates existing component through broken canonical source reference', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Old Azuryt',
      img: 'old.png',
      sourceUuid: 'Compendium.crafting.items.Item.missing-azuryt',
      sourceItemUuid: 'Compendium.crafting.items.Item.missing-azuryt'
    }]
  }]);

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Item.world-azuryt') {
      return {
        uuid,
        documentName: 'Item',
        name: 'Azuryt',
        img: 'azuryt.png',
        _stats: { compendiumSource: 'Compendium.crafting.items.Item.missing-azuryt' }
      };
    }
    return null;
  };

  const result = await mgr.addItemFromUuid('sys1', 'Item.world-azuryt');

  assert.equal(result.action, 'updated');
  assert.equal(result.item.id, 'comp-1');
  assert.equal(result.item.name, 'Azuryt');
  assert.equal(result.item.sourceUuid, 'Item.world-azuryt');
  assert.equal(result.item.sourceItemUuid, 'Item.world-azuryt');
  assert.ok(result.item.fallbackItemIds.includes('Compendium.crafting.items.Item.missing-azuryt'));
  assert.equal(mgr.getSystem('sys1').components.length, 1);
  assert.equal(result.sourceFallbacks.length, 1);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — exact match with same metadata returns skipped', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{ id: 'comp-1', name: 'Iron Ore', img: 'ore.png', sourceUuid: 'Compendium.world.pack.item-a' }]
  }]);

  // fromUuid returns same name and img as existing item
  globalThis.fromUuid = async () => ({
    documentName: 'Item',
    name: 'Iron Ore',
    img: 'ore.png'
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-a');

  // Metadata already up-to-date — should be skipped
  assert.equal(result.action, 'skipped');
  assert.equal(result.item.id, 'comp-1');
  assert.equal(result.item.name, 'Iron Ore');

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — overwrites when dropped UUID is in existing item\'s fallbackItemIds', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Iron Ore',
      sourceUuid: 'Item.world-123',
      fallbackItemIds: ['Compendium.world.pack.item-a']
    }]
  }]);

  globalThis.fromUuid = async (uuid) => ({
    documentName: 'Item',
    name: 'Updated Iron Ore',
    img: 'ore-updated.png'
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-a');

  assert.equal(result.action, 'updated');
  // Same component id retained
  assert.equal(result.item.id, 'comp-1');
  // Name and img updated
  assert.equal(result.item.name, 'Updated Iron Ore');
  assert.equal(result.item.img, 'ore-updated.png');
  // sourceUuid updated to the dropped UUID
  assert.equal(result.item.sourceUuid, 'Compendium.world.pack.item-a');
  // Old sourceUuid pushed into fallbackItemIds
  assert.ok(result.item.fallbackItemIds.includes('Item.world-123'));
  // System still has only one item
  assert.equal(mgr.getSystem('sys1').components.length, 1);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — fallbackItemIds accumulates without duplicates', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Iron Ore',
      sourceUuid: 'Item.world-123',
      fallbackItemIds: ['old-uuid-1', 'Compendium.world.pack.item-a']
    }]
  }]);

  globalThis.fromUuid = async () => ({
    documentName: 'Item',
    name: 'Updated Iron Ore',
    img: 'ore2.png'
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-a');

  assert.equal(result.action, 'updated');
  // 'old-uuid-1' was already in fallbackItemIds; 'Item.world-123' (old sourceUuid) should be added
  // 'Compendium.world.pack.item-a' was already in fallbackItemIds so not duplicated
  const fallbacks = result.item.fallbackItemIds;
  assert.ok(fallbacks.includes('old-uuid-1'), 'old-uuid-1 should still be present');
  assert.ok(fallbacks.includes('Item.world-123'), 'old sourceUuid should be added');
  // No duplicates
  const unique = new Set(fallbacks);
  assert.equal(unique.size, fallbacks.length, 'fallbackItemIds should have no duplicates');

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — source-chain overwrite with fromUuid returning null keeps existing metadata', async () => {
  // Issue 3: when fromUuid returns null during the fallback/source-chain overwrite path,
  // the existing item keeps its current name and img.
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Old Iron Ore',
      img: 'old-ore.png',
      description: 'Existing source description.',
      sourceUuid: 'Item.world-456',
      fallbackItemIds: ['Compendium.world.pack.item-b']
    }]
  }]);

  // fromUuid returns null — source not resolvable
  globalThis.fromUuid = async () => null;

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-b');

  assert.equal(result.action, 'updated');
  assert.equal(result.item.id, 'comp-1');
  // Name and img should fall back to the existing values since source is null
  assert.equal(result.item.name, 'Old Iron Ore', 'name should retain old value when source is null');
  assert.equal(result.item.img, 'old-ore.png', 'img should retain old value when source is null');
  assert.equal(result.item.description, 'Existing source description.');
  // sourceUuid updated to the dropped UUID
  assert.equal(result.item.sourceUuid, 'Compendium.world.pack.item-b');
  // Old sourceUuid pushed into fallbackItemIds
  assert.ok(result.item.fallbackItemIds.includes('Item.world-456'));
});

test('replaceItemSource — updates source refs, description, and fallbackItemIds for a specific component', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Old Herb',
      img: 'old-herb.png',
      description: 'Old herb description.',
      sourceUuid: 'Item.old-herb'
    }]
  }]);

  globalThis.fromUuid = async () => ({
    documentName: 'Item',
    name: 'Sunleaf',
    img: 'sunleaf.png',
    system: { description: { value: '<p>Radiates <em>warmth</em>.</p>' } },
    _stats: { compendiumSource: 'Compendium.source.items.sunleaf' }
  });

  const result = await mgr.replaceItemSource('sys1', 'comp-1', 'Compendium.world.pack.sunleaf');
  const item = result.item;

  assert.equal(item.id, 'comp-1');
  assert.equal(item.name, 'Sunleaf');
  assert.equal(item.img, 'sunleaf.png');
  assert.equal(item.description, 'Radiates warmth.');
  assert.equal(item.sourceUuid, 'Compendium.world.pack.sunleaf');
  assert.equal(item.sourceItemUuid, 'Compendium.source.items.sunleaf');
  assert.ok(item.fallbackItemIds.includes('Item.old-herb'));
  assert.deepEqual(result.sourceFallbacks, []);

  globalThis.fromUuid = async () => null;
});

test('replaceItemSource — falls back to live item UUID when canonical source is broken', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Old Herb',
      img: 'old-herb.png',
      description: 'Old herb description.',
      sourceUuid: 'Item.old-herb'
    }]
  }]);

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Item.world-sunleaf') {
      return {
        uuid,
        documentName: 'Item',
        name: 'Sunleaf',
        img: 'sunleaf.png',
        _stats: { compendiumSource: 'Compendium.source.items.missing-sunleaf' }
      };
    }
    return null;
  };

  const result = await mgr.replaceItemSource('sys1', 'comp-1', 'Item.world-sunleaf');
  const item = result.item;

  assert.equal(item.id, 'comp-1');
  assert.equal(item.name, 'Sunleaf');
  assert.equal(item.sourceUuid, 'Item.world-sunleaf');
  assert.equal(item.sourceItemUuid, 'Item.world-sunleaf');
  assert.ok(item.fallbackItemIds.includes('Item.old-herb'));
  assert.ok(item.fallbackItemIds.includes('Compendium.source.items.missing-sunleaf'));
  assert.deepEqual(result.sourceFallbacks, [{
    itemName: 'Sunleaf',
    brokenUuid: 'Compendium.source.items.missing-sunleaf',
    fallbackUuid: 'Item.world-sunleaf'
  }]);

  globalThis.fromUuid = async () => null;
});

test('replaceItemSource — preserves existing metadata when fromUuid cannot resolve the dropped item', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-1',
      name: 'Old Herb',
      img: 'old-herb.png',
      description: 'Old herb description.',
      sourceUuid: 'Item.old-herb'
    }]
  }]);

  globalThis.fromUuid = async () => null;

  const result = await mgr.replaceItemSource('sys1', 'comp-1', 'Compendium.world.pack.sunleaf');

  assert.equal(result.item.name, 'Old Herb');
  assert.equal(result.item.img, 'old-herb.png');
  assert.equal(result.item.description, 'Old herb description.');
  assert.equal(result.item.sourceUuid, 'Compendium.world.pack.sunleaf');
  assert.ok(result.item.fallbackItemIds.includes('Item.old-herb'));
});

test('addItemsFromPack — returns { added, updated, skipped, total } with updated field', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [
      // This item's sourceUuid exactly matches pack item-a — will be skipped
      { id: 'comp-existing', name: 'Iron Ore', sourceUuid: 'Compendium.world.mypack2.item-a' }
    ]
  }]);

  _mockPacks.set('world.mypack2', {
    getDocuments: async () => [
      { id: 'item-a', documentName: 'Item', name: 'Iron Ore', img: 'ore.png' },
      { id: 'item-b', documentName: 'Item', name: 'Coal', img: 'coal.png' },
      { id: 'item-c', documentName: 'Item', name: 'Silver', img: 'silver.png' }
    ]
  });

  const result = await mgr.addItemsFromPack('sys1', 'world.mypack2');

  assert.equal(result.total, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.added, 2);
  assert.equal(result.updated, 0);
  assert.ok('updated' in result, 'result must have an updated field');
});

test('addItemsFromPack — aggregates broken canonical source fallbacks', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  _mockPacks.set('world.broken-sources', {
    getDocuments: async () => [
      { id: 'item-a', documentName: 'Item', name: 'Azuryt', img: 'azuryt.png' },
      { id: 'item-b', documentName: 'Item', name: 'Cytryn', img: 'cytryn.png' }
    ]
  });

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Compendium.world.broken-sources.item-a') {
      return {
        documentName: 'Item',
        name: 'Azuryt',
        img: 'azuryt.png',
        _stats: { compendiumSource: 'Compendium.crafting.items.Item.missing-azuryt' }
      };
    }
    if (uuid === 'Compendium.world.broken-sources.item-b') {
      return {
        documentName: 'Item',
        name: 'Cytryn',
        img: 'cytryn.png',
        _stats: { compendiumSource: 'Compendium.crafting.items.Item.cytryn' }
      };
    }
    if (uuid === 'Compendium.crafting.items.Item.cytryn') {
      return { documentName: 'Item', name: 'Cytryn Source' };
    }
    return null;
  };

  const result = await mgr.addItemsFromPack('sys1', 'world.broken-sources');

  assert.equal(result.total, 2);
  assert.equal(result.added, 2);
  assert.deepEqual(result.sourceFallbacks, [{
    itemName: 'Azuryt',
    brokenUuid: 'Compendium.crafting.items.Item.missing-azuryt',
    fallbackUuid: 'Compendium.world.broken-sources.item-a'
  }]);
  assert.equal(mgr.getSystem('sys1').components[0].sourceItemUuid, 'Compendium.world.broken-sources.item-a');
  assert.equal(mgr.getSystem('sys1').components[1].sourceItemUuid, 'Compendium.crafting.items.Item.cytryn');

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — rejects non-Item document type', async () => {
  const mgr = buildManager([{ id: 'sys1', name: 'System One', items: [] }]);

  globalThis.fromUuid = async () => ({
    documentName: 'Actor',
    name: 'Bob the Blacksmith'
  });

  await assert.rejects(
    () => mgr.addItemFromUuid('sys1', 'Actor.bob123'),
    /non-Item|Actor/
  );

  globalThis.fromUuid = async () => null;
});

test('createItem — rejects a duplicate source reference already used by another component', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-existing',
      name: 'Iron Ore',
      sourceUuid: 'Compendium.world.pack.item-a',
      sourceItemUuid: 'Compendium.source.items.iron-ore'
    }]
  }]);

  await assert.rejects(
    () => mgr.createItem('sys1', {
      name: 'Duplicate Iron Ore',
      sourceUuid: 'Compendium.world.other-pack.item-z',
      sourceItemUuid: 'Compendium.source.items.iron-ore'
    }),
    /already belongs/
  );
});

test('createSystem — rejects duplicate component source references in one payload', async () => {
  const mgr = buildManager([]);

  await assert.rejects(
    () => mgr.createSystem({
      id: 'sys-dupes',
      name: 'Duplicate Sources',
      components: [
        {
          id: 'comp-a',
          name: 'Iron Ore',
          sourceUuid: 'Compendium.world.pack.item-a'
        },
        {
          id: 'comp-b',
          name: 'Iron Ore Copy',
          fallbackItemIds: ['Compendium.world.pack.item-a']
        }
      ]
    }),
    /claimed by both/
  );
});

test('updateSystem — rejects duplicate component source references in one payload', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [
      {
        id: 'comp-a',
        name: 'Iron Ore',
        sourceUuid: 'Compendium.world.pack.item-a'
      },
      {
        id: 'comp-b',
        name: 'Coal',
        sourceUuid: 'Compendium.world.pack.item-b'
      }
    ]
  }]);

  await assert.rejects(
    () => mgr.updateSystem('sys1', {
      components: [
        {
          id: 'comp-a',
          name: 'Iron Ore',
          sourceUuid: 'Compendium.world.pack.item-a'
        },
        {
          id: 'comp-b',
          name: 'Iron Ore Copy',
          sourceItemUuid: 'Compendium.world.pack.item-a'
        }
      ]
    }),
    /claimed by both/
  );
});

test('createSystem — allows multiple components without source references', async () => {
  const mgr = buildManager([]);

  const system = await mgr.createSystem({
    id: 'sys-no-sources',
    name: 'No Source Components',
    components: [
      { id: 'comp-a', name: 'Hand-authored A' },
      { id: 'comp-b', name: 'Hand-authored B' }
    ]
  });

  assert.equal(system.components.length, 2);
  assert.equal(system.components[0].sourceUuid, null);
  assert.equal(system.components[1].sourceItemUuid, null);
});

test('updateItem — rejects changing a component to a source reference already used by another component', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [
      {
        id: 'comp-a',
        name: 'Iron Ore',
        sourceUuid: 'Compendium.world.pack.item-a',
        sourceItemUuid: 'Compendium.source.items.iron-ore'
      },
      {
        id: 'comp-b',
        name: 'Coal',
        sourceUuid: 'Compendium.world.pack.item-b',
        sourceItemUuid: 'Compendium.source.items.coal'
      }
    ]
  }]);

  await assert.rejects(
    () => mgr.updateItem('sys1', 'comp-b', {
      sourceItemUuid: 'Compendium.source.items.iron-ore'
    }),
    /already belongs/
  );
});

test('replaceItemSource — rejects changing a component to a source reference already used by another component', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [
      {
        id: 'comp-a',
        name: 'Iron Ore',
        sourceUuid: 'Compendium.world.pack.item-a',
        sourceItemUuid: 'Compendium.source.items.iron-ore'
      },
      {
        id: 'comp-b',
        name: 'Coal',
        sourceUuid: 'Compendium.world.pack.item-b',
        sourceItemUuid: 'Compendium.source.items.coal'
      }
    ]
  }]);

  globalThis.fromUuid = async () => ({
    documentName: 'Item',
    name: 'Duplicate Iron Ore',
    img: 'ore.png',
    _stats: { compendiumSource: 'Compendium.source.items.iron-ore' }
  });

  await assert.rejects(
    () => mgr.replaceItemSource('sys1', 'comp-b', 'Compendium.world.other-pack.item-z'),
    /already belongs/
  );

  globalThis.fromUuid = async () => null;
});

test('refreshComponentMetadataForUpdatedItem — updates component image for direct source UUID match', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-herb',
      name: 'Herb',
      img: 'icons/herb-old.webp',
      sourceUuid: 'Item.herb'
    }]
  }]);
  let saveCount = 0;
  let notifyCount = 0;
  const previousHooks = globalThis.Hooks;
  mgr.save = async () => { saveCount++; };
  globalThis.Hooks = {
    callAll: (hookName) => {
      if (hookName === 'fabricate.craftingSystemsChanged') notifyCount++;
    }
  };

  try {
    const result = await mgr.refreshComponentMetadataForUpdatedItem(
      { uuid: 'Item.herb', img: 'icons/herb-new.webp' },
      { img: 'icons/herb-new.webp' }
    );

    assert.equal(result.updated, 1);
    assert.equal(mgr.getSystem('sys1').components[0].img, 'icons/herb-new.webp');
    assert.equal(saveCount, 1);
    assert.equal(notifyCount, 1);
  } finally {
    globalThis.Hooks = previousHooks;
  }
});

test('refreshComponentMetadataForUpdatedItem — updates component name for direct source UUID match', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-herb',
      name: 'Old Herb',
      img: 'icons/herb.webp',
      sourceUuid: 'Item.herb'
    }]
  }]);
  let saveCount = 0;
  mgr.save = async () => { saveCount++; };

  const result = await mgr.refreshComponentMetadataForUpdatedItem(
    { uuid: 'Item.herb', name: 'Fresh Herb', img: 'icons/herb.webp' },
    { name: 'Fresh Herb' }
  );

  assert.equal(result.updated, 1);
  assert.equal(mgr.getSystem('sys1').components[0].name, 'Fresh Herb');
  assert.equal(saveCount, 1);
});

test('refreshComponentMetadataForUpdatedItem — updates component image for canonical source UUID match', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-ore',
      name: 'Iron Ore',
      img: 'icons/ore-old.webp',
      sourceUuid: 'Item.world-copy',
      sourceItemUuid: 'Compendium.source.items.iron-ore'
    }]
  }]);
  let saveCount = 0;
  mgr.save = async () => { saveCount++; };

  const result = await mgr.refreshComponentMetadataForUpdatedItem(
    {
      uuid: 'Actor.actor-1.Item.ore-copy',
      img: 'icons/ore-new.webp',
      _stats: { compendiumSource: 'Compendium.source.items.iron-ore' }
    },
    { img: 'icons/ore-new.webp' }
  );

  assert.equal(result.updated, 1);
  assert.equal(mgr.getSystem('sys1').components[0].img, 'icons/ore-new.webp');
  assert.equal(saveCount, 1);
});

test('refreshComponentMetadataForUpdatedItem — updates component description for direct source UUID match', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-herb',
      name: 'Herb',
      img: 'icons/herb.webp',
      description: 'Old herb description.',
      sourceUuid: 'Item.herb'
    }]
  }]);
  let saveCount = 0;
  mgr.save = async () => { saveCount++; };

  const result = await mgr.refreshComponentMetadataForUpdatedItem(
    {
      uuid: 'Item.herb',
      img: 'icons/herb.webp',
      system: { description: { value: '<p>Bright <strong>green</strong> leaves.</p>' } }
    },
    { 'system.description.value': '<p>Bright <strong>green</strong> leaves.</p>' }
  );

  assert.equal(result.updated, 1);
  assert.equal(mgr.getSystem('sys1').components[0].description, 'Bright green leaves.');
  assert.equal(saveCount, 1);
});

test('refreshComponentMetadataForUpdatedItem — clears component description for canonical source UUID match', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-ore',
      name: 'Iron Ore',
      img: 'icons/ore.webp',
      description: 'Old ore description.',
      sourceUuid: 'Item.world-copy',
      sourceItemUuid: 'Compendium.source.items.iron-ore'
    }]
  }]);
  let saveCount = 0;
  mgr.save = async () => { saveCount++; };

  const result = await mgr.refreshComponentMetadataForUpdatedItem(
    {
      uuid: 'Actor.actor-1.Item.ore-copy',
      img: 'icons/ore.webp',
      system: { description: { value: '' } },
      _stats: { compendiumSource: 'Compendium.source.items.iron-ore' }
    },
    { system: { description: { value: '' } } }
  );

  assert.equal(result.updated, 1);
  assert.equal(mgr.getSystem('sys1').components[0].description, '');
  assert.equal(saveCount, 1);
});

test('refreshComponentMetadataForUpdatedItem — ignores updates without synced metadata changes', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-herb',
      name: 'Herb',
      img: 'icons/herb-old.webp',
      sourceUuid: 'Item.herb'
    }]
  }]);
  let saveCount = 0;
  mgr.save = async () => { saveCount++; };

  const result = await mgr.refreshComponentMetadataForUpdatedItem(
    { uuid: 'Item.herb', img: 'icons/herb-new.webp' },
    { type: 'loot' }
  );

  assert.equal(result.updated, 0);
  assert.equal(mgr.getSystem('sys1').components[0].img, 'icons/herb-old.webp');
  assert.equal(saveCount, 0);
});

test('refreshComponentMetadataForUpdatedItem — skips save when matched metadata is unchanged', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{
      id: 'comp-herb',
      name: 'Herb',
      img: 'icons/herb.webp',
      sourceUuid: 'Item.herb'
    }]
  }]);
  let saveCount = 0;
  mgr.save = async () => { saveCount++; };

  const result = await mgr.refreshComponentMetadataForUpdatedItem(
    { uuid: 'Item.herb', img: 'icons/herb.webp' },
    { img: 'icons/herb.webp' }
  );

  assert.equal(result.updated, 0);
  assert.equal(mgr.getSystem('sys1').components[0].img, 'icons/herb.webp');
  assert.equal(saveCount, 0);
});

// ---------------------------------------------------------------------------
// Defect 2: resolveDropData unit tests
// ---------------------------------------------------------------------------

test('resolveDropData — Item type returns uuid and type', () => {
  const result = resolveDropData({ type: 'Item', uuid: 'Item.abc123' });
  assert.equal(result.uuid, 'Item.abc123');
  assert.equal(result.type, 'Item');
});

test('resolveDropData — Actor type returns uuid and type', () => {
  const result = resolveDropData({ type: 'Actor', uuid: 'Actor.123' });
  assert.equal(result.uuid, 'Actor.123');
  assert.equal(result.type, 'Actor');
});

test('resolveDropData — Folder type returns folderId and folderDocumentType', () => {
  const result = resolveDropData({ type: 'Folder', id: 'folder1', documentType: 'Item' });
  assert.equal(result.type, 'Folder');
  assert.equal(result.folderId, 'folder1');
  assert.equal(result.folderDocumentType, 'Item');
  assert.equal(result.uuid, null);
});

test('resolveDropData — null input returns nulls', () => {
  const result = resolveDropData(null);
  assert.equal(result.uuid, null);
  assert.equal(result.type, null);
});

// ---------------------------------------------------------------------------
// Defect 2: onDropItem integration tests (inline simulation)
// ---------------------------------------------------------------------------

/**
 * Builds a simplified onDropItem handler that mirrors the logic in
 * SvelteRecipeManagerApp._prepareSvelteProps, usable without the Svelte app.
 */
function buildFullOnDropItem({ systemId, systemManager, notifyWarn, notifyInfo, folders }) {
  function notifySingleSourceFallback(fallbacks = []) {
    const fallback = Array.isArray(fallbacks) ? fallbacks[0] : null;
    if (!fallback) return;
    notifyWarn('SourceFallbackWarning', {
      name: fallback.itemName || fallback.fallbackUuid,
      brokenUuid: fallback.brokenUuid,
      fallbackUuid: fallback.fallbackUuid
    });
  }

  function notifyBulkSourceFallback(fallbacks = []) {
    const count = Array.isArray(fallbacks) ? fallbacks.length : 0;
    if (count > 0) notifyWarn('SourceFallbackSummary', { count });
  }

  function folderValues() {
    if (!folders) return [];
    if (folders instanceof Map) return Array.from(folders.values());
    if (typeof folders.values === 'function') return Array.from(folders.values());
    if (Array.isArray(folders.contents)) return folders.contents;
    return [];
  }

  function folderChildren(folder) {
    const explicit = Array.isArray(folder.children) ? folder.children.map(child => child.folder || child) : [];
    const fromCollection = folderValues().filter(candidate =>
      candidate?.folder?.id === folder?.id || candidate?.parent?.id === folder?.id || candidate?.parent === folder?.id
    );
    return [...explicit, ...fromCollection];
  }

  function collectItems(folder, visited = new Set()) {
    if (!folder?.id || visited.has(folder.id)) return [];
    visited.add(folder.id);
    return [
      ...(folder.contents || []).filter(d => d.documentName === 'Item' && d.uuid),
      ...folderChildren(folder).flatMap(child => collectItems(child, visited))
    ];
  }

  return async (data) => {
    // Bulk compendium pack drop
    if (data?.type === 'Compendium' && data?.collection && !data?.uuid) {
      if (!systemId) {
        notifyWarn('DropNoSystemSelected');
        return;
      }
      const result = await systemManager.addItemsFromPack(systemId, data.collection);
      notifyInfo('BulkImportUpdated', result);
      notifyBulkSourceFallback(result.sourceFallbacks);
      return;
    }

    // Folder drop
    if (data?.type === 'Folder') {
      if (!systemId) {
        notifyWarn('DropNoSystemSelected');
        return;
      }
      const folder = folders?.get(data.id);
      if (!folder) return;
      const folderItems = folder.documentType && folder.documentType !== 'Item'
        ? []
        : collectItems(folder);
      if (folderItems.length === 0) {
        notifyInfo('FolderEmpty', { name: folder.name });
        return;
      }
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const sourceFallbacks = [];
      for (const fi of folderItems) {
        const res = await systemManager.addItemFromUuid(systemId, fi.uuid);
        if (res.action === 'added') added++;
        else if (res.action === 'updated') updated++;
        else skipped++;
        if (Array.isArray(res.sourceFallbacks)) sourceFallbacks.push(...res.sourceFallbacks);
      }
      notifyInfo('FolderImportSummary', { added, updated, skipped, total: folderItems.length, name: folder.name });
      notifyBulkSourceFallback(sourceFallbacks);
      return;
    }

    // Entity type guard
    const dropInfo = resolveDropData(data);
    if (dropInfo.type && dropInfo.type !== 'Item' && dropInfo.type !== 'Compendium') {
      notifyWarn('DropNotAnItem', { type: dropInfo.type });
      return;
    }

    // Single item drop
    const uuid = resolveDropUuid(data);
    if (!uuid) {
      notifyWarn('DropInvalidItem');
      return;
    }
    if (!systemId) {
      notifyWarn('DropNoSystemSelected');
      return;
    }
    const result = await systemManager.addItemFromUuid(systemId, uuid);
    notifySingleSourceFallback(result.sourceFallbacks);
  };
}

test('onDropItem integration — Actor drop shows warning and does not call addItemFromUuid', async () => {
  const addCalls = [];
  const warnings = [];

  const mgr = {
    addItemFromUuid: async (...args) => { addCalls.push(args); return { item: {}, action: 'added' }; },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: (key, params) => { warnings.push({ key, params }); },
    notifyInfo: () => {},
    folders: new Map()
  });

  await handler({ type: 'Actor', uuid: 'Actor.123' });

  assert.equal(addCalls.length, 0, 'addItemFromUuid should not be called');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].key, 'DropNotAnItem');
  assert.equal(warnings[0].params.type, 'Actor');
});

test('onDropItem integration — single item import warns when source fallback is used', async () => {
  const warnings = [];

  const mgr = {
    addItemFromUuid: async () => ({
      item: { name: 'Azuryt' },
      action: 'added',
      sourceFallbacks: [{
        itemName: 'Azuryt',
        brokenUuid: 'Compendium.crafting.items.Item.missing-azuryt',
        fallbackUuid: 'Item.world-azuryt'
      }]
    }),
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0, sourceFallbacks: [] })
  };

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: (key, params) => { warnings.push({ key, params }); },
    notifyInfo: () => {},
    folders: new Map()
  });

  await handler({ type: 'Item', uuid: 'Item.world-azuryt' });

  assert.deepEqual(warnings, [{
    key: 'SourceFallbackWarning',
    params: {
      name: 'Azuryt',
      brokenUuid: 'Compendium.crafting.items.Item.missing-azuryt',
      fallbackUuid: 'Item.world-azuryt'
    }
  }]);
});

test('onDropItem integration — compendium pack import summarizes source fallbacks', async () => {
  const warnings = [];
  const infos = [];

  const mgr = {
    addItemFromUuid: async () => ({ item: {}, action: 'added', sourceFallbacks: [] }),
    addItemsFromPack: async () => ({
      added: 2,
      updated: 0,
      skipped: 0,
      total: 2,
      sourceFallbacks: [
        { itemName: 'Azuryt', brokenUuid: 'Compendium.missing.a', fallbackUuid: 'Compendium.world.pack.a' },
        { itemName: 'Cytryn', brokenUuid: 'Compendium.missing.c', fallbackUuid: 'Compendium.world.pack.c' }
      ]
    })
  };

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: (key, params) => { warnings.push({ key, params }); },
    notifyInfo: (key, params) => { infos.push({ key, params }); },
    folders: new Map()
  });

  await handler({ type: 'Compendium', collection: 'world.pack' });

  assert.equal(infos[0].key, 'BulkImportUpdated');
  assert.deepEqual(warnings, [{ key: 'SourceFallbackSummary', params: { count: 2 } }]);
});

test('onDropItem integration — Folder with Items imports each and shows summary', async () => {
  const addCalls = [];
  const infos = [];

  const mgr = {
    addItemFromUuid: async (sysId, uuid) => {
      addCalls.push(uuid);
      return { item: { name: 'Item' }, action: 'added' };
    },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };

  const folders = new Map([
    ['folder1', {
      id: 'folder1',
      name: 'My Folder',
      contents: [
        { documentName: 'Item', uuid: 'Item.item-x' },
        { documentName: 'Item', uuid: 'Item.item-y' },
        { documentName: 'Actor', uuid: 'Actor.some-actor' } // should be ignored
      ]
    }]
  ]);

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: () => {},
    notifyInfo: (key, params) => { infos.push({ key, params }); },
    folders
  });

  await handler({ type: 'Folder', id: 'folder1', documentType: 'Item' });

  assert.equal(addCalls.length, 2, 'addItemFromUuid should be called for each Item in folder');
  assert.ok(addCalls.includes('Item.item-x'));
  assert.ok(addCalls.includes('Item.item-y'));
  assert.equal(infos.length, 1);
  assert.equal(infos[0].key, 'FolderImportSummary');
  assert.equal(infos[0].params.added, 2);
  assert.equal(infos[0].params.updated, 0);
  assert.equal(infos[0].params.skipped, 0);
  assert.equal(infos[0].params.total, 2);
});

test('onDropItem integration — Folder import summarizes source fallbacks once', async () => {
  const warnings = [];

  const mgr = {
    addItemFromUuid: async (_sysId, uuid) => ({
      item: { name: uuid },
      action: 'added',
      sourceFallbacks: uuid === 'Item.item-x'
        ? [{ itemName: 'Azuryt', brokenUuid: 'Compendium.missing.azuryt', fallbackUuid: uuid }]
        : []
    }),
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0, sourceFallbacks: [] })
  };

  const folders = new Map([
    ['folder1', {
      id: 'folder1',
      name: 'My Folder',
      contents: [
        { documentName: 'Item', uuid: 'Item.item-x' },
        { documentName: 'Item', uuid: 'Item.item-y' }
      ]
    }]
  ]);

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: (key, params) => { warnings.push({ key, params }); },
    notifyInfo: () => {},
    folders
  });

  await handler({ type: 'Folder', id: 'folder1', documentType: 'Item' });

  assert.deepEqual(warnings, [{ key: 'SourceFallbackSummary', params: { count: 1 } }]);
});

test('onDropItem integration — Folder import includes nested item folders and summary counts', async () => {
  const addCalls = [];
  const infos = [];
  const actions = new Map([
    ['Item.direct', 'added'],
    ['Item.nested-updated', 'updated'],
    ['Item.deep-skipped', 'skipped']
  ]);

  const mgr = {
    addItemFromUuid: async (_sysId, uuid) => {
      addCalls.push(uuid);
      return { item: { name: uuid }, action: actions.get(uuid) || 'skipped' };
    },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };

  const folders = new Map([
    ['root', {
      id: 'root',
      name: 'Root Folder',
      documentType: 'Item',
      contents: [
        { documentName: 'Item', uuid: 'Item.direct' },
        { documentName: 'Actor', uuid: 'Actor.ignored' }
      ],
      children: [{ folder: { id: 'nested', name: 'Nested', documentType: 'Item', contents: [{ documentName: 'Item', uuid: 'Item.nested-updated' }] } }]
    }],
    ['deep', {
      id: 'deep',
      name: 'Deep',
      documentType: 'Item',
      parent: 'nested',
      contents: [{ documentName: 'Item', uuid: 'Item.deep-skipped' }]
    }]
  ]);

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: () => {},
    notifyInfo: (key, params) => { infos.push({ key, params }); },
    folders
  });

  await handler({ type: 'Folder', id: 'root', documentType: 'Item' });

  assert.deepEqual(addCalls, ['Item.direct', 'Item.nested-updated', 'Item.deep-skipped']);
  assert.equal(infos[0].key, 'FolderImportSummary');
  assert.deepEqual(infos[0].params, {
    added: 1,
    updated: 1,
    skipped: 1,
    total: 3,
    name: 'Root Folder'
  });
});

test('onDropItem integration — Non-item folder shows empty notification and skips import', async () => {
  const addCalls = [];
  const infos = [];
  const mgr = {
    addItemFromUuid: async (...args) => { addCalls.push(args); return { item: {}, action: 'added' }; },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };
  const folders = new Map([
    ['actors', {
      id: 'actors',
      name: 'Actors',
      documentType: 'Actor',
      contents: [{ documentName: 'Item', uuid: 'Item.should-not-import' }]
    }]
  ]);

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: () => {},
    notifyInfo: (key, params) => { infos.push({ key, params }); },
    folders
  });

  await handler({ type: 'Folder', id: 'actors', documentType: 'Actor' });

  assert.equal(addCalls.length, 0);
  assert.equal(infos[0].key, 'FolderEmpty');
  assert.equal(infos[0].params.name, 'Actors');
});

test('onDropItem integration — Folder with no Items shows info notification and does not call addItemFromUuid', async () => {
  const addCalls = [];
  const infos = [];

  const mgr = {
    addItemFromUuid: async (...args) => { addCalls.push(args); return { item: {}, action: 'added' }; },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };

  const folders = new Map([
    ['folder-empty', {
      id: 'folder-empty',
      name: 'Empty Folder',
      contents: [
        { documentName: 'Actor', uuid: 'Actor.someone' }
      ]
    }]
  ]);

  const handler = buildFullOnDropItem({
    systemId: 'sys1',
    systemManager: mgr,
    notifyWarn: () => {},
    notifyInfo: (key, params) => { infos.push({ key, params }); },
    folders
  });

  await handler({ type: 'Folder', id: 'folder-empty', documentType: 'Item' });

  assert.equal(addCalls.length, 0, 'addItemFromUuid should not be called for empty folder');
  assert.equal(infos.length, 1);
  assert.equal(infos[0].key, 'FolderEmpty');
  assert.equal(infos[0].params.name, 'Empty Folder');
});

// ---------------------------------------------------------------------------
// T-297: DropNoSystemSelected — warn when no system is selected
// ---------------------------------------------------------------------------

test('onDropItem integration — single item drop with no system selected shows DropNoSystemSelected warning', async () => {
  const addCalls = [];
  const warnings = [];

  const mgr = {
    addItemFromUuid: async (...args) => { addCalls.push(args); return { item: {}, action: 'added' }; },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };

  const handler = buildFullOnDropItem({
    systemId: '',
    systemManager: mgr,
    notifyWarn: (key) => { warnings.push(key); },
    notifyInfo: () => {},
    folders: new Map()
  });

  await handler({ uuid: 'Item.some-item' });

  assert.equal(addCalls.length, 0, 'addItemFromUuid should not be called');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], 'DropNoSystemSelected');
});

test('onDropItem integration — folder drop with no system selected shows DropNoSystemSelected warning', async () => {
  const addCalls = [];
  const warnings = [];

  const mgr = {
    addItemFromUuid: async (...args) => { addCalls.push(args); return { item: {}, action: 'added' }; },
    addItemsFromPack: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 })
  };

  const folders = new Map([
    ['folder1', { name: 'My Folder', contents: [{ documentName: 'Item', uuid: 'Item.item-x' }] }]
  ]);

  const handler = buildFullOnDropItem({
    systemId: '',
    systemManager: mgr,
    notifyWarn: (key) => { warnings.push(key); },
    notifyInfo: () => {},
    folders
  });

  await handler({ type: 'Folder', id: 'folder1', documentType: 'Item' });

  assert.equal(addCalls.length, 0, 'addItemFromUuid should not be called');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], 'DropNoSystemSelected');
});

test('onDropItem integration — compendium pack drop with no system selected shows DropNoSystemSelected warning', async () => {
  const addCalls = [];
  const warnings = [];

  const mgr = {
    addItemFromUuid: async (...args) => { addCalls.push(args); return { item: {}, action: 'added' }; },
    addItemsFromPack: async (...args) => { addCalls.push(args); return { added: 0, updated: 0, skipped: 0, total: 0 }; }
  };

  const handler = buildFullOnDropItem({
    systemId: '',
    systemManager: mgr,
    notifyWarn: (key) => { warnings.push(key); },
    notifyInfo: () => {},
    folders: new Map()
  });

  await handler({ type: 'Compendium', collection: 'world.my-pack' });

  assert.equal(addCalls.length, 0, 'addItemsFromPack should not be called');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], 'DropNoSystemSelected');
});

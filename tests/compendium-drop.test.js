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
    img: 'coal.png'
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-coal');

  assert.equal(result.action, 'added');
  assert.equal(result.item.name, 'Fresh Coal');
  assert.equal(result.item.img, 'coal.png');
  assert.equal(result.item.sourceUuid, 'Compendium.world.pack.item-coal');
  assert.equal(mgr.getSystem('sys1').components.length, 1);

  globalThis.fromUuid = async () => null;
});

test('addItemFromUuid — exact match with differing metadata overwrites name/img and returns updated', async () => {
  const mgr = buildManager([{
    id: 'sys1',
    name: 'System One',
    items: [{ id: 'comp-1', name: 'Iron Ore', img: 'ore-old.png', sourceUuid: 'Compendium.world.pack.item-a' }]
  }]);

  globalThis.fromUuid = async () => ({
    documentName: 'Item',
    name: 'Updated Iron Ore',
    img: 'ore2.png'
  });

  const result = await mgr.addItemFromUuid('sys1', 'Compendium.world.pack.item-a');

  // Source resolved with different name/img — should be updated
  assert.equal(result.action, 'updated');
  assert.equal(result.item.id, 'comp-1');
  assert.equal(result.item.name, 'Updated Iron Ore');
  assert.equal(result.item.img, 'ore2.png');
  // System should still have only one item
  assert.equal(mgr.getSystem('sys1').components.length, 1);

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
  // sourceUuid updated to the dropped UUID
  assert.equal(result.item.sourceUuid, 'Compendium.world.pack.item-b');
  // Old sourceUuid pushed into fallbackItemIds
  assert.ok(result.item.fallbackItemIds.includes('Item.world-456'));
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
  return async (data) => {
    // Bulk compendium pack drop
    if (data?.type === 'Compendium' && data?.collection && !data?.uuid) {
      if (!systemId) {
        notifyWarn('DropNoSystemSelected');
        return;
      }
      const result = await systemManager.addItemsFromPack(systemId, data.collection);
      notifyInfo('BulkImportUpdated', result);
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
      const folderItems = (folder.contents || []).filter(d => d.documentName === 'Item');
      if (folderItems.length === 0) {
        notifyInfo('FolderEmpty', { name: folder.name });
        return;
      }
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const fi of folderItems) {
        const res = await systemManager.addItemFromUuid(systemId, fi.uuid);
        if (res.action === 'added') added++;
        else if (res.action === 'updated') updated++;
        else skipped++;
      }
      notifyInfo('FolderImportSummary', { added, name: folder.name });
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
    await systemManager.addItemFromUuid(systemId, uuid);
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

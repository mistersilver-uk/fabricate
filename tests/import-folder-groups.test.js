/**
 * Issue 771 — the per-folder collector for folder-aware bulk import. Groups a world
 * folder, an in-pack folder, and a whole pack into
 * `[{folderId, folderName, itemCount, itemUuids}]` — one row per distinct source folder
 * — WITHOUT `Folder#getSubfolders` (world-only) for the compendium cases.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFolderGroupsFromItems,
  collectWorldFolderGroups,
  descendantFolderIdSet,
  collectPackFolderGroups,
} from '../src/ui/svelte/util/importFolderGroups.js';

// ── buildFolderGroupsFromItems (pure core) ──────────────────────────────────

test('groups items by folder, preserves first-seen order, omits empty folders', () => {
  const groups = buildFolderGroupsFromItems(
    [
      { uuid: 'Item.a', folderId: 'f1' },
      { uuid: 'Item.b', folderId: 'f2' },
      { uuid: 'Item.c', folderId: 'f1' },
    ],
    { folderNames: new Map([['f1', 'Metals'], ['f2', 'Herbs']]) }
  );
  assert.deepEqual(groups, [
    { folderId: 'f1', folderName: 'Metals', itemCount: 2, itemUuids: ['Item.a', 'Item.c'] },
    { folderId: 'f2', folderName: 'Herbs', itemCount: 1, itemUuids: ['Item.b'] },
  ]);
});

test('files folderless items under the unfiled group and skips uuid-less rows', () => {
  const groups = buildFolderGroupsFromItems(
    [
      { uuid: 'Item.a', folderId: null },
      { uuid: '', folderId: 'f1' },
      { uuid: 'Item.b' },
    ],
    { unfiledName: '(No folder)' }
  );
  assert.deepEqual(groups, [
    { folderId: null, folderName: '(No folder)', itemCount: 2, itemUuids: ['Item.a', 'Item.b'] },
  ]);
});

// ── collectWorldFolderGroups ─────────────────────────────────────────────────

test('world folder: the dropped folder and each nested subfolder are their own row', () => {
  const nested = {
    id: 'nested',
    name: 'Ores',
    documentType: 'Item',
    contents: [{ documentName: 'Item', uuid: 'Item.ore' }],
  };
  const root = {
    id: 'root',
    name: 'Materials',
    documentType: 'Item',
    contents: [
      { documentName: 'Item', uuid: 'Item.direct' },
      { documentName: 'Actor', uuid: 'Actor.ignored' },
    ],
    children: [{ folder: nested }],
  };
  const groups = collectWorldFolderGroups(root, new Map());
  assert.deepEqual(groups, [
    { folderId: 'root', folderName: 'Materials', itemCount: 1, itemUuids: ['Item.direct'] },
    { folderId: 'nested', folderName: 'Ores', itemCount: 1, itemUuids: ['Item.ore'] },
  ]);
});

test('world folder: descendants discovered via the folders-collection parent fallback', () => {
  const root = {
    id: 'root',
    name: 'Root',
    documentType: 'Item',
    contents: [{ documentName: 'Item', uuid: 'Item.a' }],
  };
  const deep = {
    id: 'deep',
    name: 'Deep',
    documentType: 'Item',
    parent: 'root',
    contents: [{ documentName: 'Item', uuid: 'Item.b' }],
  };
  const folders = new Map([
    ['root', root],
    ['deep', deep],
  ]);
  const groups = collectWorldFolderGroups(root, folders);
  assert.deepEqual(
    groups.map((g) => [g.folderId, g.itemUuids]),
    [
      ['root', ['Item.a']],
      ['deep', ['Item.b']],
    ]
  );
});

test('world folder: a non-Item folder yields no groups', () => {
  const actors = {
    id: 'actors',
    name: 'Monsters',
    documentType: 'Actor',
    contents: [{ documentName: 'Item', uuid: 'Item.should-not-appear' }],
  };
  assert.deepEqual(collectWorldFolderGroups(actors, new Map()), []);
});

// ── descendantFolderIdSet ────────────────────────────────────────────────────

test('descendantFolderIdSet returns the inclusive subtree from parent links', () => {
  const parents = [
    { id: 'root', parentId: null },
    { id: 'child', parentId: 'root' },
    { id: 'grandchild', parentId: 'child' },
    { id: 'sibling', parentId: null },
  ];
  const subtree = descendantFolderIdSet('root', parents);
  assert.deepEqual([...subtree].sort(), ['child', 'grandchild', 'root']);
  assert.equal(subtree.has('sibling'), false);
});

test('descendantFolderIdSet returns null for a whole-pack drop (no root)', () => {
  assert.equal(descendantFolderIdSet(null, []), null);
});

// ── collectPackFolderGroups (whole pack + in-pack folder) ────────────────────

function fakePack() {
  return {
    collection: 'world.smithing',
    folders: [
      { id: 'metals', name: 'Metals', folder: null },
      { id: 'ores', name: 'Ores', folder: 'metals' },
      { id: 'herbs', name: 'Herbs', folder: null },
    ],
    // Index entries carry `.folder` (a default-indexed field) and a `.uuid` getter; no
    // document is loaded to read them.
    index: [
      { _id: 'a', name: 'Iron', folder: 'metals', uuid: 'Compendium.world.smithing.Item.a' },
      { _id: 'b', name: 'Copper Ore', folder: 'ores', uuid: 'Compendium.world.smithing.Item.b' },
      { _id: 'c', name: 'Sage', folder: 'herbs', uuid: 'Compendium.world.smithing.Item.c' },
      { _id: 'd', name: 'Loose', folder: null, uuid: 'Compendium.world.smithing.Item.d' },
    ],
  };
}

test('whole pack: every folder is a row, plus an unfiled row for pack-root items', () => {
  const groups = collectPackFolderGroups(fakePack(), { unfiledName: '(No folder)' });
  assert.deepEqual(groups, [
    { folderId: 'metals', folderName: 'Metals', itemCount: 1, itemUuids: ['Compendium.world.smithing.Item.a'] },
    { folderId: 'ores', folderName: 'Ores', itemCount: 1, itemUuids: ['Compendium.world.smithing.Item.b'] },
    { folderId: 'herbs', folderName: 'Herbs', itemCount: 1, itemUuids: ['Compendium.world.smithing.Item.c'] },
    { folderId: null, folderName: '(No folder)', itemCount: 1, itemUuids: ['Compendium.world.smithing.Item.d'] },
  ]);
});

test('in-pack folder: only the dropped folder and its descendants are grouped (no getSubfolders)', () => {
  const groups = collectPackFolderGroups(fakePack(), { rootFolderId: 'metals' });
  // Metals + its nested Ores subfolder; Herbs and the loose item are excluded.
  assert.deepEqual(
    groups.map((g) => [g.folderId, g.itemUuids]),
    [
      ['metals', ['Compendium.world.smithing.Item.a']],
      ['ores', ['Compendium.world.smithing.Item.b']],
    ]
  );
});

test('pack index entry with no uuid falls back to a packId-built compendium uuid', () => {
  const pack = {
    collection: 'world.smithing',
    folders: [{ id: 'metals', name: 'Metals', folder: null }],
    index: [{ _id: 'z', name: 'Tin', folder: 'metals' }],
  };
  const groups = collectPackFolderGroups(pack);
  assert.deepEqual(groups[0].itemUuids, ['Compendium.world.smithing.Item.z']);
});

/**
 * Issue 771 — the COMPOSITION seams between the drop handler, the per-folder collector,
 * and the set-apply primitive. The pure helpers are covered elsewhere; this pins the
 * wiring the regression risk actually lives in:
 *
 *  (a) the `collectImportFolderGroups` divert decision — which drops open the mapping
 *      modal (groups), which fall through to the one-shot import (passthrough), and which
 *      are handled-with-a-notice (the compendium-directory descope). The Foundry drop
 *      resolution is mocked exactly as the collector tests mock it; the group-level
 *      decision uses the REAL `hasRealFolderGroups` + collector functions.
 *  (b) the `commitImportFolderMapping` import→apply loop, exercised through the REAL
 *      exported `applyFolderImportDecisions` against a REAL `CraftingSystemManager`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  collectWorldFolderGroups,
  collectPackFolderGroups,
  hasRealFolderGroups,
  applyFolderImportDecisions,
} from '../src/ui/svelte/util/importFolderGroups.js';

// ── (a) divert decision table ────────────────────────────────────────────────
//
// Mirrors the branch STRUCTURE of `SvelteCraftingSystemManagerApp.collectImportFolderGroups`
// (single-item / whole-pack / folder / compendium-directory), delegating the actual
// grouping to the real collector + the real `hasRealFolderGroups` divert. Returns a plan
// tag the same way `dropComponent` reads it: 'modal' (open modal), 'passthrough' (fall to
// onDropItem), or 'handled' (collector already notified, do not fall through).
function classifyImportDrop(data, { resolveFolder, getPack, notify }) {
  const unfiledName = 'Ungrouped';
  const planFor = (groups) =>
    hasRealFolderGroups(groups) ? { plan: 'modal', groups } : { plan: 'passthrough' };

  if (data?.type === 'Compendium' && data?.collection && !data?.uuid) {
    const pack = getPack(data.collection);
    if (!pack || pack.metadata?.type !== 'Item') return { plan: 'passthrough' };
    return planFor(collectPackFolderGroups(pack, { unfiledName }));
  }
  if (data?.type === 'Folder') {
    const folder = resolveFolder(data);
    if (!folder) return { plan: 'passthrough' };
    const docType = folder.documentType || folder.type || '';
    if (docType === 'Compendium') {
      notify('CompendiumDirectorySkipped');
      return { plan: 'handled' };
    }
    if (folder.pack) {
      const pack = getPack(folder.pack);
      if (!pack || pack.metadata?.type !== 'Item') return { plan: 'passthrough' };
      return planFor(collectPackFolderGroups(pack, { rootFolderId: folder.id, unfiledName }));
    }
    if (docType && docType !== 'Item') return { plan: 'passthrough' };
    return planFor(collectWorldFolderGroups(folder, null));
  }
  return { plan: 'passthrough' };
}

const REAL_FOLDER = {
  id: 'reagent',
  name: 'Reagent',
  documentType: 'Item',
  contents: [{ documentName: 'Item', uuid: 'Item.a' }],
};
const EMPTY_FOLDER = { id: 'empty', name: 'Empty', documentType: 'Item', contents: [] };
const ACTOR_FOLDER = {
  id: 'monsters',
  name: 'Monsters',
  documentType: 'Actor',
  contents: [{ documentName: 'Item', uuid: 'Item.x' }],
};
const DIRECTORY_FOLDER = { id: 'packs', name: 'Packs', documentType: 'Compendium' };
const ITEM_PACK_WITH_FOLDERS = {
  collection: 'world.smithing',
  metadata: { type: 'Item' },
  folders: [{ id: 'metals', name: 'Metals', folder: null }],
  index: [{ _id: 'a', folder: 'metals', uuid: 'Compendium.world.smithing.Item.a' }],
};
const ITEM_PACK_NO_FOLDERS = {
  collection: 'world.flat',
  metadata: { type: 'Item' },
  folders: [],
  index: [{ _id: 'a', folder: null, uuid: 'Compendium.world.flat.Item.a' }],
};

function deps({ folder = null, pack = null } = {}) {
  const notices = [];
  return {
    notices,
    resolveFolder: () => folder,
    getPack: () => pack,
    notify: (key) => notices.push(key),
  };
}

test('hasRealFolderGroups: only a group set with a real folder warrants the modal', () => {
  assert.equal(hasRealFolderGroups([]), false);
  assert.equal(hasRealFolderGroups([{ folderId: null }]), false); // unfiled-only pack
  assert.equal(hasRealFolderGroups([{ folderId: 'f1' }]), true);
});

test('a single-item drop is passthrough (unchanged one-shot import)', () => {
  assert.equal(classifyImportDrop({ type: 'Item', uuid: 'Item.a' }, deps()).plan, 'passthrough');
});

test('a whole pack with folders opens the modal; a folderless pack is passthrough', () => {
  assert.equal(
    classifyImportDrop({ type: 'Compendium', collection: 'world.smithing' }, deps({ pack: ITEM_PACK_WITH_FOLDERS })).plan,
    'modal'
  );
  assert.equal(
    classifyImportDrop({ type: 'Compendium', collection: 'world.flat' }, deps({ pack: ITEM_PACK_NO_FOLDERS })).plan,
    'passthrough'
  );
});

test('a world Item folder with items opens the modal; empty / non-Item are passthrough', () => {
  assert.equal(
    classifyImportDrop({ type: 'Folder', uuid: 'Folder.reagent' }, deps({ folder: REAL_FOLDER })).plan,
    'modal'
  );
  assert.equal(
    classifyImportDrop({ type: 'Folder', uuid: 'Folder.empty' }, deps({ folder: EMPTY_FOLDER })).plan,
    'passthrough'
  );
  assert.equal(
    classifyImportDrop({ type: 'Folder', uuid: 'Folder.monsters' }, deps({ folder: ACTOR_FOLDER })).plan,
    'passthrough'
  );
});

test('a compendium-directory folder is handled with a single notice (no fall-through)', () => {
  const d = deps({ folder: DIRECTORY_FOLDER });
  const result = classifyImportDrop({ type: 'Folder', uuid: 'Folder.packs' }, d);
  assert.equal(result.plan, 'handled');
  assert.deepEqual(d.notices, ['CompendiumDirectorySkipped']);
});

// ── (b) commit import→apply loop (REAL manager) ──────────────────────────────

let idCounter = 0;
globalThis.foundry = {
  utils: { randomID: () => `random-${++idCounter}`, getProperty: () => undefined },
};
globalThis.game = { user: { isGM: true } };
const RESOLVED = {
  'Item.a': { documentName: 'Item', name: 'Iron', img: 'iron.png' },
  'Item.b': { documentName: 'Item', name: 'Sage', img: 'sage.png' },
  'Item.c': { documentName: 'Item', name: 'Cog', img: 'cog.png' },
};
globalThis.fromUuid = async (uuid) => RESOLVED[uuid] || null;

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function buildManager() {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.systems.set(
    'sys1',
    manager._normalizeSystem({ id: 'sys1', name: 'System One', componentCategories: ['Reagent'], items: [] })
  );
  manager.initialized = true;
  manager.save = async () => {};
  return manager;
}

test('commit imports each folder and applies its category + tags to the imported set', async () => {
  const manager = buildManager();
  const summary = await applyFolderImportDecisions(manager, 'sys1', [
    { itemUuids: ['Item.a', 'Item.b'], category: 'Reagent', addTags: ['herb'] },
  ]);
  assert.equal(summary.added, 2);
  assert.equal(summary.total, 2);
  const components = manager.getSystem('sys1').components;
  assert.equal(components.length, 2);
  for (const component of components) {
    assert.equal(component.category, 'Reagent');
    assert.deepEqual(component.tags, ['herb']);
  }
});

test('a folder excluded from the decisions (skipped) does not import its items', async () => {
  const manager = buildManager();
  // Only the Reagent folder is in the decisions; the Widgets folder was Skipped in the
  // modal and never reaches the commit, so Item.c is never imported.
  await applyFolderImportDecisions(manager, 'sys1', [
    { itemUuids: ['Item.a'], category: 'Reagent', addTags: [] },
  ]);
  const components = manager.getSystem('sys1').components;
  assert.equal(components.length, 1);
  assert.equal(components[0].name, 'Iron');
});

test('re-dropping a folder re-categorizes the existing (skipped) component (overwrite-on-redrop)', async () => {
  const manager = buildManager();
  await applyFolderImportDecisions(manager, 'sys1', [
    { itemUuids: ['Item.a'], category: 'Reagent', addTags: ['herb'] },
  ]);
  // Second drop of the SAME item resolves to action 'skipped' (already imported) but the
  // mapping is still applied to that existing component — the deliberate overwrite.
  const summary = await applyFolderImportDecisions(manager, 'sys1', [
    { itemUuids: ['Item.a'], category: 'general', addTags: ['rare'] },
  ]);
  assert.equal(summary.skipped, 1);
  const component = manager.getSystem('sys1').components[0];
  assert.deepEqual(component.tags, ['herb', 'rare'], 'tags unioned across both drops');
});

test('a decision with no category and no tags still imports but applies nothing', async () => {
  const manager = buildManager();
  const summary = await applyFolderImportDecisions(manager, 'sys1', [
    { itemUuids: ['Item.c'], category: '', addTags: [] },
  ]);
  assert.equal(summary.added, 1);
  const component = manager.getSystem('sys1').components[0];
  assert.equal(component.category, 'general');
  assert.deepEqual(component.tags, []);
});

// ── (c) write amplification (issue 1086) ─────────────────────────────────────
//
// `save()` replaces the WHOLE `craftingSystems` world setting and replicates it to every
// connected client, so a per-item save makes a folder import quadratic in corpus size.
// These are counter assertions, not timings: the invariant is the number of corpus
// writes, and it must grow with neither the item count nor the folder count.

const BASE_FROM_UUID = globalThis.fromUuid;

/** Resolve `Item.bulk-<n>` to a synthetic Item, falling back to the shared fixtures. */
function installBulkUuidResolver(overrides = {}) {
  globalThis.fromUuid = async (uuid) => {
    if (Object.hasOwn(overrides, uuid)) return overrides[uuid];
    if (String(uuid).startsWith('Item.bulk-')) {
      return { documentName: 'Item', name: `Bulk ${uuid}`, img: 'bulk.png' };
    }
    return BASE_FROM_UUID(uuid);
  };
}

/** Replace a manager's `save` with a counting stub; returns the record. */
function countCorpusWrites(manager) {
  const record = { calls: 0 };
  manager.save = async () => {
    record.calls += 1;
  };
  return record;
}

/** `folders` decisions of `perFolder` items each, every folder carrying a mapping. */
function mappedDecisions(folders, perFolder, prefix) {
  return Array.from({ length: folders }, (_, folderIndex) => ({
    itemUuids: Array.from(
      { length: perFolder },
      (_, itemIndex) => `Item.bulk-${prefix}-${folderIndex}-${itemIndex}`
    ),
    category: 'Reagent',
    addTags: ['herb'],
  }));
}

test('folder import commit — ONE corpus write for the whole run, whatever the item and folder count', async () => {
  installBulkUuidResolver();

  const small = buildManager();
  const smallWrites = countCorpusWrites(small);
  const smallSummary = await applyFolderImportDecisions(small, 'sys1', mappedDecisions(1, 2, 's'));

  const large = buildManager();
  const largeWrites = countCorpusWrites(large);
  const largeSummary = await applyFolderImportDecisions(large, 'sys1', mappedDecisions(3, 10, 'l'));

  globalThis.fromUuid = BASE_FROM_UUID;

  assert.equal(smallSummary.added, 2, 'the small run must actually import its items');
  assert.equal(largeSummary.added, 30, 'the large run must actually import its items');
  assert.equal(smallWrites.calls, 1, 'a 1-folder / 2-item run writes the corpus once');
  assert.equal(largeWrites.calls, 1, 'a 3-folder / 30-item run writes the corpus once');
  assert.equal(
    largeWrites.calls,
    smallWrites.calls,
    'the write count must be independent of both the item count and the folder count'
  );
  // Unbatched this run cost 30 item writes PLUS 3 per-folder set-apply writes, so the
  // per-folder mapping is inside the bound too, not just the import loop.
  const components = large.getSystem('sys1').components;
  assert.equal(components.length, 30);
  assert.ok(
    components.every((component) => component.category === 'Reagent'),
    'the single write must carry every folder mapping'
  );
});

test('folder import commit — the collaborators still write per call when nothing batches them (positive control)', async () => {
  installBulkUuidResolver();
  const manager = buildManager();
  const writes = countCorpusWrites(manager);

  // The same four imports the commit loop would make, issued directly at the default
  // `persist`. The counter DOES move with item count here, which is what makes the
  // `calls === 1` above a statement about batching rather than a stub that never fires.
  const ids = [];
  for (const uuid of ['Item.bulk-c-0', 'Item.bulk-c-1', 'Item.bulk-c-2', 'Item.bulk-c-3']) {
    const result = await manager.addItemFromUuid('sys1', uuid);
    ids.push(result.item.id);
  }
  assert.equal(writes.calls, 4, 'each single-item import persists immediately, one write each');

  // And the set-apply primitive still persists on its own, so the new `persist` option did
  // not silently un-persist the GM browser's one-shot bulk edit.
  await manager.applyBulkEditToComponents('sys1', ids, { category: 'Reagent' });
  assert.equal(writes.calls, 5, 'an unbatched bulk edit still issues its own write');

  globalThis.fromUuid = BASE_FROM_UUID;
});

test('folder import commit — an all-skipped, unmapped re-drop writes the corpus zero times', async () => {
  installBulkUuidResolver();
  const manager = buildManager();
  const decisions = [{ itemUuids: ['Item.bulk-r-0', 'Item.bulk-r-1'], category: '', addTags: [] }];
  await applyFolderImportDecisions(manager, 'sys1', decisions);

  const writes = countCorpusWrites(manager);
  const summary = await applyFolderImportDecisions(manager, 'sys1', decisions);

  globalThis.fromUuid = BASE_FROM_UUID;

  assert.equal(summary.skipped, 2);
  assert.equal(writes.calls, 0, 'nothing changed in the corpus, so nothing is written');
});

test('folder import commit — a mid-run failure flushes what was imported and still throws', async () => {
  installBulkUuidResolver({
    'Item.bulk-f-3': { documentName: 'Actor', name: 'Not an item' },
  });
  const manager = buildManager();
  const writes = countCorpusWrites(manager);

  await assert.rejects(
    () =>
      applyFolderImportDecisions(manager, 'sys1', [
        {
          itemUuids: ['Item.bulk-f-0', 'Item.bulk-f-1', 'Item.bulk-f-2', 'Item.bulk-f-3'],
          category: '',
          addTags: [],
        },
      ]),
    /Cannot add non-Item document/,
    'the failure must still surface to the caller'
  );

  globalThis.fromUuid = BASE_FROM_UUID;

  assert.equal(writes.calls, 1, 'the partial run is flushed by exactly one write');
  assert.equal(
    manager.getSystem('sys1').components.length,
    3,
    'the imports preceding the failure must be persisted, not lost'
  );
});

// ── (d) the plain folder drop delegates to the batched commit loop ────────────
//
// `SvelteCraftingSystemManagerApp`'s `onDropItem` Folder branch is not importable in
// isolation (the module builds a Foundry ApplicationV2 subclass at import time), and the
// `onDropItem` integration tests elsewhere exercise a hand-written MIRROR of it — which
// keeps passing however the real branch is written. This pins the real file: the branch
// must delegate to the batched `applyFolderImportDecisions` and must not re-inline a
// per-item import loop, which is what made a folder drop quadratic.

const APP_SOURCE = readFileSync(
  new URL('../src/ui/SvelteCraftingSystemManagerApp.svelte.js', import.meta.url),
  'utf8'
);

test('the app folder drop delegates to applyFolderImportDecisions and does not loop addItemFromUuid', () => {
  const folderBranch = APP_SOURCE.slice(
    APP_SOURCE.indexOf("if (data?.type === 'Folder')"),
    APP_SOURCE.indexOf('// Single item drop')
  );
  assert.ok(folderBranch.length > 0, 'the Folder branch of onDropItem must still be findable');
  assert.ok(
    folderBranch.includes('applyFolderImportDecisions('),
    'the Folder branch must delegate to the batched commit loop'
  );
  assert.ok(
    !folderBranch.includes('addItemFromUuid('),
    'the Folder branch must not re-inline a per-item import loop'
  );
  // The single-item drop path is deliberately NOT batched: it is its own batch of one and
  // must keep persisting immediately, so exactly one direct call survives in the file.
  assert.equal(
    APP_SOURCE.split('addItemFromUuid(').length - 1,
    1,
    'only the single-item drop may call addItemFromUuid directly'
  );
});

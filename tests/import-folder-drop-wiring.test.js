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

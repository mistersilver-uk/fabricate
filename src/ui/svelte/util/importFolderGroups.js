/**
 * Per-folder collector for folder-aware bulk import (issue 771).
 *
 * The existing `collectFolderItems` / `collectCompendiumFolderItemUuids` helpers in
 * `SvelteCraftingSystemManagerApp.svelte.js` FLATTEN a folder drop to a single UUID
 * list, discarding the folder provenance the mapping UI needs. This module groups the
 * same drops into `[{ folderId, folderName, itemCount, itemUuids }]` — one row per
 * distinct source folder (the dropped folder AND each nested subfolder), so the GM can
 * assign a category/tags per folder before the import commits.
 *
 * Two facts drive the compendium path (foundry-integrator, v13/v14):
 *  - Folder membership is read from `pack.index[].folder` — a DEFAULT-indexed Item
 *    field, so no document is loaded — grouped by folder, with display names from
 *    `pack.folders`.
 *  - `Folder#getSubfolders` filters `game.folders` (world-only) and returns `[]` for a
 *    packed folder, so it is deliberately NOT used here (the flat
 *    `collectCompendiumFolderItemUuids` relied on it and silently dropped nested in-pack
 *    items). Descendants are computed from the `pack.folders` parent links instead.
 *
 * Everything here is pure and Foundry-global-free: the app resolves the live Folder /
 * pack objects and passes them in, and the unit tests pass plain fixtures of the same
 * shape.
 */

/** Values of a folder collection, tolerating a Map, an array, or a `.contents` list. */
function folderCollectionValues(folders) {
  if (!folders) return [];
  if (Array.isArray(folders)) return folders;
  if (folders instanceof Map) return Array.from(folders.values());
  if (typeof folders.values === 'function') return Array.from(folders.values());
  if (Array.isArray(folders.contents)) return folders.contents;
  return [];
}

/** A folder document's own document type, across the shapes Foundry/tests expose. */
function folderDocumentType(folder) {
  return folder?.documentType || folder?.type || folder?.folderDocumentType || '';
}

/** The immediate child folders of `folder`, from its own `children` or the collection. */
function folderChildFolders(folder, folders) {
  const explicit = Array.isArray(folder?.children) ? folder.children : [];
  const explicitChildren = explicit
    .map((child) => child?.folder || child)
    .filter((child) => child && child !== folder);
  const collectionChildren = folderCollectionValues(folders).filter(
    (candidate) =>
      candidate?.folder?.id === folder?.id ||
      candidate?.parent?.id === folder?.id ||
      candidate?.parent === folder?.id
  );
  return [...explicitChildren, ...collectionChildren];
}

/**
 * Group a flat list of `{ uuid, folderId }` item rows into folder groups, omitting
 * folders with no items and preserving first-seen order. A row with no `folderId`
 * (a whole-pack item filed at pack root) collects under the `unfiledName` group.
 *
 * @param {Array<{uuid: string, folderId?: string|null}>} items
 * @param {{ folderNames?: Map<string,string>, unfiledName?: string }} [options]
 * @returns {Array<{folderId: string|null, folderName: string, itemCount: number, itemUuids: string[]}>}
 */
export function buildFolderGroupsFromItems(items, { folderNames, unfiledName = '' } = {}) {
  const names = folderNames instanceof Map ? folderNames : new Map();
  const order = [];
  const byFolder = new Map();
  for (const { uuid, folderId } of items || []) {
    if (!uuid) continue;
    const key = folderId ? String(folderId) : '';
    if (!byFolder.has(key)) {
      byFolder.set(key, []);
      order.push(key);
    }
    byFolder.get(key).push(uuid);
  }
  return order.map((key) => ({
    folderId: key || null,
    folderName: key ? names.get(key) || key : unfiledName,
    itemCount: byFolder.get(key).length,
    itemUuids: byFolder.get(key),
  }));
}

/**
 * Collect per-folder groups from a resolved WORLD folder document. Traverses the
 * dropped folder plus its descendant Item folders (depth-first, cycle-guarded), keeping
 * each folder's own items attributed to that folder. Non-Item folders yield no items.
 *
 * @param {object} folder the resolved world Folder document.
 * @param {*} folders the `game.folders` collection (for the child-lookup fallback).
 * @returns {Array<{folderId: string|null, folderName: string, itemCount: number, itemUuids: string[]}>}
 */
export function collectWorldFolderGroups(folder, folders) {
  const items = [];
  const folderNames = new Map();
  const visited = new Set();
  const walk = (current) => {
    if (!current?.id || visited.has(current.id)) return;
    visited.add(current.id);
    if (folderDocumentType(current) && folderDocumentType(current) !== 'Item') return;
    folderNames.set(String(current.id), current.name || String(current.id));
    for (const document of current.contents || []) {
      if (document?.documentName === 'Item' && document?.uuid) {
        items.push({ uuid: document.uuid, folderId: current.id });
      }
    }
    for (const child of folderChildFolders(current, folders)) walk(child);
  };
  walk(folder);
  return buildFolderGroupsFromItems(items, { folderNames });
}

/**
 * Whether a collected group list warrants the mapping modal: it must carry at least one
 * REAL source folder. A drop that resolves to only the folderless "unfiled" group (a pack
 * with no folder structure) has nothing to categorize per-folder, so it falls back to the
 * one-shot import instead of opening the modal. This is the group-level divert decision
 * shared by every branch of `collectImportFolderGroups`.
 *
 * @param {Array<{folderId: string|null}>} groups
 * @returns {boolean}
 */
export function hasRealFolderGroups(groups) {
  return Array.isArray(groups) && groups.some((group) => group.folderId);
}

/**
 * Import each non-skipped folder decision's items, then apply that folder's category and
 * tags to the freshly imported component set via the manager's set-apply primitive (one
 * `save()` per folder). The shared commit loop behind the import mapping modal (issue
 * 771); Foundry-global-free — the caller injects the `systemManager` so it is unit
 * testable against a real `CraftingSystemManager`.
 *
 * @param {{
 *   addItemFromUuid: (systemId: string, uuid: string) => Promise<{item?: {id?: string}, action: string, sourceFallbacks?: Array}>,
 *   applyCategoryAndTagsToComponents: (systemId: string, ids: string[], mapping: object) => Promise<object>
 * }} systemManager
 * @param {string} systemId
 * @param {Array<{itemUuids?: string[], category?: string, addTags?: string[]}>} decisions
 * @returns {Promise<{added: number, updated: number, skipped: number, total: number, sourceFallbacks: Array}>}
 */
export async function applyFolderImportDecisions(systemManager, systemId, decisions) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let total = 0;
  const sourceFallbacks = [];
  for (const decision of decisions || []) {
    const itemUuids = Array.isArray(decision.itemUuids) ? decision.itemUuids : [];
    const importedIds = [];
    for (const itemUuid of itemUuids) {
      total += 1;
      const result = await systemManager.addItemFromUuid(systemId, itemUuid);
      if (result.action === 'added') added += 1;
      else if (result.action === 'updated') updated += 1;
      else skipped += 1;
      if (result.item?.id) importedIds.push(result.item.id);
      if (Array.isArray(result.sourceFallbacks)) sourceFallbacks.push(...result.sourceFallbacks);
    }
    const addTags = Array.isArray(decision.addTags) ? decision.addTags : [];
    if (importedIds.length > 0 && (decision.category || addTags.length > 0)) {
      // Applied to EVERY imported id, INCLUDING a 'skipped' (re-dropped, already-existing)
      // component: re-dropping a folder deliberately re-categorizes its items, so the
      // overwrite-on-redrop here is intended, not a leak.
      await systemManager.applyCategoryAndTagsToComponents(systemId, importedIds, {
        category: decision.category || '',
        addTags,
      });
    }
  }
  return { added, updated, skipped, total, sourceFallbacks };
}

/** A pack folder document's parent folder id, across the shapes v13 exposes. */
function packFolderParentId(packFolder) {
  const parent = packFolder?.folder ?? packFolder?.parent ?? packFolder?._source?.folder;
  if (!parent) return null;
  return typeof parent === 'object' ? parent.id || null : String(parent);
}

/** A pack index entry's folder id (the entry's `.folder` is an id or a Folder object). */
function packEntryFolderId(entry) {
  const folder = entry?.folder;
  if (!folder) return null;
  return typeof folder === 'object' ? folder.id || null : String(folder);
}

/** The compendium UUID of a pack index entry, built from the packId when not present. */
function packEntryUuid(entry, packId) {
  if (entry?.uuid) return entry.uuid;
  const id = entry?._id || entry?.id;
  return id ? `Compendium.${packId}.Item.${id}` : null;
}

/**
 * The set of folder ids in the subtree rooted at `rootFolderId` (inclusive), derived
 * from `pack.folders` parent links — the world-only `Folder#getSubfolders` is never
 * used. Returns `null` for a whole-pack drop (no root: every folder qualifies).
 *
 * @param {string|null} rootFolderId
 * @param {Array<{id: string, parentId: string|null}>} folderParents
 * @returns {Set<string>|null}
 */
export function descendantFolderIdSet(rootFolderId, folderParents) {
  if (!rootFolderId) return null;
  const childrenByParent = new Map();
  for (const { id, parentId } of folderParents || []) {
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(id);
  }
  const subtree = new Set([String(rootFolderId)]);
  const queue = [String(rootFolderId)];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of childrenByParent.get(current) || []) {
      if (subtree.has(child)) continue;
      subtree.add(child);
      queue.push(child);
    }
  }
  return subtree;
}

/**
 * Collect per-folder groups from a compendium pack, for both the whole-pack drop
 * (`rootFolderId` omitted → every folder) and the in-pack-folder drop (`rootFolderId`
 * set → that folder plus its descendants). Membership comes from `pack.index[].folder`
 * grouped by folder, with names from `pack.folders` — no document is loaded.
 *
 * @param {{collection?: string, metadata?: {id?: string}, index?: Iterable, folders?: Iterable}} pack
 * @param {{ rootFolderId?: string|null, unfiledName?: string }} [options]
 * @returns {Array<{folderId: string|null, folderName: string, itemCount: number, itemUuids: string[]}>}
 */
export function collectPackFolderGroups(pack, { rootFolderId = null, unfiledName = '' } = {}) {
  const packId = pack?.collection || pack?.metadata?.id || '';
  const packFolders = Array.from(pack?.folders || []);
  const folderNames = new Map();
  const folderParents = [];
  for (const packFolder of packFolders) {
    if (!packFolder?.id) continue;
    folderNames.set(String(packFolder.id), packFolder.name || String(packFolder.id));
    folderParents.push({ id: String(packFolder.id), parentId: packFolderParentId(packFolder) });
  }

  const subtree = descendantFolderIdSet(rootFolderId, folderParents);
  const items = [];
  for (const entry of pack?.index || []) {
    const uuid = packEntryUuid(entry, packId);
    if (!uuid) continue;
    const folderId = packEntryFolderId(entry);
    // In-pack-folder drop: keep only entries inside the dropped subtree. Whole-pack
    // drop (subtree === null): keep every entry, filing folderless ones under unfiled.
    if (subtree && !(folderId && subtree.has(folderId))) continue;
    items.push({ uuid, folderId });
  }
  return buildFolderGroupsFromItems(items, { folderNames, unfiledName });
}

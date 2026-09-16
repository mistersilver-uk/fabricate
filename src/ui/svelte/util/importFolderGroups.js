// Per-folder collector for folder-aware bulk import (issue 771). The app's flat collectors discard
// the folder PROVENANCE the mapping UI needs, so this groups the same drops one row per distinct
// source folder — the dropped folder and each nested subfolder — for a per-folder category and tags.
// Two facts drive the compendium path on v13/v14: membership is read from `pack.index[].folder`, a
// DEFAULT-indexed field, so no document is loaded; and `Folder#getSubfolders` filters `game.folders`
// and returns `[]` for a PACKED folder, so descendants come from `pack.folders` parent links instead
// — relying on it silently dropped nested in-pack items.
// Pure and Foundry-global-free: the app resolves the live Folder and pack objects and passes them in.

function folderCollectionValues(folders) {
  if (!folders) return [];
  if (Array.isArray(folders)) return folders;
  if (folders instanceof Map) return Array.from(folders.values());
  if (typeof folders.values === 'function') return Array.from(folders.values());
  if (Array.isArray(folders.contents)) return folders.contents;
  return [];
}

function folderDocumentType(folder) {
  return folder?.documentType || folder?.type || folder?.folderDocumentType || '';
}

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

// Omits empty folders and preserves first-seen order; a row with no `folderId` — an item filed at
// pack root — collects under the `unfiledName` group.
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

// Depth-first and cycle-guarded over the dropped folder and its descendant Item folders, keeping
// each folder's own items attributed to it. A non-Item folder yields no items.
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

// The modal needs at least one REAL source folder: a drop resolving only to the folderless
// "unfiled" group has nothing to categorize per folder, so it falls back to the one-shot import.
// This is the divert decision every branch of `collectImportFolderGroups` shares.
export function hasRealFolderGroups(groups) {
  return Array.isArray(groups) && groups.some((group) => group.folderId);
}

// The shared commit loop behind the import mapping modal (issue 771), with the `systemManager`
// injected so it is testable against a real `CraftingSystemManager`.
// The WHOLE run is persisted by ONE `save()` at the end (issue 1086): each `save()` replaces the
// entire `craftingSystems` world setting and replicates it to every client, so the per-item write
// this used to issue made a folder import quadratic in corpus size. Both collaborator calls run
// with `persist: false` and this function owns the single terminal write.
// `save` is optional-chained so a synchronous-storing mock manager stays a valid injection.
export async function applyFolderImportDecisions(systemManager, systemId, decisions) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let total = 0;
  const sourceFallbacks = [];
  // A run whose every item is already present AND whose folders carry no category or tags mutates
  // nothing, so it writes nothing.
  let dirty = false;
  try {
    for (const decision of decisions || []) {
      const itemUuids = Array.isArray(decision.itemUuids) ? decision.itemUuids : [];
      const importedIds = [];
      for (const itemUuid of itemUuids) {
        total += 1;
        const result = await systemManager.addItemFromUuid(systemId, itemUuid, {
          persist: false,
        });
        if (result.action === 'added') added += 1;
        else if (result.action === 'updated') updated += 1;
        else skipped += 1;
        if (result.action !== 'skipped') dirty = true;
        if (result.item?.id) importedIds.push(result.item.id);
        if (Array.isArray(result.sourceFallbacks)) sourceFallbacks.push(...result.sourceFallbacks);
      }
      const addTags = Array.isArray(decision.addTags) ? decision.addTags : [];
      if (importedIds.length > 0 && (decision.category || addTags.length > 0)) {
        // Applied to EVERY imported id, including a skipped (already-existing) one: re-dropping a
        // folder deliberately re-categorizes its items. Import stages only the two axes it owns and
        // supplies neither `essences` nor `difficulty`, so the primitive's presence guard is false
        // for both and an import never clears a component's essences or DC (issue 772).
        const applied = await systemManager.applyBulkEditToComponents(
          systemId,
          importedIds,
          { category: decision.category || '', addTags },
          { persist: false }
        );
        if (applied?.updated > 0) dirty = true;
      }
    }
  } finally {
    // `finally`, not a trailing statement: an item throwing part-way through must still persist
    // what was already committed, which the per-item writes gave for free. The error propagates.
    if (dirty) await systemManager.save?.();
  }
  return { added, updated, skipped, total, sourceFallbacks };
}

function packFolderParentId(packFolder) {
  const parent = packFolder?.folder ?? packFolder?.parent ?? packFolder?._source?.folder;
  if (!parent) return null;
  return typeof parent === 'object' ? parent.id || null : String(parent);
}

function packEntryFolderId(entry) {
  const folder = entry?.folder;
  if (!folder) return null;
  return typeof folder === 'object' ? folder.id || null : String(folder);
}

function packEntryUuid(entry, packId) {
  if (entry?.uuid) return entry.uuid;
  const id = entry?._id || entry?.id;
  return id ? `Compendium.${packId}.Item.${id}` : null;
}

// Derived from `pack.folders` parent links; the world-only `Folder#getSubfolders` is never used.
// `null` means a whole-pack drop, where every folder qualifies.
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

// Serves the whole-pack drop and the in-pack-folder drop alike. No document is loaded.
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
    // A null subtree is the whole-pack drop: keep every entry, filing folderless ones as unfiled.
    if (subtree && !(folderId && subtree.has(folderId))) continue;
    items.push({ uuid, folderId });
  }
  return buildFolderGroupsFromItems(items, { folderNames, unfiledName });
}

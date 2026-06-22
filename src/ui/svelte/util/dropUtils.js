/**
 * Resolves a Foundry document UUID from drag-and-drop event data.
 *
 * Foundry emits different shapes depending on the drag source:
 *   - World sidebar item:   { uuid: "Item.abc123" }
 *   - Compendium item:      { pack: "dnd5e.items", id: "xyz789" }  (no uuid property)
 *   - Both:                 uuid wins when present
 *
 * Returns null if neither a uuid nor a valid pack+id pair can be found.
 *
 * @param {object|null|undefined} data - The parsed drag event data object
 * @returns {string|null} Resolved UUID string, or null
 */
export function resolveDropUuid(data) {
  if (!data) return null;
  if (data.uuid) return data.uuid;
  if (data.pack && data.id) return `Compendium.${data.pack}.${data.id}`;
  return null;
}

/**
 * Extracts a Folder document id from Foundry folder drag data.
 *
 * Foundry v13+ folder drags emit { type: "Folder", uuid: "Folder.<id>" } — there
 * is no bare `id` property. Older/legacy shapes used { type: "Folder", id: "<id>" }.
 * Support both so dropping a folder resolves a real Folder document instead of
 * silently no-opping when `data.id` is absent.
 *
 * @param {object|null|undefined} data - The parsed drag event data object
 * @returns {string|null} The Folder document id, or null
 */
export function folderIdFromDropData(data) {
  if (!data) return null;
  if (data.id) return data.id;
  if (typeof data.uuid === 'string' && data.uuid) {
    const segments = data.uuid.split('.');
    return segments[segments.length - 1] || null;
  }
  return null;
}

/**
 * Resolves a Foundry document UUID and type from drag-and-drop event data.
 *
 * Returns a richer object that includes the document type alongside the UUID.
 * For Folder drops, uuid is null and folderId/folderUuid/folderDocumentType are populated instead.
 *
 * @param {object|null|undefined} data - The parsed drag event data object
 * @returns {{ uuid: string|null, type: string|null, folderId?: string, folderUuid?: string, folderDocumentType?: string }}
 */
export function resolveDropData(data) {
  if (!data) return { uuid: null, type: null };

  const type = data.type || null;

  if (type === 'Folder') {
    return {
      uuid: null,
      type: 'Folder',
      folderId: folderIdFromDropData(data),
      folderUuid: data.uuid || null,
      folderDocumentType: data.documentType || null
    };
  }

  const uuid = resolveDropUuid(data);
  return { uuid, type };
}

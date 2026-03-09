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
 * Resolves a Foundry document UUID and type from drag-and-drop event data.
 *
 * Returns a richer object that includes the document type alongside the UUID.
 * For Folder drops, uuid is null and folderId/folderDocumentType are populated instead.
 *
 * @param {object|null|undefined} data - The parsed drag event data object
 * @returns {{ uuid: string|null, type: string|null, folderId?: string, folderDocumentType?: string }}
 */
export function resolveDropData(data) {
  if (!data) return { uuid: null, type: null };

  const type = data.type || null;

  if (type === 'Folder') {
    return {
      uuid: null,
      type: 'Folder',
      folderId: data.id || null,
      folderDocumentType: data.documentType || null
    };
  }

  const uuid = resolveDropUuid(data);
  return { uuid, type };
}

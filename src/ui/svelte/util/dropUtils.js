// Reading a Foundry drag payload, whose shape depends on the drag source: a world sidebar item
// carries `uuid`, a compendium item carries `pack` + `id` and no `uuid`, and `uuid` wins when both
// are present. A v13+ FOLDER drag carries only `uuid` (`Folder.<id>`) where the legacy shape
// carried a bare `id`, so both are read — otherwise dropping a folder silently no-ops.

export function resolveDropUuid(data) {
  if (!data) return null;
  if (data.uuid) return data.uuid;
  if (data.pack && data.id) return `Compendium.${data.pack}.${data.id}`;
  return null;
}

export function folderIdFromDropData(data) {
  if (!data) return null;
  if (data.id) return data.id;
  if (typeof data.uuid === 'string' && data.uuid) {
    const segments = data.uuid.split('.');
    return segments[segments.length - 1] || null;
  }
  return null;
}

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

/**
 * Live collaborator bag for source snapshots. Keep the manager narrow: late-bound closures preserve
 * test seams and source-item hooks while the heavyweight conversion stays in snapshot services.
 */
export function sourceSnapshotCollaborators(manager) {
  return {
    enrichToHtml: (raw, options) => manager._enrichToHtml(raw, options),
    // A relative embed belongs to the containing document, not to the registered component.
    resolveEmbedUuid: (uuid, relativeTo) =>
      typeof globalThis.fromUuid === 'function'
        ? globalThis.fromUuid(uuid, { relative: relativeTo })
        : null,
    resolveImportedComponentSourceData: (itemUuid, source) =>
      manager._resolveImportedComponentSourceData(itemUuid, source),
    plainTextDescription: (value) => manager._plainTextDescription(value),
    descriptionTextCandidate: (value, seen) => manager._descriptionTextCandidate(value, seen),
    normalizeComponentDescription: (description) =>
      manager._normalizeComponentDescription(description),
    extractSourceDescription: (source) => manager._extractSourceDescription(source),
  };
}

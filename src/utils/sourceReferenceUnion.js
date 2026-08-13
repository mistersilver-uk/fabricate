/**
 * @module sourceReferenceUnion
 *
 * The source-reference union of a registered ENTRY — a component, a first-class tool, or a
 * recipe-item definition — plus the de-duplicating push both this module and
 * {@link module:sourceUuid} build their reference lists with.
 *
 * Extracted from `sourceUuid.js` (issue 1076) for one structural reason: `definitionIndex`
 * needs the union to build its source-reference facet, and `sourceUuid` needs
 * `definitionIndex` to resolve identity, so leaving the union where it was would make those
 * two modules a cycle (`import-x/no-cycle`). This is the repository's usual extraction
 * recipe — the shared helper moves down into a module both sides import, and is never
 * duplicated, because a second copy of the reference union would drift from the one the
 * index was built with and silently answer a different question.
 *
 * `sourceUuid` re-exports {@link getItemMatchUuids}, so every existing importer is
 * unaffected and the public spelling did not move.
 */

/**
 * Append `value` to `target` when it is a non-empty, not-yet-present trimmed string.
 *
 * @param {string[]} target
 * @param {unknown} value
 * @returns {void}
 */
export function pushUniqueReference(target, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

/**
 * Collect every UUID reference a registered ENTRY can use for runtime matching.
 *
 * The argument is a registered-entry object — a component, a recipe-item definition, or a
 * first-class tool — NOT a live Foundry Item document. All three kinds carry the same
 * source-reference field shape, so the same union serves them all; use
 * `getItemSourceReferences` / `getItemIdentityReferences` for a live Item document instead.
 *
 * @param {object|null} entry - Registered-entry object with source UUID fields
 * @returns {string[]} Unique UUID references across registeredItemUuid, originItemUuid, and aliasItemUuids
 */
export function getItemMatchUuids(entry) {
  const refs = [];
  if (!entry || typeof entry !== 'object') return refs;
  pushUniqueReference(refs, entry.registeredItemUuid);
  pushUniqueReference(refs, entry.originItemUuid);
  if (Array.isArray(entry.aliasItemUuids)) {
    for (const ref of entry.aliasItemUuids) pushUniqueReference(refs, ref);
  }
  return refs;
}

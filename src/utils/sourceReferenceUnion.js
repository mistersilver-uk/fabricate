/**
 * The source-reference union of a registered ENTRY — a component, a first-class tool, or a
 * recipe-item definition — plus the de-duplicating push both this module and {@link
 * module:sourceUuid} build their reference lists with.
 */

/** Append `value` to `target` when it is a non-empty, not-yet-present trimmed string. */
export function pushUniqueReference(target, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

/** Collect every UUID reference a registered ENTRY can use for runtime matching. */
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

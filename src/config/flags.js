export const FABRICATE_FLAG_NAMESPACE = 'fabricate';

function normalizeFlagKey(key) {
  const rawKey = String(key || '');
  if (!rawKey) return 'fabricate';
  return rawKey.startsWith('fabricate.') ? rawKey : `fabricate.${rawKey}`;
}

export function getFabricateFlag(document, key, defaultValue = null) {
  if (!document || typeof document.getFlag !== 'function') {
    return defaultValue;
  }

  try {
    const value = document.getFlag(FABRICATE_FLAG_NAMESPACE, normalizeFlagKey(key));
    return value !== undefined && value !== null ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setFabricateFlag(document, key, value) {
  if (!document || typeof document.setFlag !== 'function') {
    return null;
  }

  try {
    return await document.setFlag(FABRICATE_FLAG_NAMESPACE, normalizeFlagKey(key), value);
  } catch {
    return null;
  }
}

/**
 * `setFabricateFlag` writes through `setFlag`, whose recursive merge NEVER removes
 * keys deleted from a nested object. So a run removed from a run-container's
 * `active` map lingers in the persisted flag forever, resurfaces on reload, and
 * can be re-processed. Delete the removed active keys with Foundry's `-=` syntax
 * BEFORE the merge write. The stored path is doubly-nested
 * `flags.fabricate.fabricate.<key>` — `normalizeFlagKey` prefixes `fabricate.` and
 * `expandObject` nests it under the `fabricate` scope. Shared by the crafting and
 * salvage run managers (the gathering flag has its own single-scope writer).
 *
 * @param {Document} document the actor owning the run container
 * @param {string} key the run-container flag key (e.g. 'craftingRuns' | 'salvageRuns')
 * @param {{active?: object}} nextContainer the container about to be persisted
 */
export async function deleteRemovedActiveRunFlags(document, key, nextContainer) {
  if (!document || typeof document.update !== 'function') return;
  const stored = getFabricateFlag(document, key, null);
  const isRunMap = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const storedActive = isRunMap(stored?.active) ? stored.active : {};
  const nextActive = isRunMap(nextContainer?.active) ? nextContainer.active : {};
  const path = `flags.${FABRICATE_FLAG_NAMESPACE}.${normalizeFlagKey(key)}.active`;
  const updates = {};
  for (const runId of Object.keys(storedActive)) {
    if (!(runId in nextActive)) {
      updates[`${path}.-=${runId}`] = null;
    }
  }
  if (Object.keys(updates).length > 0) {
    await document.update(updates);
  }
}

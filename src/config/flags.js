export const FABRICATE_FLAG_NAMESPACE = 'fabricate';

/**
 * A durable-flag MAP KEY (a crafting-system id in `roles.<systemId>.componentId`,
 * and later a `toolId` / `recipeItemDefinitionId`) is interpolated into a DOTTED
 * flag path. Foundry's `setFlag` → `expandObject` splits on EVERY dot, so a segment
 * that itself contains a `.` nests the key one level deeper on WRITE, while any
 * reader indexing the map by that id (`roles[systemId]`) misses it on READ — the
 * flag silently degrades to the pre-#556 raw-reference path. This pattern restricts
 * such a segment to characters that cannot break the path. `foundry.utils.randomID()`
 * always satisfies it; a hand-edited or imported system JSON may not.
 */
export const FABRICATE_FLAG_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Whether a value is safe to interpolate as a single dotted-flag-path segment
 * (see {@link FABRICATE_FLAG_KEY_SEGMENT_PATTERN}).
 *
 * @param {*} segment
 * @returns {boolean}
 */
export function isSafeFlagKeySegment(segment) {
  return typeof segment === 'string' && FABRICATE_FLAG_KEY_SEGMENT_PATTERN.test(segment);
}

/**
 * Stamp a durable per-system ROLE identity on a plain item-data payload's flags,
 * BEFORE creation, so the inventory/tool matchers attribute the created item to its OWN
 * definition regardless of naming collisions or Foundry's transitive
 * `_stats.duplicateSource` chain. This is the single shared write-side stamp behind every
 * creation site that needs a durable identity leaf — the crafted-output stamp
 * (`stampCraftedComponentIdentity`, issue 539), gathering awards, and the two
 * tool-replacement grant creators (issue 780).
 *
 * The stamp keys the SAME location the canonical readers in `src/utils/sourceUuid.js` read
 * FIRST for an owned item — its tier-1 durable-flag identity
 * (`claimedRoleId` → `flags.fabricate.roles[systemId][roleKey]`) — so a freshly created
 * item resolves to its own definition by identity and never reaches the source-ref tier.
 * Mirrors the source-side stamp `CraftingSystemManager` writes via
 * `setFabricateFlag(source, 'roles.<systemId>.<roleKey>', id)`: the roles map lives at the
 * doubly-nested `flags.fabricate.fabricate.roles` path (`normalizeFlagKey` prefixes
 * `fabricate.`, then `expandObject` nests it under the `fabricate` scope), so on a plain
 * item-data object that same path is written directly. The container is built with
 * sibling-preserving `||=` so any existing flags and any `roles` leaves for OTHER systems
 * survive.
 *
 * A dotted/unsafe `systemId` can never be a `roles` map key (every stamp/repair site skips
 * it via {@link isSafeFlagKeySegment}), so it is skipped here too and the item degrades to
 * raw-reference resolution.
 *
 * @param {object} itemData - The plain item-data object about to be created.
 * @param {string|null|undefined} systemId - The crafting system's id (the map key).
 * @param {string|null|undefined} roleKey - The role leaf (`'componentId'`, `'toolId'`, …).
 * @param {string|null|undefined} id - The definition id to stamp.
 */
export function stampItemDataRoleIdentity(itemData, systemId, roleKey, id) {
  if (!itemData || !id || !roleKey || !isSafeFlagKeySegment(systemId)) return;
  const flags = (itemData.flags ||= {});
  const namespace = (flags[FABRICATE_FLAG_NAMESPACE] ||= {});
  const nested = (namespace[FABRICATE_FLAG_NAMESPACE] ||= {});
  const roles = (nested.roles ||= {});
  const perSystem = (roles[systemId] ||= {});
  perSystem[roleKey] = id;
}

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
    return value ?? defaultValue;
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

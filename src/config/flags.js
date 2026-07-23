export const FABRICATE_FLAG_NAMESPACE = 'fabricate';

/**
 * A durable-flag MAP KEY (a crafting-system id in `roles.<systemId>.componentId`,
 * and later a `toolId` / `recipeItemDefinitionId`) is interpolated into a DOTTED
 * flag path. Fabricate writes that path through a flattened `Document#update` key,
 * where every dot separates an object segment. A system id containing `.` would
 * therefore nest the key one level deeper while a reader indexing the map by that id
 * (`roles[systemId]`) misses it — the flag silently degrades to the pre-#556
 * raw-reference path. This pattern restricts such a segment to characters that cannot
 * break the path. `foundry.utils.randomID()` always satisfies it; a hand-edited or
 * imported system JSON may not.
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
 * `fabricate.`, then the flattened update path nests it under the `fabricate` scope), so
 * on a plain item-data object that same path is written directly. The container is built with
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

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withNestedValue(source, path, value) {
  const nextRoot = isObjectRecord(source) ? { ...source } : {};
  let sourceNode = source;
  let nextNode = nextRoot;
  for (const segment of path.slice(0, -1)) {
    const sourceChild = isObjectRecord(sourceNode?.[segment]) ? sourceNode[segment] : {};
    const nextChild = { ...sourceChild };
    nextNode[segment] = nextChild;
    sourceNode = sourceChild;
    nextNode = nextChild;
  }
  nextNode[path.at(-1)] = value;
  return nextRoot;
}

async function setFabricateFlagFallback(document, normalizedKey, value) {
  const [rootKey, ...nestedPath] = normalizedKey.split('.');
  if (nestedPath.length === 0) {
    return document.setFlag(FABRICATE_FLAG_NAMESPACE, rootKey, value);
  }
  const currentRoot = document.getFlag(FABRICATE_FLAG_NAMESPACE, rootKey);
  const nextRoot = withNestedValue(currentRoot, nestedPath, value);
  return document.setFlag(FABRICATE_FLAG_NAMESPACE, rootKey, nextRoot);
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

/**
 * Write a Fabricate flag through the same nested path {@link getFabricateFlag} reads.
 * Foundry V13's `setFlag(scope, key, value)` stores a dotted key literally, so real
 * DataModel-backed Documents use one atomic flattened `update` path instead. Lightweight
 * collaborators without `updateSource` replace a cloned root flag through `setFlag`, which
 * preserves siblings without depending on dotted-key expansion. A `null` value remains a
 * value; callers that intend deletion must use Foundry's `unsetFlag` API. Write failures
 * reject so callers never report a flag as persisted when Foundry refused the update.
 */
export async function setFabricateFlag(document, key, value) {
  const canUpdate =
    typeof document?.update === 'function' && typeof document?.updateSource === 'function';
  const canSetFlag = typeof document?.setFlag === 'function';
  if (!canUpdate && !canSetFlag) {
    return null;
  }

  const normalizedKey = normalizeFlagKey(key);
  if (canUpdate) {
    const path = `flags.${FABRICATE_FLAG_NAMESPACE}.${normalizedKey}`;
    return await document.update({ [path]: value });
  }
  return await setFabricateFlagFallback(document, normalizedKey, value);
}

/**
 * `setFabricateFlag` writes through `Document#update`, whose recursive merge NEVER removes
 * keys deleted from a nested object. So a run removed from a run-container's
 * `active` map lingers in the persisted flag forever, resurfaces on reload, and
 * can be re-processed. Delete the removed active keys with Foundry's `-=` syntax
 * BEFORE the merge write. The stored path is doubly-nested
 * `flags.fabricate.fabricate.<key>` — `normalizeFlagKey` prefixes `fabricate.` and
 * the flattened update path nests it under the `fabricate` scope. Shared by the crafting and
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

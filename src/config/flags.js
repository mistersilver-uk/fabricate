export const FABRICATE_FLAG_NAMESPACE = 'fabricate';

/**
 * The durable-flag key the per-actor learned-recipe map is persisted under
 * (`flags.fabricate.fabricate.learnedRecipes`).
 *
 * Published as a constant because the map now has more than one writer: the two book
 * learn paths and the craft-time auto-learn write it through
 * `RecipeVisibilityService._getLearnedMap`/`_setLearnedMap`, and the companion contract's
 * GM knowledge grant writes it through injected flag seams that never reach into the
 * service's private members (see issue 1289's D3). A string literal repeated at each of
 * those sites is a persisted shape spelled four times: a typo at any one of them writes a
 * SECOND flag that reads back empty forever, with nothing failing. There is exactly one
 * spelling here instead.
 *
 * The value is load-bearing and may not be renamed: it names data already persisted in
 * every world.
 */
export const LEARNED_RECIPES_FLAG_KEY = 'learnedRecipes';

/**
 * A durable-flag MAP KEY (a crafting-system id in `roles.<systemId>.componentId`, and later a
 * `toolId` / `recipeItemDefinitionId`) is interpolated into a DOTTED flag path.
 */
export const FABRICATE_FLAG_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Whether a value is safe to interpolate as a single dotted-flag-path segment (see {@link
 * FABRICATE_FLAG_KEY_SEGMENT_PATTERN}).
 */
export function isSafeFlagKeySegment(segment) {
  return typeof segment === 'string' && FABRICATE_FLAG_KEY_SEGMENT_PATTERN.test(segment);
}

/**
 * Stamp a durable per-system ROLE identity on a plain item-data payload's flags, BEFORE creation,
 * so the inventory/tool matchers attribute the created item to its OWN definition regardless of
 * naming collisions or Foundry's transitive `_stats.duplicateSource` chain.
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

/** Write a Fabricate flag through the same nested path {@link getFabricateFlag} reads. */
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
  return await document.setFlag(FABRICATE_FLAG_NAMESPACE, normalizedKey, value);
}

/**
 * `setFabricateFlag` writes through `Document#update`, whose recursive merge NEVER removes keys
 * deleted from a nested object.
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

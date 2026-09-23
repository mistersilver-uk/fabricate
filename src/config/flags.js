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

/** Core `setProperty` skips these segments on V14, so a deletion addressed at one never lands. */
const PROTOTYPE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function forcedDeletionOperator() {
  const operator = globalThis.foundry?.data?.operators?.ForcedDeletion;
  return typeof operator === 'function' ? operator : null;
}

function isDeletableKey(key) {
  if (PROTOTYPE_SEGMENTS.has(key)) return false;
  if (!isSafeFlagKeySegment(key)) {
    throw new TypeError(`Fabricate | a forced deletion needs a single flag-key segment: ${key}`);
  }
  return true;
}

/**
 * The `[path, value]` entry that deletes `key` under a dotted update path: V13 spells it
 * `<parent>.-=<key>: null`, V14 `<parent>.<key>: ForcedDeletion`, detected on every call.
 * Returns `null` for a prototype segment and throws a `TypeError` for any other unsafe key.
 */
export function forcedDeletionEntry(parentPath, key) {
  if (!isDeletableKey(key)) return null;
  const Operator = forcedDeletionOperator();
  return Operator ? [`${parentPath}.${key}`, new Operator()] : [`${parentPath}.-=${key}`, null];
}

/**
 * Mark `key` deleted inside a `setFlag`/`update` value tree, in the form
 * {@link forcedDeletionEntry} detects. Mark after any `structuredClone`, which destroys an
 * operator. Returns `node`, or `null` (unmarked) for a prototype segment.
 */
export function markForcedDeletion(node, key) {
  if (!isDeletableKey(key)) return null;
  const Operator = forcedDeletionOperator();
  if (Operator) node[key] = new Operator();
  else node[`-=${key}`] = null;
  return node;
}

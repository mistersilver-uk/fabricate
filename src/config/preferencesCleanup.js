import { SETTING_KEYS } from './settings.js';

export function isGatheringActorSelectableByUser(actor, user) {
  if (!actor) {
    return false;
  }

  if (user?.isGM) {
    return true;
  }

  return actor.isOwner === true || actor.testUserPermission?.(user, 'OWNER') === true;
}

/**
 * Decide whether one `progressiveResultOrder` key still names something that exists.
 *
 * Keys are namespaced by scope (issue 651): `recipe:<recipeId>` / `salvage:<componentId>`.
 *
 * Anything else — including a legacy BARE id — is DROPPED. Nothing has ever written this
 * setting, so there is no data to preserve, and retaining unknown keys would make them
 * unprunable forever.
 *
 * @param {string} key
 * @param {Set<string>} validRecipeIds
 * @param {Set<string>} validComponentIds
 * @returns {boolean}
 */
function _isLiveProgressiveOrderKey(key, validRecipeIds, validComponentIds) {
  if (typeof key !== 'string') return false;
  const separator = key.indexOf(':');
  if (separator === -1) return false;
  const scope = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (id === '') return false;
  if (scope === 'recipe') return validRecipeIds.has(id);
  if (scope === 'salvage') return validComponentIds.has(id);
  return false;
}

/**
 * Prune the GM's crafting preferences against the live corpus.
 *
 * **`validComponentIds` is REQUIRED, and has no default** (issue 1261). It used to default to
 * an empty set, and a caller that omitted it therefore pruned every `salvage:<componentId>`
 * progressive-order key — a corpus-derived prune against a basis of nothing, which is issue
 * 1196's failure mode reached by an omitted ARGUMENT rather than an incomplete corpus. A
 * default cannot be safe here: this function rewrites one map as a whole-value replacement,
 * so "no components were supplied" and "this world has no components" are indistinguishable
 * to it and only the caller can tell them apart. Omitting it now throws.
 *
 * @param {Set<string>} validSystemIds
 * @param {Set<string>} validRecipeIds
 * @param {(key: string) => *} getSetting
 * @param {(key: string, value: *) => Promise<*>} setSetting
 * @param {object} options
 * @param {Set<string>} options.validComponentIds Every live salvageable component id, across
 *   every system: the progressive-order map's `salvage:` keys are not system-scoped.
 * @param {((actorId: string) => object|null)|null} [options.resolveGatheringActor]
 * @param {((actor: object) => boolean)|null} [options.isSelectableGatheringActor]
 */
export async function cleanupStalePreferences(
  validSystemIds,
  validRecipeIds,
  getSetting,
  setSetting,
  { resolveGatheringActor = null, isSelectableGatheringActor = null, validComponentIds } = {}
) {
  if (!(validComponentIds instanceof Set)) {
    throw new TypeError(
      'cleanupStalePreferences requires validComponentIds: a corpus-derived prune with no component ids drops every salvage: preference key.'
    );
  }
  // 1. Validate lastManagedCraftingSystem
  const lastSystem = getSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM);
  if (lastSystem && !validSystemIds.has(lastSystem)) {
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastManagedCraftingSystem:', lastSystem);
  }

  // 1b. Validate lastAlchemySystem
  const lastAlchemy = getSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM);
  if (lastAlchemy && !validSystemIds.has(lastAlchemy)) {
    await setSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastAlchemySystem:', lastAlchemy);
  }

  // 2. Validate lastGatheringActor when the caller can resolve/select actors
  const lastGatheringActor = getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR);
  if (
    lastGatheringActor &&
    typeof resolveGatheringActor === 'function' &&
    typeof isSelectableGatheringActor === 'function'
  ) {
    const actor = resolveGatheringActor(lastGatheringActor);
    if (!actor || !isSelectableGatheringActor(actor)) {
      await setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, '');
      console.log('Fabricate | Cleared stale lastGatheringActor:', lastGatheringActor);
    }
  }

  // 3. Clean progressive-order preferences whose subject no longer exists.
  //
  // Keys are namespaced (`recipe:<id>` / `salvage:<componentId>`), so they MUST be
  // dispatched by prefix: testing a raw `validRecipeIds.has('recipe:abc')` is false for
  // every key, and the first run would wipe the whole map. Under `user` scope that wipe
  // is a replicated document write — destructive across every device the player uses.
  const progressiveOrder = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
  if (progressiveOrder && typeof progressiveOrder === 'object') {
    const cleaned = {};
    let changed = false;
    for (const [key, order] of Object.entries(progressiveOrder)) {
      if (_isLiveProgressiveOrderKey(key, validRecipeIds, validComponentIds)) {
        cleaned[key] = order;
      } else {
        changed = true;
        console.log('Fabricate | Removed stale progressive-order preference:', key);
      }
    }
    if (changed) {
      await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, cleaned);
    }
  }
}

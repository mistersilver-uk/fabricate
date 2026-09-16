import { SETTING_KEYS } from './settings.js';

/**
 * Whether `user` may ACT AS `actor` for gathering. The subject is the PASSED user and only the
 * passed user (issue 1288): this runs on the elected GM's client for a relayed blind start, so
 * `Actor#isOwner` is absent — it tests the AMBIENT user and short-circuits any GM to OWNER, which
 * would make the authorization inert exactly where it runs. A nullish user, a user ID STRING, and
 * an actor that cannot be asked (a compendium index entry) all fail CLOSED, the last one reported.
 */
export function isGatheringActorSelectableByUser(actor, user) {
  if (!actor) {
    return false;
  }

  if (!user || typeof user !== 'object') {
    if (typeof user === 'string') {
      console.warn(
        'Fabricate | Refused a gathering actor selection: the ownership predicate takes a User document, not a user id',
        { userId: user }
      );
    }
    return false;
  }

  if (user.isGM) {
    return true;
  }

  if (typeof actor.testUserPermission !== 'function') {
    console.warn(
      'Fabricate | Refused a gathering actor selection: the addressed actor could not be resolved to a permission-testable document',
      { actorUuid: actor.uuid ?? actor.id ?? null, userId: user.id ?? null }
    );
    return false;
  }

  return actor.testUserPermission(user, 'OWNER') === true;
}

/** Decide whether one `progressiveResultOrder` key still names something that exists. */
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

/** Prune the GM's crafting preferences against the live corpus. */
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
  // 1.
  const lastSystem = getSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM);
  if (lastSystem && !validSystemIds.has(lastSystem)) {
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastManagedCraftingSystem:', lastSystem);
  }

  // 1b.
  const lastAlchemy = getSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM);
  if (lastAlchemy && !validSystemIds.has(lastAlchemy)) {
    await setSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastAlchemySystem:', lastAlchemy);
  }

  // 2.
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

  // 3.
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

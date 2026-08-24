import { SETTING_KEYS } from './settings.js';

/**
 * Whether `user` may ACT AS `actor` for gathering.
 *
 * **The subject is the PASSED user and only the passed user** (issue 1288). This predicate
 * is called on paths that execute on someone else's client — `applyGatheringBlindStart`
 * re-runs a relayed blind start on the ELECTED GM's client with the requesting player as
 * the viewer — so it may read nothing about whoever happens to be running it.
 *
 * That is why `Actor#isOwner` is absent. It is defined as
 * `testUserPermission(game.user, 'OWNER')` — the AMBIENT user — and `testUserPermission`
 * short-circuits any GM to OWNER, so on the elected GM's client `isOwner` is true for
 * every actor in the world. An `isOwner`-first disjunct therefore short-circuits before
 * the passed `user` is ever consulted, and the authorization is inert exactly where it
 * runs: an authenticated player could name an `actorUuid` they do not own and the GM
 * client would start the attempt for it. On a player's own client `isOwner` IS
 * `testUserPermission(game.user, 'OWNER')`, so dropping it costs that path nothing.
 *
 * The `user.isGM` early return stays: a GM acting AS THEMSELVES may legitimately select
 * any actor. What must not happen is a GM's ambient identity standing in for a relayed
 * requester — and it cannot, because the GM-ness tested here is the passed user's.
 *
 * Two shapes must fail CLOSED rather than throw or slip through, and both became
 * REACHABLE the moment the `isOwner` disjunct stopped short-circuiting ahead of them:
 *
 *  - **a nullish user.** `Document#testUserPermission`'s first statement reads
 *    `user.isGM`, so a null viewer throws. That is representable, not theoretical:
 *    `GatheringListingBuilder.listForActor` and `getTaskDropBreakdown` both default
 *    `viewer = null`, and a security predicate must deny rather than explode.
 *  - **a user ID STRING.** `getUserLevel` reads `this.ownership[user.id]`; a string has no
 *    `.id`, so it falls through to `ownership.default` and returns TRUE for any string at
 *    all in a world whose actor grants "All Players" Owner. It takes a `User`, never an id.
 *
 * An actor that cannot be ASKED is refused too, and — following `applyComplicationDelivery`
 * — the refusal is REPORTED. `fromUuidSync` resolves a compendium uuid to a plain index
 * entry carrying no `testUserPermission` at all, so a perfectly well-formed relayed start
 * addressed at one is denied with nothing anywhere in the log for the one client that
 * could diagnose it.
 *
 * @param {object|null} actor The addressed actor document.
 * @param {User|null} user The USER DOCUMENT whose authority is in question — never
 *   `game.user` unless the ambient user genuinely is the subject, and never a user id.
 * @returns {boolean}
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

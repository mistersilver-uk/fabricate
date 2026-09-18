// `canvasReady` fires after Foundry draws a scene, which is the signal that `game.scenes.current`
// now points somewhere else. Returns an unsubscribe; no-ops with no `Hooks` global.
export function subscribeSceneChange(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('canvasReady', () => handler());
  return () => {
    hooks.off?.('canvasReady', id);
  };
}

// `updateWorldTime` is a SYNCED hook firing on every connected client, so this is a READ-only
// refresh subscription and the handler must not publish side effects — no GM gate is applied here.
export function subscribeWorldTime(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('updateWorldTime', () => handler());
  return () => {
    hooks.off?.('updateWorldTime', id);
  };
}

// Owned-item changes, for inventory-derived views. `isRelevantActor` is load-bearing: the item
// hooks fire on every connected client, and world/sidebar items have no actor parent at all.
// Item mutations arrive in BURSTS — crafting deletes N ingredients and creates the product — so the
// handler is trailing-debounced into one call, and the unsubscribe cancels a pending one.
export function subscribeInventoryChange(handler, { isRelevantActor, debounceMs = 50 } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const relevant = typeof isRelevantActor === 'function' ? isRelevantActor : () => true;
  let timer = null;
  const schedule = () => {
    // The first fire arms the timer; subsequent fires inside the window are absorbed.
    if (timer !== null) return;
    timer = setTimeout(
      () => {
        timer = null;
        handler();
      },
      Math.max(0, debounceMs)
    );
  };
  const onItemChange = (item) => {
    // Embedded items only: a world item in the sidebar resolves to null here and is ignored.
    const actorId = item?.actor?.id ?? item?.parent?.id ?? null;
    if (actorId && relevant(actorId)) schedule();
  };
  const createId = hooks.on('createItem', onItemChange);
  const updateId = hooks.on('updateItem', onItemChange);
  const deleteId = hooks.on('deleteItem', onItemChange);
  return () => {
    hooks.off?.('createItem', createId);
    hooks.off?.('updateItem', updateId);
    hooks.off?.('deleteItem', deleteId);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// A LITERAL mirroring `CRAFTING_DATA_CHANGED_HOOK` rather than an import, and the reason is
// mechanical: mounted harnesses declare THIS module and the pre-validator walks its whole static
// import closure, so one new import here breaks every one of them until each declares the transitive
// module. `tests/util/foundry-bridge-subscriptions.test.js` pins the two equal.
export const CRAFTING_DATA_CHANGED_HOOK = 'fabricate.craftingDataChanged';

// Exposed so a test can assert the narrowing CAME FROM domain routing rather than inferring it: a
// payload reaching the fallback is delivered to every subscriber whatever its domain set. Counted
// per SUBSCRIBER delivery, not per payload, so a fail-safe case expects a rise of the subscriber
// count.
let broadFallbackCount = 0;

export function readCraftingDataFallbackCount() {
  return broadFallbackCount;
}

export function resetCraftingDataFallbackCount() {
  broadFallbackCount = 0;
}

// A LITERAL mirroring `INVALIDATION_DOMAIN_NAMES`, for the reason the hook name above is one, and
// pinned against the real constant by the same guard.
const KNOWN_INVALIDATION_DOMAINS = new Set([
  'labelling',
  'narrative',
  'materials-and-yield',
  'resolution-config',
  'component-definitions',
  'access-and-knowledge',
  'held-inventory',
]);

// The domains a payload names, or `null` to route BROADLY. Four shapes route broadly under ONE rule
// — "I cannot attribute this": an unrecognised change, malformed `scopes`, scopes unioning to
// nothing, and a change every one of whose domains is a name this build does not know. That last is
// the easy one to omit and the only class that would otherwise route NARROW: an unknown name yields
// a non-empty set intersecting no subscriber, so nothing refreshes and the counter does not move —
// a stale read model wearing the appearance of correct narrowing. Over-broad invalidation is a
// performance bug; a stale read model is a correctness one.
function payloadDomains(payload) {
  const scopes = payload?.scopes;
  if (!Array.isArray(scopes)) return null;
  const domains = new Set();
  for (const scope of scopes) {
    if (!Array.isArray(scope?.domains)) return null;
    for (const domain of scope.domains) {
      if (KNOWN_INVALIDATION_DOMAINS.has(domain)) domains.add(domain);
    }
  }
  return domains.size > 0 ? domains : null;
}

// The UNPUBLISHED `fabricate.craftingDataChanged` hook, which both managers emit beside their
// published change hooks and `main.js`'s `updateSetting` bridge re-emits on every other client, so
// one subscription covers same-client and cross-client edits alike. It deliberately no longer binds
// `craftingSystemsChanged`/`recipesChanged` (issue 1078): those bindings were ZERO-ARGUMENT, so the
// payload was discarded and no narrowing was possible. Both still fire for third-party subscribers,
// and every publisher of one also publishes the scoped signal.
// `wantedDomains` is normally `STORE_DOMAINS[store]` from `src/systems/invalidationDomains.js`;
// omitting it means every domain, the behaviour before issue 1078, and stays the safe default.
export function subscribeCraftingDataChange(handler, { domains = null } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const wanted = Array.isArray(domains) ? new Set(domains) : null;
  const id = hooks.on(CRAFTING_DATA_CHANGED_HOOK, (payload) => {
    const named = payloadDomains(payload);
    if (named === null) {
      broadFallbackCount += 1;
      handler(payload);
      return;
    }
    if (wanted === null || [...named].some((domain) => wanted.has(domain))) handler(payload);
  });
  return () => hooks.off?.(CRAFTING_DATA_CHANGED_HOOK, id);
}

// Node depletion is applied by the ACTIVE GM, because a player may not write the world setting the
// pools live in, so the acting player's own post-attempt reload races ahead of the GM's write and
// nothing else re-runs it. Without this subscription a player's node counts stay stale until they
// reopen the app, and the local `NODE_DEPLETED` gate keeps offering a pool the GM already zeroed.
export function subscribeGatheringDataChange(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('fabricate.gatheringEnvironmentsChanged', () => handler());
  return () => hooks.off?.('fabricate.gatheringEnvironmentsChanged', id);
}

// `handler(actorUuid)` on token movement. `updateToken` commits once per move, unlike the
// continuous `refreshToken`, so no debounce is needed.
// V13 ANIMATES token movement, and the document position and region membership only reach their
// destination once that completes — reading earlier reports the region the token just LEFT. Waits a
// frame for the animation to register, then awaits it under a timeout.
function awaitTokenMovementSettled(tokenDoc) {
  const obj = tokenDoc?.object;
  const CanvasAnimation = globalThis.CanvasAnimation;
  if (!obj || typeof CanvasAnimation?.getAnimation !== 'function') return Promise.resolve();
  const nextFrame = () =>
    new Promise((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function')
        globalThis.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });
  const settle = (async () => {
    await nextFrame();
    const anim = CanvasAnimation.getAnimation(obj.animationName);
    if (anim?.promise) {
      try {
        await anim.promise;
      } catch {
        /* ignore */
      }
    }
  })();
  const timeout = new Promise((resolve) => setTimeout(resolve, 1000));
  return Promise.race([settle, timeout]);
}

export function subscribeTravelMarkerMove(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  // The BASE world-actor uuid matches a party's `travelActorUuid` for linked and unlinked marker
  // tokens alike; the token's bound actor uuid is the fallback for a token referencing no world one.
  const actorUuidOf = (tokenDoc) =>
    (tokenDoc?.actorId ? `Actor.${tokenDoc.actorId}` : null) ?? tokenDoc?.actor?.uuid ?? null;
  // ANY token update, because V13 may not deliver movement as top-level x/y; the consumer filters
  // to real travel markers, so a non-positional update costs one quiet refetch. The notification is
  // deferred until the move settles, so the resolved region is the DESTINATION.
  const notify = (tokenDoc) => {
    const actorUuid = actorUuidOf(tokenDoc);
    awaitTokenMovementSettled(tokenDoc).then(() => handler(actorUuid));
  };
  const updateId = hooks.on('updateToken', notify);
  const createId = hooks.on('createToken', notify);
  const deleteId = hooks.on('deleteToken', notify);
  return () => {
    hooks.off?.('updateToken', updateId);
    hooks.off?.('createToken', createId);
    hooks.off?.('deleteToken', deleteId);
  };
}

// A local mirror of `runFlagInvalidation.js`'s `RUN_CONTAINER_FLAG_PATHS`, deliberately not an
// import: a mounted manifest missing a transitive import does not fail, it HANGS and reports
// `# cancelled`. `tests/util/foundry-bridge-subscriptions.test.js` pins the mirror (issue 1654).
const RUN_FLAG_BASE_PATHS = Object.freeze([
  'flags.fabricate.fabricate.craftingRuns',
  'flags.fabricate.fabricate.salvageRuns',
  'flags.fabricate.gatheringRuns',
]);

// Mirrored from `FLAG_UPDATE_OPERATOR_PREFIXES`; see the note above.
const RUN_FLAG_OPERATOR_PREFIXES = Object.freeze(['-=', '==']);

// Each base path plus one per update-operator prefix on its LAST segment, the only segment an
// operator may sit on. Exported for the drift guard, not as a runtime surface.
export const RUN_FLAG_DIFF_PATHS = Object.freeze(
  RUN_FLAG_BASE_PATHS.flatMap((path) => {
    const lastDot = path.lastIndexOf('.');
    const parent = path.slice(0, lastDot + 1);
    const key = path.slice(lastDot + 1);
    return [path, ...RUN_FLAG_OPERATOR_PREFIXES.map((operator) => `${parent}${operator}${key}`)];
  })
);

// Run-flag writes by ANY client, including the primary-GM world-time resume (issues 733, 739).
// `updateActor` fires on every HP tick, so BOTH filters — the relevant actor and the run-container
// flag path — are load-bearing.
export function subscribeActorRunFlagChange(handler, { isRelevantActor } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const relevant = typeof isRelevantActor === 'function' ? isRelevantActor : () => true;
  const hasProperty = globalThis.foundry?.utils?.hasProperty;
  // With no `foundry.utils.hasProperty` this refreshes NOTHING rather than probing the diff itself,
  // which is what the shared matcher's fallback would do; the subscriptions test pins that choice.
  const touchesRunFlag = (changes) =>
    typeof hasProperty === 'function' &&
    RUN_FLAG_DIFF_PATHS.some((path) => hasProperty(changes, path));
  const onUpdate = (actor, changes) => {
    const actorId = actor?.id ?? null;
    if (actorId && relevant(actorId) && touchesRunFlag(changes)) handler();
  };
  const id = hooks.on('updateActor', onUpdate);
  return () => {
    hooks.off?.('updateActor', id);
  };
}

/**
 * Subscribe to the current viewer's Journal dismissal refresh signal.
 * Local dismissals name an actor UUID; replicated create/updateSetting signals
 * carry no payload, so those must refresh without an actor or user-id filter.
 * The Journal listing reads the current user's dismissal setting itself.
 *
 * @param {Function} handler Read-only refresh callback, invoked without arguments.
 * @param {object} [options]
 * @param {(actorUuid: string) => boolean} [options.isRelevantActor] Local actor
 *   predicate read at fire time; omitted means all actors.
 * @returns {Function} Cleanup callback; safe when Foundry Hooks is absent.
 */
export function subscribeJournalDismissalsChange(handler, { isRelevantActor } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const hook = 'fabricate.journalDismissalsChanged';
  const id = hooks.on(hook, (payload) => {
    if (payload?.actorUuid && isRelevantActor && !isRelevantActor(payload.actorUuid)) return;
    handler();
  });
  return () => hooks.off?.(hook, id);
}

/**
 * Subscribe to the Journal run authority's refusal LIFTING.
 *
 * Availability is read when the Journal listing is built, so a refusal captured by one build
 * outlives the claim it names until something rebuilds. The authority announces the lift; a
 * surface that captured the refusal re-derives on it. There is no poll and no per-read probe.
 *
 * @param {Function} handler Read-only refresh callback, invoked without arguments.
 * @returns {Function} Cleanup callback; safe when Foundry Hooks is absent.
 */
export function subscribeJournalAuthorityRestored(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const hook = 'fabricate.journalRunAuthorityRestored';
  const id = hooks.on(hook, () => handler());
  return () => hooks.off?.(hook, id);
}

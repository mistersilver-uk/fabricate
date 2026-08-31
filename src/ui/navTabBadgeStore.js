import { requireNonEmptyString } from './extensionRegistry.js';

/**
 * The runtime side of a Manager World-navigation tab BADGE.
 *
 * WHAT PROBLEM THIS SOLVES. A provider tab may declare a badge at registration, and a
 * registration-time count is stale the moment the thing it counts changes. The only way to
 * restate one would be to re-register the provider, which flashes Core's preview through the
 * gap and remounts the companion. So a badge needs a runtime channel, exactly as route chrome
 * does — and unlike chrome, it needs one that OUTLIVES a mount.
 *
 * WHY THIS IS SCOPED TO THE REGISTRATION AND NOT TO A MOUNT. The three shipped runtime
 * channels on this seam are functions on the frozen mount context and die with it, because
 * each states something about the screen currently on screen. A badge states the opposite: its
 * whole job is to be true while the companion is NOT mounted, so that the rail can say "three
 * claims are waiting" to a GM who is somewhere else entirely. A mount-scoped setter is silent
 * for precisely the person a badge exists for.
 *
 * It is dropped with its PROVIDER, though, and that is the same rule one level up:
 * `routeChromeChannel.beginMount` starts every mount from the tab's REGISTERED chrome, and
 * here a surface leaving the registry takes its runtime badges with it, so a re-registered
 * provider's tab of the same id starts from its own registered badge rather than inheriting a
 * number the previous registration left behind.
 *
 * WHY THIS IS A PLAIN LEAF. It imports no Svelte, no Foundry global and no registry — only the
 * shared string guard, which itself imports nothing. So the whole lifetime (validation
 * ordering, liveness, per-tab keying, the surface drop, fault-contained publication) is
 * unit-testable without mounting a component tree, exactly as `routeChromeChannel.js` and
 * `extensionRegistry.js` are.
 *
 * WHY THE CONTRACT AND THE PROVIDER LOOKUP ARE INJECTED rather than imported. Both live in
 * `managerExtensions.js`, which owns this store; importing them back would close a module
 * cycle whose failure mode is a temporal-dead-zone `ReferenceError` at import time, visible
 * only when something imports this module FIRST. They arrive as explicit collaborators
 * instead, which also means a unit test can drive the whole rule with two three-line stubs.
 */

const BADGE = 'Fabricate World navigation tab badge';
const SUBSCRIBER_FAILURE = 'Fabricate | Manager nav badge subscriber failed:';

/**
 * The snapshot every surface holding no runtime badge publishes.
 *
 * One shared value rather than a fresh empty object per publication, so a reader comparing
 * identities is not woken by a surface that has nothing to say. Null-prototype for the reason
 * below: an empty record must not answer to `toString` either.
 */
const NO_BADGES = Object.freeze(Object.create(null));

/**
 * Build the frozen per-surface snapshot subscribers receive.
 *
 * NULL-PROTOTYPE, because the keys are companion-controlled tab ids. A plain object literal
 * inherits `toString`, `constructor` and `__proto__`, so a tab legitimately called `toString`
 * would resolve to a function rather than to a badge — a defect no fixture would ever think to
 * write and no reviewer would spot in the renderer.
 *
 * Frozen for the reason the registry freezes its surface-id broadcast: every subscriber
 * receives the SAME object, and a mutable one would let the first rewrite what the next reads.
 *
 * @param {Map<string, object>|undefined} tabBadges Badges held for one surface.
 * @returns {Readonly<Record<string, object>>} Frozen snapshot keyed by tab id.
 */
function snapshotOf(tabBadges) {
  if (!tabBadges || tabBadges.size === 0) return NO_BADGES;
  const snapshot = Object.create(null);
  for (const [tabId, badge] of tabBadges) snapshot[tabId] = badge;
  return Object.freeze(snapshot);
}

/**
 * Resolve the badge Core renders for one tab.
 *
 * THREE LAYERS, IN ONE ORDER: the runtime badge, then the tab's REGISTERED badge, then none.
 *
 * `null` on the runtime channel CLEARS that layer — the store removes the entry rather than
 * storing an empty one — so the tab falls back to whatever it declared at registration. An
 * explicit `{ count: 0, accessibleName }` is a POSITIVE ZERO and does not fall back: it is the
 * companion stating that the tab holds nothing, which is a different claim from stating no
 * count at all, and it is the direct analogue of an empty `actions` array.
 *
 * @param {{id?: string, badge?: object}|null|undefined} tab Provider tab, validated or not.
 * @param {Record<string, object>|null|undefined} runtimeSnapshot One surface's runtime badges.
 * @returns {object|null} Frozen badge, or `null` when the tab carries none.
 */
export function resolveNavTabBadge(tab, runtimeSnapshot) {
  const tabId = tab?.id;
  // `Object.hasOwn` rather than a bare lookup, so a tab id that collides with an inherited
  // member cannot resolve to one when a caller passes an ordinary object literal.
  if (
    typeof tabId === 'string' &&
    typeof runtimeSnapshot === 'object' &&
    runtimeSnapshot !== null &&
    Object.hasOwn(runtimeSnapshot, tabId)
  ) {
    return runtimeSnapshot[tabId] ?? null;
  }
  return tab?.badge ?? null;
}

/**
 * Sum the badge counts across a tab set — the number Core's rollup renders.
 *
 * THE RESOLVED VALUE, ONCE PER TAB. This is `sum over tabs of resolveNavTabBadge(tab, snapshot)
 * ?.count ?? 0`, and it is NEVER `sum(registered) + sum(runtime)`: the runtime layer OVERRIDES
 * the registered one rather than adding to it, so an additive reading double-counts every tab
 * holding both. A three-tab set registering 3 and 2 totals 5; a runtime badge of 5 on the first
 * takes it to 7, not 10; clearing that one with `null` returns it to 5.
 *
 * An un-badged tab contributes `0` rather than throwing, because the rail renders whatever tab
 * set a companion declares and a total is not the place to discover a malformed one.
 *
 * @param {Array<{id?: string, badge?: object}>|null|undefined} tabs Tabs the rail renders.
 * @param {Record<string, object>|null|undefined} runtimeSnapshot One surface's runtime badges.
 * @returns {number} Total count; `0` when nothing carries a badge.
 */
export function navTabBadgeTotal(tabs, runtimeSnapshot) {
  if (!Array.isArray(tabs)) return 0;
  return tabs.reduce(
    (total, tab) => total + (resolveNavTabBadge(tab, runtimeSnapshot)?.count ?? 0),
    0
  );
}

/**
 * The frozen store one Manager extension registry owns for its tab badges.
 *
 * @typedef {object} NavTabBadgeStore
 * @property {(surfaceId: string, tabId: string, badge: object|null) => boolean} setBadge State
 *   one tab's runtime badge, or clear it with `null`.
 * @property {(surfaceId: string, listener: (badges: object) => void) => (() => void)} subscribe
 *   Receive one surface's badges immediately and on every change.
 * @property {(surfaceId: string) => Readonly<Record<string, object>>} snapshotFor The badges
 *   one surface holds right now.
 * @property {(surfaceIds: readonly string[]) => void} retainSurfaces Drop the badges of every
 *   surface absent from `surfaceIds`.
 */

/**
 * Create one Manager tab-badge store.
 *
 * @param {object} options Injected collaborators.
 * @param {(badge: object|null) => (object|null)} options.normalizeBadge Validates a candidate
 *   badge and returns the frozen value to store, or `null` to clear. Throws on a malformed one.
 * @param {(surfaceId: string) => (object|null)} options.findProvider The provider currently
 *   holding a surface, or `null`.
 * @param {(...args: unknown[]) => void} [options.reportError] Sink for a throwing subscriber.
 * @returns {NavTabBadgeStore} Frozen store.
 */
export function createNavTabBadgeStore({
  normalizeBadge,
  findProvider,
  // Read through `console` at CALL time rather than capturing `console.error` now: a store is
  // created once, when the registry is, so a captured reference would pin whatever the sink was
  // at that instant and make a later swap silently ineffective against this one channel.
  reportError = (...args) => console.error(...args),
} = {}) {
  if (typeof normalizeBadge !== 'function' || typeof findProvider !== 'function') {
    throw new TypeError(`${BADGE} store requires normalizeBadge and findProvider functions`);
  }

  // Surface id -> tab id -> frozen badge. Two levels rather than a composed `surface:tab` key,
  // because dropping a whole surface is a lifetime rule this store owes the registry, and a
  // composed key would make it a scan with a string-prefix test at the heart of it.
  const badgesBySurface = new Map();
  const listenersBySurface = new Map();

  function notify(listener, snapshot) {
    try {
      listener(snapshot);
    } catch (error) {
      // Contained for the same reason the registry contains its own: this publication runs
      // inside a COMPANION's call to `setWorldNavTabBadge`, and a throwing Core subscriber must
      // not surface in that companion's stack as though it were the companion's own defect.
      reportError(SUBSCRIBER_FAILURE, error);
    }
  }

  function publish(surfaceId) {
    const snapshot = snapshotOf(badgesBySurface.get(surfaceId));
    for (const listener of listenersBySurface.get(surfaceId) ?? []) notify(listener, snapshot);
  }

  function declaresTab(provider, tabId) {
    return Array.isArray(provider?.tabs) && provider.tabs.some((tab) => tab?.id === tabId);
  }

  // Value equality, not identity: `normalizeBadge` mints a fresh frozen object per call, so a
  // companion restating the same count from a data listener would otherwise republish forever
  // and wake the rail's readers for nothing.
  function sameBadge(current, next) {
    if (current === next) return true;
    if (!current || !next) return false;
    return current.count === next.count && current.accessibleName === next.accessibleName;
  }

  function store(surfaceId, tabId, badge) {
    let tabBadges = badgesBySurface.get(surfaceId);
    if (badge === null) {
      if (!tabBadges) return;
      tabBadges.delete(tabId);
      // A surface holding nothing is REMOVED rather than left as an empty map, so `snapshotOf`
      // answers with the one shared empty snapshot and the two "no badges" states — never set,
      // and set then cleared — are indistinguishable to every reader.
      if (tabBadges.size === 0) badgesBySurface.delete(surfaceId);
      return;
    }
    if (!tabBadges) {
      tabBadges = new Map();
      badgesBySurface.set(surfaceId, tabBadges);
    }
    tabBadges.set(tabId, badge);
  }

  return Object.freeze({
    setBadge(surfaceId, tabId, badge) {
      requireNonEmptyString(surfaceId, `${BADGE} requires a non-empty surface id`);
      requireNonEmptyString(tabId, `${BADGE} requires a non-empty tab id`);
      // Validate FIRST and unconditionally, before asking whether anyone holds this surface.
      // A malformed badge therefore throws even on a surface no provider holds, which is
      // `routeChromeChannel.setChrome`'s shipped ordering and its stated reason: the `TypeError`
      // belongs in the companion's own call stack, and a companion feature-detecting this seam
      // must not get a different answer depending on the order two modules happened to load in.
      const normalized = normalizeBadge(badge);
      // Liveness second. A well-formed badge for a surface nobody holds — or for a tab the
      // holder does not declare — is REFUSED rather than parked: a badge stored against a tab
      // that may never exist would surface later, on a provider that never asked for it.
      if (!declaresTab(findProvider(surfaceId), tabId)) return false;
      const current = badgesBySurface.get(surfaceId)?.get(tabId) ?? null;
      if (sameBadge(current, normalized)) return true;
      store(surfaceId, tabId, normalized);
      publish(surfaceId);
      return true;
    },

    subscribe(surfaceId, listener) {
      requireNonEmptyString(surfaceId, `${BADGE} subscription requires a non-empty surface id`);
      if (typeof listener !== 'function') {
        throw new TypeError(`${BADGE} subscriber must be a function`);
      }
      let surfaceListeners = listenersBySurface.get(surfaceId);
      if (!surfaceListeners) {
        surfaceListeners = new Set();
        listenersBySurface.set(surfaceId, surfaceListeners);
      }
      surfaceListeners.add(listener);
      // The immediate replay goes through the same guard as a later publication: a subscriber
      // that throws on its first snapshot must not take the SUBSCRIBING caller down with it,
      // and Core's own Manager root is among those callers.
      notify(listener, snapshotOf(badgesBySurface.get(surfaceId)));
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        surfaceListeners.delete(listener);
      };
    },

    snapshotFor(surfaceId) {
      return snapshotOf(badgesBySurface.get(surfaceId));
    },

    retainSurfaces(surfaceIds) {
      const claimed = new Set(surfaceIds ?? []);
      for (const surfaceId of [...badgesBySurface.keys()]) {
        if (claimed.has(surfaceId)) continue;
        badgesBySurface.delete(surfaceId);
        publish(surfaceId);
      }
    },
  });
}

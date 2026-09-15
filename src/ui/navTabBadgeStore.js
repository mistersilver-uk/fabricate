import { requireNonEmptyString } from './extensionRegistry.js';

// The runtime side of a Manager World-navigation tab BADGE (issue 1302). A registration-time count
// is stale the moment the thing it counts changes, and restating one by re-registering flashes
// Core's preview through the gap. So the badge is scoped to the REGISTRATION, not to a mount —
// unlike the seam's three mount-context channels, its whole job is to be true while the companion
// is NOT mounted. It is dropped with its PROVIDER, so a re-registered tab of the same id starts
// from its own registered badge rather than inheriting the previous registration's number.
// A plain leaf, and the contract and the provider lookup are INJECTED rather than imported: both
// live in `managerExtensions.js`, which owns this store, so importing them back would close a
// module cycle whose failure mode is a temporal-dead-zone `ReferenceError` at import time.

const BADGE = 'Fabricate World navigation tab badge';
const SUBSCRIBER_FAILURE = 'Fabricate | Manager nav badge subscriber failed:';

// One shared value rather than a fresh empty object per publication, so a reader comparing
// identities is not woken by a surface with nothing to say. Null-prototype for the reason below.
const NO_BADGES = Object.freeze(Object.create(null));

// NULL-PROTOTYPE, because the keys are companion-controlled tab ids: a plain literal inherits
// `toString` and `__proto__`, so a tab legitimately called `toString` would resolve to a function
// rather than to a badge. Frozen because every subscriber receives the SAME object.
function snapshotOf(tabBadges) {
  if (!tabBadges || tabBadges.size === 0) return NO_BADGES;
  const snapshot = Object.create(null);
  for (const [tabId, badge] of tabBadges) snapshot[tabId] = badge;
  return Object.freeze(snapshot);
}

// THREE LAYERS, IN ONE ORDER: the runtime badge, then the tab's REGISTERED badge, then none.
// `null` on the runtime channel CLEARS that layer, so the tab falls back to registration; an
// explicit `{ count: 0 }` is a POSITIVE ZERO and does NOT fall back, because "the tab holds
// nothing" is a different claim from "no count was stated" — the analogue of an empty `actions`.
export function resolveNavTabBadge(tab, runtimeSnapshot) {
  const tabId = tab?.id;
  // `Object.hasOwn`, so a tab id colliding with an inherited member cannot resolve to one.
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

// THE RESOLVED VALUE, ONCE PER TAB — never `sum(registered) + sum(runtime)`. The runtime layer
// OVERRIDES the registered one rather than adding to it, so an additive reading double-counts every
// tab holding both. An un-badged tab contributes `0` rather than throwing: the rail renders whatever
// a companion declares, and a total is not the place to discover a malformed tab.
export function navTabBadgeTotal(tabs, runtimeSnapshot) {
  if (!Array.isArray(tabs)) return 0;
  return tabs.reduce(
    (total, tab) => total + (resolveNavTabBadge(tab, runtimeSnapshot)?.count ?? 0),
    0
  );
}

export function createNavTabBadgeStore({
  normalizeBadge,
  findProvider,
  // Read through `console` at CALL time: a store is created once, so a captured reference would pin
  // whatever the sink was then and make a later swap silently ineffective against this channel.
  reportError = (...args) => console.error(...args),
} = {}) {
  if (typeof normalizeBadge !== 'function' || typeof findProvider !== 'function') {
    throw new TypeError(`${BADGE} store requires normalizeBadge and findProvider functions`);
  }

  // Two levels rather than a composed `surface:tab` key: dropping a whole surface is a lifetime rule
  // this store owes the registry, and a composed key would make it a string-prefix scan.
  const badgesBySurface = new Map();
  const listenersBySurface = new Map();

  function notify(listener, snapshot) {
    try {
      listener(snapshot);
    } catch (error) {
      // This publication runs inside a COMPANION's call to `setWorldNavTabBadge`, so a throwing
      // Core subscriber must not surface in that companion's stack as its own defect.
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

  // Value equality, not identity: `normalizeBadge` mints a fresh object per call, so a companion
  // restating the same count from a data listener would otherwise republish forever.
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
      // Removed rather than left as an empty map, so "never set" and "set then cleared" are
      // indistinguishable to every reader through the one shared empty snapshot.
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
      // Validate FIRST and unconditionally, so a malformed badge throws even on a surface no
      // provider holds — `routeChromeChannel.setChrome`'s ordering, for its reason: a companion
      // feature-detecting this seam must not get a different answer depending on module load order.
      const normalized = normalizeBadge(badge);
      // Liveness second, and a well-formed badge for a tab nobody declares is REFUSED rather than
      // parked: parked, it would surface later on a provider that never asked for it.
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
      // The immediate replay takes the same guard as a later publication: a subscriber throwing on
      // its first snapshot must not take the subscribing caller down with it.
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

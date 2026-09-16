// The machinery both page-session provider registries share (issue 1198). They differ only in what
// a provider IS, what the registration methods are CALLED, and which hooks they emit; the surface
// keying, listener sets, fault-contained notify guard, tokened idempotent unregister, frozen
// surface-id broadcast and public-API bind are identical, so they live here exactly once.
// A plain leaf: no Foundry global, no Svelte runtime.

// Exported because both validators need this rule and a second copy is a duplication finding.
export function requireNonEmptyString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(message);
}

// Frozen because every listener receives the SAME object; a mutable payload would let one listener
// rewrite what the next one reads.
export function providerHookPayload(provider) {
  return Object.freeze({
    schemaVersion: 1,
    surfaceId: provider.id,
    tabIds: Object.freeze(provider.tabs.map((tab) => tab.id)),
  });
}

// The accessor NAMES are parameters rather than a convention on purpose: the shipped Manager
// registry returns `getWorldNavProvider` and `listWorldNavSurfaceIds` and its suite pins both, so a
// factory imposing its own names would be a public behaviour change dressed as a refactor.
// `additionalPublicMethods` exists because one registry may own a page-session channel that is not
// a registration and must not die with a mount (the Manager's `setWorldNavTabBadge`, issue 1302);
// omitting it leaves `publicApi`'s key set exactly as it was, so the player seam is untouched.
export function createExtensionRegistry({
  validateProvider,
  registeredHook,
  unregisteredHook,
  apiPropertyName,
  registerMethodName,
  getProviderMethodName,
  listSurfaceIdsMethodName,
  conflictNoun,
  errorNoun,
  subscriberFailureMessage,
  reportError = console.error,
  emitHook,
  additionalPublicMethods,
}) {
  // One provider per surface id, not one provider full stop. The registry never enumerates the ids
  // it will accept, so a companion may claim a surface Core has never heard of.
  const providers = new Map();
  const registrationTokens = new Map();
  const listeners = new Map();
  // The SET of claimed surfaces, not one surface's provider: no per-surface subscription can answer
  // "is a companion present at all", because one claiming only an unknown surface publishes to nobody.
  const surfaceSetListeners = new Set();

  function notify(listener, value) {
    try {
      listener(value);
    } catch (error) {
      reportError(subscriberFailureMessage, error);
    }
  }

  function currentSurfaceIds() {
    return [...providers.keys()];
  }

  // The immediate replay goes through the SAME guard as a later publication: a subscriber that
  // throws on its first snapshot must not take the subscribing caller down with it.
  function addListener(set, listener, initialValue) {
    set.add(listener);
    notify(listener, initialValue);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      set.delete(listener);
    };
  }

  function publish(surfaceId) {
    const provider = providers.get(surfaceId) ?? null;
    for (const listener of listeners.get(surfaceId) ?? []) {
      notify(listener, provider);
    }
    // Frozen for the same reason the hook payload is: every subscriber receives the SAME array.
    const surfaceIds = Object.freeze(currentSurfaceIds());
    for (const listener of surfaceSetListeners) {
      notify(listener, surfaceIds);
    }
  }

  function unregisterWith(provider, token) {
    // The token, not the provider id, authorises the removal: a handle held over an
    // unregister-then-re-register cycle must not evict the LATER provider.
    if (registrationTokens.get(provider.id) !== token) return;
    registrationTokens.delete(provider.id);
    providers.delete(provider.id);
    publish(provider.id);
    emitHook(unregisteredHook, providerHookPayload(provider));
  }

  function registerProvider(provider) {
    validateProvider(provider);
    if (providers.has(provider.id)) {
      throw new Error(`${conflictNoun} "${provider.id}" is already registered`);
    }

    const token = {};
    registrationTokens.set(provider.id, token);
    providers.set(provider.id, provider);
    publish(provider.id);
    emitHook(registeredHook, providerHookPayload(provider));

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      unregisterWith(provider, token);
    };
  }

  function subscribe(surfaceId, listener) {
    requireNonEmptyString(
      surfaceId,
      `Fabricate ${errorNoun} surface id must be a non-empty string`
    );
    if (typeof listener !== 'function') {
      throw new TypeError(`Fabricate ${errorNoun} subscriber must be a function`);
    }
    let surfaceListeners = listeners.get(surfaceId);
    if (!surfaceListeners) {
      surfaceListeners = new Set();
      listeners.set(surfaceId, surfaceListeners);
    }
    return addListener(surfaceListeners, listener, providers.get(surfaceId) ?? null);
  }

  // Deliberately NOT keyed on a surface id, and it serves two questions: the Manager title bar's
  // "is any companion registered at all", which keyed on one Core route would become a claim about
  // that route, and the player window's "which surfaces are claimed now", its SOLE subscription and
  // the input it re-derives its whole rail snapshot from (issue 1198).
  function subscribeSurfaceIds(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Fabricate ${errorNoun} subscriber must be a function`);
    }
    return addListener(surfaceSetListeners, listener, Object.freeze(currentSurfaceIds()));
  }

  // Spread AFTER the registration method, so a specialisation cannot displace the one method every
  // registry must publish by accident of key order; naming it makes the override stated.
  const publicApi = Object.freeze({
    [registerMethodName]: registerProvider,
    ...additionalPublicMethods,
  });

  return Object.freeze({
    publicApi,
    bindPublicApi(api) {
      if (!api || typeof api !== 'object') {
        throw new TypeError(`Fabricate ${errorNoun} API target must be an object`);
      }
      api[apiPropertyName] = publicApi;
      return api;
    },
    [getProviderMethodName]: (surfaceId) => providers.get(surfaceId) ?? null,
    [listSurfaceIdsMethodName]: currentSurfaceIds,
    // Shared with the mount hosts, so surface and tab hooks travel the registry's own injectable seam.
    emitHook,
    subscribe,
    subscribeSurfaceIds,
  });
}

/**
 * The machinery every Fabricate companion-extension registry shares.
 *
 * Fabricate publishes two page-session provider registries — one for GM Manager surfaces
 * and one for player-window surfaces (issue 1198). They differ only in what a provider IS
 * (the validator), what the registration methods are CALLED, and which hooks they emit.
 * Everything else — the surface keying, the listener sets, the fault-contained notify
 * guard, the tokened idempotent unregister, the frozen surface-id broadcast and the public
 * API bind — is identical, so it lives here exactly once.
 *
 * This module imports no Foundry global and no Svelte runtime: it is a plain leaf both
 * registries and their unit suites can load directly.
 */

/**
 * Throw a `TypeError` with `message` unless `value` is a string with non-blank content.
 *
 * Exported because both validators need the same rule and a second copy of a three-line
 * guard is a duplication finding, not a convenience.
 *
 * @param {*} value Candidate value.
 * @param {string} message Message for the thrown `TypeError`.
 * @throws {TypeError} When `value` is not a non-empty string.
 */
export function requireNonEmptyString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(message);
}

/**
 * Build the frozen payload the registration and unregistration hooks carry.
 *
 * Frozen because every listener receives the same object; a mutable payload would let one
 * listener rewrite what the next one reads.
 *
 * @param {{id: string, tabs: Array<{id: string}>}} provider Validated provider.
 * @returns {Readonly<{schemaVersion: 1, surfaceId: string, tabIds: readonly string[]}>} Payload.
 */
export function providerHookPayload(provider) {
  return Object.freeze({
    schemaVersion: 1,
    surfaceId: provider.id,
    tabIds: Object.freeze(provider.tabs.map((tab) => tab.id)),
  });
}

/**
 * Options that specialise one registry.
 *
 * The accessor names are parameters rather than a convention on purpose: the shipped
 * Manager registry returns `getWorldNavProvider` and `listWorldNavSurfaceIds`, and its unit
 * suite pins both, so a factory that imposed its own names would be a public behaviour
 * change wearing the costume of a refactor.
 *
 * @typedef {object} ExtensionRegistryOptions
 * @property {(provider: object) => void} validateProvider Throws on a malformed provider.
 * @property {string} registeredHook Hook name emitted on registration.
 * @property {string} unregisteredHook Hook name emitted on unregistration.
 * @property {string} apiPropertyName Property `bindPublicApi` assigns onto the API target.
 * @property {string} registerMethodName Name of the public registration method.
 * @property {string} getProviderMethodName Name of the provider getter on the registry.
 * @property {string} listSurfaceIdsMethodName Name of the surface-id lister on the registry.
 * @property {string} conflictNoun Noun used in the same-surface conflict error.
 * @property {string} errorNoun Lower-case noun used in the subscriber and bind errors.
 * @property {string} subscriberFailureMessage Prefix logged when a subscriber throws.
 * @property {(...args: unknown[]) => void} [reportError] Error sink for a throwing subscriber.
 * @property {(name: string, payload: object) => void} emitHook Hook edge.
 */

/**
 * Create one surface-keyed companion-extension registry.
 *
 * @param {ExtensionRegistryOptions} options Per-registry specialisation.
 * @returns {Readonly<object>} Frozen registry.
 */
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
}) {
  // One provider per surface id, not one provider full stop. The registry never
  // enumerates the ids it will accept, so a companion may claim a surface Core has never
  // heard of; Core simply renders the surfaces it knows how to host.
  const providers = new Map();
  const registrationTokens = new Map();
  const listeners = new Map();
  // Subscribers to the SET of claimed surfaces rather than to one surface's provider.
  // Core uses this to answer "is a companion module present at all", a question no
  // per-surface subscription can answer: a companion that claims only a surface Core has
  // never heard of publishes to nobody, and the shell would never learn it exists.
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

  /**
   * Add one listener to a listener set, replay the current value into it, and return an
   * idempotent unsubscribe.
   *
   * The immediate replay goes through the same guard as a later publication: a subscriber
   * that throws on its first snapshot must not take the SUBSCRIBING caller down with it,
   * and Core's own shells are among those callers.
   *
   * @param {Set<Function>} set Listener set to join.
   * @param {Function} listener Subscriber.
   * @param {*} initialValue Value replayed immediately.
   * @returns {() => void} Idempotent unsubscribe.
   */
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
    // Frozen because every surface-set subscriber receives the SAME array; a mutable
    // broadcast would let one subscriber rewrite what the next one reads.
    const surfaceIds = Object.freeze(currentSurfaceIds());
    for (const listener of surfaceSetListeners) {
      notify(listener, surfaceIds);
    }
  }

  function unregisterWith(provider, token) {
    // The token, not the provider id, is what authorises the removal: a handle held over
    // an unregister-then-re-register cycle must not evict the LATER provider.
    if (registrationTokens.get(provider.id) !== token) return;
    registrationTokens.delete(provider.id);
    providers.delete(provider.id);
    publish(provider.id);
    emitHook(unregisteredHook, providerHookPayload(provider));
  }

  /**
   * Register the page session's provider for one surface.
   *
   * @param {object} provider Companion-owned provider definition.
   * @returns {() => void} Idempotent unregister function.
   * @throws {TypeError} When the provider does not meet API-v1 requirements.
   * @throws {Error} When another provider already holds that surface.
   */
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

  /**
   * Subscribe to the set of surface ids a companion currently claims.
   *
   * Deliberately NOT keyed on a surface id, and it serves two different questions rather
   * than one. The Manager's title bar asks "is any companion module registered at all":
   * keying that report on one Core route would make it a claim about the route rather than
   * about the companion module, and a companion-only surface would never light it. The
   * player window asks "which surfaces are claimed right now", because this is that
   * window's SOLE subscription and it re-derives its whole rail snapshot from each
   * publication (issue 1198). Both are served by the same broadcast, so neither consumer
   * needs a second listener set.
   *
   * @param {(surfaceIds: readonly string[]) => void} listener Receives the current ids
   *   immediately and again on every registration and unregistration.
   * @returns {() => void} Idempotent unsubscribe.
   */
  function subscribeSurfaceIds(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Fabricate ${errorNoun} subscriber must be a function`);
    }
    return addListener(surfaceSetListeners, listener, Object.freeze(currentSurfaceIds()));
  }

  const publicApi = Object.freeze({ [registerMethodName]: registerProvider });

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
    // Core's own hook edge, shared with the mount hosts so the surface/tab hooks travel
    // through the same injectable seam the registry's own hooks do.
    emitHook,
    subscribe,
    subscribeSurfaceIds,
  });
}

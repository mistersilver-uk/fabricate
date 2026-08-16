import { MANAGER_HOOKS } from '../config/hooks.js';

/**
 * The surface id Core's GM Manager looks a World navigation provider up under for its
 * `World > Downtime` route. It is the ONLY id Core itself consumes; the registry accepts
 * any non-empty string, so a future Core surface (or a companion-only one) needs no
 * change here.
 */
export const WORLD_DOWNTIME_SURFACE_ID = 'downtime';

const REQUIRED_TAB_FIELDS = Object.freeze(['label', 'accessibleName', 'tooltip', 'icon']);
// Route chrome. Every one is optional; Core keeps its own string when a tab omits it.
const OPTIONAL_TAB_FIELDS = Object.freeze(['title', 'subtitle', 'breadcrumb', 'actionsLabel']);
const OPTIONAL_ACTION_FIELDS = Object.freeze(['icon', 'tooltip']);
// A header action may link out, but only over http(s): Core renders the value into an
// `href`, so a `javascript:` or `data:` URL would be script injection through the seam.
const EXTERNAL_ACTION_HREF = /^https?:\/\//i;
const PROVIDER = 'Fabricate World navigation provider';

/**
 * A header action a provider may contribute to the Manager's route header.
 *
 * Exactly one of `href` and `onSelect` is required: `href` renders a secure external
 * anchor, `onSelect` renders a button Core invokes with the surface's mount context plus
 * the action id.
 *
 * @typedef {object} WorldNavProviderAction
 * @property {string} id Non-empty id, unique within its action list.
 * @property {string} label Localized visible label.
 * @property {string} [icon] Font Awesome icon class string.
 * @property {string} [tooltip] Localized native tooltip.
 * @property {boolean} [primary] Renders the action with the Manager's primary treatment.
 * @property {boolean} [disabled] Renders a non-`href` action disabled.
 * @property {string} [href] Absolute `http(s)` URL, opened in a new tab.
 * @property {(context: WorldNavActionContext) => void} [onSelect] Click handler.
 */

/**
 * A labelled tab in a World navigation provider.
 *
 * The provider declares its OWN tabs: any ids, any count from one upwards, rendered in
 * array order. Core validates shape only and never membership, so adding, removing,
 * reordering or renaming a tab is a companion decision.
 *
 * @typedef {object} WorldNavProviderTab
 * @property {string} id Non-empty tab id, unique within the provider's tab set.
 * @property {string} label Localized visible tab label.
 * @property {string} accessibleName Localized accessible tab name.
 * @property {string} tooltip Localized keyboard-visible tab tooltip.
 * @property {string} icon Font Awesome icon class string.
 * @property {string} [title] Localized route title (the page `H1`) for this tab.
 * @property {string} [subtitle] Localized route subtitle for this tab.
 * @property {string} [breadcrumb] Localized leaf breadcrumb crumb for this tab.
 * @property {string} [actionsLabel] Localized accessible name of the header action group.
 * @property {WorldNavProviderAction[]} [actions] Header actions for this tab; falls back
 *   to the provider's own `actions` when omitted.
 */

/**
 * The immutable context Core supplies to a mounted provider.
 *
 * It is frozen, carries no Core store, document or component, and is replaced (never
 * mutated) whenever one of its values changes — which is also what makes it the value a
 * host keys a remount on.
 *
 * @typedef {object} WorldNavMountContext
 * @property {1} schemaVersion Context contract version.
 * @property {'manager'} surface The Fabricate application hosting the provider.
 * @property {string} surfaceId The registry surface id this provider was registered under.
 * @property {string} route The Manager route rendering the provider.
 * @property {string} tabId The active tab id (identical to `mount`'s own `tabId`).
 * @property {string|null} craftingSystemId The Manager's selected crafting system id, or
 *   `null` — the route is reachable with no system selected.
 * @property {boolean} isGM Whether the current Foundry user is a Game Master.
 * @property {number} revision Increments on every `requestRemount()` call.
 * @property {() => void} requestRemount Ask Core to re-render this surface: Core runs the
 *   current mount's cleanup, clears the target, and calls `mount` again with a fresh
 *   context. Safe to call from a companion's own data listeners.
 */

/**
 * The context Core passes to a header action's `onSelect`.
 *
 * @typedef {WorldNavMountContext & {actionId: string}} WorldNavActionContext
 */

/**
 * The mount arguments supplied to a World navigation provider.
 *
 * @typedef {object} WorldNavMountOptions
 * @property {HTMLElement} target Empty connected element that receives companion content.
 * @property {string} tabId Active tab id, always one of the provider's own tab ids.
 * @property {WorldNavMountContext} context Frozen Manager context supplied by Fabricate.
 */

/**
 * A companion-owned replacement for a Core Manager navigation surface.
 *
 * @typedef {object} WorldNavProvider
 * @property {1} apiVersion API version supported by this provider.
 * @property {string} id Surface id this provider claims (Core's Downtime route is
 *   `'downtime'`; see {@link WORLD_DOWNTIME_SURFACE_ID}).
 * @property {WorldNavProviderTab[]} tabs One or more tabs, in render order.
 * @property {WorldNavProviderAction[]} [actions] Default header actions for any tab that
 *   declares none of its own.
 * @property {(options: WorldNavMountOptions) => (void|Function)} mount Synchronous mount
 *   callback returning one cleanup function, or nothing.
 */

/**
 * Publish a public Fabricate hook. Read through `globalThis` at call time so the module
 * imports no Foundry global and no-ops in Node tests.
 *
 * @param {string} name Hook name from `MANAGER_HOOKS`.
 * @param {object} payload Frozen, JSON-shaped payload.
 */
export function emitManagerHook(name, payload) {
  globalThis.Hooks?.callAll?.(name, payload);
}

function requireNonEmptyString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(message);
}

function validateActionTarget(action, label) {
  const hasHref = action.href !== undefined;
  const hasSelect = action.onSelect !== undefined;
  if (hasHref === hasSelect) {
    throw new TypeError(`${label} action "${action.id}" must declare exactly one of href, onSelect`);
  }
  if (hasSelect && typeof action.onSelect !== 'function') {
    throw new TypeError(`${label} action "${action.id}" onSelect must be a function`);
  }
  if (hasHref && (typeof action.href !== 'string' || !EXTERNAL_ACTION_HREF.test(action.href))) {
    throw new TypeError(`${label} action "${action.id}" href must be an absolute http(s) URL`);
  }
}

function validateAction(action, index, seenIds, label) {
  if (!action || typeof action !== 'object') {
    throw new TypeError(`${label} action ${index} must be an object`);
  }
  requireNonEmptyString(action.id, `${label} action ${index} requires a non-empty id`);
  if (seenIds.has(action.id)) {
    throw new TypeError(`${label} declares a duplicate action id: "${action.id}"`);
  }
  seenIds.add(action.id);
  requireNonEmptyString(action.label, `${label} action "${action.id}" requires a non-empty label`);
  for (const field of OPTIONAL_ACTION_FIELDS) {
    if (action[field] === undefined) continue;
    requireNonEmptyString(
      action[field],
      `${label} action "${action.id}" requires a non-empty ${field}`
    );
  }
  validateActionTarget(action, label);
}

function validateActions(actions, label) {
  if (actions === undefined) return;
  if (!Array.isArray(actions)) throw new TypeError(`${label} actions must be an array`);
  const seenIds = new Set();
  actions.forEach((action, index) => validateAction(action, index, seenIds, label));
}

function validateTab(tab, index, seenIds) {
  if (!tab || typeof tab !== 'object') {
    throw new TypeError(`${PROVIDER} tab ${index} must be an object`);
  }
  requireNonEmptyString(tab.id, `${PROVIDER} tab ${index} requires a non-empty id`);
  if (seenIds.has(tab.id)) {
    throw new TypeError(`${PROVIDER} declares a duplicate tab id: "${tab.id}"`);
  }
  seenIds.add(tab.id);
  for (const field of REQUIRED_TAB_FIELDS) {
    requireNonEmptyString(tab[field], `${PROVIDER} tab "${tab.id}" requires a non-empty ${field}`);
  }
  for (const field of OPTIONAL_TAB_FIELDS) {
    if (tab[field] === undefined) continue;
    requireNonEmptyString(tab[field], `${PROVIDER} tab "${tab.id}" requires a non-empty ${field}`);
  }
  validateActions(tab.actions, `${PROVIDER} tab "${tab.id}"`);
}

function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError(`${PROVIDER} must be an object`);
  }
  if (provider.apiVersion !== 1) {
    throw new TypeError(
      `Unsupported World navigation provider API version: ${String(provider.apiVersion)}`
    );
  }
  requireNonEmptyString(provider.id, `${PROVIDER} requires a non-empty surface id`);
  if (!Array.isArray(provider.tabs) || provider.tabs.length === 0) {
    throw new TypeError(`${PROVIDER} "${provider.id}" must declare at least one tab`);
  }
  const seenIds = new Set();
  provider.tabs.forEach((tab, index) => validateTab(tab, index, seenIds));
  validateActions(provider.actions, PROVIDER);
  if (typeof provider.mount !== 'function') {
    throw new TypeError(`${PROVIDER} mount must be a function`);
  }
  if (provider.mount.constructor?.name === 'AsyncFunction') {
    throw new TypeError(`${PROVIDER} mount must be synchronous`);
  }
}

function providerHookPayload(provider) {
  return Object.freeze({
    schemaVersion: 1,
    surfaceId: provider.id,
    tabIds: Object.freeze(provider.tabs.map((tab) => tab.id)),
  });
}

export function createManagerExtensionsRegistry({
  reportError = console.error,
  emitHook = emitManagerHook,
} = {}) {
  // One provider per surface id, not one provider full stop. The registry never
  // enumerates the ids it will accept, so a companion may claim a surface Core has never
  // heard of; Core simply renders the surfaces it knows how to host.
  const providers = new Map();
  const registrationTokens = new Map();
  const listeners = new Map();

  function notify(listener, provider) {
    try {
      listener(provider);
    } catch (error) {
      reportError('Fabricate | Manager extension subscriber failed:', error);
    }
  }

  function publish(surfaceId) {
    const provider = providers.get(surfaceId) ?? null;
    for (const listener of listeners.get(surfaceId) ?? []) {
      notify(listener, provider);
    }
  }

  /**
   * Register the page session's provider for one Manager surface.
   *
   * The returned function is idempotent and restores the Core surface when it unregisters
   * the currently registered provider.
   *
   * @param {WorldNavProvider} provider Companion-owned provider definition.
   * @returns {() => void} Idempotent unregister function.
   * @throws {TypeError} When the provider does not meet API-v1 requirements.
   * @throws {Error} When another provider already holds that surface.
   */
  function registerWorldNavProvider(provider) {
    validateProvider(provider);
    if (providers.has(provider.id)) {
      throw new Error(`World navigation provider "${provider.id}" is already registered`);
    }

    const token = {};
    registrationTokens.set(provider.id, token);
    providers.set(provider.id, provider);
    publish(provider.id);
    emitHook(MANAGER_HOOKS.NAV_PROVIDER_REGISTERED, providerHookPayload(provider));

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      if (registrationTokens.get(provider.id) !== token) return;
      registrationTokens.delete(provider.id);
      providers.delete(provider.id);
      publish(provider.id);
      emitHook(MANAGER_HOOKS.NAV_PROVIDER_UNREGISTERED, providerHookPayload(provider));
    };
  }

  const publicApi = Object.freeze({ registerWorldNavProvider });

  return Object.freeze({
    publicApi,
    bindPublicApi(api) {
      if (!api || typeof api !== 'object') {
        throw new TypeError('Fabricate manager extension API target must be an object');
      }
      api.managerExtensions = publicApi;
      return api;
    },
    getWorldNavProvider: (surfaceId) => providers.get(surfaceId) ?? null,
    listWorldNavSurfaceIds: () => [...providers.keys()],
    // Core's own hook edge, shared with the Manager host so the route/tab hooks travel
    // through the same injectable seam the registry's own hooks do.
    emitHook,
    subscribe(surfaceId, listener) {
      requireNonEmptyString(
        surfaceId,
        'Fabricate manager extension surface id must be a non-empty string'
      );
      if (typeof listener !== 'function') {
        throw new TypeError('Fabricate manager extension subscriber must be a function');
      }
      let surfaceListeners = listeners.get(surfaceId);
      if (!surfaceListeners) {
        surfaceListeners = new Set();
        listeners.set(surfaceId, surfaceListeners);
      }
      surfaceListeners.add(listener);
      // The immediate replay goes through the same guard as a later publication: a
      // subscriber that throws on its first snapshot must not take the SUBSCRIBING caller
      // down with it, and Core's own Manager shell is one of those callers.
      notify(listener, providers.get(surfaceId) ?? null);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        surfaceListeners.delete(listener);
      };
    },
  });
}

/**
 * Page-session manager-extension registry.
 *
 * `bindFabricateGlobal()` replays its public object at init and ready, so a companion
 * provider registered during init survives the ready lifecycle bind.
 */
export const managerExtensions = createManagerExtensionsRegistry();

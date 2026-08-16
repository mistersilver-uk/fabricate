import { PLAYER_HOOKS } from '../config/hooks.js';
import { createExtensionRegistry, requireNonEmptyString } from './extensionRegistry.js';

/**
 * The shape every player surface id and player tab id must take.
 *
 * This is charset validation, NOT id enumeration: Core still never says which ids it will
 * accept, only what an id may be spelled with. The rule exists because the composed route
 * key `ext:<surfaceId>:<tabId>` is rendered into an HTML `id`, into an IDREF token list
 * (which is space-separated, so one space silently breaks `aria-labelledby`), into a
 * `data-` attribute value, and into the View Lab's `?tab=` query. House precedent is
 * `isSafeFlagKeySegment` in `src/config/flags.js`.
 */
const PLAYER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const REQUIRED_TAB_FIELDS = Object.freeze(['label', 'icon']);
// Optional, and RENDERED when supplied — nothing this seam validates goes unrendered.
// `accessibleName` becomes the button's `aria-label` and `tooltip` its `aria-describedby`
// target, so a present-but-empty value would produce an unnamed control, not a default one.
const OPTIONAL_TAB_FIELDS = Object.freeze(['accessibleName', 'tooltip']);
const PROVIDER = 'Fabricate player navigation provider';

/**
 * A labelled tab a player navigation provider contributes to the player window's nav rail.
 *
 * The provider declares its OWN tabs: any ids, any count from one upwards, rendered in
 * array order. Core validates shape only and never membership.
 *
 * Deliberately NO route chrome and NO header actions. The player window has no route
 * header, no breadcrumb trail and no header-action group, so validating `title`,
 * `subtitle`, `breadcrumb`, `actionsLabel` or `actions` would be validation theatre: Core
 * could not render any of them. They are not recognised, and Core reads only the fields
 * documented here — see `buildPlayerNavTabs` in `playerNavModel.js`, whose allowlist
 * projection makes an unrecognised field structurally unable to reach the rendered rail.
 *
 * @typedef {object} PlayerNavProviderTab
 * @property {string} id Tab id, unique within the provider's tab set, matching the
 *   permitted id charset.
 * @property {string} label Final visible tab label. Core renders it VERBATIM and localizes
 *   only its own tab labels, so this is display text and never a lang key.
 * @property {string} icon Full Font Awesome class list (for example `fas fa-anvil`),
 *   rendered verbatim; Core prefixes the icon family only for its own tabs.
 * @property {string} [accessibleName] Accessible name for the rail button. It REPLACES the
 *   visible label as the control's accessible name, so it must contain the visible label
 *   text or Label-in-Name breaks for speech-input users.
 * @property {string} [tooltip] Description exposed through `aria-describedby`.
 */

/**
 * The immutable context Core supplies to a mounted player provider.
 *
 * It is frozen, carries no Core store, document or component, and is replaced (never
 * mutated) whenever one of its values changes — which is also what makes it the value a
 * host keys a remount on.
 *
 * @typedef {object} PlayerNavMountContext
 * @property {1} schemaVersion Context contract version.
 * @property {'player'} surface The Fabricate application hosting the provider.
 * @property {string} surfaceId The registry surface id this provider was registered under.
 * @property {string} tabId The active tab id (identical to `mount`'s own `tabId`).
 * @property {string|null} actorId The shared Actor selection top bar's current selection,
 *   or `null` when nothing is selected.
 * @property {boolean} isGM Whether the current Foundry user is a Game Master. This is
 *   PRESENTATION, never authorization — it is also true for assistant GMs, and a companion
 *   showing GM affordances off it still needs its own gate on any privileged write.
 * @property {number} revision Increments on every `requestRemount()` call.
 * @property {() => void} requestRemount Ask Core to re-render this surface: Core runs the
 *   current mount's cleanup, clears the target, and calls `mount` again with a fresh
 *   context. Safe to call from a companion's own data listeners.
 */

/**
 * The mount arguments supplied to a player navigation provider.
 *
 * @typedef {object} PlayerNavMountOptions
 * @property {HTMLElement} target Empty connected element that receives companion content.
 * @property {string} tabId Active tab id, always one of the provider's OWN bare tab ids
 *   and never the composed route key.
 * @property {PlayerNavMountContext} context Frozen player context supplied by Fabricate.
 */

/**
 * A companion-owned set of top-level tabs added to Fabricate's player window.
 *
 * A player provider ADDS tabs; it never replaces Core content. That is the structural
 * difference from a Manager provider, and it is why the two provider shapes are
 * deliberately not identical.
 *
 * @typedef {object} PlayerNavProvider
 * @property {1} apiVersion API version supported by this provider.
 * @property {string} id Surface id this provider claims. Core has no player route of its
 *   own to name a surface independently, so the surface id IS the provider id.
 * @property {PlayerNavProviderTab[]} tabs One or more tabs, in render order.
 * @property {(options: PlayerNavMountOptions) => (void|Function)} mount Synchronous mount
 *   callback returning one cleanup function, or nothing.
 */

/**
 * Publish a public Fabricate hook. Read through `globalThis` at call time so the module
 * imports no Foundry global and no-ops in Node tests.
 *
 * @param {string} name Hook name from `PLAYER_HOOKS`.
 * @param {object} payload Frozen, JSON-shaped payload.
 */
export function emitPlayerHook(name, payload) {
  globalThis.Hooks?.callAll?.(name, payload);
}

function requirePermittedId(value, label) {
  if (!PLAYER_ID_PATTERN.test(value)) {
    throw new TypeError(
      `${label} "${value}" must be 1-64 characters of lowercase letters, digits and hyphens, starting with a letter or digit`
    );
  }
}

function validateTab(tab, index, seenIds) {
  if (!tab || typeof tab !== 'object') {
    throw new TypeError(`${PROVIDER} tab ${index} must be an object`);
  }
  requireNonEmptyString(tab.id, `${PROVIDER} tab ${index} requires a non-empty id`);
  requirePermittedId(tab.id, `${PROVIDER} tab id`);
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
}

function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError(`${PROVIDER} must be an object`);
  }
  if (provider.apiVersion !== 1) {
    throw new TypeError(
      `Unsupported player navigation provider API version: ${String(provider.apiVersion)}`
    );
  }
  requireNonEmptyString(provider.id, `${PROVIDER} requires a non-empty surface id`);
  requirePermittedId(provider.id, `${PROVIDER} surface id`);
  if (!Array.isArray(provider.tabs) || provider.tabs.length === 0) {
    throw new TypeError(`${PROVIDER} "${provider.id}" must declare at least one tab`);
  }
  const seenIds = new Set();
  provider.tabs.forEach((tab, index) => validateTab(tab, index, seenIds));
  if (typeof provider.mount !== 'function') {
    throw new TypeError(`${PROVIDER} mount must be a function`);
  }
  if (provider.mount.constructor?.name === 'AsyncFunction') {
    throw new TypeError(`${PROVIDER} mount must be synchronous`);
  }
}

/**
 * Create a player extension registry.
 *
 * Everything structural comes from the shared factory in `extensionRegistry.js`, which the
 * Manager registry is built from too (issue 1198). What stays here is what is genuinely
 * player-specific: the provider shape, its id charset rule, and the names this registry's
 * callers depend on.
 *
 * @param {object} [options] Injectable edges.
 * @param {(...args: unknown[]) => void} [options.reportError] Error sink for a throwing subscriber.
 * @param {(name: string, payload: object) => void} [options.emitHook] Hook edge.
 * @returns {Readonly<object>} Frozen registry.
 */
export function createPlayerExtensionsRegistry({
  reportError = console.error,
  emitHook = emitPlayerHook,
} = {}) {
  return createExtensionRegistry({
    validateProvider,
    registeredHook: PLAYER_HOOKS.NAV_PROVIDER_REGISTERED,
    unregisteredHook: PLAYER_HOOKS.NAV_PROVIDER_UNREGISTERED,
    apiPropertyName: 'playerExtensions',
    registerMethodName: 'registerPlayerNavProvider',
    getProviderMethodName: 'getPlayerNavProvider',
    listSurfaceIdsMethodName: 'listPlayerNavSurfaceIds',
    conflictNoun: 'Player navigation provider',
    errorNoun: 'player extension',
    subscriberFailureMessage: 'Fabricate | Player extension subscriber failed:',
    reportError,
    emitHook,
  });
}

/**
 * Page-session player-extension registry.
 *
 * `bindFabricateGlobal()` replays its public object at init and ready, so a companion
 * provider registered during init survives the ready lifecycle bind.
 */
export const playerExtensions = createPlayerExtensionsRegistry();

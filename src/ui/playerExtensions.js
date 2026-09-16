import { PLAYER_HOOKS } from '../config/hooks.js';
import { createExtensionRegistry, requireNonEmptyString } from './extensionRegistry.js';

// The player window's companion seam: the provider contract Core validates and the page-session
// registry it publishes as `playerExtensions` (issue 1198). The companion-facing contract is
// documented in `docs/api/index.md`; this module is where it is ENFORCED.

// CHARSET validation, not id ENUMERATION: Core still never says which ids it will accept, only what
// an id may be spelled with. The rule exists because the composed route key `ext:<surfaceId>:<tabId>`
// is rendered into an HTML `id`, into a space-separated IDREF token list, into a `data-` value and
// into the View Lab's `?tab=` query. House precedent is `isSafeFlagKeySegment` in `config/flags.js`.
const PLAYER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const REQUIRED_TAB_FIELDS = Object.freeze(['label', 'icon']);
// Optional, and RENDERED when supplied: `accessibleName` becomes the button's `aria-label` and
// REPLACES the visible label, so it must contain that text or Label-in-Name breaks for speech
// input; `tooltip` becomes its `aria-describedby` target. A present-but-empty value would produce
// an unnamed control rather than a default one, which is why it is still refused.
const OPTIONAL_TAB_FIELDS = Object.freeze(['accessibleName', 'tooltip']);
const PROVIDER = 'Fabricate player navigation provider';

// A player provider ADDS tabs and never replaces Core content, which is the structural difference
// from a Manager provider and why the two shapes are deliberately not identical. There is NO route
// chrome and no header actions: the player window has no route header, so validating `title` or
// `actions` would be validation theatre. `label` and `icon` are rendered VERBATIM — Core localizes
// and family-prefixes only its own tabs — and `buildPlayerNavTabs`' allowlist projection makes an
// unrecognised field structurally unable to reach the rendered rail.
// The mount context's `isGM` is PRESENTATION, never authorization: it is true for assistant GMs
// too, so a companion showing GM affordances off it still needs its own gate on a privileged write.

// Read through `globalThis` at call time, so the module imports no Foundry global.
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

// Everything structural comes from the shared factory in `extensionRegistry.js`, which the Manager
// registry is built from too (issue 1198); what stays here is player-specific.
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

// `bindFabricateGlobal()` replays this registry's public object at init and ready, so a provider
// registered during init survives the ready lifecycle bind.
export const playerExtensions = createPlayerExtensionsRegistry();

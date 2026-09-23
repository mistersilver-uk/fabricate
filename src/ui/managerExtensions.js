import { MANAGER_HOOKS } from '../config/hooks.js';
import { createExtensionRegistry, requireNonEmptyString } from './extensionRegistry.js';
import { createNavTabBadgeStore } from './navTabBadgeStore.js';

// The Manager's companion seam: the World navigation provider contract, its route chrome and
// header actions, and the page-session registry Core publishes as `managerExtensions` (issues
// 1198, 1213, 1302). Every shape a companion may state, and every rule Core enforces on it, is
// documented for companion authors in `docs/api/index.md`; this module is where those rules are
// ENFORCED, and `tests/manager-extensions.test.js` pins them.

// The ONLY surface id Core itself consumes; the registry accepts any non-empty string.
export const WORLD_DOWNTIME_SURFACE_ID = 'downtime';

const REQUIRED_TAB_FIELDS = Object.freeze(['label', 'accessibleName', 'tooltip', 'icon']);
// Route chrome. Every one is optional; Core keeps its own string when a tab omits it.
const OPTIONAL_TAB_FIELDS = Object.freeze(['title', 'subtitle', 'breadcrumb', 'actionsLabel']);
// Both required when a badge is present; nothing else is, so a `tone` fails at the call site.
const TAB_BADGE_FIELDS = Object.freeze(['count', 'accessibleName']);
// DERIVED rather than restated: a mirror would agree today and refuse the next optional field
// added above, blaming the companion for Core's omission (issue 1302).
const TAB_FIELDS = Object.freeze([
  'id',
  ...REQUIRED_TAB_FIELDS,
  ...OPTIONAL_TAB_FIELDS,
  'actions',
  'badge',
]);
const OPTIONAL_ACTION_FIELDS = Object.freeze(['icon', 'tooltip']);
// Boolean-only: a `primary: 'yes'` used to reach the renderer and quietly paint an ordinary button.
const BOOLEAN_ACTION_FIELDS = Object.freeze(['primary', 'disabled']);
// Named after the treatment rather than a colour, so a theme may repaint one without renaming it.
export const ACTION_TONES = Object.freeze(['primary', 'ghost', 'danger', 'neutral']);
// `fab-manager-button` is absent deliberately: it marks a control the `ManagerButton` primitive
// rendered, and this hands a class list to a `<button>` the Manager root writes by hand.
const HEADER_ACTION_BASE_CLASSES = 'fabricate-button manager-button';

// Beside the tones, not in the renderer, so adding a tone without its class is a visible omission.
// `neutral` maps to NO modifier: the unadorned `.manager-button` IS the neutral treatment.
const ACTION_TONE_CLASSES = Object.freeze({
  primary: 'is-primary',
  ghost: 'is-ghost',
  danger: 'is-danger',
  neutral: '',
});
// Only http(s): Core renders the value into an `href`, so `javascript:` would be script injection.
const EXTERNAL_ACTION_HREF = /^https?:\/\//i;
const PROVIDER = 'Fabricate World navigation provider';
const ROUTE_CHROME = 'Fabricate World navigation route chrome';
const NAV_TAB_BADGE = 'Fabricate World navigation tab badge';

// The first four are exactly `OPTIONAL_TAB_FIELDS`, so a companion learns one vocabulary. `icon`
// and `image` have NO registration counterpart (issue 1185): artwork is how a drill-down says it is
// one, and a tab that declared it could never turn it off.
const ROUTE_CHROME_TEXT_FIELDS = Object.freeze([
  ...OPTIONAL_TAB_FIELDS,
  'icon',
  'image',
]);
const ROUTE_CHROME_FIELDS = Object.freeze([...ROUTE_CHROME_TEXT_FIELDS, 'status', 'actions']);
const ROUTE_CHROME_STATUS_FIELDS = Object.freeze(['label', 'tone', 'tooltip']);
// A SUBSET of the tones `Chip` paints, and the subset is the point: a tone Core does not name is
// refused with a message rather than dropped silently by the primitive.
// `tests/manager-extensions.test.js` pins every entry against `Chip.svelte`'s own tone set.
export const ROUTE_CHROME_STATUS_TONES = Object.freeze([
  'warning',
  'info',
  'positive',
  'active',
  'neutral',
  'danger',
  'negative',
  'disabled',
]);
// `warning` because the named use case IS Core's own staged-changes chip, so the one-field call
// `status: { label: t('Unsaved') }` reproduces it exactly.
const DEFAULT_STATUS_TONE = 'warning';

/**
 * The immutable context Core supplies to a mounted provider. Frozen, carrying no Core store,
 * document or component, and REPLACED rather than mutated when a value changes, which is what
 * makes it the value a host keys a remount on. Companion-facing prose: `docs/api/index.md`.
 *
 * @typedef {object} WorldNavMountContext
 * @property {1} schemaVersion Context contract version.
 * @property {'manager'} surface The Fabricate application hosting the provider.
 * @property {string} surfaceId The registry surface id this provider was registered under.
 * @property {string} route The Manager route rendering the provider.
 * @property {string} tabId The active tab id (identical to `mount`'s own `tabId`).
 * @property {string|null} craftingSystemId The Manager's selected crafting system id, or `null`.
 * @property {boolean} isGM Whether the current Foundry user is a Game Master.
 * @property {number} revision Increments on every `requestRemount()` call.
 * @property {() => void} requestRemount Re-render this surface: Core runs the current mount's
 *   cleanup, clears the target, and calls `mount` again with a fresh context.
 * @property {(chrome: WorldNavRouteChrome|null) => boolean} setRouteChrome Restate this mount's
 *   route chrome without a remount. REPLACE, NEVER MERGE. Throws a `TypeError` on a malformed
 *   update and changes nothing; returns `false`, harmlessly, once the mount is no longer live.
 * @property {(handler: () => void) => (() => void)} onRouteReselect Handle the GM activating the
 *   rail sub-item of the tab already on screen. Returns an idempotent unsubscribe.
 * @property {(handler: (event: {reason: 'tab'|'route'|'close'}) => (boolean|Promise<boolean>)) => (() => void)}
 *   onBeforeNavigate Veto the navigations that would END this mount. `false` keeps the GM where
 *   they are; ANY other return allows. It refuses to treat a THROW as a veto (a companion defect
 *   must never trap a GM in a Manager they cannot close), refuses to run on a FORCED close, and
 *   refuses to ask a second time while an answer is pending.
 * @property {(tabId: string) => (boolean|Promise<boolean>)} navigateToTab Take the GM to another
 *   of THIS PROVIDER'S OWN tabs; the tab already on screen re-activates through `onRouteReselect`,
 *   any other is offered to this mount's guard with reason `'tab'`.
 *
 *   WHAT IT REFUSES: every destination this provider never registered, and every call from a
 *   RETIRED mount, both answering `false`. It also refuses to run inside an answer it is still
 *   waiting for, so calling it from an `onBeforeNavigate` body moves nobody — ask after answering.
 *   An unknown-but-well-formed id answers `false` rather than throwing, because membership is a
 *   runtime fact that moves under the companion's feet; malformed input throws a `TypeError`.
 */

// Read through `globalThis` at call time, so the module imports no Foundry global.
export function emitManagerHook(name, payload) {
  globalThis.Hooks?.callAll?.(name, payload);
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

// Split out of `validateAction`, which is already at the edge of the cognitive-complexity budget a
// CHANGED function gets. `primary` and `tone` are refused TOGETHER: `primary: true` IS
// `tone: 'primary'`, so a descriptor carrying both is redundant or contradictory, and a seam that
// picked a winner would render one thing while its author read the other.
function validateActionTreatment(action, label) {
  for (const field of BOOLEAN_ACTION_FIELDS) {
    if (action[field] !== undefined && typeof action[field] !== 'boolean') {
      throw new TypeError(`${label} action "${action.id}" ${field} must be a boolean`);
    }
  }
  if (action.tone === undefined) return;
  if (!ACTION_TONES.includes(action.tone)) {
    throw new TypeError(
      `${label} action "${action.id}" tone must be one of ${ACTION_TONES.join(', ')}`
    );
  }
  if (action.primary !== undefined) {
    throw new TypeError(`${label} action "${action.id}" must not declare both primary and tone`);
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
  validateActionTreatment(action, label);
  validateActionTarget(action, label);
}

function validateActions(actions, label) {
  if (actions === undefined) return;
  if (!Array.isArray(actions)) throw new TypeError(`${label} actions must be an array`);
  const seenIds = new Set();
  actions.forEach((action, index) => validateAction(action, index, seenIds, label));
}

// The very classes `CraftingSystemManagerRoot` writes for its own Back, Delete and Save controls,
// so a companion's action is INDISTINGUISHABLE from a Core one. `primary: true` is the shipped
// spelling of `tone: 'primary'`; the validator refuses both together, so this picks no winner.
export function managerHeaderActionClass(action) {
  const tone = action?.tone ?? (action?.primary === true ? 'primary' : 'neutral');
  const modifier = ACTION_TONE_CLASSES[tone] ?? '';
  return modifier ? `${HEADER_ACTION_BASE_CLASSES} ${modifier}` : HEADER_ACTION_BASE_CLASSES;
}

// Applied to BOTH sides of the seam — provider tab, badge and runtime chrome alike (issue 1302) —
// because a mistyped `subtile` otherwise produces no error, no warning and no visible effect. Only
// WHEN differs: a tab at registration, a chrome update on the drill-down click that sends it.
function refuseUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    throw new TypeError(`${label} does not accept "${key}"`);
  }
}

function normalizeStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new TypeError(`${ROUTE_CHROME} status must be an object`);
  }
  refuseUnknownKeys(status, ROUTE_CHROME_STATUS_FIELDS, `${ROUTE_CHROME} status`);
  requireNonEmptyString(status.label, `${ROUTE_CHROME} status requires a non-empty label`);
  if (status.tooltip !== undefined) {
    requireNonEmptyString(status.tooltip, `${ROUTE_CHROME} status requires a non-empty tooltip`);
  }
  if (status.tone !== undefined && !ROUTE_CHROME_STATUS_TONES.includes(status.tone)) {
    throw new TypeError(
      `${ROUTE_CHROME} status tone must be one of ${ROUTE_CHROME_STATUS_TONES.join(', ')}`
    );
  }
  return Object.freeze({
    label: status.label,
    tone: status.tone ?? DEFAULT_STATUS_TONE,
    tooltip: status.tooltip,
  });
}

// Exported because the runtime channel owns no contract of its own: the shape a companion may
// state is this module's business, so `tests/manager-extensions.test.js` pins it here. Validation
// happens BEFORE anything is stored, so a refused update leaves the header as it was.
export function normalizeRouteChrome(chrome) {
  if (chrome === null || chrome === undefined) return null;
  if (typeof chrome !== 'object' || Array.isArray(chrome)) {
    throw new TypeError(`${ROUTE_CHROME} must be an object, or null to restore the tab's chrome`);
  }
  refuseUnknownKeys(chrome, ROUTE_CHROME_FIELDS, ROUTE_CHROME);
  const normalized = {};
  for (const field of ROUTE_CHROME_TEXT_FIELDS) {
    if (chrome[field] === undefined) continue;
    requireNonEmptyString(chrome[field], `${ROUTE_CHROME} requires a non-empty ${field}`);
    normalized[field] = chrome[field];
  }
  // A header carries ONE piece of artwork, and `Medallion` renders its glyph only when `src` is
  // falsy, so a descriptor declaring both would silently discard the icon rather than fail.
  if (normalized.icon !== undefined && normalized.image !== undefined) {
    throw new TypeError(`${ROUTE_CHROME} declares both icon and image, which are exclusive`);
  }
  if (chrome.status !== undefined) normalized.status = normalizeStatus(chrome.status);
  if (chrome.actions !== undefined) {
    validateActions(chrome.actions, ROUTE_CHROME);
    // Copied and frozen: Core must not render from an array a companion can still splice. The
    // descriptors stay the companion's own objects, because they carry its `onSelect` closures.
    normalized.actions = Object.freeze([...chrome.actions]);
  }
  // `{}` and `null` both mean "no chrome to state", so they resolve to one value rather than to a
  // truthy empty layer the fallback chain would have to special-case.
  return Object.keys(normalized).length === 0 ? null : Object.freeze(normalized);
}

// Exported beside `normalizeRouteChrome` for the same reason, and validated before anything is
// stored, so a refused badge leaves the rail as it was.
export function normalizeNavTabBadge(badge, label = NAV_TAB_BADGE) {
  // `null` and `undefined` both mean "no badge"; on the runtime channel that is how one is CLEARED.
  if (badge === null || badge === undefined) return null;
  if (typeof badge !== 'object' || Array.isArray(badge)) {
    throw new TypeError(`${label} must be an object, or null to clear it`);
  }
  refuseUnknownKeys(badge, TAB_BADGE_FIELDS, label);
  // One guard for every wrong count: absent, negative, fractional, a string, `NaN`, `Infinity`, and
  // beyond `Number.MAX_SAFE_INTEGER`, where a numeral stops being the number it was written as.
  if (!Number.isSafeInteger(badge.count) || badge.count < 0) {
    throw new TypeError(`${label} requires a non-negative integer count`);
  }
  requireNonEmptyString(badge.accessibleName, `${label} requires a non-empty accessibleName`);
  return Object.freeze({ count: badge.count, accessibleName: badge.accessibleName });
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
  refuseUnknownKeys(tab, TAB_FIELDS, `${PROVIDER} tab "${tab.id}"`);
  for (const field of REQUIRED_TAB_FIELDS) {
    requireNonEmptyString(tab[field], `${PROVIDER} tab "${tab.id}" requires a non-empty ${field}`);
  }
  for (const field of OPTIONAL_TAB_FIELDS) {
    if (tab[field] === undefined) continue;
    requireNonEmptyString(tab[field], `${PROVIDER} tab "${tab.id}" requires a non-empty ${field}`);
  }
  validateActions(tab.actions, `${PROVIDER} tab "${tab.id}"`);
  if (tab.badge !== undefined) {
    normalizeNavTabBadge(tab.badge, `${PROVIDER} tab "${tab.id}" badge`);
    // Frozen IN PLACE rather than replaced by the copy above: the registry stores the companion's
    // own object by reference, so an unfrozen badge could be rewritten after it was validated.
    Object.freeze(tab.badge);
  }
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

// Everything structural comes from the shared factory in `extensionRegistry.js`, which the player
// registry is built from too (issue 1198); what stays here is Manager-specific. It also owns the
// page session's TAB BADGES (issue 1302), which hang here rather than on the frozen mount context
// because a badge's job is to be true while the companion is NOT mounted. They are dropped through
// the factory's existing surface-id broadcast, so the factory learns nothing about badges.
export function createManagerExtensionsRegistry({
  reportError = console.error,
  emitHook = emitManagerHook,
} = {}) {
  // The two collaborators need each other by NATURE: the store's liveness check asks which provider
  // holds a surface, and the registry's public API carries the store's setter. The knot is untied
  // with a deferred READ — `findProvider` runs at call time — so the module graph stays one-way.
  let registry = null;
  const badges = createNavTabBadgeStore({
    normalizeBadge: normalizeNavTabBadge,
    findProvider: (surfaceId) => registry?.getWorldNavProvider(surfaceId) ?? null,
    reportError,
  });
  registry = createExtensionRegistry({
    validateProvider,
    registeredHook: MANAGER_HOOKS.NAV_PROVIDER_REGISTERED,
    unregisteredHook: MANAGER_HOOKS.NAV_PROVIDER_UNREGISTERED,
    apiPropertyName: 'managerExtensions',
    registerMethodName: 'registerWorldNavProvider',
    getProviderMethodName: 'getWorldNavProvider',
    listSurfaceIdsMethodName: 'listWorldNavSurfaceIds',
    conflictNoun: 'World navigation provider',
    errorNoun: 'manager extension',
    subscriberFailureMessage: 'Fabricate | Manager extension subscriber failed:',
    reportError,
    emitHook,
    additionalPublicMethods: { setWorldNavTabBadge: badges.setBadge },
  });
  // A runtime badge does not survive its provider. The unsubscribe is deliberately dropped: this
  // pair lives for the page session, and a handle nobody can call would suggest a teardown path.
  registry.subscribeSurfaceIds(badges.retainSurfaces);
  return Object.freeze({ ...registry, subscribeNavTabBadges: badges.subscribe });
}

// `bindFabricateGlobal()` replays this registry's public object at init and ready, so a provider
// registered during init survives the ready lifecycle bind.
export const managerExtensions = createManagerExtensionsRegistry();

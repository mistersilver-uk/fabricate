/**
 * Every derivation the player window's nav rail needs, as pure functions.
 *
 * This module is a UI-FREE LEAF and must stay one: no Svelte import, no Foundry import, no
 * store import, and `localize` taken as a parameter rather than reached for. Three callers
 * need the same answers — the Svelte shell, the application host that owns the active tab,
 * and the View Lab's mount harness — and each of them computing its own was three
 * hand-maintained mirrors of one contract (issue 1198). Being a leaf is also what makes
 * the fallback branch, the thing most likely to be wrong, provable by a plain unit test
 * with no mount, no harness and no allowlist.
 */

/**
 * Prefix marking a nav entry as belonging to a registered provider rather than to Core.
 *
 * A colon rather than a slash because a slash reads as a path. The composed key is safe in
 * a `data-` attribute value, in a query parameter, and — under the registry's id charset
 * rule — as an HTML `id` and inside an IDREF token list. Selection in CSS or
 * `querySelector` is by ATTRIBUTE, never by id: an id selector containing a colon is
 * invalid CSS and throws a `SyntaxError` rather than returning null.
 */
export const EXTENSION_ROUTE_PREFIX = 'ext';

const ROUTE_KEY_SEGMENTS = 3;

// Core's Journal tab is the only entry carrying a live count badge, and the count is a
// value the shell pushes in. Named here rather than inferred so the rule is one constant
// instead of a condition spread across the projection.
const JOURNAL_TAB_ID = 'journal';

// Core authors its own five icon strings as bare glyph names and has always rendered them
// under the solid family. A provider supplies the WHOLE class list instead, so a companion
// reusing its Manager icon string cannot emit a doubled family class, and a brands glyph
// cannot end up with two conflicting `font-family` declarations and a blank glyph.
const CORE_ICON_FAMILY = 'fas';

/**
 * Compose the route key that addresses one provider tab.
 *
 * @param {string} surfaceId Registry surface id.
 * @param {string} tabId The provider's own bare tab id.
 * @returns {string} `ext:<surfaceId>:<tabId>`.
 */
export function buildRouteKey(surfaceId, tabId) {
  return `${EXTENSION_ROUTE_PREFIX}:${surfaceId}:${tabId}`;
}

/**
 * Split a route key back into its surface and tab ids.
 *
 * @param {*} key Candidate route key.
 * @returns {Readonly<{surfaceId: string, tabId: string}>|null} Parts, or `null` when `key`
 *   is not an extension route key.
 */
export function parseRouteKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts.length !== ROUTE_KEY_SEGMENTS) return null;
  const [prefix, surfaceId, tabId] = parts;
  if (prefix !== EXTENSION_ROUTE_PREFIX || surfaceId === '' || tabId === '') return null;
  return Object.freeze({ surfaceId, tabId });
}

/**
 * Is `id` one of Core's own tab ids rather than a provider route key?
 *
 * Structural on purpose. Core must not enumerate the ids it accepts from a provider, and
 * the five Core tab ids are already declared once — in the shell's own tab table — so a
 * list here would be a second copy of that table, which is the mirror this module exists
 * to remove. A caller that needs "is this one of MY five" intersects its own table; this
 * answers the only question the seam owns, which is "does this key address a provider".
 *
 * @param {*} id Candidate tab id.
 * @returns {boolean} True for a non-empty string that is not an extension route key.
 */
export function isCoreTabId(id) {
  return typeof id === 'string' && id !== '' && parseRouteKey(id) === null;
}

/**
 * Snapshot the registry's currently claimed surfaces, in its own insertion order.
 *
 * This is the single function the application host calls on every publication AND the one
 * the View Lab's mount harness calls to build its props bag, so the lab cannot drift from
 * production by computing the snapshot differently.
 *
 * @param {{listPlayerNavSurfaceIds: () => string[], getPlayerNavProvider: (id: string) => object|null}} registry
 *   Player extension registry.
 * @returns {readonly Readonly<{surfaceId: string, provider: object}>[]} Frozen snapshot.
 */
export function deriveExtensionSurfaces(registry) {
  const surfaceIds = registry?.listPlayerNavSurfaceIds?.() ?? [];
  const surfaces = [];
  for (const surfaceId of surfaceIds) {
    const provider = registry?.getPlayerNavProvider?.(surfaceId) ?? null;
    // A surface id with no provider behind it cannot be rendered, and skipping it here is
    // what keeps every downstream caller free of a null check.
    if (!provider) continue;
    surfaces.push(Object.freeze({ surfaceId, provider }));
  }
  return Object.freeze(surfaces);
}

function coreNavEntry(tab, journalNavCount, localize) {
  return Object.freeze({
    routeKey: tab.id,
    tabId: tab.id,
    surfaceId: null,
    isExtension: false,
    // Core's own labels are lang keys and are localized here. A provider's are not; see
    // `extensionNavEntry`.
    text: localize(tab.label),
    iconClass: `${CORE_ICON_FAMILY} ${tab.icon}`,
    count: tab.id === JOURNAL_TAB_ID ? journalNavCount : 0,
    accessibleName: null,
    tooltip: null,
  });
}

function extensionNavEntry(surfaceId, tab) {
  // EXPLICIT ALLOWLIST PROJECTION — never a spread. The rail renders a count badge for any
  // entry with a positive `count`, so a spread would give a provider declaring
  // `count: 12` an unvalidated, unbounded badge (a feature this seam deliberately does not
  // offer) with its route key landing in the badge's `data-` attribute. Projection makes
  // that unrepresentable: a field Core does not read cannot reach the rendered rail.
  return Object.freeze({
    routeKey: buildRouteKey(surfaceId, tab.id),
    tabId: tab.id,
    surfaceId,
    isExtension: true,
    // Provider text is FINAL DISPLAY TEXT and is rendered verbatim. Feeding it to
    // `localize` survives only because Foundry returns unknown keys unchanged, which is
    // undocumented and becomes a silent substitution the day a companion's label collides
    // with any key in the merged namespace.
    text: tab.label,
    iconClass: tab.icon,
    count: 0,
    accessibleName: typeof tab.accessibleName === 'string' ? tab.accessibleName : null,
    tooltip: typeof tab.tooltip === 'string' ? tab.tooltip : null,
  });
}

function normaliseCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Build the frozen nav-rail model: Core's own tabs first, then every registered provider's
 * tabs, grouped by surface in registration order and within a surface in the provider's
 * own array order.
 *
 * @param {object} options Derivation inputs.
 * @param {Array<{id: string, icon: string, label: string, requires?: string}>} options.coreTabs
 *   Core's own tab table, in render order.
 * @param {boolean} [options.showAlchemy] Whether the conditional Alchemy entry is offered.
 * @param {number} [options.journalNavCount] Live active-run count for the Journal entry.
 * @param {readonly {surfaceId: string, provider: object}[]} [options.extensionSurfaces]
 *   Snapshot from {@link deriveExtensionSurfaces}.
 * @param {(key: string) => string} options.localize Localizer for Core's own labels.
 * @returns {readonly Readonly<object>[]} Frozen rail model.
 */
export function buildPlayerNavTabs({
  coreTabs = [],
  showAlchemy = false,
  journalNavCount = 0,
  extensionSurfaces = [],
  localize,
} = {}) {
  if (typeof localize !== 'function') {
    throw new TypeError('buildPlayerNavTabs requires a localize function');
  }
  const count = normaliseCount(journalNavCount);
  const entries = coreTabs
    .filter((tab) => tab.requires !== 'alchemy' || showAlchemy)
    .map((tab) => coreNavEntry(tab, count, localize));
  for (const { surfaceId, provider } of extensionSurfaces) {
    for (const tab of provider?.tabs ?? []) {
      entries.push(extensionNavEntry(surfaceId, tab));
    }
  }
  return Object.freeze(entries);
}

/**
 * Decide which tab should be active given the tabs currently on offer.
 *
 * This is the fallback the application host consults whenever the offered set changes — a
 * provider unregisters, or re-registers with a narrower tab set — and whenever something
 * asks for a route key that was never offered. Falling back rather than leaving the key in
 * place is what stops the rail rendering nothing and the panel rendering empty.
 *
 * @param {*} activeTab The currently requested tab route key.
 * @param {readonly {routeKey: string}[]} navTabs The rail model currently on offer.
 * @param {string} defaultTab Core's default tab id.
 * @returns {string} `activeTab` when it is still offered, otherwise `defaultTab`.
 */
export function resolveActiveTab(activeTab, navTabs, defaultTab) {
  if (typeof activeTab !== 'string' || activeTab === '') return defaultTab;
  const offered = (navTabs ?? []).some((tab) => tab.routeKey === activeTab);
  return offered ? activeTab : defaultTab;
}

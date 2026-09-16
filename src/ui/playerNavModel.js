// Every derivation the player window's nav rail needs. A UI-FREE LEAF, and it must stay one: no
// Svelte, Foundry or store import, and `localize` is a parameter rather than reached for. Three
// callers need the same answers — the shell, the application host, the View Lab harness — and each
// deriving its own was three mirrors of one contract (issue 1198).

// A colon rather than a slash, which reads as a path. The composed key is safe in a `data-` value,
// in a query parameter and as an HTML `id`; selection is by ATTRIBUTE, never by id, because an id
// selector containing a colon is invalid CSS and throws a `SyntaxError` rather than returning null.
export const EXTENSION_ROUTE_PREFIX = 'ext';

const ROUTE_KEY_SEGMENTS = 3;

// The player Downtime experimental gate (issue 1257), and it is TEMPORARY: delete it, the predicate
// below and their readers when the Downtime Studio ships. DELIBERATELY separate from
// `managerExtensions.js`'s `WORLD_DOWNTIME_SURFACE_ID` though both spell `downtime` — the two
// registries hold separate namespaces, and one shared string would make a divergence read as a typo.
export const PLAYER_DOWNTIME_SURFACE_ID = 'downtime';

// True of every surface BUT the gated one: a read of the one id Core names, never an allowlist, so
// Core still never enumerates the ids it will ACCEPT. The gate defaults to SHUT, so a caller that
// forgets to state it withholds an unreleased surface rather than advertising it.
export function isPlayerSurfaceAvailable(surfaceId, { experimentalFeaturesEnabled = false } = {}) {
  return surfaceId !== PLAYER_DOWNTIME_SURFACE_ID || experimentalFeaturesEnabled === true;
}

// The only Core entry carrying a live count badge, which the shell pushes in.
const JOURNAL_TAB_ID = 'journal';

// Core authors its five icon strings as bare glyph names under the solid family; a provider
// supplies the WHOLE class list, so a reused Manager icon cannot emit a doubled family class.
const CORE_ICON_FAMILY = 'fas';

export function buildRouteKey(surfaceId, tabId) {
  return `${EXTENSION_ROUTE_PREFIX}:${surfaceId}:${tabId}`;
}

export function parseRouteKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts.length !== ROUTE_KEY_SEGMENTS) return null;
  const [prefix, surfaceId, tabId] = parts;
  if (prefix !== EXTENSION_ROUTE_PREFIX || surfaceId === '' || tabId === '') return null;
  return Object.freeze({ surfaceId, tabId });
}

// Structural on purpose, and NOT a membership test: true of any non-empty string that is not an
// extension route key, `bogus` included. Core must not enumerate the ids it accepts, so a caller
// asking "is this one of MY five" intersects its own table, as `isOfferedTab` does.
export function isCoreTabId(id) {
  return typeof id === 'string' && id !== '' && parseRouteKey(id) === null;
}

// The ONE snapshot the host and the View Lab harness both build from, so the lab cannot drift, and
// therefore where the experimental gate is applied: a surface withheld here reaches neither rail nor
// panel. The gate is read at derivation time and never cached, so it takes effect on the next
// snapshot and NEVER mid-mount — resolving a route away under a player would discard a mounted
// companion's work. `isOfferedTab` in `SvelteFabricateApp.svelte.js` repeats it against the registry.
export function deriveExtensionSurfaces(registry, { experimentalFeaturesEnabled = false } = {}) {
  const surfaceIds = registry?.listPlayerNavSurfaceIds?.() ?? [];
  const surfaces = [];
  for (const surfaceId of surfaceIds) {
    // Dropped, never a placeholder: the player window carries no premium signal in any state, so
    // an absent companion and a withheld one look identical from the rail.
    if (!isPlayerSurfaceAvailable(surfaceId, { experimentalFeaturesEnabled })) continue;
    const provider = registry?.getPlayerNavProvider?.(surfaceId) ?? null;
    // Skipped here is what keeps every downstream caller free of a null check.
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
    // Core's own labels are lang keys; a provider's are not. See `extensionNavEntry`.
    text: localize(tab.label),
    iconClass: `${CORE_ICON_FAMILY} ${tab.icon}`,
    count: tab.id === JOURNAL_TAB_ID ? journalNavCount : 0,
    accessibleName: null,
    tooltip: null,
  });
}

function extensionNavEntry(surfaceId, tab) {
  // EXPLICIT ALLOWLIST PROJECTION, never a spread: the rail badges any entry with a positive
  // `count`, so a spread would hand a provider declaring `count: 12` an unvalidated badge this
  // seam does not offer. Projection makes that unrepresentable.
  return Object.freeze({
    routeKey: buildRouteKey(surfaceId, tab.id),
    tabId: tab.id,
    surfaceId,
    isExtension: true,
    // FINAL DISPLAY TEXT, rendered verbatim: `localize` would silently substitute the day a
    // companion's label collided with any key in the merged namespace.
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

// Core's tabs first, then every provider's, grouped by surface in registration order and within a
// surface in the provider's own array order.
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

// The fallback the host consults whenever the offered set narrows or an unoffered key is asked for;
// leaving the key in place instead is what would leave the rail rendering nothing over an empty panel.
export function resolveActiveTab(activeTab, navTabs, defaultTab) {
  if (typeof activeTab !== 'string' || activeTab === '') return defaultTab;
  const offered = (navTabs ?? []).some((tab) => tab.routeKey === activeTab);
  return offered ? activeTab : defaultTab;
}

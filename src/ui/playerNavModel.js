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

/**
 * The one player surface id Core names, and the only one it withholds.
 *
 * THE PLAYER DOWNTIME EXPERIMENTAL GATE (issue 1257), and it is TEMPORARY. The surface exists
 * to host the premium Downtime Studio, the Studio is in no published release, and the Manager's
 * `World > Downtime` route is already shown only to a GM who has opted into experimental
 * features. A player window that kept rendering the companion's tabs would advertise the
 * unreleased feature that Manager gate exists to withhold, so one setting now governs both
 * windows. Delete this constant, the predicate below and their readers when the Studio ships;
 * nothing here states a rule about premium surfaces or about extension seams.
 *
 * It is DELIBERATELY a separate constant from `WORLD_DOWNTIME_SURFACE_ID` in
 * `managerExtensions.js`, even though both spell `downtime`. The two registries hold separate
 * surface-id namespaces, so a companion may claim the id in one window without claiming it in
 * the other; importing the Manager's constant here would tie two independent namespaces to one
 * string and make a later divergence look like a typo.
 */
export const PLAYER_DOWNTIME_SURFACE_ID = 'downtime';

/**
 * May the player window render `surfaceId` right now?
 *
 * TRUE OF EVERY SURFACE BUT THE GATED ONE. This is the seam's only read of a companion id, and
 * it is a read of one id Core names rather than an allowlist: Core still never enumerates the
 * ids it will ACCEPT, and a companion claiming any other surface is untouched by the gate.
 *
 * The gate defaults to SHUT, so a caller that forgets to state it withholds an unreleased
 * surface rather than advertising it.
 *
 * @param {string} surfaceId Registry surface id.
 * @param {object} [options] Gate inputs.
 * @param {boolean} [options.experimentalFeaturesEnabled] The world's `fabricate.experimentalFeatures` opt-in.
 * @returns {boolean} True when the surface may be rendered.
 */
export function isPlayerSurfaceAvailable(surfaceId, { experimentalFeaturesEnabled = false } = {}) {
  return surfaceId !== PLAYER_DOWNTIME_SURFACE_ID || experimentalFeaturesEnabled === true;
}

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
 * Does `id` address Core rather than a registered provider surface?
 *
 * Structural on purpose, and deliberately NOT a membership test: it is true of any non-empty
 * string that is not an extension route key, `bogus` included. Core must not enumerate the
 * ids it accepts from a provider, and its own five tab ids are already declared by each
 * caller that owns a Core tab set — the shell's own tab table and the application host's
 * offered-route set — so a list here would be one more copy of the table this module exists
 * to stop mirroring. A caller that needs "is this one of MY five" intersects its own table,
 * which is exactly what `isOfferedTab` in `SvelteFabricateApp.svelte.js` does; this answers
 * the only question the seam owns, which is "does this key address a provider".
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
 * IT IS ALSO WHERE THE EXPERIMENTAL GATE IS APPLIED, for that same reason: the snapshot is
 * what the rail and the panel are both built from, so a surface withheld here cannot reach
 * either of them. The gate is read from the setting at derivation time and never cached, so
 * it takes effect on the next snapshot — the next window open, or the next registry
 * publication — and never mid-mount. That is deliberate: resolving a gated route away under a
 * player standing on it would run a mounted companion's cleanup and discard its work because a
 * world setting moved. The one caller that does NOT read the snapshot is `isOfferedTab` in
 * `SvelteFabricateApp.svelte.js`, which reads the registry directly and therefore repeats this
 * gate itself.
 *
 * @param {{listPlayerNavSurfaceIds: () => string[], getPlayerNavProvider: (id: string) => object|null}} registry
 *   Player extension registry.
 * @param {object} [options] Gate inputs, as taken by {@link isPlayerSurfaceAvailable}.
 * @param {boolean} [options.experimentalFeaturesEnabled] The world's `fabricate.experimentalFeatures` opt-in.
 * @returns {readonly Readonly<{surfaceId: string, provider: object}>[]} Frozen snapshot.
 */
export function deriveExtensionSurfaces(registry, { experimentalFeaturesEnabled = false } = {}) {
  const surfaceIds = registry?.listPlayerNavSurfaceIds?.() ?? [];
  const surfaces = [];
  for (const surfaceId of surfaceIds) {
    // A gated surface is dropped from the snapshot rather than rendered as a placeholder: the
    // player window carries no premium signal in any state, so an absent companion and a
    // withheld one look identical from the rail.
    if (!isPlayerSurfaceAvailable(surfaceId, { experimentalFeaturesEnabled })) continue;
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

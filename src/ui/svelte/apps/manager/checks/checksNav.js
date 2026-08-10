/**
 * Checks sub-navigation model (issue 1096, the GM Checks Studio IA).
 *
 * `Checks` used to be one flat rail button holding four TABS. This module is the model for
 * the expandable rail GROUP that replaced it: the router imports `buildChecksNavItems` to
 * render the visible children, `activeChecksTab` to highlight the child owning the active
 * view, and `isChecksRoute` to decide whether the active view belongs to the group at all.
 * It mirrors `crafting/craftingNav.js`, which is the shipped precedent for this shape.
 *
 * ## `CHECKS_VIEWS` values ARE `data-manager-view` strings
 *
 * Not nav-item ids. That distinction is load-bearing rather than pedantic, and the sibling
 * module is the counter-example: `craftingNav.js` declares a nav item `settings` whose view
 * is `crafting-settings`, so a pin written against nav ids would compare the wrong
 * vocabulary. `tests/view-lab-cases.test.js` pins every View Lab `expectView` value
 * beginning `checks` against this array, and `expectView` is matched against
 * `data-manager-view` — so the two must be the same strings, and this comment is the
 * contract that says which.
 *
 * The bare `checks` id is deliberately NOT a member: the root never renders it, because
 * route normalization redirects it to the first available child. It is exported separately
 * as {@link CHECKS_REDIRECT_VIEW} so existing deep links and any `expectView: 'checks'`
 * still have a defined answer without widening the pinned set to a string no screen shows.
 *
 * Pure and dependency-free: no Svelte, no Foundry. Safe to import anywhere.
 */

/**
 * The retained entry point. Anything routing to it lands on the first AVAILABLE child,
 * which depends on the feature flags, so it is resolved rather than aliased to a constant.
 * @type {string}
 */
export const CHECKS_REDIRECT_VIEW = 'checks';

/**
 * Every view id the Checks group owns, in reading order. These are the exact strings the
 * manager root renders into `data-manager-view`.
 * @type {readonly string[]}
 */
export const CHECKS_VIEWS = Object.freeze([
  'checks-crafting',
  'checks-salvage',
  'checks-gathering',
  'checks-validation',
]);

/**
 * The three ACTIVITY children, in reading order. Validation is not one of them, and that is
 * the whole reason this constant exists: the parent badge sums these three and Validation
 * restates the same total, so a sum taken over "every child" would double it.
 * @type {readonly string[]}
 */
export const CHECKS_ACTIVITIES = Object.freeze(['crafting', 'salvage', 'gathering']);

const VIEW_BY_ACTIVITY = Object.freeze({
  crafting: 'checks-crafting',
  salvage: 'checks-salvage',
  gathering: 'checks-gathering',
  validation: 'checks-validation',
});

const TAB_BY_VIEW = Object.freeze({
  'checks-crafting': 'crafting',
  'checks-salvage': 'salvage',
  'checks-gathering': 'gathering',
  'checks-validation': 'validation',
});

const DEFINITIONS = Object.freeze([
  {
    id: 'crafting',
    icon: 'fas fa-hammer',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Tabs.Crafting',
    labelFallback: 'Crafting',
    activity: true,
  },
  {
    id: 'salvage',
    icon: 'fas fa-recycle',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Tabs.Salvage',
    labelFallback: 'Salvage',
    activity: true,
  },
  {
    id: 'gathering',
    icon: 'fas fa-seedling',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Tabs.Gathering',
    labelFallback: 'Gathering',
    activity: true,
  },
  {
    id: 'validation',
    icon: 'fas fa-clipboard-check',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Tabs.Validation',
    labelFallback: 'Validation',
    activity: false,
  },
]);

function countFor(issueCounts, id) {
  const raw = Number(issueCounts?.[id]);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
}

/**
 * Build the ordered list of visible Checks children.
 *
 * Salvage and gathering are optional FEATURES: their children are dropped when the feature
 * is off, which is the gate that used to live inline in `ChecksEditorTabs.svelte`. Crafting
 * and Validation are always present, so the list is never empty and the `checks` redirect
 * always has a target.
 *
 * @param {object} args
 * @param {object} [args.features] The selected system's feature flags. `salvage` defaults
 *   ON (absent means on); `gathering` is opt-in and must be exactly `true`.
 * @param {string} [args.resolutionMode] The system's recipe resolution mode.
 * @param {string} [args.salvageResolutionMode] The salvage resolution mode.
 * @param {string} [args.gatheringResolutionMode] The gathering economy's resolution mode.
 *   All three are carried onto their child as `mode` so a caller reads one shape rather
 *   than re-deriving which mode belongs to which activity.
 * @param {Record<string, number>} [args.issueCounts] Per-activity readiness issue counts,
 *   keyed by activity id. Validation's own count is IGNORED if supplied: it is defined as
 *   the total of the three activities and is computed here so the two cannot disagree.
 * @param {Record<string, boolean>} [args.dirtyActivities] Per-activity unsaved-edit flags.
 *   Validation authors nothing, so it never carries one.
 * @returns {Array<{ id: string, view: string, icon: string, labelKey: string,
 *   labelFallback: string, activity: boolean, mode: string, issueCount: number,
 *   dirty: boolean }>}
 */
export function buildChecksNavItems({
  features = {},
  resolutionMode = 'simple',
  salvageResolutionMode = 'simple',
  gatheringResolutionMode = 'd100',
  issueCounts = {},
  dirtyActivities = {},
} = {}) {
  const salvageEnabled = features?.salvage !== false;
  const gatheringEnabled = features?.gathering === true;
  const modes = {
    crafting: resolutionMode,
    salvage: salvageResolutionMode,
    gathering: gatheringResolutionMode,
    validation: '',
  };

  const visible = DEFINITIONS.filter(
    (definition) =>
      (definition.id !== 'salvage' || salvageEnabled) &&
      (definition.id !== 'gathering' || gatheringEnabled)
  );

  // The total is taken over the VISIBLE activity children only. A hidden feature's stale
  // issues must not badge a rail entry the GM cannot open to clear them.
  const activityTotal = visible
    .filter((definition) => definition.activity)
    .reduce((total, definition) => total + countFor(issueCounts, definition.id), 0);

  return visible.map((definition) => ({
    ...definition,
    view: VIEW_BY_ACTIVITY[definition.id],
    mode: modes[definition.id] || '',
    issueCount: definition.activity ? countFor(issueCounts, definition.id) : activityTotal,
    dirty: definition.activity ? dirtyActivities?.[definition.id] === true : false,
  }));
}

/**
 * The PARENT badge: the sum of the three activity children, and nothing else.
 *
 * Validation's badge is that same total RESTATED, so adding it would report every issue
 * twice — the three frames the design is drawn from show parent 1 / 2 / 3 beside a
 * Validation badge of 1 / 2 / 3, never 2 / 4 / 6.
 *
 * @param {Array<{ activity?: boolean, issueCount?: number }>} items
 * @returns {number}
 */
export function checksNavIssueTotal(items = []) {
  return items
    .filter((item) => item?.activity === true)
    .reduce((total, item) => total + (Number(item?.issueCount) || 0), 0);
}

/**
 * Whether any visible Checks child carries an unsaved edit.
 * @param {Array<{ dirty?: boolean }>} items
 * @returns {boolean}
 */
export function checksNavHasDirty(items = []) {
  return items.some((item) => item?.dirty === true);
}

/**
 * The child id that owns a given active view (for rail highlighting), or `null` for a view
 * outside the group. The bare `checks` redirect resolves to no child: it is not a
 * destination, and highlighting one before normalization has run would flash the wrong
 * entry.
 *
 * @param {string} view The active view id.
 * @returns {string|null}
 */
export function activeChecksTab(view) {
  return TAB_BY_VIEW[view] ?? null;
}

/**
 * Whether a view belongs to the Checks group. The `checks` redirect counts: route guards
 * ask this before normalization has had a chance to rewrite it.
 *
 * @param {string} view The view id to test.
 * @returns {boolean}
 */
export function isChecksRoute(view) {
  return view === CHECKS_REDIRECT_VIEW || CHECKS_VIEWS.includes(view);
}

/**
 * The view the bare `checks` id redirects to: the FIRST AVAILABLE child.
 *
 * It is resolved from the same builder the rail renders rather than hard-coded to
 * `checks-crafting`, so the two can never disagree about what "first available" means if
 * the child order or the feature gates ever change.
 *
 * @param {object} [args] The same argument bag {@link buildChecksNavItems} takes.
 * @returns {string}
 */
export function resolveChecksRedirect(args = {}) {
  const items = buildChecksNavItems(args);
  return items[0]?.view ?? 'checks-crafting';
}

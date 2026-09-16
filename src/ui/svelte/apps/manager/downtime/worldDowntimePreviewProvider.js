import { WORLD_DOWNTIME_SURFACE_ID } from '../../../../managerExtensions.js';

/**
 * The tab ids of CORE'S OWN preview content and nothing more. NOT the provider contract, which no
 * part of the seam reads: a companion declares any ids, any count, any order, and `validateProvider`
 * checks their SHAPE alone. The list lives beside the copy it indexes so it cannot be mistaken for
 * a requirement the seam imposes.
 */
export const CORE_DOWNTIME_PREVIEW_TAB_IDS = Object.freeze([
  'tracking',
  'activities',
  'factions',
  'settings',
]);

/**
 * One illustrated slot in the Core preview — a board row or a benefit card. The tint travels with
 * the SLOT, not the glyph and not a selector, because that is how the design assigns it: the same
 * glyph takes different tints per tab. It lands on the tile WRAPPER rather than the `<i>`, so each
 * glyph keeps following its row instead of being frozen by a self-colouring rule.
 */
function slot(icon, tint) {
  return Object.freeze({ icon, tint });
}

const TAB_DEFINITIONS = Object.freeze({
  tracking: Object.freeze({
    icon: 'fas fa-chart-simple',
    key: 'Tracking',
    rows: Object.freeze([
      slot('fas fa-hat-wizard', 'tag'),
      slot('fas fa-house-chimney', 'ember'),
      slot('fas fa-hand-pointer', 'warning'),
    ]),
    features: Object.freeze([
      slot('fas fa-table-list', 'accent'),
      slot('fas fa-calendar-check', 'info'),
      slot('fas fa-people-group', 'vitality'),
      slot('fas fa-wand-sparkles', 'warning'),
    ]),
  }),
  activities: Object.freeze({
    icon: 'fas fa-list-check',
    key: 'Activities',
    rows: Object.freeze([
      slot('fas fa-dumbbell', 'ember'),
      slot('fas fa-book-open', 'tag'),
      slot('fas fa-house-chimney', 'vitality'),
    ]),
    features: Object.freeze([
      slot('fas fa-stairs', 'accent'),
      slot('fas fa-user-group', 'info'),
      slot('fas fa-dice-d20', 'warning'),
      slot('fas fa-gift', 'vitality'),
    ]),
  }),
  factions: Object.freeze({
    icon: 'fas fa-flag',
    key: 'Factions',
    rows: Object.freeze([
      slot('fas fa-crow', 'tag'),
      slot('fas fa-house-chimney', 'ember'),
      slot('fas fa-fire-flame-curved', 'warning'),
    ]),
    features: Object.freeze([
      slot('fas fa-users-viewfinder', 'accent'),
      slot('fas fa-ranking-star', 'info'),
      slot('fas fa-arrow-trend-up', 'vitality'),
      slot('fas fa-award', 'warning'),
    ]),
  }),
  settings: Object.freeze({
    icon: 'fas fa-sliders',
    key: 'Settings',
    rows: Object.freeze([
      slot('fas fa-calendar-days', 'accent'),
      slot('fas fa-user-check', 'info'),
      slot('fas fa-scale-balanced', 'warning'),
    ]),
    features: Object.freeze([
      slot('fas fa-clock', 'accent'),
      slot('fas fa-hand-pointer', 'info'),
      slot('fas fa-layer-group', 'warning'),
      slot('fas fa-code-branch', 'vitality'),
    ]),
  }),
});

/**
 * Core's fallback preview as ONE IMPLEMENTATION of the provider interface rather than a special case
 * the shell branches on. It carries no `mount` and is never handed to the registry.
 *
 * Its string fields are lang KEYS, not sentences, because Core localizes at render time while a
 * companion's identical fields are already-localized text. Which mode holds the surface is the
 * single discriminator, and the rail, the route chrome and Core's own strip all apply it.
 */
export const WORLD_DOWNTIME_PREVIEW_PROVIDER = Object.freeze({
  apiVersion: 1,
  id: WORLD_DOWNTIME_SURFACE_ID,
  tabs: Object.freeze(
    CORE_DOWNTIME_PREVIEW_TAB_IDS.map((id) =>
      Object.freeze({
        id,
        label: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.Label`,
        accessibleName: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.AccessibleName`,
        tooltip: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.Tooltip`,
        icon: TAB_DEFINITIONS[id].icon,
        // The route titles itself after the preview on screen, so the name changes with the sub-tab.
        title: `FABRICATE.Admin.Manager.World.Downtime.Preview.${TAB_DEFINITIONS[id].key}.Title`,
        subtitle: `FABRICATE.Admin.Manager.World.Downtime.Preview.${TAB_DEFINITIONS[id].key}.Subtitle`,
        breadcrumb: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.Label`,
        actionsLabel: 'FABRICATE.Admin.Manager.World.Downtime.Actions',
      })
    )
  ),
});

export function downtimePreviewDefinition(tabId) {
  return TAB_DEFINITIONS[tabId] ?? TAB_DEFINITIONS.tracking;
}

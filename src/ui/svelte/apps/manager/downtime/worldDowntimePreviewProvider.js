import { WORLD_DOWNTIME_SURFACE_ID } from '../../../../managerExtensions.js';

/**
 * The tab ids of CORE'S OWN Downtime preview content — four marketing screens Fabricate
 * ships, and nothing more.
 *
 * This is NOT the provider contract, and no part of the seam reads it. A registered
 * companion declares its own tabs (any ids, any count, its own order) and the registry
 * validates their SHAPE only; see `validateProvider` in `src/ui/managerExtensions.js`.
 * The list lives here, beside the copy and the icon table it indexes, precisely so it
 * cannot be mistaken for a requirement the seam imposes.
 *
 * @type {readonly string[]}
 */
export const CORE_DOWNTIME_PREVIEW_TAB_IDS = Object.freeze([
  'tracking',
  'activities',
  'factions',
  'settings',
]);

/**
 * One illustrated slot in the Core preview — a board row or a benefit card.
 *
 * The tint travels with the SLOT, not with the glyph and not with a CSS selector, because
 * that is how the design assigns it: `fa-house-chimney` is ember on Tracking and vitality
 * on Activities, and the four benefit cards rotate their tints between tabs (positions 3
 * and 4 swap). It is also why the tint lands on the tile WRAPPER rather than on the `<i>`:
 * the design colours 43 of its 55 icons through their wrapper so each glyph keeps following
 * its row, and self-colouring an inherited icon would freeze it.
 *
 * @param {string} icon Font Awesome Free class list for the glyph.
 * @param {string} tint Tint name resolved by the `.is-tint-*` classes in `WorldDowntimePreview`.
 * @returns {Readonly<{icon: string, tint: string}>} the frozen slot.
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
 * Core's fallback preview, expressed as ONE IMPLEMENTATION of the provider interface
 * rather than as a special case the shell branches on. It carries no `mount`: Core renders
 * `WorldDowntimePreview` for its own tabs, and it is never handed to the registry.
 *
 * Its string fields are lang KEYS, not sentences, because Core owns its copy and localizes
 * at render time. A companion's identical fields are already-localized text. Which mode holds
 * the surface is the single discriminator between the two readings, and every consumer applies
 * it: the rail's Downtime sub-items for `label`, `accessibleName` and `tooltip`, the route
 * chrome for `title`, `subtitle` and `breadcrumb`, and Core's own preview strip — which renders
 * in core-fallback alone and therefore localizes unconditionally.
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
        // The Downtime route titles itself after the preview on screen, not after the
        // route: a GM switching sub-tabs must see the page name change with them.
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

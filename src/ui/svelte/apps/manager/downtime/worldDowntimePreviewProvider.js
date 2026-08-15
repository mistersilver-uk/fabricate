import { DOWNTIME_TAB_IDS } from '../../../../managerExtensions.js';

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

export const WORLD_DOWNTIME_PREVIEW_PROVIDER = Object.freeze({
  apiVersion: 1,
  id: 'downtime',
  tabs: Object.freeze(
    DOWNTIME_TAB_IDS.map((id) =>
      Object.freeze({
        id,
        label: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.Label`,
        accessibleName: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.AccessibleName`,
        tooltip: `FABRICATE.Admin.Manager.World.Downtime.Tabs.${TAB_DEFINITIONS[id].key}.Tooltip`,
        icon: TAB_DEFINITIONS[id].icon,
      })
    )
  ),
});

export function downtimePreviewDefinition(tabId) {
  return TAB_DEFINITIONS[tabId] ?? TAB_DEFINITIONS.tracking;
}

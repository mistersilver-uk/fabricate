import { DOWNTIME_TAB_IDS } from '../../../../managerExtensions.js';

const TAB_DEFINITIONS = Object.freeze({
  tracking: Object.freeze({
    icon: 'fas fa-chart-simple',
    key: 'Tracking',
    rowCount: 3,
    featureIcons: [
      'fas fa-table-list',
      'fas fa-calendar-check',
      'fas fa-people-group',
      'fas fa-wand-sparkles',
    ],
  }),
  activities: Object.freeze({
    icon: 'fas fa-list-check',
    key: 'Activities',
    rowCount: 3,
    featureIcons: ['fas fa-stairs', 'fas fa-user-group', 'fas fa-dice-d20', 'fas fa-gift'],
  }),
  factions: Object.freeze({
    icon: 'fas fa-flag',
    key: 'Factions',
    rowCount: 3,
    featureIcons: [
      'fas fa-users-viewfinder',
      'fas fa-ranking-star',
      'fas fa-arrow-trend-up',
      'fas fa-award',
    ],
  }),
  settings: Object.freeze({
    icon: 'fas fa-sliders',
    key: 'Settings',
    rowCount: 3,
    featureIcons: ['fas fa-clock', 'fas fa-hand-pointer', 'fas fa-layer-group', 'fas fa-code-branch'],
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

/**
 * The manager rail as one item model (issue 1777): each row's model id, DOM id, label, icon,
 * `data-*` hooks, trailing markers, current and selected state, group membership and lock with its
 * reason, built from the shell's live values so the three rail units render rows, not author them.
 * `text(key, fallback)` localizes. A row without `active` never wears the selected pill. Each rail
 * id is a complete literal beside its label, as `tests/foundry-manager-rail-hooks.test.js` reads.
 */
import { navTabBadgeTotal, resolveNavTabBadge } from '../../../navTabBadgeStore.js';

const LOCKED_OPEN_KEY = 'FABRICATE.Admin.Manager.Nav.LockedOpen';
// One sentence for every group, and deliberately generic: the Downtime group's children come from
// whichever provider holds the surface, so it cannot name a section.
const LOCKED_OPEN_FALLBACK = 'This section stays open while you are on one of its pages.';

// The Graph surface (issue 442) is unimplemented; it stays a disabled placeholder and, as of issue
// 745, renders only when experimental features are enabled.
const placeholderViews = [
  {
    id: 'graph',
    navId: 'manager-nav-graph',
    icon: 'fas fa-project-diagram',
    labelKey: 'FABRICATE.Admin.Manager.Nav.Graph',
    fallback: 'Graph',
  },
];

function isViewAvailableForSystem(view, system, experimentalFeaturesEnabled) {
  // Issue 745: the Graph placeholder is advertised only behind the experimental toggle.
  if (view.id === 'graph') return experimentalFeaturesEnabled;
  if (!view.feature) return true;
  return system?.features?.[view.feature] === true;
}

/** A row with the defaults every row shares. */
function navItem(fields) {
  return { hooks: {}, markers: [], ...fields };
}

/** A row that is the current page while `current` holds, and wears the pill then. */
function pageRow(current, fields) {
  return navItem({ ...fields, active: current, current: current ? 'page' : undefined });
}

const countMarker = (value) => ({ kind: 'count', value });

/** `props` over `defaults`, where a prop passed as `undefined` takes its default as Svelte's do. */
function withDefaults(defaults, props) {
  const input = { ...defaults };
  for (const [key, value] of Object.entries(props)) if (value !== undefined) input[key] = value;
  return input;
}

/** One disclosure group: its parent row, toggle, submenu and children, and its lock. */
function navGroup({ id, navRail, text, parent, toggle, submenu, children, hooks = {} }) {
  const expanded = navRail.expanded[id];
  const locked = navRail.lockedOpen[id];
  const [collapse, expand] = toggle.labels;
  return {
    kind: 'group',
    id,
    hooks,
    expanded,
    locked,
    lockedReason: locked ? text(LOCKED_OPEN_KEY, LOCKED_OPEN_FALLBACK) : undefined,
    parent,
    toggle: {
      domId: toggle.domId,
      hooks: toggle.hooks ?? {},
      label: expanded ? text(...collapse) : text(...expand),
      onToggle: (event) => navRail.toggleGroup(id, event),
    },
    submenu: { hooks: {}, ...submenu },
    children,
  };
}

function checksIssueName(count, text) {
  const name =
    count === 1
      ? text('FABRICATE.Admin.Manager.Checks.Sections.IssueCountOne', '{count} issue')
      : text('FABRICATE.Admin.Manager.Checks.Sections.IssueCountOther', '{count} issues');
  return name.replace('{count}', String(count));
}

function checksIssueMarker(count, scope, text) {
  return {
    kind: 'issues',
    count,
    name: checksIssueName(count, text),
    hooks: { 'data-checks-nav-issues': scope },
  };
}

function systemOverviewItem(
  { currentView, selectedSystem, editSystem, systemOverviewCount },
  text
) {
  return pageRow(currentView === 'system-edit', {
    id: 'system-overview',
    domId: 'manager-nav-system-overview',
    label: text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview'),
    icon: 'fas fa-clipboard-check',
    hooks: { 'data-nav-system-edit': '' },
    markers: systemOverviewCount > 0 ? [overviewCount(systemOverviewCount, text)] : [],
    onSelect: () => editSystem(selectedSystem.id),
  });
}

function overviewCount(count, text) {
  return {
    ...countMarker(count),
    label: text('FABRICATE.Admin.Manager.SystemOverview.CountBadgeAria', 'Open validation issues'),
  };
}

function craftingGroup(input, text) {
  const { navRail, isCraftingRoute, activeCraftingTab, craftingNavItems, openCraftingSection } =
    input;
  return navGroup({
    id: 'crafting',
    navRail,
    text,
    parent: navItem({
      id: 'crafting',
      domId: 'manager-nav-crafting',
      label: text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting'),
      icon: 'fas fa-hammer',
      current: isCraftingRoute ? 'page' : undefined,
      markers: [countMarker(input.craftingNavCount)],
      onSelect: input.activateCraftingParent,
    }),
    toggle: {
      labels: [
        ['FABRICATE.Admin.Manager.Nav.CollapseCrafting', 'Collapse crafting menu'],
        ['FABRICATE.Admin.Manager.Nav.ExpandCrafting', 'Expand crafting menu'],
      ],
    },
    submenu: {
      domId: 'manager-crafting-submenu',
      label: text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.Label', 'Crafting sections'),
    },
    children: craftingNavItems.map((item) =>
      pageRow(isCraftingRoute && activeCraftingTab === item.id, {
        id: item.id,
        domId: `manager-crafting-nav-${item.id}`,
        label: text(item.labelKey, item.labelFallback),
        icon: item.icon,
        markers: item.count == null ? [] : [countMarker(item.count)],
        onSelect: () => openCraftingSection(item.id),
      })
    ),
  });
}

function catalogueItems(input, text) {
  const { currentView, setView, selectedCounts, tagCategoryCounts, toolsNavCount } = input;
  return [
    // A screen title, not a domain noun (issue 1362).
    pageRow(currentView === 'components' || currentView === 'component-edit', {
      id: 'component-rules',
      domId: 'manager-nav-component-rules',
      label: text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules'),
      icon: 'fas fa-boxes',
      markers: [countMarker(selectedCounts.components)],
      onSelect: () => setView('components'),
    }),
    pageRow(currentView === 'tags', {
      id: 'tags',
      domId: 'manager-nav-tags',
      label: text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories'),
      icon: 'fas fa-tags',
      onSelect: () => setView('tags'),
      // The rail badge is the whole screen's vocabulary.
      markers: [
        countMarker(
          tagCategoryCounts.recipeCategories +
            tagCategoryCounts.componentCategories +
            tagCategoryCounts.itemTags
        ),
      ],
    }),
    input.canShowEssences &&
      pageRow(currentView === 'essences' || currentView === 'essence-edit', {
        id: 'essence-rules',
        domId: 'manager-nav-essence-rules',
        label: text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules'),
        icon: 'fas fa-mortar-pestle',
        markers: [countMarker(selectedCounts.essences)],
        onSelect: () => setView('essences'),
      }),
    pageRow(currentView === 'tools' || currentView === 'tool-edit', {
      id: 'tool-rules',
      domId: 'manager-nav-tool-rules',
      label: text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules'),
      icon: 'fas fa-screwdriver-wrench',
      // No zero badge on this row (issue 1373).
      markers: toolsNavCount > 0 ? [countMarker(toolsNavCount)] : [],
      onSelect: () => setView('tools'),
    }),
  ].filter(Boolean);
}

function checksChild({ currentView, setView }, checksItem, text) {
  // A record count, an issue badge naming its unit and an unsaved marker of its own shape.
  const markers = [];
  if (checksItem.dirty) {
    markers.push({
      kind: 'dirty',
      name: text('FABRICATE.Admin.Manager.Checks.Nav.Unsaved', 'Unsaved changes'),
      hooks: { 'data-checks-nav-dirty': checksItem.id },
    });
  }
  if (checksItem.issueCount > 0)
    markers.push(checksIssueMarker(checksItem.issueCount, checksItem.id, text));
  return pageRow(currentView === checksItem.view, {
    id: checksItem.id,
    domId: `manager-checks-nav-${checksItem.id}`,
    label: text(checksItem.labelKey, checksItem.labelFallback),
    icon: checksItem.icon,
    hooks: { 'data-checks-nav-item': checksItem.id },
    markers,
    onSelect: () => setView(checksItem.view),
  });
}

function checksGroup(input, text) {
  const { navRail, isChecksRoute, checksNavCount } = input;
  return navGroup({
    id: 'checks',
    navRail,
    text,
    parent: pageRow(isChecksRoute, {
      id: 'checks',
      domId: 'manager-nav-checks',
      label: text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks'),
      icon: 'fas fa-dice-d20',
      // An issue count, not a record count, so it wears the pill and names its unit.
      markers: checksNavCount > 0 ? [checksIssueMarker(checksNavCount, 'checks', text)] : [],
      onSelect: input.activateChecksParent,
    }),
    toggle: {
      labels: [
        ['FABRICATE.Admin.Manager.Nav.CollapseChecks', 'Collapse checks menu'],
        ['FABRICATE.Admin.Manager.Nav.ExpandChecks', 'Expand checks menu'],
      ],
    },
    submenu: {
      domId: 'manager-checks-submenu',
      label: text('FABRICATE.Admin.Manager.Checks.Tabs.Label', 'Checks sections'),
    },
    children: input.checksNavItems.map((checksItem) => checksChild(input, checksItem, text)),
  });
}

function gatheringGroup(input, text) {
  const { navRail, isGatheringRoute, displayedGatheringTab, gatheringNavCounts } = input;
  return navGroup({
    id: 'gathering',
    navRail,
    text,
    parent: navItem({
      id: 'gathering',
      domId: 'manager-nav-gathering',
      label: text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering'),
      icon: 'fas fa-seedling',
      current: isGatheringRoute ? 'page' : undefined,
      markers: [countMarker(gatheringNavCounts.total)],
      onSelect: input.activateGatheringParent,
    }),
    toggle: {
      labels: [
        ['FABRICATE.Admin.Manager.Nav.CollapseGathering', 'Collapse gathering menu'],
        ['FABRICATE.Admin.Manager.Nav.ExpandGathering', 'Expand gathering menu'],
      ],
    },
    submenu: {
      domId: 'manager-gathering-submenu',
      label: text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Label', 'Gathering sections'),
    },
    children: input.visibleGatheringNavItems.map((item) => {
      const hasCount = gatheringNavCounts[item.id] != null;
      return pageRow(isGatheringRoute && displayedGatheringTab === item.id, {
        id: item.id,
        domId: `manager-gathering-nav-${item.id}`,
        label: text(item.labelKey, item.labelFallback),
        icon: item.icon,
        markers: hasCount ? [countMarker(gatheringNavCounts[item.id])] : [],
        onSelect: () => input.openGatheringSection(item.id),
      });
    }),
  });
}

function placeholderItems({ selectedSystem, experimentalFeaturesEnabled }, text) {
  const visiblePlaceholderViews = placeholderViews.filter((view) =>
    isViewAvailableForSystem(view, selectedSystem, experimentalFeaturesEnabled)
  );
  return visiblePlaceholderViews.map((view) => {
    const label = text(view.labelKey, view.fallback);
    return navItem({
      id: view.id,
      domId: view.navId,
      label,
      icon: view.icon,
      disabled: true,
      disabledReason: text(
        'FABRICATE.Admin.Manager.PlannedView',
        '{view} is planned for a future release.'
      ).replace('{view}', label),
      // A word on a row with no records, so not a count (issue 1515).
      markers: [{ kind: 'planned', text: text('FABRICATE.Admin.Manager.Soon', 'Soon') }],
    });
  });
}

const SYSTEM_DEFAULTS = Object.freeze({
  selectedSystem: null,
  currentView: '',
  setView: () => {},
  editSystem: () => {},
  systemOverviewCount: 0,
  isCraftingRoute: false,
  activateCraftingParent: () => {},
  craftingNavCount: 0,
  craftingNavItems: [],
  activeCraftingTab: '',
  openCraftingSection: () => {},
  selectedCounts: {},
  tagCategoryCounts: {},
  canShowEssences: false,
  toolsNavCount: 0,
  isChecksRoute: false,
  activateChecksParent: () => {},
  checksNavCount: 0,
  checksNavItems: [],
  canShowEnvironments: false,
  isGatheringRoute: false,
  activateGatheringParent: () => {},
  gatheringNavCounts: {},
  visibleGatheringNavItems: [],
  displayedGatheringTab: '',
  openGatheringSection: () => {},
  experimentalFeaturesEnabled: false,
});

/**
 * The crafting-system section, in rail order; empty with no system selected. Takes
 * `ManagerSystemNav`'s props, with the same defaults.
 */
export function managerSystemNavItems(props, text) {
  const input = withDefaults(SYSTEM_DEFAULTS, props);
  if (!input.selectedSystem) return [];
  return [
    systemOverviewItem(input, text),
    // Unconditional as of issue 745 (v1.3 headline).
    craftingGroup(input, text),
    ...catalogueItems(input, text),
    checksGroup(input, text),
    input.canShowEnvironments && gatheringGroup(input, text),
    ...placeholderItems(input, text),
  ].filter(Boolean);
}

// The four world scoped-entity leaves (issue 1362, epic 1357): `routes` is the set of views the leaf
// owns and `countKey` its column in `worldScopedCounts`.
const WORLD_CATALOGUE_LEAVES = Object.freeze([
  {
    id: 'manager-world-nav-component-catalogue',
    dataToken: 'component-catalogue',
    icon: 'fas fa-cubes-stacked',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle',
    labelFallback: 'Component catalogue',
    routes: ['world-components', 'world-component-entry'],
    countKey: 'components',
  },
  {
    id: 'manager-world-nav-vocabulary',
    dataToken: 'vocabulary',
    icon: 'fas fa-tags',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.VocabularyTitle',
    labelFallback: 'Tags & Categories',
    routes: ['world-vocabulary'],
    countKey: 'vocabulary',
  },
  {
    id: 'manager-world-nav-essence-catalogue',
    dataToken: 'essence-catalogue',
    icon: 'fas fa-flask-vial',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle',
    labelFallback: 'Essence Catalogue',
    routes: ['world-essences', 'world-essence-entry'],
    countKey: 'essences',
  },
  {
    id: 'manager-world-nav-tool-catalogue',
    dataToken: 'tool-catalogue',
    icon: 'fas fa-screwdriver-wrench',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle',
    labelFallback: 'Tools Catalogue',
    routes: ['world-tools', 'world-tool-entry'],
    countKey: 'tools',
  },
]);

/** A world row: it names itself, so its accessible name is its label unless it composes one. */
function worldItem({ token, current, ...fields }) {
  return pageRow(current, {
    ariaLabel: fields.label,
    ...fields,
    id: token,
    hooks: { 'data-world-nav-item': token },
  });
}

function worldLeaves(input, text) {
  const { currentView, setView, worldScopedCounts, isWorldRoute, travelParties } = input;
  const { openWorldParties } = input;
  return [
    ...WORLD_CATALOGUE_LEAVES.map((leaf) =>
      worldItem({
        token: leaf.dataToken,
        domId: leaf.id,
        label: text(leaf.labelKey, leaf.labelFallback),
        icon: leaf.icon,
        current: leaf.routes.includes(currentView),
        markers: [countMarker(worldScopedCounts[leaf.countKey])],
        onSelect: () => setView(leaf.routes[0]),
      })
    ),
    worldItem({
      token: 'parties',
      domId: 'manager-world-nav-parties',
      label: text('FABRICATE.Admin.Manager.Travel.Tabs.Parties', 'Parties'),
      icon: 'fas fa-users',
      current: isWorldRoute,
      markers: [countMarker(travelParties.length)],
      onSelect: openWorldParties,
    }),
  ];
}

function travelGroup(input, text) {
  const { navRail, isWorldTravelRoute, worldTravelTab, openWorldTravelDestination } = input;
  const onTab = (tab) => isWorldTravelRoute && worldTravelTab === tab;
  return navGroup({
    id: 'worldTravel',
    navRail,
    text,
    hooks: { 'data-world-travel-section': '' },
    // World > Travel (issue 1282).
    parent: worldItem({
      token: 'travel',
      domId: 'manager-world-nav-travel',
      label: text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel'),
      icon: 'fas fa-route',
      current: isWorldTravelRoute,
      controls: 'manager-travel-submenu',
      markers: [countMarker(input.worldRealms.length)],
      onSelect: input.activateWorldTravelParent,
    }),
    toggle: {
      domId: 'manager-travel-toggle',
      hooks: { 'data-world-travel-toggle': '' },
      labels: [
        ['FABRICATE.Admin.Manager.World.CollapseTravel', 'Collapse Travel'],
        ['FABRICATE.Admin.Manager.World.ExpandTravel', 'Expand Travel'],
      ],
    },
    submenu: {
      domId: 'manager-travel-submenu',
      hooks: { 'data-world-travel-submenu': '' },
      label: text('FABRICATE.Admin.Manager.World.TravelDestinations', 'Travel destinations'),
    },
    children: [
      pageRow(onTab('realms'), {
        id: 'realms',
        domId: 'manager-travel-nav-realms',
        label: text('FABRICATE.Admin.Manager.Travel.Tabs.Realms', 'Realms'),
        icon: 'fas fa-mountain-sun',
        hooks: { 'data-world-travel-item': 'realms' },
        onSelect: () => openWorldTravelDestination('realms'),
      }),
      pageRow(onTab('map'), {
        id: 'map',
        domId: 'manager-travel-nav-map',
        label: text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinks', 'Map Region Links'),
        icon: 'fas fa-map-location-dot',
        hooks: { 'data-world-travel-item': 'map' },
        onSelect: () => openWorldTravelDestination('map'),
      }),
    ],
  });
}

function rulesChildren(input, text) {
  const open = (id) => () => input.openWorldRulesDestination(id);
  return [
    pageRow(input.isWorldCurrencyRoute, {
      id: 'currency',
      domId: 'manager-rules-nav-currency',
      label: text('FABRICATE.Admin.Manager.World.CurrencyNav', 'Currency'),
      icon: 'fas fa-coins',
      hooks: { 'data-world-rules-item': 'currency' },
      onSelect: open('currency'),
    }),
    pageRow(input.isWorldPrerequisitesRoute, {
      id: 'prerequisites',
      domId: 'manager-rules-nav-prerequisites',
      label: text(
        'FABRICATE.Admin.Manager.CharacterPrerequisites.Title',
        'Character prerequisites'
      ),
      icon: 'fas fa-user-shield',
      hooks: { 'data-world-rules-item': 'prerequisites' },
      onSelect: open('prerequisites'),
    }),
    pageRow(input.isWorldModifiersRoute, {
      id: 'modifiers',
      domId: 'manager-rules-nav-modifiers',
      label: text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers'),
      icon: 'fas fa-user-gear',
      hooks: { 'data-world-rules-item': 'modifiers' },
      onSelect: open('modifiers'),
    }),
  ];
}

function rulesGroup(input, text) {
  const { selectedCurrencyUnits, selectedCharacterPrerequisites, selectedSystemModifiers } = input;
  return navGroup({
    id: 'worldRules',
    navRail: input.navRail,
    text,
    hooks: { 'data-world-rules-section': '' },
    // World > Rules & Resources (issue 1311).
    parent: worldItem({
      token: 'rules',
      domId: 'manager-world-nav-rules',
      label: text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources'),
      icon: 'fas fa-scale-balanced',
      current: input.isWorldRulesRoute,
      controls: 'manager-rules-submenu',
      markers: [
        countMarker(
          selectedCurrencyUnits.length +
            selectedCharacterPrerequisites.length +
            selectedSystemModifiers.length
        ),
      ],
      onSelect: input.activateWorldRulesParent,
    }),
    toggle: {
      domId: 'manager-rules-toggle',
      hooks: { 'data-world-rules-toggle': '' },
      labels: [
        ['FABRICATE.Admin.Manager.World.CollapseRules', 'Collapse Rules & Resources'],
        ['FABRICATE.Admin.Manager.World.ExpandRules', 'Expand Rules & Resources'],
      ],
    },
    submenu: {
      domId: 'manager-rules-submenu',
      hooks: { 'data-world-rules-submenu': '' },
      label: text('FABRICATE.Admin.Manager.World.RulesDestinations', 'Rules & Resources'),
    },
    children: rulesChildren(input, text),
  });
}

const WORLD_DEFAULTS = Object.freeze({
  currentView: '',
  setView: () => {},
  worldScopedCounts: {},
  isWorldRoute: false,
  openWorldParties: () => {},
  travelParties: [],
  isWorldTravelRoute: false,
  activateWorldTravelParent: () => {},
  worldRealms: [],
  worldTravelTab: '',
  openWorldTravelDestination: () => {},
  isWorldRulesRoute: false,
  activateWorldRulesParent: () => {},
  selectedCurrencyUnits: [],
  selectedCharacterPrerequisites: [],
  selectedSystemModifiers: [],
  isWorldCurrencyRoute: false,
  isWorldPrerequisitesRoute: false,
  isWorldModifiersRoute: false,
  openWorldRulesDestination: () => {},
});

/**
 * The world section below its heading, in rail order: the catalogue leaves, Parties, and the
 * Travel and Rules & Resources groups. Takes `ManagerWorldNav`'s props, with the same defaults.
 */
export function managerWorldNavItems(props, text) {
  const input = withDefaults(WORLD_DEFAULTS, props);
  return [...worldLeaves(input, text), travelGroup(input, text), rulesGroup(input, text)];
}

/** "{count} update" / "{count} updates": Core's own generic word for a companion's rollup. */
function downtimeRollupName(count, text) {
  const name =
    count === 1
      ? text('FABRICATE.Admin.Manager.World.Downtime.BadgeTotalOne', '{count} update')
      : text('FABRICATE.Admin.Manager.World.Downtime.BadgeTotalOther', '{count} updates');
  return name.replace('{count}', String(count));
}

/** The parent row's composed accessible name while the rollup shows. */
function downtimeParentName(count, label, text) {
  const name =
    count === 1
      ? text('FABRICATE.Admin.Manager.World.Downtime.NavWithBadgeOne', '{label}, {count} update')
      : text(
          'FABRICATE.Admin.Manager.World.Downtime.NavWithBadgeOther',
          '{label}, {count} updates'
        );
  return name.replace('{label}', label).replace('{count}', String(count));
}

/**
 * The parent's one trailing mark: the rollup while a companion's badges sit behind a closed
 * disclosure, else the PREMIUM chip, muted but never removed once a companion holds the surface
 * (issue 1185).
 */
function downtimeParentMarker({ downtimeCoreFallback: coreFallback }, rollup, text) {
  if (rollup.visible) {
    return {
      kind: 'issues',
      count: rollup.total,
      name: downtimeRollupName(rollup.total, text),
      hooks: { 'data-world-downtime-badge-total': '' },
    };
  }
  return {
    kind: 'premium',
    text: text('FABRICATE.Admin.Manager.World.Downtime.Premium', 'PREMIUM'),
    installed: !coreFallback,
    hooks: {
      'data-world-nav-premium': '',
      'data-world-nav-premium-state': coreFallback ? 'preview' : 'installed',
    },
  };
}

function downtimeParent(input, rollup, text) {
  const label = text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime');
  return worldItem({
    token: 'downtime',
    domId: 'manager-world-nav-downtime',
    label,
    icon: 'fas fa-hourglass-half',
    title: input.downtimeCoreFallback
      ? text(
          'FABRICATE.Admin.Manager.World.Downtime.PremiumTooltip',
          'Unlock Downtime Studio with Fabricate Premium'
        )
      : text(
          'FABRICATE.Admin.Manager.World.Downtime.InstalledTooltip',
          'Downtime Studio is unlocked by Fabricate Premium'
        ),
    ariaLabel: rollup.visible ? downtimeParentName(rollup.total, label, text) : label,
    current: input.isWorldDowntimeRoute,
    controls: 'manager-downtime-submenu',
    markers: [downtimeParentMarker(input, rollup, text)],
    onSelect: input.openWorldDowntime,
  });
}

/**
 * One tab's row. Its badge (issue 1302) describes it and never names it, and only a provider's tab
 * resolves one; `tierGated` draws the padlock that advertises Core's preview, where nothing is
 * unlocked.
 */
function downtimeChild(input, tab) {
  const { downtimeCoreFallback: coreFallback, downtimeTabText: tabText } = input;
  const current = input.isWorldDowntimeRoute && input.worldDowntimeTabId === tab.id;
  const badge = coreFallback ? null : resolveNavTabBadge(tab, input.downtimeNavTabBadges);
  const badgeId = `manager-downtime-nav-badge-${tab.id}`;
  const markers = [];
  if (badge) {
    markers.push({
      kind: 'issues',
      count: badge.count,
      name: badge.accessibleName,
      domId: badgeId,
      hooks: { 'data-world-downtime-badge': tab.id },
    });
  }
  return navItem({
    id: tab.id,
    domId: `manager-downtime-nav-${tab.id}`,
    label: tabText(tab, 'label'),
    labelId: input.downtimeNavLabelId(tab.id),
    icon: tab.icon,
    hooks: { 'data-world-downtime-item': tab.id },
    title: tabText(tab, 'tooltip'),
    ariaLabel: coreFallback ? undefined : tabText(tab, 'accessibleName'),
    active: current,
    current: current ? 'true' : undefined,
    ariaDescribedBy: badge ? badgeId : undefined,
    markers,
    tierGated: coreFallback,
    lockHooks: { 'data-world-downtime-lock': '' },
    // The companion route's rail scrolls its screen's row into view (issue 1213).
    reveal: Boolean(
      input.navRail.railLockedOpen &&
      input.navRail.expanded.worldDowntime &&
      tab.id === input.worldDowntimeTabId
    ),
    onSelect: () => input.openWorldDowntimePreview(tab.id),
  });
}

const DOWNTIME_DEFAULTS = Object.freeze({
  worldDowntimeAvailable: false,
  isWorldDowntimeRoute: false,
  downtimeCoreFallback: true,
  downtimeTabs: [],
  downtimeNavTabBadges: null,
  downtimeTabText: () => '',
  downtimeNavLabelId: () => '',
  worldDowntimeTabId: '',
  openWorldDowntime: () => {},
  openWorldDowntimePreview: () => {},
});

function downtimeCallout(text) {
  return {
    hooks: { 'data-world-downtime-callout': '' },
    kicker: text('FABRICATE.Admin.Manager.World.Downtime.RailKicker', 'PREMIUM PREVIEW'),
    note: text(
      'FABRICATE.Admin.Manager.World.Downtime.RailNote',
      'Open any Downtime page to preview how Fabricate Premium can help you run downtime.'
    ),
  };
}

/**
 * The world rail's Downtime group, or `null` while the surface is gated. Its children are the
 * active tab set, Core's previews or a provider's; `callout` is the preview's premium note, or
 * `null` once a companion holds the surface. Takes `ManagerWorldDowntimeNavGroup`'s props.
 */
export function managerDowntimeNavGroup(props, text) {
  const input = withDefaults(DOWNTIME_DEFAULTS, props);
  if (!input.worldDowntimeAvailable) return null;
  const { navRail, downtimeCoreFallback: coreFallback } = input;
  const total = coreFallback ? 0 : navTabBadgeTotal(input.downtimeTabs, input.downtimeNavTabBadges);
  // The rollup shows only while the children are hidden; both disjuncts are load-bearing.
  const visible =
    !coreFallback && total > 0 && (!navRail.expanded.worldDowntime || navRail.collapsedDisplay);
  const group = navGroup({
    id: 'worldDowntime',
    navRail,
    text,
    hooks: { 'data-world-downtime-section': '' },
    parent: downtimeParent(input, { total, visible }, text),
    toggle: {
      domId: 'manager-downtime-toggle',
      hooks: { 'data-world-downtime-toggle': '' },
      labels: [
        ['FABRICATE.Admin.Manager.World.Downtime.CollapseNav', 'Collapse Downtime'],
        ['FABRICATE.Admin.Manager.World.Downtime.ExpandNav', 'Expand Downtime'],
      ],
    },
    submenu: {
      domId: 'manager-downtime-submenu',
      hooks: { 'data-world-downtime-submenu': '' },
      label: text('FABRICATE.Admin.Manager.World.Downtime.NavSections', 'Downtime previews'),
    },
    children: input.downtimeTabs.map((tab) => downtimeChild(input, tab)),
  });
  return { ...group, callout: coreFallback ? downtimeCallout(text) : null };
}

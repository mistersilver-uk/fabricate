/**
 * The manager rail's item model (issue 1777): what each section's rows say, which of them a gate
 * or a lock removes, the counts and marks they carry, and where each press goes. The localizer
 * answers with the fallback, so a row's label is its shipped English; the rendered DOM of the same
 * rows is pinned by the rail and Downtime censuses in `tests/components/`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MANAGER_SYSTEM_RAIL_ENTRIES,
  MANAGER_WORLD_SCOPED_RAIL_ENTRIES,
} from '../scripts/lib/managerRailEntries.js';
import {
  managerDowntimeNavGroup,
  managerSystemNavItems,
  managerWorldNavItems,
  navRowClass,
} from '../src/ui/svelte/apps/manager/managerNavItems.js';

const text = (_key, fallback) => fallback;
const LOCKED_REASON = 'This section stays open while you are on one of its pages.';

/** A `navRailModel` stand-in: every group closed and unlocked unless stated. */
function navRail({ expanded = {}, lockedOpen = {}, collapsedDisplay = false } = {}) {
  const toggles = [];
  return {
    expanded,
    lockedOpen,
    collapsedDisplay,
    toggles,
    toggleGroup: (group, event) => {
      toggles.push([group, event]);
    },
  };
}

/** A recorder for the props that route a press, keyed by the prop name. */
function presses() {
  const calls = [];
  const record =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
    };
  return { calls, record };
}

const byId = (entries, id) => entries.find((entry) => entry.id === id);
const markerKinds = (item) => item.markers.map((marker) => marker.kind);
const countOf = (item) => item.markers.find((marker) => marker.kind === 'count')?.value;

function systemProps(overrides = {}) {
  return {
    navRail: navRail(),
    selectedSystem: { id: 'alchemy' },
    currentView: 'systems',
    canShowEssences: true,
    canShowEnvironments: true,
    experimentalFeaturesEnabled: true,
    craftingNavCount: 4,
    craftingNavItems: [
      { id: 'recipes', icon: 'fas fa-scroll', labelFallback: 'Recipes', count: 2 },
      { id: 'settings', icon: 'fas fa-sliders', labelFallback: 'Settings' },
    ],
    selectedCounts: { components: 4, essences: 2 },
    tagCategoryCounts: { recipeCategories: 3, componentCategories: 2, itemTags: 2 },
    toolsNavCount: 0,
    checksNavCount: 2,
    checksNavItems: [
      {
        id: 'crafting',
        view: 'checks-crafting',
        icon: 'fas fa-hammer',
        labelFallback: 'Crafting',
        dirty: true,
        issueCount: 1,
      },
      { id: 'validation', view: 'checks-validation', icon: 'fas fa-clipboard-check' },
    ],
    gatheringNavCounts: { total: 5, environments: 2, settings: null },
    visibleGatheringNavItems: [
      { id: 'environments', icon: 'fas fa-seedling', labelFallback: 'Environments' },
      { id: 'settings', icon: 'fas fa-sliders', labelFallback: 'Settings' },
    ],
    ...overrides,
  };
}

describe('the crafting-system section', () => {
  it('lists its rows in rail order, as the smoke harness addresses them by id and label', () => {
    const entries = managerSystemNavItems(systemProps(), text);
    const rows = entries.map((entry) => (entry.kind === 'group' ? entry.parent : entry));
    assert.deepEqual(
      rows.map((row) => ({ id: row.domId, label: row.label })),
      MANAGER_SYSTEM_RAIL_ENTRIES.map(({ id, label }) => ({ id, label }))
    );
    assert.deepEqual(
      entries.map((entry) => entry.kind ?? 'leaf'),
      ['leaf', 'group', 'leaf', 'leaf', 'leaf', 'leaf', 'group', 'group', 'leaf']
    );
    assert.deepEqual(byId(entries, 'system-overview').hooks, { 'data-nav-system-edit': '' });
  });

  it('renders nothing without a selected system', () => {
    assert.deepEqual(managerSystemNavItems(systemProps({ selectedSystem: null }), text), []);
  });

  it('drops the gated rows: Essences, Gathering and the experimental Graph placeholder', () => {
    const ids = managerSystemNavItems(
      systemProps({
        canShowEssences: false,
        canShowEnvironments: false,
        experimentalFeaturesEnabled: false,
      }),
      text
    ).map((entry) => entry.id);
    assert.deepEqual(ids, [
      'system-overview',
      'crafting',
      'component-rules',
      'tags',
      'tool-rules',
      'checks',
    ]);
  });

  it('draws Graph as a disabled placeholder that says why, with a word rather than a count', () => {
    const graph = byId(managerSystemNavItems(systemProps(), text), 'graph');
    assert.equal(graph.disabled, true);
    assert.equal(graph.title, 'Graph is planned for a future release.');
    assert.deepEqual(graph.markers, [{ kind: 'planned', text: 'Soon' }]);
    assert.equal(graph.active, undefined, 'a placeholder never wears the selected pill');
    assert.equal(graph.onSelect, undefined, 'and has nowhere to go');
  });

  it('counts records, and shows no zero where the row says so', () => {
    const quiet = managerSystemNavItems(systemProps(), text);
    assert.deepEqual(markerKinds(byId(quiet, 'system-overview')), []);
    assert.deepEqual(markerKinds(byId(quiet, 'tool-rules')), []);
    assert.equal(countOf(byId(quiet, 'component-rules')), 4);
    assert.equal(countOf(byId(quiet, 'tags')), 7, 'the whole screen’s vocabulary');
    assert.equal(countOf(byId(quiet, 'essence-rules')), 2);
    assert.equal(countOf(byId(quiet, 'crafting').parent), 4);
    assert.equal(countOf(byId(quiet, 'gathering').parent), 5);
    const gathering = byId(quiet, 'gathering').children;
    assert.equal(countOf(byId(gathering, 'environments')), 2);
    assert.deepEqual(markerKinds(byId(gathering, 'settings')), [], 'a null count draws nothing');
    const crafting = byId(quiet, 'crafting').children;
    assert.equal(countOf(byId(crafting, 'recipes')), 2);
    assert.deepEqual(markerKinds(byId(crafting, 'settings')), []);

    const busy = managerSystemNavItems(
      systemProps({ systemOverviewCount: 3, toolsNavCount: 6 }),
      text
    );
    assert.deepEqual(byId(busy, 'system-overview').markers, [
      { kind: 'count', value: 3, label: 'Open validation issues' },
    ]);
    assert.equal(countOf(byId(busy, 'tool-rules')), 6);
  });

  it('marks Checks issues as named badges, and an unsaved section before its badge', () => {
    const checks = byId(managerSystemNavItems(systemProps(), text), 'checks');
    assert.deepEqual(checks.parent.markers, [
      { kind: 'issues', count: 2, name: '2 issues', hooks: { 'data-checks-nav-issues': 'checks' } },
    ]);
    const crafting = byId(checks.children, 'crafting');
    assert.deepEqual(crafting.hooks, { 'data-checks-nav-item': 'crafting' });
    assert.deepEqual(crafting.markers, [
      { kind: 'dirty', name: 'Unsaved changes', hooks: { 'data-checks-nav-dirty': 'crafting' } },
      {
        kind: 'issues',
        count: 1,
        name: '1 issue',
        hooks: { 'data-checks-nav-issues': 'crafting' },
      },
    ]);
    assert.deepEqual(markerKinds(byId(checks.children, 'validation')), []);
    const clean = byId(managerSystemNavItems(systemProps({ checksNavCount: 0 }), text), 'checks');
    assert.deepEqual(clean.parent.markers, [], 'no badge at zero issues');
  });

  it('keeps the Crafting and Gathering parents out of the pill on their own routes', () => {
    const onRoute = managerSystemNavItems(
      systemProps({ isCraftingRoute: true, isGatheringRoute: true, isChecksRoute: true }),
      text
    );
    for (const id of ['crafting', 'gathering']) {
      const { parent } = byId(onRoute, id);
      assert.equal(parent.current, 'page', `${id} is the current page`);
      assert.equal(parent.active, undefined, `${id} never wears the selected pill`);
      assert.equal(
        navRowClass('manager-nav-button manager-nav-parent', parent),
        'manager-nav-button manager-nav-parent'
      );
    }
    const checks = byId(onRoute, 'checks').parent;
    assert.equal(checks.active, true, 'Checks wears it, being a route of its own');
    assert.equal(navRowClass('base', checks), 'base is-active');
    assert.equal(navRowClass('base', { active: false }), 'base ');
  });

  it('marks exactly the row the GM stands on as current', () => {
    const entries = managerSystemNavItems(
      systemProps({
        currentView: 'essence-edit',
        isGatheringRoute: true,
        displayedGatheringTab: 'environments',
      }),
      text
    );
    const essences = byId(entries, 'essence-rules');
    assert.deepEqual([essences.active, essences.current], [true, 'page']);
    for (const id of ['system-overview', 'component-rules', 'tags', 'tool-rules']) {
      assert.deepEqual([byId(entries, id).active, byId(entries, id).current], [false, undefined]);
    }
    const gathering = byId(entries, 'gathering').children;
    assert.equal(byId(gathering, 'environments').current, 'page');
    assert.equal(byId(gathering, 'settings').current, undefined);
  });

  it('routes each press to its own destination', () => {
    const { calls, record } = presses();
    const entries = managerSystemNavItems(
      systemProps({
        setView: record('setView'),
        editSystem: record('editSystem'),
        openCraftingSection: record('openCraftingSection'),
        openGatheringSection: record('openGatheringSection'),
        activateChecksParent: record('activateChecksParent'),
      }),
      text
    );
    byId(entries, 'system-overview').onSelect('click');
    for (const id of ['component-rules', 'tags', 'essence-rules', 'tool-rules']) {
      byId(entries, id).onSelect('click');
    }
    byId(byId(entries, 'crafting').children, 'recipes').onSelect('click');
    byId(byId(entries, 'gathering').children, 'settings').onSelect('click');
    byId(byId(entries, 'checks').children, 'validation').onSelect('click');
    byId(entries, 'checks').parent.onSelect('click');
    assert.deepEqual(calls, [
      ['editSystem', 'alchemy'],
      ['setView', 'components'],
      ['setView', 'tags'],
      ['setView', 'essences'],
      ['setView', 'tools'],
      ['openCraftingSection', 'recipes'],
      ['openGatheringSection', 'settings'],
      ['setView', 'checks-validation'],
      ['activateChecksParent', 'click'],
    ]);
  });

  it('locks a group open with its reason, and toggles any other through the rail', () => {
    const rail = navRail({
      expanded: { checks: true, gathering: false },
      lockedOpen: { checks: true },
    });
    const entries = managerSystemNavItems(systemProps({ navRail: rail }), text);
    const checks = byId(entries, 'checks');
    assert.deepEqual(
      [checks.expanded, checks.locked, checks.lockedReason, checks.toggle.label],
      [true, true, LOCKED_REASON, 'Collapse checks menu']
    );
    assert.deepEqual(checks.submenu, {
      hooks: {},
      domId: 'manager-checks-submenu',
      label: 'Checks sections',
    });
    const gathering = byId(entries, 'gathering');
    assert.deepEqual(
      [gathering.expanded, gathering.locked, gathering.lockedReason, gathering.toggle.label],
      [false, undefined, undefined, 'Expand gathering menu']
    );
    gathering.toggle.onToggle('event');
    assert.deepEqual(rail.toggles, [['gathering', 'event']]);
  });
});

function worldProps(overrides = {}) {
  return {
    navRail: navRail(),
    currentView: 'systems',
    worldScopedCounts: { components: 1, vocabulary: 2, essences: 3, tools: 4 },
    travelParties: [{}, {}],
    worldRealms: [{}],
    selectedCurrencyUnits: [{}],
    selectedCharacterPrerequisites: [{}, {}],
    selectedSystemModifiers: [{}, {}, {}],
    ...overrides,
  };
}

describe('the world section', () => {
  it('lists the catalogue leaves the harness addresses, then Parties, Travel and Rules', () => {
    const entries = managerWorldNavItems(worldProps(), text);
    assert.deepEqual(
      entries.slice(0, 4).map((leaf) => ({ id: leaf.domId, label: leaf.label })),
      MANAGER_WORLD_SCOPED_RAIL_ENTRIES.map(({ id, label }) => ({ id, label }))
    );
    assert.deepEqual(
      entries.map((entry) => entry.id),
      [
        'component-catalogue',
        'vocabulary',
        'essence-catalogue',
        'tool-catalogue',
        'parties',
        'worldTravel',
        'worldRules',
      ]
    );
    for (const leaf of entries.slice(0, 5)) {
      assert.deepEqual(leaf.hooks, { 'data-world-nav-item': leaf.id });
      assert.equal(leaf.ariaLabel, leaf.label, `${leaf.id} names itself`);
    }
  });

  it('counts each leaf from its own column, and each group from its own records', () => {
    const entries = managerWorldNavItems(worldProps(), text);
    assert.deepEqual(entries.slice(0, 4).map(countOf), [1, 2, 3, 4]);
    assert.equal(countOf(byId(entries, 'parties')), 2);
    assert.equal(countOf(byId(entries, 'worldTravel').parent), 1);
    assert.equal(countOf(byId(entries, 'worldRules').parent), 6);
    for (const id of ['worldTravel', 'worldRules']) {
      for (const child of byId(entries, id).children) assert.deepEqual(child.markers, []);
    }
  });

  it('marks the current leaf, group and destination, and routes each press', () => {
    const { calls, record } = presses();
    const entries = managerWorldNavItems(
      worldProps({
        currentView: 'world-essence-entry',
        isWorldTravelRoute: true,
        worldTravelTab: 'map',
        isWorldPrerequisitesRoute: true,
        setView: record('setView'),
        openWorldParties: record('openWorldParties'),
        openWorldTravelDestination: record('openWorldTravelDestination'),
        openWorldRulesDestination: record('openWorldRulesDestination'),
      }),
      text
    );
    assert.deepEqual(
      entries.slice(0, 5).map((leaf) => leaf.current),
      [undefined, undefined, 'page', undefined, undefined]
    );
    const travel = byId(entries, 'worldTravel');
    assert.deepEqual([travel.parent.active, travel.parent.current], [true, 'page']);
    assert.deepEqual(
      travel.children.map((child) => child.current),
      [undefined, 'page']
    );
    const rules = byId(entries, 'worldRules');
    assert.deepEqual(
      rules.children.map((child) => child.current),
      [undefined, 'page', undefined]
    );
    assert.equal(rules.parent.active, false);

    byId(entries, 'essence-catalogue').onSelect('click');
    byId(entries, 'parties').onSelect('click');
    byId(travel.children, 'realms').onSelect('click');
    byId(rules.children, 'modifiers').onSelect('click');
    assert.deepEqual(calls, [
      ['setView', 'world-essences'],
      ['openWorldParties', 'click'],
      ['openWorldTravelDestination', 'realms'],
      ['openWorldRulesDestination', 'modifiers'],
    ]);
  });

  it('gives each group its disclosure ids and hooks, and its lock reason', () => {
    const rail = navRail({ expanded: { worldRules: true }, lockedOpen: { worldRules: true } });
    const entries = managerWorldNavItems(worldProps({ navRail: rail }), text);
    const travel = byId(entries, 'worldTravel');
    assert.deepEqual(travel.hooks, { 'data-world-travel-section': '' });
    assert.equal(travel.parent.controls, 'manager-travel-submenu');
    assert.deepEqual(
      [travel.toggle.domId, travel.toggle.hooks, travel.toggle.label, travel.lockedReason],
      ['manager-travel-toggle', { 'data-world-travel-toggle': '' }, 'Expand Travel', undefined]
    );
    assert.deepEqual(
      travel.children.map((child) => child.hooks),
      [{ 'data-world-travel-item': 'realms' }, { 'data-world-travel-item': 'map' }]
    );
    const rules = byId(entries, 'worldRules');
    assert.deepEqual(
      [rules.toggle.domId, rules.toggle.label, rules.locked, rules.lockedReason],
      ['manager-rules-toggle', 'Collapse Rules & Resources', true, LOCKED_REASON]
    );
    assert.deepEqual(rules.submenu.hooks, { 'data-world-rules-submenu': '' });
  });
});

const CORE_TABS = [
  { id: 'tracking', icon: 'fas fa-chart-simple', label: 'Tracking', tooltip: 'Preview tracking' },
  { id: 'factions', icon: 'fas fa-flag', label: 'Factions', tooltip: 'Preview factions' },
];
const tabText = (tab, field) => (field === 'accessibleName' ? `Open ${tab.label}` : tab[field]);

function downtimeProps(overrides = {}) {
  return {
    navRail: navRail(),
    worldDowntimeAvailable: true,
    downtimeTabs: CORE_TABS,
    downtimeTabText: tabText,
    downtimeNavLabelId: (id) => `label-${id}`,
    ...overrides,
  };
}

const PROVIDER = {
  downtimeCoreFallback: false,
  downtimeTabs: [
    { ...CORE_TABS[0], badge: { count: 3, accessibleName: '3 waiting' } },
    { ...CORE_TABS[1], badge: { count: 2, accessibleName: '2 waiting' } },
  ],
};

describe('the Downtime group', () => {
  it('is absent behind a shut gate', () => {
    assert.equal(
      managerDowntimeNavGroup(downtimeProps({ worldDowntimeAvailable: false }), text),
      null
    );
  });

  it('sells Core’s preview: the gold PREMIUM chip, a padlock on every tab, and the note', () => {
    // A stored runtime badge never reaches Core’s own preview rows (issue 1302, AC-15).
    const stored = { tracking: { count: 4, accessibleName: '4 waiting' } };
    const group = managerDowntimeNavGroup(downtimeProps({ downtimeNavTabBadges: stored }), text);
    assert.deepEqual(group.parent.markers, [
      {
        kind: 'premium',
        text: 'PREMIUM',
        installed: false,
        hooks: { 'data-world-nav-premium': '', 'data-world-nav-premium-state': 'preview' },
      },
    ]);
    assert.equal(group.parent.title, 'Unlock Downtime Studio with Fabricate Premium');
    assert.equal(group.parent.ariaLabel, 'Downtime');
    for (const child of group.children) {
      assert.deepEqual(child.markers, [
        { kind: 'lock', hooks: { 'data-world-downtime-lock': '' } },
      ]);
      assert.equal(child.ariaLabel, undefined, 'Core’s own tab is named by its label');
      assert.equal(child.ariaDescribedBy, undefined);
    }
    assert.equal(group.callout.kicker, 'PREMIUM PREVIEW');
  });

  it('mutes the chip for a companion, and hangs each badge on its tab as a description', () => {
    const group = managerDowntimeNavGroup(
      downtimeProps({ ...PROVIDER, navRail: navRail({ expanded: { worldDowntime: true } }) }),
      text
    );
    assert.deepEqual(markerKinds(group.parent), ['premium']);
    assert.deepEqual(group.parent.markers[0], {
      kind: 'premium',
      text: 'PREMIUM',
      installed: true,
      hooks: { 'data-world-nav-premium': '', 'data-world-nav-premium-state': 'installed' },
    });
    assert.equal(group.parent.title, 'Downtime Studio is unlocked by Fabricate Premium');
    assert.equal(group.callout, null, 'nothing is locked, so there is nothing to sell');
    const [tracking] = group.children;
    assert.deepEqual(tracking.markers, [
      {
        kind: 'issues',
        count: 3,
        name: '3 waiting',
        domId: 'manager-downtime-nav-badge-tracking',
        hooks: { 'data-world-downtime-badge': 'tracking' },
      },
    ]);
    assert.equal(tracking.ariaDescribedBy, 'manager-downtime-nav-badge-tracking');
    assert.equal(tracking.ariaLabel, 'Open Tracking');
    assert.equal(tracking.labelId, 'label-tracking');
    assert.deepEqual(tracking.hooks, { 'data-world-downtime-item': 'tracking' });
  });

  it('lets a runtime badge override the registered one', () => {
    const group = managerDowntimeNavGroup(
      downtimeProps({
        ...PROVIDER,
        downtimeNavTabBadges: { factions: { count: 9, accessibleName: '9' } },
      }),
      text
    );
    assert.equal(group.children[1].markers[0].count, 9);
    assert.equal(
      group.parent.ariaLabel,
      'Downtime, 12 updates',
      'and the rollup sums what resolves'
    );
  });

  it('summarises the hidden badges on the parent only while the children are hidden', () => {
    const closed = managerDowntimeNavGroup(downtimeProps(PROVIDER), text);
    assert.deepEqual(closed.parent.markers, [
      {
        kind: 'issues',
        count: 5,
        name: '5 updates',
        hooks: { 'data-world-downtime-badge-total': '' },
      },
    ]);
    assert.equal(closed.parent.ariaLabel, 'Downtime, 5 updates');

    const open = managerDowntimeNavGroup(
      downtimeProps({ ...PROVIDER, navRail: navRail({ expanded: { worldDowntime: true } }) }),
      text
    );
    assert.deepEqual(markerKinds(open.parent), ['premium']);
    assert.equal(open.parent.ariaLabel, 'Downtime');

    const collapsedRail = managerDowntimeNavGroup(
      downtimeProps({
        ...PROVIDER,
        navRail: navRail({ expanded: { worldDowntime: true }, collapsedDisplay: true }),
      }),
      text
    );
    assert.deepEqual(
      markerKinds(collapsedRail.parent),
      ['issues'],
      'a collapsed rail hides them too'
    );

    const unbadged = managerDowntimeNavGroup(
      downtimeProps({ downtimeCoreFallback: false, downtimeTabs: CORE_TABS }),
      text
    );
    assert.deepEqual(markerKinds(unbadged.parent), ['premium'], 'nothing to summarise at zero');
  });

  it('marks the tab on screen current, locks the group on its route, and routes each press', () => {
    const { calls, record } = presses();
    const rail = navRail({
      expanded: { worldDowntime: true },
      lockedOpen: { worldDowntime: true },
    });
    const group = managerDowntimeNavGroup(
      downtimeProps({
        navRail: rail,
        isWorldDowntimeRoute: true,
        worldDowntimeTabId: 'factions',
        openWorldDowntime: record('openWorldDowntime'),
        openWorldDowntimePreview: record('openWorldDowntimePreview'),
      }),
      text
    );
    assert.deepEqual(
      group.children.map((child) => child.current),
      [undefined, 'true']
    );
    assert.deepEqual([group.parent.current, group.parent.active], ['page', true]);
    assert.deepEqual([group.locked, group.lockedReason], [true, LOCKED_REASON]);
    assert.equal(group.toggle.label, 'Collapse Downtime');
    group.parent.onSelect('click');
    group.children[0].onSelect('click');
    assert.deepEqual(calls, [
      ['openWorldDowntime', 'click'],
      ['openWorldDowntimePreview', 'tracking'],
    ]);
  });
});

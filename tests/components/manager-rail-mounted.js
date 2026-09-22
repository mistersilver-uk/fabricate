/** The manager shell: its three regions, its nav rail groups, and the browse state it lifts. */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { createManagerExtensionsRegistry } from '../../src/ui/managerExtensions.js';
import { useShippedLocalization } from '../helpers/manager/managerLocalization.js';
import { createStore, downtimeProvider } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { censusDelta, censusOf, writeCensus } from '../helpers/domCensus.js';
import {
  assertHook,
  assertNoHook,
  assertShippedString,
  managerComponents,
  settleBetweenTests,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  craftingParent,
  craftingSubitem,
  downtimeRailIds,
  navButton,
  worldNavButton,
  worldNavItem,
  worldTravelItem,
} = queries;
const { mountManager, openRecipeEditor } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

// ── The rail's rendered DOM, pinned per reachable state (issue 1717) ─────────────────────────
// The extraction forwards about sixty bindings by hand across two component levels, so the defect
// it can produce is a correctly-shaped element fed the wrong prop; only a census of attribute
// values sees that. The walk and the literal writer live in `tests/helpers/domCensus.js`, which the
// page-header census shares (issue 1720).
const CENSUS_REGENERATE =
  'UPDATE_RAIL_CENSUS=1 node --conditions=browser --test tests/components/manager-mounted.test.js';
const CENSUS_FILE = resolve(import.meta.dirname, 'manager-rail-mounted.js');
const CENSUS_NAME = 'rail';
// The state the other four are pinned as a difference from; it must be the first entry of
// `CENSUS_STATES`, because `writeCensus` emits the baseline before the deltas taken against it.
const CENSUS_BASE_STATE = 'a system selected, the rail expanded, every group collapsed';

function railCensus(host) {
  const rail = host.querySelector('.manager-rail');
  assert.ok(Boolean(rail), 'the census needs the rail itself to render');
  const lines = censusOf(rail);
  assert.ok(lines.length > 40, `the census walked ${lines.length} elements; the scan broke`);
  return lines;
}

const RAIL_CENSUS = Object.freeze({
  /* rail-census:start */
  base: [
    "0 aside aria-label=\"Crafting manager navigation\" class=\"manager-rail\"",
    "1 p class=\"manager-rail-title\" data-manager-rail-section=\"\" | GM management",
    "1 section aria-label=\"Manager scope\" class=\"manager-rail-block\"",
    "2 div class=\"manager-scope-card\"",
    "3 div class=\"manager-scope-card-head\"",
    "4 p class=\"manager-kicker\" | Crafting system",
    "4 button aria-disabled=\"false\" aria-label=\"Collapse navigation rail\" aria-pressed=\"false\" class=\"manager-rail-toggle manager-scope-collapse\" data-manager-rail-toggle=\"\" title=\"Collapse navigation rail\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-angles-left\"",
    "3 select aria-label=\"Select a system\" class=\"manager-scope-select\" data-manager-scope-select=\"\"",
    "4 option value=\"alchemy\" | Alchemy",
    "4 option value=\"smithing\" | Smithing",
    "3 button aria-disabled=\"true\" aria-label=\"Return to System Library\" class=\"manager-scope-return is-disabled\" disabled=\"\" title=\"Return to System Library\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-arrow-left-long\"",
    "4 span | All crafting systems",
    "1 nav aria-label=\"Manager sections\" class=\"manager-nav\"",
    "2 button class=\"manager-nav-button \" data-nav-system-edit=\"\" id=\"manager-nav-system-overview\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-clipboard-check\"",
    "3 span class=\"manager-nav-label\" | System Overview",
    "2 div class=\"manager-nav-group \"",
    "3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent\" id=\"manager-nav-crafting\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-hammer\"",
    "4 span class=\"manager-nav-label\" | Crafting",
    "4 span class=\"manager-nav-count\" | 4",
    "3 button aria-controls=\"manager-crafting-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand crafting menu\" class=\"manager-nav-toggle\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
    "2 button class=\"manager-nav-button \" id=\"manager-nav-component-rules\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-boxes\"",
    "3 span class=\"manager-nav-label\" | Component Rules",
    "3 span class=\"manager-nav-count\" | 4",
    "2 button class=\"manager-nav-button \" id=\"manager-nav-tags\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-tags\"",
    "3 span class=\"manager-nav-label\" | Tags & Categories",
    "3 span class=\"manager-nav-count\" | 7",
    "2 button class=\"manager-nav-button \" id=\"manager-nav-essence-rules\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-mortar-pestle\"",
    "3 span class=\"manager-nav-label\" | Essence Rules",
    "3 span class=\"manager-nav-count\" | 2",
    "2 button class=\"manager-nav-button \" id=\"manager-nav-tool-rules\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-screwdriver-wrench\"",
    "3 span class=\"manager-nav-label\" | Tool Rules",
    "2 div class=\"manager-nav-group \"",
    "3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent \" id=\"manager-nav-checks\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-dice-d20\"",
    "4 span class=\"manager-nav-label\" | Checks",
    "4 span aria-label=\"2 issues\" class=\"manager-nav-issue-badge\" data-checks-nav-issues=\"checks\" role=\"img\" | 2",
    "3 button aria-controls=\"manager-checks-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand checks menu\" class=\"manager-nav-toggle\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
    "2 div class=\"manager-nav-group \"",
    "3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent\" id=\"manager-nav-gathering\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-seedling\"",
    "4 span class=\"manager-nav-label\" | Gathering",
    "4 span class=\"manager-nav-count\" | 5",
    "3 button aria-controls=\"manager-gathering-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand gathering menu\" class=\"manager-nav-toggle\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
    "2 button class=\"manager-nav-button\" disabled=\"\" id=\"manager-nav-graph\" title=\"Graph is planned for a future release.\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-project-diagram\"",
    "3 span class=\"manager-nav-label\" | Graph",
    "3 span class=\"manager-nav-planned\" | Soon",
    "2 section aria-labelledby=\"manager-world-heading\" class=\"manager-world-nav\" data-world-nav-section=\"\"",
    "3 div class=\"manager-world-heading-row\"",
    "4 h2 id=\"manager-world-heading\" | WORLD",
    "4 span id=\"manager-world-scope\" | every system",
    "3 button aria-label=\"Component catalogue\" class=\"manager-nav-button manager-world-nav-item \" data-world-nav-item=\"component-catalogue\" id=\"manager-world-nav-component-catalogue\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-cubes-stacked\"",
    "4 span class=\"manager-nav-label\" | Component catalogue",
    "4 span class=\"manager-nav-count\" | 0",
    "3 button aria-label=\"Tags & Categories\" class=\"manager-nav-button manager-world-nav-item \" data-world-nav-item=\"vocabulary\" id=\"manager-world-nav-vocabulary\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-tags\"",
    "4 span class=\"manager-nav-label\" | Tags & Categories",
    "4 span class=\"manager-nav-count\" | 0",
    "3 button aria-label=\"Essence Catalogue\" class=\"manager-nav-button manager-world-nav-item \" data-world-nav-item=\"essence-catalogue\" id=\"manager-world-nav-essence-catalogue\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-flask-vial\"",
    "4 span class=\"manager-nav-label\" | Essence Catalogue",
    "4 span class=\"manager-nav-count\" | 0",
    "3 button aria-label=\"Tools Catalogue\" class=\"manager-nav-button manager-world-nav-item \" data-world-nav-item=\"tool-catalogue\" id=\"manager-world-nav-tool-catalogue\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-screwdriver-wrench\"",
    "4 span class=\"manager-nav-label\" | Tools Catalogue",
    "4 span class=\"manager-nav-count\" | 0",
    "3 button aria-label=\"Parties\" class=\"manager-nav-button manager-world-nav-item \" data-world-nav-item=\"parties\" id=\"manager-world-nav-parties\" type=\"button\"",
    "4 i aria-hidden=\"true\" class=\"fas fa-users\"",
    "4 span class=\"manager-nav-label\" | Parties",
    "4 span class=\"manager-nav-count\" | 2",
    "3 div class=\"manager-nav-group manager-world-travel-group \" data-world-travel-section=\"\"",
    "4 button aria-controls=\"manager-travel-submenu\" aria-expanded=\"false\" aria-label=\"Travel\" class=\"manager-nav-button manager-nav-parent manager-world-nav-item \" data-world-nav-item=\"travel\" id=\"manager-world-nav-travel\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-route\"",
    "5 span class=\"manager-nav-label\" | Travel",
    "5 span class=\"manager-nav-count\" | 1",
    "4 button aria-controls=\"manager-travel-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand Travel\" class=\"manager-nav-toggle\" data-world-travel-toggle=\"\" id=\"manager-travel-toggle\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
    "3 div class=\"manager-nav-group manager-world-rules-group \" data-world-rules-section=\"\"",
    "4 button aria-controls=\"manager-rules-submenu\" aria-expanded=\"false\" aria-label=\"Rules & Resources\" class=\"manager-nav-button manager-nav-parent manager-world-nav-item \" data-world-nav-item=\"rules\" id=\"manager-world-nav-rules\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-scale-balanced\"",
    "5 span class=\"manager-nav-label\" | Rules & Resources",
    "5 span class=\"manager-nav-count\" | 0",
    "4 button aria-controls=\"manager-rules-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand Rules & Resources\" class=\"manager-nav-toggle\" data-world-rules-toggle=\"\" id=\"manager-rules-toggle\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
    "3 div class=\"manager-nav-group manager-world-downtime-group \" data-world-downtime-section=\"\"",
    "4 button aria-controls=\"manager-downtime-submenu\" aria-expanded=\"false\" aria-label=\"Downtime\" class=\"manager-nav-button manager-nav-parent manager-world-nav-item \" data-world-nav-item=\"downtime\" id=\"manager-world-nav-downtime\" title=\"Unlock Downtime Studio with Fabricate Premium\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-hourglass-half\"",
    "5 span class=\"manager-nav-label\" | Downtime",
    "5 span class=\"manager-nav-premium \" data-world-nav-premium=\"\" data-world-nav-premium-state=\"preview\" | PREMIUM",
    "4 button aria-controls=\"manager-downtime-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand Downtime\" class=\"manager-nav-toggle\" data-world-downtime-toggle=\"\" id=\"manager-downtime-toggle\" type=\"button\"",
    "5 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
  ],
  deltas: {
    "no crafting system selected, which is the other scope-card branch": [
      "- 4 p class=\"manager-kicker\" | Crafting system",
      "+ 4 p class=\"manager-kicker\" | Fabricate",
      "- 3 select aria-label=\"Select a system\" class=\"manager-scope-select\" data-manager-scope-select=\"\"",
      "- 4 option value=\"alchemy\" | Alchemy",
      "- 4 option value=\"smithing\" | Smithing",
      "- 3 button aria-disabled=\"true\" aria-label=\"Return to System Library\" class=\"manager-scope-return is-disabled\" disabled=\"\" title=\"Return to System Library\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-arrow-left-long\"",
      "- 4 span | All crafting systems",
      "+ 3 h2 class=\"manager-title\" | Crafting Systems",
      "- 2 button class=\"manager-nav-button \" data-nav-system-edit=\"\" id=\"manager-nav-system-overview\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-clipboard-check\"",
      "- 3 span class=\"manager-nav-label\" | System Overview",
      "- 2 div class=\"manager-nav-group \"",
      "- 3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent\" id=\"manager-nav-crafting\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-hammer\"",
      "- 4 span class=\"manager-nav-label\" | Crafting",
      "- 4 span class=\"manager-nav-count\" | 4",
      "- 3 button aria-controls=\"manager-crafting-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand crafting menu\" class=\"manager-nav-toggle\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
      "- 2 button class=\"manager-nav-button \" id=\"manager-nav-component-rules\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-boxes\"",
      "- 3 span class=\"manager-nav-label\" | Component Rules",
      "- 3 span class=\"manager-nav-count\" | 4",
      "- 2 button class=\"manager-nav-button \" id=\"manager-nav-tags\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-tags\"",
      "- 3 span class=\"manager-nav-label\" | Tags & Categories",
      "- 3 span class=\"manager-nav-count\" | 7",
      "- 2 button class=\"manager-nav-button \" id=\"manager-nav-essence-rules\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-mortar-pestle\"",
      "- 3 span class=\"manager-nav-label\" | Essence Rules",
      "- 3 span class=\"manager-nav-count\" | 2",
      "- 2 button class=\"manager-nav-button \" id=\"manager-nav-tool-rules\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-screwdriver-wrench\"",
      "- 3 span class=\"manager-nav-label\" | Tool Rules",
      "- 2 div class=\"manager-nav-group \"",
      "- 3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent \" id=\"manager-nav-checks\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-dice-d20\"",
      "- 4 span class=\"manager-nav-label\" | Checks",
      "- 4 span aria-label=\"2 issues\" class=\"manager-nav-issue-badge\" data-checks-nav-issues=\"checks\" role=\"img\" | 2",
      "- 3 button aria-controls=\"manager-checks-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand checks menu\" class=\"manager-nav-toggle\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
      "- 2 div class=\"manager-nav-group \"",
      "- 3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent\" id=\"manager-nav-gathering\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-seedling\"",
      "- 4 span class=\"manager-nav-label\" | Gathering",
      "- 4 span class=\"manager-nav-count\" | 5",
      "- 3 button aria-controls=\"manager-gathering-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand gathering menu\" class=\"manager-nav-toggle\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
      "- 2 button class=\"manager-nav-button\" disabled=\"\" id=\"manager-nav-graph\" title=\"Graph is planned for a future release.\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-project-diagram\"",
      "- 3 span class=\"manager-nav-label\" | Graph",
      "- 3 span class=\"manager-nav-planned\" | Soon",
    ],
    "the rail collapsed on the stored preference": [
      "- 4 button aria-disabled=\"false\" aria-label=\"Collapse navigation rail\" aria-pressed=\"false\" class=\"manager-rail-toggle manager-scope-collapse\" data-manager-rail-toggle=\"\" title=\"Collapse navigation rail\" type=\"button\"",
      "- 5 i aria-hidden=\"true\" class=\"fas fa-angles-left\"",
      "+ 4 button aria-disabled=\"false\" aria-label=\"Expand navigation rail\" aria-pressed=\"true\" class=\"manager-rail-toggle manager-scope-collapse\" data-manager-rail-toggle=\"\" title=\"Expand navigation rail\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-angles-right\"",
    ],
    "the Checks group locked open on one of its own child routes": [
      "- 3 button aria-disabled=\"true\" aria-label=\"Return to System Library\" class=\"manager-scope-return is-disabled\" disabled=\"\" title=\"Return to System Library\" type=\"button\"",
      "+ 3 button aria-disabled=\"false\" aria-label=\"Return to System Library\" class=\"manager-scope-return \" title=\"Return to System Library\" type=\"button\"",
      "- 2 div class=\"manager-nav-group \"",
      "- 3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent \" id=\"manager-nav-checks\" type=\"button\"",
      "+ 2 div class=\"manager-nav-group is-expanded\"",
      "+ 3 button aria-current=\"page\" aria-expanded=\"true\" class=\"manager-nav-button manager-nav-parent is-active\" id=\"manager-nav-checks\" type=\"button\"",
      "- 3 button aria-controls=\"manager-checks-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand checks menu\" class=\"manager-nav-toggle\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
      "+ 3 button aria-controls=\"manager-checks-submenu\" aria-disabled=\"true\" aria-expanded=\"true\" aria-label=\"Collapse checks menu\" class=\"manager-nav-toggle\" disabled=\"\" title=\"This section stays open while you are on one of its pages.\" type=\"button\"",
      "+ 4 i aria-hidden=\"true\" class=\"fas fa-chevron-up\"",
      "+ 3 div aria-label=\"Checks sections\" class=\"manager-nav-submenu\" id=\"manager-checks-submenu\"",
      "+ 4 button aria-current=\"page\" class=\"manager-nav-subitem is-active\" data-checks-nav-item=\"crafting\" id=\"manager-checks-nav-crafting\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-hammer\"",
      "+ 5 span class=\"manager-nav-label\" | Crafting",
      "+ 5 span aria-label=\"1 issue\" class=\"manager-nav-issue-badge\" data-checks-nav-issues=\"crafting\" role=\"img\" | 1",
      "+ 4 button class=\"manager-nav-subitem \" data-checks-nav-item=\"salvage\" id=\"manager-checks-nav-salvage\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-recycle\"",
      "+ 5 span class=\"manager-nav-label\" | Salvage",
      "+ 5 span aria-label=\"1 issue\" class=\"manager-nav-issue-badge\" data-checks-nav-issues=\"salvage\" role=\"img\" | 1",
      "+ 4 button class=\"manager-nav-subitem \" data-checks-nav-item=\"gathering\" id=\"manager-checks-nav-gathering\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-seedling\"",
      "+ 5 span class=\"manager-nav-label\" | Gathering",
      "+ 4 button class=\"manager-nav-subitem \" data-checks-nav-item=\"validation\" id=\"manager-checks-nav-validation\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-clipboard-check\"",
      "+ 5 span class=\"manager-nav-label\" | Validation",
      "+ 5 span aria-label=\"2 issues\" class=\"manager-nav-issue-badge\" data-checks-nav-issues=\"validation\" role=\"img\" | 2",
    ],
    "the Crafting group locked open on one of its own child routes": [
      "- 3 button aria-disabled=\"true\" aria-label=\"Return to System Library\" class=\"manager-scope-return is-disabled\" disabled=\"\" title=\"Return to System Library\" type=\"button\"",
      "+ 3 button aria-disabled=\"false\" aria-label=\"Return to System Library\" class=\"manager-scope-return \" title=\"Return to System Library\" type=\"button\"",
      "- 2 div class=\"manager-nav-group \"",
      "- 3 button aria-expanded=\"false\" class=\"manager-nav-button manager-nav-parent\" id=\"manager-nav-crafting\" type=\"button\"",
      "+ 2 div class=\"manager-nav-group is-expanded\"",
      "+ 3 button aria-current=\"page\" aria-expanded=\"true\" class=\"manager-nav-button manager-nav-parent\" id=\"manager-nav-crafting\" type=\"button\"",
      "- 3 button aria-controls=\"manager-crafting-submenu\" aria-disabled=\"false\" aria-expanded=\"false\" aria-label=\"Expand crafting menu\" class=\"manager-nav-toggle\" type=\"button\"",
      "- 4 i aria-hidden=\"true\" class=\"fas fa-chevron-down\"",
      "+ 3 button aria-controls=\"manager-crafting-submenu\" aria-disabled=\"true\" aria-expanded=\"true\" aria-label=\"Collapse crafting menu\" class=\"manager-nav-toggle\" disabled=\"\" title=\"This section stays open while you are on one of its pages.\" type=\"button\"",
      "+ 4 i aria-hidden=\"true\" class=\"fas fa-chevron-up\"",
      "+ 3 div aria-label=\"Crafting sections\" class=\"manager-nav-submenu\" id=\"manager-crafting-submenu\"",
      "+ 4 button aria-current=\"page\" class=\"manager-nav-subitem is-active\" id=\"manager-crafting-nav-recipes\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-scroll\"",
      "+ 5 span class=\"manager-nav-label\" | Recipes",
      "+ 5 span class=\"manager-nav-count\" | 2",
      "+ 4 button class=\"manager-nav-subitem \" id=\"manager-crafting-nav-books-scrolls\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-book\"",
      "+ 5 span class=\"manager-nav-label\" | Books & Scrolls",
      "+ 5 span class=\"manager-nav-count\" | 2",
      "+ 4 button class=\"manager-nav-subitem \" id=\"manager-crafting-nav-knowledge\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-brain\"",
      "+ 5 span class=\"manager-nav-label\" | Knowledge",
      "+ 4 button class=\"manager-nav-subitem \" id=\"manager-crafting-nav-settings\" type=\"button\"",
      "+ 5 i aria-hidden=\"true\" class=\"fas fa-sliders\"",
      "+ 5 span class=\"manager-nav-label\" | Settings",
    ],
  },
  /* rail-census:end */
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerRailCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  // What issue 1185 took off the titlebar is asserted by its absence: each would return silently.
  it('renders the titlebar and its resolution status, without the chrome issue 1185 removed', () => {
    useShippedLocalization();
    mountManager();

    assertHook(target, '.manager-titlebar[data-manager-titlebar]');
    assertHook(target, '[data-manager-titlebar-status]', 'the titlebar reports the resolution');
    assert.ok(
      target.querySelector('[data-manager-titlebar-status]').getAttribute('title')?.length > 0,
      'and names that status in its tooltip as well as its text'
    );
    for (const gone of [
      '.manager-titlebar-icon',
      '.manager-titlebar-product',
      '.manager-route-icon',
      '[data-manager-route-icon]',
      '[data-manager-titlebar-system]',
    ]) {
      assertNoHook(target, gone, `${gone} was removed from the page header and must stay gone`);
    }
  });

  it('labels the rail section, in shipped copy', () => {
    useShippedLocalization();
    mountManager();

    assertHook(target, '.manager-rail-title[data-manager-rail-section]');
    assertShippedString(target, 'FABRICATE.Admin.Manager.Nav.SectionLabel');
  });

  // The record-count vehicle draws numerals, so a `Soon` inside one reads as a quantity.
  it('draws rail counts as bare numerals and the placeholder as a plain Soon span', () => {
    useShippedLocalization();
    // Graph is the only planned view, and it is behind the experimental gate.
    mountManager([], { experimentalFeaturesEnabled: true });

    const counts = [...target.querySelectorAll('.manager-nav-count')];
    assert.ok(counts.length > 0, 'the rail draws at least one record count');
    assert.ok(
      counts.every((count) => !count.classList.contains('manager-chip')),
      'no rail count may borrow the content chip'
    );
    assert.ok(
      counts.every((count) => /^\d+$/.test(count.textContent.trim())),
      'every rail count is a bare numeral'
    );
    const planned = target.querySelector('.manager-nav-planned');
    assert.ok(Boolean(planned), 'the disabled placeholder keeps its own quiet trailing span');
    assert.equal(planned.textContent.trim(), 'Soon');
    assert.ok(
      !planned.classList.contains('manager-nav-count'),
      'and it must not return to the record-count vehicle'
    );
  });

  it('renders the three-region systems shell with selected inspector data', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    assert.ok(target.querySelector('.fabricate-manager'));
    assert.ok(target.querySelector('.manager-rail'));
    assert.ok(target.querySelector('.manager-main'));
    assert.ok(target.querySelector('.manager-inspector'));
    assert.equal(target.querySelectorAll('.manager-system-row').length, 2);
    // The strip is `aria-hidden` and carries no `columnheader` since issue 1515.
    const systemsHead = target.querySelector('.manager-table-head');
    assert.equal(systemsHead.getAttribute('aria-hidden'), 'true');
    assert.deepEqual(
      Array.from(systemsHead.querySelectorAll('span')).map((label) => label.textContent.trim()),
      ['System', 'Resolution', 'Status', 'Actions']
    );
    assert.equal(target.querySelectorAll('[role="columnheader"]').length, 0);
    assert.equal(target.querySelectorAll('.manager-systems-table[role="list"]').length, 1);
    assert.equal(target.querySelectorAll('.manager-system-row[role="listitem"]').length, 2);
    assert.equal(target.querySelectorAll('.manager-count-cluster').length, 0);
    assert.ok(target.querySelector('.manager-breadcrumbs'));
    // ONE PAGE HEADER, EYEBROW INCLUDED (issue 1515). The library used to draw its own
    // `manager-section-header` — `Browse` / `System library` / a second hint — directly under the
    // shell's. The eyebrow survives as the shell's `<Kicker>`; the second title does not, and the
    // lede is the library's own actionable sentence rather than the generic one that described
    // what a crafting system IS.
    assert.ok(
      !target.querySelector('.manager-header .manager-heading > .manager-kicker'),
      'the shell eyebrow is the shared Kicker primitive, not the manager class it replaces'
    );
    assert.equal(
      target.querySelector('.manager-header [data-page-kicker]').textContent.trim(),
      'Browse'
    );
    assert.equal(
      target.querySelector('.manager-header .manager-subtitle').textContent.trim(),
      'Select a row to view counts and enabled features.'
    );
    assert.equal(target.textContent.includes('Systems View'), false);
    assert.equal(target.textContent.includes('System library'), false);
    assert.ok(
      !target.querySelector('.manager-main .manager-section-header'),
      'the library renders no second page header, so it carries no header action group either'
    );
    assert.equal(target.textContent.includes('Quick actions'), false);
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
        label.textContent.trim()
      ),
      [
        'System Overview',
        'Crafting',
        'Component Rules',
        'Tags & Categories',
        'Essence Rules',
        'Tool Rules',
        'Checks',
        'Gathering',
        // The four world scoped-entity leaves (issue 1362).
        'Component catalogue',
        'Tags & Categories',
        'Essence Catalogue',
        'Tools Catalogue',
        // No 'Downtime' (issue 1257): the World > Downtime group is gated behind
        // `fabricate.experimentalFeatures`, which this store fixture leaves at its default off.
        'Parties',
        // World > Travel (issue 1282) and World > Currency (issue 1278) sit under Parties and
        // are UNGATED, unlike Downtime.
        'Travel',
        'Rules & Resources',
      ]
    );
    assert.equal(
      Array.from(target.querySelectorAll('.manager-header-actions .manager-button')).some(
        (button) => button.textContent.includes('Open current admin')
      ),
      false,
      'system library header should not expose the legacy admin launch button'
    );
    // The standalone "Overview" nav item was folded into the renamed "System
    // Overview" nav item, which now carries the open-validation-issue badge.
    const systemOverviewNav = Array.from(target.querySelectorAll('.manager-nav-button')).find(
      (button) =>
        button.querySelector('.manager-nav-label')?.textContent.trim() === 'System Overview'
    );
    assert.ok(systemOverviewNav, 'system overview nav button should render');
    assert.ok(
      systemOverviewNav.querySelector('.fas.fa-clipboard-check'),
      'system overview nav should use the validation clipboard icon'
    );
    assert.equal(
      Array.from(target.querySelectorAll('.manager-nav-button[data-nav-system-overview]')).length,
      0,
      'the standalone Overview nav item should be removed'
    );
    // NO ZERO BADGE (issue 1373). The rail states counts where there is something to count.
    const toolsNav = navButton('Tool Rules');
    assert.ok(!toolsNav.querySelector('.manager-nav-count'), 'no zero count badge on Tool Rules');
    assert.ok(target.textContent.includes('Alchemy'));
    assert.ok(target.textContent.includes('Potion and essence work'));
    assert.ok(target.textContent.includes('4'));
    assert.ok(target.textContent.includes('2'));

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(
      environmentFact.textContent.trim().replace(/\s+/g, ' '),
      '2 Gathering environments'
    );
    assert.equal(
      environmentFact.querySelector('.manager-fact-leading')?.textContent.trim(),
      '2 Gathering'
    );
    assert.equal(
      environmentFact.querySelector('.manager-fact-label')?.textContent.trim(),
      'environments'
    );

    const systemHeroRow = target.querySelector(
      '.manager-inspector .manager-inspector-title-row.is-hero-large'
    );
    assert.ok(systemHeroRow, 'systems inspector should use the prominent hero title row');
    assert.ok(
      systemHeroRow.querySelector('.manager-inspector-icon.is-hero-large'),
      'systems inspector hero should render the icon at hero-large size'
    );
  });

  it('keeps the Crafting group available and hides Graph with experimental features off (issue 745)', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    // No experimental flag: createStore defaults experimentalFeaturesEnabled to false,
    // driving the real gating derivation (not a stubbed value).
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // The Crafting group is unconditional now (v1.3 headline).
    const crafting = craftingParent();
    assert.ok(crafting, 'the Crafting group renders with the experimental toggle off');
    assert.equal(
      crafting.disabled,
      false,
      'the Crafting parent is a live route, not a placeholder'
    );

    // The unimplemented Graph placeholder is hidden while experimental features are off.
    assert.equal(
      navButton('Graph'),
      undefined,
      'Graph placeholder is hidden with experimental features off'
    );

    // Routing to Recipes works end to end without the experimental toggle.
    crafting.click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
  });

  // ── THE LIFTED BROWSE VIEW-STATE (issue 1438) ────────────────────────────────────────
  const LIFTED_BROWSE_SURFACES = [
    {
      name: 'the system library',
      trip: 'an editor round-trip',
      open: async () => {},
      searchLabel: 'Search systems',
      term: 'Alch',
      leave: () => target.querySelector('[aria-label="Edit Alchemy"]').click(),
      leftView: 'system-edit',
      back: () => target.querySelector('[data-system-edit-back]').click(),
      view: 'systems',
    },
    {
      name: 'the environment library',
      trip: 'an editor round-trip',
      open: async () => {
        navButton('Gathering').click();
      },
      searchLabel: 'Search environments',
      term: 'Moon',
      leave: () => target.querySelector('[aria-label="Edit Moonlit Forest"]').click(),
      leftView: 'environment-edit',
      back: () => target.querySelector('[data-environment-edit-back]').click(),
      view: 'environments',
    },
    {
      name: 'the gathering task library',
      trip: 'an editor round-trip',
      open: async () => {
        navButton('Gathering').click();
        await tick();
        flushSync();
        target.querySelector('#manager-gathering-nav-tasks').click();
      },
      searchLabel: 'Search gathering tasks',
      term: 'Moon',
      leave: () => target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click(),
      leftView: 'gathering-task-edit',
      back: () => target.querySelector('[data-gathering-task-back]').click(),
      view: 'environments',
    },
    {
      name: 'the gathering encounter library',
      trip: 'an editor round-trip',
      storeOptions: {
        gatheringLibraryEvents: [
          {
            id: 'ev-storm',
            name: 'Sudden Storm',
            enabled: true,
            biomes: ['forest'],
            dangerTags: ['safe'],
          },
        ],
      },
      open: async () => {
        navButton('Gathering').click();
        await tick();
        flushSync();
        target.querySelector('#manager-gathering-nav-encounters').click();
      },
      searchLabel: 'Search gathering events',
      term: 'Storm',
      leave: () => target.querySelector('[aria-label="Edit Sudden Storm"]').click(),
      leftView: 'gathering-event-edit',
      back: () => target.querySelector('[data-gathering-event-back]').click(),
      view: 'environments',
    },
    {
      name: 'the tool library',
      trip: 'leaving the route and coming back',
      open: async () => {
        navButton('Tool Rules').click();
      },
      // Sentence case since issue 1373's parity pass.
      searchLabel: 'Search tools',
      term: 'Hammer',
      leave: () => navButton('Essence Rules').click(),
      leftView: 'essences',
      back: () => navButton('Tool Rules').click(),
      view: 'tools',
    },
    {
      name: 'the recipe-category vocabulary panel',
      trip: 'leaving the route and coming back',
      open: async () => {
        navButton('Tags & Categories').click();
      },
      searchLabel: 'Search recipe categories',
      term: 'Poti',
      // A ROUTE trip since issue 1915: the three vocabularies mount together, so there is no tab
      // to switch to and the whole screen is what unmounts. The sibling panel is still checked,
      // because three panels on one screen share a slot registry and only ONE of them may hold
      // this term.
      leave: () => navButton('Essence Rules').click(),
      leftView: 'essences',
      siblingSearch: 'Search component categories',
      back: () => navButton('Tags & Categories').click(),
      view: 'tags',
    },
    {
      name: 'the knowledge roster',
      trip: 'leaving the route and coming back',
      storeOptions: { experimentalFeaturesEnabled: true },
      open: async () => {
        craftingParent().click();
        await tick();
        flushSync();
        craftingSubitem('Knowledge').click();
      },
      searchLabel: 'Search characters',
      term: 'Ast',
      leave: () => navButton('Tags & Categories').click(),
      leftView: 'tags',
      back: () => craftingSubitem('Knowledge').click(),
      view: 'knowledge',
    },
    {
      name: 'the world travel realm list',
      trip: 'switching Travel sub-tab and back',
      open: async () => {
        worldNavButton('Travel').click();
      },
      searchLabel: 'Search realms',
      term: 'North',
      leave: () => target.querySelector('[data-world-travel-item="map"]').click(),
      leavesSearchBehind: true,
      back: () => target.querySelector('[data-world-travel-item="realms"]').click(),
      view: 'world-travel',
    },
  ];

  /** Drive a `ManagerSearchField` the way a GM does: type into its input. */
  function typeIntoSearch(ariaLabel, value) {
    const input = target.querySelector(`input[type="search"][aria-label="${ariaLabel}"]`);
    assert.ok(input, `no search field is labelled "${ariaLabel}"`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
  }

  function searchValue(ariaLabel) {
    return target.querySelector(`input[type="search"][aria-label="${ariaLabel}"]`)?.value;
  }

  for (const surface of LIFTED_BROWSE_SURFACES) {
    it(`keeps ${surface.name} search across ${surface.trip}`, async () => {
      mountManager([], surface.storeOptions || {});
      await tick();
      flushSync();
      await surface.open();
      await tick();
      flushSync();

      assert.equal(
        target.querySelector('.fabricate-manager').dataset.managerView,
        surface.view,
        'the surface is on screen before anything is typed'
      );
      typeIntoSearch(surface.searchLabel, surface.term);
      await tick();
      flushSync();
      assert.equal(
        searchValue(surface.searchLabel),
        surface.term,
        'the field took the term, so the restore below is a measurement'
      );

      surface.leave();
      await tick();
      flushSync();
      // NON-VACUITY: the trip really did replace the surface. Without this a `leave` that
      // resolved to nothing would leave the browser mounted and the restore would be trivial.
      if (surface.leftView) {
        assert.equal(
          target.querySelector('.fabricate-manager').dataset.managerView,
          surface.leftView,
          'the trip changed route, so the surface was unmounted'
        );
      }
      if (surface.leftPanel) {
        assert.ok(
          searchValue(surface.leftPanel) !== undefined,
          'the trip mounted the sibling panel, so this one was unmounted'
        );
        assert.equal(
          searchValue(surface.leftPanel),
          '',
          'and the sibling has its OWN slot — the term did not leak across the tabs'
        );
      }
      if (surface.leavesSearchBehind) {
        assert.ok(
          searchValue(surface.searchLabel) === undefined,
          'the trip removed the surface, so its search box is gone from the document'
        );
      }

      surface.back();
      await tick();
      flushSync();
      assert.equal(
        target.querySelector('.fabricate-manager').dataset.managerView,
        surface.view,
        'and the GM is back where they were'
      );
      assert.equal(
        searchValue(surface.searchLabel),
        surface.term,
        `${surface.name} kept the search term across ${surface.trip}`
      );
      // A SIBLING ON THE SAME SCREEN, where one exists. Three vocabulary panels mount at once and
      // each binds its own slot; a shared one would restore the term into all three.
      if (surface.siblingSearch) {
        assert.equal(
          searchValue(surface.siblingSearch),
          '',
          `${surface.siblingSearch} has its OWN slot — the term did not leak across the panels`
        );
      }
    });
  }

  it('keeps a gathering task filter, not just its search, across the editor round-trip', async () => {
    // The search box is the axis every surface in the table shares.
    mountManager([]);
    await tick();
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('#manager-gathering-nav-tasks').click();
    await tick();
    flushSync();

    const statusFilter = target.querySelector(
      '[aria-label="Filter gathering tasks by status"], [data-gathering-tasks-browser] select'
    );
    assert.ok(statusFilter, 'the task toolbar offers a status filter');
    // `active` rather than `disabled`: both are non-default.
    statusFilter.value = 'active';
    statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(statusFilter.value, 'active', 'the filter took the value');

    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    target.querySelector('[data-gathering-task-back]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector(
        '[aria-label="Filter gathering tasks by status"], [data-gathering-tasks-browser] select'
      ).value,
      'active',
      'the status filter survived the editor round-trip'
    );
  });

  it('does NOT lift the task editor four session search terms — they still reset', async () => {
    // The other half of the rule, and the half a future change is most likely to erode. The
    // editor's component / tag / drop-rule / tool pickers belong to ONE editing session: they
    // name what the GM is attaching to THIS task right now, so carrying them back into the next
    // task would apply a filter nobody set on a record nobody was editing.
    mountManager([], {
      gatheringLibraryTools: [
        { id: 'tool-chisel', label: 'Fine Chisel', enabled: true, componentId: 'c1' },
      ],
    });
    await tick();
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    target.querySelector('#manager-gathering-nav-tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    // The FOUR the issue names, all four declared in `GatheringTaskEditView.svelte`. The
    // manager root's own `Search character modifiers to add` box is NOT one of them — it is the
    // shell's modifier picker, a different surface with a different owner, and asserting on it
    // here would have measured something this component does not control.
    const EDITOR_SEARCHES = [
      'Search component names',
      'Search component tags',
      'Search drop rules',
      'Search tools by name',
    ];
    for (const label of EDITOR_SEARCHES) {
      typeIntoSearch(label, 'zzz');
    }
    await tick();
    flushSync();
    for (const label of EDITOR_SEARCHES) {
      assert.equal(searchValue(label), 'zzz', `${label} took the term`);
    }

    target.querySelector('[data-gathering-task-back]').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    for (const label of EDITOR_SEARCHES) {
      assert.equal(
        searchValue(label),
        '',
        `${label} is editor-session state and must still reset on re-entry`
      );
    }
  });

  it('shows the Crafting group unconditionally and gates only Graph on experimental features (issue 745)', async () => {
    // Experimental OFF (the shipped default).
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { experimentalFeaturesEnabled: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.ok(
      target.querySelector('#manager-nav-crafting'),
      'Crafting group renders when experimental off'
    );
    assert.ok(craftingParent(), 'Crafting parent button present when experimental off');
    assert.equal(navButton('Graph'), undefined, 'Graph placeholder hidden when experimental off');

    // Experimental ON: the Crafting group is unchanged and the Graph placeholder
    // appears as a disabled "Soon" item.
    unmount(mounted);
    target.remove();
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.ok(
      target.querySelector('#manager-nav-crafting'),
      'Crafting group still renders when experimental on'
    );
    const graph = navButton('Graph');
    assert.ok(graph, 'Graph placeholder advertised when experimental on');
    assert.equal(graph.disabled, true, 'Graph is a disabled placeholder');
    assert.equal(graph.querySelector('.manager-nav-planned')?.textContent.trim(), 'Soon');
    assert.ok(
      !graph.querySelector('.manager-nav-count'),
      'and the placeholder word is not drawn through the record-count vehicle (issue 1515)'
    );
  });

  it('exposes the Crafting group with Gathering-parity a11y and nested Settings + Recipes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // Collapsed by default: parent present, submenu absent.
    const parent = target.querySelector('#manager-nav-crafting');
    assert.ok(parent, 'Crafting parent renders when experimental on');
    assert.equal(parent.getAttribute('aria-expanded'), 'false');
    // Parent total = 2 recipes + 2 books & scrolls items in the default fixture (issue 643).
    assert.equal(parent.querySelector('.manager-nav-count').textContent.trim(), '4');
    const toggle = target.querySelector('#manager-nav-crafting + .manager-nav-toggle');
    assert.equal(toggle.getAttribute('aria-controls'), 'manager-crafting-submenu');
    assert.equal(toggle.getAttribute('aria-label'), 'Expand crafting menu');
    assert.equal(target.querySelector('#manager-crafting-submenu'), null);

    // Clicking the parent routes to Recipes and expands the submenu.
    parent.click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(parent.getAttribute('aria-expanded'), 'true');
    // The row announces itself as the current page on a route inside its own group; this is the
    // replacement for the source pin `recipe-edit-placeholder.test.js` retired (issue 1717).
    assert.equal(parent.getAttribute('aria-current'), 'page');
    const submenu = target.querySelector('#manager-crafting-submenu');
    assert.ok(submenu, 'crafting submenu renders when expanded');
    assert.equal(
      target
        .querySelector('#manager-nav-crafting + .manager-nav-toggle')
        .getAttribute('aria-label'),
      'Collapse crafting menu'
    );
    // The Crafting sub-tabs are a conditional set keyed on the system's
    // visibilityMode (issue 511, PR-B) plus, for Knowledge, its resolutionMode
    // (issue 785). The default fixture has no visibilityMode (→ 'knowledge') and a
    // resolutionMode of 'alchemy', so BOTH Knowledge disjuncts are true: Access is
    // hidden, Books & Scrolls is shown, and Knowledge appears in every mounted
    // manager test. Order is Recipes · Books & Scrolls · Knowledge · Settings.
    const craftingItems = Array.from(submenu.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      craftingItems.map((item) => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Recipes', 'Books & Scrolls', 'Knowledge', 'Settings']
    );
    assert.deepEqual(
      craftingItems.map((item) => item.id),
      [
        'manager-crafting-nav-recipes',
        'manager-crafting-nav-books-scrolls',
        'manager-crafting-nav-knowledge',
        'manager-crafting-nav-settings',
      ]
    );
    assert.equal(craftingSubitem('Recipes').getAttribute('aria-current'), 'page');
    assert.equal(craftingSubitem('Recipes').classList.contains('is-active'), true);
    assert.equal(craftingSubitem('Settings').getAttribute('aria-current'), null);

    // Settings routes to the real crafting-rules page (resolution mode + visibility).
    craftingSubitem('Settings').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'crafting-settings'
    );
    assert.equal(craftingSubitem('Settings').getAttribute('aria-current'), 'page');
    assert.ok(target.querySelector('[data-crafting-settings]'), 'crafting settings page renders');
    assert.ok(
      target.querySelector('[data-crafting-resolution-mode]'),
      'the recipe resolution-mode card renders on Crafting Settings'
    );
    // The inspector aside is suppressed on the crafting-settings route.
    assert.equal(target.querySelector('.manager-inspector'), null);

    // Recipes sub-item routes back to the recipes browser.
    craftingSubitem('Recipes').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);
  });

  it('does not mark a Crafting subitem active while the group is expanded over a non-crafting route', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // On Components (a non-crafting route).
    navButton('Component Rules').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    target.querySelector('#manager-nav-crafting + .manager-nav-toggle').click();
    await tick();
    flushSync();

    // The submenu is shown, but no subitem falsely reports the active/current page
    // (the state is guarded by isCraftingRoute, mirroring the Gathering group).
    assert.ok(
      target.querySelector('#manager-crafting-submenu'),
      'submenu expands from a non-crafting route'
    );
    assert.equal(craftingSubitem('Recipes').getAttribute('aria-current'), null);
    assert.equal(craftingSubitem('Recipes').classList.contains('is-active'), false);
    assert.equal(craftingSubitem('Settings').getAttribute('aria-current'), null);
    assert.equal(craftingSubitem('Books & Scrolls').getAttribute('aria-current'), null);
  });

  it('names the Gathering sub-tab in the trail, and the group above it navigates', async () => {
    // FOUR SCREENS UNDER ONE NAME (issue 1328). Gathering is Environments, Tasks.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([]),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const crumbs = () =>
      Array.from(target.querySelectorAll('.manager-breadcrumbs > *'))
        .filter((node) => node.tagName.toLowerCase() !== 'i')
        .map((node) => node.textContent.trim());

    navButton('Gathering').click();
    await tick();
    flushSync();
    assert.deepEqual(crumbs(), ['Crafting Systems', 'Alchemy', 'Gathering', 'Environments']);

    // A SECOND TAB IS A DIFFERENT TRAIL, which is the whole claim.
    target.querySelector('#manager-gathering-nav-tasks').click();
    await tick();
    flushSync();
    assert.deepEqual(crumbs(), ['Crafting Systems', 'Alchemy', 'Gathering', 'Tasks']);
    assert.equal(
      target.querySelector('[data-breadcrumb-gathering-tab]').dataset.breadcrumbGatheringTab,
      'tasks'
    );

    // AND THE GROUP CRUMB IS A LABEL HERE, not a control. One rule decides it.
    assert.equal(
      Array.from(target.querySelectorAll('.manager-breadcrumbs button')).some(
        (button) => button.textContent.trim() === 'Gathering'
      ),
      false,
      'the Gathering crumb offers a press that would go nowhere'
    );
  });

  // ── Rail group expand / collapse (issue 1185) ──────────────────────────────────────────
  describe('rail group expansion is independent, sticky, and locked only by an active sub-tab', () => {
    // The five groups, each with the disclosure that opens it.
    const RAIL_GROUPS = [
      {
        id: 'crafting',
        label: 'Crafting',
        toggle: '#manager-nav-crafting + .manager-nav-toggle',
        submenu: '#manager-crafting-submenu',
        childView: 'recipes',
        enterChild: () => navButton('Crafting').click(),
      },
      {
        id: 'checks',
        label: 'Checks',
        toggle: '#manager-nav-checks + .manager-nav-toggle',
        submenu: '#manager-checks-submenu',
        childView: 'checks-crafting',
        enterChild: () => navButton('Checks').click(),
      },
      {
        id: 'gathering',
        label: 'Gathering',
        toggle: '#manager-nav-gathering + .manager-nav-toggle',
        submenu: '#manager-gathering-submenu',
        childView: 'environments',
        enterChild: () => navButton('Gathering').click(),
      },
      {
        id: 'worldTravel',
        label: 'Travel',
        toggle: '#manager-travel-toggle',
        submenu: '#manager-travel-submenu',
        childView: 'world-travel',
        enterChild: () => worldTravelItem('travel').click(),
      },
      {
        id: 'worldDowntime',
        label: 'Downtime',
        toggle: '#manager-downtime-toggle',
        submenu: '#manager-downtime-submenu',
        childView: 'world-downtime',
        enterChild: () => worldNavItem('downtime').click(),
      },
    ];

    // Every rail navigation here passes `confirmRouteExit`.
    async function settleRail() {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
      await tick();
      flushSync();
    }

    function railToggle(group) {
      const toggle = target.querySelector(group.toggle);
      assert.ok(Boolean(toggle), `the ${group.label} group should render a disclosure control`);
      return toggle;
    }

    function isExpanded(group) {
      return Boolean(target.querySelector(group.submenu));
    }

    function expandedGroupIds() {
      return RAIL_GROUPS.filter(isExpanded).map((group) => group.id);
    }

    function currentManagerView() {
      return target.querySelector('.fabricate-manager').dataset.managerView;
    }

    function mountRail(rootProps = {}) {
      // `experimentalFeaturesEnabled` unlocks the World > Downtime group (issue 1257),
      // which is one of the five groups this suite's disclosure contract covers.
      mountManager(
        [],
        { gatheringRealmsEnabled: true, experimentalFeaturesEnabled: true },
        {},
        rootProps
      );
      assert.equal(currentManagerView(), 'systems', 'the rail starts on a route inside no group');
      assert.deepEqual(expandedGroupIds(), [], 'and with every group collapsed');
    }

    it('collapses any group while the others stay expanded, and the collapse sticks', async () => {
      mountRail();

      for (const group of RAIL_GROUPS) {
        railToggle(group).click();
        await settleRail();
      }
      assert.deepEqual(
        expandedGroupIds(),
        RAIL_GROUPS.map((group) => group.id),
        'all five open together — the groups are independent, not an accordion'
      );

      for (const group of RAIL_GROUPS) {
        railToggle(group).click();
        await settleRail();
        // A second settle: the re-assert loop closed and reopened the group within one flush,
        // so an assertion taken immediately after the click could read the intermediate state.
        await settleRail();
        assert.deepEqual(
          expandedGroupIds(),
          RAIL_GROUPS.filter((other) => other !== group).map((other) => other.id),
          `${group.label} collapses while its four expanded siblings are untouched`
        );
        railToggle(group).click();
        await settleRail();
        assert.ok(isExpanded(group), `${group.label} re-opens from the same control`);
      }

      // The Tool Studio is the case a route-derived force got wrong on a route that is not
      // even the group's own: `|| isToolStudioRoute` pinned Crafting open on a screen the
      // Crafting submenu does not offer, and left that chevron inert. Entering it still opens
      // the group — its breadcrumb reads "<system> › Crafting › Tools" — but as intent, so the
      // disclosure keeps working.
      const crafting = RAIL_GROUPS[0];
      railToggle(crafting).click();
      await settleRail();
      assert.ok(!isExpanded(crafting), 'pre-condition: Crafting is collapsed before Tools opens');

      navButton('Tool Rules').click();
      await settleRail();
      assert.equal(currentManagerView(), 'tools');
      assert.ok(isExpanded(crafting), 'the Tool Studio opens the Crafting group it sits under');
      assert.equal(
        railToggle(crafting).disabled,
        false,
        'Tools is not a Crafting sub-item, so it must not lock the group'
      );
      railToggle(crafting).click();
      await settleRail();
      await settleRail();
      assert.ok(!isExpanded(crafting), 'and the group collapses over the Tool Studio');
    });

    it('locks a group open while one of its own sub-items is the current view, and says why', async () => {
      useShippedLocalization();
      mountRail();

      for (const group of RAIL_GROUPS) {
        group.enterChild();
        await settleRail();
        assert.equal(currentManagerView(), group.childView, `${group.label} routed to its child`);

        const toggle = railToggle(group);
        assert.equal(toggle.disabled, true, `${group.label} reports its disclosure as disabled`);
        assert.equal(toggle.getAttribute('aria-disabled'), 'true');
        assert.equal(
          toggle.getAttribute('title'),
          'This section stays open while you are on one of its pages.',
          'the control explains the constraint rather than silently swallowing the click'
        );

        toggle.click();
        await settleRail();
        assert.ok(isExpanded(group), `${group.label} does not collapse out from under its view`);

        for (const other of RAIL_GROUPS.filter((candidate) => candidate !== group)) {
          const otherToggle = railToggle(other);
          assert.equal(
            otherToggle.disabled,
            false,
            `${other.label} stays collapsible while ${group.label} is locked`
          );
          assert.equal(otherToggle.getAttribute('title'), null);
        }
      }
    });

    it('leaves a group exactly as the GM left it when the route moves elsewhere', async () => {
      mountRail();
      const checks = RAIL_GROUPS[1];

      // Left EXPANDED. Entering a sub-item records the intent as well as taking the lock.
      navButton('Checks').click();
      await settleRail();
      assert.equal(currentManagerView(), 'checks-crafting');
      assert.ok(isExpanded(checks));

      navButton('Component Rules').click();
      await settleRail();
      assert.equal(currentManagerView(), 'components');
      assert.ok(isExpanded(checks), 'leaving a group does not slam it shut behind the GM');
      assert.equal(
        railToggle(checks).disabled,
        false,
        'and the disclosure is live again the moment the lock releases'
      );

      // Left COLLAPSED. The same group, collapsed off-route.
      railToggle(checks).click();
      await settleRail();
      assert.ok(!isExpanded(checks));

      navButton('Tags & Categories').click();
      await settleRail();
      assert.equal(currentManagerView(), 'tags');
      assert.ok(!isExpanded(checks), 'a collapse survives navigation too');
    });

    // An editor detail route belongs to the group whose sub-item opened it.
    it('stays locked inside its own editor detail route, and outlives the lock on return', async () => {
      await openRecipeEditor([]);
      assert.equal(currentManagerView(), 'recipe-edit');

      const crafting = RAIL_GROUPS[0];
      assert.ok(isExpanded(crafting), 'the editor inherits the group opened by Recipes');
      assert.equal(
        railToggle(crafting).disabled,
        true,
        'an editor detail route is a sub-tab, so it locks its own group open'
      );
      railToggle(crafting).click();
      await settleRail();
      await settleRail();
      assert.ok(isExpanded(crafting), 'and the locked group does not collapse over the editor');

      const back = Array.from(target.querySelectorAll('.manager-header-actions button')).find(
        (button) => button.textContent.includes('Back to recipes')
      );
      assert.ok(Boolean(back), 'the recipe editor offers Back to recipes');
      back.click();
      await settleRail();
      assert.equal(currentManagerView(), 'recipes');
      assert.ok(isExpanded(crafting), 'entering a sub-item keeps its group open');

      navButton('Component Rules').click();
      await settleRail();
      assert.equal(currentManagerView(), 'components');
      assert.ok(
        isExpanded(crafting),
        'and records the intent, so the group outlives the lock releasing'
      );
    });

    // The Downtime group's children come from whichever provider holds the surface.
    it('gives a provider-supplied Downtime tab set the same collapse behaviour as Core', async () => {
      const registry = createManagerExtensionsRegistry();
      registry.publicApi.registerWorldNavProvider(
        downtimeProvider({ prefix: 'Guild', ids: ['ledger', 'crew', 'writs'] })
      );
      mountRail({ managerExtensions: registry });
      const downtime = RAIL_GROUPS[4];

      railToggle(downtime).click();
      await settleRail();
      assert.deepEqual(
        downtimeRailIds(),
        ['ledger', 'crew', 'writs'],
        'the rail renders the provider set, not Core preview tabs'
      );
      railToggle(downtime).click();
      await settleRail();
      await settleRail();
      assert.ok(!isExpanded(downtime), 'a provider-driven group collapses like any other');

      worldNavItem('downtime').click();
      await settleRail();
      assert.equal(currentManagerView(), 'world-downtime');
      assert.equal(
        railToggle(downtime).disabled,
        true,
        'and locks open on its own route exactly as Core does'
      );

      worldNavItem('parties').click();
      await settleRail();
      assert.equal(currentManagerView(), 'world');
      assert.ok(isExpanded(downtime), 'leaving it does not close it');
      assert.equal(railToggle(downtime).disabled, false);
      railToggle(downtime).click();
      await settleRail();
      await settleRail();
      assert.ok(!isExpanded(downtime), 'and the collapse sticks off-route');
    });
  });

  // The rail's assistive-technology contract lives in attribute values that no screenshot renders.
  // The five states are its reachable shapes: 31 `{#if}`/`{#each}` blocks over 154 element sites
  // mean a single literal would freeze exactly one of them. The Downtime submenu is reached by no
  // state here and is pinned by `tests/components/manager-downtime-mounted.js` instead.
  it('emits the same rail DOM, attribute for attribute, in each of its five states', async () => {
    const CENSUS_STATES = {
      [CENSUS_BASE_STATE]: () => {
        mountManager([], { gatheringRealmsEnabled: true, experimentalFeaturesEnabled: true });
      },
      'no crafting system selected, which is the other scope-card branch': () => {
        mountManager([], {
          noSystems: true,
          gatheringRealmsEnabled: true,
          experimentalFeaturesEnabled: true,
        });
      },
      'the rail collapsed on the stored preference': () => {
        mountManager(
          [],
          { gatheringRealmsEnabled: true, experimentalFeaturesEnabled: true },
          { getSetting: (key) => key === 'managerRailCollapsed' }
        );
      },
      'the Checks group locked open on one of its own child routes': async () => {
        mountManager([], { gatheringRealmsEnabled: true, experimentalFeaturesEnabled: true });
        navButton('Checks').click();
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
        await tick();
        flushSync();
      },
      // The crafting parent's own `aria-current` is pinned by value only on a crafting route, and
      // no other state reaches one; the four non-crafting states record its absence.
      'the Crafting group locked open on one of its own child routes': async () => {
        mountManager([], { gatheringRealmsEnabled: true, experimentalFeaturesEnabled: true });
        navButton('Crafting').click();
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
        await tick();
        flushSync();
      },
    };

    const censuses = {};
    for (const [state, open] of Object.entries(CENSUS_STATES)) {
      useShippedLocalization();
      await open();
      censuses[state] = railCensus(target);
      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }

    const base = censuses[CENSUS_BASE_STATE];
    const observed = {
      base,
      deltas: Object.fromEntries(
        Object.entries(censuses)
          .filter(([state]) => state !== CENSUS_BASE_STATE)
          .map(([state, census]) => [state, censusDelta(base, census)])
      ),
    };

    if (process.env.UPDATE_RAIL_CENSUS) {
      writeCensus(CENSUS_FILE, CENSUS_NAME, observed);
      return;
    }
    assert.deepEqual(
      observed,
      RAIL_CENSUS,
      'the rail’s emitted DOM moved. This change is behaviour-preserving, so the expected ' +
        'answer is that nothing did. If it moved deliberately, re-derive the literal with ' +
        `${CENSUS_REGENERATE} and say in the commit what moved and why.`
    );
  });

  // The gathering reset is the one expansion writer that carries a value rather than an open, and
  // it is reached by a system switch, not by a route move: the effect returns early unless the
  // selected system changed. Normalised to an unconditional open it would leave the group standing
  // open on a route that is not its own, which nothing else in this suite observes (issue 1717).
  it('closes the Gathering group when the GM switches to another system off a gathering route', async () => {
    useShippedLocalization();
    mountManager([], {
      gatheringRealmsEnabled: true,
      experimentalFeaturesEnabled: true,
      // Both systems offer Gathering, so the group is still rendered after the switch and the
      // assertion is about its state rather than about its absence.
      smithingFeatures: { gathering: true, itemTags: true, recipeCategories: true, salvage: true },
    });

    const settle = async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
      await tick();
      flushSync();
    };
    const gatheringParent = () => target.querySelector('#manager-nav-gathering');
    const submenu = () => target.querySelector('#manager-gathering-submenu');

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'systems',
      'pre-condition: the route is outside the Gathering group, so nothing locks it open'
    );
    assert.ok(!submenu(), 'and the group starts collapsed');

    target.querySelector('#manager-nav-gathering + .manager-nav-toggle').click();
    await settle();
    assert.ok(Boolean(submenu()), 'the GM opened the group by its own disclosure');
    assert.equal(gatheringParent().getAttribute('aria-expanded'), 'true');

    const scope = target.querySelector('[data-manager-scope-select]');
    scope.value = 'smithing';
    scope.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await settle();
    await settle();

    assert.ok(
      !submenu(),
      'switching system resets the group to the route, and this route is not a gathering one'
    );
    assert.equal(gatheringParent().getAttribute('aria-expanded'), 'false');
  });

  // Leaving a library's route clears its search (issue 1462)
  describe('route-scoped library search clear', () => {
    function clearCallCount(calls) {
      return calls.filter((call) => call[0] === 'clearLibrarySearches').length;
    }

    function currentManagerView() {
      return target.querySelector('.fabricate-manager').dataset.managerView;
    }

    // Perform ONE click and report the `clearLibrarySearches` delta it produced.
    async function clickForClearDelta(calls, resolveButton, label) {
      const button = resolveButton();
      assert.ok(button, `the navigation target under test is rendered (${label})`);
      const before = clearCallCount(calls);
      button.click();
      await tick();
      flushSync();
      return { delta: clearCallCount(calls) - before, view: currentManagerView() };
    }

    // Mount and route to the recipe library, asserting arrival.
    async function openRecipeLibrary(calls, storeOptions = {}) {
      mountManager(calls, { experimentalFeaturesEnabled: true, ...storeOptions });
      craftingParent().click();
      await tick();
      flushSync();
      assert.equal(currentManagerView(), 'recipes', 'the case starts on the recipe library');
    }

    it('mounting calls nothing, because the scope sentinel is seeded at declaration', async () => {
      // The complement of every delta case.
      const calls = [];
      mountManager(calls, { experimentalFeaturesEnabled: true });
      await tick();
      flushSync();

      assert.equal(currentManagerView(), 'systems', 'the manager mounts on the system library');
      assert.equal(clearCallCount(calls), 0, 'no clear is attempted before the GM navigates');
    });

    it('Recipes -> Components clears the library searches', async () => {
      const calls = [];
      await openRecipeLibrary(calls);
      const outcome = await clickForClearDelta(calls, () => navButton('Component Rules'), 'Component Rules');

      assert.equal(outcome.view, 'components');
      assert.equal(outcome.delta, 1, 'a different browser is a different scope, so the term is cleared');
    });

    it('Recipes -> Books & Scrolls clears the library searches', async () => {
      const calls = [];
      await openRecipeLibrary(calls);
      const outcome = await clickForClearDelta(
        calls,
        () => craftingSubitem('Books & Scrolls'),
        'Books & Scrolls'
      );

      assert.equal(outcome.view, 'books-scrolls');
      assert.equal(
        outcome.delta,
        1,
        'the reported symptom: the destination reads the recipe cohort and renders no search box'
      );
    });

    it('Recipes -> Access clears the library searches', async () => {
      // Access binds the same recipe search pair as the recipe browser and renders its own
      // box, so this is a real behaviour change on a surface nobody reported. It is the
      // maintainer's own rule applied literally: the search is preserved for the browser's
      // detail editor and for nothing else, and Access is a sibling library.
      const calls = [];
      await openRecipeLibrary(calls, { selectedSystemOverrides: { visibilityMode: 'restricted' } });
      const outcome = await clickForClearDelta(calls, () => craftingSubitem('Access'), 'Access');

      assert.equal(outcome.view, 'access');
      assert.equal(outcome.delta, 1);
    });

    it('Access -> Tags & Categories clears the library searches', async () => {
      // The hole a first draft of this feature shipped. Access WRITES the recipe search from
      // its own box, and Tags & Categories counts vocabulary references over the filtered
      // rows, where a referenced entry reading `Unused` deletes in one click with no confirm
      // strip. A design that collapsed both routes to one "not a search-scoped browser"
      // bucket compared that bucket with itself and cleared nothing on this exact hop.
      const calls = [];
      await openRecipeLibrary(calls, { selectedSystemOverrides: { visibilityMode: 'restricted' } });
      const toAccess = await clickForClearDelta(calls, () => craftingSubitem('Access'), 'Access');
      assert.equal(toAccess.view, 'access', 'arranged: the GM is on Access, where a term is typable');

      const outcome = await clickForClearDelta(
        calls,
        () => navButton('Tags & Categories'),
        'Tags & Categories'
      );
      assert.equal(outcome.view, 'tags');
      assert.equal(outcome.delta, 1, 'Access and Tags are distinct scopes, so the hop clears');
    });

    it('the Recipes -> recipe-edit -> Recipes round trip preserves the search', async () => {
      // The one preserved case, asserted in BOTH directions. `SCOPE_BROWSER_BY_VIEW` maps
      // `recipe-edit` onto `recipes`, so neither hop changes scope.
      const calls = [];
      await openRecipeLibrary(calls);

      const intoEditor = await clickForClearDelta(
        calls,
        () => target.querySelector('[data-recipe-id="r1"] [data-recipe-edit]'),
        'the row Edit action'
      );
      assert.equal(intoEditor.view, 'recipe-edit');
      assert.equal(intoEditor.delta, 0, 'opening the detail editor is inside the library scope');

      const backToLibrary = await clickForClearDelta(
        calls,
        () =>
          Array.from(target.querySelectorAll('.manager-header-actions .manager-button')).find(
            (button) => button.textContent.includes('Back to recipes')
          ),
        'Back to recipes'
      );
      assert.equal(backToLibrary.view, 'recipes');
      assert.equal(backToLibrary.delta, 0, 'and returning from it is too');
    });
  });
}

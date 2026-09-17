/**
 * The manager shell: its three regions, its nav rail groups, and the browse state it lifts.
 *
 * A route module of `manager-mounted.test.js` (issue 1690). It registers its cases INSIDE
 * that file's one `describe` rather than at module scope, so the split keeps the suite
 * name, the compiled manager tree and the one process the 26,709-line file had.
 * `manager-mounted-shared.js` owns the compile and the between-test yield; the mount state
 * below is this module's own, so its locators read its own `target`.
 */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { createManagerExtensionsRegistry } from '../../src/ui/managerExtensions.js';
import { useShippedLocalization } from '../helpers/manager/managerLocalization.js';
import { createStore, downtimeProvider } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { managerComponents, settleBetweenTests } from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element, because the
// module remounts per case and half these cases assign `target` themselves.
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
    // The strip is `aria-hidden` and carries no `columnheader` since issue 1515: the library is a
    // `role="list"` of `role="listitem"` rows, and a column header outside a table names nothing.
    // It is still four VISUAL labels over the four-column grid the rows share.
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
        // The four world scoped-entity leaves (issue 1362), in the prototype's authored order
        // and ABOVE Parties. The lowercase `c` in `Component catalogue`, the plural in
        // `Tools Catalogue` and the exact duplicate of `Tags & Categories` are all authored.
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
    // NO ZERO BADGE (issue 1373). The rail states counts where there is something to count, and
    // the reference draws none beside a row whose section is empty: a `0` there is a badge whose
    // whole content is the absence the row already reads as. This system adopts no Tools, so the
    // assertion is that the badge is ABSENT rather than that it reads zero.
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

    // The Crafting group is unconditional now (v1.3 headline): a live parent route,
    // never a disabled "Soon" placeholder.
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
  //
  // Issue 1036 lifted the Essence Studio's view-state and the test directly above proves it;
  // this block is the same property for the remaining browse surfaces, and it is written as
  // ONE table walked by ONE test body rather than as eight near-identical tests. That is not
  // only economy: the claim IS uniform — "make the surface's state non-default, take the trip
  // that unmounts it, come back and find the state" — and eight copies of it would be eight
  // places for the claim to drift, plus the `tests/**` duplication SonarCloud counts.
  //
  // WHAT COUNTS AS "THE TRIP" DIFFERS BY SURFACE, AND THE TABLE SAYS WHICH. Four of these have
  // an editor route, so the trip is the editor round-trip the issue names. The rest have no
  // editor at all — a realm is authored in the inspector, a vocabulary entry inline, a
  // character's knowledge in place — so what destroyed their state was leaving the route or
  // switching a sub-tab. Both unmount the component, which is the whole of the defect; calling
  // the second one an "editor round-trip" would be a false description of a real trip.
  //
  // EACH ENTRY ALSO PROVES ITS OWN NON-VACUITY: the trip is asserted to have CHANGED the route
  // (or the rendered panel), because a `leave` step that silently did nothing would leave the
  // surface mounted throughout and the restore assertion would pass without a remount.
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
      // Sentence case since issue 1373's parity pass: the design sets this placeholder
      // 'Search tools', and the screen's own page copy is sentence case throughout.
      searchLabel: 'Search tools',
      term: 'Hammer',
      leave: () => navButton('Essence Rules').click(),
      leftView: 'essences',
      back: () => navButton('Tool Rules').click(),
      view: 'tools',
    },
    {
      name: 'the recipe-category vocabulary panel',
      trip: 'switching vocabulary tab and back',
      open: async () => {
        navButton('Tags & Categories').click();
      },
      searchLabel: 'Search recipe categories',
      term: 'Poti',
      // A tab switch UNMOUNTS this panel and mounts the component one: the three are mutually
      // exclusive branches. That is why each panel binds its OWN slot — proved by the sibling
      // assertion below, which finds the component tab's box empty rather than carrying "Poti".
      leave: () => target.querySelector('[data-vocabulary-tab="component"]').click(),
      leftPanel: 'Search component categories',
      back: () => target.querySelector('[data-vocabulary-tab="recipe"]').click(),
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
    });
  }

  it('keeps a gathering task filter, not just its search, across the editor round-trip', async () => {
    // The search box is the axis every surface in the table shares, so it is what the table
    // asserts. A FILTER is a different control writing a different field of the same object,
    // and a lift that carried only `searchTerm` would pass every row above.
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
    // `active` rather than `disabled`: both are non-default, but filtering to `disabled` hides
    // the only enabled task and with it the Edit button this test has to press next.
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
    //
    // WHAT ACTUALLY ENFORCES IT is the editor's task-change effect, keyed on a COMPONENT-LOCAL
    // `lastTaskId`. That sentinel re-initialises to '' on every mount, so re-entry always reads
    // as a task change and always clears all four — which is why the four declared defaults are
    // not what this test measures. Perturbing them alone leaves it green; the guard that would
    // fail it is the one that matters, a term given a home that outlives the mount.
    //
    // The library tool is fixture data, not decoration: the tool picker's search box renders
    // only behind `{#if libraryToolList.length > 0}`, so without it the fourth term is not on
    // screen and the loop below would silently assert over three.
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
    // Experimental OFF (the shipped default): the Crafting group renders and the
    // unimplemented Graph placeholder is hidden. Both assertions run through the real
    // `experimentalFeaturesEnabled` gating derivation, not a stubbed value.
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

    // On Components (a non-crafting route), manually expand the collapsed Crafting
    // group via its toggle.
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
    // FOUR SCREENS UNDER ONE NAME (issue 1328). Gathering is Environments, Tasks, Events and
    // Settings, and its trail named only the group — so all four read `<system> > Gathering` and
    // the trail could not tell a GM which one they were on. Checks already names its own sub-tab;
    // this is that rule applied to the other group that has one.
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

    // A SECOND TAB IS A DIFFERENT TRAIL, which is the whole claim: a crumb that named the group
    // alone would be identical here, and a crumb hard-coded to `Environments` would too.
    target.querySelector('#manager-gathering-nav-tasks').click();
    await tick();
    flushSync();
    assert.deepEqual(crumbs(), ['Crafting Systems', 'Alchemy', 'Gathering', 'Tasks']);
    assert.equal(
      target.querySelector('[data-breadcrumb-gathering-tab]').dataset.breadcrumbGatheringTab,
      'tasks'
    );

    // AND THE GROUP CRUMB IS A LABEL HERE, not a control. One rule decides it, the same one the
    // Downtime tab crumb follows: a crumb is a control when pressing it goes somewhere the GM is
    // not. From the library, `Gathering` names the route already on the screen — returning to it
    // leaves the active tab where it is — so a button would sit there doing nothing. From an
    // editor it really does leave, and the editor trails below draw it as a button.
    assert.equal(
      Array.from(target.querySelectorAll('.manager-breadcrumbs button')).some(
        (button) => button.textContent.trim() === 'Gathering'
      ),
      false,
      'the Gathering crumb offers a press that would go nowhere'
    );
  });

  // ── Rail group expand / collapse (issue 1185) ──────────────────────────────────────────
  //
  // The maintainer's report was that the rail's disclosure groups "sometimes refuse to
  // minimize". "Sometimes" was two defects wearing one face, and both are behavioural rather
  // than visual, so every case below drives the real controls and reads the rendered rail:
  //
  //   * four groups ran an auto-open effect that READ ITS OWN FLAG to guard itself, so a
  //     collapse changed the effect's own dependency, re-ran it, passed the now-false guard
  //     and forced the group straight back open;
  //   * Crafting had the mirror defect — `craftingMenuExpanded = isCraftingRoute` never read
  //     its own flag, so a collapse stuck, but LEAVING the category force-closed a group the
  //     GM had deliberately opened.
  //
  // The rule these pin is the maintainer's: every group collapses in any state, whatever the
  // others are doing, EXCEPT while one of its own rail sub-items is the current view.
  describe('rail group expansion is independent, sticky, and locked only by an active sub-tab', () => {
    // The five groups, each with the disclosure that opens it, the submenu that proves it is
    // open, and the navigation that lands on one of its own sub-items. Written once so a case
    // asserts "every group", not "the four I remembered" — the Downtime group in particular is
    // provider-driven, and nothing in the rule may key off a tab id.
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

    // Every rail navigation here passes `confirmRouteExit`, which is promise-shaped on some
    // branches, so a bare `tick()` would let "the group stayed open" pass for a route change
    // that simply had not landed yet.
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

      // Left EXPANDED. Entering a sub-item records the intent as well as taking the lock, so
      // the group the GM opened by walking into it survives walking back out.
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

      // Left COLLAPSED. The same group, collapsed off-route, is still collapsed after a move —
      // the direction `craftingMenuExpanded = isCraftingRoute` used to get right and the four
      // re-asserting effects used to get wrong.
      railToggle(checks).click();
      await settleRail();
      assert.ok(!isExpanded(checks));

      navButton('Tags & Categories').click();
      await settleRail();
      assert.equal(currentManagerView(), 'tags');
      assert.ok(!isExpanded(checks), 'a collapse survives navigation too');
    });

    // An editor detail route belongs to the group whose sub-item opened it: `recipe-edit` is
    // reached from Recipes and is read as part of Recipes, so it locks Crafting exactly as a
    // rendered rail entry does. That makes all five groups uniform — Gathering already locked
    // throughout `environment-edit` / `gathering-task-edit` / `gathering-event-edit`, and
    // Crafting and Checks were the outliers that released the group when an editor opened.
    //
    // The tail then walks the auto-open effect: leaving the editor re-enters `recipes` by
    // assigning `activeView`, a route into the group that writes no expansion intent of its
    // own, so without that effect the group would snap shut on the NEXT navigation away.
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

    // The Downtime group's children come from whichever provider holds the surface, so its
    // collapse behaviour must be identical for a companion's tab set and for Core's four.
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

  // ---------------------------------------------------------------------------
  // Leaving a library's route clears its search (issue 1462)
  // ---------------------------------------------------------------------------
  //
  // Every case asserts a call DELTA across the ONE click under test, never presence.
  // Presence is forbidden here and that is not style. The root's scope sentinel is SEEDED at
  // declaration so no clear fires at mount, but a presence assertion would still be satisfied
  // by the `systems` -> `recipes` hop each case uses to reach its starting route, and would
  // then pass while the transition actually under test did nothing at all.
  //
  // For the same reason every Recipes-origin case routes `systems` -> `recipes` -> target and
  // asserts it is on `recipes` first. `openTagsScreen` hops `systems` -> `tags` directly and
  // never performs the transition these cases are about.
  describe('route-scoped library search clear', () => {
    function clearCallCount(calls) {
      return calls.filter((call) => call[0] === 'clearLibrarySearches').length;
    }

    function currentManagerView() {
      return target.querySelector('.fabricate-manager').dataset.managerView;
    }

    // Perform ONE click and report the `clearLibrarySearches` delta it produced, plus the
    // route it landed on. Snapshotting immediately before the click is what makes the number
    // attributable to that click and nothing else.
    async function clickForClearDelta(calls, resolveButton, label) {
      const button = resolveButton();
      assert.ok(button, `the navigation target under test is rendered (${label})`);
      const before = clearCallCount(calls);
      button.click();
      await tick();
      flushSync();
      return { delta: clearCallCount(calls) - before, view: currentManagerView() };
    }

    // Mount and route to the recipe library, asserting arrival: a silently missing entry
    // would leave every later assertion reading the previous screen.
    async function openRecipeLibrary(calls, storeOptions = {}) {
      mountManager(calls, { experimentalFeaturesEnabled: true, ...storeOptions });
      craftingParent().click();
      await tick();
      flushSync();
      assert.equal(currentManagerView(), 'recipes', 'the case starts on the recipe library');
    }

    it('mounting calls nothing, because the scope sentinel is seeded at declaration', async () => {
      // The complement of every delta case, and the only assertion that can see the sentinel
      // regress to an unseeded value. Left at a sentinel the effect fires once at mount on
      // EVERY route before any navigation happens — a spurious refresh, and, worse, a call
      // that makes a "was it called?" assertion true for the wrong reason. That is why every
      // other case here measures a delta; this one measures the mount.
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

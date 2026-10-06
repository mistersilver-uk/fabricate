/**
 * The manager page header's breadcrumb trail, one route family per test (issue 1777). The
 * localizer answers with the key, so a crumb wearing its sibling's key is visible here; the
 * rendered copy is pinned by the 38-state census in `tests/components/manager-header-mounted.js`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { headerBreadcrumbs } from '../src/ui/svelte/apps/manager/headerBreadcrumbs.js';

const M = 'FABRICATE.Admin.Manager';
const SYSTEM = Object.freeze({ id: 'alchemy', name: 'Alchemy' });

/** The handler legs, each recording its own name and arguments into `calls`. */
const HANDLERS = Object.freeze([
  'openWorldParties',
  'setView',
  'selectSystemAndShowBrowser',
  'editSystem',
  'openCraftingSection',
  'backToBooksScrolls',
  'backToEssencesBrowse',
  'backToRecipesBrowse',
  'backToComponentsBrowse',
  'backToEnvironmentsBrowse',
  'backToGatheringTaskLibrary',
  'backToGatheringEventLibrary',
]);

function inputFor(route) {
  const calls = [];
  const handlers = Object.fromEntries(
    HANDLERS.map((name) => [
      name,
      (...args) => {
        calls.push([name, ...args]);
      },
    ])
  );
  const input = {
    text: (key) => key,
    header: { title: 'Screen title' },
    selectedSystem: SYSTEM,
    downtimeChromeChannel: {
      reselect: (...args) => {
        calls.push(['reselect', ...args]);
      },
    },
    ...handlers,
    ...route,
  };
  return { input, calls };
}

/**
 * The trail as `[label, hooks, press]` rows: `press` is the handler call one press of the crumb
 * makes, or `null` for a crumb that is not a control.
 */
function trail(route) {
  const { input, calls } = inputFor(route);
  return headerBreadcrumbs(input).map(({ label, onSelect, ...hooks }) => {
    if (!onSelect) return [label, hooks, null];
    calls.length = 0;
    onSelect();
    assert.equal(calls.length, 1, `pressing "${label}" made ${calls.length} handler calls`);
    return [label, hooks, calls[0]];
  });
}

const ROOT = [`${M}.Nav.Systems`, {}, ['selectSystemAndShowBrowser']];
const SYSTEM_CRUMB = ['Alchemy', {}, ['editSystem', 'alchemy']];
const CRAFTING = [`${M}.Nav.Crafting`, {}, ['openCraftingSection', 'recipes']];
const GATHERING = [`${M}.Nav.Environments`, {}, ['backToEnvironmentsBrowse']];
const WORLD = [`${M}.World.Breadcrumb`, { 'data-breadcrumb-world': '' }, ['openWorldParties']];

describe('headerBreadcrumbs', () => {
  it('roots every system route at the library, and names the system below it', () => {
    assert.deepEqual(trail({ currentView: 'systems' }), [ROOT]);
    assert.deepEqual(trail({ currentView: 'recipes', selectedSystem: null }), [
      ROOT,
      CRAFTING,
      [`${M}.Nav.Recipes`, {}, null],
    ]);
    assert.deepEqual(trail({ currentView: 'system-edit' }), [
      ROOT,
      SYSTEM_CRUMB,
      [`${M}.SystemEdit.PageBreadcrumb`, {}, null],
    ]);
  });

  it('draws the Crafting screens under the Crafting group, and their editors under the screen', () => {
    for (const [view, key] of [
      ['recipes', 'Nav.Recipes'],
      ['crafting-settings', 'Crafting.CraftingTabs.Settings'],
      ['access', 'Nav.Access'],
      ['books-scrolls', 'Nav.BooksScrolls'],
      ['knowledge', 'Nav.Knowledge'],
    ]) {
      assert.deepEqual(
        trail({ currentView: view }),
        [ROOT, SYSTEM_CRUMB, CRAFTING, [`${M}.${key}`, {}, null]],
        view
      );
    }
    assert.deepEqual(trail({ currentView: 'recipe-item-edit', recipeItemCrumb: 'Cook Book' }), [
      ROOT,
      SYSTEM_CRUMB,
      CRAFTING,
      [`${M}.Nav.BooksScrolls`, {}, ['backToBooksScrolls']],
      ['Cook Book', { title: 'Cook Book' }, null],
    ]);
    const recipeLeaf = (recipeDraft) => trail({ currentView: 'recipe-edit', recipeDraft }).slice(3);
    assert.deepEqual(recipeLeaf({ name: 'Elixir' }), [
      [`${M}.Nav.Recipes`, {}, ['backToRecipesBrowse']],
      ['Elixir', {}, null],
    ]);
    assert.deepEqual(recipeLeaf(null)[1], [`${M}.Recipe.EditBreadcrumb`, {}, null]);
  });

  it('draws the rules screens directly under the system, and their editors under the screen', () => {
    for (const [view, key] of [
      ['components', 'Nav.ComponentRules'],
      ['tags', 'Nav.TagsCategories'],
      ['essences', 'Nav.EssenceRules'],
    ]) {
      assert.deepEqual(trail({ currentView: view }), [
        ROOT,
        SYSTEM_CRUMB,
        [`${M}.${key}`, {}, null],
      ]);
    }
    assert.deepEqual(trail({ currentView: 'component-edit', componentForEdit: { name: 'Ore' } }), [
      ROOT,
      SYSTEM_CRUMB,
      [`${M}.Nav.ComponentRules`, {}, ['backToComponentsBrowse']],
      ['Ore', {}, null],
    ]);
    assert.deepEqual(
      trail({ currentView: 'component-edit' })[3][0],
      `${M}.Component.EditBreadcrumb`
    );
    assert.deepEqual(trail({ currentView: 'essence-edit', essenceEditName: 'Water' }).slice(2), [
      [`${M}.Nav.EssenceRules`, {}, ['backToEssencesBrowse']],
      ['Water', { title: 'Water' }, null],
    ]);
    assert.deepEqual(trail({ currentView: 'essence-edit', essenceEditName: '' })[3], [
      `${M}.Essence.EditBreadcrumb`,
      { title: '' },
      null,
    ]);
  });

  it('draws Gathering as a span on its own route and as a button in its three editors', () => {
    assert.deepEqual(trail({ currentView: 'environments' }).slice(2), [
      [`${M}.Nav.Environments`, {}, null],
    ]);
    assert.deepEqual(
      trail({
        currentView: 'environments',
        gatheringTabLabel: 'Tasks',
        activeGatheringTab: 'tasks',
      }).slice(2),
      [
        [`${M}.Nav.Environments`, {}, null],
        ['Tasks', { 'data-breadcrumb-gathering-tab': 'tasks' }, null],
      ]
    );
    for (const [view, subject, key, back] of [
      ['environment-edit', 'environmentCrumb', 'Environments', 'backToEnvironmentsBrowse'],
      ['gathering-task-edit', 'gatheringTaskCrumb', 'Tasks', 'backToGatheringTaskLibrary'],
      ['gathering-event-edit', 'gatheringEventCrumb', 'Encounters', 'backToGatheringEventLibrary'],
    ]) {
      assert.deepEqual(
        trail({ currentView: view, [subject]: 'Quiet Cavern' }).slice(2),
        [
          GATHERING,
          [`${M}.Environment.GatheringTabs.${key}`, {}, [back]],
          ['Quiet Cavern', { title: 'Quiet Cavern' }, null],
        ],
        view
      );
    }
  });

  it('names the Checks tab under the Checks group', () => {
    assert.deepEqual(
      trail({ currentView: 'checks-salvage', isChecksRoute: true, checksActiveTab: 'salvage' }),
      [ROOT, SYSTEM_CRUMB, [`${M}.Nav.Checks`, {}, null], [`${M}.Checks.Tabs.Salvage`, {}, null]]
    );
  });

  it('roots the world routes at World, a span only on the hub itself', () => {
    assert.deepEqual(trail({ currentView: 'world', isWorldRoute: true }), [
      [`${M}.World.Breadcrumb`, { 'data-breadcrumb-world': '' }, null],
    ]);
    assert.deepEqual(
      trail({ currentView: 'world-travel', isWorldTravelRoute: true, worldTravelTab: 'map' }),
      [
        WORLD,
        [`${M}.World.TravelNav`, {}, null],
        [`${M}.Travel.Tabs.MapLinks`, { 'data-breadcrumb-world-travel-tab': 'map' }, null],
      ]
    );
    assert.deepEqual(
      trail({ currentView: 'world-travel', isWorldTravelRoute: true, worldTravelTab: 'realms' })[2],
      [`${M}.Travel.Tabs.Realms`, { 'data-breadcrumb-world-travel-tab': 'realms' }, null]
    );
    assert.deepEqual(
      trail({
        currentView: 'world-modifiers',
        isWorldRulesRoute: true,
        worldRulesTab: 'modifiers',
        worldRulesPageTitle: 'Modifiers',
      }),
      [
        WORLD,
        [`${M}.World.RulesNav`, {}, null],
        ['Modifiers', { 'data-breadcrumb-world-rules-tab': 'modifiers' }, null],
      ]
    );
  });

  it('draws a world catalogue as two crumbs and an entry as three, back through the catalogue', () => {
    assert.deepEqual(trail({ currentView: 'world-essences', isWorldScopedRoute: true }), [
      WORLD,
      ['Screen title', { 'data-breadcrumb-world-scoped': 'world-essences' }, null],
    ]);
    const entryRoute = {
      catalogueView: 'world-essences',
      catalogueTitleKey: `${M}.Scoped.Essence.Title`,
      catalogueTitleFallback: 'Essences',
    };
    const entry = (worldScopedEntryCrumb) =>
      trail({
        currentView: 'world-essence-entry',
        isWorldScopedRoute: true,
        worldScopedEntryRoute: entryRoute,
        worldScopedEntryCrumb,
      });
    assert.deepEqual(entry('Water'), [
      WORLD,
      [
        `${M}.Scoped.Essence.Title`,
        { 'data-breadcrumb-world-scoped-catalogue': 'world-essences' },
        ['setView', 'world-essences'],
      ],
      ['Water', { 'data-breadcrumb-world-scoped': 'world-essence-entry', title: 'Water' }, null],
    ]);
    assert.equal(entry('')[2][0], 'Screen title', 'an unnamed entry falls back to the title');
  });

  it('hands the Downtime tab crumb to the tab owner, and adds the companion leaf', () => {
    const downtime = (route) =>
      trail({
        currentView: 'world-downtime',
        isWorldDowntimeRoute: true,
        worldDowntimeTabId: 'crew',
        downtimeTabCrumb: 'Crew',
        ...route,
      });
    assert.deepEqual(downtime({}), [
      WORLD,
      [`${M}.World.Downtime.Title`, {}, null],
      ['Crew', { 'data-breadcrumb-downtime-tab': 'crew' }, null],
    ]);
    assert.deepEqual(
      downtime({ downtimeTabCrumbNavigable: true, downtimeLeafCrumb: 'Marn' }).slice(2),
      [
        ['Crew', { 'data-breadcrumb-downtime-tab': 'crew' }, ['reselect']],
        ['Marn', { 'data-breadcrumb-downtime-leaf': '' }, null],
      ]
    );
  });

  it('gives a crumb only its label, its handler and keys PageHeader forwards', () => {
    const views = [
      { currentView: 'recipe-item-edit', recipeItemCrumb: 'Book' },
      { currentView: 'world-downtime', isWorldDowntimeRoute: true, downtimeLeafCrumb: 'Marn' },
      { currentView: 'environments', gatheringTabLabel: 'Tasks', activeGatheringTab: 'tasks' },
    ];
    for (const route of views) {
      for (const crumb of headerBreadcrumbs(inputFor(route).input)) {
        for (const key of Object.keys(crumb)) {
          assert.match(key, /^(?:label|onSelect|title|data-[a-z-]+)$/u, route.currentView);
        }
      }
    }
  });
});

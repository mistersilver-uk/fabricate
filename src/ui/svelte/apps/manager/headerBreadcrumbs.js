/**
 * The manager page header's breadcrumb trail as `PageHeader` crumbs (issue 1777): the world root or
 * the crafting-system root, then one chain per route. A crumb is `{ label, onSelect? }` plus its
 * `data-*` hooks and `title`, and is a control only when pressing it leaves the screen the GM is
 * on: the Gathering group is a span on `environments` and a button in its editors.
 */

/** A crumb that navigates; `PageHeader` calls `onSelect` with no argument. */
const link = (label, onSelect, hooks = {}) => ({ label, onSelect, ...hooks });

/** A crumb that names where the GM already is. */
const here = (label, hooks = {}) => ({ label, ...hooks });

const WORLD_HOOK = Object.freeze({ 'data-breadcrumb-world': '' });

const isWorldTrail = (input) =>
  input.isWorldRoute ||
  input.isWorldDowntimeRoute ||
  input.isWorldRulesRoute ||
  input.isWorldTravelRoute ||
  input.isWorldScopedRoute;

/** A catalogue is two crumbs and an entry is three; an entry falls back to the screen title. */
function worldScopedCrumbs(input) {
  const { text, header, worldScopedEntryRoute: entry, worldScopedEntryCrumb: crumb } = input;
  const leafHook = { 'data-breadcrumb-world-scoped': input.currentView };
  if (!entry) return [here(header.title, leafHook)];
  return [
    link(
      text(entry.catalogueTitleKey, entry.catalogueTitleFallback),
      () => input.setView(entry.catalogueView),
      { 'data-breadcrumb-world-scoped-catalogue': entry.catalogueView }
    ),
    here(crumb || header.title, { ...leafHook, title: crumb }),
  ];
}

function worldRulesCrumbs({ text, worldRulesTab, worldRulesPageTitle }) {
  return [
    here(text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')),
    here(worldRulesPageTitle, { 'data-breadcrumb-world-rules-tab': worldRulesTab }),
  ];
}

function worldTravelCrumbs({ text, worldTravelTab }) {
  const tab =
    worldTravelTab === 'map'
      ? text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinks', 'Map Region Links')
      : text('FABRICATE.Admin.Manager.Travel.Tabs.Realms', 'Realms');
  return [
    here(text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')),
    here(tab, { 'data-breadcrumb-world-travel-tab': worldTravelTab }),
  ];
}

/** The tab crumb names the tab, so whoever owns the tab owns its navigation. */
function worldDowntimeCrumbs(input) {
  const { text, downtimeTabCrumb, downtimeLeafCrumb } = input;
  const tabHook = { 'data-breadcrumb-downtime-tab': input.worldDowntimeTabId };
  return [
    here(text('FABRICATE.Admin.Manager.World.Downtime.Title', 'Downtime')),
    input.downtimeTabCrumbNavigable
      ? link(downtimeTabCrumb, () => input.downtimeChromeChannel.reselect(), tabHook)
      : here(downtimeTabCrumb, tabHook),
    ...(downtimeLeafCrumb
      ? [here(downtimeLeafCrumb, { 'data-breadcrumb-downtime-leaf': '' })]
      : []),
  ];
}

/** The trail spells `World.Breadcrumb`; the caps `World.Heading` is the rail's own label. */
function worldTrail(input) {
  const world = input.text('FABRICATE.Admin.Manager.World.Breadcrumb', 'World');
  return [
    input.isWorldRoute ? here(world, WORLD_HOOK) : link(world, input.openWorldParties, WORLD_HOOK),
    ...(input.isWorldScopedRoute ? worldScopedCrumbs(input) : []),
    ...(input.isWorldRulesRoute ? worldRulesCrumbs(input) : []),
    ...(input.isWorldTravelRoute ? worldTravelCrumbs(input) : []),
    ...(input.isWorldDowntimeRoute ? worldDowntimeCrumbs(input) : []),
  ];
}

function systemTrail({
  text,
  currentView,
  selectedSystem,
  selectSystemAndShowBrowser,
  editSystem,
}) {
  const root = link(
    text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems'),
    selectSystemAndShowBrowser
  );
  if (!selectedSystem || currentView === 'systems') return [root];
  return [root, link(selectedSystem.name, () => editSystem(selectedSystem.id))];
}

const crafting = ({ text, openCraftingSection }) =>
  link(text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting'), () =>
    openCraftingSection('recipes')
  );

/** Gathering is four screens under one name, so its editors keep the group crumb. */
const gathering = ({ text, backToEnvironmentsBrowse }) =>
  link(text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering'), backToEnvironmentsBrowse);

/** A Crafting screen: the group, then the screen's own name. */
const craftingScreen = (key, fallback) => (input) => [
  crafting(input),
  here(input.text(key, fallback)),
];

/** A screen directly under the system, named once. */
const systemScreen = (key, fallback) => (input) => [here(input.text(key, fallback))];

/** An editor's leaf names its record, titled so a truncated name stays readable. */
const recordLeaf = (name) => here(name, { title: name });

/** Each route's chain after the root, keyed by route token. */
const ROUTE_CRUMBS = Object.freeze({
  recipes: craftingScreen('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes'),
  'crafting-settings': craftingScreen(
    'FABRICATE.Admin.Manager.Crafting.CraftingTabs.Settings',
    'Settings'
  ),
  access: craftingScreen('FABRICATE.Admin.Manager.Nav.Access', 'Access'),
  'books-scrolls': craftingScreen('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls'),
  knowledge: craftingScreen('FABRICATE.Admin.Manager.Nav.Knowledge', 'Knowledge'),
  'recipe-item-edit': (input) => [
    crafting(input),
    link(
      input.text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls'),
      input.backToBooksScrolls
    ),
    recordLeaf(input.recipeItemCrumb),
  ],
  'recipe-edit': (input) => [
    crafting(input),
    link(input.text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes'), input.backToRecipesBrowse),
    here(
      input.recipeDraft?.name ||
        input.text('FABRICATE.Admin.Manager.Recipe.EditBreadcrumb', 'Edit recipe')
    ),
  ],
  components: systemScreen('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules'),
  'component-edit': ({ text, componentForEdit, backToComponentsBrowse }) => [
    link(
      text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules'),
      backToComponentsBrowse
    ),
    here(
      componentForEdit?.name ||
        text('FABRICATE.Admin.Manager.Component.EditBreadcrumb', 'Edit component')
    ),
  ],
  tags: systemScreen('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories'),
  essences: systemScreen('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules'),
  'essence-edit': ({ text, essenceEditName, backToEssencesBrowse }) => [
    link(text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules'), backToEssencesBrowse),
    here(
      essenceEditName || text('FABRICATE.Admin.Manager.Essence.EditBreadcrumb', 'Edit essence'),
      {
        title: essenceEditName,
      }
    ),
  ],
  environments: ({ text, gatheringTabLabel, activeGatheringTab }) => [
    here(text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')),
    ...(gatheringTabLabel
      ? [here(gatheringTabLabel, { 'data-breadcrumb-gathering-tab': activeGatheringTab })]
      : []),
  ],
  'environment-edit': (input) => [
    gathering(input),
    link(
      input.text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments', 'Environments'),
      input.backToEnvironmentsBrowse
    ),
    recordLeaf(input.environmentCrumb),
  ],
  'gathering-task-edit': (input) => [
    gathering(input),
    link(
      input.text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks', 'Tasks'),
      input.backToGatheringTaskLibrary
    ),
    recordLeaf(input.gatheringTaskCrumb),
  ],
  'gathering-event-edit': (input) => [
    gathering(input),
    link(
      input.text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters', 'Events'),
      input.backToGatheringEventLibrary
    ),
    recordLeaf(input.gatheringEventCrumb),
  ],
  'system-edit': systemScreen(
    'FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb',
    'System Overview'
  ),
});

function checksCrumbs({ text, checksActiveTab }) {
  const tab = `${checksActiveTab[0].toUpperCase()}${checksActiveTab.slice(1)}`;
  return [
    here(text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')),
    here(text(`FABRICATE.Admin.Manager.Checks.Tabs.${tab}`, checksActiveTab)),
  ];
}

/**
 * @param {object} input The route predicates, crumb subjects and navigation handlers the shell
 *   hands `ManagerPageHeader`, with `text(key, fallback)` and the `headerModel` as `header`.
 * @returns {object[]} The trail, root first.
 */
export function headerBreadcrumbs(input) {
  let route = [];
  if (input.isChecksRoute) route = checksCrumbs(input);
  else if (Object.hasOwn(ROUTE_CRUMBS, input.currentView)) {
    route = ROUTE_CRUMBS[input.currentView](input);
  }
  return [...(isWorldTrail(input) ? worldTrail(input) : systemTrail(input)), ...route];
}

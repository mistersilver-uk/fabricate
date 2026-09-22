/**
 * What the manager's page header says on every route (issue 1720). The expected answers below are
 * transcribed from the shell's own `viewKicker`, `viewTitle`, `viewSubtitle` and
 * `headerActionsLabel` as they stood at `b581be315`, before the move, so this is an oracle rather
 * than a re-reading of the module it tests.
 *
 * The localizer here answers with the KEY, which is the fact this suite owns: a route wearing its
 * sibling's key renders plausible copy and is invisible to a string assertion. The rendered
 * sentences are pinned separately by the DOM census in `tests/components/manager-header-mounted.js`.
 *
 * Every input is a `SvelteMap` read, because the model's deriveds must be invalidated by the
 * caller's own source as the shell's route `$derived`s are; a plain-object fixture is read once
 * and cached forever, which would make every liveness assertion here vacuous.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';
import {
  CHECKS_REDIRECT_VIEW,
  CHECKS_VIEWS,
  activeChecksTab,
  isChecksRoute,
} from '../src/ui/svelte/apps/manager/checks/checksNav.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/headerModel.svelte.js';

const WORLD_SCOPED_VIEWS = [
  'world-components',
  'world-component-entry',
  'world-essences',
  'world-essence-entry',
  'world-tools',
  'world-tool-entry',
  'world-vocabulary',
];
const WORLD_RULES_VIEWS = ['world-currency', 'world-prerequisites', 'world-modifiers'];

const SYSTEM_ACTIONS = 'FABRICATE.Admin.Manager.SystemActions';
const COMPONENT_ACTIONS = 'FABRICATE.Admin.Manager.Component.Actions';
const ESSENCE_ACTIONS = 'FABRICATE.Admin.Manager.Essence.Actions';
const ENVIRONMENT_ACTIONS = 'FABRICATE.Admin.Manager.Environment.Actions';

/** The sentinels the fixture injects for the four answers that never reach the localizer. */
const SYSTEM_NAME = 'Alchemy';
const WORLD_RULES_TITLE = 'World rules page title';
const RECIPE_SUBLINE = 'recipe edit subline';
const COMPONENT_SUBLINE = 'component edit subline';
const chrome = (field) => `chrome:${field}`;

/**
 * One row per route: the six answers the shell asked for, against the fixture below — no draft,
 * no world record, every counted collection empty, the travel tab on realms and the gathering tab
 * on environments.
 */
const ROUTES = Object.freeze({
  systems: {
    kicker: 'FABRICATE.Admin.Manager.Browse',
    title: 'FABRICATE.Admin.Manager.Title',
    subtitle: 'FABRICATE.Admin.Manager.SystemLibraryHint',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  recipes: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Recipe.Title',
    subtitle: 'FABRICATE.Admin.Manager.Recipe.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Recipe.Actions',
    actionsFamily: 'crafting',
  },
  'recipe-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Recipe.EditTitle',
    subtitle: RECIPE_SUBLINE,
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'crafting',
  },
  'recipe-item-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.RecipeItem.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.RecipeItem.EditSubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'crafting',
  },
  'books-scrolls': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.BooksScrolls.Title',
    subtitle: 'FABRICATE.Admin.Manager.BooksScrolls.Subtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  'crafting-settings': {
    kicker: SYSTEM_NAME,
    title: 'FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle',
    subtitle: 'FABRICATE.Admin.Manager.Crafting.Settings.Subtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  access: {
    kicker: SYSTEM_NAME,
    title: 'FABRICATE.Admin.Manager.Access.Title',
    subtitle: 'FABRICATE.Admin.Manager.Access.Hint',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  knowledge: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Knowledge.Title',
    subtitle: 'FABRICATE.Admin.Manager.Knowledge.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Knowledge.Actions',
    actionsFamily: 'crafting',
  },
  components: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Nav.ComponentRules',
    subtitle: 'FABRICATE.Admin.Manager.Component.ListSubtitle',
    actionsLabel: COMPONENT_ACTIONS,
    actionsFamily: 'crafting',
  },
  'component-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Component.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.Component.EditSubtitle',
    actionsLabel: COMPONENT_ACTIONS,
    actionsFamily: 'crafting',
  },
  tags: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.TagsCategories.Title',
    subtitle: 'FABRICATE.Admin.Manager.TagsCategories.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.TagsCategories.Actions',
    actionsFamily: 'crafting',
  },
  essences: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Nav.EssenceRules',
    subtitle: 'FABRICATE.Admin.Manager.Essence.Subtitle',
    actionsLabel: ESSENCE_ACTIONS,
    actionsFamily: 'crafting',
  },
  'essence-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Essence.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.Essence.EditNoSourceSubtitle',
    actionsLabel: ESSENCE_ACTIONS,
    actionsFamily: 'crafting',
  },
  environments: {
    kicker: SYSTEM_NAME,
    title: 'FABRICATE.Admin.Manager.Environment.Library',
    subtitle: 'FABRICATE.Admin.Manager.Environment.LibraryHint',
    actionsLabel: ENVIRONMENT_ACTIONS,
    actionsFamily: 'gathering',
  },
  'environment-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Environment.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.Environment.EditSubtitle',
    actionsLabel: ENVIRONMENT_ACTIONS,
    actionsFamily: 'gathering',
  },
  'gathering-task-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Environment.Tasks.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.Environment.Tasks.EditSubtitle',
    actionsLabel: ENVIRONMENT_ACTIONS,
    actionsFamily: 'gathering',
  },
  'gathering-event-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Environment.Events.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.Environment.Events.EditSubtitle',
    actionsLabel: ENVIRONMENT_ACTIONS,
    actionsFamily: 'gathering',
  },
  tools: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Tools.Title',
    subtitle: 'FABRICATE.Admin.Manager.Tools.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Tools.Actions',
    actionsFamily: 'none',
  },
  'tool-edit': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Tools.EditTitle',
    subtitle: 'FABRICATE.Admin.Manager.Tools.EditSubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    headingVariant: 'none',
    actionsFamily: 'none',
  },
  'system-edit': {
    kicker: '',
    title: SYSTEM_NAME,
    subtitle: 'FABRICATE.Admin.Manager.SystemEdit.PageSubtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.SystemEdit.Actions',
    actionsFamily: 'world',
  },
  world: {
    kicker: 'FABRICATE.Admin.Manager.World.PartiesKicker',
    title: 'FABRICATE.Admin.Manager.World.PartiesTitle',
    subtitle: 'FABRICATE.Admin.Manager.World.Parties.SubtitleEmpty',
    actionsLabel: 'FABRICATE.Admin.Manager.World.PartiesActions',
    actionsFamily: 'world',
  },
  'world-components': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueSubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'none',
  },
  'world-component-entry': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.ComponentEntryTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.ComponentEntrySubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  'world-essences': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueSubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  'world-essence-entry': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.EssenceEntrySubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  'world-tools': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'none',
  },
  'world-tool-entry': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.ToolEntryTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.ToolEntrySubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'world',
  },
  'world-vocabulary': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Scoped.VocabularyTitle',
    subtitle: 'FABRICATE.Admin.Manager.Scoped.VocabularySubtitle',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'none',
  },
  'world-currency': {
    kicker: '',
    title: WORLD_RULES_TITLE,
    subtitle: 'FABRICATE.Admin.Manager.World.Currency.SubtitleEmpty',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'none',
  },
  'world-prerequisites': {
    kicker: '',
    title: WORLD_RULES_TITLE,
    subtitle: 'FABRICATE.Admin.Manager.World.Prerequisites.SubtitleEmpty',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'none',
  },
  'world-modifiers': {
    kicker: '',
    title: WORLD_RULES_TITLE,
    subtitle: 'FABRICATE.Admin.Manager.World.Modifiers.SubtitleEmpty',
    actionsLabel: SYSTEM_ACTIONS,
    actionsFamily: 'none',
  },
  'world-travel': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Travel.RealmsTitle',
    subtitle: 'FABRICATE.Admin.Manager.Travel.RealmsHint',
    actionsLabel: 'FABRICATE.Admin.Manager.Travel.RealmsActions',
    actionsFamily: 'world',
  },
  // The one route whose three answers come from the companion channel rather than the localizer.
  'world-downtime': {
    kicker: '',
    title: chrome('title'),
    subtitle: chrome('subtitle'),
    actionsLabel: chrome('actionsLabel'),
    actionsFamily: 'world',
  },
  [CHECKS_REDIRECT_VIEW]: {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Checks.Crafting.PageTitle',
    subtitle: 'FABRICATE.Admin.Manager.Checks.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Checks.Actions',
    actionsFamily: 'crafting',
  },
  'checks-crafting': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Checks.Crafting.PageTitle',
    subtitle: 'FABRICATE.Admin.Manager.Checks.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Checks.Actions',
    actionsFamily: 'crafting',
  },
  'checks-salvage': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Checks.Salvage.PageTitle',
    subtitle: 'FABRICATE.Admin.Manager.Checks.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Checks.Actions',
    actionsFamily: 'crafting',
  },
  'checks-gathering': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Checks.Gathering.PageTitle',
    subtitle: 'FABRICATE.Admin.Manager.Checks.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Checks.Actions',
    actionsFamily: 'crafting',
  },
  'checks-validation': {
    kicker: '',
    title: 'FABRICATE.Admin.Manager.Checks.Validation.Title',
    subtitle: 'FABRICATE.Admin.Manager.Checks.Subtitle',
    actionsLabel: 'FABRICATE.Admin.Manager.Checks.Actions',
    actionsFamily: 'crafting',
  },
});

/** The eight identity headings, each against the one record or draft that selects it. */
const HEADING_VARIANTS = [
  ['recipe-edit', { recipeDraft: { name: 'Elixir' } }, 'recipe-edit'],
  ['component-edit', { componentForEdit: { name: 'Vial' } }, 'component-edit'],
  ['world-downtime', { downtimeHeaderArtwork: { icon: 'fas fa-star' } }, 'downtime-artwork'],
  ['world-essence-entry', { worldEssenceEntryRecord: { id: 'water' } }, 'world-essence-entry'],
  ['essence-edit', { essenceRulesMode: true }, 'essence-edit-rules'],
  ['world-component-entry', { worldComponentEntryRecord: { id: 'vial' } }, 'world-component-entry'],
  ['world-tool-entry', { worldToolEntryRecord: { id: 'pick' } }, 'world-tool-entry'],
  ['recipes', {}, 'default'],
  ['tool-edit', {}, 'none'],
];

describe('headerModel', () => {
  let compiler;
  let createHeaderModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-header-model-');
    ({ createHeaderModel } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /**
   * One model over a live input table. `inputs` is a `SvelteMap`, so a test that writes to it
   * invalidates the model's deriveds exactly as the shell's own `$derived`s do.
   */
  function openModel(view, overrides = {}) {
    const inputs = new SvelteMap(
      Object.entries({
        currentView: view,
        selectedSystem: { name: SYSTEM_NAME },
        worldTravelTab: 'realms',
        displayedGatheringTab: 'environments',
        gatheringTabPageTitle: '',
        gatheringTabPageHint: '',
        worldRulesPageTitle: WORLD_RULES_TITLE,
        recipeDraft: null,
        componentForEdit: null,
        componentSalvageModeLabel: 'Manual',
        showEssenceSourceUi: false,
        downtimeHeaderArtwork: null,
        worldEssenceEntryRecord: null,
        essenceRulesMode: false,
        worldComponentEntryRecord: null,
        worldToolEntryRecord: null,
        travelParties: [],
        enabledPartyCount: 0,
        assignedCharacterCount: 0,
        playerCharacterUuids: new Set(),
        selectedCurrencyUnits: [],
        currencyEnabledSystemCount: 0,
        allSystems: [],
        selectedCharacterPrerequisites: [],
        selectedSystemModifiers: [],
        ...overrides,
      })
    );
    const read = (name) => () => inputs.get(name);
    const routeOf = () => String(inputs.get('currentView'));
    const model = createHeaderModel({
      route: {
        currentView: read('currentView'),
        checksActiveTab: () => activeChecksTab(routeOf()) || 'crafting',
        displayedGatheringTab: read('displayedGatheringTab'),
        isChecksRoute: () => isChecksRoute(routeOf()),
        isWorldDowntimeRoute: () => routeOf() === 'world-downtime',
        isWorldRulesRoute: () => WORLD_RULES_VIEWS.includes(routeOf()),
        isWorldScopedRoute: () => WORLD_SCOPED_VIEWS.includes(routeOf()),
        worldTravelTab: read('worldTravelTab'),
      },
      state: {
        allSystems: read('allSystems'),
        assignedCharacterCount: read('assignedCharacterCount'),
        componentEditSubtitle: () => () => COMPONENT_SUBLINE,
        componentForEdit: read('componentForEdit'),
        componentSalvageModeLabel: read('componentSalvageModeLabel'),
        currencyEnabledSystemCount: read('currencyEnabledSystemCount'),
        downtimeChrome: () => chrome,
        downtimeHeaderArtwork: read('downtimeHeaderArtwork'),
        enabledPartyCount: read('enabledPartyCount'),
        essenceRulesMode: read('essenceRulesMode'),
        format: () => (key) => key,
        gatheringTabPageHint: read('gatheringTabPageHint'),
        gatheringTabPageTitle: read('gatheringTabPageTitle'),
        playerCharacterUuids: read('playerCharacterUuids'),
        recipeDraft: read('recipeDraft'),
        recipeEditSubtitle: () => () => RECIPE_SUBLINE,
        selectedCharacterPrerequisites: read('selectedCharacterPrerequisites'),
        selectedCurrencyUnits: read('selectedCurrencyUnits'),
        selectedSystem: read('selectedSystem'),
        selectedSystemModifiers: read('selectedSystemModifiers'),
        showEssenceSourceUi: read('showEssenceSourceUi'),
        text: () => (key) => key,
        travelParties: read('travelParties'),
        worldComponentEntryRecord: read('worldComponentEntryRecord'),
        worldEssenceEntryRecord: read('worldEssenceEntryRecord'),
        worldRulesPageTitle: read('worldRulesPageTitle'),
        worldToolEntryRecord: read('worldToolEntryRecord'),
      },
    });
    return { model, inputs };
  }

  const answersOf = (model) => ({
    kicker: model.kicker,
    title: model.title,
    subtitle: model.subtitle,
    actionsLabel: model.actionsLabel,
    headingVariant: model.headingVariant,
    actionsFamily: model.actionsFamily,
  });

  it('answers all six slots for every route the shell routes to', () => {
    const observed = {};
    const expected = {};
    for (const [view, row] of Object.entries(ROUTES)) {
      const { model } = openModel(view);
      observed[view] = answersOf(model);
      expected[view] = { headingVariant: 'default', ...row };
    }
    assert.deepEqual(observed, expected);
  });

  it('covers every Checks view the rail routes to, and the redirect', () => {
    for (const view of [CHECKS_REDIRECT_VIEW, ...CHECKS_VIEWS]) {
      assert.ok(Object.hasOwn(ROUTES, view), `the table states nothing for ${view}`);
    }
  });

  it('gives every route a DISTINCT title, apart from the four routes that share one on purpose', () => {
    const byTitle = new Map();
    for (const [view, row] of Object.entries(ROUTES)) {
      byTitle.set(row.title, [...(byTitle.get(row.title) ?? []), view]);
    }
    const shared = [...byTitle.entries()]
      .filter(([, views]) => views.length > 1)
      .map(([title, views]) => `${title}: ${views.join(', ')}`)
      .sort();
    assert.deepEqual(shared, [
      'FABRICATE.Admin.Manager.Checks.Crafting.PageTitle: checks, checks-crafting',
      `${WORLD_RULES_TITLE}: world-currency, world-prerequisites, world-modifiers`,
    ]);
  });

  it('selects each identity heading from the record or draft that owns it', () => {
    for (const [view, overrides, expected] of HEADING_VARIANTS) {
      const { model } = openModel(view, overrides);
      assert.equal(model.headingVariant, expected, `${view} drew the wrong identity heading`);
    }
  });

  it('routes the world scoped entry editors back inside the actions gate, catalogues aside', () => {
    const family = (view) => openModel(view).model.actionsFamily;
    assert.deepEqual(
      WORLD_SCOPED_VIEWS.map(family),
      ['none', 'world', 'world', 'world', 'none', 'world', 'none'],
      'the three entry editors and the essence catalogue are the re-admitted four'
    );
  });

  it('counts the four world aggregate ledes by what the page holds', () => {
    const cases = [
      ['world', { travelParties: [1] }, 'FABRICATE.Admin.Manager.World.Parties.SubtitleOne'],
      ['world', { travelParties: [1, 2] }, 'FABRICATE.Admin.Manager.World.Parties.Subtitle'],
      [
        'world-currency',
        { selectedCurrencyUnits: [1] },
        'FABRICATE.Admin.Manager.World.Currency.SubtitleOne',
      ],
      [
        'world-currency',
        { selectedCurrencyUnits: [1, 2] },
        'FABRICATE.Admin.Manager.World.Currency.Subtitle',
      ],
      [
        'world-prerequisites',
        { selectedCharacterPrerequisites: [1] },
        'FABRICATE.Admin.Manager.World.Prerequisites.SubtitleOne',
      ],
      [
        'world-prerequisites',
        { selectedCharacterPrerequisites: [1, 2] },
        'FABRICATE.Admin.Manager.World.Prerequisites.Subtitle',
      ],
      [
        'world-modifiers',
        { selectedSystemModifiers: [1] },
        'FABRICATE.Admin.Manager.World.Modifiers.SubtitleOne',
      ],
      [
        'world-modifiers',
        { selectedSystemModifiers: [1, 2] },
        'FABRICATE.Admin.Manager.World.Modifiers.Subtitle',
      ],
    ];
    for (const [view, overrides, expected] of cases) {
      assert.equal(openModel(view, overrides).model.subtitle, expected, `${view} miscounted`);
    }
  });

  it('titles the tab on screen, not the route, on the three routes that do', () => {
    const travel = openModel('world-travel', { worldTravelTab: 'map' }).model;
    assert.equal(travel.title, 'FABRICATE.Admin.Manager.Travel.MapLinksTitle');
    assert.equal(travel.subtitle, 'FABRICATE.Admin.Manager.Travel.MapLinksHint');
    assert.equal(travel.actionsLabel, 'FABRICATE.Admin.Manager.Travel.MapLinksActions');

    const gathering = openModel('environments', {
      gatheringTabPageTitle: 'Gathering Tasks',
      gatheringTabPageHint: 'Browse gathering tasks.',
      displayedGatheringTab: 'tasks',
    }).model;
    assert.equal(gathering.title, 'Gathering Tasks');
    assert.equal(gathering.subtitle, 'Browse gathering tasks.');
    assert.equal(
      gathering.actionsLabel,
      'FABRICATE.Admin.Manager.Environment.Tasks.Actions',
      'the tasks tab is the one gathering tab with an action-group name of its own'
    );
  });

  it('names the selected system where the route heads itself with the record', () => {
    const { model, inputs } = openModel('system-edit');
    assert.equal(model.title, SYSTEM_NAME);

    inputs.set('selectedSystem', null);
    flushSync();
    assert.equal(
      model.title,
      'FABRICATE.Admin.Manager.SystemEdit.Nav',
      'with no system selected the route falls back to its own name'
    );
    assert.equal(model.kicker, '', 'and system-edit never wears an eyebrow');
  });

  it('follows a route change live, rather than the route it was built on', () => {
    const { model, inputs } = openModel('systems');
    assert.equal(model.title, 'FABRICATE.Admin.Manager.Title');
    assert.equal(model.actionsFamily, 'world');

    inputs.set('currentView', 'recipes');
    flushSync();
    assert.equal(model.title, 'FABRICATE.Admin.Manager.Recipe.Title');
    assert.equal(model.kicker, '', 'the library eyebrow goes with the library');
    assert.equal(model.actionsFamily, 'crafting');
  });

  it('follows a draft appearing under it, which is what opens the identity heading', () => {
    const { model, inputs } = openModel('recipe-edit');
    assert.equal(model.headingVariant, 'default');

    inputs.set('recipeDraft', { name: 'Elixir' });
    flushSync();
    assert.equal(model.headingVariant, 'recipe-edit');

    inputs.set('recipeDraft', null);
    flushSync();
    assert.equal(model.headingVariant, 'default', 'and closes again when the draft is dropped');
  });

  it('follows the essence source gate, which picks between two ledes on one route', () => {
    const { model, inputs } = openModel('essence-edit');
    assert.equal(model.subtitle, 'FABRICATE.Admin.Manager.Essence.EditNoSourceSubtitle');

    inputs.set('showEssenceSourceUi', true);
    flushSync();
    assert.equal(model.subtitle, 'FABRICATE.Admin.Manager.Essence.EditSubtitle');
  });
});

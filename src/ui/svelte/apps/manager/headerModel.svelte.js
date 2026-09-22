/**
 * What the manager's page header says on one route: its eyebrow, title, lede, action-group name,
 * identity-heading variant and action family, one derivation each (issue 1720). Every input is a
 * thunk, so the shell's `$derived` values are read inside this module's own `$derived.by` rather
 * than captured once at construction.
 */
import { interpolate } from './checks/checksCopy.js';
import { componentListSubtitle } from './scoped/componentScoped.js';

// A lookup over four whole keys rather than one template ending at the `Checks` segment.
const CHECKS_ROUTE_TITLE_KEYS = {
  crafting: 'FABRICATE.Admin.Manager.Checks.Crafting.PageTitle',
  salvage: 'FABRICATE.Admin.Manager.Checks.Salvage.PageTitle',
  gathering: 'FABRICATE.Admin.Manager.Checks.Gathering.PageTitle',
  validation: 'FABRICATE.Admin.Manager.Checks.Validation.Title',
};

/** The routes whose lede is one localized sentence, as `[key, fallback]`. */
const SUBTITLE_KEYS = {
  recipes: [
    'FABRICATE.Admin.Manager.Recipe.Subtitle',
    'Manage recipes for the selected crafting system.',
  ],
  // The lede states the outcome rather than the mechanism (issue 1515).
  'crafting-settings': [
    'FABRICATE.Admin.Manager.Crafting.Settings.Subtitle',
    'Control how players get access to the recipes in this system.',
  ],
  access: [
    'FABRICATE.Admin.Manager.Access.Hint',
    'Grant individual recipes to specific characters or players. Only granted recipes are visible to them.',
  ],
  // The one sentence on the system library telling a GM what to do with it (issue 1515).
  systems: [
    'FABRICATE.Admin.Manager.SystemLibraryHint',
    'Select a row to view counts and enabled features.',
  ],
  'books-scrolls': [
    'FABRICATE.Admin.Manager.BooksScrolls.Subtitle',
    'Review every recipe item in this system with its linked recipes and open one to set its use and learn caps.',
  ],
  knowledge: [
    'FABRICATE.Admin.Manager.Knowledge.Subtitle',
    'Audit and correct what each character carries and has learned in the selected crafting system.',
  ],
  'recipe-item-edit': [
    'FABRICATE.Admin.Manager.RecipeItem.EditSubtitle',
    'Link a world item and recipes, then set its use and learn caps.',
  ],
  tags: [
    'FABRICATE.Admin.Manager.TagsCategories.Subtitle',
    'Manage recipe category and item tag vocabulary for the selected crafting system.',
  ],
  tools: [
    'FABRICATE.Admin.Manager.Tools.Subtitle',
    'Manage reusable gathering tools and configure how they behave when required by tasks.',
  ],
  'tool-edit': [
    'FABRICATE.Admin.Manager.Tools.EditSubtitle',
    'Configure Tool identity, breakage, requirements, and validation.',
  ],
  'environment-edit': [
    'FABRICATE.Admin.Manager.Environment.EditSubtitle',
    'Edit scene linkage, identity, tasks, events, tools, and validation for the selected environment.',
  ],
  'gathering-task-edit': [
    'FABRICATE.Admin.Manager.Environment.Tasks.EditSubtitle',
    'Edit identity, availability, resolution, and results for the selected gathering task.',
  ],
  'gathering-event-edit': [
    'FABRICATE.Admin.Manager.Environment.Events.EditSubtitle',
    'Edit identity, availability, danger, and modifiers for the selected event.',
  ],
  'system-edit': [
    'FABRICATE.Admin.Manager.SystemEdit.PageSubtitle',
    'Edit base settings and review validation issues for the selected crafting system.',
  ],
};

/** The routes whose header actions the crafting family owns, in the order the ladder tests them. */
const CRAFTING_ACTION_VIEWS = [
  'recipes',
  'recipe-edit',
  'recipe-item-edit',
  'components',
  'knowledge',
  'component-edit',
  'tags',
  'essences',
  'essence-edit',
];

/** The same, for the gathering family; they also share one action-group name. */
const GATHERING_ACTION_VIEWS = [
  'environments',
  'environment-edit',
  'gathering-task-edit',
  'gathering-event-edit',
];

/** The routes whose eyebrow names the selected crafting system rather than a fixed word. */
const SYSTEM_NAMED_KICKER_VIEWS = ['access', 'crafting-settings', 'environments'];

/** The page header's eyebrow, one per route (issue 1515); the empty string draws none. */
function viewKicker({ currentView, selectedSystem, text }) {
  if (currentView === 'systems') return text('FABRICATE.Admin.Manager.Browse', 'Browse');
  if (currentView === 'world')
    return text('FABRICATE.Admin.Manager.World.PartiesKicker', 'WORLD / every system');
  if (SYSTEM_NAMED_KICKER_VIEWS.includes(currentView))
    return selectedSystem?.name || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system');
  return '';
}

function viewTitle({
  currentView,
  checksActiveTab,
  downtimeChrome,
  gatheringTabPageTitle,
  isChecksRoute,
  isWorldRulesRoute,
  selectedSystem,
  text,
  worldRulesPageTitle,
  worldTravelTab,
}) {
  if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Title', 'Recipes');
  if (currentView === 'recipe-edit')
    return text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe');
  if (currentView === 'crafting-settings')
    return text(
      'FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle',
      'Crafting settings'
    );
  if (currentView === 'access')
    return text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access');
  if (currentView === 'books-scrolls')
    return text('FABRICATE.Admin.Manager.BooksScrolls.Title', 'Books & Scrolls');
  if (currentView === 'knowledge')
    return text('FABRICATE.Admin.Manager.Knowledge.Title', 'Knowledge');
  if (currentView === 'recipe-item-edit')
    return text('FABRICATE.Admin.Manager.RecipeItem.EditTitle', 'Edit recipe item');
  if (currentView === 'components')
    return text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules');
  if (currentView === 'component-edit')
    return text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component');
  if (currentView === 'tags')
    return text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories');
  if (currentView === 'essences')
    return text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules');
  if (currentView === 'essence-edit')
    return text('FABRICATE.Admin.Manager.Essence.EditTitle', 'Edit essence');
  // The Gathering family titles itself after the tab on screen, as the Downtime route does.
  if (currentView === 'environments')
    return (
      gatheringTabPageTitle ||
      text('FABRICATE.Admin.Manager.Environment.Library', 'Gathering environments')
    );
  if (currentView === 'world')
    return text('FABRICATE.Admin.Manager.World.PartiesTitle', 'World Parties');
  // The seven world scoped-entity titles are the prototype's verbatim, lowercase `c` and plural
  // `Tools` included; `manager-contract.test.js` cross-checks each against its page's own key.
  if (currentView === 'world-components')
    return text('FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle', 'Component catalogue');
  if (currentView === 'world-component-entry')
    return text('FABRICATE.Admin.Manager.Scoped.ComponentEntryTitle', 'Component entry');
  if (currentView === 'world-essences')
    return text('FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle', 'Essence Catalogue');
  if (currentView === 'world-essence-entry')
    return text('FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle', 'Essence entry');
  if (currentView === 'world-tools')
    return text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle', 'Tools Catalogue');
  if (currentView === 'world-tool-entry')
    return text('FABRICATE.Admin.Manager.Scoped.ToolEntryTitle', 'Tool entry');
  if (currentView === 'world-vocabulary')
    return text('FABRICATE.Admin.Manager.Scoped.VocabularyTitle', 'Tags & Categories');
  if (isWorldRulesRoute) return worldRulesPageTitle;
  if (currentView === 'world-travel') {
    if (worldTravelTab === 'map')
      return text('FABRICATE.Admin.Manager.Travel.MapLinksTitle', 'Map Region Links');
    return text('FABRICATE.Admin.Manager.Travel.RealmsTitle', 'Realms');
  }
  if (currentView === 'world-downtime')
    return downtimeChrome(
      'title',
      'Downtime',
      text('FABRICATE.Admin.Manager.World.Downtime.Title', 'Downtime')
    );
  if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Title', 'Tools');
  if (currentView === 'tool-edit')
    return text('FABRICATE.Admin.Manager.Tools.EditTitle', 'Edit Tool');
  if (isChecksRoute) return text(CHECKS_ROUTE_TITLE_KEYS[checksActiveTab], 'Checks');
  if (currentView === 'environment-edit')
    return text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment');
  if (currentView === 'gathering-task-edit')
    return text('FABRICATE.Admin.Manager.Environment.Tasks.EditTitle', 'Edit gathering task');
  if (currentView === 'gathering-event-edit')
    return text('FABRICATE.Admin.Manager.Environment.Events.EditTitle', 'Edit gathering event');
  // The record, not the route (issue 1515).
  if (currentView === 'system-edit')
    return (
      selectedSystem?.name || text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')
    );
  return text('FABRICATE.Admin.Manager.Title', 'Crafting systems');
}

// One derivation per world scoped-entity route, so a page and the placeholder body inside it
// cannot drift into saying two different things.
function worldScopedSubtitle({ currentView, text }) {
  if (currentView === 'world-components')
    return text('FABRICATE.Admin.Manager.Scoped.ComponentCatalogueSubtitle', '');
  if (currentView === 'world-component-entry')
    return text('FABRICATE.Admin.Manager.Scoped.ComponentEntrySubtitle', '');
  if (currentView === 'world-essences')
    return text('FABRICATE.Admin.Manager.Scoped.EssenceCatalogueSubtitle', '');
  if (currentView === 'world-essence-entry')
    return text('FABRICATE.Admin.Manager.Scoped.EssenceEntrySubtitle', '');
  if (currentView === 'world-tools')
    return text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle', '');
  if (currentView === 'world-tool-entry')
    return text('FABRICATE.Admin.Manager.Scoped.ToolEntrySubtitle', '');
  if (currentView === 'world-vocabulary')
    return text('FABRICATE.Admin.Manager.Scoped.VocabularySubtitle', '');
  return '';
}

/** The four world routes whose lede counts what the page holds, `null` for any other route. */
function worldAggregateSubtitle({
  allSystems,
  assignedCharacterCount,
  currencyEnabledSystemCount,
  currentView,
  enabledPartyCount,
  playerCharacterUuids,
  selectedCharacterPrerequisites,
  selectedCurrencyUnits,
  selectedSystemModifiers,
  text,
  travelParties,
}) {
  if (currentView === 'world') {
    if (travelParties.length === 0)
      return text(
        'FABRICATE.Admin.Manager.World.Parties.SubtitleEmpty',
        'No parties yet · world-level, shared by gathering and travel in every system'
      );
    const template =
      travelParties.length === 1
        ? text(
            'FABRICATE.Admin.Manager.World.Parties.SubtitleOne',
            '1 party · {enabled} enabled · {assigned} of {total} characters assigned'
          )
        : text(
            'FABRICATE.Admin.Manager.World.Parties.Subtitle',
            '{count} parties · {enabled} enabled · {assigned} of {total} characters assigned'
          );
    return template
      .replace('{count}', String(travelParties.length))
      .replace('{enabled}', String(enabledPartyCount))
      .replace('{assigned}', String(assignedCharacterCount))
      .replace('{total}', String(playerCharacterUuids.size));
  }
  if (currentView === 'world-currency') {
    if (selectedCurrencyUnits.length === 0)
      return text(
        'FABRICATE.Admin.Manager.World.Currency.SubtitleEmpty',
        'No coins yet · world-level, shared by every crafting system that enables currency'
      );
    const template =
      selectedCurrencyUnits.length === 1
        ? text(
            'FABRICATE.Admin.Manager.World.Currency.SubtitleOne',
            '1 coin · used by {systems} of {total} crafting systems'
          )
        : text(
            'FABRICATE.Admin.Manager.World.Currency.Subtitle',
            '{count} coins · used by {systems} of {total} crafting systems'
          );
    return template
      .replace('{count}', String(selectedCurrencyUnits.length))
      .replace('{systems}', String(currencyEnabledSystemCount))
      .replace('{total}', String(allSystems.length));
  }
  if (currentView === 'world-prerequisites') {
    const count = selectedCharacterPrerequisites.length;
    const template =
      count === 0
        ? text(
            'FABRICATE.Admin.Manager.World.Prerequisites.SubtitleEmpty',
            'No prerequisites yet · shared by every crafting system'
          )
        : count === 1
          ? text(
              'FABRICATE.Admin.Manager.World.Prerequisites.SubtitleOne',
              '1 prerequisite · shared by every crafting system'
            )
          : text(
              'FABRICATE.Admin.Manager.World.Prerequisites.Subtitle',
              '{count} prerequisites · shared by every crafting system'
            );
    return template.replace('{count}', String(count));
  }
  if (currentView === 'world-modifiers') {
    const count = selectedSystemModifiers.length;
    const template =
      count === 0
        ? text(
            'FABRICATE.Admin.Manager.World.Modifiers.SubtitleEmpty',
            'No modifiers yet · shared by every crafting system'
          )
        : count === 1
          ? text(
              'FABRICATE.Admin.Manager.World.Modifiers.SubtitleOne',
              '1 modifier · shared by every crafting system'
            )
          : text(
              'FABRICATE.Admin.Manager.World.Modifiers.Subtitle',
              '{count} modifiers · shared by every crafting system'
            );
    return template.replace('{count}', String(count));
  }
  return null;
}

function viewSubtitle(inputs) {
  const {
    componentEditSubtitle,
    componentForEdit,
    componentSalvageModeLabel,
    currentView,
    downtimeChrome,
    format,
    gatheringTabPageHint,
    isChecksRoute,
    isWorldScopedRoute,
    recipeEditSubtitle,
    selectedSystem,
    showEssenceSourceUi,
    text,
    worldTravelTab,
  } = inputs;
  if (isWorldScopedRoute) return worldScopedSubtitle(inputs);
  if (currentView === 'recipe-edit') return recipeEditSubtitle();
  // Issue 1371, parity round 4.
  if (currentView === 'components')
    return componentListSubtitle(
      { systemName: selectedSystem?.name || '', salvageModeLabel: componentSalvageModeLabel },
      format
    );
  if (currentView === 'component-edit' && componentForEdit) return componentEditSubtitle();
  if (currentView === 'component-edit')
    return text(
      'FABRICATE.Admin.Manager.Component.EditSubtitle',
      'Update tags, essences, and source linkage for this component.'
    );
  // The lede states the screen's three facts (issue 1372): what the list holds, and what
  // disabling actually stops.
  if (currentView === 'essences')
    return interpolate(
      text(
        'FABRICATE.Admin.Manager.Essence.Subtitle',
        'What each essence does on craft in {system}. Disabling stops the crafting effect — ingredient matching still sees the value. Names, icons and colours come from the Essence Catalogue.'
      ),
      { system: selectedSystem?.name || '' }
    );
  if (currentView === 'essence-edit' && showEssenceSourceUi)
    return text(
      'FABRICATE.Admin.Manager.Essence.EditSubtitle',
      'Update identity, icon, and source linkage for this essence.'
    );
  if (currentView === 'essence-edit')
    return text(
      'FABRICATE.Admin.Manager.Essence.EditNoSourceSubtitle',
      'Update identity and icon for this essence.'
    );
  const aggregate = worldAggregateSubtitle(inputs);
  if (aggregate !== null) return aggregate;
  if (currentView === 'world-downtime')
    return downtimeChrome(
      'subtitle',
      'Fabricate Premium · Your party-wide command board for every activity and shared project.',
      ''
    );
  if (currentView === 'world-travel') {
    if (worldTravelTab === 'map')
      return text(
        'FABRICATE.Admin.Manager.Travel.MapLinksHint',
        'Link the active scene’s Foundry Scene Regions to the world’s realms.'
      );
    return text(
      'FABRICATE.Admin.Manager.Travel.RealmsHint',
      'Author the world’s realms · shared by every crafting system that enables Travel & Realms.'
    );
  }
  if (isChecksRoute)
    return text(
      'FABRICATE.Admin.Manager.Checks.Subtitle',
      'Configure how crafting, salvage, and gathering attempts are checked for the selected crafting system.'
    );
  // Per tab, from the rail's own record — see `gatheringTabPageTitle` (issue 1515).
  if (currentView === 'environments')
    return (
      gatheringTabPageHint ||
      text(
        'FABRICATE.Admin.Manager.Environment.LibraryHint',
        'Browse scene-linked gathering environments and open the existing editor for task authoring.'
      )
    );
  if (Object.hasOwn(SUBTITLE_KEYS, currentView)) {
    const keyed = SUBTITLE_KEYS[currentView];
    return text(keyed[0], keyed[1]);
  }
  return text(
    'FABRICATE.Admin.Manager.Subtitle',
    'Manage the system definitions that organize Fabricate components, recipes, gathering, and feature rules.'
  );
}

/** The accessible name of the header's action group, which renders even when it holds nothing. */
function headerActionsLabel({
  currentView,
  displayedGatheringTab,
  downtimeChrome,
  isChecksRoute,
  text,
  worldTravelTab,
}) {
  if (currentView === 'recipes')
    return text('FABRICATE.Admin.Manager.Recipe.Actions', 'Recipe actions');
  if (currentView === 'components' || currentView === 'component-edit')
    return text('FABRICATE.Admin.Manager.Component.Actions', 'Component actions');
  if (currentView === 'tags')
    return text('FABRICATE.Admin.Manager.TagsCategories.Actions', 'Tags and categories actions');
  if (currentView === 'essences' || currentView === 'essence-edit')
    return text('FABRICATE.Admin.Manager.Essence.Actions', 'Essence actions');
  if (currentView === 'environments' && displayedGatheringTab === 'tasks')
    return text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions');
  if (currentView === 'world')
    return text('FABRICATE.Admin.Manager.World.PartiesActions', 'World party actions');
  if (currentView === 'world-downtime')
    return downtimeChrome(
      'actionsLabel',
      'Downtime actions',
      text('FABRICATE.Admin.Manager.World.Downtime.Actions', 'Downtime actions')
    );
  if (currentView === 'world-travel')
    return worldTravelTab === 'map'
      ? text('FABRICATE.Admin.Manager.Travel.MapLinksActions', 'Map region link actions')
      : text('FABRICATE.Admin.Manager.Travel.RealmsActions', 'Realm actions');
  if (currentView === 'tools')
    return text('FABRICATE.Admin.Manager.Tools.Actions', 'Tools actions');
  if (currentView === 'knowledge')
    return text('FABRICATE.Admin.Manager.Knowledge.Actions', 'Knowledge actions');
  if (isChecksRoute) return text('FABRICATE.Admin.Manager.Checks.Actions', 'Checks actions');
  if (GATHERING_ACTION_VIEWS.includes(currentView))
    return text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions');
  if (currentView === 'system-edit')
    return text('FABRICATE.Admin.Manager.SystemEdit.Actions', 'System edit actions');
  return text('FABRICATE.Admin.Manager.SystemActions', 'System actions');
}

/**
 * Which identity heading the route draws, in the order its branches are tested: `default` is the
 * plain title-and-lede pair, and `none` is the one route that draws no heading at all.
 */
function headingVariantFor({
  componentForEdit,
  currentView,
  downtimeHeaderArtwork,
  essenceRulesMode,
  isWorldDowntimeRoute,
  recipeDraft,
  worldComponentEntryRecord,
  worldEssenceEntryRecord,
  worldToolEntryRecord,
}) {
  if (currentView === 'recipe-edit' && recipeDraft) return 'recipe-edit';
  if (currentView === 'component-edit' && componentForEdit) return 'component-edit';
  if (isWorldDowntimeRoute && downtimeHeaderArtwork) return 'downtime-artwork';
  if (worldEssenceEntryRecord) return 'world-essence-entry';
  if (currentView === 'essence-edit' && essenceRulesMode) return 'essence-edit-rules';
  if (worldComponentEntryRecord) return 'world-component-entry';
  if (worldToolEntryRecord) return 'world-tool-entry';
  if (currentView !== 'tool-edit') return 'default';
  return 'none';
}

/**
 * Which group of routes owns this one's header actions, or `none` where the group renders empty.
 * This names a set of header controls, and is unrelated to the design system's Rail Marker Family.
 */
function actionsFamilyFor({ currentView, isChecksRoute, isWorldRulesRoute, isWorldScopedRoute }) {
  const visible =
    (currentView !== 'tools' &&
      currentView !== 'tool-edit' &&
      !isWorldRulesRoute &&
      !isWorldScopedRoute) ||
    currentView === 'world-essences' ||
    currentView === 'world-essence-entry' ||
    currentView === 'world-tool-entry' ||
    currentView === 'world-component-entry';
  if (!visible) return 'none';
  if (isChecksRoute || CRAFTING_ACTION_VIEWS.includes(currentView)) return 'crafting';
  if (GATHERING_ACTION_VIEWS.includes(currentView)) return 'gathering';
  return 'world';
}

/**
 * @param {object} seams
 * @param {object} seams.route Thunks for the route token, its predicates and its tab selections.
 * @param {object} seams.state Thunks for everything else the six answers read, the shell's own
 *   `text`, `format` and per-route subtitle helpers included.
 */
export function createHeaderModel({ route, state } = {}) {
  // Read inside each `$derived.by`, so every answer depends on the caller's own sources directly.
  const read = (bag) =>
    Object.fromEntries(Object.entries(bag ?? {}).map(([name, thunk]) => [name, thunk()]));
  const inputs = () => ({ ...read(route), ...read(state) });

  const kicker = $derived.by(() => viewKicker(inputs()));
  const title = $derived.by(() => viewTitle(inputs()));
  const subtitle = $derived.by(() => viewSubtitle(inputs()));
  const actionsLabel = $derived.by(() => headerActionsLabel(inputs()));
  const headingVariant = $derived.by(() => headingVariantFor(inputs()));
  const actionsFamily = $derived.by(() => actionsFamilyFor(inputs()));

  return {
    get kicker() {
      return kicker;
    },
    get title() {
      return title;
    },
    get subtitle() {
      return subtitle;
    },
    get actionsLabel() {
      return actionsLabel;
    },
    get headingVariant() {
      return headingVariant;
    },
    get actionsFamily() {
      return actionsFamily;
    },
  };
}

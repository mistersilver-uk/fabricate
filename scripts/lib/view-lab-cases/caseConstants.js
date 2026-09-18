/**
 * The app ids, default geometry, shared field sets and shared `sourceMatches` patterns the case
 * data files declare their cases with.
 */

export const PLAYER = 'fabricate-app';
export const MANAGER = 'fabricate-crafting-system-manager';

// Only the recomposed Journal's reachable render surfaces claim its frames.
export const JOURNAL_SOURCES =
  /^src\/ui\/svelte\/apps\/journal\/(?:(?:ActionsPanel|ActiveRunsList|HistoricalRunDetail|HistoryList|HistoryRow|JournalFactRow|JournalListShell|JournalView|RunCard|RunDetail|StepDetails|ThisRun|TimeRemainingBox)\.svelte|(?:journalRunStatus|historyPresentation)\.js)$/;

/** The three GM canvas windows (issue 1520). */
export const CANVAS_BROWSER = 'fabricate-interactable-browser';
export const CANVAS_CONFIG = 'fabricate-interactable-config';
export const CANVAS_MANAGER = 'fabricate-interactables-manager';

/** The three, as a set, for the surface key and the readership predicate. */
export const CANVAS_APPS = Object.freeze([CANVAS_BROWSER, CANVAS_CONFIG, CANVAS_MANAGER]);

/**
 * The shared bulk-edit chrome (issue 1010): the selection toolbar and the panel shell, section and
 * select the Component Studio and the Recipe Studio both render.
 */
export const BULK_EDIT_CHROME_PATTERN =
  /^src\/ui\/svelte\/apps\/manager\/Bulk(?:SelectionToolbar|EditPanelShell|EditSection|EditSelect|StagingInset)\.svelte$/;

/**
 * The shared bulk-DELETE card (issue 1132): the heading, impact statement, standing hint and armed
 * control every studio's set delete renders.
 */
export const BULK_DELETE_CARD_PATTERN = /^src\/ui\/svelte\/apps\/manager\/BulkDeleteCard\.svelte$/;

/** The trigger set the three `manager-recipes-bulk-edit*` frames share (issue 1010). */
export const RECIPE_BULK_EDIT_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/Recipe/,
  /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
  BULK_EDIT_CHROME_PATTERN,
  /^src\/ui\/model\/recipeBulkEditModel\.js$/,
];

/** The trigger set the ten system Tool Rules list frames share (issue 1373). */
export const TOOL_LIST_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/ToolsBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBrowserInspector\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
];

/** The trigger set every system Tool rules editor frame shares (issue 1373). */
export const TOOL_EDITOR_SHELL_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/ToolEditorTabs\.svelte$/,
];

/**
 * The literal typed into the World Tools Catalogue's search field by `world-tool-catalogue-search`,
 * and the literal typed into it by `world-tool-catalogue-filtered-empty`.
 */
export const WORLD_TOOL_SEARCH_TERM = 'rune';

/** @type {string} */
export const WORLD_TOOL_SEARCH_MISS_TERM = 'quenching trough';

/**
 * The literal typed into the World > Parties search field by
 * `manager-world-parties-search-filtered`.
 */
export const WORLD_PARTIES_SEARCH_TERM = 'wagon';

/**
 * The literal typed into the Access route's players roster search by
 * `manager-access-recipe-roster-no-match`.
 */
export const ACCESS_ROSTER_SEARCH_MISS_TERM = 'zzz-no-such-user';

/** The player crafting app, split by which resolution mode's body a file belongs to. */
const CRAFTING_MODE_FILES = Object.freeze({
  simple: ['SimpleRecipeBody', 'StepRequirementsList'],
  routedByIngredients: ['IngredientRoutedBody'],
  routedByCheck: ['RoutedByCheckBody', 'OutcomeTierTable'],
  progressive: ['ProgressiveBody', 'ProgressiveStageList'],
});

/** The one not-yet-ready chrome all five player views draw (issue 1514). */
export const PLAYER_VIEW_STATE = /^src\/ui\/svelte\/apps\/PlayerViewState\.svelte$/;

/** Everything under `crafting/` that is NOT one mode's own body. Applies to every crafting case. */
export const CRAFTING_SHARED = new RegExp(
  '^src/ui/svelte/apps/crafting/(?!detail/(' +
    Object.values(CRAFTING_MODE_FILES).flat().join('|') +
    String.raw`)\.svelte$)`
);

/** The body files one resolution mode owns. */
function craftingMode(mode) {
  return new RegExp(
    '^src/ui/svelte/apps/crafting/detail/(' +
      CRAFTING_MODE_FILES[mode].join('|') +
      String.raw`)\.svelte$`
  );
}

export const CRAFTING_SIMPLE = craftingMode('simple');
export const CRAFTING_ROUTED_INGREDIENTS = craftingMode('routedByIngredients');
export const CRAFTING_ROUTED_CHECK = craftingMode('routedByCheck');
export const CRAFTING_PROGRESSIVE = craftingMode('progressive');

/** Bulk salvage / bulk destroy (issue 859): the fields every one of its cases shares. */
export const BULK_DEFAULTS = Object.freeze({
  reaches: 'beyond',
  smokeLabels: [],
  query: { tab: 'inventory' },
  kinds: ['player', 'inventory', 'bulk'],
  sourceMatches: [
    /^src\/ui\/svelte\/apps\/inventory\//,
    /^src\/ui\/svelte\/stores\/inventory/,
    /^src\/ui\/svelte\/stores\/playerResultOrder/,
    /^src\/ui\/svelte\/util\/salvageYieldRows\.js$/,
    /^src\/utils\/progressiveResultOrder\.js$/,
  ],
});

/** Each app's default window geometry. */
export const DEFAULT_POSITION = Object.freeze({
  [MANAGER]: Object.freeze({ width: 1280, height: 820 }),
  [PLAYER]: Object.freeze({ width: 1280, height: 860 }),
  // The three canvas windows are captured at their declared size, unlike the Manager and the player app.
  [CANVAS_BROWSER]: Object.freeze({ width: 420, height: 620 }),
  [CANVAS_CONFIG]: Object.freeze({ width: 480, height: 680 }),
  [CANVAS_MANAGER]: Object.freeze({ width: 560, height: 680 }),
});

/**
 * The player companion surface (issue 1198): the route key its frames address, the rail control
 * that addresses it, and the render files those frames are evidence about.
 */
export const PLAYER_EXTENSION_ROUTE = 'ext:downtime:projects';
export const PLAYER_EXTENSION_RAIL_BUTTON = `[data-player-nav-tab="${PLAYER_EXTENSION_ROUTE}"]`;
export const PLAYER_EXTENSION_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/PlayerExtensionHost\.svelte$/,
  /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
  /^src\/ui\/playerExtensions\.js$/,
  /^src\/ui\/playerNavModel\.js$/,
  /^src\/ui\/extensionRegistry\.js$/,
]);

/** The shared positioning seam every open popover frame draws (issue 1500). */
export const ANCHORED_POPOVER_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/actions\/anchoredPopover\.js$/,
  /^src\/ui\/svelte\/util\/overlayBounds\.js$/,
]);

/** The environment editor's directory, minus its validation tab (issue 1517). */
export const ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB =
  /^src\/ui\/svelte\/apps\/manager\/environment\/(?!EnvironmentValidationTab\.svelte$)/;

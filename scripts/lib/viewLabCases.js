/**
 * The canonical View Lab case registry: one entry per captured PNG, naming a window and the state
 * to drive it to rather than a component.
 *
 * `sourceMatches` turns a diff into a capture list, directory-anchored rather than file-anchored.
 * Signals too broad to attribute to one window map to a small representative set instead of the
 * whole corpus, and a change to one of the lab's own inputs selects one frame per surface
 * ({@link LAB_SURFACE_CASES}). See {@link mapChangedFilesToCases} and {@link labSurfaceKey}.
 *
 * The attribution walk carries a `{keys, unattributable}` pair at every level and merges both
 * halves of its children's pairs, so no level can return a value meaning "forget what you found".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { managerPrimitiveNamesByEvidence } from './designSystemPrimitives.js';

const PLAYER = 'fabricate-app';
const MANAGER = 'fabricate-crafting-system-manager';

// Only the recomposed Journal's reachable render surfaces claim its frames.
// Retained legacy components outside the window's import closure cannot supply evidence.
const JOURNAL_SOURCES =
  /^src\/ui\/svelte\/apps\/journal\/(?:(?:ActionsPanel|ActiveRunsList|HistoricalRunDetail|HistoryList|HistoryRow|JournalFactRow|JournalListShell|JournalView|RunCard|RunDetail|StepDetails|ThisRun|TimeRemainingBox)\.svelte|(?:journalRunStatus|historyPresentation)\.js)$/;

/** The three GM canvas windows (issue 1520). */
const CANVAS_BROWSER = 'fabricate-interactable-browser';
const CANVAS_CONFIG = 'fabricate-interactable-config';
const CANVAS_MANAGER = 'fabricate-interactables-manager';

/** The three, as a set, for the surface key and the readership predicate. */
const CANVAS_APPS = Object.freeze([CANVAS_BROWSER, CANVAS_CONFIG, CANVAS_MANAGER]);

/** Files that can change what a window looks like. */
const UI_PATH_PATTERN = /^(src\/ui\/|styles\/)|\.(svelte|css)$/;

/**
 * The harness's own inputs: the fixture world every frame renders from, the page that mounts it,
 * the Foundry shim it renders against, its capture and layout-assertion helpers, and this registry.
 */
const LAB_INFRASTRUCTURE_PATTERN =
  /^(tests\/view-lab\/|scripts\/lib\/viewLab(?:Cases|LayoutAssertion)\.js$|scripts\/lib\/foundryChromeSpec\.js$|scripts\/view-lab-screenshots\.mjs$)/;

/** This registry's own path, as a diff names it. */
const REGISTRY_PATH = 'scripts/lib/viewLabCases.js';

/** The helper that enforces the opt-in responsive layout contract. */
const LAYOUT_ASSERTION_PATH = 'scripts/lib/viewLabLayoutAssertion.js';

/** The lab's actor fixture, as a diff names it. Attributed by fixture table — see below. */
const LAB_ACTORS_PATH = 'tests/view-lab/world/labActors.js';

/** The page that mounts every frame, as a diff names it. Attributed by marked region — see below. */
const LAB_MOUNT_PATH = 'tests/view-lab/mount.js';

/** The lab's interactables fixture, as a diff names it. Attributed whole-file — see below. */
const LAB_INTERACTABLES_PATH = 'tests/view-lab/world/labInteractables.js';

/**
 * It carries a `{keys, unattributable}` pair at every level of the attribution walk — from one
 * candidate anchor, up through a hunk's candidates, a patch's hunks, an input's patch, and a
 * change's inputs — and each level merges both halves of its children's pairs.
 */

/**
 * Signals too broad to attribute to one window. A shared primitive or a global stylesheet can
 * affect every window, so selecting every case would make the evidence set useless noise.
 */
const MANAGER_PRIMITIVES = managerPrimitiveNamesByEvidence('broad');

/**
 * The shared bulk-edit chrome (issue 1010): the selection toolbar and the panel shell, section and
 * select the Component Studio and the Recipe Studio both render.
 */
const BULK_EDIT_CHROME_PATTERN =
  /^src\/ui\/svelte\/apps\/manager\/Bulk(?:SelectionToolbar|EditPanelShell|EditSection|EditSelect|StagingInset)\.svelte$/;

/**
 * The shared bulk-DELETE card (issue 1132): the heading, impact statement, standing hint and armed
 * control every studio's set delete renders.
 */
const BULK_DELETE_CARD_PATTERN = /^src\/ui\/svelte\/apps\/manager\/BulkDeleteCard\.svelte$/;

/** The trigger set the three `manager-recipes-bulk-edit*` frames share (issue 1010). */
const RECIPE_BULK_EDIT_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/Recipe/,
  /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
  BULK_EDIT_CHROME_PATTERN,
  /^src\/ui\/model\/recipeBulkEditModel\.js$/,
];

/** The trigger set the ten system Tool Rules list frames share (issue 1373). */
const TOOL_LIST_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/ToolsBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBrowserInspector\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
];

/** The trigger set every system Tool rules editor frame shares (issue 1373). */
const TOOL_EDITOR_SHELL_MATCHES = [
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

export const BROAD_SIGNAL_PATTERN = new RegExp(
  [
    '^styles/',
    '^src/ui/svelte/components/',
    String.raw`^src/ui/theme\.js$`,
    String.raw`^src/ui/svelte/apps/manager/(${MANAGER_PRIMITIVES.join('|')})\.svelte$`,
  ].join('|')
);

/** Deliberate visible states that a broad primitive's representative pair does not contain. */
export const BROAD_SIGNAL_CASE_OVERRIDES = Object.freeze({
  // Issue 1648: each run control maps to a state that actually renders it.
  'src/ui/svelte/components/RunActionBar.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-cancel-confirmation',
    'fabricate-journal-lifecycle-paused',
  ]),
  'src/ui/svelte/components/WorldClockChip.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
  ]),
  'src/ui/svelte/components/SlotRow.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'fabricate-journal-lifecycle-material-shortage',
  ]),
  'src/ui/svelte/components/SlotTile.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'fabricate-journal-lifecycle-material-shortage',
  ]),
  'src/ui/svelte/components/ChoiceOptionList.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
  ]),
  'src/ui/svelte/components/EssencePool.svelte': Object.freeze([
    'fabricate-journal-lifecycle-essence-shared',
  ]),
  'src/ui/svelte/components/RunProgress.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
  ]),
  'src/ui/svelte/components/StageNav.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
    'fabricate-journal-lifecycle-future-stage',
  ]),
  // `HistoricalRunDetail.svelte:168` renders this card too, so a change to its inset or its region
  // rhythm moves the multi-stage history cards as well as the active ones — and the three active
  // frames alone would publish evidence that does not show it.
  'src/ui/svelte/components/StageCard.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-past-stage',
    'fabricate-journal-lifecycle-future-stage',
    'fabricate-journal-lifecycle-claim-retained',
    'fabricate-journal-lifecycle-history-multi-success',
  ]),
  'src/ui/svelte/components/ListRow.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-finished-success',
    'fabricate-journal-lifecycle-gathering-d100',
    'fabricate-journal-lifecycle-gathering-check',
  ]),
  // The preview scale, plus the two historical branches no other frame draws: recorded per-row
  // rolls with no global cut, and a recorded shared roll that cannot cut because one row's
  // outcome was never recorded.
  'src/ui/svelte/components/YieldScale.svelte': Object.freeze([
    'fabricate-journal-lifecycle-gathering-d100',
    'fabricate-journal-history-data-legacy-row-rolls-1240',
    'fabricate-journal-history-data-unknown-material-resolution-1240',
  ]),
  'src/ui/svelte/components/OutcomeLadder.svelte': Object.freeze([
    'fabricate-journal-lifecycle-gathering-check',
  ]),
  // The shared icon picker (issue 1269).
  'src/ui/svelte/components/IconPicker.svelte': Object.freeze(['manager-system-edit-lists']),
  // The most-used control in the app, and until issue 1378 it published no frame that renders one.
  'src/ui/svelte/components/Stepper.svelte': Object.freeze(['manager-gathering-economy-actors']),
  // The manager's one selection box, whose `sm` size has exactly one caller and is absent from both
  // representative frames: `manager-components-normal` and `fabricate-app-shell` draw the browse
  // row's `lg` box and nothing else.
  'src/ui/svelte/components/SelectionCheckbox.svelte': Object.freeze([
    'manager-tool-prerequisites-selected-1280x720',
  ]),
  // The app's one art tile (issue 1506), which is the change that earned it an entry.
  'src/ui/svelte/components/Medallion.svelte': Object.freeze(['world-component-entry-essences']),
  // The manager's on/off switch (issue 1040), and the one entry here whose three frames are chosen
  // per host rather than per state.
  'src/ui/svelte/components/StatusToggle.svelte': Object.freeze([
    'manager-system-edit-normal',
    'coverage-mode-routed-check-checks',
    'manager-tool-parity-04-requirements-1280x720',
  ]),
  // Both band-strip frames, for the same two-mode reasoning `SearchablePopover` carries below.
  'src/ui/svelte/components/ThresholdBandStrip.svelte': Object.freeze([
    'manager-checks-simple-two-band-strip',
    'coverage-mode-routed-check-checks',
  ]),
  // The manager's labelled form field (issue 1428), on 81 call sites across 23 components — and in
  // neither representative frame.
  'src/ui/svelte/components/Field.svelte': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-system-edit-normal',
  ]),
  // The manager's icon-only button (issue 1422). 36 callers, and the representative pair does reach
  // it — but only ever in its neutral state.
  'src/ui/svelte/components/IconButton.svelte': Object.freeze([
    'world-modifiers',
    'manager-environment-edit-blind-weights',
  ]),
  // The manager's filter bar (issue 1039), extracted from 11 hand-written `class="manager-toolbar"`
  // sections.
  'src/ui/svelte/components/ManagerToolbar.svelte': Object.freeze([
    'world-component-catalogue',
    'manager-environments-browse-normal',
  ]),
  // The manager's search field (issue 1039).
  'src/ui/svelte/components/ManagerSearchField.svelte': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-knowledge-owned-copies',
  ]),
  // The manager's card shell (issue 1427), extracted from 80 hand-written
  // `class="manager-inspector-card"` sections.
  'src/ui/svelte/components/InspectorCard.svelte': Object.freeze([
    'manager-essences-disabled-in-use',
    'coverage-mode-routed-check-checks',
  ]),
  // The percentage slider (issue 1508), and the entry closes a gap that the source-match route
  // could not: this component is under `components/`, so the directory leg of
  // `BROAD_SIGNAL_PATTERN` claims it and `selectRenderFileCases` never consults any case's
  // `sourceMatches` for it at all.
  'src/ui/svelte/components/ChanceSlider.svelte': Object.freeze(['world-tool-entry']),
  // An actor's portrait (issue 1506), and the first entry in this table gained by a primitive
  // arriving rather than by an extraction leaving one state unphotographed.
  'src/ui/svelte/components/Avatar.svelte': Object.freeze(['manager-knowledge-owned-copies']),
  // The editor tab strip (issue 1509), and the first key this table gains because a component moved
  // rather than because one acquired a state its frames could not reach.
  'src/ui/svelte/components/EditorTabs.svelte': Object.freeze([
    'manager-system-edit-normal',
    'manager-recipe-item-overview',
    'manager-recipe-item-validation',
    'manager-checks-section-badged-and-dotted',
    'manager-environment-edit-events',
    'manager-knowledge-learned-lost-copy',
  ]),
  // The editor validation surface (issue 1444).
  'src/ui/svelte/components/EditorValidationSurface.svelte': Object.freeze([
    'manager-checks-validation',
    'manager-recipe-item-validation-blocked',
    'manager-recipe-edit-validation',
    'manager-checks-validation-retired-placeholder',
  ]),
  // The shared empty panel.
  'src/ui/svelte/components/EmptyState.svelte': Object.freeze([
    'manager-systems-empty',
    'world-tool-entry-on-break-repair-tag-picker-empty',
    'world-tool-catalogue-filtered-empty',
    'manager-gathering-task-availability-feedback-normal',
    'manager-gathering-task-availability-feedback-narrow',
    'manager-gathering-event-availability-feedback-normal',
    'manager-gathering-event-availability-feedback-narrow',
  ]),
  // Both parties pickers, because between them they are the primitive's two modes and neither
  // renders the other's chrome.
  'src/ui/svelte/components/ItemDropZone.svelte': Object.freeze([
    'world-tool-catalogue-list-head',
    'world-tool-entry-overview',
    'world-tool-entry-unlinked',
    'world-tool-entry-source-missing',
  ]),
  // The radio-card group (issue 1373).
  'src/ui/svelte/components/RadioCardGroup.svelte': Object.freeze([
    'world-tool-entry-requirements',
    'manager-tool-parity-03-breakage-1280x720',
  ]),
  // The titled status card (issue 1509), and it gains an override in the same commit that moves it.
  'src/ui/svelte/components/ToggleCard.svelte': Object.freeze(['manager-recipe-edit-normal']),
  // A third entry as of issue 1458, and it is a third mode rather than a third instance.
  'src/ui/svelte/components/SearchablePopover.svelte': Object.freeze([
    'manager-world-parties-actor-picker',
    'manager-world-parties-realm-override-picker',
    'manager-gathering-task-availability-menu',
    'player-actor-picker',
    'manager-recipe-edit-tag-picker',
    'world-tool-entry-on-break-repair-tag-picker-empty',
    'manager-recipe-edit-ingredients-or-menu',
    // An eighth, and it is the primitive's grid list form (issue 1503).
    'manager-essences-source-picker',
    // A ninth AND A tenth, and they are the primitive's multi-select mode and the one caller that
    // stays open without it (issue 1513).
    'player-crafting-sources-picker',
    'manager-recipe-item-contents-picker',
  ]),
  // The app's own select (issue 1504), whose panel is drawn by the primitive above and whose whole
  // subject — the option list — exists only while it is open.
  'src/ui/svelte/components/Select.svelte': Object.freeze([
    'manager-recipes-bulk-edit-check-tier',
    'player-inventory-page-size',
    'interactables-manager-region-open',
  ]),
  // The essence source picker (issue 1503), whose panel moved wholesale onto the primitive above —
  // a new backdrop rung, `--fab-shadow-lg`, a 10px radius, the primitive's search row and list, and
  // the shared two-column template in place of a caller rule.
  'src/ui/svelte/components/EssenceSourceSelector.svelte': Object.freeze([
    'manager-essences-source-picker',
  ]),
  // The overflow action menu (issue 1477), extracted from four hand-rolled `role="menu"` blocks in
  // the environment editor and one `SearchablePopover` in the component editor that was announcing
  // two commands as selectable options.
  'src/ui/svelte/components/ActionMenu.svelte': Object.freeze([
    'manager-environment-edit-automatic-force-add',
    'manager-systems-row-menu-open',
  ]),
  // The pill multi-select (issue 1458), whose add menu became a `SearchablePopover` in the same
  // change.
  'src/ui/svelte/components/ModifierPillSelect.svelte': Object.freeze([
    'manager-recipe-edit-crafting-modifier-cap-reached',
  ]),
  // The uppercase micro-label (issue 1505), on sixteen converted eyebrow sites across nine files.
  'src/ui/svelte/components/Kicker.svelte': Object.freeze([
    'player-crafting-slot-rail',
    'manager-recipe-item-overview',
  ]),
  // The at-a-glance figure (issue 1505).
  'src/ui/svelte/components/StatBox.svelte': Object.freeze([
    'player-crafting-essence-shopping',
    'manager-books-scrolls-item',
  ]),
  // The surface that reports something that just happened (issue 1505), on two callers.
  'src/ui/svelte/components/Notice.svelte': Object.freeze(['player-inventory-bulk-report']),
  // The standing statement (issue 1505), widened onto its specimen and re-authored at 15 importing
  // files.
  'src/ui/svelte/components/Callout.svelte': Object.freeze([
    'manager-tool-parity-04-requirements-1280x720',
    'player-salvage',
  ]),
  // The sheet itself, and the first entry here whose key is not a component (issue 1515).
  'styles/fabricate.css': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-world-downtime-tracking',
    'manager-world-downtime-collapsed',
  ]),
});

/** The player crafting app, split by which resolution mode's body a file belongs to. */
const CRAFTING_MODE_FILES = Object.freeze({
  simple: ['SimpleRecipeBody', 'StepRequirementsList'],
  routedByIngredients: ['IngredientRoutedBody'],
  routedByCheck: ['RoutedByCheckBody', 'OutcomeTierTable'],
  progressive: ['ProgressiveBody', 'ProgressiveStageList'],
});

/** The one not-yet-ready chrome all five player views draw (issue 1514). */
const PLAYER_VIEW_STATE = /^src\/ui\/svelte\/apps\/PlayerViewState\.svelte$/;

/** Everything under `crafting/` that is NOT one mode's own body. Applies to every crafting case. */
const CRAFTING_SHARED = new RegExp(
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

const CRAFTING_SIMPLE = craftingMode('simple');
const CRAFTING_ROUTED_INGREDIENTS = craftingMode('routedByIngredients');
const CRAFTING_ROUTED_CHECK = craftingMode('routedByCheck');
const CRAFTING_PROGRESSIVE = craftingMode('progressive');

/** Bulk salvage / bulk destroy (issue 859): the fields every one of its cases shares. */
const BULK_DEFAULTS = Object.freeze({
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

/** The inventory grid card for one listing key. */
const CARD = (key) => `.inventory-card[data-inventory-card="${key}"]`;

/**
 * The button inside that card, which is what a selection gesture actually clicks — the card element
 * itself carries no handler.
 */
const CARD_BUTTON = (key) => `${CARD(key)} .inventory-card-button`;

/** A shift-click step: the one gesture that both enters and extends a bulk selection. */
const SHIFT_CLICK = (key) => ({ selector: CARD_BUTTON(key), modifiers: ['Shift'] });

/** One player screen and one manager screen: enough to show a shared-primitive change in context. */
const REPRESENTATIVE_CASE_IDS = Object.freeze(['fabricate-app-shell', 'manager-components-normal']);

export const FALLBACK_CASE_ID = 'fabricate-app-shell';

/** Each app's default window geometry. */
const DEFAULT_POSITION = Object.freeze({
  [MANAGER]: Object.freeze({ width: 1280, height: 820 }),
  [PLAYER]: Object.freeze({ width: 1280, height: 860 }),
  // The three canvas windows are captured at their declared size, unlike the two above — the
  // Manager's smoke counterpart is photographed at 1280x820 rather than its declared 1280x940, and
  // the player app's frames are 860 rather than its own default.
  [CANVAS_BROWSER]: Object.freeze({ width: 420, height: 620 }),
  [CANVAS_CONFIG]: Object.freeze({ width: 480, height: 680 }),
  [CANVAS_MANAGER]: Object.freeze({ width: 560, height: 680 }),
});

/** The Foundry application theme every case renders under unless it says otherwise. */
const DEFAULT_COLOR_SCHEME = 'dark';

/** Case factories. */
function managerCase(entry) {
  return {
    app: MANAGER,
    position: DEFAULT_POSITION[MANAGER],
    publish: true,
    ...entry,
  };
}

/** Choose an actor in the Checks rail's "Preview as" picker. */
function previewAsActor(actorId) {
  return [
    { selector: '[data-checks-preview-actor]' },
    { selector: `[data-popover-option="${actorId}"]` },
  ];
}

/** Choose a value on one of the app's own `<Select>` controls. */
function chooseSelectOption(trigger, value, host = '') {
  const panel = host ? `${host} > .fabricate-select-popover` : '.fabricate-select-popover';
  return [{ selector: trigger }, { selector: `${panel} [data-popover-option="${value}"]` }];
}

/** The three canvas-window factories. */
function canvasCaseFactory(app) {
  return (entry) => ({ app, position: DEFAULT_POSITION[app], publish: true, ...entry });
}

const browserCase = canvasCaseFactory(CANVAS_BROWSER);
const configCase = canvasCaseFactory(CANVAS_CONFIG);
const interactablesManagerCase = canvasCaseFactory(CANVAS_MANAGER);

/**
 * @param {object} entry Case fields.
 * @returns {object} A complete case.
 */
function playerCase(entry) {
  return {
    app: PLAYER,
    position: DEFAULT_POSITION[PLAYER],
    publish: true,
    ...entry,
  };
}

function responsiveLayout(containerSelector, gridSelector) {
  return { containerSelector, gridSelector, maxContentBoxInlineSize: 960 };
}

/** Additive TP10 witnesses, with identical local and CI navigation over persisted fixtures. */
function journalHistoryBatchCases() {
  const search = '[data-journal-search] input';
  const page = (list, direction) => `[data-journal-list="${list}"] [data-pagination-${direction}]`;
  const lastPages = ['active', 'finished'].flatMap((list) =>
    [1, 2].map(() => ({ selector: page(list, 'next') }))
  );
  const states = ['full', 'partial', 'empty', 'restored', 'tools'];
  return [1240, 1024].flatMap((width) =>
    states.map((state) => {
      const fixture = state === 'tools' ? 'history-compact-tools' : 'history-compact-grid';
      const steps = [{ selector: `[data-history-run-id="lab-v1-${fixture}"]` }];
      if (['partial', 'restored'].includes(state)) steps.push(...lastPages);
      if (['empty', 'restored'].includes(state))
        steps.push({ selector: search, fill: 'no batch matches' });
      if (state === 'restored') steps.push({ selector: search, fill: '' });
      const empty = state === 'empty';
      const count = state === 'partial' ? 3 : 4;
      const populated = ['journal-run-list', 'journal-history-list']
        .map((list) => `:has(.${list} > [role="listitem"]:nth-child(${count}):last-child)`)
        .join('');
      return playerCase({
        id: `fabricate-journal-history-batch-${state}-${width}`,
        label: `Player Journal — compact history ${state} at ${width}px`,
        smokeLabels: [],
        reaches: 'beyond',
        query: { tab: 'journal', journalCaseState: fixture },
        position: { width, height: 880 },
        steps,
        expectTab: 'journal',
        expectSelector:
          '.journal-view-grid' +
          (empty
            ? ':has([data-journal-empty="active"].is-fill):has([data-journal-empty="history"].is-fill)'
            : populated) +
          ':has([data-history-items="tools"] [data-list-row]:nth-child(5))',
        ...(!empty && { expectCenterHit: '[data-journal-list="finished"] [data-journal-dismiss]' }),
        kinds: ['player', 'journal', ...(width === 1024 ? ['responsive'] : [])],
        sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/],
      });
    })
  );
}

/** TP14 history-data witnesses. */
const JOURNAL_HISTORY_DATA_EVIDENCE = Object.freeze({
  // Two independent recorded rolls and no global cut: the approved row-only legacy exception.
  // Their quantities (2 and 1) come from the hauls, so no evaluated row quantity can supply them.
  'legacy-row-rolls':
    ':has([data-yield-entry="legacy-iron-ore-roll-12"].is-cleared)' +
    ':has([data-yield-entry="legacy-copper-ore-roll-94"].is-cleared)' +
    ':not(:has([data-yield-cut]))' +
    ':not(:has([data-yield-shared-roll]))' +
    ':not(:has([data-history-unattributed]))',
  // The negative control: an explicit root roll keeps its single cut, above the row it missed.
  'shared-roll-control':
    ':has([data-yield-cut])' +
    ':has([data-yield-entry="shared-iron-ore:0"].is-cleared)' +
    ':has([data-yield-entry="shared-coal:1"].is-cleared)' +
    ':has([data-yield-entry="shared-ruby:2"].is-missed)',
  // Two recovered identities, the captured name winning over the live component name beside it,
  // and a third row that stays unknown and therefore draws the fallback glyph instead of art.
  'recovered-materials':
    ':has([data-history-items="consumed"] [title="Steel Billet"])' +
    ':has([data-history-items="consumed"] [title="Coal"])' +
    ':has([data-history-items="consumed"] i.fa-box)' +
    ':has([data-history-items="produced"] [title="Steel Ingot"])',
  // A recorded roll that cannot cut, because one row's outcome was never recorded; and a haul
  // whose quantity is real while its row is not known.
  'unknown-material-resolution':
    ':has([data-yield-shared-roll])' +
    ':has([data-yield-entry="unknown-silver-ore"].is-cleared)' +
    ':has([data-yield-entry="unknown-ruby"])' +
    ':has([data-history-unattributed] + [data-history-items="produced"])' +
    ':not(:has([data-yield-cut]))' +
    ':not(:has([data-yield-entry="unknown-ruby"].is-cleared))' +
    ':not(:has([data-yield-entry="unknown-ruby"].is-missed))',
  // A confirmed complete-empty award: every row explicitly missed, nothing produced, nothing
  // unknown — the applied empty receipt is what separates this from a missing record.
  'settled-zero':
    ':has([data-journal-verdict="failed"])' +
    ':has([data-yield-cut])' +
    ':has([data-yield-entry="barren-iron-ore"].is-missed)' +
    ':not(:has([data-yield-entry].is-cleared))' +
    ':not(:has([data-history-items="produced"]))',
  // The confirmed prefix and its uncertain remainder, both ahead of the closed-run guidance.
  'uncertain-awards':
    ':has([data-journal-recovery="true"])' +
    ':has([data-journal-effect="0"][data-effect-phase="applied"] [data-list-row])' +
    ':has([data-journal-effect="1"][data-effect-phase="applying"] [data-list-row])' +
    ':has([data-journal-effect="2"][data-effect-phase="planned"])' +
    ':has([data-journal-recovery-evidence] ~ [data-journal-history-detail] [data-journal-guidance])' +
    ':not(:has([data-history-items]))',
  // Native fizzle: the permitted consumption with its captured names and images, and the
  // resolution that actually applied — with no recipe row to disclose.
  fizzle:
    ':has([data-journal-verdict="failed"])' +
    ':has([data-history-summary="none"])' +
    ':has([data-history-items="consumed"] [title="Quicksilver"])' +
    ':has([data-history-items="consumed"] [title="Yellow Sulphur"])' +
    ':has([data-history-items="consumed"] img.fab-medallion-img)' +
    ':not(:has([data-history-items="produced"]))',
  // Native salvage: two receipts from one source row, and a consumption that does not apply
  // rather than one that is unknown.
  salvage:
    ':has([data-journal-verdict="failed"])' +
    ':has([data-history-items="produced"] [data-list-row] ~ [data-list-row])' +
    ':has([data-history-items="produced"] + [data-journal-fact])' +
    ':not(:has([data-history-items="consumed"]))' +
    ':not(:has([data-history-summary]))',
});

/** Sixteen full-window history-data witnesses: eight persisted states at both Journal widths. */
function journalHistoryDataCases() {
  return [1240, 1024].flatMap((width) =>
    Object.entries(JOURNAL_HISTORY_DATA_EVIDENCE).map(([state, evidence]) =>
      playerCase({
        id: `fabricate-journal-history-data-${state}-${width}`,
        label: `Player Journal — ${state.replaceAll('-', ' ')} history at ${width}px`,
        smokeLabels: [],
        reaches: 'beyond',
        query: {
          tab: 'journal',
          journalCaseState: `history-data-${state}`,
          // Alchemy attempt history is GM evidence; a player is not entitled to the record at all.
          ...(state === 'fizzle' && { viewer: 'gm' }),
        },
        position: { width, height: 880 },
        steps: [{ selector: `[data-history-run-id="lab-v1-history-data-${state}"]` }],
        expectTab: 'journal',
        expectSelector: `[data-journal-detail]${evidence}`,
        kinds: ['player', 'journal', ...(width === 1024 ? ['responsive'] : [])],
        // YieldScale is a broad signal routed by `BROAD_SIGNAL_CASE_OVERRIDES`, so it is named
        // there rather than here, where `selectRenderFileCases` would never reach it.
        sourceMatches: [
          JOURNAL_SOURCES,
          /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
          /^src\/systems\/(?:gatheringHistoryEvidence|historyItemEvidence|runHistoryEvidence)\.js$/,
        ],
      })
    )
  );
}

/** Journal lifecycle fixtures use persisted records; steps operate the real controls. */
function journalLifecycleCases() {
  const states = [
    'ready-single',
    'legacy-armed',
    'waiting-auto-eligible',
    'waiting-open-choice',
    'stage-not-started',
    'awaiting-choice',
    'stage-consumed',
    'stage-paid',
    'material-shortage',
    'ingredient-route',
    'check-route',
    'essence-shared',
    'paused',
    'cancel-confirmation',
    'past-stage',
    'future-stage',
    'gathering-straight',
    'gathering-d100',
    'gathering-check',
    'gathering-straight-finished',
    'gathering-d100-finished',
    'gathering-check-finished',
    'finished-success',
    'finished-failure',
    'finished-cancelled',
    'active-page-two',
    'finished-page-two',
    'filter-paused',
    'empty-search',
    'automatic-completion',
    'automatic-blocker',
    'dismissal',
    'redacted-owner',
    'alchemy',
    'salvage',
    'legacy',
    'loading',
    'error-retry',
    'no-actor-empty',
    'stale-action',
    'command-timeout',
    'authority-unavailable',
    'roll-cancelled',
    'unsupported-version',
    'recovery-required',
    'claim-retained',
    'wide',
    'narrow',
    'history-checked-choice',
    'history-resolution-ingredients',
    'history-resolution-simple',
    'history-checked-ingredients',
    'history-legacy-no-check-failure',
    'history-multi-essence',
    'history-multi-shared-essence',
    'history-multi-success',
    'history-multi-failure',
    'history-cancelled-before',
    'history-cancelled-multi',
    'history-d100-all-hit',
    'history-d100-all-miss',
    'history-gathering-check-failure',
    'history-just-resolved',
    'history-redacted',
    'history-missing-material',
    'history-gm-deleted-recipe',
    'history-failure-awards',
    'current-choice-closed',
    'essence-overshoot',
    'past-routed-stage',
    'future-routed-stage',
    'kind-menu-open',
    'history-settling',
  ];
  const selectRivets = [
    { selector: '[data-journal-search] input', fill: 'Forge Iron Rivets' },
    { selector: '[data-run-id="lab-v1-active-4"]' },
    { selector: '[data-journal-search] input', fill: '' },
  ];
  const selectionNames = Object.fromEntries(
    [
      [
        'Forge Iron Rivets',
        [
          'waiting-open-choice',
          'stage-not-started',
          'stage-consumed',
          'current-choice-closed',
          'paused',
          'cancel-confirmation',
          'past-stage',
          'future-stage',
          'empty-search',
          'wide',
          'narrow',
          'kind-menu-open',
          'finished-cancelled',
        ],
      ],
      [
        'Wax a Hemp Cord',
        ['ready-single', 'legacy-armed', 'history-just-resolved', 'history-cancelled-before'],
      ],
      ['File a Guild Permit', ['stage-paid']],
      ['Bind a Shield Boss', ['ingredient-route', 'material-shortage']],
      ['Whet a Keen Edge', ['check-route']],
      ['Inscribe a Prismatic Sigil', ['essence-shared', 'essence-overshoot']],
      ['Steep a Bitter Poultice', ['waiting-auto-eligible', 'automatic-blocker']],
      [
        'Assemble a Warded Buckler',
        ['awaiting-choice', 'past-routed-stage', 'future-routed-stage', 'history-cancelled-multi'],
      ],
      ['Gather Meadow Herbs', ['gathering-straight']],
      ['Quarry Rough Stone', ['gathering-d100', 'history-d100-all-hit', 'history-d100-all-miss']],
      ['Track a Balehound', ['gathering-check', 'history-gathering-check-failure']],
    ].flatMap(([name, suffixes]) => suffixes.map((suffix) => [suffix, name]))
  );
  const selectedIds = {
    'past-stage': 'lab-v1-stage-browser',
    'future-stage': 'lab-v1-stage-browser',
    'empty-search': 'lab-v1-ready-single',
    narrow: 'lab-v1-wide',
  };
  const selectCaseRun = (state) => {
    const fixtureState = state.replace(/-finished$/, '');
    const name = selectionNames[fixtureState];
    if (!name) return [];
    const id = selectedIds[fixtureState] ?? `lab-v1-${fixtureState}`;
    return [
      { selector: '[data-journal-search] input', fill: name },
      { selector: `[data-run-id="${id}"]` },
      { selector: '[data-journal-search] input', fill: '' },
    ];
  };
  const steps = {
    // A paused run holds the choices it already made (D-028), so its rail is inert: the walk
    // pauses the run and stops there rather than reaching for a tile it can no longer open.
    paused: [{ selector: '[data-run-action="pause"]' }],
    'waiting-open-choice': [{ selector: '[data-slot-row] button.fab-slot-tile' }],
    // Started and matured, which is what an enabled roll requires — and therefore locked, so
    // there is no open tile or choice option left to walk (issue 1648, D-028).
    'check-route': [],
    'material-shortage': [
      { selector: '[data-journal-route] input[value="boss-stage-1-verdant"]' },
      { selector: '[data-journal-route] input[value="boss-stage-1-sunward"]' },
    ],
    // Issue 1648, M15: the primary is refused while the essence pick is unmade, so there is
    // no further control left to walk into a command refusal — the frame is the blocked
    // state itself, reached by `selectCaseRun` alone.
    'automatic-blocker': [],
    'cancel-confirmation': [{ selector: '[data-run-action="cancel-arm"]' }],
    'past-stage': [{ selector: '[data-stage-nav-index="0"]' }],
    'future-stage': [{ selector: '[data-stage-nav-index="2"]' }],
    'finished-cancelled': [
      { selector: '[data-run-action="cancel-arm"]' },
      { selector: '[data-run-action="cancel-confirm"]' },
      { selector: '[data-history-run-id="lab-v1-finished-cancelled"]' },
    ],
    'active-page-two': [
      ...selectRivets,
      { selector: '[data-journal-list="active"] [data-pagination-next]' },
    ],
    'finished-page-two': [
      ...selectRivets,
      { selector: '[data-journal-list="finished"] [data-pagination-next]' },
    ],
    ...Object.fromEntries(
      ['straight', 'd100', 'check'].map((mode) => [
        `gathering-${mode}-finished`,
        [
          { selector: '[data-run-action="primary"]' },
          { selector: `[data-history-run-id="lab-v1-gathering-${mode}"]` },
        ],
      ])
    ),
    'filter-paused': [
      ...selectRivets,
      { selector: '[data-journal-status-filter] label:has(input[value="paused"])' },
    ],
    'empty-search': [{ selector: '[data-journal-search] input', fill: 'No matching Journal run' }],
    dismissal: [{ selector: '[data-journal-dismiss]' }],
    'stale-action': [{ selector: '[data-run-action="primary"]' }],
    'command-timeout': [{ selector: '[data-run-action="primary"]' }],
    'roll-cancelled': [{ selector: '[data-run-action="primary"]' }],
    alchemy: [
      { selector: '[data-journal-kind-filter]' },
      { selector: '[data-popover-option="alchemy"]' },
    ],
    salvage: [
      { selector: '[data-journal-kind-filter]' },
      { selector: '[data-popover-option="salvage"]' },
    ],
    'past-routed-stage': [{ selector: '[data-stage-nav-index="0"]' }],
    'future-routed-stage': [{ selector: '[data-stage-nav-index="3"]' }],
    'kind-menu-open': [{ selector: '[data-journal-kind-filter]' }],
    'essence-overshoot': [
      { selector: '[data-essence-source$=".Item.jp-duskglass"] [data-stepper-increment]' },
      { selector: '[data-essence-source$=".Item.jp-duskglass"] [data-stepper-increment]' },
      { selector: '[data-essence-source$=".Item.jp-sunmote"] [data-stepper-increment]' },
    ],
    ...Object.fromEntries(
      ['history-cancelled-before', 'history-cancelled-multi'].map((state) => [
        state,
        [
          { selector: '[data-run-action="cancel-arm"]' },
          { selector: '[data-run-action="cancel-confirm"]' },
          { selector: `[data-history-run-id="lab-v1-${state}"]` },
        ],
      ])
    ),
    ...Object.fromEntries(
      ['history-d100-all-hit', 'history-d100-all-miss', 'history-gathering-check-failure'].map(
        (state) => [
          state,
          [
            { selector: '[data-run-action="primary"]' },
            { selector: `[data-history-run-id="lab-v1-${state}"]` },
          ],
        ]
      )
    ),
    'history-just-resolved': [{ selector: '[data-run-action="primary"]' }],
  };
  const detail = '[data-journal-detail]';
  const primary = '[data-run-action="primary"]';
  const enabledPrimary = `${primary}:not(:disabled):not([aria-busy="true"])`;
  const has = (...selectors) => selectors.map((selector) => `:has(${selector})`).join('');
  const lacks = (...selectors) => selectors.map((selector) => `:not(:has(${selector}))`).join('');
  const terminal = (status, ...evidence) =>
    detail +
    has(
      '[data-journal-history-detail]',
      '[data-journal-this-run] + [data-journal-guidance]',
      ...(status === 'failed' ? ['[data-journal-verdict="failed"]'] : []),
      ...evidence
    ) +
    lacks(
      '[data-run-action-bar]',
      '[data-stage-nav]',
      '[data-run-progress]',
      '[data-journal-summary]',
      '[data-journal-time-remaining]',
      '[data-journal-record]',
      '.manager-callout-title',
      ...(status === 'failed' ? [] : ['[data-journal-verdict]'])
    );
  const commandError = (runId) =>
    '.journal-view-container' +
    has(
      `${detail}[data-run-key*="${runId}"]`,
      '[data-journal-command-error] [data-notice-action]',
      `${detail} ${enabledPrimary}`
    ) +
    lacks('[data-run-action-bar][aria-busy="true"]', '[data-journal-verdict]');
  const paged = (kind, row, otherRow) =>
    '.journal-view-container' +
    has(
      row,
      otherRow,
      `[data-journal-list="${kind}"] [data-pagination-prev]:not(:disabled)`,
      `[data-journal-list="${kind}"] [data-pagination-next]:not(:disabled)`,
      `${detail}[data-run-key*="lab-v1-active-4"]`
    );
  const roomy =
    detail + has('[data-stage-card="1"][data-stage-state="current"]', '[data-stage-nav-index="2"]');
  const expected = {
    'ready-single':
      '.journal-view-container' +
      has('[data-run-status="ready"]', `${detail} ${enabledPrimary}`) +
      lacks('[data-stage-nav]'),
    // The pre-D-026 run the shipped release armed.
    'legacy-armed':
      '.journal-view-container' +
      has('[data-run-status="ready"]', `${detail} ${enabledPrimary}`) +
      lacks('[data-run-action="begin"]', '[data-journal-action-blocker]'),
    'waiting-auto-eligible':
      detail +
      has(
        '[data-run-completion-switch] input[value="worldTime"]:checked',
        '[data-journal-summary-card="time"]',
        `${primary}:disabled`
      ),
    // An open requirement rail belongs to a stage that has NOT begun (D-028), and an unbegun
    // stage offers the begin decision in place of the resolve action — refused, because the
    // option pick this case exists to show is exactly what it is still waiting for.
    'waiting-open-choice':
      detail +
      has(
        '[data-choice-options] [data-choice-id]:not(:disabled)',
        '[data-slot-row] button[aria-pressed="true"]',
        '[data-run-action="begin"]:disabled'
      ) +
      lacks(primary),
    // The stage the player has not begun: its own control, stating what beginning commits,
    // and NO roll offered at all until it has started (issue 1648, M13/M15).
    'stage-not-started':
      detail + has('[data-run-action="begin"]:not(:disabled)', '[data-run-begin]') + lacks(primary),
    // Issue 1648, M10.
    'awaiting-choice':
      '.journal-view-container' +
      has(
        '[data-run-id="lab-v1-awaiting-choice"] [data-run-attention="choice"]',
        `${detail} .journal-detail-meta [data-run-attention="choice"]`,
        '[data-journal-awaiting-choice="true"][data-notice-tone="info"]',
        '[data-journal-route] input:not(:disabled)'
      ) +
      lacks('[data-journal-action-blocker]', '[data-run-attention="materials"]'),
    // The same stage once it started: it shows the RECEIPT of what it consumed rather than
    // the requirement rail, which probes an inventory the stage already emptied (M21), and
    // nothing about the choice is editable any more.
    'stage-consumed':
      detail +
      has('[data-journal-stage-details]', '[data-journal-stage-consumed] [data-list-row]') +
      lacks(
        '[data-journal-stage-details][data-editable="true"]',
        '[data-run-action="begin"]',
        '[data-slot-row]'
      ),
    // A currency-only ingredient set is valid and authorable (D-031), so a started stage whose
    // whole requirement was a price is a reachable state.
    'stage-paid':
      detail +
      has('[data-journal-stage-consumed] [data-journal-fact]') +
      lacks(
        // The item-row GRID, as one compound selector: a DESCENDANT inside a negated `:has()`
        // is evaluated unfaithfully by happy-dom, so the mounted walk would pass it open.
        '.journal-stage-consumed-items',
        '[data-essence-history]',
        '[data-slot-row]',
        '[data-run-action="begin"]'
      ),
    // A stage short of its materials has NOT begun — starting is what spends them (D-026) —
    // so the control it offers is the begin decision, refused and reasoned (issue 1648).
    'material-shortage':
      detail +
      has(
        '[data-slot-id="boss-stage-1-sunward-g3"]',
        '[data-run-action="begin"]:disabled',
        '[data-journal-action-blocker="selectionRequired"]'
      ) +
      lacks(primary),
    'ingredient-route':
      detail +
      has(
        '[data-journal-route] input:not(:disabled)',
        '[data-slot-id="boss-stage-1-verdant-g1"]',
        '[data-journal-stage-details][data-editable="true"]'
      ) +
      lacks('[data-slot-id="boss-stage-1-sunward-g1"]'),
    'check-route': detail + has('[data-outcome-ladder] [data-outcome-tier]', enabledPrimary),
    'essence-shared':
      detail +
      has(
        '[data-essence-threshold="radiant"]',
        '[data-essence-threshold="shadow"]',
        '[data-essence-source] button:not(:disabled)'
      ),
    paused:
      detail +
      has(
        '[data-journal-paused]',
        '[data-run-action="resume"]:not(:disabled)',
        '[data-stage-state="paused"]'
      ) +
      lacks('[data-journal-time-remaining]'),
    'cancel-confirmation':
      detail +
      has(
        '[data-run-cancel-decision] [data-run-action="cancel-confirm"]',
        '[data-run-action="cancel-keep"]'
      ) +
      lacks(primary, '[data-run-action="pause"]', '[data-run-completion]'),
    'past-stage':
      detail +
      has(
        '[data-stage-card="0"][data-stage-state="past"]',
        '[data-stage-nav-return]',
        '[data-stage-io="consumed"]',
        '[data-stage-io="produced"]'
      ) +
      lacks(
        '[data-journal-stage-details][data-editable="true"]',
        '[data-journal-summary]',
        '[data-journal-time-remaining]'
      ),
    'future-stage':
      detail +
      has(
        '[data-stage-card="2"][data-stage-state="future"]',
        '[data-stage-nav-return]',
        '[data-stage-io="consumed"]',
        '[data-stage-state="future"] [data-journal-crafting-yield]'
      ) +
      lacks(
        '[data-journal-stage-details][data-editable="true"]',
        '[data-journal-summary]',
        '[data-journal-time-remaining]'
      ),
    'gathering-straight':
      detail +
      has('[data-yield-entry="jp-meadow_herb-drop"]', enabledPrimary) +
      lacks('[data-yield-cut]', '[data-outcome-ladder]'),
    'gathering-d100':
      detail +
      has('[data-yield-scale] [data-yield-entry]', enabledPrimary) +
      lacks('[data-yield-cut]', '[data-outcome-ladder]'),
    'gathering-check':
      detail +
      has('[data-outcome-tier="rich"]', '.fab-outcome-tier .fa-circle-xmark', enabledPrimary) +
      lacks('[data-yield-cut]'),
    'gathering-straight-finished':
      terminal('succeeded', '[data-history-summary="none"] ~ [data-history-items="produced"]') +
      lacks('[data-yield-cut]'),
    'gathering-d100-finished':
      terminal('succeeded', '[data-yield-cut]', '[data-yield-entry="jp-rough_stone-drop"]') +
      lacks('[data-history-items="produced"]', '[data-history-summary]'),
    'gathering-check-finished':
      terminal(
        'succeeded',
        '[data-history-summary="check"] ~ [data-history-items="produced"] ~ [data-history-outcome-log]'
      ) + lacks('[data-outcome-ladder]'),
    'finished-success': terminal(
      'succeeded',
      '[data-history-summary="check"] ~ [data-history-items="produced"]'
    ),
    'finished-failure':
      terminal('failed', '[data-history-verdict-check]') +
      lacks('[data-history-summary]', '[data-history-items="produced"]'),
    'finished-cancelled': terminal(
      'cancelled',
      '[data-history-items="consumed"] ~ [data-history-items="produced"]'
    ),
    'active-page-two': paged(
      'active',
      '[data-run-id="lab-v1-active-7"]',
      '[data-history-run-id="lab-v1-finished-1"]'
    ),
    'finished-page-two': paged(
      'finished',
      '[data-history-run-id="lab-v1-finished-5"]',
      '[data-run-id="lab-v1-active-1"]'
    ),
    'filter-paused':
      '.journal-view-container' +
      has(
        '[data-journal-status-filter] input[value="paused"]:checked',
        `${detail}[data-run-key*="lab-v1-active-4"]`,
        '[data-run-id="lab-v1-filter-paused"][data-run-status="paused"]'
      ) +
      lacks('[data-run-status="ready"]'),
    'empty-search':
      '.journal-view-container' +
      has('[data-journal-empty="active"]', '[data-journal-empty="history"]', detail) +
      lacks('[data-run-id]', '[data-history-run-id]'),
    'automatic-completion': terminal(
      'succeeded',
      '[data-history-stages] [data-stage-io="produced"]'
    ),
    // Issue 1648, M15: the same unmade-choice shape as `awaiting-choice`, on a run armed before the
    // D-028 lock existed (started, but never locked, so its essence pick is still live-resolved and
    // still open).
    'automatic-blocker':
      detail +
      has(
        '[data-run-action="begin"]:disabled',
        '[data-essence-threshold="clarity"] [aria-valuenow="0"]',
        '[data-journal-awaiting-choice="true"][data-notice-tone="info"]'
      ) +
      lacks(primary, '[data-journal-command-error]', '[data-journal-action-blocker]'),
    dismissal:
      '.journal-view-container' +
      has('[data-history-run-id]', detail) +
      lacks('[data-history-run-id="lab-v1-dismissal"]'),
    'redacted-owner':
      '.journal-view-container' +
      has(
        '[data-run-id="lab-gathering-blind-waiting"]',
        `${detail} [data-run-action="cancel-arm"]:not(:disabled)`
      ) +
      lacks('[data-journal-stages]', '[data-yield-entry]', '[data-run-secret-preview]'),
    // Its stage has STARTED, so its materials surface is the consumption receipt rather than
    // the held/needed rail the slot id named (M21).
    alchemy:
      detail +
      has(
        '[data-run-action="primary"]:not(:disabled)',
        '[data-journal-stage-consumed] [data-list-row]',
        '.journal-detail-identity img[src$="bottle-bulb-corked-glowing-red.webp"]'
      ) +
      lacks('[data-journal-verdict]', '[data-slot-row]'),
    salvage: terminal('succeeded', '[data-history-items="produced"]'),
    legacy:
      '.journal-view-container' +
      has(
        '[data-run-id="lab-run-inprogress-single"][data-run-status="inProgress"]',
        `${detail} ${enabledPrimary}`,
        '[data-run-action="pause"]:disabled'
      ) +
      lacks('[data-run-completion]'),
    loading: '[data-journal-state="loading"][aria-busy="true"] .fa-spinner',
    'error-retry': '[data-journal-state="error"] [data-notice-tone="danger"] [data-notice-action]',
    'no-actor-empty':
      '[data-journal-state="empty"]:not([aria-busy="true"])' + lacks('[data-run-action-bar]'),
    'stale-action': commandError('lab-v1-stale-action'),
    'command-timeout': commandError('lab-v1-command-timeout'),
    'authority-unavailable':
      detail +
      has(`${primary}:disabled[title]:not([title=""])`, '[data-run-action="cancel-arm"]:disabled') +
      lacks('[data-journal-verdict]'),
    'roll-cancelled':
      '.journal-view-container' +
      has(
        '[data-run-id="lab-v1-roll-cancelled"][data-run-status="ready"]',
        `${detail} ${enabledPrimary}`
      ) +
      lacks(
        '[data-journal-command-error]',
        '[data-journal-verdict]',
        '[data-run-action-bar][aria-busy="true"]'
      ),
    'unsupported-version':
      detail +
      has(
        '[data-notice-tone="warning"]',
        `${primary}:disabled`,
        '[data-run-action="cancel-arm"]:disabled'
      ) +
      lacks('[data-run-completion]'),
    'recovery-required':
      detail +
      has(
        '[data-journal-recovery][role="alert"] .fab-notice-detail:not(:empty)',
        `${primary}:disabled`,
        '[data-run-action="cancel-arm"]:disabled'
      ),
    // One notice for one run state, carrying the GM's way out of it (issue 1648).
    'claim-retained':
      detail +
      has(
        '[data-journal-action-blocker="recovery-required"][data-journal-paused="true"]' +
          ' [data-notice-action]',
        '[data-run-action="resume"]:disabled'
      ) +
      lacks('[data-journal-recovery]', '[data-journal-paused]:not([data-journal-action-blocker])'),
    wide: roomy,
    narrow: roomy,
    // A choice slot exists only before the stage starts now (M21), so this state's stage is
    // unbegun.
    'current-choice-closed':
      detail +
      has('[data-stage-state="current"] [data-slot-row] button.fab-slot-tile') +
      lacks('[data-choice-options]', '[data-journal-stage-consumed]'),
    'essence-overshoot':
      detail + has('[data-essence-overshoot]', '[data-essence-source$=".Item.jp-duskglass"]'),
    'past-routed-stage':
      detail +
      has(
        '[data-stage-card="0"][data-stage-state="past"] [data-stage-io="consumed"]',
        '[data-stage-fact="route"]'
      ) +
      lacks('[data-journal-summary]', '[data-journal-time-remaining]'),
    'future-routed-stage':
      detail +
      has(
        '[data-stage-card="3"][data-stage-state="future"] [data-journal-crafting-yield]',
        '[data-stage-nav-return]'
      ) +
      lacks('[data-journal-summary]', '[data-journal-time-remaining]'),
    'kind-menu-open': '[role="listbox"] [data-popover-option="gathering"]',
    'history-checked-choice': terminal(
      'succeeded',
      '[data-history-summary="check"] ~ [data-history-items="consumed"] ~ [data-history-items="produced"]'
    ),
    'history-resolution-ingredients': terminal(
      'succeeded',
      '[data-history-summary="ingredients"] ~ [data-history-items="produced"]'
    ),
    'history-resolution-simple': terminal(
      'succeeded',
      '[data-history-summary="none"] ~ [data-history-items="produced"]'
    ),
    'history-checked-ingredients': terminal(
      'succeeded',
      '[data-history-summary="check"] ~ [data-history-items="consumed"] ~ [data-history-items="produced"]'
    ),
    'history-legacy-no-check-failure':
      terminal(
        'failed',
        '[data-journal-verdict] ~ [data-history-summary="ingredients"] ~ [data-history-items="consumed"]'
      ) + lacks('[data-history-items="produced"]'),
    ...Object.fromEntries(
      ['history-multi-essence', 'history-multi-shared-essence'].map((state) => [
        state,
        terminal(
          'succeeded',
          '[data-history-stages] [data-stage-card="0"]',
          '[data-history-stages] [data-stage-card="1"]',
          '[data-essence-history-carrier]'
        ) + lacks('[data-history-summary]', '[data-history-items="produced"]'),
      ])
    ),
    'history-multi-success':
      terminal(
        'succeeded',
        '[data-history-stages] [data-stage-card="2"] [data-stage-io="produced"]'
      ) + lacks('[data-history-summary]', '[data-history-items="produced"]'),
    'history-multi-failure':
      terminal('failed', '[data-history-stages] [data-stage-card="2"][data-stage-state="failed"]') +
      lacks('[data-history-summary]', '[data-history-items="produced"]'),
    'history-cancelled-before':
      terminal('cancelled') +
      lacks('[data-history-stages]', '[data-history-summary]', '[data-history-items]'),
    'history-cancelled-multi':
      terminal('cancelled', '[data-history-stages] [data-stage-card="1"]') +
      lacks('[data-stage-card="2"]', '[data-history-summary]'),
    ...Object.fromEntries(
      ['history-d100-all-hit', 'history-d100-all-miss'].map((state) => [
        state,
        terminal(
          'succeeded',
          '[data-yield-scale] [data-yield-cut]',
          '[data-yield-entry="jp-dewglass-drop"]'
        ) + lacks('[data-history-items="produced"]', '[data-history-summary]'),
      ])
    ),
    'history-gathering-check-failure':
      terminal('failed', '[data-history-outcome-log]') +
      lacks('[data-history-verdict-check]', '[data-outcome-ladder]', '[data-history-summary]'),
    'history-just-resolved':
      detail +
      has('[data-journal-verdict="succeeded"] [data-history-items="transient-produced"]') +
      lacks('[data-history-summary]', '[data-run-action-bar]'),
    'history-redacted':
      terminal('succeeded') +
      lacks('[data-history-items]', '[data-history-summary]', '[data-history-stages]'),
    'history-missing-material': terminal('succeeded', '[data-history-items="consumed"]'),
    'history-gm-deleted-recipe': terminal(
      'succeeded',
      '[data-history-summary="check"]',
      '[data-history-items="produced"]'
    ),
    'history-failure-awards': terminal('failed', '[data-history-items="produced"]'),
    'history-settling':
      detail +
      has('[data-journal-settling]') +
      lacks('[data-journal-verdict]', '[data-run-action-bar]', '[data-history-items="produced"]'),
  };
  const pointerTargets = {
    'waiting-open-choice': '[data-choice-id]:not(:disabled)',
    'cancel-confirmation': '[data-run-action="cancel-confirm"]',
    paused: '[data-run-action="resume"]',
    'ingredient-route': '[data-journal-route]',
    'stage-not-started': '[data-run-action="begin"]',
    'awaiting-choice': '[data-journal-route]',
    'check-route': '[data-run-action="primary"]',
    'essence-overshoot': '[data-essence-source$=".Item.jp-sunmote"] [data-stepper-increment]',
    'past-stage': '[data-stage-nav-return]',
    'future-stage': '[data-stage-nav-return]',
    'past-routed-stage': '[data-stage-nav-return]',
    'future-routed-stage': '[data-stage-nav-return]',
    'history-just-resolved': '[data-history-run-id="lab-v1-history-just-resolved"]',
  };
  return states.map((state) =>
    playerCase({
      id: `fabricate-journal-lifecycle-${state}`,
      label: `Player Journal — ${state.replaceAll('-', ' ')}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: {
        tab: 'journal',
        journalCaseState: state.replace(/-finished$/, ''),
        ...(['history-gm-deleted-recipe', 'claim-retained'].includes(state) && { viewer: 'gm' }),
        ...(state.startsWith('gathering-straight') && { gatheringTaskMode: 'straight' }),
        ...(state.startsWith('gathering-check') && { gatheringTaskMode: 'routed' }),
      },
      position: { width: state === 'narrow' ? 1024 : 1240, height: 880 },
      steps: [
        ...selectCaseRun(state),
        ...(steps[state] ??
          (state.startsWith('history-') ||
          ['finished-success', 'finished-failure', 'automatic-completion'].includes(state)
            ? [{ selector: `[data-history-run-id="lab-v1-${state}"]` }]
            : [])),
      ],
      expectTab: 'journal',
      expectSelector: expected[state],
      ...(pointerTargets[state] && { expectCenterHit: pointerTargets[state] }),
      ...(state === 'filter-paused' && { expectCenterHit: steps[state].at(-1).selector }),
      ...(state === 'kind-menu-open' && { expectCenterHit: '[data-popover-option="gathering"]' }),
      ...(state === 'current-choice-closed' && {
        expectCenterHit: '[data-slot-row] button.fab-slot-tile',
      }),
      ...(['narrow', 'wide'].includes(state) && {
        expectLayout: {
          containerSelector: '.journal-view-container',
          gridSelector: '.journal-view-grid',
          expectedTracks: state === 'narrow' ? 1 : 2,
          ...(state === 'narrow' && { maxContentBoxInlineSize: 960 }),
        },
      }),
      kinds: ['player', 'journal', ...(state === 'narrow' ? ['responsive'] : [])],
      sourceMatches: [
        JOURNAL_SOURCES,
        /^src\/ui\/svelte\/stores\/journalStore/,
        /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
      ],
    })
  );
}

/** The Journal's in-flight blind gathering run, from both sides of the redaction (issue 901). */
function journalBlindRunCases() {
  // The in-flight blind run seeded by `tests/view-lab/world/labRunStates.js`.
  const card = '.journal-run-card[data-run-id="lab-gathering-blind-waiting"]';
  const shared = {
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: card },
      // Assert the SELECTION landed on the gathering run as well as scrolling its detail in: a
      // mis-click would otherwise photograph the crafting detail under a gathering case's name.
      {
        selector: '[data-journal-detail][data-run-key*="lab-gathering-blind-waiting"]',
        scroll: true,
      },
    ],
    kinds: ['player', 'journal', 'gathering'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/svelte\/stores\/journalStore/,
      // The projection that decides what each viewer is told.
      /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
    ],
  };
  return [
    playerCase({
      ...shared,
      id: 'fabricate-journal-blind-run',
      label: 'Player app — Journal, in-flight blind gathering run (player view)',
      query: { tab: 'journal' },
      expectSelector: `${card}:not(:has([data-run-secret-preview]))`,
    }),
    playerCase({
      ...shared,
      id: 'fabricate-journal-blind-run-gm',
      label: 'Player app — Journal, in-flight blind gathering run (GM secret preview)',
      // The player app rendered for a GM.
      query: { tab: 'journal', viewer: 'gm' },
      expectSelector: `${card} [data-run-secret-preview]`,
    }),
  ];
}

/**
 * The player companion surface (issue 1198): the route key its frames address, the rail control
 * that addresses it, and the render files those frames are evidence about.
 */
const PLAYER_EXTENSION_ROUTE = 'ext:downtime:projects';
const PLAYER_EXTENSION_RAIL_BUTTON = `[data-player-nav-tab="${PLAYER_EXTENSION_ROUTE}"]`;
const PLAYER_EXTENSION_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/PlayerExtensionHost\.svelte$/,
  /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
  /^src\/ui\/playerExtensions\.js$/,
  /^src\/ui\/playerNavModel\.js$/,
  /^src\/ui\/extensionRegistry\.js$/,
]);

/** The shared positioning seam every open popover frame draws (issue 1500). */
const ANCHORED_POPOVER_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/actions\/anchoredPopover\.js$/,
  /^src\/ui\/svelte\/util\/overlayBounds\.js$/,
]);

/** The environment editor's directory, minus its validation tab (issue 1517). */
const ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB =
  /^src\/ui\/svelte\/apps\/manager\/environment\/(?!EnvironmentValidationTab\.svelte$)/;

export const VIEW_LAB_CASES = Object.freeze([
  managerCase({
    id: 'manager-recipes-editor-roundtrip',
    label: 'Manager — Recipes editor roundtrip',
    smokeLabels: ['manager-recipes-editor-roundtrip'],
    // The state is what survived a round trip, so every step is load-bearing: filter to a category,
    // select a row into the shared inspector (the collapse below leaves no row to click), collapse
    // the group, open the editor from the inspector, and come back.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-category-filter]', select: 'Weaponsmithing' },
      { selector: '.manager-recipe-row .manager-recipe-identity' },
      { selector: '.manager-recipe-group [data-group-header]' },
      { selector: '.manager-recipe-browser-inspector [data-recipe-action="edit"]' },
      { selector: '.manager-header-actions .manager-button.is-ghost' },
    ],
    expectView: 'recipes',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  managerCase({
    id: 'manager-default-selection',
    label: 'Manager — Default selection',
    smokeLabels: ['manager-default-selection'],
    reaches: 'exact',
    query: {},
    steps: [],
    expectView: 'systems',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      // `SystemsBrowserView` alone (issue 1515).
      /^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/,
    ],
  }),
  managerCase({
    // A browse row's overflow menu, open (issue 1515).
    id: 'manager-systems-row-menu-open',
    label: 'Manager — System library row menu open',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      {
        selector:
          '.manager-system-row[data-system-id="lab-smithing"] .manager-icon-button[aria-haspopup="menu"]',
      },
    ],
    expectView: 'systems',
    // The panel's own accessible name is the assertion, not merely the panel.
    expectSelector:
      '.fabricate-manager .fabricate-action-menu-panel[role="menu"][aria-label^="System actions for"]',
    kinds: ['manager', 'systems'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/],
  }),
  managerCase({
    id: 'manager-systems-empty',
    label: 'Manager — System library empty',
    // `beyond`: the live smoke seeds a crafting system before it opens the manager at all, so no
    // smoke frame shows the library with nothing in it and there is no counterpart to fall short
    // of.
    reaches: 'beyond',
    smokeLabels: [],
    // No new lab input, and that is the finding rather than a shortcut.
    query: { clearSystem: '1' },
    steps: [],
    expectView: 'systems',
    // Both halves of what this frame is named for, in one assertion.
    expectSelector:
      '.fabricate-manager:has(.manager-table-scroll .manager-empty:not([data-systems-loading]))' +
      ' .manager-setup-card',
    kinds: ['manager', 'systems'],
    // Deliberately no pattern for `components/EmptyState.svelte`: `BROAD_SIGNAL_PATTERN` matches
    // `^src/ui/svelte/components/`, and `selectRenderFileCases` `continue`s on a broad-signal file
    // before reading any case's `sourceMatches`, so such an entry is unreachable.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-selected-normal',
    label: 'Manager — Selected normal',
    smokeLabels: ['manager-selected-normal'],
    // Reached the way the smoke reaches it: by CLICKING the system row's identity, which is what
    // `selectSmokeSystemInManager` does. This exact line is pinned by `tests/view-lab-cases.test.js`
    // as the comment-only registry change that must select one frame.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '.manager-system-row[data-system-id="lab-smithing"] .manager-system-identity' },
    ],
    expectView: 'systems',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-rail-expanded',
    label: 'Manager — Rail expanded',
    smokeLabels: ['manager-rail-expanded'],
    // The smoke's counterpart is the expanded baseline it establishes before collapsing: it enters
    // the system scope, collapses the rail if it is not already expanded, and photographs that.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '.manager-system-row[data-system-id="lab-smithing"] .manager-system-identity' },
      { selector: '.manager-rail-toggle' },
      { selector: '.manager-rail-toggle' },
    ],
    expectView: 'systems',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-rail-collapsed',
    label: 'Manager — Rail collapsed',
    smokeLabels: ['manager-rail-collapsed'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '.manager-rail-toggle' }],
    expectView: 'systems',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-selected-stacked',
    label: 'Manager — Selected stacked',
    smokeLabels: ['manager-selected-stacked'],
    // Clicks the row, exactly as its normal-width twin does.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '.manager-system-row[data-system-id="lab-smithing"] .manager-system-identity' },
    ],
    expectView: 'systems',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'systems', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-system-edit-normal',
    label: 'Manager — System edit normal',
    smokeLabels: ['manager-system-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system-edit'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      // `ResolutionModeCard` left this alternation at issue 1509, which deleted the file: the
      // shim's four call sites render `RadioCardGroup` directly now.
      /^src\/ui\/svelte\/apps\/manager\/(CraftingEffectPanel|ItemPageInspector)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-system-edit-validation',
    label: 'Manager — System edit validation tab',
    // The validation tab, which had no frame at all (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `lab-smithing` stated rather than inherited from the seeded default, because the frame's
    // whole content is that system's validation report: `sm-r-runeplate-draft` contributes a
    // critical `noResultGroup` and a `disabledIncomplete` warning, and `sm-r-deepbind` a
    // `requirementOverlap` warning.
    query: { system: 'lab-smithing' },
    steps: ['System Overview', { selector: '#system-tab-validation' }],
    expectView: 'system-edit',
    // Three claims in one selector, because each alone publishes something this case is not.
    expectSelector:
      '.fabricate-manager [data-system-overview]:has([data-system-overview-counts])' +
      ' [data-system-overview-group="recipe"] .manager-system-overview-row',
    kinds: ['manager', 'system-edit'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/SystemOverviewView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-system-edit-narrow',
    label: 'Manager — System edit narrow',
    smokeLabels: ['manager-system-edit-narrow'],
    reaches: 'exact',
    query: {},
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    position: { width: 900, height: 700 },
    kinds: ['manager', 'system-edit', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-system-edit-dirty',
    label: 'Manager — System edit dirty',
    smokeLabels: ['manager-system-edit-dirty'],
    reaches: 'exact',
    query: {},
    // `data-system-details-dirty` appears on an `input` event, so no amount of clicking or
    // seeding reaches it — a typed value is the only route to the lit "Unsaved" chip.
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '#manager-system-name', fill: 'Karrun Forgecraft (unsaved edit)' },
    ],
    expectView: 'system-edit',
    kinds: ['manager', 'system-edit'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-system-edit-lists',
    label: 'Manager — World Modifiers list ergonomics',
    smokeLabels: ['manager-system-edit-lists'],
    // The settings-list ergonomics card, with one modifier open and its IconPicker down.
    reaches: 'exact',
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
      { selector: '[data-world-modifier] [data-toggle-modifier]' },
      { selector: '[data-world-modifier] .essence-icon-picker-trigger' },
      // Anchored on the card's title, not the card.
      { selector: '[data-world-modifiers] .manager-card-title', scroll: true },
    ],
    expectView: 'world-modifiers',
    // The one authoring surface (issue 1117), asserted on the fields it absorbed from the retired
    // Checks-tab editor rather than only on the section it already had: the open row's `min`
    // Stepper is what proves the check-only bounds pair reached this card, and it is the only frame
    // in the registry that can show it now that no Checks route authors an entry.
    expectSelector:
      '.fabricate-manager [data-world-modifiers]' +
      ':has([data-world-modifier-bounds] [data-world-modifier-field="min"])',
    position: { width: 1280, height: 980 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/world\/WorldModifiersTab\.svelte$/,
      // The expression field this screen is now the only caller of (issue 1373).
      /^src\/ui\/svelte\/apps\/manager\/RollDataExpressionInput\.svelte$/,
      // The icon vocabulary the shared picker lists (issue 1269).
      /^src\/ui\/svelte\/util\/(?:essenceIcons|foundryIconVocabulary|foundryIconCatalogue)\.(?:js|json)$/,
      // The positioning seam the open picker's panel is placed by (issue 1500).
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-system-edit-modifier-rolls',
    label: 'Manager — World Modifiers rolling entry',
    // BEYOND the smoke: the walk opens no modifier entry at all, and `manager-system-edit-lists`
    // opens the FIRST one, which is flat. Nothing anywhere framed a rolling entry.
    reaches: 'beyond',
    smokeLabels: [],
    // The state issue 1118 creates.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
      { selector: '[data-world-modifier="hb-mod-luck"] [data-toggle-modifier]' },
      { selector: '[data-world-modifier="hb-mod-luck"]', scroll: true },
    ],
    expectView: 'world-modifiers',
    // The roll NOTE keyed to this entry is the assertion, because it is the element the retired
    // rule's copy occupied and the only one that cannot render if the note is dropped.
    expectSelector:
      '.fabricate-manager [data-world-modifiers]' +
      ':has([data-world-modifier-roll-note="hb-mod-luck"])',
    position: { width: 1280, height: 980 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldModifiersTab\.svelte$/],
  }),
  managerCase({
    id: 'currency-actor-property',
    label: 'Manager — World Currency actor property',
    smokeLabels: ['currency-actor-property'],
    reaches: 'exact',
    // World > Currency (issue 1278). The ladder is world scope, so this route needs no selected
    // system and is ungated — the card renders whether or not any crafting system has switched
    // currency on.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      { selector: '[data-world-currency-units]', scroll: true },
    ],
    expectView: 'world-currency',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'currency-macro',
    label: 'Manager — World Currency macro',
    smokeLabels: ['currency-macro'],
    reaches: 'exact',
    // The macro branch is chosen on the app's own option list (issue 1510): the strategy control
    // is a `<Select>` now, so the native `select:` verb — which `view-lab-screenshots.mjs` turns
    // into Playwright's `<select>`-only `selectOption` — would throw on its `<button>` trigger.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      ...chooseSelectOption('[data-world-currency-strategy-select]', 'macro'),
      { selector: '[data-world-currency-units]', scroll: true },
    ],
    expectView: 'world-currency',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'currency-actor-inventory',
    label: 'Manager — World Currency actor inventory',
    smokeLabels: ['currency-actor-inventory'],
    reaches: 'exact',
    // dnd5e registers no inventory currency provider, so this strategy resolves to the
    // no-provider callout steering the GM to macro mode — which is the state the smoke's
    // counterpart photographs too, for the same reason.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      ...chooseSelectOption('[data-world-currency-strategy-select]', 'actorInventory'),
      { selector: '[data-world-currency-units]', scroll: true },
    ],
    expectView: 'world-currency',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    // The sub-unit chip, which no frame held (issue 1515).
    id: 'manager-world-currency-subunit-expanded',
    label: 'Manager — World Currency sub-unit chip expanded',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      { selector: '[data-world-currency-unit-expand="gp"]' },
      {
        selector: '[data-world-currency-unit="gp"] [data-world-currency-subunit="sp"]',
        scroll: true,
      },
    ],
    expectView: 'world-currency',
    // The chip itself, inside the unit that owns it.
    expectSelector:
      '.fabricate-manager [data-world-currency-unit="gp"] [data-world-currency-subunit="sp"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'world-prerequisites',
    label: 'Manager — World Character prerequisites',
    // No counterpart, and the empty array is a correction rather than an omission (issue 1520).
    smokeLabels: [],
    reaches: 'beyond',
    // World > Rules & Resources > Character prerequisites (issue 1311). The library is world scope
    // since issue 1308, so this route needs no selected system and is ungated.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-prerequisites', press: 'Enter' },
      { selector: '[data-world-prerequisites-page]', scroll: true },
    ],
    expectView: 'world-prerequisites',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldPrerequisitesTab\.svelte$/],
  }),
  // Every converted control's open state became photographable for the first time with the
  // conversion — a native `<select>`'s popup is drawn by the operating system and does not appear
  // in a screenshot at all — and an open-panel case cannot double as its view's closed-state frame,
  // because the portal occludes the screen behind it.
  managerCase({
    id: 'world-currency-strategy-list',
    label: 'Manager — World Currency spend strategy list',
    smokeLabels: [],
    // `beyond`: the smoke walks THROUGH this control to the macro and inventory states and never
    // rests on it open, so there is no counterpart frame to fall short of.
    reaches: 'beyond',
    // The closed-state case's own route, stopped at the trigger with no row click.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      { selector: '[data-world-currency-strategy-select]' },
    ],
    expectView: 'world-currency',
    // Three claims, and a trigger-only frame satisfies none of them: the panel exists, it is a
    // direct child of the manager root (the portal, not the fallback that draws it in place), and
    // it is the unticked configuration.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover' +
      ':not(.fabricate-select-popover-ticked) [data-popover-option="macro"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'world-prerequisites-operator-list',
    label: 'Manager — World Character prerequisite operator list',
    smokeLabels: [],
    reaches: 'beyond',
    // The narrowest trigger in the phase, and the one whose panel is overridden.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-prerequisites', press: 'Enter' },
      { selector: '.manager-prerequisite-item [data-toggle-prerequisite]' },
      { selector: '[data-prerequisite-operator]' },
    ],
    expectView: 'world-prerequisites',
    // The tick element on the selected row, which is the claim the panel's own class does not make.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[role="option"][aria-selected="true"] .fabricate-select-tick',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/system\/CharacterPrerequisitesCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/WorldPrerequisitesTab\.svelte$/,
    ],
  }),
  managerCase({
    // The converted row with its list shut (issue 1510).
    id: 'world-prerequisites-condition-row',
    label: 'Manager — World Character prerequisite condition row, operator closed',
    smokeLabels: [],
    // `beyond`: the smoke never expands a prerequisite item, so there is no counterpart frame
    // this one could fall short of and no label it could claim.
    reaches: 'beyond',
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-prerequisites', press: 'Enter' },
      { selector: '.manager-prerequisite-item [data-toggle-prerequisite]' },
      { selector: '[data-world-prerequisites-page]', scroll: true },
    ],
    expectView: 'world-prerequisites',
    // Both halves matter.
    expectSelector:
      '.manager-prerequisite-condition [data-prerequisite-operator].fabricate-select-trigger',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/system\/CharacterPrerequisitesCard\.svelte$/],
  }),
  managerCase({
    id: 'world-modifiers',
    label: 'Manager — World Modifiers',
    // No counterpart, for the reason its sibling above records.
    smokeLabels: [],
    reaches: 'beyond',
    // World > Rules & Resources > Modifiers (issue 1311).
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
      { selector: '[data-world-modifiers-page]', scroll: true },
    ],
    expectView: 'world-modifiers',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldModifiersTab\.svelte$/],
  }),
  // Frames from this PR prove the shell only. Every one of these routes is a placeholder: no
  // catalogue, no editor, no `InheritRow`.
  managerCase({
    id: 'world-component-catalogue',
    label: 'Manager — World Component catalogue',
    // Beyond the smoke, and the empty `smokeLabels` says so explicitly rather than by omission.
    reaches: 'beyond',
    smokeLabels: [],
    // The row is inspected, not merely listed (issue 1371).
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Iron Ingot' },
      { selector: '[data-scoped-list-inspect="sm-iron-ingot"]' },
      { selector: '[data-scoped-list-search]', fill: '' },
    ],
    expectView: 'world-components',
    // The page's own hook, so a route that silently fell back to the systems library fails the
    // capture rather than publishing a frame of the wrong screen.
    expectSelector: '[data-scoped-page="world-components"]',
    // The four leaves, in the prototype's authored order, each proved to hold its own icon rather
    // than merely to exist.
    expectContained: [
      {
        container: '#manager-world-nav-component-catalogue',
        target: '#manager-world-nav-component-catalogue > i',
      },
      { container: '#manager-world-nav-vocabulary', target: '#manager-world-nav-vocabulary > i' },
      {
        container: '#manager-world-nav-essence-catalogue',
        target: '#manager-world-nav-essence-catalogue > i',
      },
      {
        container: '#manager-world-nav-tool-catalogue',
        target: '#manager-world-nav-tool-catalogue > i',
      },
      // The pager, which is the cleared search's own witness.
      {
        container: '[data-scoped-page="world-components"]',
        target: '[data-pagination-page]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The placeholder claim is gone (issue 1371), and dropping it is not optional bookkeeping:
    // `tests/manager-scoped-prop-contract.test.js` pairs "a case claims the shared placeholder
    // body" with "that route's page still imports it", so a real body left claiming the placeholder
    // publishes this route's screen as evidence of a placeholder change.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      // Issue 1371 r8-cat: the frame is this screen too.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/componentScoped\.js$/,
    ],
  }),
  managerCase({
    // The selection's own face (issue 1371).
    id: 'world-component-catalogue-bulk',
    label: 'Manager — World Component catalogue, bulk selection',
    reaches: 'beyond',
    smokeLabels: [],
    // One search over both subjects, AND A staged instruction (issue 1371, round 3).
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'salt' },
      { selector: '[data-scoped-list-select="tw-brine-salt"]' },
      { selector: '[data-scoped-list-select="al-saltpetre"]' },
      // Issue 1371 r8-cat: the tag is staged from the inset row.
      {
        selector: '[data-bulk-inset="tags"] [data-world-component-bulk-option="moss"]',
      },
      // AND the direction is staged last, which is also what scrolls the panel back to its HEAD.
      { selector: '[data-world-component-bulk-mode-option="remove"]' },
    ],
    expectView: 'world-components',
    expectSelector: '[data-world-component-bulk-panel]',
    expectContained: [
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-mode]',
      },
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-apply]',
      },
      // The two staged axes, so the frame is asserted to hold the changed panel rather than the
      // resting one.
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-mode-state]',
      },
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-tag-chip="moss"]',
      },
      // AND the three insets themselves (issue 1371 r8-cat, gap-list rows 43-45).
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-bulk-inset="systems"]',
      },
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-bulk-inset="tags"]',
      },
      // AND THE DANGER LEG (gap-list row 47), which is the one control on this panel that had no
      // counterpart at all before this revision.
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-danger]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ComponentCatalogueBulkPanel\.svelte$/,
    ],
  }),
  managerCase({
    // The entry editor's definition tab (issue 1371), reached the way a GM reaches it: through the
    // catalogue row's pen.
    id: 'world-component-entry-definition',
    label: 'Manager — World Component entry',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-page="world-component-entry"]',
    expectContained: [
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-identity="sm-coal"]',
      },
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-source="sm-coal"]',
      },
      // THE PREVIEW RAIL IS THE GRID'S SECOND COLUMN (issue 1371, parity round 4), so it is in
      // the FIRST frame rather than below a fold: it no longer scrolls with the card stack, and
      // this claim is what would red if it were nested back inside the tab panel.
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-preview-tile]',
      },
      // The category card's claims moved to the tags case (issue 1371, round 2), because that is
      // the frame the card is fully drawn in.
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/,
      // The three children the entry was rebuilt as (issue 1371, parity round 4).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntrySourceCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPreviewRail\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    // The other half of the entry's definition tab (issue 1371, round 2), reached by scrolling.
    id: 'world-component-entry-tags',
    label: 'Manager — World Component entry, world classification',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-tags="sm-coal"]', scroll: true },
    ],
    expectView: 'world-component-entry',
    // One CARD, two columns (issue 1371, parity round 4): `proto:881-910` draws category and tags
    // in a single `World classification` card, and the two-card split this case used to photograph
    // is gone.
    expectSelector: '[data-scoped-entry-category="sm-coal"]',
    expectContained: [
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-category-label]',
      },
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-category-note]',
      },
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-vocabulary-exit]',
      },
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-tags="sm-coal"]',
      },
      {
        container: '[data-scoped-entry-tags="sm-coal"]',
        target: '[data-scoped-entry-tag-note]',
      },
      // One lit chip, AND it is the frame's point (issue 1371 r17, ux F-N2).
      {
        container: '[data-scoped-entry-tags="sm-coal"]',
        target: '[data-scoped-entry-tag="moss"][aria-pressed="true"]',
      },
      // The applied-but-unauthored chip (issue 1371 r18-entry, maintainer ruling M33, closing
      // D-CJ).
      {
        container: '[data-scoped-entry-tags="sm-coal"]',
        target:
          '[data-scoped-entry-tag="fuel"][aria-pressed="true"][data-scoped-entry-tag-unauthored]',
      },
    ],
    // The tag chip owns its own centre (issue 1371, revision 8 — ux F13).
    expectCenterHit: '[data-scoped-entry-tag="moss"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/],
  }),
  managerCase({
    // The entry's `Essence contribution` CARD (issue 1371 r18-entry, maintainer ruling M31),
    // reached by scrolling for the reason the tags case gives: the card follows `World
    // classification`, so at 1280x900 the definition frame shows its head and the tops of its tiles
    // and puts the steppers under the panel's fold, where every assertion passes on a frame that
    // shows no control.
    id: 'world-component-entry-essences',
    label: 'Manager — World Component entry, essence contribution',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-essences="sm-coal"]', scroll: true },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-entry-essences="sm-coal"]',
    expectContained: [
      // The grid of shared quantity cards, one per WORLD essence, with the elected `fire` value
      // drawn as a CONTRIBUTING tile; the note that counts the section's inheritors; and the
      // rail's essence run, which follows the same map and is the frame's other half.
      {
        container: '[data-scoped-entry-essences="sm-coal"]',
        target: '[data-scoped-entry-essence-grid]',
      },
      {
        container: '[data-scoped-entry-essences="sm-coal"]',
        target: '[data-component-edit-essence="fire"][data-component-essence-active="true"]',
      },
      {
        container: '[data-scoped-entry-essences="sm-coal"]',
        target: '[data-scoped-entry-essence-note]',
      },
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-preview-essences] [data-essence-chip="fire"]',
      },
    ],
    // THE STEPPER IS THE NEW CONTROL (issue 1371 r18-entry): a real pointer hit on its `+`, because
    // a grid that overflowed its card or a head that overlapped it would leave a control present
    // in the DOM, correct in every mounted assertion and unclickable on screen.
    expectCenterHit:
      '[data-scoped-entry-essences="sm-coal"] [data-component-edit-essence="fire"] [data-stepper-increment]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/,
      // The shared quantity card is the frame's subject too: a change to it moves every tile here.
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceQuantityCard\.svelte$/,
    ],
  }),
  managerCase({
    // The maintainer's second exhibit (issue 1371, parity round 4): `Systems using this component`,
    // and the `Delete from the world` card under it.
    id: 'world-component-entry-systems',
    label: 'Manager — World Component entry, systems and deletion',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-delete-card]', scroll: true },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-entry-systems="sm-coal"]',
    expectContained: [
      // THE HEAD, ITS ACTION AND THE SEGMENTED FILTER, which round 3 drew as a bare kicker
      // reading the data and a `<select>`.
      {
        container: '[data-scoped-entry-systems="sm-coal"]',
        target: '[data-scoped-entry-add-to-systems]',
      },
      {
        container: '[data-scoped-entry-systems="sm-coal"]',
        target: '[data-scoped-entry-system-filter="without"]',
      },
      {
        container: '[data-scoped-entry-systems="sm-coal"]',
        target: '[data-scoped-entry-system-count]',
      },
      // AND THE DANGER CARD, with its reach note beside the armed control.
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-delete-note]',
      },
    ],
    // Two pointer proofs on one frame (issue 1371, revision 8 — ux F13), because these are the two
    // controls on this screen a compressed row can swallow and no mounted test can see: happy-dom
    // lays nothing out, so every mounted assertion about either passes on a zero-sized target.
    expectCenterHit:
      '[data-scoped-entry-system="lab-smithing"] [data-arm-token="scoped-membership-remove:sm-coal|lab-smithing"]',
    expectClick: '[data-arm-token="world-component-delete:sm-coal"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntrySystemsCard\.svelte$/,
    ],
  }),
  managerCase({
    // The validation tab, on the one lab component that fails a blocking check: `lab-unbound-salt`
    // is seeded with no source uuid at all, so `No source item linked` blocks and the two world
    // classification rows warn.
    id: 'world-component-entry-validation',
    label: 'Manager — World Component entry, validation',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Unbound Salt' },
      { selector: '[data-scoped-list-inspect="lab-unbound-salt"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-tab="validation"]' },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-entry-validation]',
    expectContained: [
      {
        container: '[data-scoped-entry-validation]',
        target: '[data-scoped-entry-check="source"]',
      },
      {
        container: '[data-scoped-entry-validation]',
        target: '[data-scoped-entry-check="worldCategory"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [/^src\/ui\/model\/componentScopeValidation\.js$/],
  }),
  managerCase({
    // The frame the world Component entry and the system component rules editor share stacks its
    // rail under its content column below `@container fabricate-manager (max-width: 1000px)`, and
    // until this revision nothing in the registry reached that state on either consumer — while
    // their three neighbours (`manager-components-stacked`, `manager-essences-stacked`,
    // `manager-tags-categories-stacked`) all have one.
    id: 'world-component-entry-stacked',
    label: 'Manager — World Component entry stacked',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      // The strip into view before the pointer TEST.
      { selector: '[data-scoped-entry-tab="definition"]', scroll: true },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-page="world-component-entry"]',
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: '.manager-component-entry-page',
      expectedTracks: 1,
    },
    expectCenterHit: '[data-scoped-entry-tab="definition"]',
    expectContained: [
      {
        container: '.manager-component-entry-page',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    // 980 rather than the registry's usual 1024, and the twenty-two pixels are measured rather than
    // chosen: the lab's manager container resolves to the window width minus two (measured at five
    // widths), and the frame's own query is `max-width: 1000px` on that container.
    position: { width: 980, height: 860 },
    kinds: ['manager', 'world', 'scoped', 'responsive'],
    // The frame is the SHEET's and the two pages that wear it, so a change to either page or to
    // the shared rail selects this frame alongside its wide twin.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPreviewRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-vocabulary',
    label: 'Manager — World Tags & Categories',
    reaches: 'beyond',
    smokeLabels: [],
    // The leaf whose label is character-for-character identical to the system-scope entry further
    // up the same rail.
    steps: [{ selector: '#manager-world-nav-vocabulary' }],
    expectView: 'world-vocabulary',
    expectSelector: '[data-scoped-page="world-vocabulary"]',
    // The three delete controls, one per panel, each keyed on its own panel (issue 1392).
    expectContained: [
      {
        container: '[data-wvocab-panel="recipeCategories"]',
        target: '[data-recipe-category-id] .manager-icon-button',
      },
      {
        container: '[data-wvocab-panel="componentCategories"]',
        target: '[data-component-category-id] .manager-icon-button',
      },
      {
        container: '[data-wvocab-panel="componentTags"]',
        target: '[data-component-tag-id] .manager-icon-button',
      },
    ],
    // Taller than the world scoped-entity cases, and the extra 100px is the full-width tag band
    // (issue 1392).
    position: { width: 1280, height: 1000 },
    kinds: ['manager', 'world', 'scoped'],
    // The `ScopedPlaceholderPage` claim is deleted here, not merely joined by the new patterns
    // (issue 1392).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldVocabularyPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldVocabularyStudio\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyPanel\.svelte$/,
    ],
  }),
  // The catalogue's `ScopedPlaceholderPage` claim is deleted here, not merely joined by the new
  // patterns.
  managerCase({
    id: 'world-essence-catalogue',
    label: 'Manager — World Essence Catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    // The second step selects A row, AND without it this case photographs the wrong screen.
    steps: [
      { selector: '#manager-world-nav-essence-catalogue' },
      { selector: '[data-scoped-list-inspect]' },
    ],
    expectView: 'world-essences',
    expectSelector: '[data-scoped-page="world-essences"]',
    // The rows AND the filled inspector, proved present rather than assumed.
    expectContained: [
      {
        container: '[data-scoped-list]',
        target: '[data-scoped-list-row] [data-medallion="glyph"]',
      },
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inherit-note="effectSource"]',
      },
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inspector-foot]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldEssenceCataloguePage\.svelte$/,
      // The two shared list primitives this screen composes (issue 1380).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/Entity(?:CatalogueShell|ListInspectorFrame)\.svelte$/,
      // The `SYSTEM RULES n / m` panel the shell's inspector composes (issue 1372).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/SystemRulesRoster\.svelte$/,
      // The inspector's foot action, which this case draws and did not claim (issue 1446).
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
      /^src\/ui\/model\/scopedEntityListModel\.js$/,
    ],
  }),
  managerCase({
    id: 'world-essence-entry',
    label: 'Manager — World Essence entry',
    reaches: 'beyond',
    smokeLabels: [],
    // Reached the way A GM reaches it, through the catalogue row's pen.
    steps: [
      { selector: '#manager-world-nav-essence-catalogue' },
      { selector: '[data-scoped-list-action="open-entry"]' },
    ],
    expectView: 'world-essence-entry',
    expectSelector: '[data-scoped-page="world-essence-entry"]',
    // Both world-default cards, with their inherit lines. A frame that showed the identity fields
    // alone would show nothing this screen exists for.
    expectContained: [
      {
        container: '[data-scoped-page="world-essence-entry"]',
        target: '[data-scoped-world-default="effectSource"]',
      },
      {
        container: '[data-scoped-entry-defaults-section]',
        target: '[data-scoped-world-default="macro"]',
      },
      {
        container: '[data-scoped-world-default="effectSource"]',
        target: '[data-scoped-world-default-inherit="effectSource"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldEssenceEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/MembershipActions\.svelte$/,
      // The buffered-save seam (issue 1372): the header's `← Back` / `Save essence` pair and the
      // draft leaf behind it.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-essence-entry-dirty',
    label: 'Manager - World Essence entry, unsaved',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the explicit save exists for (issue 1372, maintainer parity round 4).
    steps: [
      { selector: '#manager-world-nav-essence-catalogue' },
      { selector: '[data-scoped-list-action="open-entry"]' },
      { selector: '[data-scoped-entry-name]', fill: 'Aetherlight' },
      { selector: '[data-scoped-entry-colour] [data-manager-color-token="sage"]' },
    ],
    expectView: 'world-essence-entry',
    expectSelector: '[data-scoped-page="world-essence-entry"]',
    // The header pair, proved present and inside the band that owns it.
    expectContained: [
      {
        container: '.manager-header-actions',
        target: '[data-world-essence-save]',
      },
      {
        container: '.manager-header-actions',
        target: '[data-world-essence-back]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The same three files the resting case claims, deliberately: this is the `-narrow` / `-normal`
    // relationship, where one screen is photographed in two states and a change to it publishes
    // both.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldEssenceEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-list-head',
    label: 'Manager — World Tools Catalogue, list head',
    reaches: 'beyond',
    smokeLabels: [],
    // The one state the resting catalogue frame cannot show (issue 1373).
    steps: [{ selector: '#manager-world-nav-tool-catalogue' }],
    expectView: 'world-tools',
    expectSelector: '[data-item-drop-zone="tool-create"]',
    expectContained: [
      // THE ZONE, INSIDE THE LIST. Rendered anywhere on the screen it would satisfy
      // `expectSelector`; this is what proves it is in the list rather than beside the card.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-item-drop-zone="tool-create"]',
      },
      // AND THE BREAKAGE CARD STILL SPANNING THE COLUMN ABOVE IT, which is the other half of the
      // same move: the card only reaches the pane's edge because the zone left its row.
      {
        container: '[data-world-tool-break-mode]',
        target: '[data-world-tool-break-segment="checkDriven"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      // The frame that owns the `listLead` slot and the list scroller the zone sits in.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue',
    label: 'Manager — World Tools Catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    // `Tools Catalogue` is plural where its siblings are singular, and `Tools` is a live substring
    // of it — which is why the shipped `Tools` rail entry could no longer be reached by text
    // either.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-scoped-list-inspect="sm-tool-hammer"]' },
    ],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-page="world-tools"]',
    // The real catalogue, not the placeholder (issue 1373).
    expectContained: [
      {
        container: '[data-world-tool-break-mode]',
        target: '[data-world-tool-break-segment="toolSpecific"]',
      },
      // THE FACT RUN, which is where a Tool row's badges live since issue 1373: the design puts
      // the chips under the NAME and the frame renders them inside the identity column, so a
      // trailing-column assertion would be measuring a container the row no longer uses.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-row-facts]',
      },
      // AND the foot pager, which eleven rows now have (issue 1373, maintainer feedback round 2).
      {
        container: '.manager-scoped-list-column',
        target: '[data-pagination-page]',
      },
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inherit-count="breakage"]',
      },
      // The fifth inspector CARD is gone, and nothing replaces it here.
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The placeholder claim is gone, and dropping it is not optional bookkeeping.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      // `MembershipActions` is no longer claimed here, AND no case replaces it (issue 1373).
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-page-two',
    label: 'Manager — World Tools Catalogue, page two',
    reaches: 'beyond',
    smokeLabels: [],
    // The pager, driven (issue 1373, maintainer feedback round 2).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
    ],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-page="world-tools"]',
    expectContained: [
      // THE ROW THAT ONLY PAGE TWO HAS. Present anywhere it would satisfy a bare selector; this
      // says the walk actually landed on the page that holds it.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-row="lab-tool-unlinked"] [data-scoped-list-source]',
      },
      // AND THE BAR ITSELF, inside the LIST column rather than the inspector's - the roster panel
      // beside it carries a pager of its own, so an unscoped assertion is answered by that one.
      {
        container: '.manager-scoped-list-column',
        target: '[data-pagination-prev]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      // The page window itself. It is restated on the lifted view-state, and a change there with
      // no claim would publish a frame of some other screen as evidence that the pager moved.
      /^src\/ui\/model\/managerBrowserViewState\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-bulk',
    label: 'Manager — World Tools Catalogue, bulk edit',
    reaches: 'beyond',
    smokeLabels: [],
    // The state that shipped broken AND that no case could see (issue 1373, maintainer feedback
    // round 2).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: 'label:has(input[data-scoped-list-select="sm-tool-anvil"])' },
      { selector: 'label:has(input[data-scoped-list-select="sm-tool-tongs"])' },
      { selector: 'label:has(input[data-scoped-list-select="hb-tool-mortar"])' },
      { selector: 'label:has(input[data-scoped-list-select="sm-tool-hammer"])' },
    ],
    expectView: 'world-tools',
    expectSelector: '[data-world-tool-bulk-panel]',
    expectContained: [
      // In the inspector's own column.
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-world-tool-bulk-panel]',
      },
      // The staged axis and the Apply that names the blast radius, both inside the panel: an
      // Apply outside its own dock would be a panel that had lost its primary action.
      {
        container: '[data-world-tool-bulk-panel]',
        target: '[data-world-tool-bulk-status]',
      },
      {
        container: '[data-world-tool-bulk-panel]',
        target: '[data-world-tool-bulk-apply]',
      },
      // AND the toolbar's own count, in the same frame.
      {
        container: '.manager-scoped-list-column',
        target: '[data-scoped-list-selection-count]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ToolCatalogueBulkPanel\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      // The shared bulk chrome the panel composes.
      /^src\/ui\/svelte\/apps\/manager\/BulkEditPanelShell\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/BulkEditSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/BulkSelectionToolbar\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-empty',
    label: 'Manager — World Tools Catalogue, empty world',
    reaches: 'beyond',
    smokeLabels: [],
    // The empty catalogue, which the fixture could not produce (issue 1373, maintainer feedback
    // round 2).
    query: { noTools: '1' },
    steps: [{ selector: '#manager-world-nav-tool-catalogue' }],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-list-state="empty"]',
    expectContained: [
      // The hero, under the zone AND inside the list.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-item-drop-zone="tool-create"]',
      },
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-state="empty"]',
      },
      // AND the inspector's own no-state, inside the column that owns it.
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inspector-state="resting"]',
      },
      // The scope band survives an empty corpus and is still confined to the LIST column - the
      // half of the finding that says the band must not span the inspector's track.
      {
        container: '.manager-scoped-list-column',
        target: '[data-world-tool-break-mode]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      // `EmptyState.svelte` AND `ItemDropZone.svelte` were claimed here AND are not anymore.
    ],
  }),
  // Until these four cases existed the registry contained zero steps naming
  // `data-scoped-list-search`, `data-scoped-list-sort`, `data-scoped-list-clear-filters` or
  // `data-scoped-list-state="filtered"` — across all of its cases, not just this screen's.
  managerCase({
    id: 'world-tool-catalogue-search',
    label: 'Manager — World Tools Catalogue, filtered by search',
    reaches: 'beyond',
    smokeLabels: [],
    // A typed search, which no case in the registry had ever driven on this frame.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-scoped-list-search]', fill: WORLD_TOOL_SEARCH_TERM },
    ],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-list-row="rw-tool-stylus"]',
    // Both survivors, inside the list.
    expectContained: [
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-row="rw-tool-punch"]',
      },
      {
        container: '.manager-scoped-list-column',
        target: '[data-scoped-list-count]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      // The model that answers the query.
      /^src\/ui\/model\/scopedEntityListModel\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-filtered-empty',
    label: 'Manager — World Tools Catalogue, filtered to nothing',
    reaches: 'beyond',
    smokeLabels: [],
    // Filtered to nothing is not an absence, and the frame draws a different panel to say so:
    // `EmptyState` at `filtered`, with a `Clear filters` action rather than the corpus-empty hero's
    // creation prompt.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-scoped-list-search]', fill: WORLD_TOOL_SEARCH_MISS_TERM },
    ],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-list-state="filtered"]',
    // The action, inside the panel.
    expectContained: [
      {
        container: '[data-scoped-list-state="filtered"]',
        target: '[data-scoped-list-clear-filters]',
      },
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-state="filtered"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-sorted-desc',
    label: 'Manager — World Tools Catalogue, sorted by systems descending',
    reaches: 'beyond',
    smokeLabels: [],
    // The two halves of the sort control, in one frame, and neither was in any frame before.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      ...chooseSelectOption('[data-scoped-list-sort]', 'systems'),
      { selector: '[data-scoped-list-direction]' },
    ],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-list-direction="desc"]',
    // The toggle is live here, which is the half that separates this frame from its sibling below:
    // `systems` is one of the frame's own sort keys, so the direction composes with it and the
    // control is enabled.
    expectAttributes: [
      { selector: '[data-scoped-list-direction]', name: 'aria-pressed', value: 'false' },
    ],
    expectContained: [
      {
        container: '.manager-scoped-list-column',
        target: '[data-scoped-list-direction]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-sort-lane-inert',
    label: 'Manager — World Tools Catalogue, the lane sort with the direction inert',
    reaches: 'beyond',
    smokeLabels: [],
    // The sharpest of the four, and the one written for a frame that did not exist.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      ...chooseSelectOption('[data-scoped-list-sort]', 'break-asc'),
    ],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-list-direction][disabled]',
    // `aria-pressed` still follows `asc`, which is the second half of "inert, not hidden": the
    // control keeps saying which way the order runs even though pressing it would do nothing.
    expectAttributes: [
      { selector: '[data-scoped-list-direction]', name: 'aria-pressed', value: 'true' },
    ],
    expectContained: [
      {
        container: '.manager-scoped-list-column',
        target: '[data-scoped-list-direction]',
      },
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-row="lab-tool-warped-crucible"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      // The lane descriptor itself: `worldToolSorts` is the only `sorts` array on this screen and
      // it is what makes the toggle inert at all.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  // An enumeration of ~200 reachable states over the four Tool surfaces turned up four that look
  // like coverage gaps and are not.
  managerCase({
    id: 'world-tool-entry',
    label: 'Manager — World Tool entry',
    reaches: 'beyond',
    smokeLabels: [],
    // Reached by clicking A catalogue row, which is the only way in: the entry route takes an
    // entity id the rail cannot supply.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-scoped-page="world-tool-entry"]',
    // A section tab open with its inherit count, the read-only world break mode, and at least one
    // per-system row.
    expectContained: [
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-world-tool-entry-inherit-count="breakage"]',
      },
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-world-tool-entry-break-label]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
      // The buffered-save seam (issue 1373), claimed by the second screen that renders it.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-dirty',
    label: 'Manager — World Tool entry, unsaved',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the explicit save exists for (issue 1373), and the twin of
    // `world-essence-entry-dirty` beside it.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-name]', fill: 'Smith\u{2019}s Great Hammer' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-scoped-page="world-tool-entry"]',
    // The header pair, proved present and inside the band that owns it.
    expectContained: [
      {
        container: '.manager-header-actions',
        target: '[data-world-tool-save]',
      },
      {
        container: '.manager-header-actions',
        target: '[data-world-tool-back]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The same files the resting case claims, deliberately: one screen photographed in two states,
    // where the resting frame shows the screen and this one shows that its Save is a live control.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-overview',
    label: 'Manager — World Tool entry, Overview',
    reaches: 'beyond',
    smokeLabels: [],
    // A second frame on one screen, because the entry's two tabs make different decisions and its
    // sibling case opens Breakage.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-card="enabled"]',
    // The switch AND the consequence count beside it.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="enabled"]',
        target: '[data-world-tool-entry-enabled]',
      },
      // AND the optional display label's helper (issue 1373).
      {
        container: '[data-world-tool-entry-card="display-label"]',
        target: '[data-world-tool-entry-name-hint]',
      },
      // The header `Delete`, which the design draws between Back and Save and which this screen did
      // not have.
      {
        container: '.manager-header-actions',
        target: '[data-arm-token^="world-tool-delete:"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-unlinked',
    label: 'Manager — World Tool entry, no linked Item',
    reaches: 'beyond',
    smokeLabels: [],
    // The other face of the source tile, which no case reached (issue 1373, maintainer round 2).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
      {
        selector:
          '[data-scoped-list-row="lab-tool-unlinked"] [data-scoped-list-action="open-entry"]',
      },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-card="linked-item"]',
    // Both halves of the unlinked face, inside the card that owns them: the drop prompt itself and
    // the sentence that says what the record has without an Item.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="linked-item"]',
        target: '[data-item-drop-zone="tool-source"]',
      },
      {
        container: '[data-world-tool-entry-card="linked-item"]',
        target: '[data-world-tool-entry-unlinked]',
      },
      // AND the world master switch, off (issue 1373).
      {
        container: '[data-world-tool-entry-card="enabled"]',
        target: '[data-world-tool-entry-enabled="off"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-source-missing',
    label: 'Manager — World Tool entry, linked Item deleted',
    reaches: 'beyond',
    smokeLabels: [],
    // The third face of the source tile, and the one no corpus state could reach (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
      {
        selector:
          '[data-scoped-list-row="lab-tool-warped-crucible"] [data-scoped-list-action="open-entry"]',
      },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-item-drop-zone="tool-source"]',
    // The missing face itself, by its own state value.
    expectAttributes: [
      {
        selector: '[data-item-drop-zone="tool-source"]',
        name: 'data-item-drop-state',
        value: 'missing',
      },
    ],
    expectContained: [
      {
        container: '[data-world-tool-entry-card="linked-item"]',
        target: '[data-item-drop-zone="tool-source"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-name-blank',
    label: 'Manager — World Tool entry, display label left blank',
    reaches: 'beyond',
    smokeLabels: [],
    // The optional field, actually left blank (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-name]', fill: '' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-card="display-label"]',
    // The field AND its helper, inside the card.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="display-label"]',
        target: '[data-world-tool-entry-name]',
      },
      {
        container: '[data-world-tool-entry-card="display-label"]',
        target: '[data-world-tool-entry-name-hint]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-requirements',
    label: 'Manager — World Tool entry, Requirements',
    reaches: 'beyond',
    smokeLabels: [],
    // The fourth tab, which the screen did not have (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="requirements"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-requirements-tab]',
    // THE TWO CONTROLS AND THE REACH LINE. A frame proving the tab exists but not that each
    // section states how many systems inherit it would be evidence for the strip alone.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-prerequisites-enabled]',
      },
      // The reach line moved inside the section it counts (issue 1373, maintainer round 2).
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-section-note="prerequisites"]',
      },
      // AND the bonus is A pick from the world modifier library (issue 1373, maintainer round 3).
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-modifier]',
      },
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-note]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // BOTH of this tab's lists' row (issue 1373, rounds 4 and 5) — the bonus list, shared
      // with the Checks Studio catalogue, and the prerequisite list above it.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      // The card the tab draws each of its two sections as (issue 1373).
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolInheritCard\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-bonus-empty-library',
    label: 'Manager — World Tool entry, bonus with no world modifiers',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the maintainer's own world is in (issue 1373, maintainer round 3): the bonus
    // section selects over the world modifier library, and most worlds have authored none.
    query: { clearSystem: '1' },
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="requirements"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-bonus-empty]',
    // BOTH SENTENCES, because the claim is that the two absences read the same way. Asserting
    // the bonus one alone would pass just as well against a second voice invented for it.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-empty]',
      },
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-note]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // The bonus list's ROW, shared with the Checks Studio catalogue (issue 1373, round 4).
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-unlimited-uses',
    label: 'Manager — World Tool entry, an unlimited-uses world default',
    reaches: 'beyond',
    smokeLabels: [],
    // The first-run breakage state, which no frame reached (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-anvil"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
    ],
    expectView: 'world-tool-entry',
    // The chosen CARD AND the absent inset, in one selector, and the absence is the load-bearing
    // half.
    expectSelector:
      '[data-world-tool-entry-card="breakage"]' +
      ':has([data-world-tool-entry-breakage-mode="unlimited"] input:checked)' +
      ':not(:has([data-world-tool-entry-breakage-value]))',
    // THE SUMMARY LINE, which is the reading the stepper used to contradict. With the fourth mode
    // in the list the card and the line agree, and this is the frame in which they can be read
    // against each other.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="breakage"]',
        target: '[data-world-tool-entry-breakage-summary]',
      },
      {
        container: '[data-world-tool-entry-card="breakage"]',
        target: '[data-world-tool-entry-breakage-mode="unlimited"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-validation',
    label: 'Manager — World Tool entry, Validation',
    reaches: 'beyond',
    smokeLabels: [],
    // The fourth tab, which had no frame at all (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
      {
        selector:
          '[data-scoped-list-row="lab-tool-warped-crucible"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="validation"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-validation]',
    // The summary, the counts rail AND A named check.
    expectContained: [
      {
        container: '[data-world-tool-entry-validation]',
        target: '[data-editor-validation-summary]',
      },
      {
        container: '[data-world-tool-entry-validation]',
        target: '[data-editor-validation-count="warnings"]',
      },
      {
        container: '[data-world-tool-entry-validation]',
        target: '[data-world-tool-entry-check="breakage-value"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      // The shared shell BOTH validation tabs are callers of, claimed on the frame that draws its
      // world face. Its only other claim is `manager-essence-edit-validation`.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedValidationTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-empty',
    label: 'Manager — World Tool entry, an empty repair set',
    reaches: 'beyond',
    smokeLabels: [],
    // The state A GM is in the instant they pick `Mark as broken`, and it was drawn by nothing
    // (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-world-tool-entry-onbreak-mode="flagBroken"]' },
    ],
    expectView: 'world-tool-entry',
    // THE COUNT AT ZERO, which is the one selector that separates this frame from its populated
    // twin. `[data-tool-repair-requirements]` alone is satisfied by either.
    expectSelector: '[data-tool-repair-count="0"]',
    expectContained: [
      {
        container: '[data-world-tool-entry-card="on-break"]',
        target: '[data-tool-repair-requirements]',
      },
      {
        container: '[data-tool-repair-requirements]',
        target: '[data-tool-repair-summary]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      // The sentence generator, which is the whole of what this frame's last line shows and
      // which had no claim of its own once the list cases stopped swallowing `tools/`.
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolRepairSummary\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientSetCard\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-replace-empty',
    label: 'Manager — World Tool entry, a replacement with no target chosen',
    reaches: 'beyond',
    smokeLabels: [],
    // `ToolReplacementTarget`'s empty face, which has sixty lines of CSS written for it and no
    // frame at either scope (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-world-tool-entry-onbreak-mode="replaceWith"]' },
    ],
    expectView: 'world-tool-entry',
    // The drop face, by its own idle value.
    expectSelector: '[data-tool-replacement-drop="idle"]',
    expectContained: [
      {
        container: '[data-world-tool-entry-card="on-break"]',
        target: '[data-tool-replacement-target]',
      },
      {
        container: '[data-tool-replacement-drop="idle"]',
        target: '.manager-tool-replacement-component-trigger',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolReplacementTarget\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair',
    label: 'Manager — World Tool entry, repair route',
    reaches: 'beyond',
    smokeLabels: [],
    // A state no case could reach, which is why the screen shipped without the control (issue 1373,
    // maintainer round 2).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      // Scrolled, because the repair editor is the last thing in the second card of a panel that
      // also holds the read-only mode band and the whole breakage card.
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements]',
    // The rows AND the adders.
    expectContained: [
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-tool-repair-requirements] [data-recipe-group]',
      },
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-tool-repair-requirements] [data-recipe-add="component"]',
      },
      {
        container: '[data-tool-repair-requirements] .manager-recipe-ingredient-option-row.is-tag',
        target: '[data-tool-repair-requirements] [data-recipe-option-tags]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      // The row itself, because this is the only frame in the registry that photographs a tag
      // requirement inside a Tool inspector.
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-empty-catalogue',
    label: 'Manager — World Tool entry, repair route with no catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the maintainer's own world is in (issue 1373, maintainer round 5).
    query: { clearSystem: '1', noAuthoredWorldComponents: '1' },
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements]',
    // The degraded field itself, not merely the section.
    expectContained: [
      {
        container: '[data-tool-repair-requirements] [data-recipe-option]',
        target: '[data-recipe-option-search]',
      },
      {
        container: '[data-tool-repair-requirements] [data-recipe-option]',
        target: '[data-recipe-option-empty-catalogue] input',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-empty-tag',
    label: 'Manager — World Tool entry, repair route with an empty tag row',
    reaches: 'beyond',
    smokeLabels: [],
    // The row the maintainer authored, which no fixture could seed (issue 1373, maintainer round
    // 7).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
      { selector: '[data-tool-repair-requirements] [data-recipe-add="tag-requirement"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements]',
    // The arm, in A row that holds no chips.
    expectContained: [
      {
        container:
          '[data-tool-repair-requirements] .manager-recipe-ingredient-option-row.is-tag:last-of-type',
        target: '[data-tool-repair-requirements] [data-recipe-option-tags]:last-of-type',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientSetCard\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-tag-picker-empty',
    label: 'Manager — World Tool entry, the tag picker over a world with no tags',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the maintainer's own world is in, and the one the redesign is actually about.
    query: { noAuthoredWorldComponents: '1' },
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
      { selector: '[data-tool-repair-requirements] [data-recipe-add-tag]' },
    ],
    expectView: 'world-tool-entry',
    // THE NOTE, BY ITS VARIANT CLASS. `.manager-empty` alone would pass over the dashed hero this
    // frame exists to prove is gone, and the popover alone would pass over a list of rows.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover .manager-travel-popover-empty ' +
      '.manager-empty.is-note',
    expectContained: [
      {
        container: '.fabricate-manager',
        target: '.fabricate-picker-popover .manager-travel-popover-empty',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-suggestions',
    label: 'Manager — World Tool entry, repair route with a suggestion list open',
    reaches: 'beyond',
    smokeLabels: [],
    // No case in the registry opened A suggestion list (issue 1373, maintainer round 7), which is
    // why the row that completes a typed name shipped centred and unphotographed.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
      { selector: '[data-tool-repair-requirements] [data-recipe-option-clear]' },
      { selector: '[data-tool-repair-requirements] [data-recipe-option-search]', fill: 'ingot' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements] [data-recipe-option-suggestion]',
    // The panel under the field it completes.
    expectContained: [
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-tool-repair-requirements] [data-recipe-option-suggestion]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-replace',
    label: 'Manager — World Tool entry, replacement component',
    reaches: 'beyond',
    smokeLabels: [],
    // The other unreachable state: replace-mode with a component attached.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="hb-tool-alembic"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-player-broken]' },
      // SCROLLED for the reason the repair frame is: the card is the last thing in the second
      // card of the panel, and its unlink control sits at the foot of it.
      { selector: '[data-tool-replacement-target]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-replacement-target]',
    // The filled face of the drop zone AND the tile it explains.
    expectContained: [
      {
        container: '[data-tool-replacement-target]',
        target: '[data-tool-replacement-tile]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-image="replacement"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolReplacementTarget\.svelte$/,
      // The rail's player tile is what this frame's second assertion is about, so a change to
      // the shared preview publishes it rather than a frame of the working copy alone.
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-destroyed-preview',
    label: 'Manager — World Tool entry, destroyed copy',
    reaches: 'beyond',
    smokeLabels: [],
    // The third face of `Show as broken`, and the one no case could reach (issue 1373, maintainer
    // round 2).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-tool-player-broken]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-preview]',
    expectContained: [
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-image="none"]',
      },
      // AND THE SENTENCE THAT EXPLAINS THE EMPTY BOX. With the chip gone, this note is the only
      // thing that says WHY the slot is empty, so a frame without it would show an absence with
      // no account of itself.
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-note]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-player-preview',
    label: 'Manager — World Tool entry, player preview',
    reaches: 'beyond',
    smokeLabels: [],
    // The third frame on this screen, and it is the only one that can show its preview column
    // (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      // Scrolled, because the column is what this frame is about and it does not fit.
      { selector: '[data-tool-required-for] .manager-pagination', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-preview]',
    // One assertion per region, against the preview column itself. A frame proving only the
    // inventory tile would be evidence for a third of the change.
    expectContained: [
      // The PLAYER tile, its name caption, the usability CARD AND the paged `Required for` list —
      // one per region.
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-preview]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-player-name]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-preview-usability]',
      },
      // The `Required for` region is asserted through its two parts rather than its wrapper, and
      // that is a real constraint rather than a weaker claim.
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-required-row]',
      },
      {
        container: '[data-world-tool-entry-preview]',
        target: '[data-tool-required-for] .manager-pagination',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // THE SHARED RAIL AND THE SHELL UNDER IT ARE BOTH CLAIMED, unlike this screen's other two
    // cases: every region in this frame is drawn by `ToolBehaviorPreview` through
    // `ScopedEntityPreview`'s trailing slot, so a change to either that only published a system
    // scope frame would leave the world rail unphotographed.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntityPreview\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-scoped-rail-collapsed',
    label: 'Manager — World scoped rail collapsed',
    reaches: 'beyond',
    smokeLabels: [],
    // Kept AND load-bearing. The prototype has no collapsed rail state, so the parity oracle
    // structurally cannot reach this; this frame and the full-width set-equality gate are its only
    // evidence.
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-manager-rail-toggle]' },
    ],
    expectView: 'world-components',
    // The ACTIVE leaf inside the collapsed rail. Asserting the leaf alone would pass on a rail
    // that never collapsed, so the state and the element are asserted together.
    expectSelector:
      '.manager-body.is-rail-collapsed #manager-world-nav-component-catalogue.is-active',
    // And every one of the four leaves keeps its glyph INSIDE its 56px button, which is what
    // makes the strip navigable at all once the labels are gone.
    expectContained: [
      {
        container: '#manager-world-nav-component-catalogue',
        target: '#manager-world-nav-component-catalogue > i',
      },
      { container: '#manager-world-nav-vocabulary', target: '#manager-world-nav-vocabulary > i' },
      {
        container: '#manager-world-nav-essence-catalogue',
        target: '#manager-world-nav-essence-catalogue > i',
      },
      {
        container: '#manager-world-nav-tool-catalogue',
        target: '#manager-world-nav-tool-catalogue > i',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-scoped-narrow',
    label: 'Manager — World scoped narrow',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [{ selector: '#manager-world-nav-component-catalogue' }],
    expectView: 'world-components',
    expectSelector: '[data-scoped-page="world-components"]',
    // The absence of the dead strip, measured in the browser rather than inferred from the
    // stylesheet. `expectedTracks: 2` is the released column; `absentSelector` is the aside.
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: '.manager-body',
      expectedTracks: 2,
      absentSelector: '.manager-inspector',
    },
    position: { width: 1024, height: 860 },
    kinds: ['manager', 'world', 'scoped', 'responsive'],
    // The placeholder claim is gone here too (issue 1371).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-recipes-normal',
    label: 'Manager — Recipes normal',
    smokeLabels: ['manager-recipes-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Crafting'],
    expectView: 'recipes',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  managerCase({
    id: 'manager-recipes-blocked-enable-flash',
    label: 'Manager — Recipes blocked-enable flash',
    // The flash, which no case reached (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `sm-r-runeplate-draft` is the lab's one OFF-and-un-enableable recipe — an incomplete shell
    // with no result groups, which also requires the disabled `aether` essence — so its row's
    // switch is the one gesture in the corpus that produces a refusal rather than a write.
    query: { system: 'lab-smithing' },
    steps: [
      'Crafting',
      {
        selector:
          '.manager-recipe-row[data-recipe-id="sm-r-runeplate-draft"]' +
          ' .manager-recipe-status .manager-status-toggle',
      },
    ],
    expectView: 'recipes',
    // The alert AND its dismiss control, because the flash is specified as dismissible and
    // non-auto-hiding: an alert drawn without its control is a different contract from the one this
    // frame is evidence for.
    expectSelector:
      '.fabricate-manager .fab-notice[data-recipe-flash][role="alert"]' +
      ':has(.fab-notice-title)' +
      ' [data-notice-dismiss]',
    // The refusal is logged, AND the log is the state working (issue 1515, driver capture).
    allowedConsoleErrors: [/Fabricate \| Failed to toggle recipe enabled state/],
    // The flash has to be in the picture, not merely in the DOM.
    expectContained: [{ container: '.manager-main', target: '[data-recipe-flash]' }],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  managerCase({
    id: 'manager-recipes-narrow',
    label: 'Manager — Recipes narrow',
    smokeLabels: ['manager-recipes-narrow'],
    reaches: 'exact',
    query: {},
    steps: ['Crafting'],
    expectView: 'recipes',
    position: { width: 900, height: 700 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  managerCase({
    id: 'manager-recipes-no-check',
    label: 'Manager — Recipes no check',
    smokeLabels: ['manager-recipes-no-check'],
    // The row's "No check" warning pill is a SYSTEM-level fact, not a recipe one:
    // `_buildRecipeCheckSummary` reports `kind: 'none'` for any non-`routedByIngredients` system
    // whose check slot carries no authored roll formula — "check enabled" is not the same thing.
    reaches: 'exact',
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-check-roll-formula]', fill: '' },
      // The Checks view is a staged editor: typing only marks the draft dirty, and the browser's
      // check pills read the persisted system.
      { selector: '[data-checks-save]' },
      'Crafting',
    ],
    expectView: 'recipes',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  managerCase({
    id: 'manager-recipes-grouped-continuation',
    label: 'Manager — Recipes grouped continuation',
    smokeLabels: ['manager-recipes-grouped-continuation'],
    // Page two of a grouped list: with "Group by category" on, ordering is category-major before
    // pagination, so a category larger than the page continues across the boundary instead of being
    // re-sliced alphabetically per page.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      ...chooseSelectOption('.manager-main [data-pagination-size]', '10'),
      { selector: '.manager-main [data-pagination-next]' },
    ],
    expectView: 'recipes',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  // Three frames, because the panel's five axes cannot be photographed in one.
  managerCase({
    id: 'manager-recipes-bulk-edit',
    label: 'Manager — Recipes bulk edit',
    smokeLabels: ['manager-recipes-bulk-edit'],
    // The staged face, over two ordinary Weaponsmithing recipes.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
      ...chooseSelectOption('[data-recipe-bulk-category]', 'Armoursmithing'),
      { selector: '[data-recipe-bulk-status-option="enable"]' },
      { selector: '[data-recipe-bulk-lock-option="lock"]' },
      // Karrun Forgecraft is the only lab system that authors check tiers, so this select is the
      // only populated one in the world; every other system renders the info Callout instead.
      ...chooseSelectOption('[data-recipe-bulk-check-tier]', 'sm-tier-masterwork'),
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-book"]' },
      { selector: '[data-recipe-bulk-book-add]' },
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-almanac"]' },
      { selector: '[data-recipe-bulk-book-remove]' },
    ],
    expectView: 'recipes',
    // Both staged states must be on screen at once, or a control that shows one book at a time
    // reads as a control that stages one book at a time.
    expectSelector:
      '.fabricate-manager [data-bulk-book-state="add"] ~ [data-bulk-book-state="remove"], ' +
      '.fabricate-manager [data-bulk-book-state="remove"] ~ [data-bulk-book-state="add"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  managerCase({
    id: 'manager-recipes-bulk-edit-unstaged',
    label: 'Manager — Recipes bulk edit unstaged',
    smokeLabels: ['manager-recipes-bulk-edit-unstaged'],
    // The pristine face: a selection and nothing staged.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
    ],
    expectView: 'recipes',
    expectSelector: '.fabricate-manager [data-recipe-bulk-apply][disabled]',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  managerCase({
    id: 'manager-recipes-bulk-edit-blocked',
    label: 'Manager — Recipes bulk edit blocked',
    smokeLabels: ['manager-recipes-bulk-edit-blocked'],
    // The blocked face, and the frame acceptance criterion 6 is settled by: the panel's warning
    // Callout counting the same rows the browser has pilled, in one photograph, so the two cannot
    // be shown to disagree.
    reaches: 'exact',
    query: {},
    // Order is load-bearing, and `expectSelector` cannot enforce it: a click auto-scrolls its
    // target into view, so whichever row is ticked last is the one the frame is scrolled to.
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-runeplate-draft"])' },
      { selector: '[data-recipe-bulk-status-option="enable"]' },
    ],
    expectView: 'recipes',
    // Both halves of the claim, in one selector, because either alone would publish a lie: a
    // Callout with no pilled row says the panel invented a count, and a pilled row with no Callout
    // is the plain browser frame under a case named for the warning.
    expectSelector:
      '.fabricate-manager:has([data-recipe-bulk-blocked-warning]) ' +
      '.manager-recipe-row[data-recipe-id="sm-r-runeplate-draft"]:has(.manager-chip.is-danger)',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  // The staged case opens the picker, picks, presses the action and repeats; the pick clears on
  // staging by design, so that frame lands on the trigger plus the staged list.
  managerCase({
    id: 'manager-recipes-bulk-edit-picker',
    label: 'Manager — Recipes bulk edit picker',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
      { selector: '.fab-bulk-book-trigger' },
    ],
    expectView: 'recipes',
    // Three claims in one selector, and the trigger-only frame satisfies none of them: the popover
    // exists at all, it is portaled into the manager (the whole reason it escapes the inspector's
    // `overflow: hidden`), and its rows carry the second meta line — which is the fact the GM
    // chooses on and which only renders when the option was given one.
    expectSelector:
      '.fabricate-manager .manager-travel-popover ' +
      '[data-popover-option="sm-book"] .manager-travel-option-meta',
    kinds: ['manager', 'recipes'],
    // Spread, not the shared array (issue 1500).
    sourceMatches: [...RECIPE_BULK_EDIT_MATCHES, ...ANCHORED_POPOVER_SOURCES],
  }),
  managerCase({
    id: 'manager-recipes-bulk-edit-pick-card',
    label: 'Manager — Recipes bulk edit pick card',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-book"]' },
    ],
    expectView: 'recipes',
    // The card for the Folio, which holds neither selected recipe — so `Add 2` is live and `Remove`
    // is dead with its count dropped rather than rendered as `Remove 0`.
    expectSelector:
      '.fabricate-manager [data-recipe-bulk-book-pick="sm-book"]' +
      ':has([data-recipe-bulk-book-add]:not([disabled]))' +
      ':has([data-recipe-bulk-book-remove][disabled])',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  // The third surface this panel cannot hold, and the first frame in the registry that draws a
  // `<Select>`'s option list at all.
  managerCase({
    id: 'manager-recipes-bulk-edit-check-tier',
    label: 'Manager — Recipes bulk edit check tier list',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    // The staged case's own walk, stopped one step into its fourth axis: the same two ordinary
    // Weaponsmithing recipes, then the check-tier trigger and no row click — so the frame is the
    // open list rather than what choosing from it stages.
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
      { selector: '[data-recipe-bulk-check-tier]' },
    ],
    expectView: 'recipes',
    // Four claims, and the trigger-only frame satisfies none of them: the panel exists, it is
    // portaled onto the manager root (the whole reason it escapes the rail's `overflow: hidden`),
    // it is the ticked configuration, and the row this frame is named for carries a tick element of
    // its own.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="sm-tier-masterwork"]:has(.fabricate-select-tick)',
    // The two affordances the frame is for, asserted geometrically because both are things a
    // reviewer reads off the picture: a group heading and a per-option hint, each inside the
    // panel's own box rather than clipped by it.
    expectContained: [
      { container: '.fabricate-manager', target: '.fabricate-select-popover' },
      { container: '.fabricate-select-popover', target: '.manager-travel-popover-group-label' },
      { container: '.fabricate-select-popover', target: '.fabricate-select-hint' },
    ],
    kinds: ['manager', 'recipes'],
    // SPREAD, not the shared array, for the reason `manager-recipes-bulk-edit-picker` records:
    // this and that frame are the two bulk-edit frames that rest on an OPEN panel, so they are the
    // two that must answer for the positioning seam.
    sourceMatches: [...RECIPE_BULK_EDIT_MATCHES, ...ANCHORED_POPOVER_SOURCES],
  }),
  // Both frames run on herbalism, not on the flagship smithing library every other recipe case
  // photographs, and the choice is the whole reason these frames say anything.
  managerCase({
    id: 'manager-recipes-bulk-delete-idle',
    label: 'Manager — Recipes bulk delete idle',
    smokeLabels: [],
    reaches: 'beyond',
    // The unarmed face: the impact statement and the standing permanence hint, rendered before the
    // control is armed.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="hb-r-healing"])' },
      { selector: 'label:has(input[data-recipe-select="hb-r-salve"])' },
      { selector: 'label:has(input[data-recipe-select="hb-r-oil"])' },
      { selector: '[data-recipe-bulk-delete-card]', scroll: true },
    ],
    expectView: 'recipes',
    // UNARMED is the state under test, and `data-armed="false"` is what separates this frame
    // from its armed twin below — a selector naming only the card would pass on either.
    expectSelector: '.fabricate-manager [data-arm-token="delete-recipes"][data-armed="false"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      ...RECIPE_BULK_EDIT_MATCHES,
      /^src\/utils\/recipeDeleteImpact\.js$/,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-recipes-bulk-delete-armed',
    label: 'Manager — Recipes bulk delete armed',
    smokeLabels: [],
    reaches: 'beyond',
    // The armed half, and the frame whose final step clicks inside the delete card.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="hb-r-healing"])' },
      { selector: 'label:has(input[data-recipe-select="hb-r-salve"])' },
      { selector: 'label:has(input[data-recipe-select="hb-r-oil"])' },
      // The button, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it
      // arms, so this cannot drift onto a wrapper the way a class selector could.
      { selector: '[data-arm-token="delete-recipes"]' },
    ],
    expectView: 'recipes',
    // Armed is a STATE, and a frame that merely re-photographed the idle button would be
    // indistinguishable from the idle case above.
    expectSelector: '.fabricate-manager [data-arm-token="delete-recipes"][data-armed="true"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      ...RECIPE_BULK_EDIT_MATCHES,
      /^src\/utils\/recipeDeleteImpact\.js$/,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-crafting-group-expanded',
    label: 'Manager — Crafting group expanded',
    smokeLabels: ['manager-crafting-group-expanded'],
    // The rail's Crafting group expanded to all four subitems — Recipes, Books & Scrolls,
    // Knowledge, Settings — over a multi-category recipe library.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting'],
    expectView: 'recipes',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  managerCase({
    id: 'manager-books-scrolls-normal',
    label: 'Manager — Books scrolls normal',
    smokeLabels: ['manager-books-scrolls-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-books-scrolls' }],
    expectView: 'books-scrolls',
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
      // The inspector aside this route mounts (issue 1505).
      /^src\/ui\/svelte\/apps\/manager\/ItemPageInspector\.svelte$/,
      // The manager router and the Crafting entry model (issue 1151).
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/crafting\/craftingNav\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-books-scrolls-item',
    label: 'Manager — Books scrolls item',
    // The stat grid no frame drew (issue 1505).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-select="hb-book"]' },
    ],
    expectView: 'books-scrolls',
    // The GRID with its accented tile inside it, not the aside root: an inspector that kept its
    // chrome while the tiles stopped rendering would leave every other claim here true, and
    // `tone="info"` on the middle tile is the one reach of that tone anywhere in the tree.
    expectSelector: '[data-item-page-stats] [data-stat-tone="info"]',
    kinds: ['manager', 'books-scrolls'],
    // The inspector only.
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ItemPageInspector\.svelte$/],
  }),
  managerCase({
    id: 'manager-crafting-settings',
    label: 'Manager — Crafting settings',
    smokeLabels: ['manager-crafting-settings'],
    reaches: 'exact',
    query: {},
    steps: ['Crafting', { selector: '#manager-crafting-nav-settings' }],
    expectView: 'crafting-settings',
    kinds: ['manager', 'crafting-settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  }),
  managerCase({
    id: 'manager-recipe-item-overview',
    label: 'Manager — Recipe item overview',
    // The tab no frame landed on (issue 1505).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-edit="hb-book"]' },
    ],
    expectView: 'recipe-item-edit',
    // The panel, not the tab BUTTON: a strip that kept its buttons while the panel stopped
    // rendering would leave every other claim here true.
    expectSelector: '[data-recipe-item-tab="overview"]',
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-item-contents',
    label: 'Manager — Recipe item contents',
    // The tab between the two that had frames (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-edit="hb-book"]' },
      { selector: '[data-recipe-item-tab-button="contents"]' },
    ],
    expectView: 'recipe-item-edit',
    // The PANEL and the populated list inside it, not the tab BUTTON: a strip that kept its
    // buttons while the panel stopped rendering would leave every other claim here true, and the
    // list is what says the fixture's membership reached the screen rather than the empty line.
    expectSelector: '[data-recipe-item-tab="contents"] [data-recipe-item-contents-list]',
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-item-contents-picker',
    label: 'Manager — Recipe item contents, the link-recipe picker open',
    // The picker no case opened (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-edit="hb-book"]' },
      { selector: '[data-recipe-item-tab-button="contents"]' },
      { selector: '[data-recipe-item-link-recipe-toggle]' },
    ],
    expectView: 'recipe-item-edit',
    // The panel, its search row AND A row in it. The panel alone would pass over an empty list, and
    // the option row is what makes this frame evidence for the populated presentation.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover.manager-travel-popover' +
      ':has(.manager-travel-popover-search)' +
      ' .manager-travel-popover-options .manager-travel-option',
    kinds: ['manager', 'books-scrolls'],
    // `...ANCHORED_POPOVER_SOURCES` because this frame rests on an open panel the shared
    // positioning seam measured, clamped and portaled, which is that array's own membership test.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-item-validation',
    label: 'Manager — Recipe item validation',
    smokeLabels: ['manager-recipe-item-validation'],
    // The recipe-item editor's Validation tab in its all-clear state.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-edit="hb-book"]' },
      { selector: '[data-recipe-item-tab-button="validation"]' },
    ],
    expectView: 'recipe-item-edit',
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-item-validation-blocked',
    label: 'Manager — Recipe item validation blocked',
    smokeLabels: ['manager-recipe-item-validation-blocked'],
    // The same tab in its blocking state, which is a different summary card, a different count
    // split and a Block pill on the offending row.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-edit="hb-primer"]' },
      { selector: '[data-recipe-item-tab-button="validation"]' },
    ],
    expectView: 'recipe-item-edit',
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-item-preview-recipe-pager',
    label: 'Manager — Recipe item preview, the book detail recipe pager',
    // The sixth converted select's only frame (issue 1511), and the reason it is a MANAGER case is
    // measured rather than chosen.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-edit="hb-book"]' },
      { selector: '[data-recipe-item-tab-button="contents"]' },
      { selector: '[data-recipe-item-link-recipe-toggle]' },
      { selector: '[data-recipe-item-link-recipe-option="hb-r-greater-healing"]' },
      { selector: '[data-recipe-item-link-recipe-option="hb-r-antitoxin"]' },
      { selector: '[data-recipe-item-link-recipe-option="hb-r-tincture"]' },
      { selector: '[data-recipe-item-link-recipe-option="hb-r-oil"]' },
      { selector: '[data-recipe-item-link-recipe-toggle]' },
      { selector: '[data-recipe-item-preview] [data-inventory-recipe-pager]', scroll: true },
    ],
    expectView: 'recipe-item-edit',
    // The trigger, inside the preview, by the hook `triggerData` puts on the button.
    expectSelector: '[data-recipe-item-preview] [data-inventory-page-size]',
    // In the photograph, not merely in the document.
    expectContained: [
      { container: '[data-recipe-item-preview]', target: '[data-inventory-page-size]' },
    ],
    kinds: ['manager', 'books-scrolls'],
    // `apps/inventory/detail/` is named here for the reason the frame exists: this is the only
    // case in the registry that renders a player inventory DETAIL body inside the manager window,
    // so without the pattern a change to `InventoryBookDetail.svelte` published nothing that could
    // contain its GM-facing render.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
      /^src\/ui\/svelte\/apps\/inventory\/detail\//,
      /^src\/ui\/svelte\/util\/recipeItemPreviewRow\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-normal',
    label: 'Manager — Recipe edit normal',
    smokeLabels: ['manager-recipe-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Every frame below reaches its state by clicking the rule group (and, for the capped pair, by
  // typing into the pick-cap Stepper) rather than by authoring a second catalogued system.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inherit',
    label: 'Manager — Recipe edit crafting modifier inherit',
    // Beyond the smoke.
    reaches: 'beyond',
    smokeLabels: [],
    // The per-recipe check-modifier picker at rest.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The picker cell AND the inherited-names paragraph.
    expectSelector:
      '.fabricate-manager [data-recipe-editor] ' +
      '[data-recipe-crafting-modifier-picker] [data-recipe-crafting-modifier-inherited]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-custom-set',
    label: 'Manager — Recipe edit crafting modifier custom set',
    // BEYOND the smoke: the walk never presses a rule card, so its seeded system is `highest` and
    // no counterpart frame of the picker in its custom-set state exists.
    reaches: 'beyond',
    smokeLabels: [],
    // `hb-r-stillroom` authors `{ modifierIds: [...three] }`, so the tri-state reads `Custom set`
    // above a three-pill row.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The pill row is what a `Custom set` adds over `Inherit`; the absent cap sentence is what
    // separates this frame from both of its capped neighbours.
    expectSelector:
      '.fabricate-manager [data-recipe-editor] ' +
      '[data-recipe-crafting-modifier-picker]:has([data-modifier-pill-select])' +
      ':not(:has([data-recipe-crafting-modifier-cap]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The suppressed-pick state (issue 1608): the same seeded custom set as the case above, after one
  // of its three stored picks is un-marked on the Checks tab rather than removed on the recipe.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-suppressed',
    label: 'Manager — Recipe edit crafting modifier suppressed pick',
    // BEYOND the smoke, same as its neighbours: the smoke's system authors no modifier picks at
    // all under this rule, let alone an un-marked one.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      // Un-marks `hb-mod-medicine` selectable.
      { selector: '[data-crafting-modifier-eligibility-input="hb-mod-medicine"]' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The count, not merely the note's presence: a click that landed on the wrong row, or one that
    // toggled nothing, would still leave all three picks eligible and render no note at all, and a
    // selector asserting only `[data-recipe-crafting-modifier-suppressed]` would be satisfied by
    // any nonzero count.
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-suppressed="1"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Two frames, because the cap has two readings and they are different pictures: below the bound
  // the sentence states it and the Add menu is live, at the bound the sentence gains its at-cap
  // clause and the Add menu goes dead.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-cap-available',
    label: 'Manager — Recipe edit crafting modifier below the pick cap',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '5' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The READING, not merely the presence of a sentence: both frames render the same element with
    // the same chrome, so a fill that silently did not land would publish the at-cap picture here.
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-cap="available"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-cap-reached',
    label: 'Manager — Recipe edit crafting modifier at the pick cap',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '3' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-cap="reached"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-absent',
    label: 'Manager — Recipe edit crafting modifier absent',
    // BEYOND the smoke. The walk photographs a system whose recipes DO author picks, so there is
    // no counterpart frame of the surface being gone.
    reaches: 'beyond',
    smokeLabels: [],
    // The negative frame, and the one the redesign turns on. Under any rule but `bySubject` this
    // tab renders nothing about check modifiers — no picker, and no standing "the system decides"
    // banner either.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="identity"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // Absence in THREE directions, because each retired hook is a different way the surface could
    // come back: the picker cell, the retired rule select, and the retired delegation banner.
    expectSelector:
      '.fabricate-manager [data-recipe-editor]' +
      ':not(:has([data-recipe-crafting-modifier-picker]))' +
      ':not(:has([data-recipe-crafting-modifier]))' +
      ':not(:has([data-recipe-modifier-banner]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Both cases used to photograph the `noPlaceholder` inert cause — a formula authored but never
  // spending the check-modifier roll-formula placeholder — and that cause retires with the
  // placeholder: the scalar is appended to whatever the GM authored, so the state is unreachable.
  managerCase({
    id: 'manager-checks-crafting-modifier-inert',
    label: 'Manager — Checks crafting modifiers inert',
    // BEYOND the smoke. The walk never empties a check formula, so no counterpart frame of
    // the notice exists.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // Clearing the field reaches `noFormula`: a check slot that exists and rolls nothing.
      { selector: '[data-check-roll-formula]', fill: '' },
      { selector: '[data-checks-save]' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-inert]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The CAUSE, not just the notice. Both causes render through the same element with the
    // same chrome, so a presence-only assertion would photograph the wrong sentence.
    expectSelector: '.fabricate-manager [data-crafting-modifier-inert="noFormula"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inert',
    label: 'Manager — Recipe edit crafting modifier inert',
    // BEYOND the smoke, for the same reason as the sibling above.
    reaches: 'beyond',
    smokeLabels: [],
    // The recipe end of the same fact, and the only check-modifier banner this tab has left.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      // Back to The roll to clear the formula: the field and the catalogue it makes inert
      // are two SECTIONS apart now (issue 1096), and a step that stayed on Modifiers would
      // find no formula field and abort the case.
      { selector: '#checks-section-roll' },
      { selector: '[data-check-roll-formula]', fill: '' },
      { selector: '[data-checks-save]' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-modifier-inert]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The cause, and the withdrawal.
    expectSelector:
      '.fabricate-manager [data-recipe-editor]:has([data-recipe-modifier-inert="noFormula"])' +
      ':not(:has([data-recipe-crafting-modifier-picker]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-books-scrolls',
    label: 'Manager — Recipe edit books scrolls',
    smokeLabels: ['manager-recipe-edit-books-scrolls'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Pinned by row id rather than left on "whichever row is first".
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-greater-healing"]' },
      { selector: '#recipe-tab-books-scrolls' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-tools',
    label: 'Manager — Recipe edit tools',
    smokeLabels: ['manager-recipe-edit-tools'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-tools' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients',
    label: 'Manager — Recipe edit ingredients',
    smokeLabels: ['manager-recipe-edit-ingredients'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
    ],
    expectView: 'recipe-edit',
    // The converged row, named (issue 1373).
    expectSelector: '[data-recipe-option] [data-recipe-option-kind]',
    expectContained: [
      {
        container: '[data-recipe-option]',
        target: '[data-recipe-option-kind]',
      },
      // AND THE ADDERS, which are three controls in one row rather than three buttons stacked
      // under a heading. The set card is what draws them.
      {
        container: '[data-recipe-set]',
        target: '[data-recipe-add="tag-requirement"]',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients-cost',
    label: 'Manager — Recipe edit ingredients cost',
    smokeLabels: ['manager-recipe-edit-ingredients-cost'],
    // The essence + currency-cost requirement rows, which sit below the fold of the plain
    // ingredients frame — the smoke splits them into their own capture for exactly that reason and
    // scrolls the currency row (the last requirement) into view so both rows and their end-of-row
    // Steppers are on screen.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-currency]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-tag-picker',
    label: 'Manager — Recipe edit, the tag picker open over a system vocabulary',
    smokeLabels: [],
    // No case in the registry opened this popover (issue 1373, maintainer round 8), which is the
    // third such gap in as many rounds and is why it went on drawing a panel that is not the
    // design's.
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-tags]', scroll: true },
      { selector: '[data-recipe-option-tags] [data-recipe-add-tag]' },
    ],
    expectView: 'recipe-edit',
    // The panel AND A row in it.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover.manager-travel-popover ' +
      '.manager-travel-popover-options .manager-travel-option',
    // Portaled, so containment is asserted against the application root rather than against the row
    // that owns the trigger: the panel escapes the editor's clipping on purpose, so a container
    // assertion on that row could only ever fail.
    expectContained: [
      {
        container: '.fabricate-manager',
        target: '.fabricate-picker-popover .manager-travel-popover-search input',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients-or-menu',
    label: 'Manager — Recipe edit ingredients, the "or…" menu open',
    reaches: 'beyond',
    smokeLabels: [],
    // No case in the registry had ever opened this menu (issue 1373, maintainer round 8), and that
    // is the whole reason it shipped as a wide list of four full sentences with no header and no
    // colour while three surfaces around it were being brought onto the design.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '.manager-recipe-or-trigger' },
    ],
    expectView: 'recipe-edit',
    // Named on the last kind, not on the panel.
    expectSelector: '.manager-recipe-or-popover [data-recipe-add="alternative-currency"]',
    // The panel is PORTALED to the manager root (`util/overlayHost.js`), so the container is that
    // root and not the recipe view: it is deliberately outside the scrolling editor pane, and
    // containment against the pane would be a claim about a box it does not sit in.
    expectContained: [{ container: '.fabricate-manager', target: '.manager-recipe-or-popover' }],
    // …and it is actually on top. A menu drawn under the row it hangs from is contained, visible
    // and useless, which is a failure no bounding box can see.
    expectCenterHit: '.manager-recipe-or-popover [data-recipe-add="alternative-component"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-validation',
    label: 'Manager — Recipe edit validation',
    smokeLabels: ['manager-recipe-edit-validation'],
    reaches: 'exact',
    query: {},
    // The recipe is named, and that is the whole difference between this frame and the one it
    // replaces.
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-runeplate-draft"]' },
      { selector: '#recipe-tab-validation' },
    ],
    expectView: 'recipe-edit',
    // A representative frame for `EditorValidationSurface` since issue 1517, and it had no
    // assertion at all until then.
    expectSelector: '[data-recipe-tab="validation"] [data-recipe-issue-view]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-multistep',
    label: 'Manager — Recipe edit multistep',
    smokeLabels: ['manager-recipe-edit-multistep'],
    // The Overview tab's editable steps accordion, with a per-step duration control on each header.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results',
    label: 'Manager — Recipe edit results',
    smokeLabels: ['manager-recipe-edit-results'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-multistep',
    label: 'Manager — Recipe edit results multistep',
    smokeLabels: ['manager-recipe-edit-results-multistep'],
    // The Results tab's per-step result sections — the frame that proves a multi-step recipe's
    // Results renders something rather than an empty tab (the structural bug that shipped unseen
    // for want of exactly this coverage).
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-multistep-disable-confirm',
    label: 'Manager — Multistep disable confirm',
    smokeLabels: ['manager-multistep-disable-confirm'],
    reaches: 'exact',
    // `dialog: 'open'` leaves Foundry's own DialogV2 standing and unresolved, which is the whole
    // point of this frame: the confirmation itself is the state, not what follows it.
    query: { dialog: 'open' },
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '.manager-feature-tile[data-feature-key="multiStepRecipes"] button' },
    ],
    expectView: 'system-edit',
    // The dialog IS the state, so the frame has to be held to it: `expectView: 'system-edit'` is
    // satisfied by the settings tab with no dialog standing, which is precisely the screen a
    // silently no-oping toggle would have published.
    expectSelector: '.application.dialog',
    kinds: ['manager', 'recipes'],
    // Matches the screen it renders.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-collapsed',
    label: 'Manager — Recipe edit collapsed',
    smokeLabels: ['manager-recipe-edit-collapsed'],
    // The collapsed editor: `RecipeEditView` draws a read-only steps card plus its explanatory
    // note, instead of the editable accordion, whenever `!multiStepEnabled && steps.length > 1`.
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="jw-r-circlet"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="collapsed-steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-progressive',
    label: 'Manager — Recipe edit results progressive',
    smokeLabels: ['manager-recipe-edit-results-progressive'],
    // Progressive Results: an ORDERED stage list with a roll-budget strip, a read-only difficulty
    // badge and keyboard move chevrons — a wholly different tab body from the routed and simple
    // shapes. It is a SYSTEM-mode fact, so it can only be photographed on the progressive system.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-alchemy',
    label: 'Manager — Recipe edit results alchemy',
    smokeLabels: ['manager-recipe-edit-results-alchemy'],
    // Alchemy Results: the two-slot shape — an authored success set plus a reserved, undeletable
    // "On a failed check" set the editor draws itself.
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="al-r-elixir"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-access-rail',
    label: 'Manager — Recipe edit access rail',
    smokeLabels: ['manager-recipe-edit-access-rail'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-access' }],
    expectView: 'access',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      // The manager router and the Crafting entry model (issue 1151), for the reason recorded on
      // `manager-books-scrolls-normal`.
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/crafting\/craftingNav\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-access-inspector',
    label: 'Manager — Recipe access inspector, a recipe selected',
    // The inspector no frame filled (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // The inspector's CHARACTERS roster, not the inspector root: the root renders in BOTH
    // branches, so naming it alone would pass over the empty state this case exists to leave.
    expectSelector: '[data-access-inspector] [data-access-roster="characters"]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-selected',
    label: 'Manager — Recipe access rosters for a selected recipe',
    // The populated half of the access inspector (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `lab-alchemy` is a `restricted` system, which is what makes the Access rail entry render
    // at all; `al-r-elixir` is one of its five recipes, well inside the list's resting page size
    // of ten, so the row is on screen without a filter or a pager step.
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // The inspector's populated branch, proved by an element that exists only in it: the empty
    // branch draws an `EmptyState` and nothing else, so `[data-access-inspector]` alone is
    // satisfied by the frame this case exists to distinguish itself from.
    expectSelector:
      '.fabricate-manager [data-access-inspector]:has([data-access-summary])' +
      ' [data-access-roster="characters"] [data-access-character-row]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RosterRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-roster-paged',
    label: 'Manager — Recipe access players roster paged',
    // The roster's pager, which no case could reach (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy', manyPlayers: '1' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // A full page of six, which is the paged state stated as something the DOM can answer.
    expectSelector:
      '.fabricate-manager [data-access-inspector] [data-access-roster="players"]' +
      ' .manager-access-roster-rows [data-access-player-row]:nth-child(6)',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RosterRow\.svelte$/,
      // No `Pagination.svelte` pattern, though this frame is the registry's only paged roster.
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-roster-no-match',
    label: 'Manager — Recipe access players roster no match',
    // The per-roster no-match line (issue 1515), the second state the one-user roster made
    // unreachable: the field that produces it renders only over a roster with something in it, and
    // a roster of one has nothing a query can miss that the screen does not already show.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy', manyPlayers: '1' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
      { selector: '[data-access-roster-search="players"]', fill: ACCESS_ROSTER_SEARCH_MISS_TERM },
    ],
    expectView: 'access',
    // Both rosters, because the claim is that one of them missed.
    expectSelector:
      '.fabricate-manager [data-access-inspector]' +
      ':has([data-access-roster="characters"] [data-access-character-row])' +
      ' [data-access-roster="players"] [data-access-roster-empty="players"]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      // No `EmptyState.svelte` pattern, for the reason the paged case above records about
      // `Pagination`: it is a broad signal, so the pattern could never be consulted.
    ],
  }),
  managerCase({
    id: 'manager-components-normal',
    label: 'Manager — Components normal',
    smokeLabels: ['manager-components-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    // Issue 1371 r13-list — the list opens on its first drawn row (maintainer ruling M14).
    expectContained: [
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row[aria-current="true"]',
      },
      {
        container: 'aside.manager-inspector',
        target: '[data-component-inspector-kicker]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    // Issue 1371 r18-colour — the row badges in the essence's own colour (maintainer ruling M29).
    id: 'manager-components-essence-chips',
    label: 'Manager — Components essence chips',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-essence-filter]', select: '__any' },
      // OPEN A CARRYING ROW, through its identity button rather than through the chip: the list
      // opens on its first drawn row before the filter narrows it (M14), and that row may carry
      // nothing, so the inspector's run below is only drawn once a tinted row is the selection.
      { selector: '.manager-component-row:has([data-chip-tint]) .manager-component-identity' },
    ],
    expectView: 'components',
    expectSelector: '.manager-component-row [data-essence-chip][data-chip-tint]',
    expectContained: [
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row [data-essence-chip][data-chip-tint]',
      },
      {
        container: 'aside.manager-inspector',
        target: '[data-component-essence-list] [data-essence-chip][data-chip-tint]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceChip\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/components\/ComponentBrowserInspector\.svelte$/,
    ],
  }),
  managerCase({
    // The inheriting rules editor (issue 1371, round 2), and it is the only state that renders the
    // category note in its info tone — the pixel behind E-4's `tone: 'info'`, which round 1 shipped
    // as a unit-tested constant no frame could contain.
    id: 'manager-component-edit-inheriting',
    label: 'Manager — Component edit inheriting',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Iron Ingot' },
      { selector: '[data-component-edit]' },
    ],
    expectView: 'component-edit',
    // The category control is one select now, not an `InheritRow` (issue 1371, parity round 4,
    // rebuild-spec D4.1 / gap-list rows 132-133): the reference draws a single full-width select
    // whose first option is `Inherit from world · {category}`, with the state note directly under
    // it — no separate toggle, no second `Category` label, no floated head control.
    expectSelector: '[data-component-edit-category]',
    expectContained: [
      // THE INFO-TONE BRANCH, which is this case's whole subject: `inherited` is the state
      // `sm-iron-ingot` is in, and `manager-component-edit-normal` opens a row that overrides, so
      // it photographs the warning branch and can never show this one.
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-category-note="inherited"]',
      },
      // And the ONE identity callout the two stacked cards collapsed into (D3).
      {
        container: 'main.manager-component-edit-main',
        target: '[data-component-edit-section="identity"]',
      },
      // The essence section's inherit choice (issue 1371 r18-entry, maintainer ruling M31).
      {
        container: '[data-component-edit-section="essences"]',
        target: '[data-scoped-inherit-toggle="essences"]',
      },
      {
        container: '[data-component-edit-section="essences"]',
        target: '[data-component-edit-essence-note="inherited"]',
      },
    ],
    // THE SWITCH IS A NEW CONTROL ON THIS CARD (issue 1371 r18-entry), so it owns a real pointer
    // hit: an inherit row overlapped by the card head or the grid would be present in the DOM,
    // correct in every mounted assertion and unclickable on screen, and only `elementFromPoint`
    // at its centre can tell those apart.
    expectCenterHit: '[data-scoped-inherit-toggle="essences"]',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The rules editor's read-only world tag CARD (issue 1371, round 3), which no frame reached.
    id: 'manager-component-edit-world-tags',
    label: 'Manager — Component edit world tags',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-search] input', fill: 'Coal' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-section="world-tags"]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector: '[data-component-edit-section="world-tags"]',
    expectContained: [
      // The count note is contained by the CARD, not by the world-tag group, and the difference is
      // what this pair was getting wrong.
      {
        container: '[data-component-edit-section="tags"]',
        target: '[data-component-edit-world-tags-note]',
      },
      // The chip states ARE the group's own subject, and stay scoped to it: `bulk` is muted in
      // this system and `fuel` is not, so a card painting one treatment for both fails here.
      {
        container: '[data-component-edit-section="world-tags"]',
        target: '[data-component-edit-world-tag="bulk"]',
      },
      {
        container: '[data-component-edit-section="world-tags"]',
        target: '[data-component-edit-world-tag="fuel"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The widened membership cohort (issue 1371, round 2): the ghost rows, their Add, and the
    // toolbar counting the widened set.
    id: 'manager-components-world-cohort',
    label: 'Manager — Components world cohort',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      // The cohort switch is A `SegmentedControl`, not A `<select>` (issue 1371, parity round 4,
      // rebuild-spec C6): the reference draws two inline segments and the shipped control now
      // renders one `<label>` per option carrying `data-component-membership-option="<value>"`
      // (`data-component-membership-filter` is on the track, and stamps `true`, not a value).
      { selector: '[data-component-membership-option="all"]' },
      // Scroll to the cohort, because it sits below every member row: the lab world's smithing
      // system holds a handful of components and the world corpus holds sixty-five, so the ghost
      // list starts well past the fold and an unscrolled frame photographs the member rows this
      // case is not about.
      { selector: '.manager-component-row[data-component-member="false"]', scroll: true },
    ],
    expectView: 'components',
    expectSelector: '.manager-component-row[data-component-member="false"]',
    expectContained: [
      // A row, not the whole `<ul>`.
      {
        container: '.manager-table-scroll',
        target: '.manager-component-row[data-component-member="false"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/],
  }),
  managerCase({
    // The `Add from catalogue` picker, open AND multi-selected (issue 1371, M9).
    id: 'manager-components-add-from-catalogue',
    label: 'Manager — Components add from catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-add-from-catalogue]' },
      // Two rows ticked, by state rather than by ID.
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
      { selector: '[data-component-add-from-catalogue-row]:not(.is-picked)' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-add-from-catalogue-dialog]',
    kinds: ['manager', 'components'],
    // The picker's own file, AND not `ManagerModal.svelte`.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ComponentAddFromCatalogueDialog\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit',
    label: 'Manager — Components bulk edit',
    smokeLabels: ['manager-components-bulk-edit'],
    reaches: 'exact',
    query: {},
    // The staged face. `data-component-select` sits on a visually hidden input, so the click target
    // is its wrapping `<label>`; two rows, because a one-row selection reads as an accident.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      { selector: '[data-component-bulk-essences] [data-stepper-increment]' },
      // The tag inset is a PAGED window over the system's tags (issue 1371 r16-cat converged both
      // panels on one `BulkStagingInset`), so `ore` and `ingot` sit past page one: reach each
      // through the inset's own search well, as the world bulk case reaches its rows, then clear
      // the well so the frame shows the resting inset under the staged chip run.
      { selector: '[data-bulk-inset-search="tags"]', fill: 'ore' },
      { selector: '[data-bulk-tag="ore"]' },
      { selector: '[data-bulk-inset-search="tags"]', fill: 'ingot' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-inset-search="tags"]', fill: '' },
      { selector: '[data-component-bulk-category-option="Refined"]' },
    ],
    expectView: 'components',
    expectSelector: '[data-component-bulk-panel]',
    // The three staged axes, asserted (issue 1371 r17-b, quality N4): a category radio or tag
    // tri-state that stopped staging on this panel would otherwise still publish a green frame.
    expectContained: [
      {
        container: '[data-component-bulk-panel]',
        target:
          '[data-component-bulk-category-option="Refined"][data-component-bulk-option-state="on"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target: '[data-component-bulk-tag-chip="ore"][data-component-bulk-tag-chip-state="add"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target:
          '[data-component-bulk-tag-chip="ingot"][data-component-bulk-tag-chip-state="remove"]',
      },
      {
        container: '[data-component-bulk-panel]',
        target: '[data-component-bulk-essences-staged="true"]',
      },
    ],
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-delete-idle',
    label: 'Manager — Components bulk delete idle',
    reaches: 'beyond',
    smokeLabels: [],
    // The unarmed face of the set remove (issue 1129; the reference's `Remove N components from
    // {system}…` leg in the shell's dock since issue 1371 r16-list, M23), and the frame that
    // photographs its consequence note.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ingot"])' },
      { selector: '[data-component-bulk-remove]', scroll: true },
    ],
    expectView: 'components',
    // Unarmed is the state under test, and `data-armed="false"` is what separates this frame from
    // its armed twin below — an `expectSelector` naming only the card would pass on either.
    expectSelector: '.fabricate-manager [data-arm-token="delete-components"][data-armed="false"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/utils\/recipeComponentReferences\.js$/,
      BULK_EDIT_CHROME_PATTERN,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-delete-armed',
    label: 'Manager — Components bulk delete armed',
    reaches: 'beyond',
    smokeLabels: [],
    // The armed half of the set remove (issue 1129; in the dock since issue 1371 r16-list), the
    // twin of `manager-essences-bulk-delete-armed`.
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      // The BUTTON, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control
      // it arms, so this cannot drift onto a wrapper the way a class selector could.
      { selector: '[data-arm-token="delete-components"]' },
    ],
    expectView: 'components',
    // Armed is a STATE, and a frame that merely re-photographed the idle button would be
    // indistinguishable from the bulk-edit case above.
    expectSelector: '.fabricate-manager [data-arm-token="delete-components"][data-armed="true"]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      /^src\/utils\/recipeComponentReferences\.js$/,
      BULK_EDIT_CHROME_PATTERN,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit-unstaged',
    label: 'Manager — Components bulk edit unstaged',
    smokeLabels: ['manager-components-bulk-edit-unstaged'],
    reaches: 'exact',
    query: {},
    // The pristine face of the same panel: a selection and nothing staged, which is the only
    // evidence of the "leave unchanged" chips and the inert Apply.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-components-description-before',
    label: 'Manager — Components description before',
    smokeLabels: ['manager-components-description-before'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-toolbar input[type="search"]', fill: 'Ember Quenching Oil' },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-raw"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-description-repaired',
    label: 'Manager — Components description repaired',
    smokeLabels: ['manager-components-description-repaired'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-toolbar input[type="search"]',
        fill: 'Rimefrost Quenching Oil',
      },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-repaired"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-description-ingested',
    label: 'Manager — Components description ingested',
    smokeLabels: ['manager-components-description-ingested'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '.manager-component-toolbar input[type="search"]', fill: 'Ashfall Reagent Case' },
      {
        selector:
          '.manager-component-row[data-component-id="sm-desc-ingested"] .manager-component-identity',
      },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-component-edit-normal',
    label: 'Manager — Component edit normal',
    smokeLabels: ['manager-component-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }, { selector: '[data-component-edit]' }],
    expectView: 'component-edit',
    // THE SHARED RAIL, IN THIS FRAME (issue 1371 r18-list, maintainer ruling M27): the editor
    // renders the world entry's `How players see it` rail at the system scope, so the frame must
    // show the rail's scope sentence and its inventory tile beside the form — the two regions a
    // rail of the editor's own would draw differently, and the reason the ruling was made.
    expectContained: [
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-scope-note]',
      },
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    kinds: ['manager', 'components'],
    // The three complication components are claimed by the four `*-complications-*` and
    // `*-salvage-stage-strip` cases below, not here (issue 1286).
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    // The other consumer of the shared frame, stacked (issue 1371 r19-entry2).
    id: 'manager-component-edit-stacked',
    label: 'Manager — Component edit stacked',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: '[data-component-edit]' },
      { selector: '[data-component-edit-tab="rules"]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector: 'main.manager-component-edit-main',
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: 'main.manager-component-edit-main',
      expectedTracks: 1,
    },
    expectCenterHit: '[data-component-edit-tab="rules"]',
    expectContained: [
      {
        container: 'main.manager-component-edit-main',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    position: { width: 980, height: 860 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage',
    label: 'Manager — Component edit salvage',
    smokeLabels: ['manager-component-edit-salvage'],
    // The routed salvage authoring body: per-component result groups plus a populated
    // outcome-routing table (`[data-salvage-routing]`) and the DC override.
    reaches: 'exact',
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="rw-slag"] [data-component-edit]',
      },
      { selector: '[data-salvage-routing]', scroll: true },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    // The shared subject check-modifier picker does not render here, and this list used to claim it
    // did (issue 1095).
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage-off',
    label: 'Manager — Component edit salvage off',
    smokeLabels: ['manager-component-edit-salvage-off'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-chainmail"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage-simple',
    label: 'Manager — Component edit salvage simple',
    smokeLabels: ['manager-component-edit-salvage-simple'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-longsword"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),

  // Five frames, and every one of them is on `lab-herbalism` because no other lab system can draw
  // any of them: `ComponentComplicationsSection` gates itself on "some activity in this system
  // resolves progressively", and herbalism is the world's only progressive system on any axis.
  managerCase({
    id: 'manager-component-complications-empty',
    label: 'Manager — Component complications empty',
    // The section's empty state, which is `EmptyState`'s new `inline` variant (issue 1286) and
    // exists on no other screen: the stack flips to a row and the 46px icon tile is released into a
    // bare glyph, neither of which `is-compact` does.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="hb-empty-vial"] [data-component-edit]',
      },
      { selector: '[data-complications-section]', scroll: true },
    ],
    expectView: 'component-edit',
    // The empty state ITSELF, not merely the section: a component that silently acquired a
    // complication would still render the section and would publish the populated list under a
    // case whose whole subject is that there is nothing to list.
    expectSelector: '.fabricate-manager [data-complications-section] [data-complications-empty]',
    kinds: ['manager', 'components', 'complications'],
    // Deliberately no pattern for `components/EmptyState.svelte`, for the reason
    // `manager-systems-empty` records above.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-collapsed',
    label: 'Manager — Component complications collapsed',
    // The resting list: two summary rows, both closed.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complications-section]', scroll: true },
    ],
    expectView: 'component-edit',
    // A row, and specifically the authoring variant.
    expectSelector:
      '.fabricate-manager [data-complications-section] [data-complication-row="authoring"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-expanded',
    label: 'Manager — Component complications expanded',
    // The open row, which is where the section's whole authoring surface lives: the identity strip,
    // the Applies-to chips, and the When and Then cards with six `ComplicationEffectRow` instances
    // between them.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-mortar-dust"] [data-component-edit]',
      },
      { selector: '[data-complication="hb-comp-dust-cloud"] [data-complication-disclosure]' },
      // The LAST row of the When card, so `scrollIntoViewIfNeeded` — which lands its anchor near
      // the bottom edge — puts the whole card and the identity strip above it in one frame.
      { selector: '[data-complication-roll-condition]', scroll: true },
    ],
    expectView: 'component-edit',
    // `aria-expanded`, not merely the presence of the detail: a disclosure that silently stopped
    // toggling would leave the row closed and publish the collapsed frame under this name.
    expectSelector:
      '.fabricate-manager [data-complication="hb-comp-dust-cloud"] ' +
      '[data-complication-disclosure][aria-expanded="true"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentComplicationsSection\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationEffectRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-component-complications-salvage-stage-strip',
    label: 'Manager — Component complications salvage stage strip',
    // The read-only strip under a progressive salvage stage row.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] [data-component-edit]',
      },
      { selector: '[data-salvage-stage-complications]', scroll: true },
    ],
    expectView: 'component-edit',
    expectSelector:
      '.fabricate-manager [data-salvage-stage-complications] [data-complication-row="readonly-gm"]',
    kinds: ['manager', 'components', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-complications-stage-strip',
    label: 'Manager — Recipe complications stage strip',
    // The Recipe Studio's counterpart, and the reason it is a separate frame rather than the same
    // one photographed twice: the two strips are deliberately asymmetric.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-result-complications]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector:
      '.fabricate-manager [data-recipe-result-complications] [data-complication-row="readonly-gm"]',
    kinds: ['manager', 'recipes', 'complications'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeResultItemRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComplicationSummaryRow\.svelte$/,
    ],
  }),

  managerCase({
    id: 'manager-checks-gathering',
    label: 'Manager — Checks gathering',
    smokeLabels: ['manager-checks-gathering'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#manager-checks-nav-gathering' }],
    expectView: 'checks-gathering',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-validation',
    label: 'Manager — Checks validation',
    smokeLabels: ['manager-checks-validation'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#manager-checks-nav-validation' }],
    expectView: 'checks-validation',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  // The retired-placeholder readiness split (issue 1094).
  managerCase({
    id: 'manager-checks-validation-retired-placeholder',
    label: 'Manager — Checks validation retired placeholder',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // A placement the shim REFUSES, so the whole formula is discarded: critical, not the
      // ignorable warning an additive placement raises.
      { selector: '[data-check-roll-formula]', fill: '1d20 * @craftingmod' },
      { selector: '#manager-checks-nav-validation' },
      { selector: '[data-issue="retiredPlaceholderBreaksFormula"]', scroll: true },
    ],
    expectView: 'checks-validation',
    // The CRITICAL id specifically. A presence-only assertion would be satisfied by the
    // warning, which is the other half of the split and says the opposite thing.
    expectSelector: '.fabricate-manager [data-issue="retiredPlaceholderBreaksFormula"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  // Six states the old four-tab surface had no shape for, and every one of them is a claim this
  // change makes that only a photograph settles.
  managerCase({
    id: 'manager-checks-rail-group',
    label: 'Manager — Checks rail group expanded',
    reaches: 'beyond',
    smokeLabels: [],
    // Jewelry is the system whose SALVAGE is routed with no authored check, so salvage
    // carries a real readiness issue: the parent badge, the salvage child badge and the
    // Validation child badge are all visible together, which is the whole rule the frame
    // has to settle (the parent sums the ACTIVITY children only, and Validation restates
    // that total rather than adding to it).
    query: { system: 'lab-jewelry' },
    steps: ['Checks'],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-nav-issues="checks"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-rail-dirty',
    label: 'Manager — Checks rail dirty marker beside an issue badge',
    reaches: 'beyond',
    smokeLabels: [],
    // The three-marker column.
    query: { system: 'lab-jewelry' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-check-roll-formula]', fill: '1d20 + @prof + 2' },
      { selector: '#manager-checks-nav-salvage' },
    ],
    expectView: 'checks-salvage',
    expectSelector: '.fabricate-manager [data-checks-nav-dirty="crafting"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-section-badged-and-dotted',
    label: 'Manager — Checks section with a count AND a warning dot',
    reaches: 'beyond',
    smokeLabels: [],
    // No frame in the prototype shows a section carrying both markers, and they occupy the same
    // slot, so this is the one that proves they do not collide.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-outcome-name]', fill: '' },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-section-dot="outcomes"]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-off',
    label: 'Manager — Checks crafting switched off',
    reaches: 'beyond',
    smokeLabels: [],
    // Reached by turning the check off rather than by a fixture whose check is already off: every
    // lab system authors an enabled check, and a seventh system carrying a disabled one would
    // change the system count every other manager frame is composed against.
    query: { system: 'lab-jewelry' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-checks-active-toggle]' },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-off-empty]',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks'],
  }),
  managerCase({
    id: 'manager-checks-stacked-floor',
    label: 'Manager — Checks stacked at the declared floor',
    reaches: 'beyond',
    smokeLabels: [],
    // The 1024x640 declared floor, and it is stacked there rather than a side rail: the shipped
    // `fabricate-manager` container ladder restacks `.manager-body` to one column at 1120, so at
    // the floor every panel is reached by scrolling the body.
    query: { system: 'lab-runework' },
    steps: ['Checks', { selector: '#manager-checks-nav-crafting' }],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-checks-rail="crafting"]',
    position: { width: 1024, height: 640 },
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
    kinds: ['manager', 'checks', 'responsive'],
  }),
  managerCase({
    id: 'manager-checks-crafting-consumption',
    label: 'Manager — Checks crafting consumption',
    smokeLabels: ['manager-checks-crafting-consumption'],
    reaches: 'exact',
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-on-failure' },
    ],
    expectView: 'checks-crafting',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-salvage-on-failure',
    label: 'Manager — Checks salvage on failure',
    // Beyond the smoke, and beyond every previous build: this section has never existed.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      { selector: '#checks-section-on-failure' },
    ],
    expectView: 'checks-salvage',
    expectSelector:
      '.fabricate-manager [data-failure-result-policy="salvage"]' +
      ' ~ [data-salvage-failure-consumption]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-gathering-on-failure',
    label: 'Manager — Checks gathering on failure',
    // The activity that renders the policy and no consumption toggles, because it has no
    // consumption block — plus the dormancy notice naming issue 683 and the read-only
    // `task.failureOutcome` cross-reference in its no-record state.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-gathering' },
      { selector: '#checks-section-on-failure' },
    ],
    expectView: 'checks-gathering',
    expectSelector:
      '.fabricate-manager [data-checks-panel="gathering"]' +
      ':has([data-failure-result-policy="gathering"])' +
      ':has([data-gathering-failure-dormant])' +
      ':has([data-gathering-failure-outcome-empty])' +
      ':not(:has([data-salvage-failure-consumption]))' +
      ':not(:has([data-failure-consumption]))',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-failure-tier',
    label: 'Manager — Recipe edit results failure tier',
    // Decision 7, and the only frame of it: a routed-by-check recipe's result-group card offering a
    // failure-marked outcome tier, which is reachable only because `lab-runework`'s crafting check
    // authors `failureResultPolicy: 'always'`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
      { selector: '[data-recipe-add="routing-option"]' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
      /^src\/utils\/routedOutcomeKeywords\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers',
    label: 'Manager — Checks crafting modifiers',
    smokeLabels: ['manager-checks-crafting-modifiers'],
    // The check-modifier catalogue card, which sits last in the crafting panel and is therefore
    // below the fold of `manager-checks-crafting-consumption`'s frame — hence a dedicated capture
    // that scrolls to it.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      // Re-anchored (issue 1095 review).
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Two things at once, on the one card — and that card is `How they combine`, which issue 1096's
    // parity round split out of the catalogue card.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-policy-card]' +
      ':has([data-crafting-modifier-policy-option="bySubject"])' +
      ':has([data-crafting-modifier-max-picks="unlimited"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifier-max-picks',
    label: 'Manager — Checks crafting modifiers, pick cap set',
    // BEYOND the smoke: the walk never presses a rule card and never types in this field, so no
    // counterpart frame of a BOUNDED cap exists.
    reaches: 'beyond',
    smokeLabels: [],
    // The other half of the cap's two readings.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '1' },
      // The cap field, which is this case's whole subject and the card's last element, so the frame
      // carries the rule grid above it.
      { selector: '[data-crafting-modifier-max-picks]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The VALUE, not the presence of a field: a fill that silently did not land leaves the field
    // rendered and blank, which is the sibling frame published under this name.
    expectSelector: '.fabricate-manager [data-crafting-modifier-max-picks="1"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifier-entries',
    label: 'Manager — Checks crafting modifier entries',
    // BEYOND the smoke: the walk never opens a system carrying a catalogue on this tab, and the
    // two sibling cases above frame the rule grid and the cap rather than the entries.
    reaches: 'beyond',
    smokeLabels: [],
    // The crafting rows, and since issue 1117 what they show is the absence of an editor.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      {
        selector: '[data-crafting-modifier-catalogue="crafting"] .manager-checks-card-title',
        scroll: true,
      },
    ],
    expectView: 'checks-crafting',
    // The whole of the rebuilt CARD, clause by clause, because each clause is a thing that shipped
    // wrong and could come back: the rule's sentence in the head's description slot, the read-only
    // expression, the bounds chip on the row, the deep link (which was a full-width button at the
    // foot), and the library note that now closes the card instead of opening it.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="crafting"]' +
      ':has(.manager-checks-card-head [data-crafting-modifier-defaults])' +
      ':has([data-crafting-modifier-readonly="expression"])' +
      ':has(.manager-modifier-readonly-row .manager-modifier-bounds-chip)' +
      ':has(.manager-checks-card-head [data-crafting-modifier-edit-link])' +
      ':has([data-crafting-modifier-library-note])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row itself, which sits outside `checks/` since issue 1373's round 4 moved it into
      // a shared component the Tool Studio's check-bonus picker also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // Every activity renders the library read-only now, with a bounds chip and a link to the system
  // editor, while the per-entry eligibility control and the rule grid stay fully editable.
  managerCase({
    id: 'manager-checks-salvage-modifiers',
    label: 'Manager — Checks salvage modifiers',
    // BEYOND the smoke: the walk never opens the salvage sub-tab of a system carrying a
    // library, so no counterpart frame of these rows exists.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-rows]', scroll: true },
    ],
    expectView: 'checks-salvage',
    // The read-only row, asserted through the one element the retired editable branch could not
    // draw.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="salvage"]' +
      ':has([data-crafting-modifier-readonly="expression"])' +
      ':has(.manager-modifier-bounds-chip)' +
      ':has([data-crafting-modifier-edit-link])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row itself, which sits outside `checks/` since issue 1373's round 4 moved it into
      // a shared component the Tool Studio's check-bonus picker also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-gathering-modifiers',
    label: 'Manager — Checks gathering modifiers',
    // BEYOND the smoke, and the only frame of the DORMANCY notice against a populated catalogue:
    // `manager-checks-gathering` runs on the default system, whose catalogue is empty, so its card
    // draws the empty state and none of the rows the notice is about.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-gathering' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-rows]', scroll: true },
    ],
    expectView: 'checks-gathering',
    // The gathering card carries TWO notices no other activity's does — the check-vs-character
    // modifier disambiguation and the issue-683 dormancy note — and both are stated against real
    // rows here rather than against an empty catalogue.
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-catalogue="gathering"]' +
      ':has([data-gathering-modifier-disambiguation])' +
      ':has([data-check-modifier-dormant])' +
      ':has([data-crafting-modifier-readonly="expression"])',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
      // The entry row itself, which sits outside `checks/` since issue 1373's round 4 moved it into
      // a shared component the Tool Studio's check-bonus picker also calls.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  // `SubjectModifierPicker` is one component with two hosts, and both gate it on the activity's
  // rule being `bySubject`.
  managerCase({
    id: 'manager-component-edit-salvage-modifier-pick',
    label: 'Manager — Component edit salvage modifier pick',
    // BEYOND the smoke: the walk never presses a rule card, so the picker is on no smoke frame.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-salvage' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '#manager-nav-component-rules' },
      {
        selector:
          '.manager-component-row[data-component-id="hb-cracked-alembic"] ' +
          '[data-component-edit]',
      },
      { selector: '[data-subject-modifier-picker="salvage-check-modifier"]', scroll: true },
    ],
    expectView: 'component-edit',
    // The picker AND its inherit note.
    expectSelector:
      '.fabricate-manager [data-subject-modifier-picker="salvage-check-modifier"] ' +
      '[data-subject-modifier-inherited]',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SubjectModifierPicker\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-edit-modifier-pick',
    label: 'Manager — Gathering task edit modifier pick',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a SUBMENU, so reaching the task library is two clicks —
    // the same route `manager-gathering-task-editor-normal` takes, after the rule click.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-gathering' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-check-modifiers]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // The task card, the picker inside it AND the picker's inherit note: the card carries the
    // check-vs-character modifier hint, which is the disambiguation this screen is the second half
    // of, and the note is where the inherited entries are named.
    expectSelector:
      '.fabricate-manager [data-gathering-task-check-modifiers] ' +
      '[data-subject-modifier-picker="gathering-check-modifier"] ' +
      '[data-subject-modifier-inherited]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SubjectModifierPicker\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers-narrow',
    label: 'Manager — Checks crafting modifiers narrow',
    // BEYOND the smoke: the walk runs one geometry, and the whole subject here is the other one.
    reaches: 'beyond',
    smokeLabels: [],
    // The 1x4 reflow, which is only judgeable from a photograph.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Re-pointed at the rule card (issue 1096's parity round).
    expectSelector:
      '.fabricate-manager [data-crafting-modifier-policy-card] [data-crafting-modifier-policy]',
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'checks', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-components-stacked',
    label: 'Manager — Components stacked',
    smokeLabels: ['manager-components-stacked'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-grouped-continuation',
    label: 'Manager — Components grouped continuation',
    smokeLabels: ['manager-components-grouped-continuation'],
    // The component library's half of the grouped-continuation pair: page two of a category-major
    // list, where a category larger than the page continues across the boundary.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      ...chooseSelectOption('.manager-main [data-pagination-size]', '10'),
      { selector: '.manager-main [data-pagination-next]' },
    ],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-normal',
    label: 'Manager — Tags categories normal',
    smokeLabels: ['manager-tags-categories-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }, { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      // `VocabularyTabs` is the strip issue 1429 extracted out of `TagsCategoriesView`, so the
      // `TagsCategories` prefix above stops reaching it.
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyTabs|VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager — Tags categories tags tab',
    smokeLabels: ['manager-tags-categories-tags-tab'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }, { selector: '#vocabulary-tab-tag' }],
    expectView: 'tags',
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyTabs\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-stacked',
    label: 'Manager — Tags categories stacked',
    smokeLabels: ['manager-tags-categories-stacked'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tags' }, { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'tags', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyTabs\.svelte$/,
    ],
  }),
  // Every case below carries the same `sourceMatches` set (issue 1372).
  managerCase({
    id: 'manager-essences-normal',
    label: 'Manager — Essences normal',
    smokeLabels: ['manager-essences-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-essence-rules' }],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The `SYSTEM RULES n / m` panel, which the browser inspector composes from the world
      // catalogue's own component (issue 1372).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/SystemRulesRoster\.svelte$/,
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-stacked',
    label: 'Manager — Essences stacked',
    smokeLabels: ['manager-essences-stacked'],
    // Repointed, not duplicated (issue 1036).
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-essence-rules' }],
    expectView: 'essences',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'essences', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-disabled-in-use',
    label: 'Manager — Essences disabled and in use',
    // BEYOND the smoke: the smoke walk has no step that selects a specific essence row, so there is
    // no counterpart frame of the inspector to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // The state this whole feature exists to add, and the one the prototype never depicts: an
    // essence that is disabled while components carry it and a recipe requires it.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-essence-identity' },
    ],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-source-picker',
    label: 'Manager — Essences source picker open',
    // BEYOND the smoke: the walk selects no essence row, so there is no counterpart frame.
    reaches: 'beyond',
    smokeLabels: [],
    // The other picker this epic re-platformed, and the one that had no frame at all (issue 1503).
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="mote"] .manager-essence-identity' },
      { selector: '.essence-source-trigger' },
    ],
    expectView: 'essences',
    // Named on the panel's own class pair, which is what the caller keeps through the re-platform:
    // `fabricate-source-picker-popover essence-source-picker-popover` rides `popoverClass` onto the
    // node the primitive portals.
    expectSelector: '.essence-source-picker-popover',
    // The panel is PORTALED to the manager root (`util/overlayHost.js`), so the container is that
    // root and not the inspector column: it is deliberately outside that scroller, and containment
    // against the column would be a claim about a box it does not sit in.
    expectContained: [
      { container: '.fabricate-manager', target: '.essence-source-picker-popover' },
    ],
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // Deliberately no pattern for the two components that draw this frame's subject.
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-essences-grid',
    label: 'Manager — Essences grid',
    // BEYOND the smoke: the presentation toggle is new, so nothing in the walk presses it.
    reaches: 'beyond',
    smokeLabels: [],
    // The grid carries the same state vocabulary as the list — the Disabled pill, the capability
    // pills and the recipe count — because a presentation toggle must not silently remove state.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-view-option="grid"]' },
    ],
    expectView: 'essences',
    // A click that lands but does not switch presentation would photograph the LIST under the
    // grid case's name — the "publishes an unrelated frame" failure this registry exists to
    // prevent, and one that would silently un-prove the crop fix above.
    expectSelector: '.fabricate-manager .manager-essences-table[data-essence-view="grid"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      // The CARD is claimed HERE and only here: this is the one frame that renders a grid of
      // them, so a change to `LibraryCard` picks a card as its evidence rather than a list
      // that never shows one.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-bulk-edit',
    label: 'Manager — Essences bulk edit',
    reaches: 'beyond',
    smokeLabels: [],
    // An active bulk selection, so the rail shows the bulk panel rather than the inspector.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-select="mote"]' },
      { selector: '[data-essence-select="aether"]' },
    ],
    expectView: 'essences',
    // The frame must show the live action, not the inert one.
    expectSelector:
      '.fabricate-manager [data-essence-bulk-delete-card] .manager-button.is-danger:not([disabled])',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-bulk-delete-armed',
    label: 'Manager — Essences bulk delete armed',
    reaches: 'beyond',
    smokeLabels: [],
    // The armed half of the maintainer's binding decision, which no case photographed.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-select="mote"]' },
      { selector: '[data-essence-select="aether"]' },
      // The BUTTON, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it
      // arms, so this cannot drift onto a wrapper the way a class selector could.
      { selector: '[data-arm-token="delete-essences"]' },
    ],
    expectView: 'essences',
    // Armed is a STATE, and a frame that merely re-photographed the idle button would be
    // indistinguishable from the case above. `ArmedDangerButton` marks the armed control.
    expectSelector: '.fabricate-manager [data-arm-token="delete-essences"][data-armed="true"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-first-state',
    label: 'Manager — Essence edit first state',
    smokeLabels: ['manager-essence-edit-first-state'],
    // The smoke opens an essence row's Edit action and photographs the editor as it arrives, and
    // this lands in the same place.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles are built by this pure helper, and the rail renders on
      // every tab (`showIdentity` defaults true; only the browser inspector passes false), so a
      // change to it is visible in all three editor cases (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: the inherit switches, the
      // membership cluster and the pure leaf behind their copy.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout it opens with
      // and the copy-to-other-systems action it closes with.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-on-craft',
    label: 'Manager — Essence edit On craft',
    reaches: 'beyond',
    smokeLabels: [],
    // The two behaviour cards, scrolled into the frame rather than reached by a tab click.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-scoped-copy-rules]', scroll: true },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles are built by this pure helper, and the rail renders on
      // every tab (`showIdentity` defaults true; only the browser inspector passes false), so a
      // change to it is visible in all three editor cases (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: the inherit switches, the
      // membership cluster and the pure leaf behind their copy.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout it opens with
      // and the copy-to-other-systems action it closes with.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-validation',
    label: 'Manager — Essence edit Validation',
    reaches: 'beyond',
    smokeLabels: [],
    // The third tab, and the only surface that reports an unresolvable property macro: at craft
    // time such a macro is logged and skipped silently, deliberately, so this is the GM's one route
    // to the fact.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-essence-tab="validation"]' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      // The shared scoped-entity validation shell (issue 1362). Both validation tabs are
      // callers of it, so it is claimed on the two frames that photograph one.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedValidationTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles are built by this pure helper, and the rail renders on
      // every tab (`showIdentity` defaults true; only the browser inspector passes false), so a
      // change to it is visible in all three editor cases (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: the inherit switches, the
      // membership cluster and the pure leaf behind their copy.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout it opens with
      // and the copy-to-other-systems action it closes with.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),

  // ── The two SYSTEM-SCOPE essence states issue 1372 adds ────────────────────────────────────
  // ── The system-scope essence state issue 1372 adds, and the ONE it cannot photograph ───────
  managerCase({
    id: 'manager-essences-membership-all',
    label: 'Manager — Essences all world essences',
    reaches: 'beyond',
    smokeLabels: [],
    // The two-option membership filter with its counts, switched to `All world essences`.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      // The membership filter became a SegmentedControl (issue 1372) — the prototype states both
      // counts at once, which a <select> cannot. Driven by clicking its option, not by selectOption.
      { selector: '[data-essence-membership-option="all"]' },
    ],
    expectView: 'essences',
    expectSelector: '[data-essence-membership-filter]',
    // Containment is for controls that must fit, never for list rows: `expectContained` asserts a
    // target sits inside its container's box, and a row in a scrolling column legitimately extends
    // past `.manager-main`.
    expectContained: [{ container: '.manager-main', target: '[data-essence-membership-filter]' }],
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceBrowserView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/EssenceRow\.svelte$/,
    ],
  }),
  // The state it would show — one section inherited with its value card locked and one overridden
  // beside it — is reached by flipping an inherit switch, and in the View Lab that write does not
  // reach the screen: the toggle renders and clicks, and neither its own state chip nor the value
  // card beneath it changes.
  managerCase({
    id: 'manager-environments-browse-normal',
    label: 'Manager — Environments browse normal',
    smokeLabels: ['manager-environments-browse-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Gathering'],
    expectView: 'environments',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
    ],
  }),
  managerCase({
    id: 'manager-environments-browse-stacked',
    label: 'Manager — Environments browse stacked',
    smokeLabels: ['manager-environments-browse-stacked'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Gathering'],
    expectView: 'environments',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-tasks-browse-normal',
    label: 'Manager — Gathering tasks browse normal',
    // Beyond the smoke: `screenshotCaptureMap.js` carries the two task-EDITOR labels and nothing
    // for the library that lists them, so there is no smoke routine to name.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // The tasks library is a SECTION of the environments route, exactly as the events library is
    // (`EnvironmentsBrowserView.svelte:1111` renders `GatheringTasksBrowserView`), so the route
    // key stays `environments` and the second step moves the section rather than the route.
    steps: ['Gathering', { selector: '#manager-gathering-nav-tasks' }],
    expectView: 'environments',
    // The inspector fact, which needs no click to populate: `selectedGatheringTaskId` falls back to
    // `gatheringTaskDefinitions[0]?.id` over the declaration-ordered library, so the browse opens
    // on `hb-task-forage`.
    expectSelector: '.fabricate-manager [data-gathering-task-fact="environments"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTasksBrowserView)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-normal',
    label: 'Manager — Gathering task editor normal',
    smokeLabels: ['manager-gathering-task-editor-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a submenu, so reaching the task library is two clicks:
    // `Gathering` opens the group on Environments, then the `tasks` subitem switches the section.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
    ],
    expectView: 'gathering-task-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
    ],
  }),
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].map(({ suffix, width, height }) =>
    managerCase({
      id: `manager-gathering-task-node-interval-${suffix}`,
      label: `Manager — Gathering resource node interval ${suffix}`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-smithing' },
      position: { width, height },
      // Herbalism disables nodes. Prospecting reaches the actual paired-control layout (#1649).
      steps: [
        'Gathering',
        { selector: '#manager-gathering-nav-tasks' },
        {
          selector:
            '[data-gathering-task-id="sm-task-prospect"] .manager-icon-button[aria-label^="Edit"]',
        },
        { selector: '[data-gathering-task-node-respawn]', select: 'overTime' },
        { selector: '[data-gathering-task-node-interval]', fill: '1440' },
        { selector: '[data-gathering-task-nodes]', scroll: true },
      ],
      expectView: 'gathering-task-edit',
      expectSelector: '[data-gathering-task-node-respawn] option[value="overTime"]:checked',
      expectVisible: '[data-gathering-task-node-interval]',
      expectCenterHit: '[data-gathering-task-node-interval]',
      expectNoHorizontalOverflow: '[data-gathering-task-nodes]',
      expectContained: [
        '[data-gathering-task-node-count]',
        '.manager-task-node-interval-row .fab-stepper',
        '[data-gathering-task-node-interval]',
        '[data-gathering-task-node-interval-unit]',
      ].map((target) => ({ container: '[data-gathering-task-nodes]', target })),
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/],
    })
  ),
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].flatMap(({ suffix, width, height }) =>
    ['task-availability', 'task-tools', 'event-availability'].map((state) => {
      const kind = state.startsWith('task') ? 'task' : 'event';
      const tools = state === 'task-tools';
      const availability = `[data-gathering-${kind}-availability]`;
      const toolPill = '[data-gathering-task-required-tool-pill="hb-tool-mortar"]';
      const toolCard = '[data-gathering-task-required-tools-card="hb-tool-mortar"]';
      const focus = tools ? '[data-gathering-task-required-tools-attached]' : availability;
      const emptyFields = ['biomes', 'timeOfDay', 'weather'].map(
        (field) => `[data-gathering-${kind}-availability-pills="${field}"] .manager-empty.is-field`
      );
      return managerCase({
        id: `manager-gathering-${state}-feedback-${suffix}`,
        label: `Manager — Gathering ${state} feedback ${suffix}`,
        reaches: 'beyond',
        smokeLabels: [],
        query: { system: 'lab-herbalism' },
        position: { width, height },
        steps: [
          'Gathering',
          { selector: `#manager-gathering-nav-${kind === 'task' ? 'tasks' : 'encounters'}` },
          {
            selector:
              `[data-gathering-${kind}-id="${kind === 'task' ? 'hb-task-slowbloom' : 'hb-event-wolves'}"]` +
              ' .manager-icon-button[aria-label^="Edit"]',
          },
          ...(kind === 'task'
            ? [
                { selector: '[data-gathering-task-availability-pill="biomes"] [data-chip-remove]' },
                { selector: toolCard },
                { selector: `${toolPill} [data-chip-remove]`, press: 'Space' },
                { selector: toolCard, press: 'Enter' },
              ]
            : []),
          ...['biomes', 'timeOfDay', 'weather'].flatMap((field) => [
            {
              selector: `[data-gathering-${kind}-field="${field}"] .manager-condition-menu-button`,
            },
            { selector: `[data-gathering-${kind}-availability-option="${field}"]`, press: 'Enter' },
            {
              selector: `[data-gathering-${kind}-availability-pill="${field}"] [data-chip-remove]`,
              press: 'Space',
            },
          ]),
          { selector: focus, scroll: true },
        ],
        expectView: `gathering-${kind}-edit`,
        expectSelector:
          `.fabricate-manager${emptyFields.map((selector) => `:has(${selector})`).join('')}` +
          (kind === 'task' ? `:has(${toolPill} img)` : ''),
        expectVisible: focus,
        expectCenterHit: tools ? `${toolPill} [data-chip-remove]` : null,
        expectNoHorizontalOverflow: focus,
        expectContained: (tools ? [toolPill, `${toolPill} [data-chip-remove]`] : emptyFields).map(
          (target) => ({ container: '.manager-main', target })
        ),
        kinds: ['manager', 'environments', 'responsive'],
        sourceMatches: [
          /^src\/ui\/svelte\/apps\/manager\/Gathering(TaskEditView|EventEditView)\.svelte$/,
        ],
      });
    })
  ),
  managerCase({
    id: 'manager-gathering-task-editor-straight',
    label: 'Manager — Gathering task Direct yields',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'straight' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-task-results="straight"] [data-recipe-result-item]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
    ],
  }),
  ...['selector', 'straight', 'routed'].map((mode) =>
    managerCase({
      id: `manager-gathering-task-editor-${mode}-narrow`,
      label: `Manager — Gathering task ${mode}, narrow`,
      smokeLabels: [],
      reaches: 'beyond',
      position: { width: 1000, height: 720 },
      query: {
        system: 'lab-herbalism',
        gatheringTaskMode: mode === 'selector' ? 'straight' : mode,
      },
      steps: [
        'Gathering',
        { selector: '#manager-gathering-nav-tasks' },
        {
          selector:
            '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
        },
        {
          selector:
            mode === 'selector'
              ? '[data-gathering-task-resolution]'
              : '[data-gathering-task-results]',
          scroll: true,
        },
      ],
      expectView: 'gathering-task-edit',
      expectSelector:
        mode === 'selector'
          ? '[data-gathering-task-resolution-mode]'
          : `[data-gathering-task-results="${mode}"]`,
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
        /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
      ],
    })
  ),
  managerCase({
    id: 'manager-gathering-task-editor-routed',
    label: 'Manager — Gathering task Matched check yields',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'routed' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-routed-tier-status="lab-abundant"][data-match-count="1"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-routed-unmatched',
    label: 'Manager — Gathering task Unmatched check yields',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism', gatheringTaskMode: 'routed-unmatched' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-results]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    expectSelector: '[data-gathering-routed-tier-status="lab-abundant"][data-match-count="0"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringTaskEditView)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/Recipe(ResultGroupCard|ResultsSection)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-availability-menu',
    label: 'Manager — Gathering task availability menu open',
    // Beyond the smoke: no smoke routine opens an availability menu, so there is no counterpart
    // frame of this state and no label to name.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // `hb-task-slowbloom` authors `biomes: ['mountain']` against a four-entry biome vocabulary, so
    // the menu opens on the three still-unselected biomes rather than on the empty state.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-gathering-task-availability]', scroll: true },
      { selector: '[data-gathering-task-field="biomes"] .manager-condition-menu-button' },
    ],
    expectView: 'gathering-task-edit',
    // The portaled panel, and an option inside it. Asserting the option alone would be satisfied by
    // the old in-place menu; asserting the popover alone would be satisfied by an empty one.
    expectSelector:
      '.fabricate-manager .manager-travel-popover [data-gathering-task-availability-option="biomes"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Gathering(EventEditView|TaskEditView)\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-stacked',
    label: 'Manager — Gathering task editor stacked',
    smokeLabels: ['manager-gathering-task-editor-stacked'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-tasks' },
      {
        selector:
          '[data-gathering-task-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="Edit"]',
      },
      // At 1000px the task library stacks, so Playwright has to scroll the panel to reach the row's
      // Edit control — and the editor then mounts into a container that kept that scroll offset,
      // framing "Required Tools" instead of the identity card.
      { selector: '[data-gathering-task-core-editor]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // 1000x720, the width its smoke counterpart stacks at — the previous 1280x820 was the
    // NORMAL geometry, so the two cases differed in nothing at all.
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
    ],
  }),
  managerCase({
    id: 'manager-environment-edit-placeholder',
    label: 'Manager — Environment edit placeholder',
    smokeLabels: ['manager-environment-edit-placeholder'],
    // The environment editor's Overview tab — identity, context, player-facing behaviour and
    // composition mode, with the summary/linked-scene/validation/runtime inspector beside it.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
      },
    ],
    expectView: 'environment-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/],
  }),
  ...[
    { suffix: 'normal', width: 1280, height: 820 },
    { suffix: 'narrow', width: 1000, height: 720 },
  ].map(({ suffix, width, height }) => {
    const fields = [
      '[data-environment-field="includedRealmIds"]',
      '.manager-environment-context-biomes',
    ];
    const emptyFields = fields.map((field) => `${field} .manager-empty.is-field`);
    const context = '[data-overview-section="context"]';
    return managerCase({
      id: `manager-environment-empty-membership-${suffix}`,
      label: `Manager — Environment empty realms and biomes ${suffix}`,
      reaches: 'beyond',
      smokeLabels: [],
      query: { system: 'lab-herbalism' },
      position: { width, height },
      // Herbalism opts out of realms; enable participation through the existing settings UI.
      steps: [
        'System Overview',
        { selector: '#system-tab-settings' },
        { selector: '[data-gathering-realm-toggle]', press: 'Space' },
        'Gathering',
        {
          selector:
            '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
        },
        ...[
          ['realm', 'hb-realm-verdant'],
          ['biome', 'forest'],
        ].flatMap(([kind, id], index) => {
          const remove = `[data-environment-${kind}-pill="${id}"] [data-chip-remove]`;
          return [
            { selector: remove, press: 'Space' },
            { selector: `${fields[index]} select`, select: id },
            { selector: remove, press: 'Space' },
          ];
        }),
        { selector: context, scroll: true },
      ],
      expectView: 'environment-edit',
      expectSelector: `.fabricate-manager${emptyFields.map((selector) => `:has(${selector})`).join('')}`,
      expectVisible: context,
      expectNoHorizontalOverflow: context,
      expectContained: [...emptyFields, ...fields.map((field) => `${field} select`)].map(
        (target) => ({ container: '.manager-main', target })
      ),
      kinds: ['manager', 'environments', 'responsive'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentOverviewTab\.svelte$/,
      ],
    });
  }),
  managerCase({
    id: 'manager-environment-edit-events',
    label: 'Manager — Environment edit Events tab',
    smokeLabels: ['manager-environment-edit-events'],
    // `exact`: the smoke's own walk clicks this tab and photographs it without selecting anything,
    // and so does this.
    reaches: 'exact',
    // No fixture change.
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-events' },
    ],
    expectView: 'environment-edit',
    // The route survives a tab click that did nothing, so the assertion names the tab panel AND the
    // inspector the auto-selection populates.
    expectSelector:
      '.fabricate-manager:has([data-environment-tab="events"] .manager-environment-comp-row.is-selected)' +
      ' [data-record-inspector="event"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-events-normal',
    label: 'Manager — Gathering events normal',
    smokeLabels: ['manager-gathering-events-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // `encounters`, not `events`: the nav item's id is the route key, and the label is the only
    // place the word "Events" appears.
    steps: ['Gathering', { selector: '#manager-gathering-nav-encounters' }],
    // The events library is a SECTION of the environments route, so the route key is unchanged;
    // the section is what the second step moves.
    expectView: 'environments',
    // The inspector fact, pinned because it is the only evidence that the event browser calls
    // `activeEnvironmentsForRecord` correctly (issue 1321): the seam's own suite proves the return
    // value, and the caller is an unexported component local no unit test can reach.
    expectSelector: '.fabricate-manager [data-gathering-event-fact="environments"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
      // The facts this case exists to show are computed and rendered here.
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-event-editor-normal',
    label: 'Manager — Gathering event editor normal',
    smokeLabels: ['manager-gathering-event-editor-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-encounters' },
      {
        selector:
          '[data-gathering-event-id="hb-event-wolves"] .manager-icon-button[aria-label^="Edit"]',
      },
      // The danger pills into frame (issue 1515).
      { selector: '[data-gathering-event-danger-pills]', scroll: true },
    ],
    expectView: 'gathering-event-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView)/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-default-collapsed',
    label: 'Manager — World Travel collapsed by default',
    smokeLabels: ['manager-world-travel-default-collapsed'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [],
    expectView: 'systems',
    expectSelector: '#manager-world-nav-travel[aria-expanded="false"]:not(.is-active)',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-expanded-neutral',
    label: 'Manager — World Travel expanded neutral',
    smokeLabels: ['manager-world-travel-expanded-neutral'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [{ selector: '#manager-travel-toggle', press: 'Space' }],
    expectView: 'systems',
    expectSelector:
      '.manager-world-travel-group:has(#manager-world-nav-travel[aria-expanded="true"])' +
      ':not(:has([aria-current="page"]))',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-normal',
    label: 'Manager — World Parties normal',
    smokeLabels: ['manager-world-parties-normal'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [{ selector: '#manager-world-nav-parties', press: 'Enter' }],
    expectView: 'world',
    expectSelector: '[data-travel-panel="parties"]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(MapLinksTab|PartiesTab|RealmsTab)/,
      /^src\/ui\/svelte\/apps\/manager\/(Party|Realm|RosterRow|MapRegionLinkPicker)/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-stacked',
    label: 'Manager — World Parties stacked',
    // Same populated state as the normal frame, pinned inside the manager's 1120px responsive
    // breakpoint so the full-width Parties route is photographed after the shell restacks.
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [{ selector: '#manager-world-nav-parties', press: 'Enter' }],
    expectView: 'world',
    expectSelector: '[data-travel-panel="parties"]',
    position: { width: 1100, height: 900 },
    kinds: ['manager', 'environments', 'world', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(MapLinksTab|PartiesTab|RealmsTab)/,
      /^src\/ui\/svelte\/apps\/manager\/(Party|Realm|RosterRow|MapRegionLinkPicker)/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-card-stacked-680',
    label: 'Manager — World Parties card stacked at 680px',
    // The browser viewport stays 1920x1080; only the Foundry window is narrow. This case therefore
    // proves the card responds to the named manager container rather than to a viewport media rule.
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [{ selector: '#manager-world-nav-parties', press: 'Enter' }],
    expectView: 'world',
    expectSelector:
      '[data-travel-panel="parties"] [data-manager-party-body="lab-party"]' +
      ':has([data-manager-party-add-open="lab-party"])' +
      ':has([data-manager-party-actor-trigger="lab-party"])',
    position: { width: 680, height: 900 },
    kinds: ['manager', 'environments', 'world', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringPartiesTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/Party/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-no-selection',
    label: 'Manager — World Parties with no crafting system selected',
    // The live smoke always has systems and normalizes an empty selection to the first one. This
    // honest no-systems state is therefore View-Lab-only, not a Foundry smoke counterpart.
    smokeLabels: [],
    reaches: 'beyond',
    query: { clearSystem: '1' },
    steps: [{ selector: '#manager-world-nav-parties', press: 'Enter' }],
    expectView: 'world',
    expectSelector: '[data-travel-panel="parties"] [data-party-realm-override-unavailable]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|EnvironmentsBrowserView|GatheringPartiesTab)\.svelte$/,
      // The gate lock this case is named for is drawn by `PartyExpandedBody`, in the card's right
      // column.
      /^src\/ui\/svelte\/apps\/manager\/Party/,
    ],
  }),
  // The World > Parties states the populated frame cannot hold.
  managerCase({
    id: 'manager-world-parties-empty',
    label: 'Manager — World Parties empty',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', noParties: '1' },
    steps: [{ selector: '#manager-world-nav-parties', press: 'Enter' }],
    expectView: 'world',
    // The primitive's own hook, so the frame proves the pane rendered `EmptyState` rather than
    // a bespoke panel — `ui-integration/spec.md:174` requires every manager "nothing here"
    // message to go through the one primitive and `:182` forbids a per-screen size override.
    expectSelector: '[data-travel-panel="parties"] [data-travel-parties-none]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|EnvironmentsBrowserView|GatheringPartiesTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-search-filtered',
    label: 'Manager — World Parties filtered by search',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-world-nav-parties', press: 'Enter' },
      { selector: '[data-manager-party-search]', fill: WORLD_PARTIES_SEARCH_TERM },
    ],
    expectView: 'world',
    // Both survivors on one page is the claim, and it is unreachable unfiltered: the five parties
    // page at three, and these two are the second and the fifth, so they are never siblings in the
    // same list without the filter.
    expectSelector:
      '[data-travel-panel="parties"] .manager-travel-parties-list' +
      ':has([data-manager-travel-party-id="lab-party-long-haul"])' +
      ':has([data-manager-travel-party-id="lab-party-wagonwright"])',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(EnvironmentsBrowserView|GatheringPartiesTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-last-page',
    label: 'Manager — World Parties last page',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-world-nav-parties', press: 'Enter' },
      { selector: '.manager-travel-parties [data-pagination-next]' },
    ],
    expectView: 'world',
    // Five records at the default page size of three: page two holds the trailing two, so the
    // absence of the first card is as load-bearing as the presence of the last.
    expectSelector:
      '[data-travel-panel="parties"] .manager-travel-parties-list' +
      ':has([data-manager-travel-party-id="lab-party-wagonwright"])' +
      ':not(:has([data-manager-travel-party-id="lab-party"]))',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(EnvironmentsBrowserView|GatheringPartiesTab)\.svelte$/,
      /^src\/ui\/svelte\/components\/Pagination\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-pane-alert',
    label: 'Manager — World Parties refused enable',
    // The pane alert, which no case reached (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing' },
    // `lab-party-emberwatch` is disabled and holds two of the three characters that the enabled
    // `lab-party` already holds, so enabling it violates `GatheringPartyStore`'s composite
    // uniqueness invariant and the write is refused.
    steps: [
      { selector: '#manager-world-nav-parties', press: 'Enter' },
      { selector: '[data-manager-party-enable="lab-party-emberwatch"]' },
      // AND scroll back to the alert, which is the whole subject of the frame (issue 1515, driver
      // capture).
      { selector: '[data-manager-party-summary-error]', scroll: true },
    ],
    expectView: 'world',
    // The alert inside the parties pane, not merely somewhere in the window: the same refusal
    // reaches a card's own field error on a different operation, and that element is a different
    // contract with a different owner.
    expectSelector:
      '[data-travel-panel="parties"]' +
      ' .fab-notice[data-manager-party-summary-error][role="alert"]',
    // In the picture, not merely in the DOM.
    expectContained: [
      {
        container: '.manager-travel-parties-content',
        target: '[data-manager-party-summary-error]',
      },
    ],
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(EnvironmentsBrowserView|GatheringPartiesTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/Party/,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-actor-picker',
    label: 'Manager — World Parties travel-actor picker open',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-world-nav-parties', press: 'Enter' },
      { selector: '[data-manager-party-actor-trigger="lab-party"]' },
    ],
    expectView: 'world',
    // Content, not the trigger.
    expectSelector:
      '.fabricate-manager .manager-travel-actor-popover' +
      ':has([data-popover-header])' +
      ':has([data-popover-filtered-count])' +
      ':not(:has([data-manager-party-actor-unlink-footer]))' +
      ' .manager-travel-option .manager-travel-option-meta',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/GatheringPartiesTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/Party/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-world-parties-realm-override-picker',
    label: 'Manager — World Parties realm-override picker open',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-world-nav-parties', press: 'Enter' },
      { selector: '.manager-travel-parties-override-trigger' },
    ],
    expectView: 'world',
    // The only frame that renders `SearchablePopover`'s in-popover search row.
    expectSelector:
      '.fabricate-manager .manager-travel-popover.is-compact-option-rows' +
      ':has([data-popover-header])' +
      ':has([data-popover-filtered-count])' +
      ':has(.manager-travel-popover-search.is-compact)' +
      ' .manager-travel-option',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RealmOverridePicker\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GatheringPartiesTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/Party/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  // The tooltip column is the shipped `Tabs.<Tab>.Tooltip` string verbatim (issue 1185
  // aligned it to the design's own wording), so a lang edit that forgets these frames
  // fails the case rather than publishing a frame whose caption no longer exists.
  ...[
    [
      'tracking',
      'Tracking',
      'Open the Tracking preview',
      'Preview Downtime Tracking · Fabricate Premium',
    ],
    [
      'activities',
      'Activities',
      'Open the Activities preview',
      'Preview Downtime Activities · Fabricate Premium',
    ],
    [
      'factions',
      'Factions',
      'Open the Factions preview',
      'Preview Factions & Reputation · Fabricate Premium',
    ],
    [
      'settings',
      'Settings',
      'Open the Settings preview',
      'Preview Downtime Settings · Fabricate Premium',
    ],
  ].map(([tabId, tabLabel, accessibleName, tooltip]) =>
    managerCase({
      id: `manager-world-downtime-${tabId}`,
      label: `Manager — World Downtime ${tabLabel}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { system: 'lab-smithing' },
      steps: [
        { selector: '#manager-world-nav-downtime', press: 'Enter' },
        { selector: `[data-downtime-tab="${tabId}"]`, press: 'Enter' },
        { selector: '.downtime-preview:not([hidden]) .downtime-cta', scroll: true },
      ],
      expectView: 'world-downtime',
      expectSelector: `[data-downtime-panel="${tabId}"]`,
      expectAttributes: [
        { selector: `[data-downtime-tab="${tabId}"]`, name: 'aria-selected', value: 'true' },
        {
          selector: `[data-downtime-tab="${tabId}"]`,
          name: 'aria-label',
          value: accessibleName,
        },
        {
          selector: `[data-downtime-tab="${tabId}"]`,
          name: 'aria-describedby',
          value: `world-downtime-tooltip-${tabId}`,
        },
        {
          selector: '.downtime-preview:not([hidden]) .downtime-cta',
          name: 'href',
          value: 'https://www.patreon.com/c/mistersilver',
        },
        {
          selector: '.downtime-preview:not([hidden]) .downtime-cta',
          name: 'target',
          value: '_blank',
        },
        {
          selector: '.downtime-preview:not([hidden]) .downtime-cta',
          name: 'rel',
          value: 'noopener noreferrer',
        },
        ...['tracking', 'activities', 'factions', 'settings'].map((id) => ({
          selector: `[data-downtime-tab="${id}"]`,
          name: 'aria-controls',
          value: `world-downtime-panel-${id}`,
        })),
        // The rail child and the studio-card button are two triggers for ONE navigation,
        // so the frame proves the rail followed the card that drove it (issue 1185).
        {
          selector: `[data-world-downtime-item="${tabId}"]`,
          name: 'aria-current',
          value: 'true',
        },
      ],
      expectVisible: `[data-downtime-tooltip="${tabId}"]:has-text("${tooltip}")`,
      expectContained: [
        { container: '#manager-world-nav-parties', target: '#manager-world-nav-parties > i' },
        { container: '#manager-world-nav-downtime', target: '#manager-world-nav-downtime > i' },
      ],
      expectCenterHit: '.downtime-preview:not([hidden]) .downtime-cta',
      expectClick: '.downtime-preview:not([hidden]) .downtime-cta',
      expectNoHorizontalOverflow: ['[data-world-downtime-host]', '.manager-main', '.manager-body'],
      // The pane owns the vertical overflow at every size, which is what `expectOverflowY` states.
      expectOverflowY: '.downtime-preview-scroll',
      position: { width: 1330, height: 900 },
      kinds: ['manager', 'world', 'downtime'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
        /^src\/ui\/svelte\/apps\/manager\/downtime\//,
      ],
    })
  ),
  managerCase({
    id: 'manager-world-downtime-narrow',
    label: 'Manager — World Downtime narrow long localization',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', longDowntimeLabels: '1' },
    steps: [
      { selector: '#manager-world-nav-downtime', press: 'Enter' },
      { selector: '[data-downtime-tab="tracking"]', press: 'Enter' },
      { selector: '.downtime-preview:not([hidden]) .downtime-cta', scroll: true },
    ],
    expectView: 'world-downtime',
    expectSelector: '[data-downtime-panel="tracking"]',
    expectAttributes: [
      {
        selector: '[data-downtime-tab="tracking"]',
        name: 'aria-label',
        value: 'Open campaign-wide tracking and pending decisions',
      },
      {
        selector: '[data-downtime-tab="tracking"]',
        name: 'aria-describedby',
        value: 'world-downtime-tooltip-tracking',
      },
      {
        selector: '.downtime-preview:not([hidden]) .downtime-cta',
        name: 'href',
        value: 'https://www.patreon.com/c/mistersilver',
      },
      {
        selector: '.downtime-preview:not([hidden]) .downtime-cta',
        name: 'target',
        value: '_blank',
      },
      {
        selector: '.downtime-preview:not([hidden]) .downtime-cta',
        name: 'rel',
        value: 'noopener noreferrer',
      },
    ],
    expectVisible:
      '[data-downtime-tooltip="tracking"]:has-text("Preview campaign-wide tracking and pending decisions in Fabricate Premium")',
    expectContained: [
      { container: '#manager-world-nav-parties', target: '#manager-world-nav-parties > i' },
      { container: '#manager-world-nav-downtime', target: '#manager-world-nav-downtime > i' },
    ],
    expectNoHorizontalOverflow: [
      '[data-world-downtime-host]',
      '.manager-main',
      '.manager-body',
      '.fabricate-manager',
    ],
    expectOverflowY: '.downtime-preview-scroll',
    expectScrollable: '.downtime-preview-scroll',
    expectCenterHit: '.downtime-preview:not([hidden]) .downtime-cta',
    expectClick: '.downtime-preview:not([hidden]) .downtime-cta',
    position: { width: 960, height: 900 },
    kinds: ['manager', 'world', 'downtime', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/downtime\//,
    ],
  }),
  managerCase({
    id: 'manager-world-downtime-collapsed',
    label: 'Manager — World Downtime collapsed rail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-world-nav-downtime', press: 'Enter' },
      { selector: '[data-manager-rail-toggle]', press: 'Enter' },
      { selector: '[data-downtime-tab="tracking"]', press: 'Enter' },
      { selector: '.downtime-preview:not([hidden]) .downtime-cta', scroll: true },
    ],
    expectView: 'world-downtime',
    expectSelector: '.manager-body.is-rail-collapsed [data-downtime-panel="tracking"]',
    expectAttributes: [
      {
        selector: '.downtime-preview:not([hidden]) .downtime-cta',
        name: 'href',
        value: 'https://www.patreon.com/c/mistersilver',
      },
      {
        selector: '.downtime-preview:not([hidden]) .downtime-cta',
        name: 'target',
        value: '_blank',
      },
      {
        selector: '.downtime-preview:not([hidden]) .downtime-cta',
        name: 'rel',
        value: 'noopener noreferrer',
      },
    ],
    expectVisible: '[data-downtime-tooltip="tracking"]',
    expectContained: [
      { container: '#manager-world-nav-parties', target: '#manager-world-nav-parties > i' },
      { container: '#manager-world-nav-downtime', target: '#manager-world-nav-downtime > i' },
    ],
    expectNoHorizontalOverflow: ['[data-world-downtime-host]', '.manager-main', '.manager-body'],
    // Collapsing the rail WIDENS the pane, so this frame overflows even less than the tab
    // frames above — same reasoning, same owner for the scrolling proof.
    expectOverflowY: '.downtime-preview-scroll',
    expectCenterHit: '.downtime-preview:not([hidden]) .downtime-cta',
    expectClick: '.downtime-preview:not([hidden]) .downtime-cta',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world', 'downtime', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/downtime\//,
    ],
  }),
  // Issue 1185 — the premium-installed chrome.
  managerCase({
    id: 'manager-world-downtime-test-companion-installed',
    label: 'Manager — premium-installed chrome, driven by a TEST companion',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', downtimeProvider: '1' },
    // Collapse the rail first, and the order is the whole point (issue 1213).
    steps: [
      { selector: '[data-manager-rail-toggle]', press: 'Enter' },
      { selector: '#manager-world-nav-downtime', press: 'Enter' },
    ],
    expectView: 'world-downtime',
    // One selector for the whole lock: the body is NOT collapsed although the GM's stored
    // preference says it is, and the control that would collapse it is genuinely disabled and
    // reports the displayed state rather than the stored one.
    expectSelector:
      '.manager-body:not(.is-rail-collapsed) [data-manager-rail-toggle][disabled][aria-pressed="false"]',
    expectAttributes: [
      {
        selector: '[data-manager-titlebar-premium]',
        name: 'aria-label',
        value: 'Fabricate Premium is installed and connected',
      },
      {
        selector: '#manager-world-nav-downtime',
        name: 'title',
        value: 'Downtime Studio is unlocked by Fabricate Premium',
      },
      {
        selector: '[data-world-nav-premium]',
        name: 'data-world-nav-premium-state',
        value: 'installed',
      },
      // The lock explains itself in sidebar wording, not the section-scoped string the rail
      // GROUPS use.
      {
        selector: '[data-manager-rail-toggle]',
        name: 'title',
        value: 'The sidebar stays open on this page.',
      },
      // No tab strip over a companion's screens: its tabs are the rail sub-items, and the
      // panel is a region named by the one that is current.
      {
        selector: '[data-downtime-extension-panel]',
        name: 'data-downtime-extension-panel',
        value: 'ledger',
      },
      // Named by the sub-item's LABEL, not by the sub-item: the button carries the tab's
      // `accessibleName` as its own name, which is an instruction, and a landmark takes the
      // name of the screen.
      {
        selector: '#world-downtime-panel-ledger',
        name: 'aria-labelledby',
        value: 'manager-downtime-nav-label-ledger',
      },
      { selector: '#world-downtime-panel-ledger', name: 'role', value: 'region' },
      {
        selector: '#manager-downtime-nav-ledger',
        name: 'aria-label',
        value: 'Open the downtime ledger',
      },
    ],
    // The title bar carries the loud signal and the rail chip is muted beside it; the
    // provider's own three tabs are rendered rather than Core's four.
    expectVisible: '[data-manager-titlebar-premium]:has-text("PREMIUM")',
    expectContained: [
      { container: '#manager-world-nav-parties', target: '#manager-world-nav-parties > i' },
      { container: '#manager-world-nav-downtime', target: '#manager-world-nav-downtime > i' },
      // Issue 1302 — geometrically inside its OWN sub-item, keyed on the tab id on both sides:
      // `expectContained` resolves each side with `document.querySelector` and is first-match,
      // not strict, so an unkeyed pair would compare the first sub-item's box against the first
      // badge's box, which need not be the same row.
      {
        container: '[data-world-downtime-item="ledger"]',
        target: '[data-world-downtime-badge="ledger"]',
      },
    ],
    expectNoHorizontalOverflow: [
      '[data-world-downtime-host]',
      '.manager-main',
      '.manager-body',
      '.manager-rail',
      '[data-world-downtime-submenu]',
    ],
    // The companion owns the scrolling, which is only true if Core handed it the whole height.
    expectOverflowY: '[data-lab-companion-scroll]',
    expectScrollable: '[data-lab-companion-scroll]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world', 'downtime'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/downtime\//,
      /^src\/ui\/managerExtensions\.js$/,
      /^src\/ui\/navTabBadgeStore\.js$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  // The companion driving core's header.
  managerCase({
    id: 'manager-world-downtime-test-companion-chrome',
    label: 'Manager — route header driven by a TEST companion',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', downtimeProvider: '1' },
    steps: [
      { selector: '#manager-world-nav-downtime', press: 'Enter' },
      { selector: '[data-lab-companion-drilldown]' },
    ],
    expectView: 'world-downtime',
    // The identity block Core's recipe and component editors render, now over a companion's
    // screen — and its medallion carrying a real image rather than the glyph fallback.
    expectSelector: '[data-downtime-chrome-heading] [data-medallion="image"] img',
    expectAttributes: [
      // THE TRAIL GROWS BY ONE CRUMB rather than changing its last word (issue 1322): the tab
      // crumb keeps its own name and the drill-down's hangs beneath it, so a GM inside a
      // companion's detail can still see -- and press -- the tab they reached it through.
      {
        selector: '[data-breadcrumb-downtime-tab]',
        name: 'data-breadcrumb-downtime-tab',
        value: 'ledger',
      },
      {
        selector: '[data-breadcrumb-downtime-leaf]',
        name: 'data-breadcrumb-downtime-leaf',
        value: '',
      },
      { selector: '.manager-header-actions', name: 'aria-label', value: 'Crew member actions' },
      // Core's own three treatments, reached through the seam's `tone`.
      {
        selector: '[data-manager-header-action="lab-back"]',
        name: 'class',
        value: 'fabricate-button manager-button is-ghost',
      },
      {
        selector: '[data-manager-header-action="lab-delete"]',
        name: 'class',
        value: 'fabricate-button manager-button is-danger',
      },
      {
        selector: '[data-manager-header-action="lab-save"]',
        name: 'class',
        value: 'fabricate-button manager-button is-primary',
      },
      // The companion's screen is still mounted: the header changed, the mount did not.
      {
        selector: '[data-downtime-extension-panel]',
        name: 'data-downtime-extension-panel',
        value: 'ledger',
      },
    ],
    expectVisible: '[data-downtime-chrome-status]:has-text("Unsaved")',
    expectNoHorizontalOverflow: ['.manager-header', '[data-world-downtime-host]', '.manager-body'],
    expectCenterHit: '[data-manager-header-action="lab-save"]',
    expectClick: '[data-manager-header-action="lab-save"]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world', 'downtime'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/downtime\//,
      /^src\/ui\/managerExtensions\.js$/,
      /^src\/ui\/svelte\/components\/Chip\.svelte$/,
      /^src\/ui\/svelte\/components\/Medallion\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  // Issue 1302 — the Downtime parent rollup, the state Core reaches on a fresh Manager open: the
  // disclosure closed and never yet visited (`railGroupUserExpanded.worldDowntime` seeds `false`,
  // and `isWorldDowntimeRoute` is false off the Downtime route, so nothing locks it open).
  managerCase({
    id: 'manager-world-downtime-test-companion-rollup',
    label: 'Manager — Downtime rollup on a closed disclosure, with a TEST companion',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', downtimeProvider: '1' },
    steps: [],
    expectView: 'systems',
    // One selector proves both halves of the swap: the rollup is present inside the parent button,
    // and — because `:not(:has(...))` is scoped to that same button — the muted `PREMIUM` chip is
    // not a descendant of it.
    expectSelector:
      '#manager-world-nav-downtime:not(:has([data-world-nav-premium])) [data-world-downtime-badge-total]',
    expectAttributes: [
      {
        selector: '[data-world-downtime-badge-total]',
        name: 'aria-label',
        // The lab provider's only badge is the four-digit one on `ledger` (1284), so the rollup
        // total is that same value — Core sums the resolved badge once per tab it renders, never
        // registered-plus-runtime.
        value: '1284 updates',
      },
    ],
    expectContained: [
      {
        container: '#manager-world-nav-downtime',
        target: '[data-world-downtime-badge-total]',
      },
    ],
    // The Downtime parent row is the last rail entry, below Parties, Travel and Currency, and
    // nothing scrolls it into view without a step this state deliberately takes none of.
    position: { width: 1330, height: 1000 },
    kinds: ['manager', 'world', 'downtime'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/managerExtensions\.js$/,
      /^src\/ui\/navTabBadgeStore\.js$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  // Issue 1332 — the companion navigating. Every other Downtime frame is reached by pressing
  // something of core's: a rail entry, a rail sub-item, a preview tab.
  managerCase({
    id: 'manager-world-downtime-test-companion-tab-navigation',
    label: 'Manager — a TEST companion sending the GM to another of its own tabs',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', downtimeProvider: '1' },
    steps: [
      { selector: '#manager-world-nav-downtime', press: 'Enter' },
      { selector: '[data-lab-companion-tab-link]' },
    ],
    expectView: 'world-downtime',
    // The DESTINATION tab's panel, reached without the rail ever being touched.
    expectSelector: '[data-downtime-extension-panel="crew"]',
    expectAttributes: [
      {
        selector: '[data-downtime-extension-panel]',
        name: 'data-downtime-extension-panel',
        value: 'crew',
      },
      // The RAIL FOLLOWED, which is what makes this a navigation rather than a panel swap: the
      // sub-item nobody pressed is now the current one, and the tab that asked is not.
      { selector: '#manager-downtime-nav-crew', name: 'aria-current', value: 'true' },
      { selector: '#manager-downtime-nav-ledger', name: 'aria-current', value: null },
      {
        selector: '#world-downtime-panel-crew',
        name: 'aria-labelledby',
        value: 'manager-downtime-nav-label-crew',
      },
    ],
    // The destination screen carries its own cross-navigation control, pointing on to the third tab
    // — so the frame shows a capability every screen has rather than one button that worked once.
    expectVisible: '[data-lab-companion-tab-link]:has-text("Go to Test Companion")',
    expectNoHorizontalOverflow: [
      '[data-world-downtime-host]',
      '.manager-main',
      '.manager-body',
      '[data-world-downtime-submenu]',
    ],
    expectOverflowY: '[data-lab-companion-scroll]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world', 'downtime'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/downtime\//,
      /^src\/ui\/managerExtensions\.js$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    // World > Travel is ungated (issue 1282).
    id: 'manager-world-travel-ungated',
    label: 'Manager — World Travel present for a non-participating system',
    smokeLabels: ['manager-world-travel-ungated'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [],
    expectView: 'systems',
    expectSelector: '.manager-world-nav:has(#manager-world-nav-travel) #manager-world-nav-parties',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-with-gathering-expanded',
    label: 'Manager — Gathering and World Travel expanded together',
    smokeLabels: ['manager-world-travel-with-gathering-expanded'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [
      {
        selector: '.manager-nav-toggle[aria-controls="manager-gathering-submenu"]',
        press: 'Enter',
      },
      { selector: '#manager-travel-toggle', press: 'Space' },
    ],
    expectView: 'systems',
    expectSelector:
      '.manager-nav:has(.manager-nav-group #manager-gathering-submenu)' +
      ':has(.manager-world-travel-group #manager-travel-submenu)',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-realms-normal',
    label: 'Manager — World Travel Realms expanded',
    smokeLabels: ['manager-world-travel-realms-normal'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-realms', press: 'Enter' },
    ],
    expectView: 'world-travel',
    expectSelector: '.manager-travel-inspector[aria-label="Selected realm"]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringRealmsTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-realms-stacked',
    label: 'Manager — World Travel Realms stacked',
    smokeLabels: ['manager-world-travel-realms-stacked'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-realms', press: 'Enter' },
    ],
    expectView: 'world-travel',
    expectSelector: '[data-travel-panel="realms"]',
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'world', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringRealmsTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-map-normal',
    label: 'Manager — World Travel Map Region Links normal',
    smokeLabels: ['manager-world-travel-map-normal'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-map', press: 'Enter' },
    ],
    expectView: 'world-travel',
    expectSelector:
      '.fabricate-manager:has([data-manager-map-region-uuid="Scene.lab-map.Region.deep-gate"] ' +
      '.manager-map-link-name):has(.manager-travel-inspector' +
      '[aria-label="Selected map region link"] .manager-travel-region-item-name)',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringMapLinksTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-map-stacked',
    label: 'Manager — World Travel Map Region Links stacked',
    smokeLabels: ['manager-world-travel-map-stacked'],
    reaches: 'exact',
    distinctEvidenceGroup: 'manager-world-travel-map-label-focus',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-map', press: 'Enter' },
    ],
    expectView: 'world-travel',
    expectSelector:
      '.fabricate-manager:has([data-manager-map-region-uuid="Scene.lab-map.Region.deep-gate"] ' +
      '.manager-map-link-name):has(.manager-travel-inspector' +
      '[aria-label="Selected map region link"] .manager-travel-region-item-name)',
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'world', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringMapLinksTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-map-collapsed-rail',
    label: 'Manager — World Travel Map Region Links collapsed rail',
    smokeLabels: ['manager-world-travel-map-collapsed-rail'],
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-map', press: 'Enter' },
      { selector: '[data-manager-rail-toggle]', press: 'Enter' },
    ],
    expectView: 'world-travel',
    expectSelector: '.manager-body.is-rail-collapsed #manager-world-nav-travel.is-active',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|GatheringMapLinksTab)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-long-label-focus',
    label: 'Manager — World Travel long child label keyboard focus',
    // The live smoke uses shipped localization, so its ordinary focused Map row is not long-label
    // evidence. The View Lab supplies the localized stress string and guards it against duplicates.
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing', longTravelLabels: '1' },
    distinctEvidenceGroup: 'manager-world-travel-map-label-focus',
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-map', press: 'Space' },
    ],
    expectView: 'world-travel',
    expectSelector: '#manager-travel-nav-map[aria-current="page"]:focus-visible',
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'world', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-settings-normal',
    label: 'Manager — Gathering settings as authored',
    smokeLabels: ['manager-gathering-settings'],
    // `exact`: the smoke reaches this tab by the same two gestures and photographs it without
    // touching a control, which is the whole point of the frame — the settings a GM finds, not a
    // state a walk drove them into.
    reaches: 'exact',
    // Deliberately not `manager-gathering-economy-actors`, which reaches the same tab.
    query: { system: 'lab-herbalism' },
    steps: ['Gathering', { selector: '#manager-gathering-nav-settings' }],
    expectView: 'environments',
    // Resolution belongs to each task; this page starts with its economy limitation controls.
    // The route key alone cannot distinguish these settings from the environments browser.
    expectSelector: '.fabricate-manager [data-economy-mode-card] [data-economy-mode-option]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/GatheringEconomyView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-economy-actors',
    label: 'Manager — Gathering economy actor stamina pools',
    // `beyond`: the live smoke never walks the Gathering Settings tab, so there is no counterpart
    // frame for this to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // The actor stamina table is the only surface no case reached (issue 1050).
    query: { system: 'lab-herbalism' },
    // The state is driven rather than seeded.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-settings' },
      { selector: '[data-economy-mode-option="stamina"]' },
      { selector: '[data-economy-stamina-max]', fill: '12' },
      { selector: '[data-economy-actor-roll]' },
      // A confirming step, not a cosmetic one.
      { selector: '[data-economy-actor-rolled="true"]', scroll: true },
    ],
    expectView: 'environments',
    kinds: ['manager', 'environments'],
    // Deliberately no pattern for `components/Stepper.svelte`: `BROAD_SIGNAL_PATTERN` matches
    // `^src/ui/svelte/components/`, and `selectRenderFileCases` `continue`s on a broad-signal file
    // before it consults any case's `sourceMatches`, so such an entry would be unreachable code.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/GatheringEconomyView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-economy-regen-unit-list',
    label: 'Manager — Gathering economy regeneration unit list',
    smokeLabels: [],
    // `beyond`: the live smoke never walks the Gathering Settings tab at all.
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    // The trailing-edge trigger of the phase.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-settings' },
      { selector: '[data-economy-mode-option="stamina"]' },
      { selector: '[data-economy-stamina-max]', fill: '12' },
      ...chooseSelectOption('[data-economy-regen-policy]', 'overTime'),
      { selector: '[data-economy-regen-unit]' },
    ],
    expectView: 'environments',
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover' +
      ':not(.fabricate-select-popover-ticked) [data-popover-option="weeks"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/GatheringEconomyView\.svelte$/],
  }),
  managerCase({
    id: 'manager-environment-edit-blind-weights',
    label: 'Manager — Environment edit blind task weights',
    reaches: 'beyond',
    smokeLabels: [],
    // `CompositionList`'s weight field renders in one state — `showBlindWeights`, which is `kind
    // === 'task' && selectionMode === 'blind'` — and no case reached it: the list's single existing
    // claim (`manager-environments-browse-normal`) stops at the environments browser.
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-thicket"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-tasks' },
    ],
    expectView: 'environment-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-environment-edit-automatic-force-add',
    label: 'Manager — Environment edit automatic Force add',
    reaches: 'beyond',
    smokeLabels: [],
    // Issue 1315 moved Force add to automatic mode, where a filter exists for it to override, and
    // nothing in the lab photographed the result: the automatic Non-matching section is the section
    // this control lives in, and no case reached it.
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-grove"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-tasks' },
      {
        selector:
          '[data-section-row="non-matching"][data-record-id="hb-task-slowbloom"] .manager-icon-button[aria-label^="More actions"]',
      },
    ],
    expectView: 'environment-edit',
    // The open menu's Force add itself, not the section that holds it.
    expectSelector: '.fabricate-manager .fabricate-action-menu-panel [data-action="force-include"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
      // The positioning seam (issue 1500).
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-environment-validation',
    label: 'Manager — Environment edit Validation tab',
    // Beyond, with an empty label array to match: `screenshotCaptureMap.js` carries no routine for
    // this tab, so the smoke has no counterpart to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // The first frame of this tab, and it is registered before the change that re-skins it (issue
    // 1517), so the conversion has a before to be compared against.
    query: { system: 'lab-herbalism' },
    steps: [
      'Gathering',
      {
        selector:
          '.manager-environment-row[data-environment-id="hb-env-thicket"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#environment-tab-validation' },
    ],
    expectView: 'environment-edit',
    // The route survives a tab click that did nothing, and every other environment editor case
    // proves that by opening a different tab of this same route.
    expectSelector: '[data-environment-tab="validation"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      // The tab itself, which no other case can now claim.
      /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentValidationTab\.svelte$/,
      // Its producer. The same evaluator feeds the tab strip's badge counts, so the four
      // directory claims keep it too; this is the frame that draws its verdict and its rows.
      /^src\/ui\/svelte\/apps\/manager\/environment\/environmentReadiness\.js$/,
      // The host. It owns the tab panel wrapper and the one layout rule only this tab reaches —
      // `is-inspector-hidden`, which releases the inspector column on the validation tab and on
      // no other.
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-01-library-1280x720',
    label: 'Manager — Tool parity 01 library 1280x720',
    smokeLabels: ['manager-tool-parity-01-library-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-adopted-world-tool-1280x720',
    label: 'Manager — Tool rules, world Tool adopted 1280x720',
    // BEYOND, and the empty smoke labels go with it: the live smoke walks no world-Tool
    // adoption, so there is no counterpart frame to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    // The only state that proves the loop closes (issue 1373).
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      { selector: '[data-tool-add-to-system="hb-tool-mortar"]' },
    ],
    expectView: 'tools',
    // A member row, named by the control only a member renders.
    expectSelector:
      '.manager-tools-row[data-manager-tool-id="hb-tool-mortar"] [data-tool-edit-rules]',
    expectContained: [
      {
        container: '.manager-tools-library-list',
        target: '.manager-tools-row[data-manager-tool-id="hb-tool-mortar"]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-empty-library-1280x720',
    label: 'Manager — Tool zero state empty library 1280x720',
    smokeLabels: ['manager-tool-zero-state-empty-library-1280x720'],
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    // The two-button branch, named (issue 1373).
    expectSelector: '[data-tool-empty-browse-world]',
    expectContained: [
      {
        container: '[data-tool-library-empty]',
        target: '[data-tool-empty-browse-world]',
      },
      {
        container: '[data-tool-library-empty]',
        target: '[data-tool-empty-open-catalogue]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-no-world-tools-1280x720',
    label: 'Manager — Tool zero state on a world with no Tools at all 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    // The one-cta branch, which is the state A new world is actually in (issue 1373).
    query: { noTools: '1' },
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    expectSelector: '[data-tool-library-empty]',
    // The remaining route, inside the panel.
    expectContained: [
      {
        container: '[data-tool-library-empty]',
        target: '[data-tool-empty-open-catalogue]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-browse-world-1280x720',
    label: 'Manager — Tool zero state, world Tools browsed 1280x720',
    // BEYOND: the live smoke walks no widened Tool rules list on a system holding none.
    reaches: 'beyond',
    smokeLabels: [],
    // What pressing the zero state's primary route actually draws (issue 1373), and until this case
    // it was unproducible.
    query: { system: 'lab-jewelry' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-empty-browse-world]' },
    ],
    expectView: 'tools',
    // A non-member row carrying its one action.
    expectSelector: '.manager-tools-row[data-tool-row-member="absent"] [data-tool-add-to-system]',
    expectContained: [
      {
        container: '.manager-tools-library-list',
        target: '.manager-tools-row[data-tool-row-member="absent"]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-membership-all-1280x720',
    label: 'Manager — Tool zero state, membership widened to all 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    // The second route to the same state, AND it is not inferable from the first (issue 1373).
    query: { system: 'lab-jewelry' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
    ],
    expectView: 'tools',
    expectSelector: '.manager-tools-row[data-tool-row-member="absent"] [data-tool-add-to-system]',
    expectContained: [
      {
        container: '.manager-tools-library-list',
        target: '.manager-tools-row[data-tool-row-member="absent"]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The inheriting state of the rules editor (issue 1373), and the only frame that shows it.
    id: 'manager-tool-rules-inheriting-1280x720',
    label: 'Manager — Tool rules inheriting the world defaults 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      { selector: '[data-tool-add-to-system="hb-tool-mortar"]' },
      { selector: '[data-tool-edit-rules="hb-tool-mortar"]' },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-rule-card="bonus"][data-tool-rule-state="inheriting"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/tools\/ToolInheritCard\.svelte$/],
  }),
  managerCase({
    // A non-member tool, selected (issue 1373).
    id: 'manager-tool-non-member-selected-1280x720',
    label: 'Manager — Tool rules, non-member Tool selected 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="hb-tool-mortar"] .manager-tools-select-target',
      },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-inspector-add="hb-tool-mortar"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // Filtered to nothing (issue 1373), and the state that let a whole hero panel ship green.
    id: 'manager-tool-rules-filtered-empty-1280x720',
    label: 'Manager — Tool rules filtered to nothing 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-manager-tools-search] input', fill: 'qqzzxx' },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-library-filtered-empty]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The `Overriding` membership filter (issue 1373).
    id: 'manager-tool-rules-overriding-filter-1280x720',
    label: 'Manager — Tool rules filtered to overriding 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="over"]' },
    ],
    expectView: 'tools',
    // The track's `data-tool-membership-filter` stamps `true` rather than the live value since
    // issue 1515 put this control on the shared segmented primitive, so readiness is the third
    // segment being lit - the class the primitive derives from its `value` prop, which is the one
    // reading the component has to re-render to satisfy.
    expectSelector: '[data-tool-membership-option="over"].is-active',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The sort row, driven (issue 1373).
    id: 'manager-tool-rules-sorted-desc-1280x720',
    label: 'Manager — Tool rules sorted by membership descending 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      { selector: '.manager-tools-sort-select', select: 'state' },
      { selector: '.manager-tools-sort-direction' },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-sort-direction="desc"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // A selected row under the pointer (issue 1373), which is how a live cascade defect stayed
    // invisible through three parity passes.
    id: 'manager-tool-rules-row-hovered-1280x720',
    label: 'Manager — Tool rules selected row under the pointer 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="sm-tool-hammer"] .manager-tools-select-target',
      },
    ],
    expectView: 'tools',
    expectSelector: '.manager-tools-row[data-manager-tool-id="sm-tool-hammer"].is-selected:hover',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The breakage-mode card's overridden face (issue 1373).
    id: 'manager-tool-rules-breakage-overridden-1280x720',
    label: 'Manager — Tool rules breakage mode overridden here 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-authority-pill="system"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The editor's rail, scrolled (issue 1373).
    id: 'manager-tool-editor-rail-scrolled-1280x720',
    label: 'Manager — Tool rules editor rail scrolled 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-required-for]', scroll: true },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-preview-usability]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntityPreview\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    // The editor with unsaved changes (issue 1373).
    id: 'manager-tool-editor-dirty-1280x720',
    label: 'Manager — Tool rules editor with unsaved changes 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-breakage-choice="limitedUses"]' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-limited-uses-stepper]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    // The overview frame is gone because the overview tab is (issue 1373).
    id: 'manager-tool-parity-02-remove-1280x720',
    label: 'Manager — Tool parity 02 remove from system 1280x720',
    smokeLabels: ['manager-tool-parity-02-remove-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-remove-from-system]', scroll: true },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-remove-from-system]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-long-name',
    label: 'Manager — Tool stress long name',
    smokeLabels: ['manager-tool-stress-long-name'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // A long display label, authored on the fixture rather than typed: the field is the one the
    // smoke fills, and an authored value reaches the same overflow without a keystroke.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-stylus"] [data-tool-edit-rules]',
      },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-label]',
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolSystemScopeCards\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-03-breakage-1280x720',
    label: 'Manager — Tool parity 03 breakage 1280x720',
    smokeLabels: ['manager-tool-parity-03-breakage-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    // The strip is claimed here (issue 1373).
    sourceMatches: [
      ...TOOL_EDITOR_SHELL_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-repair',
    label: 'Manager — Tool stress repair',
    smokeLabels: ['manager-tool-stress-repair'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // The flag-broken tool, whose two populated repair-requirement groups are the frame.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-mallet"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-breakage' },
      // The repair editor sits below the breakage tab's own fold; without this the frame shows
      // the mode cards and none of the two populated requirement groups the case exists for.
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      // The repair set IS a list of `RecipeIngredientOption` rows at system scope too, and this
      // frame is the only one that photographs them there (issue 1373, round 6).
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
      // The summary sentence's own module, claimed by name since the list cases stopped swallowing
      // the whole `tools/` directory (issue 1373).
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolRepairSummary\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-replacement',
    label: 'Manager — Tool stress replacement',
    smokeLabels: ['manager-tool-stress-replacement'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // The replace-with tool, with its replacement component already chosen.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector: '.manager-tools-row[data-manager-tool-id="rw-tool-punch"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-breakage' },
      { selector: '[data-tool-replacement-target]', scroll: true },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    // The CARD itself is claimed here (issue 1373, maintainer round 2).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolReplacementTarget\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-immune',
    label: 'Manager — Tool stress immune',
    smokeLabels: ['manager-tool-stress-immune'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // Immune is a CHECK-DRIVEN state, and the authority is a per-system radio pair on the tools
    // browser — so the segment is clicked before the tool is opened, exactly as the smoke does
    // it, rather than pinning the whole fixture system to check-driven breakage.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-anvilstone"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-04-requirements-1280x720',
    label: 'Manager — Tool parity 04 requirements 1280x720',
    smokeLabels: ['manager-tool-parity-04-requirements-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    // No `ToolInheritCard` claim here, and that is a choice rather than an omission: this case
    // opens the Anvil, whose two sections are the canonical empty, so both cards draw their
    // off-state sentence and neither shows the inherit row the card's head is spent on.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-prerequisites-selected-1280x720',
    label: 'Manager — Tool requirements, prerequisites with a selection 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    // The state no frame photographed (issue 1373, maintainer round 5).
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-caliper"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-prerequisite-list]',
    // THE CHECKED ROW AND AN UNCHECKED ONE. A frame proving the list renders but not that a
    // selection reads differently from a non-selection would be evidence for half the control.
    expectContained: [
      {
        container: '[data-tool-rule-card="prerequisites"]',
        target: '[data-tool-prerequisite-row="rw-prereq-arcana"].is-active input:checked',
      },
      {
        container: '[data-tool-rule-card="prerequisites"]',
        target:
          '[data-tool-prerequisite-row="rw-prereq-int"] .manager-modifier-readonly-expression',
      },
      {
        container: '[data-tool-rule-card="prerequisites"]',
        target: '[data-tool-prerequisites-summary]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // The row both of this tab's lists draw (issue 1373, round 5), and the checkbox the
      // prerequisite list trails on it.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      // Deliberately no pattern for `components/SelectionCheckbox.svelte`, for the reason
      // `manager-setup-first-run` records: it is a broad signal, `selectRenderFileCases`
      // `continue`s on one before consulting any case's `sourceMatches`, and such an entry would be
      // unreachable.
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolInheritCard\.svelte$/,
      // AND the tab strip, on the one system frame that draws its requirements badge (issue 1373).
      ...TOOL_EDITOR_SHELL_MATCHES,
    ],
  }),
  managerCase({
    id: 'manager-tool-bonus-hand-typed-1280x720',
    label: 'Manager — Tool requirements, hand-typed bonus 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    // The value the library does not contain (issue 1373, maintainer round 3).
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-stylus"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-bonus-modifier="fabricate:tool-bonus-custom"]',
    expectContained: [
      {
        container: '[data-tool-rule-card="bonus"]',
        target: '[data-tool-bonus-modifier="fabricate:tool-bonus-custom"] input:checked',
      },
      { container: '[data-tool-rule-card="bonus"]', target: '[data-tool-bonus-note]' },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // The bonus list's ROW, shared with the Checks Studio catalogue (issue 1373, round 4).
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-05-validation-1280x720',
    label: 'Manager — Tool parity 05 validation 1280x720',
    smokeLabels: ['manager-tool-parity-05-validation-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-validation' },
    ],
    expectView: 'tool-edit',
    // The tab had A case AND no assertion (issue 1373).
    expectSelector: '[data-tool-validation-tab]',
    // The surface's three parts, each inside the region that owns it: the summary medallion, the
    // counts rail beside it, and a real check row in the group below.
    expectContained: [
      {
        container: '[data-tool-validation-tab]',
        target: '[data-editor-validation-summary]',
      },
      {
        container: '[data-tool-validation-tab]',
        target: '[data-editor-validation-counts]',
      },
      {
        container: '[data-tool-validation-tab]',
        target: '[data-tool-validation-check]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    // THE STRIP'S PASSING BADGE. This is the frame that draws the NEUTRAL tick — the treatment
    // issue 1373 took the filled success disc down to — and its danger twin is the frame below.
    sourceMatches: [
      ...TOOL_EDITOR_SHELL_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolValidationTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-invalid-validation',
    label: 'Manager — Tool stress invalid validation',
    smokeLabels: ['manager-tool-stress-invalid-validation'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // The blocking Validation state.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-caliper"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-requirements' },
      // ADDRESSED BY THE ROW'S OWN HOOK since issue 1373's round 5: the prerequisite list is
      // `ModifierLibraryRow` now, and `data-tool-prerequisite-row` carries the entry id, so this
      // step no longer reaches through a class the list does not write.
      { selector: '[data-tool-prerequisite-row="rw-prereq-arcana"]' },
      { selector: '#tool-tab-validation' },
    ],
    expectView: 'tool-edit',
    // The blocked row itself, not the tab (issue 1373).
    expectSelector: '[data-tool-validation-tab] .manager-recipe-val-row.is-block',
    expectContained: [
      {
        container: '[data-tool-validation-tab]',
        target: '[data-editor-validation-count="blocking"]',
      },
      {
        container: '[data-tool-validation-tab]',
        target: '.manager-recipe-val-row.is-block .manager-recipe-val-pill',
      },
    ],
    kinds: ['manager', 'tools'],
    // THE STRIP'S DANGER BADGE, which is the count `manager-tool-parity-05-validation-1280x720`'s
    // neutral tick replaces. One frame each, because a change to either treatment is invisible in
    // the other.
    sourceMatches: [
      ...TOOL_EDITOR_SHELL_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolValidationTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-06-breakage-900x700',
    label: 'Manager — Tool parity 06 breakage 900x700',
    smokeLabels: ['manager-tool-parity-06-breakage-900x700'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    position: { width: 900, height: 700 },
    kinds: ['manager', 'tools', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-wrapping-680',
    label: 'Manager — Tool stress wrapping 680',
    smokeLabels: ['manager-tool-stress-wrapping-680'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    position: { width: 680, height: 700 },
    kinds: ['manager', 'tools', 'responsive'],
    // Two claims removed here, AND neither was routing (issue 1373).
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-knowledge-owned-copies',
    label: 'Manager — Knowledge owned copies',
    smokeLabels: ['manager-knowledge-owned-copies'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-empty-tab',
    label: 'Manager — Knowledge empty tab',
    smokeLabels: ['manager-knowledge-empty-tab'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Idrin carries knowledge and no copies at all, which is the only route to the Recipe-items
    // tab's dashed empty state — an empty ROSTER renders the same words for the opposite reason.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-idrin"]' },
      { selector: '[data-knowledge-tab="recipeItems"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-learned-lost-copy',
    label: 'Manager — Knowledge learned lost copy',
    smokeLabels: ['manager-knowledge-learned-lost-copy'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The same character on the other tab, and the only frame that renders a learned row.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-idrin"]' },
      { selector: '[data-knowledge-tab="learnedRecipes"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/knowledge\//,
      /^src\/ui\/SvelteCraftingSystemManagerApp\.svelte\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-knowledge-party-pool-warning',
    label: 'Manager — Knowledge party pool warning',
    smokeLabels: ['manager-knowledge-party-pool-warning'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Vosk holds the `total`-scope codex that is STILL the source of a learned entry, which is
    // the one arrangement that raises the ordering-hazard band.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-vosk"]' },
      { selector: '[data-knowledge-tab="recipeItems"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-delete-armed',
    label: 'Manager — Knowledge delete armed',
    smokeLabels: ['manager-knowledge-delete-armed'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Delete armed to its confirm face.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-tab="recipeItems"]' },
      { selector: '[data-arm-token="delete:copy-primer-partial"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  }),
  managerCase({
    id: 'manager-knowledge-narrow',
    label: 'Manager — Knowledge narrow',
    smokeLabels: ['manager-knowledge-narrow'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    position: { width: 880, height: 900 },
    kinds: ['manager', 'knowledge', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/knowledge\//,
    ],
  }),
  managerCase({
    id: 'manager-components-progressive',
    label: 'Manager — Components progressive',
    smokeLabels: ['manager-components-progressive'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit-progressive',
    label: 'Manager — Components bulk edit progressive',
    smokeLabels: ['manager-components-bulk-edit-progressive'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The fourth bulk-edit section — Progressive DC — renders only for a system whose component
    // difficulty axis is progressive, which is why this case sits on herbalism rather than on the
    // simple-mode default system the other two bulk frames use.
    steps: [
      { selector: '#manager-nav-component-rules' },
      { selector: 'label:has(input[data-component-select="hb-moonleaf"])' },
      { selector: 'label:has(input[data-component-select="hb-sunroot"])' },
    ],
    expectView: 'components',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
      BULK_EDIT_CHROME_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-component-edit-difficulty',
    label: 'Manager — Component edit difficulty',
    smokeLabels: ['manager-component-edit-difficulty'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-component-rules' },
      {
        selector: '.manager-component-row[data-component-id="sm-ruby"] [data-component-edit]',
      },
    ],
    expectView: 'component-edit',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-import-report',
    label: 'Manager — Import report',
    smokeLabels: ['manager-import-report'],
    // The uploaded payload is a real export envelope, because `validateImportData` rejects anything
    // else.
    reaches: 'exact',
    query: { dialog: 'open' },
    steps: [
      { selector: '[data-manager-import-system]' },
      {
        selector: 'input[name="importFile"]',
        upload: JSON.stringify({
          schemaVersion: 2,
          fabricateVersion: '1.1.0',
          runtimeStateIncluded: false,
          system: {
            id: 'lab-imported-forge',
            name: 'Imported Forge',
            summary: 'A system that arrived by file.',
            enabled: true,
            // Dangling `originItemUuid`s on purpose.
            components: [
              {
                id: 'imp-emberglass',
                name: 'Emberglass Shard',
                originItemUuid: 'Item.absent-emberglass',
                essences: {},
                tags: [],
              },
              {
                id: 'imp-quenching-salt',
                name: 'Quenching Salt',
                originItemUuid: 'Item.absent-quenching-salt',
                essences: {},
                tags: [],
              },
            ],
            essences: [],
            componentCategories: [],
            itemTags: [],
          },
          // No recipes.
          recipes: [],
          gatheringEnvironments: [],
          gatheringConfig: {},
        }),
      },
      { selector: '.application.dialog button[data-action="ok"]' },
    ],
    expectView: 'systems',
    // The systems browser is what sits underneath the report, so `expectView` alone cannot tell the
    // two apart.
    expectSelector: '[data-import-report-group]',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/ImportReportModal\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-import-folder-mapping',
    label: 'Manager — Import folder mapping',
    smokeLabels: ['manager-import-folder-mapping'],
    // The one case on this branch whose blocker is a missing verb rather than a fixture shape.
    reaches: 'window',
    query: {},
    steps: [{ selector: '#manager-nav-component-rules' }],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/ImportFolderMappingModal\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-alchemy-settings',
    label: 'Manager — Alchemy settings',
    smokeLabels: ['manager-alchemy-settings'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-settings' }],
    expectView: 'crafting-settings',
    kinds: ['manager', 'crafting-settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  }),
  managerCase({
    id: 'manager-experimental-off',
    label: 'Manager — Experimental off',
    smokeLabels: ['manager-experimental-off'],
    reaches: 'exact',
    query: { experimental: '0' },
    steps: [],
    expectView: 'systems',
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  }),
  playerCase({
    id: 'player-gathering-environments',
    label: 'Player app — Gathering environments',
    smokeLabels: ['player-gathering-environments'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//, PLAYER_VIEW_STATE],
  }),
  playerCase({
    id: 'fabricate-app-shell',
    label: 'Player app — App shell',
    smokeLabels: ['fabricate-app-shell'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
      // The bar this frame draws, named explicitly as of issue 1500. It used to arrive here for
      // free: it lived under `components/`, and a broad signal selects the representative pair, of
      // which this is one.
      /^src\/ui\/svelte\/apps\/ActorSelectTopBar\.svelte$/,
      PLAYER_VIEW_STATE,
    ],
  }),
  // The primitive's first player-window frame (issue 1475).
  playerCase({
    id: 'player-actor-picker',
    label: 'Player app — Actor picker',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.fabricate-app-actor-bar .actor-bar-trigger' }],
    expectSelector:
      '.fabricate-app > .fabricate-picker-popover.actor-bar-popover' +
      ':has(.manager-travel-popover-search)' +
      ' .manager-travel-option',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/ActorSelectTopBar\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-inventory',
    label: 'Player app — Inventory',
    smokeLabels: ['player-inventory'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    steps: [],
    kinds: ['player', 'inventory'],
    // `ComponentSourcesBar` named explicitly (issue 1513), the repair issue 1500 made for
    // `ActorSelectTopBar` on the same measurement.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      PLAYER_VIEW_STATE,
    ],
  }),
  playerCase({
    id: 'player-inventory-page-size',
    label: 'Player app — Inventory page size list',
    smokeLabels: [],
    reaches: 'beyond',
    // The pair to `manager-recipes-bulk-edit-check-tier` (issue 1504), and the half that proves an
    // absence: this list is drawn at `showTick={false}`, and the ticked frame beside it is the only
    // way to read that the gutter is gone rather than merely empty.
    query: { tab: 'inventory' },
    steps: [{ selector: '.inventory-grid-pagination [data-pagination-size]' }],
    // Three claims, in the shape `player-actor-picker` uses for the same mechanism: the panel is a
    // child of the application frame (a portal that failed to land would leave it in the pager row,
    // under the grid's own overflow), it is the unticked configuration, and it holds the option
    // rows.
    expectSelector:
      '.fabricate-app > .fabricate-select-popover:not(.fabricate-select-popover-ticked) ' +
      '[data-popover-option="75"]',
    // Inside the captured window rather than merely in the document: the frame photographs
    // `[data-view-lab-frame]`, which IS the `.fabricate-app` window, so a panel clamped outside
    // that box would be evidence of nothing.
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-inventory-sort-list',
    label: 'Player app — Inventory sort list',
    smokeLabels: [],
    reaches: 'beyond',
    // The ticked half of the PLAYER window's pair (issue 1511).
    query: { tab: 'inventory' },
    steps: [{ selector: '[data-inventory-sort]' }],
    // The portal, the ticked configuration and a row that is not the current value.
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="quantity"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-salvage',
    label: 'Player app — Salvage',
    smokeLabels: ['player-salvage'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The progressive salvage body with its reorderable stage list — the counterpart's own
    // condition (`[data-inventory-salvage-panel="progressive"]` +
    // `[data-progressive-stage-reorderable]`).
    steps: [
      { selector: '.inventory-filters input', fill: 'Cracked Alembic' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-herbalism:hb-cracked-alembic"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
    // The per-stage complication band (issue 1286) is asserted here rather than given its own case,
    // and the reason is mechanical: `SalvageProgressiveBody` passes `complications` on every render
    // (`resolved ?
    expectSelector:
      '[data-inventory-salvage-panel="progressive"]' +
      ':has([data-progressive-stage="hb-salv-alembic-r2"] ' +
      '[data-progressive-stage-complications][data-progressive-stage-complication-tense="forecast"] ' +
      '[data-progressive-stage-complication="hb-comp-dust-cloud"])' +
      ':not(:has([data-progressive-stage-complication="hb-comp-dust-spoiled"]))' +
      ' [data-progressive-stage="hb-salv-alembic-r1"]' +
      ':not(:has([data-progressive-stage-complications]))',
  }),
  playerCase({
    id: 'player-salvage-no-check',
    label: 'Player app — Salvage no check',
    smokeLabels: ['player-salvage-no-check'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // `[data-inventory-salvage-body="no-check"]`: Simple salvage mode with no authored roll
    // formula, so every result is recovered outright.
    steps: [
      { selector: '.inventory-filters input', fill: 'Longsword' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-longsword"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-salvage-tools',
    label: 'Player app — Salvage tools',
    smokeLabels: ['player-salvage-tools'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The pre-roll required-tool disclosure with both states in one frame: the Forge Tongs the
    // target actor holds (available) and the Anvil it does not (unavailable), which also disables
    // the pre-roll action.
    steps: [
      { selector: '.inventory-filters input', fill: 'Field Toolchest' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-toolchest"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-inventory-multi-system',
    label: 'Player app — Inventory multi system',
    smokeLabels: ['player-inventory-multi-system'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // One physical stack registered as a component in two systems must collapse to a single card
    // counted once, carrying the system-selector drop-down that re-scopes the whole detail body.
    steps: [
      { selector: '.inventory-filters input', fill: 'Air Shard' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-air-shard"] .inventory-card-button',
      },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/inventory\//, /^src\/ui\/svelte\/stores\/inventory/],
  }),
  playerCase({
    id: 'player-salvage-misconfigured',
    label: 'Player app — Salvage misconfigured',
    smokeLabels: ['player-salvage-misconfigured'],
    // Window, not exact, and the gap is specific: this frame renders the misconfigured salvage body
    // for the `routedNoFormula` reason, where the smoke's counterpart renders it for
    // `simpleMultiGroup`.
    reaches: 'window',
    query: { tab: 'inventory' },
    steps: [
      { selector: '.inventory-filters input', fill: 'Bent Clasp' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-jewelry:jw-bent-clasp"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  // Every card named below sits on page one of the 25-per-page grid, verified by rendering rather
  // than inferred: the listing sorts A→Z over the whole roster, so page-1 membership is fragile and
  // is exactly what the six existing inventory cases narrow with a search box to avoid.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed',
    label: 'Player app — Inventory bulk selection (mixed)',
    // The headline frame: one plain click, then three shift-clicks, and the panel partitions the
    // result into a queue, a best-case yield and a blocked list.
    steps: [
      // PLAIN, not shift: this is the card the first shift-click must PROMOTE. Selecting it here
      // is what makes the promotion assertion below mean something.
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    // One selector carrying two assertions, because the driver takes one and the frame has to
    // answer for both. Scoped to the app root, which is the only common ancestor of the grid and
    // the panel.
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-yield] .manager-chip.is-positive)' +
      ':has([data-inventory-bulk-yield] .manager-chip.is-accent)',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed-narrow',
    label: 'Player app — Inventory bulk selection (narrowest window)',
    // The same selection at the narrowest window the app permits.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'inventory', 'bulk', 'responsive'],
    expectLayout: responsiveLayout('.inventory-view-container', '.inventory-view-grid'),
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-queue="preview"] [data-inventory-bulk-queue-row])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-none-salvageable',
    label: 'Player app — Inventory bulk selection with nothing salvageable',
    // The empty state, and the only frame that proves the footer's asymmetry: Salvage is withheld
    // because there is nothing to salvage, while Destroy stays live because destroy is not gated on
    // salvageability at all — it deletes whole stacks including blocked rows.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-coal') },
      SHIFT_CLICK('lab-smithing:sm-copper-ore'),
      SHIFT_CLICK('lab-herbalism:hb-empty-vial'),
    ],
    // The panel state alone would be satisfied by an empty panel with a footer in any condition,
    // and the footer IS what this case is named for — so both buttons are named, in the direction
    // each must be in.
    expectSelector:
      '[data-inventory-bulk-panel="empty"]' +
      ':has([data-inventory-bulk-empty])' +
      ':has([data-inventory-bulk-salvage][disabled])' +
      ':has([data-inventory-bulk-destroy]:not([disabled]))',
  }),
  // One frame per salvage resolution mode, plus one carrying all three at once.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-simple',
    label: 'Player app — Inventory bulk salvage, simple mode',
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // Guaranteed, because simple with no authored roll formula awards its whole result set
    // outright — the certainty chip is the visible difference from the other two modes.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-smithing:sm-longsword"])' +
      ':has([data-inventory-bulk-yield] .manager-chip.is-positive)',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-routed',
    label: 'Player app — Inventory bulk salvage, routed mode',
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-runework:rw-slag'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-runework:rw-slag"])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-progressive',
    label: 'Player app — Inventory bulk salvage, progressive mode',
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    // Progressive is the one mode that honours a player's saved stage order, so this is also the
    // frame that carries the footer's reorder note.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-herbalism:hb-cracked-alembic"])' +
      ':has([data-inventory-bulk-reorder-note])' +
      ':has([data-inventory-bulk-complications] [data-inventory-bulk-complication-count])' +
      ':has([data-inventory-bulk-complication-group="lab-herbalism:hb-cracked-alembic"] ' +
      '[data-inventory-bulk-complication-position="2"] ' +
      '[data-inventory-bulk-complication="hb-comp-dust-cloud"])' +
      ':has([data-inventory-bulk-complication-position="3"] ' +
      '[data-inventory-bulk-complication="hb-comp-frostcap-shatter"])' +
      ':not(:has([data-inventory-bulk-complication-position="1"]))' +
      ':has([data-inventory-bulk-complication-order="arrangeable"])' +
      ':not(:has([data-inventory-bulk-complication-order="players"]))' +
      ':not(:has([data-inventory-bulk-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-all-modes',
    label: 'Player app — Inventory bulk salvage across all three resolution modes',
    // One of each, in one queue, across three systems — the case the other three exist to be read
    // against.
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-longsword'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-smithing:sm-longsword"])' +
      ':has([data-inventory-bulk-queue-row="lab-runework:rw-slag"])' +
      ':has([data-inventory-bulk-queue-row="lab-herbalism:hb-cracked-alembic"])',
  }),
  // The one complication state no existing frame reaches (issue 1286).
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-complications-reordered',
    label: 'Player app — Inventory bulk complications, reordered stage list',
    // The order note and the renumbering are one fact and are photographed together, because
    // neither means anything alone: the note is the sentence that makes the numbers readable ("the
    // roll walks the list in this order"), and the numbers are what the sentence is about.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
      { selector: '[data-progressive-stage-move-down]' },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-complication-group="lab-herbalism:hb-cracked-alembic"] ' +
      '[data-inventory-bulk-complication-order="players"])' +
      ':has([data-inventory-bulk-complication-position="1"] ' +
      '[data-inventory-bulk-complication="hb-comp-dust-cloud"])' +
      ':has([data-inventory-bulk-complication-position="3"] ' +
      '[data-inventory-bulk-complication="hb-comp-frostcap-shatter"])' +
      ':not(:has([data-inventory-bulk-complication-position="2"]))' +
      ':not(:has([data-inventory-bulk-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-tools-blocked',
    label: 'Player app — Inventory bulk selection blocked on missing tools',
    // `toolsUnavailable` is the one blocked reason a player can act on, and the only one whose copy
    // is data-driven — "Needs {tools}", filled from the row's own missing-tool names through a
    // locale-correct list format rather than a hand-joined comma list.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-toolchest') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-blocked-row="toolsUnavailable"])' +
      ':has([data-inventory-bulk-queue="preview"] [data-inventory-bulk-queue-row])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt',
    label: 'Player app — Inventory bulk roll prompt',
    // One prompt for the whole batch — the answer to the issue's own open question, and the state
    // acceptance 4 is about.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // Held to the prompt's own element, never to the tab.
    expectSelector: '.application.dialog .fabricate-roll-prompt__subjects',
    // It keeps the shared inventory `sourceMatches` and does not add `apps/crafting/rollPrompt.js`,
    // which builds the dialog.
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-destroy-confirm',
    label: 'Player app — Inventory bulk destroy confirmation',
    // The confirmation for the destructive half, standing unanswered.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-destroy]' },
    ],
    // Same failure mode as the roll prompt, and the same answer: hold it to the confirm's own copy.
    expectSelector: '.application.dialog:has(button[data-action="yes"]) .dialog-content p + p',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-broken-queued',
    label: 'Player app — Inventory bulk broken but salvageable',
    // Acceptance 3, and the most-argued behaviour in the whole feature: brokenness is about
    // usability and does not gate salvage, so a broken row belongs in the queue beside its
    // certainty chip and not in the blocked list.
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // One queue row carrying both pills, which is the whole claim in one selector. The three ways
    // this could go wrong each publish a plausible screen that a looser selector accepts.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ' [data-inventory-bulk-queue="preview"]' +
      ' [data-inventory-bulk-queue-row]' +
      ':has(.manager-chip.is-positive)' +
      ':has(.manager-chip.is-danger)',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-report',
    label: 'Player app — Inventory bulk report',
    // What a finished batch says it did — the state the whole panel exists to arrive at, and the
    // only one that shows a per-item outcome, a per-item rolled total, and the two aggregates
    // ("added to your pack" / "not recovered") the player actually reads.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // The panel state plus the report's own subject list.
    expectSelector:
      '[data-inventory-bulk-panel="report"] [data-inventory-bulk-subjects] [data-inventory-bulk-subject]',
  }),
  playerCase({
    id: 'player-gathering-events',
    label: 'Player app — Gathering events',
    smokeLabels: ['player-gathering-events'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The counterpart's own sequence — select an environment, open the Events tab, wait on
    // `[data-gathering-event-section]` — on the world's only environment that has an Events tab.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '[data-gathering-detail-tab="events"]' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-task-ready',
    label: 'Player app — Gathering task ready',
    smokeLabels: ['player-gathering-task-ready'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The counterpart's condition is a selected task whose attempt is not blocked
    // (`[data-gathering-attempt-blocked="false"]`).
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-ridgemoss"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-after-success',
    label: 'Player app — Gathering after success',
    smokeLabels: ['player-gathering-after-success'],
    // The gather runs end to end and the frame says so: "Nodes available: 2/3" against the ready
    // state's 3/3, from a run the manager recorded as `succeeded`. Verified live.
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '.gathering-task-row[data-task-id="sm-task-prospect"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-tool-blocked',
    label: 'Player app — Gathering tool blocked',
    smokeLabels: ['player-gathering-tool-blocked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // A selected task whose attempt is blocked, on the tool reason specifically: Cut Icecap Fronds
    // requires the herbalist's glass alembic, and the gathering actor is the smith who carries none
    // of Idrin's glassware.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-icecap"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-timed-ready',
    label: 'Player app — Gathering timed ready',
    smokeLabels: ['player-gathering-timed-ready'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // A timed task before it has been started: attempt unblocked, and the requirements panel names
    // the six hours the attempt will wait rather than resolving on the spot.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-slowbloom"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-timed-active',
    label: 'Player app — Gathering timed active',
    smokeLabels: ['player-gathering-timed-active'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The same task after its attempt has been started.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-slowbloom"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-blind',
    label: 'Player app — Gathering blind',
    smokeLabels: ['player-gathering-blind'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // `[data-gathering-blind-card]`: a blind-selection environment redacts its task list entirely
    // — one opaque attempt card instead of rows, with the mask chip on the environment card.
    steps: [{ selector: '.gathering-env-card[data-environment-id="hb-env-thicket"]' }],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-realm-locked',
    label: 'Player app — Gathering realm locked',
    smokeLabels: ['player-gathering-realm-locked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The one environment-card state selection cannot reach: a locked teaser, greyed, with the lock
    // overlay and the "not in current realm" header alert.
    steps: [{ selector: '.gathering-env-card.is-locked', scroll: true }],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-stacked',
    label: 'Player app — Gathering stacked',
    smokeLabels: ['player-gathering-stacked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'gathering', 'responsive'],
    expectLayout: responsiveLayout('.gathering-view-container', '.gathering-view-grid'),
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-crafting-simple',
    label: 'Player app — Crafting simple',
    smokeLabels: ['player-crafting-simple'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1100, height: 760 },
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  // The Crafting header withholds "Ready to craft" and leads the blocking callout with the
  // authority's own reason.
  playerCase({
    id: 'player-crafting-authority-blocked',
    label: 'Player app — Crafting blocked by the run authority',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', journalCaseState: 'authority-unavailable' },
    steps: [],
    position: { width: 1100, height: 760 },
    expectTab: 'crafting',
    expectSelector: '[data-recipe-authority-blocked]',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/apps\/crafting\/RecipeDetailHeader\.svelte$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-category-filter-list',
    label: 'Player app — Crafting category filter list',
    smokeLabels: [],
    reaches: 'beyond',
    // The full-width panel, and the only player option list with a sentinel row (issue 1511).
    query: { tab: 'crafting' },
    position: { width: 1100, height: 760 },
    steps: [{ selector: '[data-crafting-category-filter]' }],
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="__unchanged__"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-crafting-sources-picker',
    label: 'Player app — Crafting component sources picker',
    // The panel twenty-seven frames claim AND none opens (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { tab: 'crafting' },
    steps: [{ selector: '[data-crafting-sources-add]' }],
    // The portaled form, as of the phase that routed this control onto the shared picker.
    expectSelector:
      '.fabricate-picker-popover.crafting-sources-popover ' +
      '.manager-travel-popover-options .crafting-source-option',
    kinds: ['player', 'crafting'],
    // `apps/crafting/ComponentSourcesBar.svelte` named explicitly rather than left to
    // `CRAFTING_SHARED`.
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-crafting-ingredient-routed',
    label: 'Player app — Crafting ingredient routed',
    smokeLabels: ['player-crafting-ingredient-routed'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_INGREDIENTS,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-routed-by-check',
    label: 'Player app — Crafting routed by check',
    smokeLabels: ['player-crafting-routed-by-check'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_CHECK,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-run-summary',
    label: 'Player app — Crafting run summary',
    smokeLabels: ['player-crafting-run-summary'],
    // The counterpart's condition is the right column having swapped to the run summary —
    // `[data-crafting-run-summary]`, which `CraftingView` renders only once `lastRollResult`
    // carries an entry for the selected recipe.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Smelt Iron' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-iron-ingot"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-roll-result',
    label: 'Player app — Crafting roll result',
    smokeLabels: ['player-crafting-roll-result'],
    // The counterpart's condition is the RollResultBox inside the run summary, scrolled into frame:
    // `[data-crafting-run-summary] [data-recipe-section="roll-result"]`.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
      {
        selector: '[data-crafting-run-summary] [data-recipe-section="roll-result"]',
        scroll: true,
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt',
    label: 'Player app — Crafting roll prompt with modifier choice',
    smokeLabels: ['player-crafting-roll-prompt'],
    // The interactive check roll prompt, standing and unanswered, with the `playerPicks` modifier
    // fieldset issue 855 adds.
    reaches: 'exact',
    query: { tab: 'crafting', dialog: 'open' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    // The dialog is a sibling of the application window, so the app's own route is satisfied by the
    // crafting tab with nothing over it — precisely the screen a prompt that never opened would
    // publish.
    expectSelector: '.application.dialog .fabricate-roll-prompt__modifiers',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      // Narrow rather than `CRAFTING_SHARED`: `rollPrompt.js` builds this dialog end to end and
      // nothing else under that folder contributes a pixel of it, so a change elsewhere in
      // `crafting/` should not conscript a frame of a modal that would not show it.
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt\.js$/,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-essence-alternative',
    label: 'Player app — Crafting essence alternative',
    smokeLabels: ['player-crafting-essence-alternative'],
    // The counterpart's condition is an open alternatives radiogroup — `.crafting-alt-option` rows
    // under `[data-recipe-section="alternatives"]` — one of whose options is an essence, so the
    // option card draws the shared art tile in its glyph face, `[data-medallion="glyph"]`, rather
    // than an item image.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Quench in Fire' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-quenchoil"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-alternatives',
    label: 'Player app — Crafting alternatives',
    smokeLabels: ['player-crafting-alternatives'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-legacy',
    label: 'Player app — Crafting essence legacy',
    smokeLabels: ['player-crafting-essence-legacy'],
    // Window, and unreachable from fixture data. The legacy surface is the IoTable's own
    // `[data-io-group="essences"]` group, which renders only from a set-level
    // `ingredientSet.essences` map.
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-ingredient',
    label: 'Player app — Crafting essence ingredient',
    smokeLabels: ['player-crafting-essence-ingredient'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-emberbrand"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-shopping',
    label: 'Player app — Crafting essence shopping',
    smokeLabels: ['player-crafting-essence-shopping'],
    // The counterpart's condition is an essence tile inside the shopping list's acquire card:
    // `[data-shopping-acquire-components] [data-medallion="glyph"]`, reached by pressing a recipe
    // row's cart button.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Rivet Chainmail' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"]' },
      {
        selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"] .crafting-recipe-row-add',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-slot-rail',
    label: 'Player app — Crafting slot rail',
    smokeLabels: ['player-crafting-slot-rail'],
    // The counterpart's three programmatic assertions, all reproduced: the rail's slot states are
    // exactly `['choice:partial', 'essence:short', 'fixed:met']` and exactly one chooser is open.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Temper a Tidebound' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-tidebound"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-tag-unmatched',
    label: 'Player app — Crafting tag unmatched',
    smokeLabels: ['player-crafting-tag-unmatched'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The counterpart's three assertions, all reproduced: a rail whose tag tile has no item image
    // to borrow renders its own glyph and never Foundry's `item-bag.svg`; every group is fixed, so
    // it is the world's only rail with no chooser open.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Refine Silver' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-silver-ingot"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-pool',
    label: 'Player app — Crafting essence pool',
    smokeLabels: ['player-crafting-essence-pool'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-pick-for-me',
    label: 'Player app — Crafting pick for me',
    smokeLabels: ['player-crafting-pick-for-me'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // "Pick for me" restoring the resolver's suggestion after the player has trimmed it — the
    // counterpart's own sequence.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Rivet Chainmail' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"]' },
      {
        selector: '.essence-pool-carrier[data-essence-carrier="Item.sm-coal"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector: '.essence-pool-carrier[data-essence-carrier="Item.sm-ruby"] .fab-stepper-input',
        fill: '0',
      },
      { selector: '.requirement-rail-wand' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-pool-shared',
    label: 'Player app — Crafting essence pool shared',
    smokeLabels: ['player-crafting-essence-pool-shared'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The shared-pool proof: two essence requirements in one set, funded from one dual carrier.
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-iron-ore"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-iron-ingot"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-steel-ingot"] .fab-stepper-input',
        fill: '2',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-consumption-plan',
    label: 'Player app — Crafting consumption plan',
    smokeLabels: ['player-crafting-consumption-plan'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-shield"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-multistep',
    label: 'Player app — Crafting multistep',
    smokeLabels: ['player-crafting-multistep'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-pattern-blade"]' },
      // Scroll to the second step ("Fold the pattern") to show its corrected requirements,
      // which is painted with its own coal-only cost, not step 1's Steel Ingot + Coal.
      { selector: '[data-recipe-step]:nth-of-type(2)', scroll: true },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-progressive',
    label: 'Player app — Crafting progressive',
    smokeLabels: ['player-crafting-progressive'],
    // The reorderable stage list at rest — `[data-recipe-section="progressive-stages"]` with its
    // grips, ordinals, per-stage difficulty and "Reached at ≥N" thresholds, and the chevron box
    // rendered whether or not anything has moved.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
    // The crafting half of the per-stage complication band (issue 1286), asserted on the frame that
    // already draws it for the same reason `player-salvage` is: `ProgressiveBody` passes
    // `complications="forecast"` unconditionally, so all four `player-crafting-progressive*` frames
    // render the band, and a fifth case sharing this case's query and steps would publish a
    // byte-identical PNG under a second name.
    expectSelector:
      '[data-recipe-mode="progressive"]' +
      ':has([data-recipe-section="progressive-stages"] ' +
      '[data-progressive-stage-complications][data-progressive-stage-complication-tense="forecast"] ' +
      '[data-progressive-stage-complication="hb-comp-dust-cloud"])' +
      ':not(:has([data-progressive-stage-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    id: 'player-crafting-progressive-reordered',
    label: 'Player app — Crafting progressive reordered',
    smokeLabels: ['player-crafting-progressive-reordered'],
    // The same list after one downward move, which is the counterpart's own sequence and the only
    // state in which two of its invariants stop being vacuous: the live region is empty until a
    // move announces, and the authored thresholds ascend by construction until one is re-derived.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-progressive-stage-move-down]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-fixed',
    label: 'Player app — Crafting progressive fixed',
    smokeLabels: ['player-crafting-progressive-fixed'],
    // The GM-ordered variant, on its own recipe because the state is a recipe flag:
    // `allowPlayerResultReorder` defaults true, so an explicit false has to be authored to reach it
    // at all.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Set the Drying Kiln' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-kiln"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-stacked',
    label: 'Player app — Crafting progressive stacked',
    smokeLabels: ['player-crafting-progressive-stacked'],
    // The shared 960px boundary makes the smoke counterpart's stacked condition reachable at
    // production's 1024px player-window floor: the named container is roughly 938px wide there.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
    ],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'crafting', 'responsive'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-stacked',
    label: 'Player app — Crafting stacked',
    smokeLabels: ['player-crafting-stacked'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'crafting', 'responsive'],
    expectLayout: responsiveLayout('.crafting-view-container', '.crafting-view-grid'),
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-alchemy-chooser',
    label: 'Player app — Alchemy chooser',
    smokeLabels: ['player-alchemy-chooser'],
    // The discipline chooser, reached exactly as the counterpart reaches it: the world remembers a
    // chosen discipline, so the tab opens on the workbench and "Switch discipline"
    // (`[data-alchemy-switch]`) is what returns to the chooser.
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [{ selector: '[data-alchemy-switch]' }],
    kinds: ['player', 'alchemy'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  }),
  playerCase({
    id: 'player-alchemy-workbench',
    label: 'Player app — Alchemy workbench',
    smokeLabels: ['player-alchemy-workbench'],
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [],
    kinds: ['player', 'alchemy'],
    // The ALCHEMY end of the same repair `player-inventory` above carries (issue 1513): this tab
    // is the third `showSourcesBar` renders in, and it is the alchemy frame that draws the bar at
    // the app's own default geometry with no step to reach it.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/alchemy\//,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      PLAYER_VIEW_STATE,
    ],
  }),
  playerCase({
    id: 'player-alchemy-stacked',
    label: 'Player app — Alchemy stacked',
    smokeLabels: ['player-alchemy-stacked'],
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'alchemy', 'responsive'],
    expectLayout: responsiveLayout('.alchemy-view-container', '.alchemy-view-grid'),
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  }),
  playerCase({
    id: 'player-journal-stacked',
    label: 'Player app — Journal stacked',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'journal' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'journal', 'responsive'],
    expectLayout: responsiveLayout('.journal-view-container', '.journal-view-grid'),
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
  playerCase({
    id: 'player-journal-sort-list',
    label: 'Player app — Journal sort list',
    smokeLabels: [],
    reaches: 'beyond',
    // The panel that has to escape its column (issue 1511).
    query: { tab: 'journal' },
    steps: [{ selector: '[data-journal-sort="active"]' }],
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="newest"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/svelte\/stores\/journalStore/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'fabricate-journal',
    label: 'Player app — Journal',
    smokeLabels: ['fabricate-journal'],
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [],
    kinds: ['player', 'journal'],
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/, PLAYER_VIEW_STATE],
  }),
  playerCase({
    id: 'fabricate-journal-craft-detail',
    label: 'Player app — Journal craft detail',
    smokeLabels: ['fabricate-journal-craft-detail'],
    // The counterpart's condition is a history crafting run selected, so the run-detail recorded
    // stage facts (`[data-stage-fact]`) are on screen — a different article from the one
    // `fabricate-journal` shows, which is the default active run.
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [
      { selector: '[data-history-run-id="lab-run-succeeded-multi"]' },
      {
        selector:
          '[data-journal-detail][data-run-key*="lab-run-succeeded-multi"] [data-stage-card]',
        scroll: true,
      },
    ],
    expectSelector:
      '[data-journal-detail][data-run-key*="lab-run-succeeded-multi"]:has([data-history-stages]):not(:has([data-stage-nav]))',
    kinds: ['player', 'journal'],
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
  ...journalBlindRunCases(),
  ...journalLifecycleCases(),
  ...journalHistoryBatchCases(),
  ...journalHistoryDataCases(),
  // Coverage matrix — states the live smoke does not photograph.

  managerCase({
    id: 'coverage-mode-routed-ingredients-results',
    label: 'Coverage — routedByIngredients results',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
    ],
  }),
  managerCase({
    id: 'coverage-mode-routed-check-results',
    label: 'Coverage — routedByCheck results',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
    ],
  }),
  managerCase({
    id: 'coverage-mode-routed-check-checks',
    label: 'Coverage — routedByCheck outcome tiers',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    // Scrolls to its own named subject.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-outcome-row="rw-ruined"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Anchored on the strip's own `<span>` band, so a case that stopped drawing the strip
    // fails here rather than publishing a frame of the table alone.
    expectSelector: '.fabricate-manager [data-band-strip-band]',
    kinds: ['manager', 'checks', 'resolution-mode'],
    // Deliberately no pattern for `components/ThresholdBandStrip.svelte`, for the reason
    // `manager-gathering-economy-actors` records about `Stepper`: `BROAD_SIGNAL_PATTERN` matches
    // `^src/ui/svelte/components/` and `selectRenderFileCases` `continue`s on a broad-signal file
    // before consulting any case's `sourceMatches`, so such an entry would be unreachable.
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//],
  }),
  managerCase({
    id: 'coverage-mode-routed-check-five-bands',
    label: 'Coverage — routedByCheck outcome tiers, five bands',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    // The frame that shows the whole ramp (issue 1096).
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-add-outcome-tier]' },
      { selector: '[data-add-outcome-tier]' },
      { selector: ':nth-match([data-outcome-name], 4)', fill: 'Flawless' },
      { selector: ':nth-match([data-outcome-dc], 4)', fill: '10' },
      { selector: ':nth-match([data-outcome-success], 4)' },
      { selector: ':nth-match([data-outcome-name], 5)', fill: 'Slag' },
      { selector: ':nth-match([data-outcome-dc], 5)', fill: '-10' },
      { selector: '[data-outcome-band-strip-hint]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-band-strip-band]',
    kinds: ['manager', 'checks', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//],
  }),
  managerCase({
    id: 'manager-checks-crafting-dynamic-dc',
    label: 'Manager — Checks crafting dynamic DC macro',
    // BEYOND the smoke. The walk never switches the DC source, so there is no counterpart frame of
    // the dynamic branch to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // Criterion 14's subject: the dynamic-DC macro card, which is the one shipped consumer this
    // change converted from a hand-rolled `use:dragDrop` div onto the shared `ItemDropZone`.
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-dc-mode-option="dynamic"] input' },
      { selector: '[data-check-macro-dropzone]', scroll: true },
    ],
    expectView: 'checks-crafting',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      // `ItemDropZone` is deliberately not claimed here (issue 1509), and the deletion changes no
      // routing: the pattern that used to sit on this line was on the removal-only
      // `BROAD_SHADOWED_SOURCE_MATCHES` register precisely because the file was already a broad
      // signal, so `selectRenderFileCases` never read it.
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      /^src\/ui\/model\/macroReference\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-recipe-tiers',
    label: 'Manager — Checks crafting recipe tiers',
    // BEYOND the smoke. The walk never adds a recipe tier, and every simple check in the
    // fixture world authors none — so the populated list has never been photographed at all.
    reaches: 'beyond',
    smokeLabels: [],
    // The row treatment, which is what issue 1096 changed here: the recipe-tier list was the last
    // consumer of `.manager-checks-outcome-table` on The roll, drawing boxed inputs in a grid with
    // a column-header row, while the prototype draws the same list as the Outcomes screen draws its
    // tiers.
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-add-tier]' },
      { selector: '[data-add-tier]' },
      { selector: ':nth-match([data-tier-name], 1)', fill: 'Apprentice work' },
      { selector: ':nth-match([data-tier-name], 2)', fill: 'Masterwork' },
      { selector: '[data-tier-row]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The ROW, not the card: a card that kept its old table would still satisfy a selector
    // aimed at the section, and the row class is the thing this frame is evidence for.
    expectSelector: '.fabricate-manager .manager-checks-tier-list [data-tier-row]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckRecipeTiers\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-tier-step',
    label: 'Manager — Checks crafting tier-step triggers',
    // Beyond the smoke.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only fixture check carrying authored triggers, and the only crafting check
    // with named outcome tiers — which is what makes the `target` mode's tier select renderable at
    // all.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      // The list collapses (issue 1096), so the subject of this case — the tier-step row — is not
      // in the document until its trigger is opened.
      { selector: '[data-trigger-disclosure="rw-trig-step-up"]' },
      // Anchored on a named trigger's own tier-step row, never on "the row's last control": which
      // control that is depends on the mode, so a mode change would silently move the anchor.
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The route alone is not enough here: the case is named for a control that only exists
    // once the disclosure above has actually opened, and a click that no-oped would leave the
    // right screen showing the wrong state.
    expectSelector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-trigger-break-tools',
    label: 'Manager — Checks crafting trigger break-tools card',
    // Beyond the smoke, and a state no other frame reaches: breaking tools is authored on a trigger
    // only while the system's tool-breakage authority is check-driven, and every fixture system
    // rests on `toolSpecific`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      // The authority is a per-system radio pair on the tools browser, so it is CLICKED rather
      // than pinned on the fixture — the same route `manager-tool-stress-immune` takes for the
      // same reason, and the same one the smoke takes.
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      { selector: '[data-trigger-disclosure="rw-trig-step-up"]' },
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-break]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The subject itself, not the route: the authority click and the disclosure click both have
    // to have landed, and a frame of the right screen with either one missing would show the
    // state this case is named for being ABSENT.
    expectSelector: '[data-trigger="rw-trig-step-up"] [data-trigger-break]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/],
  }),
  // All four cases select an actor first, and that is not decoration.
  managerCase({
    id: 'manager-checks-crafting-simulator-rolled',
    label: 'Manager — Checks crafting outcome preview, rolled',
    // BEYOND the smoke. The walk never opens the Checks rail's simulator, so there is no
    // counterpart frame of a rolled readout to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only routed-by-check fixture with NAMED outcome tiers, which is what
    // makes the matched band card render something a GM can read.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      // No disclosure step.
      { selector: '[data-checks-simulator-roll]' },
      { selector: '[data-checks-simulator-readout]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Anchored on the readout itself: a case that stopped rolling would fail here rather
    // than publishing a frame of the pre-roll hint under a "rolled" name.
    expectSelector: '.fabricate-manager [data-checks-simulator-band]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkPreview\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOutcomePreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-enumerable',
    label: 'Manager — Checks crafting odds histogram (enumerable)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-checks-odds-state="enumerated"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The bars themselves, not the panel: a panel that abstained would still render.
    expectSelector: '.fabricate-manager [data-checks-odds-bar]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-not-enumerable',
    label: 'Manager — Checks crafting odds histogram (not enumerable)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    // The formula is typed rather than authored, for the reason
    // `manager-checks-crafting-dynamic-dc` records: the fixture check is shared, so authoring
    // `2d20` there would move every already-captured Runework frame to photograph one panel.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-check-roll-formula]', fill: '2d20 + @abilities.int.mod' },
      { selector: '[data-checks-odds-state="not-enumerable"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The REASON, not merely the note: an abstention with no stated reason is the defect
    // the discriminated codes exist to prevent.
    expectSelector: '.fabricate-manager [data-checks-odds-reason="non-unit-count"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-progressive',
    label: 'Manager — Checks crafting odds histogram (progressive award count)',
    reaches: 'beyond',
    smokeLabels: [],
    // Herbalism is the world's only progressive system, so it is the only route where a histogram
    // bucketed by award count exists at all.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-checks-odds-state="enumerated"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // A bucket that must exist, not merely a bar.
    expectSelector: '.fabricate-manager [data-checks-odds-row="award-0"]',
    kinds: ['manager', 'checks'],
    // NO entry for `src/systems/progressiveCheckSandbox.js`, deliberately: `isUiFile` admits
    // only `src/ui/`, `styles/`, `.svelte` and `.css`, so a change confined to that module
    // selects no case at all and a pattern for it here would be unreachable code — the same
    // trap the `Stepper` note two thousand lines up records for a different reason.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-simple-two-band-strip',
    label: 'Manager — Checks simple two-band DC strip',
    reaches: 'beyond',
    smokeLabels: [],
    // Smithing is the fixture's `simple` system, so its Outcomes section is the two-outcome
    // card the third `ThresholdBandStrip` binding renders in.
    query: { system: 'lab-smithing' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      ...previewAsActor('lab-actor-brenna'),
      { selector: '[data-simple-band-strip]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-simple-band-strip] [data-band-strip-handle]',
    kinds: ['manager', 'checks'],
    // The strip's simple mode, and one of the two frames `BROAD_SIGNAL_CASE_OVERRIDES` names for
    // `components/ThresholdBandStrip.svelte` (issue 1378).
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-outcomes-empty',
    label: 'Manager — Checks crafting Outcomes with zero tiers',
    // BEYOND the smoke. The walk never empties an outcome table, and every routed check in the
    // fixture world authors three tiers, so the state a routed check STARTS in was in no frame
    // at all.
    reaches: 'beyond',
    smokeLabels: [],
    // The dead end that was fixed (issue 1097 follow-up, maintainer report).
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // The mode radio group renders only on The roll section, which is where the route lands.
      { selector: '[data-crafting-alchemy-checkmode-option="tiered"] input' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-add-outcome-tier]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The fix itself, as a selector: the add control has to be a sibling of the empty sentence,
    // which is what taking it out of the list's `{#if}` made it.
    expectSelector: '.fabricate-manager [data-outcomes-empty] ~ [data-add-outcome-tier]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CraftingCheckEditor\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-alchemy-off',
    label: 'Manager — Checks crafting alchemy check switched off',
    // BEYOND the smoke. The walk never opens a switched-off crafting check, so the state has no
    // counterpart frame.
    reaches: 'beyond',
    smokeLabels: [],
    // The state the off switch exists for.
    query: { system: 'lab-tidewrack' },
    steps: ['Checks', { selector: '#manager-checks-nav-crafting' }],
    expectView: 'checks-crafting',
    // The turn-on action INSIDE the off panel, as one selector: the panel alone would pass on a
    // dead end with no way back, which is precisely the failure this state used to be.
    expectSelector:
      '.fabricate-manager [data-checks-panel="crafting"][data-checks-off] [data-checks-turn-on]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-alchemy-behaviour',
    label: 'Manager — Checks crafting alchemy behaviour card',
    // BEYOND the smoke. The walk never opens an alchemy system's On failure section, so there is
    // no counterpart frame to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // A CARD no frame reached.
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-on-failure' },
      { selector: '[data-alchemy-behaviour]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The card, which is the subject and exists in no other state — not one of its toggles.
    expectSelector: '.fabricate-manager [data-alchemy-behaviour]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/],
  }),
  // Player recipe detail, one per resolution mode.
  playerCase({
    id: 'coverage-mode-simple-detail',
    label: 'Coverage — simple recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE],
  }),
  // Known gap — no `coverage-mode-progressive-detail`.
  playerCase({
    id: 'coverage-mode-routed-ingredients-detail',
    label: 'Coverage — routedByIngredients recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    // Brenna holds the silver billet and not the gold one, so this frame shows one route satisfied
    // and one short — which is the only way a routed body's routing is visible at all.
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_ROUTED_INGREDIENTS],
  }),
  playerCase({
    id: 'coverage-mode-routed-check-detail',
    label: 'Coverage — routedByCheck recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' }],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_ROUTED_CHECK],
  }),
  // Visibility mode changes which rails EXIST, not merely what they contain — a restricted system
  // has an Access rail, a knowledge-gated one has Books & Scrolls and Knowledge, a global one has
  // neither. The smoke walks a single system, so two of the three were never photographed.
  managerCase({
    id: 'coverage-visibility-global',
    label: 'Coverage — global visibility system',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  }),
  managerCase({
    id: 'coverage-visibility-knowledge',
    label: 'Coverage — knowledge-gated system',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  }),
  managerCase({
    id: 'coverage-visibility-restricted',
    label: 'Coverage — restricted system',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-alchemy' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  }),
  // Foundry's light application theme.
  playerCase({
    id: 'coverage-theme-light-player',
    label: 'Coverage — player app in Foundry light-theme chrome, dark Fabricate surfaces',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', colorScheme: 'light' },
    steps: [],
    kinds: ['player', 'crafting', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  }),
  managerCase({
    id: 'coverage-theme-light-manager',
    label: 'Coverage — manager in Foundry light-theme chrome, dark Fabricate surfaces',
    smokeLabels: [],
    reaches: 'beyond',
    query: { colorScheme: 'light' },
    steps: [],
    expectView: 'systems',
    kinds: ['manager', 'systems', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  }),
  // Feature toggles that remove UI. `multiStepRecipes: false` (the jewellers) drops the step rail
  // and the Multi-step chip from the recipe editor; `experimental: '0'` drops the Graph rail entry.
  managerCase({
    id: 'coverage-multistep-off-recipe-editor',
    label: 'Coverage — multi-step disabled recipe editor',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/recipe\//],
  }),
  playerCase({
    id: 'coverage-experimental-off-player',
    label: 'Coverage — player app with experimental off',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', experimental: '0' },
    steps: [],
    kinds: ['player', 'crafting', 'settings'],
    sourceMatches: [CRAFTING_SHARED],
  }),
  // Issue 1198 — the player companion surface.
  playerCase({
    id: 'player-test-companion-surface',
    label: 'Player app — navigation surface from a TEST companion',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: PLAYER_EXTENSION_ROUTE, playerProvider: '1' },
    steps: [],
    // The mounted stamp, not the panel element.
    expectSelector: '[data-player-extension-mounted="downtime"]',
    expectAttributes: [
      // A provider tab's `accessibleName` REPLACES the visible label as the control's accessible
      // name, so the value is the stand-in's own composed string, verbatim and unlocalized.
      { selector: PLAYER_EXTENSION_RAIL_BUTTON, name: 'aria-label', value: 'Open Projects' },
      // The IDREF wiring the rail gained with this seam: every rail button points at the one
      // content panel, and the panel is labelled back by the active button.
      { selector: PLAYER_EXTENSION_RAIL_BUTTON, name: 'aria-controls', value: 'player-nav-panel' },
    ],
    // The seam adds a control to an existing fixed grid, so the pointer contract is photographed
    // rather than assumed.
    expectCenterHit: PLAYER_EXTENSION_RAIL_BUTTON,
    expectClick: PLAYER_EXTENSION_RAIL_BUTTON,
    expectNoHorizontalOverflow: ['.fabricate-app-content', '.fabricate-app-nav'],
    kinds: ['player', 'extension'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),
  playerCase({
    id: 'player-test-companion-surface-narrow',
    label: 'Player app — TEST companion navigation surface, narrow with long labels',
    smokeLabels: [],
    reaches: 'beyond',
    // Both gaps in one frame: the enforced minimum window size, rendered directly rather than
    // asserted about a larger frame, and the rail label's worst case against the truncation rule
    // that admits a third-party label at all.
    query: { tab: PLAYER_EXTENSION_ROUTE, playerProvider: '1', longPlayerLabels: '1' },
    steps: [],
    expectSelector: '[data-player-extension-mounted="downtime"]',
    expectAttributes: [
      {
        selector: PLAYER_EXTENSION_RAIL_BUTTON,
        name: 'aria-label',
        value: 'Open Commissions, projects and standing orders',
      },
    ],
    expectCenterHit: PLAYER_EXTENSION_RAIL_BUTTON,
    expectClick: PLAYER_EXTENSION_RAIL_BUTTON,
    // The rail is the point of this frame: `.fabricate-app-nav` is `overflow-y: auto`, so its
    // `overflow-x` computes to `auto` and an untruncated label would put a horizontal scrollbar
    // in the 84px column. The shell is included so a spill cannot hide one level up.
    expectNoHorizontalOverflow: [
      '.fabricate-app-content',
      '.fabricate-app-nav',
      '.fabricate-app-shell',
    ],
    position: { width: 1024, height: 640 },
    kinds: ['player', 'extension', 'responsive'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),
  playerCase({
    id: 'player-test-companion-fault',
    label: 'Player app — TEST companion surface fault state',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: PLAYER_EXTENSION_ROUTE, playerProvider: '1', playerProviderFault: '1' },
    steps: [],
    // The whole decision in one selector: the faulted surface's rail entry survives, the active tab
    // does not move, and Core renders its own error state in the panel.
    expectSelector: `.fabricate-app-shell:has(${PLAYER_EXTENSION_RAIL_BUTTON}[aria-selected="true"]) [data-player-extension-fault="downtime"]`,
    // Core's own diagnostic copy, rendered rather than merely present in the DOM. It names the
    // provider that failed and nothing else: no product name, no offer, no call to action.
    expectVisible:
      '[data-player-extension-fault="downtime"]:has-text("This section could not be displayed")',
    expectNoHorizontalOverflow: ['.fabricate-app-content', '.fabricate-app-nav'],
    kinds: ['player', 'extension'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),

  // Registered before the design-system adoption that re-skins them, and the ordering is not a
  // preference.
  browserCase({
    id: 'interactables-browser-tools',
    label: 'Interactable browser — Tools tab, populated',
    // `beyond`: the live smoke never opens the Interactable browser, so there is no counterpart
    // frame for this to fall short of and no label it could claim.
    reaches: 'beyond',
    smokeLabels: [],
    steps: [],
    // The populated list, not merely the window: an empty `fab-ib-list` renders the "No tools in
    // this system." branch, which is a different screen wearing the same chrome.
    expectSelector: '.fabricate-interactable-browser .fab-ib-list .fab-ib-row',
    // The narrowest window in the registry gates its own spill (issue 1520 review).
    expectNoHorizontalOverflow: ['.fabricate-interactable-browser', '.fab-ib-list'],
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/InteractableBrowserRoot\.svelte$/,
      /^src\/ui\/InteractableBrowserApp\.svelte\.js$/,
    ],
  }),
  browserCase({
    // The window's second tab, which nothing photographed (issue 1520 review).
    id: 'interactables-browser-tasks',
    label: 'Interactable browser — Gathering tasks tab, populated',
    reaches: 'beyond',
    smokeLabels: [],
    // One step, and it is the tab button's own id rather than a positional `:nth-child`.
    steps: [{ selector: '#fab-ib-tab-tasks' }],
    // SCOPED INSIDE THE PANEL, not to the list class the Tools frame also matches: the whole
    // claim of this case is that the OTHER branch rendered, and `.fab-ib-list .fab-ib-row` alone
    // is satisfied by the tab this case navigated away from.
    expectSelector: '#fab-ib-panel-tasks .fab-ib-list .fab-ib-row',
    expectNoHorizontalOverflow: ['.fabricate-interactable-browser', '.fab-ib-list'],
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/InteractableBrowserRoot\.svelte$/,
      /^src\/ui\/InteractableBrowserApp\.svelte\.js$/,
    ],
  }),
  browserCase({
    id: 'interactables-browser-filtered',
    label: 'Interactable browser — search filtered to one Tool',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      // The system is chosen rather than inherited.
      ...chooseSelectOption(
        '[data-interactable-browser-system]',
        'lab-smithing',
        '.fabricate-interactable-browser-app'
      ),
      // "Forge" matches exactly one smithing Tool — `sm-tool-tongs`, "Forge Tongs" — so the
      // filtered list is one row rather than a shorter version of the same list.
      { selector: '[data-interactable-browser-search]', fill: 'Forge' },
    ],
    expectSelector: '.fabricate-interactable-browser .fab-ib-list .fab-ib-row',
    expectNoHorizontalOverflow: ['.fabricate-interactable-browser', '.fab-ib-list'],
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/InteractableBrowserRoot\.svelte$/,
      /^src\/ui\/InteractableBrowserApp\.svelte\.js$/,
    ],
  }),
  configCase({
    id: 'interactables-config-configured',
    label: 'Interactable config — configured gathering-task interactable',
    // `window`, not `exact`.
    reaches: 'window',
    smokeLabels: [
      'interactable-config-linked',
      'interactable-config-unlinked',
      'interactable-config-source-configured',
    ],
    query: { interactable: 'configured' },
    steps: [],
    // Both halves matter.
    expectSelector:
      '.fabricate-interactable-config:not(:has([data-interactable-needs-config])) ' +
      '[data-interactable-node-section] [data-interactable-node-link][aria-pressed="true"]',
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/InteractableConfigRoot\.svelte$/,
      /^src\/ui\/InteractableConfigApp\.svelte\.js$/,
    ],
  }),
  configCase({
    id: 'interactables-config-needs-configuration',
    label: 'Interactable config — needs configuration',
    reaches: 'window',
    smokeLabels: ['interactable-config-needs-configuration'],
    // The behaviour Foundry's own Region → Behaviors → "+ Add Behavior" path produces: an empty
    // system, born valid and inert. See `tests/view-lab/world/labInteractables.js`.
    query: { interactable: 'unconfigured' },
    steps: [],
    // The banner AND the identity body it force-opens. The banner alone would pass on a panel
    // whose picker failed to render, which is the half a GM actually has to use.
    expectSelector:
      '.fabricate-interactable-config:has([data-interactable-needs-config]) ' +
      '[data-interactable-identity-body] [data-interactable-identity-type]',
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/InteractableConfigRoot\.svelte$/,
      /^src\/ui\/InteractableConfigApp\.svelte\.js$/,
    ],
  }),
  configCase({
    id: 'interactables-config-source-open',
    label: 'Interactable config — source picker open, portalled onto the window frame',
    // `beyond`: the smoke never opens one of these panels, so there is no counterpart frame for
    // this to fall short of and no label it could claim.
    reaches: 'beyond',
    smokeLabels: [],
    query: { interactable: 'configured' },
    steps: [
      // Expand the collapsed identity section, then open the crafting-system picker inside it.
      { selector: '[data-interactable-identity-toggle]' },
      { selector: '[data-interactable-identity-system]' },
    ],
    // The one frame that proves the portal resolves (issue 1520), and the `>` is the whole
    // assertion.
    expectSelector:
      '.fabricate-interactable-config-app > .fabricate-select-popover [data-popover-option]',
    kinds: ['canvas', 'interactables'],
    // The positioning seam belongs in here, and its absence was a routing gap rather than a
    // judgement (issue 1520 review round 2).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/InteractableConfigRoot\.svelte$/,
      /^src\/ui\/InteractableConfigApp\.svelte\.js$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  interactablesManagerCase({
    id: 'interactables-manager-list',
    label: 'Manage Interactables — populated scene list',
    // `window`: the smoke's list is its own two Azure Grove interactables, and this one carries a
    // third with a resolving Tile marker and a locked state, plus a fourth whose marker does not
    // resolve and which is disabled, so every badge the row can draw is photographed.
    reaches: 'window',
    smokeLabels: ['interactables-manager-list'],
    steps: [],
    // A row with its actions, so a list that renders names but loses its per-row controls fails
    // here rather than publishing as a healthy list.
    expectSelector:
      '.fabricate-interactables-manager-body ' +
      '.fab-im-list:has([data-interactable-manager-chip-marker="missing"]) .fab-im-row ' +
      '.fab-im-row-actions [data-interactable-manager-delete]',
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/interactables\//,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
    ],
  }),
  interactablesManagerCase({
    id: 'interactables-manager-promote',
    label: 'Manage Interactables — promote panel, ready to promote',
    reaches: 'window',
    smokeLabels: ['interactables-manager-promote'],
    steps: [
      { selector: '[data-interactable-manager-promote-toggle]' },
      // The one selection the panel cannot make for itself: the system and the source both
      // auto-pick through their own effects, and the region does not.
      ...chooseSelectOption(
        '[data-interactable-manager-region]',
        'deep-gate',
        '.fabricate-interactables-manager'
      ),
    ],
    // `:not([disabled])` is the whole point of the step above: it asserts `canPromote`, which is
    // region AND system AND source, so an auto-pick that silently stopped working fails here.
    expectSelector:
      '[data-interactable-manager-promote] ' +
      '[data-interactable-manager-promote-confirm]:not([disabled])',
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/interactables\//,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
    ],
  }),
  interactablesManagerCase({
    // The widest trigger in the three windows, with its panel open (issue 1520 review round 2).
    id: 'interactables-manager-region-open',
    label: 'Manage Interactables — promote region picker open under a full-width trigger',
    // `beyond`: the smoke opens the promote card but never rests on one of its panels, so there
    // is no counterpart frame for this to fall short of and no label it could claim.
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '[data-interactable-manager-promote-toggle]' },
      { selector: '[data-interactable-manager-region]' },
    ],
    expectSelector:
      '.fabricate-interactables-manager > .fabricate-select-popover ' +
      '[data-popover-option="deep-gate"]',
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/interactables\//,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  interactablesManagerCase({
    id: 'interactables-manager-empty',
    label: 'Manage Interactables — scene with no interactables',
    reaches: 'window',
    smokeLabels: ['interactables-manager-empty'],
    // A world whose scene carries no `fabricate.interactable` behaviour at all.
    query: { noInteractables: '1' },
    steps: [],
    expectSelector: '.fabricate-interactables-manager-body .fab-im-list-section .fab-im-empty',
    kinds: ['canvas', 'interactables'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/interactables\//,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
    ],
  }),
]);

/** Normalize a changed-file path to repository-relative POSIX form. */
export function normalizePath(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

/** Whether one path can change what a window looks like. */
export function isUiFile(filePath) {
  return UI_PATH_PATTERN.test(normalizePath(filePath));
}

/**
 * Whether a changed set requires screenshot evidence at all. A `lang/`-only change does not — but a
 * `lang/` change alongside a render file does, which is why this tests the whole set.
 */
export function hasUiChanges(files = []) {
  const normalized = files.map((file) => normalizePath(file));
  if (normalized.some((file) => isUiFile(file) || file === LAYOUT_ASSERTION_PATH)) {
    return true;
  }
  return false;
}

/**
 * Split a render's console errors into the ones a case declared it would produce and the ones it
 * did not.
 */
export function partitionConsoleErrors(messages = [], allowed = []) {
  const patterns = [...allowed].map((pattern) => ({
    label: String(pattern),
    matcher: pattern.global
      ? new RegExp(pattern.source, pattern.flags.replaceAll('g', ''))
      : pattern,
  }));
  const matchedPatterns = new Set();
  const unmatched = [];
  for (const message of messages) {
    const text = String(message);
    const index = patterns.findIndex(({ matcher }) => matcher.test(text));
    if (index === -1) unmatched.push(text);
    else matchedPatterns.add(index);
  }
  return {
    unmatched,
    unusedAllowances: patterns
      .filter((_, index) => !matchedPatterns.has(index))
      .map(({ label }) => label),
  };
}

export const caseIds = Object.freeze(VIEW_LAB_CASES.map((viewCase) => viewCase.id));

/**
 * @param {string} id Case id.
 * @returns {object|null} The case, or null.
 */
export function getCaseById(id) {
  return VIEW_LAB_CASES.find((viewCase) => viewCase.id === id) ?? null;
}

/**
 * Resolve a case's human-facing label. Wired into the S3 publish path so the PR body's alt text
 * comes from this registry rather than from the legacy `VIEW_RECIPES` table.
 */
export function labelForCaseId(id) {
  return getCaseById(id)?.label ?? null;
}

/**
 * The sentence a published frame carries beneath it, or the empty string for a frame that needs
 * none.
 */
export function evidenceNoteForCaseId(id) {
  const query = getCaseById(id)?.query ?? {};
  const standIn = query.downtimeProvider === '1' || query.playerProvider === '1';
  return standIn ? STAND_IN_COMPANION_NOTE : '';
}

/** What that note says, verbatim. */
export const STAND_IN_COMPANION_NOTE =
  'The companion tabs in this frame come from a stand-in registered by `tests/view-lab/mount.js` so that Core can photograph its own companion seam. They are not a shipped Fabricate surface and appear in neither the free module nor Fabricate Premium.';

export function fallbackCase() {
  return getCaseById(FALLBACK_CASE_ID);
}

// Surface coverage — what a change the registry cannot attribute captures.

/**
 * The surface a case photographs — the screen you can navigate to, as distinct from the state you
 * can drive that screen into.
 */
export function labSurfaceKey(viewCase) {
  const surface = canvasSurfaceOf(viewCase);
  const theme = viewCase.query?.colorScheme ?? DEFAULT_COLOR_SCHEME;
  return `${viewCase.app}|${surface || viewCase.id}|${theme}`;
}

/** The route-or-tab half of the surface key, per window family. */
function canvasSurfaceOf(viewCase) {
  if (viewCase.app === MANAGER) return viewCase.expectView;
  if (rendersInCanvasWindow(viewCase)) return SINGLE_SCREEN_SURFACE;
  return viewCase.query?.tab;
}

/** The surface term for a window that has exactly one screen. */
const SINGLE_SCREEN_SURFACE = 'window';

/**
 * Which of two cases is the better photograph of its surface, rather than of a state that surface
 * can be driven into. Lower sorts first.
 */
function compareSurfaceRepresentative(a, b) {
  const offDefault = (viewCase) => {
    const position = DEFAULT_POSITION[viewCase.app];
    return position &&
      viewCase.position?.width === position.width &&
      viewCase.position?.height === position.height
      ? 0
      : 1;
  };
  const dialogOpen = (viewCase) => (viewCase.query?.dialog ? 1 : 0);
  return (
    offDefault(a) - offDefault(b) ||
    dialogOpen(a) - dialogOpen(b) ||
    (a.steps?.length ?? 0) - (b.steps?.length ?? 0)
  );
}

/** One publishable case per surface, in registry order. */
function chooseSurfaceRepresentatives() {
  const order = new Map(VIEW_LAB_CASES.map((viewCase, index) => [viewCase.id, index]));
  const bySurface = new Map();
  for (const viewCase of publishableCases()) {
    const key = labSurfaceKey(viewCase);
    const held = bySurface.get(key);
    if (!held || compareSurfaceRepresentative(viewCase, held) < 0) bySurface.set(key, viewCase);
  }
  return [...bySurface.values()].sort((a, b) => order.get(a.id) - order.get(b.id));
}

/**
 * One frame of every surface the lab renders: the capture a change whose reach cannot be attributed
 * selects.
 */
export const LAB_SURFACE_CASES = Object.freeze(chooseSurfaceRepresentatives());

/** @type {readonly string[]} */
export const LAB_SURFACE_CASE_IDS = Object.freeze(LAB_SURFACE_CASES.map((viewCase) => viewCase.id));

/** The cases a set of render files selects, by the `sourceMatches` patterns each case declares. */
function selectRenderFileCases(renderFiles) {
  const selected = new Set();
  let sawBroadSignal = false;
  for (const file of renderFiles) {
    if (BROAD_SIGNAL_PATTERN.test(file)) {
      sawBroadSignal = true;
      for (const id of BROAD_SIGNAL_CASE_OVERRIDES[file] ?? []) selected.add(id);
      continue;
    }
    for (const viewCase of VIEW_LAB_CASES) {
      if (viewCase.sourceMatches.some((pattern) => pattern.test(file))) selected.add(viewCase.id);
    }
  }

  if (sawBroadSignal) for (const id of REPRESENTATIVE_CASE_IDS) selected.add(id);
  return selected;
}

// Diff-aware selection, for the lab inputs whose diff can be attributed.

/** `  managerCase({` / `  playerCase({` — an element of the array, at Prettier's two-space indent. */
const CASE_OPEN_PATTERN = /^ {2}[A-Za-z]\w*\(\{$/;
/** The line that closes such an element. */
const CASE_CLOSE_LINE = '  }),';
/** A case's own id line, four spaces in. */
const CASE_ID_PATTERN = /^ {4}id: '([^']+)',$/;
const ARRAY_OPEN_PREFIX = 'export const VIEW_LAB_CASES';
const ARRAY_CLOSE_LINE = ']);';
/** `@@ -old,count +new,count @@`, matched for its shape alone. */
const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
/** A line that cannot change a rendered frame: blank, a `//` comment, or inside a block comment. */
const INERT_LINE_PATTERN = /^\s*(\/\/|\/?\*)/;

/** Memoize a zero-argument function, including a null result. */
function memoized(compute) {
  let cell = null;
  return () => {
    cell ??= { value: compute() };
    return cell.value;
  };
}

/** One file's source, by line. */
function readSourceLines(fileUrl) {
  try {
    return readFileSync(fileURLToPath(fileUrl), 'utf8').split('\n');
  } catch {
    return [];
  }
}

const registrySourceLines = memoized(() => readSourceLines(import.meta.url));
const labActorSourceLines = memoized(() =>
  readSourceLines(new URL(`../../${LAB_ACTORS_PATH}`, import.meta.url))
);
const mountSourceLines = memoized(() =>
  readSourceLines(new URL(`../../${LAB_MOUNT_PATH}`, import.meta.url))
);

/** The `VIEW_LAB_CASES` array's body, with the file line number its first line has. */
function registryArrayBody(sourceLines) {
  const start = sourceLines.findIndex((line) => line.startsWith(ARRAY_OPEN_PREFIX));
  if (start === -1) return null;
  const end = sourceLines.indexOf(ARRAY_CLOSE_LINE, start);
  if (end === -1) return null;
  return { firstLineNumber: start + 2, lines: sourceLines.slice(start + 1, end) };
}

/** The 1-based, inclusive line span of every case literal in the array, keyed by case id. */
function parseCaseLineRegions(sourceLines) {
  const body = registryArrayBody(sourceLines);
  if (!body) return null;

  const regions = [];
  let open = null;
  for (const [offset, line] of body.lines.entries()) {
    const lineNumber = body.firstLineNumber + offset;
    if (open === null) {
      if (CASE_OPEN_PATTERN.test(line)) open = { key: null, start: lineNumber };
      continue;
    }
    open.key ??= line.match(CASE_ID_PATTERN)?.[1] ?? null;
    if (line !== CASE_CLOSE_LINE) continue;
    regions.push({ key: open.key, start: open.start, end: lineNumber });
    open = null;
  }

  if (open || regions.length === 0) return null;
  if (regions.some((region) => !caseIds.includes(region.key))) return null;
  return regions;
}

const caseLineRegions = memoized(() => parseCaseLineRegions(registrySourceLines()));

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it can render a component stack an actor holds.
 */
function rendersOwnedComponents(viewCase) {
  return viewCase.app === PLAYER;
}

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it photographs the player window rather than the Manager.
 */
function rendersInPlayerWindow(viewCase) {
  return viewCase.app === PLAYER;
}

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it photographs one of the three GM canvas windows (issue 1520).
 */
function rendersInCanvasWindow(viewCase) {
  return CANVAS_APPS.includes(viewCase.app);
}

/** The render files that read an actor's owned recipe-item copies or learned recipes. */
export const ACTOR_KNOWLEDGE_RENDER_FILES = Object.freeze([
  'src/ui/svelte/apps/manager/KnowledgeView.svelte',
  'src/ui/svelte/apps/manager/BooksScrollsView.svelte',
  'src/ui/svelte/apps/manager/ItemPageInspector.svelte',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
]);

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it can render an owned book, scroll or learned recipe.
 */
function rendersOwnedKnowledge(viewCase) {
  if (viewCase.app === PLAYER) return true;
  return viewCase.sourceMatches.some((pattern) =>
    ACTOR_KNOWLEDGE_RENDER_FILES.some((file) => pattern.test(file))
  );
}

/**
 * The four per-actor fixture tables in `labActors.js`, each with the predicate deciding which
 * frames can render what it feeds.
 */
const LAB_ACTOR_FIXTURE_TABLES = Object.freeze({
  INVENTORIES: rendersOwnedComponents,
  BROKEN_STACKS: rendersOwnedComponents,
  RECIPE_ITEM_COPIES: rendersOwnedKnowledge,
  LEARNED_RECIPES: rendersOwnedKnowledge,
});

/**
 * The line OPENING a top-level fixture table. A legitimate opener ends in `{` — `const NAME = {` or
 * `const NAME = Object.freeze({` — because the table's entries are on the lines that follow it.
 */
const TABLE_OPEN_PATTERN = /\{$/;

/** The line closing a top-level fixture table: `};`, or `});` for an `Object.freeze` wrapper. */
const TABLE_CLOSE_PATTERN = /^\}\)?;$/;

/** The 1-based, inclusive span of each fixture table in `labActors.js`. */
export function parseLabActorTableRegions(sourceLines) {
  const regions = [];
  for (const key of Object.keys(LAB_ACTOR_FIXTURE_TABLES)) {
    const start = sourceLines.findIndex((line) => line.startsWith(`const ${key} = `));
    if (start === -1) return null;
    if (!TABLE_OPEN_PATTERN.test(sourceLines[start])) return null;
    const end = sourceLines.findIndex(
      (line, index) => index > start && TABLE_CLOSE_PATTERN.test(line)
    );
    if (end === -1) return null;
    regions.push({ key, start: start + 1, end: end + 1 });
  }

  // Sorted rather than assumed to be in file order: the loop above walks `LAB_ACTOR_FIXTURE_TABLES`
  // in key order, which states which frames read each table and says nothing about where the
  // fixture happens to declare them.
  const ordered = [...regions].sort((left, right) => left.start - right.start);
  if (ordered.some((region, index) => index > 0 && region.start <= ordered[index - 1].end)) {
    return null;
  }
  return regions;
}

const labActorLineRegions = memoized(() => parseLabActorTableRegions(labActorSourceLines()));

/**
 * The regions of `tests/view-lab/mount.js` whose readership is narrower than the whole corpus, each
 * with the predicate deciding which frames read what that region produces.
 */
const MOUNT_REGIONS = Object.freeze({
  'player-extension-params': rendersInPlayerWindow,
  'lab-player-provider': rendersInPlayerWindow,
  'player-settle-stores': rendersInPlayerWindow,
  'mount-player-app': rendersInPlayerWindow,
  'canvas-mount-params': rendersInCanvasWindow,
  'mount-canvas-app': rendersInCanvasWindow,
});

/** The line opening a marked region: `// view-lab-region:<key>`, at any indent. */
const MOUNT_REGION_OPEN_PREFIX = '// view-lab-region:';

/** The line closing one: `// view-lab-region:end`. */
const MOUNT_REGION_CLOSE = `${MOUNT_REGION_OPEN_PREFIX}end`;

/** The 1-based, inclusive span of each marked region in `tests/view-lab/mount.js`. */
export function parseMountRegions(sourceLines) {
  const regions = [];
  let open = null;
  for (const [offset, line] of sourceLines.entries()) {
    const text = line.trim();
    if (!text.startsWith(MOUNT_REGION_OPEN_PREFIX)) continue;
    if (text === MOUNT_REGION_CLOSE) {
      if (!open) return null;
      regions.push({ ...open, end: offset + 1 });
      open = null;
      continue;
    }
    // A nested opener, or a key nothing in the table knows how to answer for.
    if (open) return null;
    const key = text.slice(MOUNT_REGION_OPEN_PREFIX.length);
    if (!Object.hasOwn(MOUNT_REGIONS, key)) return null;
    open = { key, start: offset + 1 };
  }

  if (open) return null;
  const keys = regions.map((region) => region.key);
  if (keys.length !== new Set(keys).size) return null;
  if (Object.keys(MOUNT_REGIONS).some((key) => !keys.includes(key))) return null;
  return regions;
}

const mountLineRegions = memoized(() => parseMountRegions(mountSourceLines()));

/**
 * @param {string} text A source line.
 * @returns {boolean} True when changing it cannot change a rendered frame.
 */
function isInertSourceLine(text) {
  return text.trim() === '' || INERT_LINE_PATTERN.test(text);
}

/**
 * @param {string} patch A unified diff.
 * @returns {string[]} Its lines, without the trailing blank a final newline produces.
 */
function patchLines(patch) {
  const lines = patch.split('\n');
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** Split a unified diff into hunks, each reduced to its body. */
function parseHunks(patch) {
  const hunks = [];
  let body = null;
  for (const raw of patchLines(patch)) {
    if (raw.startsWith('@@')) {
      if (!HUNK_HEADER_PATTERN.test(raw)) return null;
      body = [];
      hunks.push(body);
      continue;
    }
    // Anything before the first hunk header is either a `diff --git` / `index` / `---` / `+++`
    // preamble or not a diff at all.
    if (!body) return null;
    if (raw.startsWith('\\')) continue; // `\ No newline at end of file`
    // A blank context line is emitted as a bare space, but tools that strip trailing whitespace
    // turn it into an empty string; both mean "an unchanged empty line".
    const marker = raw === '' ? ' ' : raw[0];
    if (marker !== ' ' && marker !== '+' && marker !== '-') return null;
    body.push({ marker, text: raw.slice(1) });
  }
  return hunks.length > 0 ? hunks : null;
}

/** Every 0-based offset at which a sequence of lines occurs, in file order. */
function anchorOffsets(sourceLines, sequence) {
  const offsets = [];
  for (let offset = 0; offset + sequence.length <= sourceLines.length; offset += 1) {
    if (sequence.every((text, index) => sourceLines[offset + index] === text)) offsets.push(offset);
  }
  return offsets;
}

/** The regions one hunk touches, read from one candidate anchor. */
function regionsTouchedAt(hunk, offset, regions) {
  const keys = new Set();
  let unattributable = false;
  let cursor = offset + 1;
  for (const { marker, text } of hunk) {
    if (marker !== ' ' && !isInertSourceLine(text)) {
      const region = regions.find((entry) => cursor >= entry.start && cursor <= entry.end);
      if (region) keys.add(region.key);
      else unattributable = true;
    }
    if (marker !== '-') cursor += 1;
  }
  return { keys, unattributable };
}

/** The regions one hunk touches, located by content. */
function regionsTouchedByHunk(hunk, sourceLines, regions) {
  const sequence = hunk.filter(({ marker }) => marker !== '-').map(({ text }) => text);
  if (sequence.length === 0) return { keys: new Set(), unattributable: true };

  const keys = new Set();
  let unattributable = false;
  let anchored = false;
  for (const offset of anchorOffsets(sourceLines, sequence)) {
    anchored = true;
    const touched = regionsTouchedAt(hunk, offset, regions);
    // A candidate that lands outside every region — a shared factory, a section banner, the
    // selection machinery itself — can move any frame, and the true edit may be that candidate, so
    // it has to widen.
    unattributable ||= touched.unattributable;
    for (const key of touched.keys) keys.add(key);
  }
  // No candidate at all: the patch describes content this checkout does not have.
  return { keys, unattributable: unattributable || !anchored };
}

/** The regions of one file a patch is confined to. */
function touchedRegionKeys(patch, readSource, readRegions) {
  const nothingLocated = { keys: new Set(), unattributable: true };
  if (typeof patch !== 'string' || patch.trim() === '') return nothingLocated;

  const hunks = parseHunks(patch);
  if (!hunks) return nothingLocated;
  const regions = readRegions();
  if (!regions) return nothingLocated;

  const sourceLines = readSource();
  const keys = new Set();
  let unattributable = false;
  for (const hunk of hunks) {
    const touched = regionsTouchedByHunk(hunk, sourceLines, regions);
    unattributable ||= touched.unattributable;
    for (const key of touched.keys) keys.add(key);
  }
  return { keys, unattributable };
}

/**
 * Widen a located selection by surface coverage when part of the change could not be attributed.
 */
function widenedByCoverage(ids, unattributable) {
  if (!unattributable) return ids;
  for (const id of LAB_SURFACE_CASE_IDS) ids.add(id);
  return ids;
}

/**
 * Lab inputs whose blast radius is narrower than surface coverage, with the predicate — over a
 * case's own declared fields — that decides which frames can render them.
 */
const ATTRIBUTED_LAB_INPUTS = Object.freeze([
  Object.freeze({
    path: LAYOUT_ASSERTION_PATH,
    selects: (viewCase) => Boolean(viewCase.expectLayout),
  }),
  Object.freeze({
    path: 'tests/view-lab/world/labRunStates.js',
    selects: (viewCase) => viewCase.app === PLAYER,
  }),
  Object.freeze({
    path: LAB_ACTORS_PATH,
    sourceLines: labActorSourceLines,
    regions: labActorLineRegions,
    selectsRegion: (table) => LAB_ACTOR_FIXTURE_TABLES[table],
  }),
  Object.freeze({
    path: LAB_MOUNT_PATH,
    sourceLines: mountSourceLines,
    regions: mountLineRegions,
    selectsRegion: (region) => MOUNT_REGIONS[region],
  }),
  Object.freeze({
    path: LAB_INTERACTABLES_PATH,
    selects: rendersInCanvasWindow,
  }),
]);

/**
 * @param {Function} selects A predicate over one case.
 * @returns {Set<string>} The publishable case ids it accepts.
 */
function casesSelecting(selects) {
  return new Set(
    publishableCases()
      .filter((viewCase) => selects(viewCase))
      .map((viewCase) => viewCase.id)
  );
}

/** The cases a change to this file selects, given the PR's patch for it. */
function casesFromRegistryPatch(patch) {
  const { keys, unattributable } = touchedRegionKeys(patch, registrySourceLines, caseLineRegions);
  return widenedByCoverage(keys, unattributable);
}

/** The cases a REGION-attributed lab input selects: the union of what each touched region feeds. */
function casesFromRegionPatch(patch, attribution) {
  const { keys, unattributable } = touchedRegionKeys(
    patch,
    attribution.sourceLines,
    attribution.regions
  );

  const ids = new Set();
  for (const key of keys) {
    for (const id of casesSelecting(attribution.selectsRegion(key))) ids.add(id);
  }
  return widenedByCoverage(ids, unattributable);
}

/** The cases one lab input selects. */
function selectLabInputCases(file, patchByPath) {
  if (file === REGISTRY_PATH) return casesFromRegistryPatch(patchByPath.get(file));
  const attribution = ATTRIBUTED_LAB_INPUTS.find((entry) => entry.path === file);
  // The default, and the fail-safe: an input nobody has attributed — a new file under
  // `tests/view-lab/`, the fixture assembler, the Foundry shim — reaches further than this registry
  // can say, and resolves to surface coverage.
  if (!attribution) return new Set(LAB_SURFACE_CASE_IDS);
  if (attribution.regions) return casesFromRegionPatch(patchByPath.get(file), attribution);
  return casesSelecting(attribution.selects);
}

/** The union of what every lab input in a changed set selects. */
function selectAllLabInputCases(labInputs, patchByPath) {
  const selected = new Set();
  for (const file of labInputs) {
    for (const id of selectLabInputCases(file, patchByPath)) selected.add(id);
  }
  return selected;
}

/**
 * @param {object|undefined} patches Patches keyed by path, as the caller supplied them.
 * @returns {Map<string, string>} The same, keyed by normalized path.
 */
function normalizePatches(patches) {
  const byPath = new Map();
  for (const [path, patch] of Object.entries(patches ?? {})) byPath.set(normalizePath(path), patch);
  return byPath;
}

/** Map a changed-file set onto the cases that should be captured. */
export function mapChangedFilesToCases(files = [], { patches } = {}) {
  const normalized = files.map((file) => normalizePath(file)).filter(Boolean);
  const labInputs = normalized.filter((file) => LAB_INFRASTRUCTURE_PATTERN.test(file));
  // Disjoint from `labInputs` so each path is attributed exactly once: `tests/view-lab/cascade.css`
  // is both a lab input and a `.css` file, and it is the lab input rule that governs it.
  const renderFiles = normalized.filter(
    (file) => isUiFile(file) && !LAB_INFRASTRUCTURE_PATTERN.test(file)
  );

  if (labInputs.length === 0 && renderFiles.length === 0) {
    // Nothing here renders, so there is no frame to select — a lang-only change included.
    return [];
  }

  // A union at every level, never a replacement. Five levels carry it — one candidate anchor, a
  // hunk's candidates, a patch's hunks, an input's patch, and a change's inputs — and this is the
  // last of them.
  const selected = selectRenderFileCases(renderFiles);
  for (const id of selectAllLabInputCases(labInputs, normalizePatches(patches))) selected.add(id);
  if (selected.size === 0) selected.add(FALLBACK_CASE_ID);

  return VIEW_LAB_CASES.filter((viewCase) => selected.has(viewCase.id) && viewCase.publish);
}

/** Every case that publishes, for a full capture run. */
export function publishableCases() {
  return VIEW_LAB_CASES.filter((viewCase) => viewCase.publish);
}

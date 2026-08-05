/**
 * The canonical View Lab case registry.
 *
 * One entry per captured PNG. A case names a WINDOW and the state to drive it to — not a component
 * — because the evidence a UI PR needs is "here is the screen you changed", and a screen is an
 * application window with its rail, its chrome, and its neighbours in frame.
 *
 * `sourceMatches` is what turns a diff into a capture list. Patterns are directory-anchored rather
 * than file-anchored: a window case is affected by anything under the view it renders. That creates
 * a fan-out hazard — an edit to a shared component or to `styles/` would otherwise select all
 * fourteen cases — so those broad signals deliberately map to a small representative set instead.
 * See {@link mapChangedFilesToCases}.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLAYER = 'fabricate-app';
const MANAGER = 'fabricate-crafting-system-manager';

/**
 * Files that can change what a window looks like. Mirrors the rule in `AGENTS.md`: a `lang/` change
 * needs evidence only when the same PR also touches a render file, which callers enforce by testing
 * `hasUiChanges` over the whole changed set.
 */
const UI_PATH_PATTERN = /^(src\/ui\/|styles\/)|\.(svelte|css)$/;

/**
 * The harness's own inputs: the fixture world every frame renders from, the page that mounts it,
 * the Foundry shim it renders against, and this registry. None of these is a render file, so none
 * is selectable by {@link isUiFile} — but a change to any of them can move every frame at once.
 */
const LAB_INFRASTRUCTURE_PATTERN =
  /^(tests\/view-lab\/|scripts\/lib\/viewLabCases\.js$|scripts\/lib\/foundryChromeSpec\.js$|scripts\/view-lab-screenshots\.mjs$)/;

/** This registry's own path, as a diff names it. */
const REGISTRY_PATH = 'scripts/lib/viewLabCases.js';

/**
 * "Every publishable case" as a value, so an attribution can say it without building the set.
 *
 * A Symbol rather than a sentinel array or `null`, because the two answers this machinery returns
 * are a SET OF IDS and THE WHOLE CORPUS, and every caller has to tell them apart. `null` would make
 * "I could not parse this" and "this selects nothing" the same value — and those must never be the
 * same value here, since one has to widen to 157 frames and the other has to narrow to none.
 */
const EVERY_PUBLISHABLE_CASE = Symbol('every publishable case');

/**
 * Lab inputs whose blast radius is narrower than the whole corpus, with the predicate — over a
 * case's OWN declared fields — that decides which frames can render them.
 *
 * The default for a lab input is still EVERYTHING (see {@link mapChangedFilesToCases}); this table
 * is the exception list, and an entry earns its place only when the narrowing can be DERIVED. A
 * hand-maintained list of case ids would drift the moment a case is added, and would drift silently
 * — the failure being a PR that renders no evidence for the frames it moved.
 *
 * `labRunStates.js` qualifies. Its whole output lands in two places: the three per-actor run
 * containers (`flags.fabricate.fabricate.craftingRuns`, `.salvageRuns`, `flags.fabricate.gatheringRuns`
 * — see `labFlags.js` `RUN_CONTAINER_PATHS`) and the `gatheringBlindRuns` world setting that
 * `labWorld.js` writes from `buildLabBlindRunSecret`. Both are read only by the PLAYER window: the
 * Journal (`apps/journal/**` is the run browser in its entirety), the Crafting tab's
 * `RunSummaryPanel` / `CraftingStatusBadge`, and the Gathering tab's in-flight task rows. The
 * manager is the GM's system-configuration window — it renders systems, recipes, components, tools
 * and environments out of `game.settings`, and reads no actor run flag anywhere in
 * `src/ui/svelte/apps/manager/**`. So the predicate is `app === PLAYER`: a fact each case already
 * states about itself, which a new player case inherits for free and a new manager case cannot
 * accidentally claim.
 *
 * Three fixture modules were considered and DELIBERATELY left on everything:
 *
 *   - `labFlags.js` — not a fixture at all but Foundry's flag semantics, `getFlag` included. Every
 *     Fabricate read normalises through it (see that file's own header), so `getProperty` returning
 *     the wrong thing renders a pristine, unworn, un-learned, unbroken world on EVERY screen.
 *   - `labActors.js` — it also builds `buildDocumentIndex`, the uuid table `fromUuid` resolves
 *     against, and the manager resolves through it too (`BooksScrollsView`, `ItemPageInspector`,
 *     `SystemEditView`, `EnvironmentSummaryInspector`, `GatheringEventEditView`,
 *     `RecipeBooksScrollsTab`, `SimpleCraftingCheckEditor`, the knowledge studio). "Only cases that
 *     show an actor" would therefore under-select the manager frames it can blank out.
 *   - `labContent.js` — measured rather than assumed, and the suspicion holds: `buildLabContent`
 *     seeds `craftingSystems`, `recipes`, `gatheringEnvironments` and `gatheringConfig`, which is
 *     the definition set BOTH windows render, and it owns the five `lab-*` system ids that 51 cases
 *     name in `query.system`. It is the broadest input the lab has.
 */
const ATTRIBUTED_LAB_INPUTS = Object.freeze([
  Object.freeze({
    path: 'tests/view-lab/world/labRunStates.js',
    selects: (viewCase) => viewCase.app === PLAYER,
  }),
]);

/**
 * Signals too broad to attribute to one window. A shared primitive or a global stylesheet can
 * affect every screen, so selecting every case would make the evidence set useless noise. These map
 * to the representative set below plus the fallback.
 */
/**
 * The MANAGER's own shared primitives — its equivalent of `src/ui/svelte/components/`.
 *
 * An explicit list rather than a directory glob, because `apps/manager/` mixes primitives with
 * feature views: a glob would swallow `RecipesBrowserView.svelte` too and route every manager
 * change to the representative set, destroying the targeting this registry exists for.
 */
const MANAGER_PRIMITIVES = [
  'ArmedDangerButton',
  'Callout',
  'Chip',
  'EditorValidationSurface',
  'EmptyState',
  'ExplainerCard',
  'IconFactRow',
  'ItemDropZone',
  'ManagerModal',
  'RadioCardGroup',
  'RollDataExpressionInput',
  'SearchablePopover',
  'SegmentedControl',
  'ToggleCard',
];

/**
 * The shared bulk-edit chrome (issue 1010): the selection toolbar and the panel shell, section
 * and select the Component Studio and the Recipe Studio both render.
 *
 * Deliberately NOT in `MANAGER_PRIMITIVES` above, which would make them broad signals and
 * claim-exempt. A broad signal routes to the representative set, but
 * `scripts/ui-pr-screenshot-evidence.mjs` routes these same four files to the bulk-edit frames —
 * so making them broad here would have the two registries disagree about what evidence a change
 * to one of them requires. They have exactly two consumers, both of which claim them below, so
 * targeting is both possible and honest; the alternative is a shared primitive with dozens of
 * consumers, which is what `MANAGER_PRIMITIVES` is for.
 */
const BULK_EDIT_CHROME_PATTERN =
  /^src\/ui\/svelte\/apps\/manager\/Bulk(?:SelectionToolbar|EditPanelShell|EditSection|EditSelect)\.svelte$/;

/**
 * The trigger set the three `manager-recipes-bulk-edit*` frames share (issue 1010).
 *
 * The first two patterns are the recipe browser's own pair, exactly as every other recipe case
 * declares them. The third is the shared chrome above, which sits directly under `apps/manager/`
 * and therefore falls through BOTH — without it a change to the toolbar or the panel shell would
 * select the Component Studio's bulk frames and none of the Recipe Studio's.
 *
 * The fourth is the pure staging model. Like `RunJournalBuilder.js` on the blind-run cases, it
 * cannot SELECT a frame today (`mapChangedFilesToCases` filters to `isUiFile` first, and
 * `src/utils/` is not a render path); it is declared because it is what these three frames are
 * evidence ABOUT — every sentinel, every tri-state and the blocked count are computed there — and
 * because the moment that filter widens, these are the cases that must answer for it.
 *
 * Hoisted rather than repeated three times: `scripts/**` is analysed by SonarCloud's Automatic
 * Analysis, which counts repeated literals and ignores `cpd.exclusions`. It sits OUTSIDE every
 * case region on purpose — `parseCaseLineRegions` maps only the lines inside a case literal, so a
 * change here widens the capture selection instead of narrowing it to one arbitrary frame.
 */
const RECIPE_BULK_EDIT_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/Recipe/,
  /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
  BULK_EDIT_CHROME_PATTERN,
  /^src\/utils\/recipeBulkEditModel\.js$/,
];

export const BROAD_SIGNAL_PATTERN = new RegExp(
  [
    '^styles/',
    '^src/ui/svelte/components/',
    String.raw`^src/ui/theme\.js$`,
    String.raw`^src/ui/svelte/apps/manager/(${MANAGER_PRIMITIVES.join('|')})\.svelte$`,
  ].join('|')
);

/**
 * The player crafting app, split by which resolution mode's body a file belongs to.
 *
 * Every crafting case used to carry one blanket `^src/ui/svelte/apps/crafting/` pattern, so a change
 * to `detail/ProgressiveBody.svelte` selected all 27 crafting frames when only the four progressive
 * ones render it — 2.5 minutes of capture to answer a question four frames answer. Targeting that
 * over-selects is not wrong, but it is what makes a per-PR capture feel expensive enough to skip.
 *
 * The split is derived from the real import graph, not guessed. `RecipeDetail.svelte:69-72` maps
 * mode -> body component, and exactly four bodies exist; each is imported ONLY by `RecipeDetail`,
 * and three of them own one further component apiece that nothing else imports. Everything else
 * under `crafting/` — `RecipeBodyShell`, `IoTable`, `RequirementRail`, `CraftingCheckCard`,
 * `EssencePoolPanel` and the rest — is reached from more than one body and stays shared.
 *
 * `tests/view-lab-cases.test.js` derives each case's mode from the fixture recipe its steps select
 * and asserts the case carries the matching pattern, so this cannot drift by hand-editing.
 */
const CRAFTING_MODE_FILES = Object.freeze({
  simple: ['SimpleRecipeBody', 'StepRequirementsList'],
  routedByIngredients: ['IngredientRoutedBody'],
  routedByCheck: ['RoutedByCheckBody', 'OutcomeTierTable'],
  progressive: ['ProgressiveBody', 'ProgressiveStageList'],
});

/** Everything under `crafting/` that is NOT one mode's own body. Applies to every crafting case. */
const CRAFTING_SHARED = new RegExp(
  '^src/ui/svelte/apps/crafting/(?!detail/(' +
    Object.values(CRAFTING_MODE_FILES).flat().join('|') +
    String.raw`)\.svelte$)`
);

/**
 * The body files one resolution mode owns.
 *
 * @param {string} mode One of `CRAFTING_MODE_FILES`' keys.
 * @returns {RegExp} Pattern matching only that mode's body files.
 */
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

/**
 * Bulk salvage / bulk destroy (issue 859): the fields every one of its cases shares.
 *
 * Spread rather than restated, for the reason the case factories exist at all — five fields times
 * six entries is thirty lines that say nothing, and a duplication detector counts `scripts/**`.
 *
 *   - `reaches: 'beyond'` + `smokeLabels: []`. The live smoke walks no bulk selection at all, so
 *     there is no counterpart to fall short of. The two go together: `view-lab-cases.test.js`
 *     requires a `beyond` case to claim ZERO smoke labels.
 *   - `sourceMatches` is the SAME pair the six existing inventory cases carry. Deliberately no new
 *     pattern for `apps/inventory/bulk/`: `^src/ui/svelte/apps/inventory/` already covers it, so
 *     `view-lab-source-coverage` is satisfied in both directions, and a narrower pattern would only
 *     mean a change to the panel selects fewer frames of the screen it changes.
 *
 * A case that opens a dialog overrides `query` wholesale, which is why the query lives here as a
 * whole object rather than as a bare tab name.
 */
const BULK_DEFAULTS = Object.freeze({
  reaches: 'beyond',
  smokeLabels: [],
  query: { tab: 'inventory' },
  kinds: ['player', 'inventory', 'bulk'],
  sourceMatches: [
    /^src\/ui\/svelte\/apps\/inventory\//,
    /^src\/ui\/svelte\/stores\/inventoryStore/,
  ],
});

/**
 * The inventory grid card for one listing key.
 *
 * Keys are `system:component` for a component card and `essence:<system>:<id>` /
 * `recipeitem:<system>:<id>` for the two card kinds that are never salvageable.
 *
 * @param {string} key The listing key.
 * @returns {string} A selector for the card element.
 */
const CARD = (key) => `.inventory-card[data-inventory-card="${key}"]`;

/**
 * The button INSIDE that card, which is what a selection gesture actually clicks — the card element
 * itself carries no handler.
 *
 * @param {string} key The listing key.
 * @returns {string} A selector for the card's button.
 */
const CARD_BUTTON = (key) => `${CARD(key)} .inventory-card-button`;

/**
 * A shift-click step: the one gesture that both ENTERS and extends a bulk selection.
 *
 * The first shift-click also promotes the currently-inspected card, so a plain click followed by a
 * shift-click selects TWO — which is what `player-inventory-bulk-mixed` is held to.
 *
 * @param {string} key The listing key.
 * @returns {object} A step for the capture driver.
 */
const SHIFT_CLICK = (key) => ({ selector: CARD_BUTTON(key), modifiers: ['Shift'] });

/** One player screen and one manager screen: enough to show a shared-primitive change in context. */
const REPRESENTATIVE_CASE_IDS = Object.freeze(['fabricate-app-shell', 'manager-components-normal']);

export const FALLBACK_CASE_ID = 'fabricate-app-shell';

/**
 * Case factories.
 *
 * `app` and `publish` are not independent facts — they follow from which window a case targets.
 * Restating them 150 times made the registry longer without making it clearer, and made every entry
 * look alike to a duplication detector because every entry WAS alike in several of its lines.
 * `position` defaults to the geometry most of that app's cases use; a case that needs a responsive
 * size still states it, which is now the only reason a case mentions position at all.
 *
 * There was a third such field, `readySelector`. It is gone: nothing read it. The driver waits on
 * `data-view-lab-ready`, and the only other reference was a test asserting the string was non-empty
 * — a guard over a value with no consumer, which reads as coverage and is not.
 *
 * @param {object} entry Case fields.
 * @returns {object} A complete case.
 */
function managerCase(entry) {
  return {
    app: MANAGER,
    position: { width: 1280, height: 820 },
    publish: true,
    ...entry,
  };
}

/**
 * @param {object} entry Case fields.
 * @returns {object} A complete case.
 */
function playerCase(entry) {
  return {
    app: PLAYER,
    position: { width: 1280, height: 860 },
    publish: true,
    ...entry,
  };
}

/**
 * The Journal's in-flight BLIND gathering run, from both sides of the redaction (issue 901).
 *
 * TWO cases rather than one, because the change is a DIFFERENCE between viewers and no single
 * photograph holds both: the acting player must see the generic blind label where the real task
 * name used to be rendered, and the GM must see the real task behind a warning-toned "GM only"
 * chip. A case model that captured one viewer per frame would publish half the fix.
 *
 * Both drive the SAME state — the blind run card selected, so the redaction shows in the card, in
 * the detail title, and in the run's own header — and differ only in `viewer`, which is what makes
 * the pair readable side by side: everything that is not the redaction is held constant.
 *
 * `reaches: 'beyond'`. The live smoke walks no blind gathering run into the Journal, so there is no
 * counterpart to fall short of, and no smoke label to claim.
 *
 * `expectSelector` carries the assertion in both directions, so a frame that does not show what the
 * case names fails the capture instead of being published:
 *   - the GM frame must CONTAIN `[data-run-secret-preview]`;
 *   - the player frame must contain a blind run card that does NOT, which is the leak itself.
 * Without the second one, a regression that rendered the chip (and the real name) to players would
 * publish silently under a case whose whole subject is that it must not.
 *
 * @returns {object[]} The player and GM cases, in that order.
 */
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
      { selector: '[data-journal-detail][data-run-type="gathering"]', scroll: true },
    ],
    kinds: ['player', 'journal', 'gathering'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/journal\//,
      /^src\/ui\/svelte\/stores\/journalStore/,
      // The projection that decides what each viewer is told. It is not a render file, so it
      // cannot SELECT a frame today (`mapChangedFilesToCases` filters to `isUiFile` first) — it is
      // declared because it is what these two frames are evidence about, and because the moment
      // that filter widens this is the case that must answer for it.
      /^src\/systems\/RunJournalBuilder\.js$/,
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
      // The player app rendered for a GM. An ordinary state — a GM owns the same tabs — and the
      // only one in which the secret preview exists at all: the projection consults the GM-owned
      // blind-run store for no other viewer.
      query: { tab: 'journal', viewer: 'gm' },
      expectSelector: `${card} [data-run-secret-preview]`,
    }),
  ];
}

export const VIEW_LAB_CASES = Object.freeze([
  managerCase({
    id: 'manager-recipes-editor-roundtrip',
    label: 'Manager — Recipes editor roundtrip',
    smokeLabels: ['manager-recipes-editor-roundtrip'],
    // The state is what SURVIVED a round trip, so every step is load-bearing: filter to a
    // category, select a row into the shared inspector (the collapse below leaves no row to
    // click), collapse the group, open the editor from the inspector, and come back. The frame is
    // the browser afterwards — filter chip still lit, group still collapsed, zero rows rendered.
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
      /^src\/ui\/svelte\/apps\/manager\/Systems?(Browser|Overview)View\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-selected-normal',
    label: 'Manager — Selected normal',
    smokeLabels: ['manager-selected-normal'],
    // Reached the way the smoke reaches it: by CLICKING the system row's identity, which is what
    // `selectSmokeSystemInManager` does. A seeded `lastManagedCraftingSystem` lands on the same
    // scope, but a case that seeds it is evidence that the setting works, not that the row does.
    //
    // The resulting frame is the same screen as `manager-default-selection`, and that is faithful
    // rather than a duplicate to be explained away: the smoke's own two counterparts
    // (screenshot-13 / screenshot-14) are the same screen too, because it captures the default
    // selection AFTER selecting and then re-clicks an already-selected row.
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
    // The smoke's counterpart is the EXPANDED baseline it establishes before collapsing: it enters
    // the system scope, collapses the rail if it is not already expanded, and photographs that.
    // Here the rail starts expanded, so the equivalent of "prove it is expanded because the toggle
    // put it there" is a round trip through the toggle — collapse, expand — which also means this
    // case fails loudly if the toggle stops restoring the rail, instead of quietly capturing a rail
    // that merely never moved.
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
    // Clicks the row, exactly as its normal-width twin does. It had no steps at all, so it captured
    // the DEFAULT selection at the stacked breakpoint — the thing that case's own comment rejects
    // as "evidence that the setting works, not that the row does".
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
      /^src\/ui\/svelte\/apps\/manager\/(ResolutionModeCard|CraftingEffectPanel|ItemPageInspector)\.svelte$/,
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
    label: 'Manager — System edit lists',
    smokeLabels: ['manager-system-edit-lists'],
    // The three settings-list cards together — Character modifiers, Character prerequisites and
    // Currency Units — with one modifier open and its IconPicker down, and the Currency Units
    // section collapsed to show whole-section collapse. That needs ONE system carrying all three,
    // and herbalism is the only one that can: the modifiers card is gated on `gathering`, which
    // Runework (the currency system) does not have.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '[data-section-collapse="currency"]' },
      { selector: '[data-system-character-modifier] [data-toggle-character-modifier]' },
      { selector: '[data-system-character-modifier] .essence-icon-picker-trigger' },
      { selector: '[data-system-character-modifiers]', scroll: true },
    ],
    expectView: 'system-edit',
    position: { width: 1280, height: 980 },
    kinds: ['manager', 'system-edit'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  }),
  managerCase({
    id: 'currency-actor-property',
    label: 'Manager — Currency actor property',
    smokeLabels: ['currency-actor-property'],
    reaches: 'exact',
    // The Currency Units card renders only for a system with `requirements.currency.enabled`, and
    // the lab authors that on Runework alone — see the fixture note there for why not the default
    // system. `scroll` is load-bearing and not a convenience: the card sits below the settings
    // panel's own fold, and `frame.screenshot()` on the outer `.application` does not scroll
    // nested overflow containers, so without it every assertion passes and the card is simply
    // absent from the PNG.
    query: { system: 'lab-runework' },
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '[data-system-currency-units]', scroll: true },
    ],
    expectView: 'system-edit',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'system-edit'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  }),
  managerCase({
    id: 'currency-macro',
    label: 'Manager — Currency macro',
    smokeLabels: ['currency-macro'],
    reaches: 'exact',
    query: { system: 'lab-runework' },
    // The macro branch is a `<select>` value, so `select` is the only verb that reaches it.
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '[data-system-currency-strategy-select]', select: 'macro' },
      { selector: '[data-system-currency-units]', scroll: true },
    ],
    expectView: 'system-edit',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'system-edit'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  }),
  managerCase({
    id: 'currency-actor-inventory',
    label: 'Manager — Currency actor inventory',
    smokeLabels: ['currency-actor-inventory'],
    reaches: 'exact',
    query: { system: 'lab-runework' },
    // dnd5e registers no inventory currency provider, so this strategy resolves to the
    // no-provider callout steering the GM to macro mode — which is the state the smoke's
    // counterpart photographs too, for the same reason.
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '[data-system-currency-strategy-select]', select: 'actorInventory' },
      { selector: '[data-system-currency-units]', scroll: true },
    ],
    expectView: 'system-edit',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'system-edit'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
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
    // Every lab system authors one, so the case CLEARS it, which is the GM action that produces
    // this state and is the same fact the smoke reaches by switching to a system authored without
    // one. Driven rather than fixtured because a permanently check-less system would strip the DC
    // pill from the flagship recipe library every other recipe frame photographs.
    reaches: 'exact',
    query: {},
    steps: [
      'Checks',
      { selector: '#checks-tab-crafting' },
      { selector: '[data-check-roll-formula]', fill: '' },
      // The Checks view is a STAGED editor: typing only marks the draft dirty, and the browser's
      // check pills read the PERSISTED system. Without this the case cleared the field, navigated
      // away, and photographed twelve DC pills while claiming to show the no-check warning.
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
    // Page TWO of a grouped list: with "Group by category" on, ordering is category-major BEFORE
    // pagination, so a category larger than the page continues across the boundary instead of
    // being re-sliced alphabetically per page. The smoke seeds 14 rows into one category to force
    // that; here the page is shrunk to 10 instead, which produces the same boundary against the
    // library the other recipe frames photograph rather than a throwaway category that has to be
    // seeded and torn down.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-main [data-pagination-size]', select: '10' },
      { selector: '.manager-main [data-pagination-next]' },
    ],
    expectView: 'recipes',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  // ── The Recipe Studio's bulk edit panel (issue 1010) ───────────────────────────────────────────
  //
  // THREE frames, because the panel's five axes cannot be photographed in one. A staged axis and
  // its `Unchanged` face are mutually exclusive states of the same control, and the blocked-enable
  // Callout only exists while Enable is staged over a selection that contains a refused recipe —
  // so the pristine face and the warning face are each the sole evidence of what they show.
  //
  // Every row click is pinned BY ID rather than by position. `data-recipe-select` sits on a
  // visually hidden input, so the click target is the wrapping `<label>` (the Component Studio's
  // cases below do the same). Position would not do: the blocked frame needs one SPECIFIC row —
  // the only one in the world that is both off and un-enableable — and an ordering change would
  // silently stage Enable over two ordinary recipes and publish a frame with no Callout at all.
  managerCase({
    id: 'manager-recipes-bulk-edit',
    label: 'Manager — Recipes bulk edit',
    smokeLabels: ['manager-recipes-bulk-edit'],
    // The STAGED face, over two ordinary Weaponsmithing recipes. Every axis the panel owns is
    // armed at once: a category, Status at `Enable`, Lock at `Lock`, a named check tier, and the
    // book axis's STAGED LIST holding one book at `add` beside another at `remove` — which is why
    // the lab world authors two smithing books rather than one.
    //
    // The book axis is a search-and-pick control (issue 1010), so each staged book costs three
    // steps: open the picker, choose the book, press the action. The pick then CLEARS, which is
    // what returns the trigger and lets the second book be staged at all — the frame is therefore
    // also the evidence that staging accumulates rather than replacing.
    //
    // The two actions are not interchangeable. `Add` is dead for a book that already holds every
    // selected recipe and `Remove` is dead for one that holds none, so the Folio (which holds
    // neither selected recipe) can only be added and the Almanac (which holds the greatsword,
    // through the legacy scalar — see `labContent.js`) can only be removed.
    //
    // Enable is staged over two recipes that are already ON, so `countBlockedRecipeEnables` is 0
    // and the warning Callout stays absent. That is deliberate: the Callout is the blocked frame's
    // subject, and a staged frame carrying it would make the two photographs the same picture.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
      { selector: '[data-recipe-bulk-category]', select: 'Armoursmithing' },
      { selector: '[data-recipe-bulk-status-option="enable"]' },
      { selector: '[data-recipe-bulk-lock-option="lock"]' },
      // Karrun Forgecraft is the only lab system that authors check tiers, so this select is the
      // only populated one in the world; every other system renders the info Callout instead.
      { selector: '[data-recipe-bulk-check-tier]', select: 'sm-tier-masterwork' },
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-book"]' },
      { selector: '[data-recipe-bulk-book-add]' },
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-almanac"]' },
      { selector: '[data-recipe-bulk-book-remove]' },
    ],
    expectView: 'recipes',
    // Both staged states must be on screen at once, or a control that shows one book at a time
    // reads as a control that stages one book at a time. A frame showing only `add` is the
    // failure this assertion exists to refuse, and the staged list is what makes it satisfiable:
    // the pick card can only ever hold the book it is composing.
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
    // The PRISTINE face: a selection and nothing staged. It is the only evidence of the three
    // `Unchanged` segments, of BOTH check-tier sentinels — `— Leave unchanged —` and `Default DC`,
    // which look alike and mean opposite things — and of the genuinely disabled Apply. None of
    // those can appear in the staged frame, because staging is what replaces them.
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
    // The BLOCKED face, and the frame acceptance criterion 6 is settled by: the panel's warning
    // Callout counting the same rows the browser has pilled, in one photograph, so the two cannot
    // be shown to disagree.
    //
    // `sm-r-runeplate-draft` is the world's only off-and-un-enableable recipe and is what makes
    // the count non-zero; `sm-r-longsword` is an ordinary enabled row, so the Callout reads "at
    // least 1 of 2" rather than a degenerate 1-of-1 and the LOWER-BOUND wording is legible.
    reaches: 'exact',
    query: {},
    // ORDER IS LOAD-BEARING, and `expectSelector` cannot enforce it: a click auto-scrolls its
    // target into view, so whichever row is ticked LAST is the one the frame is scrolled to.
    // Ticking the blocked row first scrolled it off the top and published a Callout with none
    // of the rows it counts — DOM-present, so the guard passed, and visually a lie.
    // `sm-r-longsword` therefore goes first and the blocked row last.
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-runeplate-draft"])' },
      { selector: '[data-recipe-bulk-status-option="enable"]' },
    ],
    expectView: 'recipes',
    // BOTH halves of the claim, in one selector, because either alone would publish a lie: a
    // Callout with no pilled row says the panel invented a count, and a pilled row with no Callout
    // is the plain browser frame under a case named for the warning. `expectView` cannot see
    // either — the route is `recipes` whether the panel staged anything or not.
    //
    // Written as manager-with-Callout DESCENDANT row-with-pill rather than as two `:has()`
    // clauses on the root, so every `:has()` argument is a simple selector. Both forms are
    // correct CSS and Chromium (which is what `document.querySelector` runs here) evaluates
    // either; this one is additionally checkable outside a browser, and `:has(A B)` is where
    // the DOM implementations disagree.
    expectSelector:
      '.fabricate-manager:has([data-recipe-bulk-blocked-warning]) ' +
      '.manager-recipe-row[data-recipe-id="sm-r-runeplate-draft"]:has([data-status-pill="danger"])',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  // ── The two surfaces the three frames above cannot hold (issue 1010) ───────────────────────────
  //
  // The staged case opens the picker, picks, presses the action and repeats; the pick CLEARS on
  // staging by design, so that frame lands on the trigger plus the staged list. The unstaged case
  // shows the trigger alone. Between them, the two surfaces this redesign actually INTRODUCES were
  // photographed nowhere: the open option list, whose two-line rows state the membership fact the
  // GM chooses on, and the pick card, whose Add/Remove counts and opposite disabled states are the
  // whole argument for replacing the chip run. A redesign commissioned because a chip per book is
  // unusable at eight-plus books cannot be reviewed from frames showing neither replacement.
  //
  // `reaches: 'beyond'` with no smoke labels, which is the honest declaration and not a way around
  // adding one: the smoke's own bulk-edit walk drives THROUGH both of these states to the staged
  // one and never rests on either, so neither has a counterpart to fall short of. They still
  // PUBLISH — `beyond` is a statement about the smoke, not about whether a frame is evidence, and
  // the issue-901 Journal pair sets the same precedent — which is what makes them the PR's evidence
  // for the part of this change nothing else photographs. No new smoke label means no new
  // `SCREENSHOT_CAPTURE_ORDER` entry either.
  //
  // Both stop one step short of an existing case's walk rather than driving anywhere new, so the
  // fixture facts they rest on are the ones the staged case already documents.
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
    // exists at all, it is portaled INTO the manager (the whole reason it escapes the inspector's
    // `overflow: hidden`), and its rows carry the second META line — which is the fact the GM
    // chooses on and which only renders when the option was given one. Asserting the popover alone
    // would pass over a run of bare single-line rows, which is the state this frame exists to
    // distinguish itself from.
    expectSelector:
      '.fabricate-manager .manager-travel-popover ' +
      '[data-popover-option="sm-book"] .manager-travel-option-meta',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
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
    // The card for the Folio, which holds NEITHER selected recipe — so `Add 2` is live and `Remove`
    // is dead with its count dropped rather than rendered as `Remove 0`. Both states are asserted,
    // in opposite directions, because they ARE the design argument: two real buttons whose labels
    // name what each would actually write and which go inert when that number is zero. A card-only
    // assertion would pass over two enabled buttons labelled with the selection size, which is the
    // prototype defect this control was corrected away from.
    //
    // Every `:has()` argument is a simple compound, for the reason the blocked case records: `:has(A
    // B)` is where DOM implementations disagree, and this form is checkable outside a browser.
    expectSelector:
      '.fabricate-manager [data-recipe-bulk-book-pick="sm-book"]' +
      ':has([data-recipe-bulk-book-add]:not([disabled]))' +
      ':has([data-recipe-bulk-book-remove][disabled])',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  managerCase({
    id: 'manager-crafting-group-expanded',
    label: 'Manager — Crafting group expanded',
    smokeLabels: ['manager-crafting-group-expanded'],
    // The rail's Crafting GROUP expanded to all four subitems — Recipes, Books & Scrolls,
    // Knowledge, Settings — over a multi-category recipe library. Books & Scrolls and Knowledge
    // exist only for a knowledge-gated system (`buildCraftingNavItems`), so the default globally
    // visible system advertises two of the four and cannot show this rail at all.
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
    ],
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
    id: 'manager-recipe-item-validation',
    label: 'Manager — Recipe item validation',
    smokeLabels: ['manager-recipe-item-validation'],
    // The recipe-item editor's Validation tab in its ALL-CLEAR state. `hb-book` is the world's
    // only definition that passes every check for a knowledge-gated system: it links a world item
    // (`registeredItemUuid`), links three recipes, and caps learning at a positive number.
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
    // The same tab in its BLOCKING state, which is a different summary card, a different count
    // split and a Block pill on the offending row. `hb-primer` links a world item but no recipes,
    // so `recipeLinked` fails — the one blocking check the fixture can hold without also breaking
    // the owned-copy frames that read the same definition on the Knowledge surface.
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
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inherit',
    label: 'Manager — Recipe edit crafting modifier inherit',
    // BEYOND the smoke. Its Overview-tab frame (`manager-recipe-edit-normal`) opens Brew Healing
    // Potion, which authors an override — so the smoke photographs this control OVERRIDDEN and has
    // no counterpart for the inherit state. Claiming `exact` against it would be the overclaim the
    // tuple test explicitly cannot catch: same screen, different state.
    reaches: 'beyond',
    smokeLabels: [],
    // The per-recipe check-modifier override AT REST. `RecipeOverviewTab` gates the whole control
    // on `craftingModifierOptions.length > 0`, so it exists on exactly one lab system — herbalism,
    // the only one carrying a catalogue — and every other recipe-editor frame in this registry runs
    // on smithing or jewelry. The one herbalism recipe-editor case that did exist opens the Books &
    // Scrolls tab, so before this entry NO frame showed the Overview modifier row at all.
    //
    // `hb-r-kiln` authors no `craftingModifier`, so the select sits on its blank option and reads
    // "Inherit system default (Highest)" — the label composed from the SYSTEM policy, which is
    // the half of the control a per-recipe frame cannot otherwise show, and the half that would
    // have silently read "(Add all)" had the label map not gained a `playerPicks` entry.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-player-picks',
    label: 'Manager — Recipe edit crafting modifier Player picks',
    // Pairs the smoke's own Overview frame: `manager-recipe-edit-normal` opens Brew Healing Potion,
    // whose seed this branch moved to a `playerPicks` override so the smoke's roll prompt would
    // carry the fieldset too. Both frames therefore land on the same condition — the per-recipe
    // control in its Phase-2 override state — which is what makes a side-by-side meaningful.
    reaches: 'exact',
    smokeLabels: ['manager-recipe-edit-normal'],
    // `hb-r-stillroom` authors `{ policy: 'playerPicks', modifierIds: [...three] }`, which is what
    // makes `hasModifierOverride` true — so this frame carries BOTH halves of the control at once:
    // the select on its new fourth option, and the eligible-modifier pill row that only an
    // overriding recipe draws.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
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
    // Pinned by row id rather than left on "whichever row is first". Recipes now carry the
    // category the fixture always meant them to (`Recipe` reads the SINGULAR `category`), so the
    // library groups category-major and the first row is no longer the alphabetically first
    // recipe. Naming the recipe keeps this frame showing the same editor it has always shown.
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
    // The essence + currency-cost requirement rows, which sit BELOW the fold of the plain
    // ingredients frame — the smoke splits them into their own capture for exactly that reason and
    // scrolls the currency row (the last requirement) into view so both rows and their end-of-row
    // Steppers are on screen. The currency row needs the system's currency feature ON with units
    // authored (`canAddCost`), so this runs on herbalism, the only currency-enabled system the
    // player never sees.
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
    id: 'manager-recipe-edit-validation',
    label: 'Manager — Recipe edit validation',
    smokeLabels: ['manager-recipe-edit-validation'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-validation' },
    ],
    expectView: 'recipe-edit',
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
    // The Overview tab's editable STEPS accordion, with a per-step duration control on each header.
    // Only a recipe carrying authored `steps[]` renders it, and `sm-r-pattern-blade` is the world's
    // only one — the first-row default opens a single-step recipe and photographs an Overview with
    // no steps card at all.
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
    // The Results tab's PER-STEP result sections — the frame that proves a multi-step recipe's
    // Results renders something rather than an empty tab (the structural bug that shipped unseen
    // for want of exactly this coverage). Needs the same authored-steps recipe as the Overview
    // frame above; every other recipe here draws the single-set Results shape already captured by
    // `manager-recipe-edit-results`.
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
    // point of this frame: the confirmation itself is the state, not what follows it. Reachable
    // only since the dialog was transcribed from the harvested `client/applications/api/dialog.mjs`
    // — before that, `confirmDialog` returned false unconditionally and the toggle silently no-oped.
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
    // Matches the screen it RENDERS. These named `RecipeEditView.svelte` and `manager/recipe/`,
    // neither of which appears in this frame — so a change to the settings tab did not select the
    // only case showing its confirmation, and a change to the recipe editor selected a frame of
    // the system-edit screen.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-collapsed',
    label: 'Manager — Recipe edit collapsed',
    smokeLabels: ['manager-recipe-edit-collapsed'],
    // The COLLAPSED editor: `RecipeEditView` draws a read-only steps card plus its explanatory
    // note, instead of the editable accordion, whenever `!multiStepEnabled && steps.length > 1`.
    // The smoke reaches it by toggling the feature off through a confirm dialog; the lab reaches
    // the same end state from persisted data, because Sablewright Jewellers declares
    // `multiStepRecipes: false` and `jw-r-circlet` carries two authored steps.
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
    // Alchemy Results: the two-slot shape — an authored success set plus a RESERVED, undeletable
    // "On a failed check" set the editor draws itself. Also a system-mode fact, so only the
    // alchemy system can show it.
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
    ],
  }),
  managerCase({
    id: 'manager-components-normal',
    label: 'Manager — Components normal',
    smokeLabels: ['manager-components-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Components'],
    expectView: 'components',
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  }),
  managerCase({
    id: 'manager-components-bulk-edit',
    label: 'Manager — Components bulk edit',
    smokeLabels: ['manager-components-bulk-edit'],
    reaches: 'exact',
    query: {},
    // The STAGED face. `data-component-select` sits on a visually hidden input, so the click
    // target is its wrapping `<label>`; two rows, because a one-row selection reads as an
    // accident. Then the three axes the smoke stages: a category, the tag tri-state at BOTH its
    // non-default faces (one click = add, two = remove), and one essence increment, which is what
    // arms the destructive-overwrite warning.
    steps: [
      'Components',
      { selector: 'label:has(input[data-component-select="sm-iron-ore"])' },
      { selector: 'label:has(input[data-component-select="sm-copper-ore"])' },
      { selector: '[data-component-bulk-category]', select: 'Refined' },
      { selector: '[data-bulk-tag="ore"]' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-bulk-tag="ingot"]' },
      { selector: '[data-component-bulk-essences] [data-stepper-increment]' },
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
    id: 'manager-components-bulk-edit-unstaged',
    label: 'Manager — Components bulk edit unstaged',
    smokeLabels: ['manager-components-bulk-edit-unstaged'],
    reaches: 'exact',
    query: {},
    // The pristine face of the same panel: a selection and nothing staged, which is the only
    // evidence of the "leave unchanged" chips and the inert Apply.
    steps: [
      'Components',
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
      'Components',
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
      'Components',
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
      'Components',
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
    steps: ['Components', { selector: '.manager-icon-button[aria-label^="Edit"]' }],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage',
    label: 'Manager — Component edit salvage',
    smokeLabels: ['manager-component-edit-salvage'],
    // The ROUTED salvage authoring body: per-component result groups plus a POPULATED
    // outcome-routing table (`[data-salvage-routing]`) and the DC override. Three things have to
    // be true at once — routed salvage mode, an authored routed salvage check with tiers, and
    // more than one result group — and Runework is the only system where they all are. The
    // Simple-mode smithing component this case used to open cannot draw the routing table at all;
    // its own body is `manager-component-edit-salvage-simple`.
    reaches: 'exact',
    query: { system: 'lab-runework' },
    steps: [
      'Components',
      {
        selector:
          '.manager-component-row[data-component-id="rw-slag"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '[data-salvage-routing]', scroll: true },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-component-edit-salvage-off',
    label: 'Manager — Component edit salvage off',
    smokeLabels: ['manager-component-edit-salvage-off'],
    reaches: 'exact',
    query: {},
    steps: [
      'Components',
      {
        selector:
          '.manager-component-row[data-component-id="sm-chainmail"] .manager-icon-button[aria-label^="Edit"]',
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
      'Components',
      {
        selector:
          '.manager-component-row[data-component-id="sm-longsword"] .manager-icon-button[aria-label^="Edit"]',
      },
    ],
    expectView: 'component-edit',
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-gathering',
    label: 'Manager — Checks gathering',
    smokeLabels: ['manager-checks-gathering'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#checks-tab-gathering' }],
    expectView: 'checks',
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
    steps: ['Checks', { selector: '#checks-tab-validation' }],
    expectView: 'checks',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-consumption',
    label: 'Manager — Checks crafting consumption',
    smokeLabels: ['manager-checks-crafting-consumption'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#checks-tab-crafting' }],
    expectView: 'checks',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers',
    label: 'Manager — Checks crafting modifiers',
    smokeLabels: ['manager-checks-crafting-modifiers'],
    // The check-modifier CATALOGUE card, which sits last in the crafting panel and is therefore
    // below the fold of `manager-checks-crafting-consumption`'s frame — hence a dedicated capture
    // that scrolls to it. Populated on herbalism alone: a non-empty catalogue also un-hides the
    // recipe editor's per-recipe modifier override, which would have added a control to every
    // already-captured smithing recipe Overview frame.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#checks-tab-crafting' },
      // The card is taller than the window, so `scrollIntoViewIfNeeded` on the card itself lands
      // the frame above the default-modifier pill select. Anchoring on the LAST thing the card
      // draws is what puts the whole policy block — radios and pills — inside the frame.
      { selector: '[data-crafting-modifier-defaults]', scroll: true },
    ],
    expectView: 'checks',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-modifiers-player-picks',
    label: 'Manager — Checks crafting modifiers, Player picks selected',
    // BEYOND the smoke. Its catalogue is authored `highest` and its walk never presses a policy
    // radio, so there is no counterpart frame of a SELECTED fourth option to fall short of — only
    // of the card at rest, which the sibling case above already pairs with.
    reaches: 'beyond',
    smokeLabels: [],
    // The selection is made by CLICKING, not by authoring. `selectPolicy` emits
    // `{ defaultModifierPolicy }` through `onChange` -> `adminStore` -> `game.settings.set`, and the
    // lab's settings Map persists it for the life of the page, so the card re-renders with
    // `is-active` on the new option — which is the state this frame is named for. Authoring it into
    // the fixture instead would have rewritten the at-rest frame that is the other half of the
    // evidence, leaving two names for one picture.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#checks-tab-crafting' },
      { selector: '[data-crafting-modifier-policy-option="playerPicks"] input' },
      { selector: '[data-crafting-modifier-defaults]', scroll: true },
    ],
    expectView: 'checks',
    kinds: ['manager', 'checks'],
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
    steps: ['Components'],
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
    // The component library's half of the grouped-continuation pair: page two of a
    // category-major list, where a category larger than the page continues across the boundary.
    // Same mechanism as the recipe frame — shrink the page rather than seed and tear down a
    // throwaway category — over the 23-component smithing library the other component frames use.
    reaches: 'exact',
    query: {},
    steps: [
      'Components',
      { selector: '.manager-main [data-pagination-size]', select: '10' },
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
    steps: ['Tags & Categories', { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager — Tags categories tags tab',
    smokeLabels: ['manager-tags-categories-tags-tab'],
    reaches: 'exact',
    query: {},
    steps: ['Tags & Categories', { selector: '#vocabulary-tab-tag' }],
    expectView: 'tags',
    kinds: ['manager', 'tags'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategories/],
  }),
  managerCase({
    id: 'manager-tags-categories-stacked',
    label: 'Manager — Tags categories stacked',
    smokeLabels: ['manager-tags-categories-stacked'],
    reaches: 'exact',
    query: {},
    steps: ['Tags & Categories', { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'tags', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategories/],
  }),
  // ── The GM Essence Studio (issue 1036) ────────────────────────────────────────────────────────
  //
  // Every case below carries the SAME `sourceMatches`, and it is wider than the shipped one in two
  // ways that both mattered: the shipped `/apps\/manager\/Essence/` is case-SENSITIVE, so it
  // matched neither the new lowercase `essences/` directory nor the pure models under `src/utils/`,
  // and a redesign confined to those would have published no essence frame at all.
  //
  // The lab fixture is what makes these frames worth capturing: smithing is the one system that
  // declares BOTH `features.effectTransfer` and `features.propertyMacros`, four of the five
  // essences carry a distinct colour with `air` deliberately unset, and `aether` is DISABLED while
  // two components carry it and one recipe requires it — the feature's headline state, which no
  // existing fixture could reach.
  managerCase({
    id: 'manager-essences-normal',
    label: 'Manager — Essences normal',
    smokeLabels: ['manager-essences-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-stacked',
    label: 'Manager — Essences stacked',
    smokeLabels: ['manager-essences-stacked'],
    // REPOINTED, not duplicated (issue 1036). The row left the narrow `@container` join that used
    // to re-template it into one column — `align-items: stretch` there is a live flex property and
    // would stretch the medallion and the whole control cluster to full card height — so at 1000px
    // it now WRAPS: identity on the first line, the capability pills, usage readout, toggle, pencil
    // and selection box aligned right on a second. This frame is the evidence for that behaviour.
    reaches: 'exact',
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'essences', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
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
    // essence that is DISABLED while components carry it and a recipe requires it. Selecting it
    // puts the inspector's suppression rows, its two stat cards and its blocked-delete note in
    // frame beside the row's own Disabled badge and muted capability pills.
    query: {},
    steps: [
      'Essences',
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-essence-identity' },
    ],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-grid',
    label: 'Manager — Essences grid',
    // BEYOND the smoke: the presentation toggle is new, so nothing in the walk presses it.
    reaches: 'beyond',
    smokeLabels: [],
    // The grid carries the SAME state vocabulary as the list — the Disabled pill, the capability
    // pills and the recipe count — because a presentation toggle must not silently remove state.
    // This frame is what proves it, beside `manager-essences-normal`'s list. It is ALSO the only
    // proof that the card's identity `<button>` grows past Foundry's fixed button height instead
    // of cropping: happy-dom computes no cascade, so no unit test can see it.
    //
    // The step clicks the segment LABEL, not its radio. `SegmentedControl` hides the radio with
    // `clip: rect(0 0 0 0)` at 1x1, and `view-lab-screenshots.mjs` uses `target.click()`, whose
    // hit-target check requires the element under the click point to BE the target or a
    // descendant of it — here it is the enclosing `<label>`, an ANCESTOR. That step timed out for
    // 30s and, because one failing case fails the whole capture job, published nothing at all.
    // `:706` and `:707` in this file already click the label for exactly this control and pass.
    query: {},
    steps: ['Essences', { selector: '[data-essence-view-option="grid"]' }],
    expectView: 'essences',
    // A click that lands but does not switch presentation would photograph the LIST under the
    // grid case's name — the "publishes an unrelated frame" failure this registry exists to
    // prevent, and one that would silently un-prove the crop fix above.
    expectSelector: '.fabricate-manager .manager-essences-table[data-essence-view="grid"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-bulk-edit',
    label: 'Manager — Essences bulk edit',
    reaches: 'beyond',
    smokeLabels: [],
    // An ACTIVE bulk selection, so the rail shows the bulk panel rather than the inspector.
    //
    // The ticked pair is `mote` + `aether`, and the pairing is the whole point. `aether` is
    // delete-BLOCKED (components carry it), which puts the named blocked member and a non-zero
    // carrier count on screen; `mote` is the corpus's only DELETABLE essence, which is what makes
    // "1 essence definition will be deleted", "1 recipe will be rewritten" and a LIVE Delete
    // button possible at all.
    //
    // It previously ticked `earth`, which is carried like every other lab essence, so the frame
    // could only show the inert all-blocked state — 0/0/0 above a DISABLED button — and the
    // maintainer's binding decision (state the impact, then Arm/Confirm) was photographed nowhere.
    // No selection reachable in this world could have fixed that without a deletable essence.
    query: {},
    steps: [
      'Essences',
      { selector: '[data-essence-select="mote"]' },
      { selector: '[data-essence-select="aether"]' },
    ],
    expectView: 'essences',
    // The frame must show the LIVE action, not the inert one. `ArmedDangerButton` renders the
    // idle danger button without `disabled` only when something is actually deletable, so this
    // fails loudly if the selection ever stops containing a deletable member.
    expectSelector:
      '.fabricate-manager [data-essence-bulk-delete-card] .manager-button.is-danger:not([disabled])',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-bulk-delete-armed',
    label: 'Manager — Essences bulk delete armed',
    reaches: 'beyond',
    smokeLabels: [],
    // The ARMED half of the maintainer's binding decision, which no case photographed. The same
    // selection as above, plus one click on the danger button: the first click only ARMS, so this
    // frame shows `Confirm delete` beside the impact statement it is a confirmation OF, with
    // nothing written.
    //
    // Two frames rather than one because the two states are the decision: an impact statement
    // stated BEFORE arming, and an arm that is a second, separate act.
    query: {},
    steps: [
      'Essences',
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
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-first-state',
    label: 'Manager — Essence edit first state',
    smokeLabels: ['manager-essence-edit-first-state'],
    // The smoke opens an essence row's Edit action and photographs the editor as it arrives, and
    // this lands in the same place. It is REPOINTED at `aether` (issue 1036): the editor's headline
    // state is a DISABLED essence — the Enabled row switched off, the On-craft badge counting two
    // configured behaviours — and `earth` cannot show it.
    //
    // The step still navigates by the row's FIRST `.manager-icon-button`, which must remain the
    // Edit pencil. The row now also carries an enable toggle and a selection box: the toggle wears
    // `.manager-status-toggle`, not `.manager-icon-button`, and `SelectionCheckbox` deliberately
    // renders no `<button>` at all, so neither can intercept.
    reaches: 'exact',
    query: {},
    steps: [
      'Essences',
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-on-craft',
    label: 'Manager — Essence edit On craft',
    reaches: 'beyond',
    smokeLabels: [],
    // The tab the two persisted fields live on. `aether` carries BOTH — a linked source component
    // and a property macro — so both sections render populated, both wear their `Suppressed` pill
    // (the essence is disabled), and the macro card photographs in its MISSING state, because the
    // lab world declares no `Macro` documents at all. The resolved state routes to smoke or
    // maintainer evidence rather than being implied here.
    query: {},
    steps: [
      'Essences',
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-essence-tab="oncraft"]' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-validation',
    label: 'Manager — Essence edit Validation',
    reaches: 'beyond',
    smokeLabels: [],
    // The third tab, and the only surface that reports an unresolvable property macro: at craft
    // time such a macro is logged and SKIPPED SILENTLY, deliberately, so this is the GM's one route
    // to the fact. `aether`'s macro does not resolve, so the tab shows a real warning rather than
    // an all-clear.
    query: {},
    steps: [
      'Essences',
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-essence-tab="validation"]' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
    ],
  }),

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
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
      /^src\/ui\/svelte\/apps\/manager\/environment\//,
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
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-task-editor-normal',
    label: 'Manager — Gathering task editor normal',
    smokeLabels: ['manager-gathering-task-editor-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // The rail's gathering group is a SUBMENU, so reaching the task library is two clicks:
    // `Gathering` opens the group on Environments, then the `tasks` subitem switches the
    // section. The row's own Edit control is what routes to `gathering-task-edit`; the task is
    // named by `data-gathering-task-id` rather than taken as `.first()` so the frame does not
    // silently follow a re-ordered library.
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
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
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
      // At 1000px the task library stacks, so Playwright has to scroll the panel to reach the
      // row's Edit control — and the editor then mounts into a container that KEPT that scroll
      // offset, framing "Required Tools" instead of the identity card. Scrolling the first card
      // back into view is what makes the stacked frame the same screen as the normal one.
      { selector: '[data-gathering-task-core-editor]', scroll: true },
    ],
    expectView: 'gathering-task-edit',
    // 1000x720, the width its smoke counterpart stacks at — the previous 1280x820 was the
    // NORMAL geometry, so the two cases differed in nothing at all.
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  }),
  managerCase({
    id: 'manager-environment-edit-placeholder',
    label: 'Manager — Environment edit placeholder',
    smokeLabels: ['manager-environment-edit-placeholder'],
    // The environment editor's Overview tab — identity, context, player-facing behaviour and
    // composition mode, with the summary/linked-scene/validation/runtime inspector beside it. The
    // name is historical: the route stopped being a placeholder when the composition editor
    // landed, and the smoke label kept its old name. Pinned to `hb-env-grove` by row, which is the
    // one environment carrying a linked scene, an automatic composition and node runtime.
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
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
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
    ],
    expectView: 'gathering-event-edit',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-travel-normal',
    label: 'Manager — Gathering travel normal',
    smokeLabels: ['manager-gathering-travel-normal'],
    // Lands on the real Travel and parties surface — the parties/realms/map-region tabs, an
    // ENABLED party with its three members, and the selected-party inspector — rather than the
    // environments browser this used to capture. The seed that blocked it is fixed: it authored
    // `memberActorIds` where `GatheringPartyStore._normalizeParty` reads `memberActorUuids`, so
    // every field normalised away and the card read "Disabled, 0 members".
    reaches: 'exact',
    // SMITHING, not herbalism. The Travel subitem exists only while the owning system's
    // `gatheringRealmSettings.enabled` is true, and switching that on for herbalism would
    // realm-lock all three of its environments (every one names an included realm) and take the
    // already-captured environments, blind and stacked frames with it. Smithing already runs the
    // Travel/Realms subsystem for the realm-locked environment teaser.
    query: { system: 'lab-smithing' },
    steps: ['Gathering', { selector: '#manager-gathering-nav-travel' }],
    expectView: 'environments',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
      /^src\/ui\/svelte\/apps\/manager\/(Party|Realm|RosterRow|MapRegionLinkPicker)/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-travel-stacked',
    label: 'Manager — Gathering travel stacked',
    smokeLabels: ['manager-gathering-travel-stacked'],
    // Reaches Travel for the same reason as its normal-width twin above, at the stacked breakpoint.
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: ['Gathering', { selector: '#manager-gathering-nav-travel' }],
    expectView: 'environments',
    position: { width: 1000, height: 720 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-01-library-1280x720',
    label: 'Manager — Tool parity 01 library 1280x720',
    smokeLabels: ['manager-tool-parity-01-library-1280x720'],
    reaches: 'exact',
    query: {},
    steps: ['Tools'],
    expectView: 'tools',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Tool/,
      /^src\/ui\/svelte\/apps\/manager\/tools\//,
    ],
  }),
  managerCase({
    id: 'manager-tool-zero-state-empty-library-1280x720',
    label: 'Manager — Tool zero state empty library 1280x720',
    smokeLabels: ['manager-tool-zero-state-empty-library-1280x720'],
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: ['Tools'],
    expectView: 'tools',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Tool/,
      /^src\/ui\/svelte\/apps\/manager\/tools\//,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-02-overview-1280x720',
    label: 'Manager — Tool parity 02 overview 1280x720',
    smokeLabels: ['manager-tool-parity-02-overview-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      'Tools',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#tool-tab-overview' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-stress-long-name',
    label: 'Manager — Tool stress long name',
    smokeLabels: ['manager-tool-stress-long-name'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // A long DISPLAY LABEL, authored on the fixture rather than typed: the field is the one
    // the smoke fills, and an authored value reaches the same overflow without a keystroke.
    steps: [
      'Tools',
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-stylus"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#tool-tab-overview' },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-parity-03-breakage-1280x720',
    label: 'Manager — Tool parity 03 breakage 1280x720',
    smokeLabels: ['manager-tool-parity-03-breakage-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      'Tools',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
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
      'Tools',
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-mallet"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#tool-tab-breakage' },
      // The repair editor sits below the breakage tab's own fold; without this the frame shows
      // the mode cards and none of the two populated requirement groups the case exists for.
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
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
      'Tools',
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-punch"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#tool-tab-breakage' },
      { selector: '[data-tool-replacement-target]', scroll: true },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
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
      'Tools',
      { selector: '[data-tool-authority-segment="checkDriven"]' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-anvilstone"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-parity-04-requirements-1280x720',
    label: 'Manager — Tool parity 04 requirements 1280x720',
    smokeLabels: ['manager-tool-parity-04-requirements-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      'Tools',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-parity-05-validation-1280x720',
    label: 'Manager — Tool parity 05 validation 1280x720',
    smokeLabels: ['manager-tool-parity-05-validation-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      'Tools',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#tool-tab-validation' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-stress-invalid-validation',
    label: 'Manager — Tool stress invalid validation',
    smokeLabels: ['manager-tool-stress-invalid-validation'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system — see the tool library
    // note in labContent.js for why not the default system.
    query: { system: 'lab-runework' },
    // The blocking Validation state. Un-checking the tool's single prerequisite leaves
    // prerequisites ENABLED with nothing chosen, which persistence can never hold (the
    // normalizer clamps `enabled` off on an empty id list) and only the editor draft can.
    steps: [
      'Tools',
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-caliper"] .manager-icon-button[aria-label^="Edit"]',
      },
      { selector: '#tool-tab-requirements' },
      { selector: '.manager-checklist-card-row:has(input[value="rw-prereq-arcana"])' },
      { selector: '#tool-tab-validation' },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-parity-06-breakage-900x700',
    label: 'Manager — Tool parity 06 breakage 900x700',
    smokeLabels: ['manager-tool-parity-06-breakage-900x700'],
    reaches: 'exact',
    query: {},
    steps: [
      'Tools',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    position: { width: 900, height: 700 },
    kinds: ['manager', 'tools', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  }),
  managerCase({
    id: 'manager-tool-stress-wrapping-680',
    label: 'Manager — Tool stress wrapping 680',
    smokeLabels: ['manager-tool-stress-wrapping-680'],
    reaches: 'exact',
    query: {},
    steps: ['Tools'],
    expectView: 'tools',
    position: { width: 680, height: 700 },
    kinds: ['manager', 'tools', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Tool/,
      /^src\/ui\/svelte\/apps\/manager\/tools\//,
    ],
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
    // The same character on the other tab: her learned entries name a book she no longer holds,
    // so each row falls to the DEFINITION-name rung and carries the no-refund clause.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-knowledge' },
      { selector: '[data-knowledge-actor="lab-actor-idrin"]' },
      { selector: '[data-knowledge-tab="learnedRecipes"]' },
    ],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
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
    // Delete armed to its confirm face. This is Fabricate's own two-step arm, not a Foundry
    // dialog, so one click reaches it — and the un-armed sibling rows in the same frame are the
    // evidence, since exactly one arm token exists at a time.
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
    steps: ['Components'],
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
      'Components',
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
      'Components',
      {
        selector:
          '.manager-component-row[data-component-id="sm-ruby"] .manager-icon-button[aria-label^="Edit"]',
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
    // The uploaded payload is a REAL export envelope, because `validateImportData` rejects
    // anything else. This case spent increment 2 at `window` behind a blocker comment naming the
    // step vocabulary and the missing `DialogV2` — both of which this branch had already removed.
    // The actual blocker was the fixture: the payload was `{name, components, recipes}` with no
    // `system` key, so validation errored, `renderSystemImportDialog` returned `null`, and the
    // frame published the plain systems browser under the name "Import report".
    //
    // It stayed invisible because `ui.notifications.error` was a no-op in the shim. Production
    // said "Invalid file: Missing required 'system' field" and nothing carried it. The shim now
    // routes notifications to `console`, so this exact defect fails the capture instead of
    // retitling it — see `tests/view-lab/foundry/installFoundryShim.js`.
    //
    // The system id must be NEW: `importFromPackData` reports an existing one as
    // `summary.system.skipped`, which is an info toast and an early `null` return, not a report.
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
            // Dangling `originItemUuid`s on purpose. The report's subject is
            // `summary.unresolvedReferences` — a reference the importer could not bind — and the
            // ordinary way to produce them is the ordinary way people hit this screen: export from
            // one world, import into another that does not have the items. A payload whose every
            // reference resolves renders the modal's EMPTY state, which is a real state but not
            // the one this frame is named for.
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
          // No recipes. One was authored here and the importer counted it as a FAILED recipe — it
          // contributed nothing to this modal (the report's subject is unresolved references, not
          // failed records) while leaving a knowingly-invalid record in a fixture, which is the
          // defect class this branch spent its length removing.
          recipes: [],
          gatheringEnvironments: [],
          gatheringConfig: {},
        }),
      },
      { selector: '.application.dialog button[data-action="ok"]' },
    ],
    expectView: 'systems',
    // The systems browser is what sits UNDERNEATH the report, so `expectView` alone cannot tell
    // the two apart. A GROUP rather than the modal root: `[data-import-report]` renders whether or
    // not anything was reported, because `buildImportReportContent` always returns an object and
    // the modal has an explicit empty state — so it would pass on the very "Everything resolved"
    // frame the dangling references in this payload exist to avoid.
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
    // The one case on this branch whose blocker is a MISSING VERB rather than a fixture shape.
    // `ImportFolderMappingModal` opens on exactly one path — `dropComponent(data)` calls
    // `services.collectImportFolderGroups(data)` and opens the modal only when the returned plan
    // carries `groups.length`. That is a DRAG-DROP: it needs a `DataTransfer` carrying a Foundry
    // folder or compendium-pack payload dispatched at the components drop target, which the
    // runner's click / select / fill / scroll / upload vocabulary cannot express. A `drop` verb is
    // the work, and it is real work rather than a line: the payload has to satisfy
    // `resolveDropData` and the collector has to walk a folder tree the lab world does not model.
    //
    // Left deliberately on the components browser rather than the default systems screen, so the
    // frame is at least about the surface the drop lands on.
    //
    // Its PNG is byte-identical to `manager-components-normal` — same app, query, steps and
    // geometry — and that is stated rather than dressed up. While the modal is unreachable this
    // case's value is its `sourceMatches`, not its picture: it is what selects a frame when
    // `ImportFolderMappingModal.svelte` changes, and no other case matches that file. The dedup
    // guard exempts `window` cases precisely so a case can admit it falls short instead of being
    // given an invented difference to look distinct.
    reaches: 'window',
    query: {},
    steps: ['Components'],
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
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
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
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  }),
  playerCase({
    id: 'player-salvage',
    label: 'Player app — Salvage',
    smokeLabels: ['player-salvage'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The PROGRESSIVE salvage body with its reorderable stage list — the counterpart's own
    // condition (`[data-inventory-salvage-panel="progressive"]` +
    // `[data-progressive-stage-reorderable]`). Filtered rather than paged to: the grid holds ~24
    // cards per page and a fixture that adds one would silently move this card off page one.
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
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  }),
  playerCase({
    id: 'player-salvage-no-check',
    label: 'Player app — Salvage no check',
    smokeLabels: ['player-salvage-no-check'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // `[data-inventory-salvage-body="no-check"]`: Simple salvage mode with no authored roll
    // formula, so every result is recovered outright. Smithing authors no `salvageCraftingCheck`
    // at all, which is exactly that pair — `(mode: 'simple', checkUsable: false)`.
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
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  }),
  playerCase({
    id: 'player-salvage-tools',
    label: 'Player app — Salvage tools',
    smokeLabels: ['player-salvage-tools'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The pre-roll required-tool disclosure with BOTH states in one frame: the Forge Tongs the
    // target actor holds (available) and the Anvil it does not (unavailable), which also disables
    // the pre-roll action. Availability is scoped to the target salvage actor, so this card is
    // stocked on the mule rather than on the smith who owns the whole toolset.
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
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  }),
  playerCase({
    id: 'player-inventory-multi-system',
    label: 'Player app — Inventory multi system',
    smokeLabels: ['player-inventory-multi-system'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // One physical stack registered as a component in TWO systems must collapse to a SINGLE card
    // counted once, carrying the system-selector drop-down that re-scopes the whole detail body.
    // Both halves of the Air Shard declare the same `originItemUuid`, which is the collapse key,
    // and both are salvageable so each option carries its affordance suffix.
    steps: [
      { selector: '.inventory-filters input', fill: 'Air Shard' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-air-shard"] .inventory-card-button',
      },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  }),
  playerCase({
    id: 'player-salvage-misconfigured',
    label: 'Player app — Salvage misconfigured',
    smokeLabels: ['player-salvage-misconfigured'],
    // WINDOW, not exact, and the gap is specific: this frame renders the misconfigured salvage
    // body for the `routedNoFormula` reason, where the smoke's counterpart renders it for
    // `simpleMultiGroup`. The body dispatches on that reason and its copy differs.
    //
    // The Simple reason is unreachable from FIXTURE DATA twice over, which is why no amount of
    // authoring closes it:
    //
    //   1. `_normalizeSalvage`'s Simple success-first retain-one clamp runs on every save AND
    //      inside `initialize()`, so a planted multi-group Simple config self-heals before
    //      anything can render it.
    //   2. Even past the clamp, `InventoryListingBuilder` hard-hides a `simpleMultiGroup`
    //      component from a NON-GM viewer through `hiddenEntityIds` — and every player frame
    //      renders as a non-GM viewer by design.
    //
    // The smoke reaches it by pushing a surplus result group onto the live, already-normalized
    // system in memory after boot and remounting the tab. That is a `call`-style hook in the lab's
    // boot sequence (`tests/view-lab/world/labWorld.js`), not a fixture. Until then this proves
    // the panel's misconfigured PATH — and `routedNoFormula` is the one misconfiguration a
    // persisted world can actually hold.
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
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  }),
  // ─── Bulk salvage / bulk destroy (issue 859) ──────────────────────────────────────────────────
  //
  // Every card named below sits on PAGE ONE of the 25-per-page grid, verified by rendering rather
  // than inferred: the listing sorts A→Z over the whole roster, so page-1 membership is fragile and
  // is exactly what the six existing inventory cases narrow with a search box to avoid. A search
  // filter cannot be used here — bulk selection needs SEVERAL cards on screen at once, and a filter
  // narrow enough to guarantee one card's position removes the others. Page size is the fallback if
  // that ever stops holding (`{selector: '.inventory-grid-pagination select', select: '75'}`), and
  // no case needs it today.
  //
  // ONE STATE THIS SET DELIBERATELY DOES NOT PHOTOGRAPH, recorded here rather than left as an
  // unexplained absence:
  //
  //   - `running`. The lab's `Roll` is seeded and SYNCHRONOUS, so a run completes before the frame
  //     is taken. Reaching it would need a harness hook that stalls the `salvageComponents` seam
  //     mid-run. Its markup is pinned by a mounted component test instead. (It is visible BEHIND
  //     the standing prompt in `player-inventory-bulk-roll-prompt`, which is incidental.)
  //
  // The other two absences this comment used to record — a broken-but-salvageable QUEUE row and the
  // post-run REPORT — were fixture gaps, not design decisions, and both are now captured below.
  // Each needed one change in `tests/view-lab/world/labActors.js`: the queue row needed something in
  // the world that is broken AND salvageable at once (`BROKEN_STACKS`), and the report needed a run
  // that can COMPLETE — every salvageable stack here is a single unit, so the engine's consume step
  // always takes its `item.delete()` branch and the duck-typed item had no such method
  // (`installDeleteSemantics`), which failed every subject with an error.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed',
    label: 'Player app — Inventory bulk selection (mixed)',
    // THE HEADLINE FRAME: one plain click, then three shift-clicks, and the panel partitions the
    // result into a queue, a best-case yield and a blocked list.
    //
    // The four cards are chosen so the frame carries every partition rule at once rather than one
    // per frame: Air Shard is salvageable and multi-system (so its row names the ACTING system),
    // Cracked Alembic is progressive (so it can only ever be Possible), Bent Clasp is blocked on a
    // GM misconfiguration and Field Toolchest on a missing tool — the two blocked reasons whose
    // copy differs most.
    steps: [
      // PLAIN, not shift: this is the card the first shift-click must PROMOTE. Selecting it here
      // is what makes the promotion assertion below mean something.
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    // ONE selector carrying TWO assertions, because the driver takes one and the frame has to
    // answer for both. Scoped to the app root, which is the only common ancestor of the grid and
    // the panel:
    //
    //   1. THE PROMOTION. The plain-clicked card must carry the bulk-selected marker. It is in the
    //      selection only because the first shift-click pulled it in, so a promotion that stopped
    //      working would publish a three-card selection under a case whose count line says four —
    //      and every other assertion here would still pass.
    //   2. BOTH CERTAINTIES in the yield aggregate. The preview's whole job is to distinguish what
    //      the batch WILL return from what it MIGHT, and a rule that collapsed one into the other
    //      renders a plausible list of the wrong colour.
    //
    // What it deliberately does NOT assert is the routed "up to" affix. That affix needs a
    // component name whose aggregate is `0 < guaranteed < quantity`, and no lab selection produces
    // one: the guaranteed set here is {Whetstone} and the possible set is {Empty Vial, Ground
    // Reagent, Frostcap Mushroom}, which do not intersect — and the world's only ROUTED salvage
    // config (`rw-slag`) is deliberately held by nobody. Stated rather than asserted, because a
    // selector for an element the fixtures cannot produce is a case that can never be captured.
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-yield] [data-status-pill="success"])' +
      ':has([data-inventory-bulk-yield] [data-status-pill="accent"])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed-narrow',
    label: 'Player app — Inventory bulk selection (narrowest window)',
    // The same selection at the NARROWEST window the app permits. `SvelteFabricateApp` clamps to
    // `MIN_WINDOW_WIDTH = 1024` in `_updatePosition`, which both `setPosition()` and a drag-resize
    // go through, so this is the real floor rather than a chosen size — 900 is refused by the
    // harness's own geometry gate before anything renders.
    //
    // IT DOES NOT REACH THE CONTAINER BREAKPOINT, and saying so is the point of this comment.
    // `.inventory-view-container` measures 938px inside a 1024px window, and
    // `@container fabricate-inventory (max-width: 900px)` therefore never matches — by design:
    // `MIN_WINDOW_WIDTH`'s own comment says the floor keeps the columns usable "before the
    // narrow-width stacking breakpoint takes over". `player-gathering-stacked` sits at the same
    // 1024 and is in the same position. So this frame is evidence about the narrowest permitted
    // GEOMETRY, not about the stacked block: the detail column falls from ~500px to 342px, which
    // is where a queue row's name competes with its certainty chip, its broken chip and its remove
    // control, and where the footer's note-left / actions-right row is most likely to break.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'inventory', 'bulk', 'responsive'],
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-queue="preview"] [data-inventory-bulk-queue-row])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-none-salvageable',
    label: 'Player app — Inventory bulk selection with nothing salvageable',
    // The EMPTY state, and the only frame that proves the footer's asymmetry: Salvage is withheld
    // because there is nothing to salvage, while Destroy stays live because destroy is not gated on
    // salvageability at all — it deletes whole stacks including blocked rows.
    //
    // Three ordinary stacks carrying no salvage config, across two systems, with the Empty Vial
    // also backing a herbalism TOOL so the grid selection is not three interchangeable ore cards.
    // The `essence` and `recipeItem` reasons would have made a richer list and are NOT reachable
    // from a case: `view-lab-fixture-identifiers.test.js` validates every `data-inventory-card`
    // value against a set built as `<system>:<component>`, which the two composite card kinds
    // (`essence:…`, `recipeitem:…`) are not in. They are covered by the store's own unit tests.
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
  // ONE FRAME PER SALVAGE RESOLUTION MODE, plus one carrying all three at once.
  //
  // The mode is a property of the SYSTEM, not the component, so each of these selects from a
  // different crafting system: Karrun Forgecraft is `simple` (and authors no salvage check at
  // all, so it is the no-roll case), Ashfall Runework is `routed`, Sablewright Herbalism is
  // `progressive`. Sablewright Jewellers is also routed but authors no check — that is the
  // MISCONFIGURED fixture, covered by `player-salvage-misconfigured`, and it is deliberately
  // not one of these.
  //
  // A single shift-click is a legal one-row bulk selection (the promotion only fires when a
  // DIFFERENT card is already inspected), which is what lets each mode be shown alone rather
  // than competing with two others in the same queue.
  //
  // Each raises the page size first: the grid is 25 per page and these cards are spread across
  // the alphabet, so page-one membership is not something to assume.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-simple',
    label: 'Player app — Inventory bulk salvage, simple mode',
    steps: [
      { selector: '.inventory-grid-pagination [data-pagination-size]', select: '75' },
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // Guaranteed, because simple with no authored roll formula awards its whole result set
    // outright — the certainty chip is the visible difference from the other two modes.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-smithing:sm-longsword"])' +
      ':has([data-inventory-bulk-yield] [data-status-pill="success"])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-routed',
    label: 'Player app — Inventory bulk salvage, routed mode',
    steps: [
      { selector: '.inventory-grid-pagination [data-pagination-size]', select: '75' },
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
      { selector: '.inventory-grid-pagination [data-pagination-size]', select: '75' },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    // Progressive is the one mode that honours a player's saved stage order, so this is also
    // the frame that carries the footer's reorder note.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-herbalism:hb-cracked-alembic"])' +
      ':has([data-inventory-bulk-reorder-note])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-all-modes',
    label: 'Player app — Inventory bulk salvage across all three resolution modes',
    // One of each, in one queue, across three systems — the case the other three exist to be
    // read against. It is also the only frame where the aggregate yield sums contributions
    // from three differently-resolved ladders, which is where same-named components from
    // different systems would collapse if the preview keyed on name rather than id.
    steps: [
      { selector: '.inventory-grid-pagination [data-pagination-size]', select: '75' },
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
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-tools-blocked',
    label: 'Player app — Inventory bulk selection blocked on missing tools',
    // `toolsUnavailable` is the one blocked reason a player can ACT on, and the only one whose copy
    // is data-driven — "Needs {tools}", filled from the row's own missing-tool names through a
    // locale-correct list format rather than a hand-joined comma list. It is worth its own frame
    // beside `-mixed` because there it competes with a second blocked row: here it is the only one,
    // above a queue that is still running, which is the other half of the claim (a blocked row
    // skips itself; it does not stop the batch).
    //
    // The Field Toolchest is stocked on Vosk, who carries the tongs its salvage names and not the
    // anvil — tool availability is scoped to the target salvage actor, so this is the one card in
    // the world that can reach the reason.
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
    // ONE prompt for the whole batch — the answer to the issue's own open question, and the state
    // acceptance 4 is about. `dialog: 'open'` leaves it standing and unanswered, which is the only
    // way to photograph one: the lab's default `enter` presses the footer's default button and the
    // dialog is gone long before the capture.
    //
    // The batch prompts at all only because the Cracked Alembic's system authors a usable
    // progressive salvage formula — the service computes `anyCheckUsable` and never opens a modal
    // when nothing in the selection could roll. The Air Shard beside it salvages under smithing,
    // which authors no salvage check, so the frame is also the honest picture of a MIXED batch:
    // one prompt covering an item that rolls and an item that does not.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // Held to the PROMPT's own element, never to the tab. A dialog is a SIBLING of the application
    // window, so `expectTab` is satisfied by an inventory tab with nothing over it — which is
    // exactly the screen a prompt that never opened would publish. The subject strip is what
    // distinguishes the bulk dialog from the single-subject one: `promptCheckRoll` renders no
    // `__subjects` at all, so this cannot be satisfied by the wrong prompt either.
    expectSelector: '.application.dialog .fabricate-roll-prompt__subjects',
    // It keeps the shared inventory `sourceMatches` and does NOT add
    // `apps/crafting/rollPrompt.js`, which builds the dialog. Declaring it would be more accurate
    // as a mapping — but `view-lab-cases.test.js` treats any case matching `apps/crafting` as a
    // CRAFTING case and pins their number, so an inventory case reaching into that folder is
    // counted as one and the census fails. `player-crafting-roll-prompt` already claims the file,
    // so the change still selects a frame of a roll prompt; it selects the single-subject one.
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-destroy-confirm',
    label: 'Player app — Inventory bulk destroy confirmation',
    // The confirmation for the destructive half, standing unanswered. It names BOTH numbers — the
    // component count and the unit count — because destroy takes whole stacks, and "3 components"
    // alone would hide how much is actually about to go. The second paragraph is the consequence
    // sentence that could not fit a button label, which is the whole reason this action confirms
    // through a dialog rather than an armed button.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-destroy]' },
    ],
    // Same failure mode as the roll prompt, and the same answer: hold it to the confirm's own COPY.
    // `p + p` is the two-paragraph body — the removal sentence and the "nothing is recovered"
    // rule — under a yes/no button pair, which no other dialog reachable from this tab renders.
    expectSelector: '.application.dialog:has(button[data-action="yes"]) .dialog-content p + p',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-broken-queued',
    label: 'Player app — Inventory bulk broken but salvageable',
    // ACCEPTANCE 3, and the most-argued behaviour in the whole feature: brokenness is about
    // USABILITY and does not gate salvage, so a broken row belongs in the QUEUE beside its
    // certainty chip and not in the blocked list. `bulkBlockedReasonFor` omits `broken` on purpose;
    // this is the frame that shows it was omitted on purpose rather than by oversight.
    //
    // The Longsword is the world's one broken stack (`BROKEN_STACKS` in `labActors.js`, which
    // records why it and not another). Smithing authors no salvage check, so its row carries a
    // GUARANTEED chip — and the danger chip sits beside that rather than replacing it, which is the
    // arrangement the assertion below is built to be the only match for.
    //
    // The Cracked Alembic is plain-clicked first for two reasons: a shift-click is what ENTERS a
    // bulk selection at all, and its row is the unbroken, rolled control the broken one is read
    // against — two rows, two certainties, one danger chip. Name-sorted, so it renders above.
    //
    // THE ONLY CASE IN THE SET THAT PAGES, and the reason is measured rather than assumed: the grid
    // sorts A→Z over all 50 cards at 25 per page, and the Longsword sorts 31st — page TWO. Every
    // other bulk case's cards happen to sit on page one, which is why the block comment above names
    // this exact step as the standing fallback. Raising the page size is preferred over navigating
    // to page two because the only OTHER salvageable card there is none: the world's four remaining
    // salvage configs all sort onto page one, so a page-two selection could pair the broken row
    // with nothing but blocked ones, and the unbroken queue row this frame reads against would be
    // unreachable. It is the first step so the two card clicks land on a settled grid.
    steps: [
      { selector: '.inventory-grid-pagination [data-pagination-size]', select: '75' },
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // ONE queue row carrying BOTH pills, which is the whole claim in one selector. The three ways
    // this could go wrong each publish a plausible screen that a looser selector accepts:
    //   - the row falls into the blocked list (`[data-inventory-bulk-blocked-row]`), which is the
    //     regression this behaviour is most likely to grow, and any panel-level selector matches
    //     the resulting frame;
    //   - the danger chip REPLACES the certainty chip instead of joining it, which a selector
    //     naming only the danger pill matches;
    //   - the danger chip renders elsewhere in the panel — the report's `failed` outcome pill is
    //     the same tone — which a bare `[data-status-pill="danger"]` matches.
    // Requiring both pills on the same `[data-inventory-bulk-queue-row]` refuses all three. Only a
    // queued, guaranteed, broken row can satisfy it.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ' [data-inventory-bulk-queue="preview"]' +
      ' [data-inventory-bulk-queue-row]' +
      ':has([data-status-pill="success"])' +
      ':has([data-status-pill="danger"])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-report',
    label: 'Player app — Inventory bulk report',
    // What a finished batch says it did — the state the whole panel exists to arrive at, and the
    // only one that shows a per-item outcome, a per-item rolled total, and the two aggregates
    // ("added to your pack" / "not recovered") the player actually reads.
    //
    // The SAME two cards as `player-inventory-bulk-roll-prompt`, minus its `dialog: 'open'`. That
    // pairing is deliberate: the two frames are the same batch either side of one gesture, so the
    // report can be read as the answer to the prompt above it. The lab's default dialog answer is
    // `enter`, which presses the button Foundry marks default — Roll, for a check prompt — so the
    // batch proceeds and the panel lands on its report without the case doing anything special.
    // (`confirmDialog` defaults to **No**, which is why the destroy half cannot be photographed
    // this way and is not attempted here.)
    //
    // It is also a MIXED batch by construction, which is the interesting report rather than the
    // trivial one: `view-lab-roll.test.js` pins that exactly one of these two subjects has a usable
    // salvage check, so one row can carry a rolled total and one cannot.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // The panel STATE plus the report's own subject list. The state alone is not enough: the panel
    // reports `report` for a run that threw as well as one that ran, and an error report renders a
    // banner over no subjects at all. Naming the subject list means the frame has to contain the
    // per-item outcomes it is published for.
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
    // `[data-gathering-event-section]` — on the world's only environment that HAS an Events tab.
    // The tab is mounted only at the `full` event-visibility tier, which smithing alone carries
    // (see `systemRules` in `world/labContent.js`): the fixture previously authored an invalid
    // `'gm'` tier that resolved to the restrictive default, so the tab existed nowhere.
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
    // The counterpart's condition is a selected task whose attempt is NOT blocked
    // (`[data-gathering-attempt-blocked="false"]`). Frostmark Ridge rather than the default
    // Sunlit Grove: the grove links a scene, so every task there is SCENE_TOKEN_BLOCKED for an
    // actor with no token on it.
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
    // The gather runs end to end and the frame SAYS SO: "Nodes available: 2/3" against the ready
    // state's 3/3, from a run the manager recorded as `succeeded`. Verified live.
    //
    // Old Karrun Mine rather than the ridge every other gathering case uses, and that is the
    // substance of this entry rather than a detail. A resolved, non-timed gather leaves NO mark on
    // the gathering surface unless the system runs a resource economy — no node pool and no
    // stamina means the same environment, the same rows and the same inspector before and after,
    // so the frame would be a duplicate of `player-gathering-task-ready` under a second name,
    // which is worse than an honest window-reach frame. The mine is the one gathering environment
    // that carries a live pool, because it is the one no other captured frame reads: switching
    // herbalism's economy on would have put a node line into all five herbalism gathering frames.
    //
    // The pool depletes `onSuccess`, so the count is evidence of the SUCCESS and not merely of the
    // attempt. See `sm-task-prospect` in `world/labContent.js`.
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
    // A selected task whose attempt IS blocked, on the tool reason specifically: Cut Icecap
    // Fronds requires the herbalist's glass alembic, and the gathering actor is the smith who
    // carries none of Idrin's glassware. The row shows the missing-tools callout chip and the
    // attempt renders `[data-gathering-attempt-blocked="true"]`.
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
    // A TIMED task before it has been started: attempt unblocked, and the requirements panel
    // names the six hours the attempt will wait rather than resolving on the spot. The pair with
    // `player-gathering-timed-active` below is the whole point of the timed path.
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
    // The SAME task after its attempt has been started. A timed attempt creates a waiting run
    // instead of resolving, so the row flips to blocked on DUPLICATE_ACTIVE_RUN and the attempt
    // reads `[data-gathering-attempt-blocked="true"]` — reached by actually pressing Attempt, as
    // the counterpart does, not by planting a run. The timed start posts no chat card, so it
    // clears the console-error gate that still holds `player-gathering-after-success`.
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
    // The one environment-card state selection cannot reach: a locked teaser, greyed, with the
    // lock overlay and the "not in current realm" header alert. The Deepvault requires a realm
    // nobody is in, so the listing answers NO_CURRENT_REALM and returns identity only. It sorts
    // last, so scroll it into view — `frame.screenshot()` does not scroll nested overflow
    // containers, and a card that never scrolled in is simply absent from the frame while every
    // assertion still passes.
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
    // The counterpart's condition is the right column having SWAPPED to the run summary —
    // `[data-crafting-run-summary]`, which `CraftingView` renders only once `lastRollResult`
    // carries an entry for the selected recipe. A craft that returns `success: false` notifies and
    // records nothing, so the frame is reached by a craft that actually completes.
    //
    // Smelt Iron Ingot, and a CHECKED recipe on purpose: this craft now ROLLS. The shim used to
    // install `Roll` as a plain object, so `evaluateCheckRoll` short-circuited on its own
    // `typeof !== 'function'` guard and passed the check without rolling; since
    // `tests/view-lab/foundry/labRoll.js` it evaluates `1d20 + @abilities.int.mod` off the seeded
    // stream, whose first d20 on any page is a 20, for a total of 23 against a threshold of 12.
    // The margin is a property of the FIXTURE and the seed, not a guarantee — see
    // `tests/view-lab-roll.test.js`, which pins the composed invariant so a seed or threshold
    // change fails there by name rather than surfacing here as a mystery frame diff.
    // The smoke's ROUTED craft is reachable in principle now too, and remains uncaptured only
    // because no case asks for it.
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
    // The counterpart's condition is the RollResultBox inside the run summary, scrolled into
    // frame: `[data-crafting-run-summary] [data-recipe-section="roll-result"]`.
    //
    // A different recipe from `player-crafting-run-summary`, so the pair is two crafts rather than
    // one craft photographed twice — and the scroll brings the DETAIL column's own copy of the box
    // into frame beside the summary's, which is the whole point of a case named for the box rather
    // than for the panel.
    //
    // The box carries no rolled total in either frame, and that is production's shape rather than
    // a lab gap: `CraftingEngine`'s success return is `{success, results, message}`, and
    // `RollResultBox` reads `result.total`/`result.checkResult.total`/`items`/`awardedResults`,
    // none of which that return carries. The smoke's counterpart shows the same header and message.
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
    //
    // Unreachable until the shim grew a real `Roll` CLASS: `evaluateCheckRoll` returns
    // `engine: false` on `typeof globalThis.Roll !== 'function'` BEFORE it calls `options.prompt`,
    // so with the old two-static object installed no crafting, salvage or alchemy prompt could open
    // in this harness at all. See `tests/view-lab/foundry/labRoll.js`.
    //
    // `dialog: 'open'` leaves it unanswered, which is the only way to photograph one — the lab's
    // default `enter` presses the footer's default button and the dialog closes long before the
    // capture. The craft's promise therefore never settles, and the frame is the prompt over a
    // mid-craft crafting tab, which is the honest picture of this state rather than a contrivance.
    //
    // `hb-r-stillroom` is the world's only recipe whose EFFECTIVE policy is `playerPicks` (a
    // per-recipe override over herbalism's `highest` default) on a formula that actually spends
    // `@craftingmod` — `CraftingEngine._buildInteractiveModifierChoice` requires all of interactive,
    // token-present, playerPicks and a two-or-more eligible set, so no other fixture reaches the
    // fieldset. The formula line reads `1d20 + 3 + (modifier)`: the deferred branch substitutes a
    // neutral placeholder rather than a number, because the value is the radio nobody has pressed.
    reaches: 'exact',
    query: { tab: 'crafting', dialog: 'open' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    // The dialog is a SIBLING of the application window, so the app's own route is satisfied by the
    // crafting tab with nothing over it — precisely the screen a prompt that never opened would
    // publish. The FIELDSET is what this case is named for, so that is what it is held to, not
    // merely `.application.dialog`.
    expectSelector: '.application.dialog .fabricate-roll-prompt__modifiers',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      // Narrow rather than `CRAFTING_SHARED`: `rollPrompt.js` builds this dialog end to end and
      // nothing else under that folder contributes a pixel of it, so a change elsewhere in
      // `crafting/` should not conscript a frame of a modal that would not show it.
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt\.js$/,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-essence-alternative',
    label: 'Player app — Crafting essence alternative',
    smokeLabels: ['player-crafting-essence-alternative'],
    // The counterpart's condition is an OPEN alternatives radiogroup — `.crafting-alt-option` rows
    // under `[data-recipe-section="alternatives"]` — one of whose options is an ESSENCE, so the
    // option card draws a `CraftingEssenceThumb` rather than an item image.
    //
    // It previously borrowed `player-crafting-essence-ingredient`'s recipe and published a
    // byte-identical frame under a second name. That recipe cannot reach this state: its essence
    // requirement is its own single-option group, and `IngredientOptionSelector` branches on the
    // OPTION's `isEssence`, so an essence in a group of its own renders a rail tile and opens the
    // essence pool instead. Quench in Fire-Bearing Stock puts the component and the essence in ONE
    // group, which is the only arrangement that puts an essence inside the chooser.
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
    // WINDOW, and unreachable from fixture data. The legacy surface is the IoTable's own
    // `[data-io-group="essences"]` group, which renders only from a set-level
    // `ingredientSet.essences` map. The lab seeds raw recipes into `game.settings`, and
    // `RecipeManager.initialize()` MIGRATES a stored set-level essence map into a first-class
    // essence group — verified: the set comes back with `essences: {}` and a uuid-named essence
    // group, so the frame shows the requirement rail rather than the legacy rows. The smoke's
    // counterpart escapes the migration only because it is authored through `createRecipe` after
    // initialize; reproducing that needs a post-init authoring hook in `world/labWorld.js`.
    //
    // Re-verified against the current tree: `migrateEssencesToIngredientGroups` runs over the
    // persisted `recipes` setting and is guarded only on the map being non-empty, so there is no
    // authored shape that both carries a set-level essence map and survives boot. Fixture work
    // cannot close this one; a post-init `createRecipe` in the lab's boot sequence can.
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
    // The counterpart's condition is an essence thumb inside the shopping list's acquire card:
    // `[data-shopping-acquire-components] .crafting-essence-thumb`, reached by pressing a recipe
    // row's cart button.
    //
    // Rivet Chainmail Shirt rather than the previously-selected Deepbind, because the card lists
    // what is MISSING and Deepbind's essences are fully fundable — adding it produced "0 missing
    // components" and no acquire card at all. Chainmail's Fire requirement can never be funded
    // (60 needed against 46 held across every carrier), so the card renders both an item row and
    // the essence row this frame exists for.
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
    // exactly `['choice:partial', 'essence:short', 'fixed:met']` and exactly ONE chooser is open.
    // Verified live against this recipe.
    //
    // The rail's three states cannot co-occur by accident — each needs its own engineering, which
    // is why this is an authored recipe rather than a re-selection of an existing one. See
    // `sm-r-tidebound` in `world/labContent.js` for what each group is doing and why `partial`
    // needs an unsatisfiable choice and `short` needs an essence with no carrier at all.
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
    // to borrow renders its own GLYPH and never Foundry's `item-bag.svg`; every group is fixed, so
    // it is the world's only rail with no chooser open. Verified live —
    // `glyphTiles: 1, bagImages: 0, openChoosers: 0`. The recipe is filtered to rather than paged
    // to: the browser holds 12 rows a page and this one sorts onto page two.
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
    // counterpart's own sequence. The two trims are the PRECONDITION, not decoration: with every
    // carrier already at maximum the wand writes the allocation the panel is already showing, so
    // pressing it would change nothing on screen.
    //
    // The recipe is the one whose Fire requirement can never be fully funded (60 needed, 46 held
    // across every carrier). That is the only arrangement in which the wand is photographable at
    // all: it renders while a requirement is short, so a fundable one makes the control vanish
    // the instant it is pressed.
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
    // The shared-pool proof: TWO essence requirements in one set, funded from ONE dual carrier.
    // Zeroing the single-essence carriers and raising Steel Ingot (2 Earth + 2 Fire) to ×2 leaves
    // Fire fully delivered and Earth short FROM THE SAME UNITS — which a per-group disjoint draw
    // could not produce at all. Verified live: `met|partial` meters, one recap row, and two
    // contribution chips on the dual carrier.
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
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-pattern-blade"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-progressive',
    label: 'Player app — Crafting progressive',
    smokeLabels: ['player-crafting-progressive'],
    // The reorderable stage list at rest — `[data-recipe-section="progressive-stages"]` with its
    // grips, ordinals, per-stage difficulty and "Reached at ≥N" thresholds, and the chevron box
    // rendered whether or not anything has moved. Verified live: 3 rows, 3 grips, 3 move controls,
    // thresholds ≥1 / ≥3 / ≥7 ascending.
    //
    // Progressive is a per-SYSTEM resolution mode, so this needs a progressive system the PLAYER
    // can see. Herbalism is the world's progressive system and it is knowledge-gated; the crafting
    // actor learns exactly the two recipes below and nothing else. See `LEARNED_RECIPES` in
    // `world/labActors.js` for why a sixth crafting system was rejected instead.
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
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-reordered',
    label: 'Player app — Crafting progressive reordered',
    smokeLabels: ['player-crafting-progressive-reordered'],
    // The SAME list after one downward move, which is the counterpart's own sequence and the only
    // state in which two of its invariants stop being vacuous: the live region is empty until a
    // move announces, and the authored thresholds ascend by construction until one is re-derived.
    // Verified live — the region reads "Empty Vial moved to position 2 of 3" and the thresholds
    // re-rank to ≥2 / ≥3 / ≥7 rather than carrying their old values with the rows.
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
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-fixed',
    label: 'Player app — Crafting progressive fixed',
    smokeLabels: ['player-crafting-progressive-fixed'],
    // The GM-ordered variant, on its own recipe because the state is a RECIPE flag:
    // `allowPlayerResultReorder` defaults true, so an explicit false has to be authored to reach
    // it at all. Verified live against the counterpart's whole report — 3 fixed rows, 0 grips,
    // 0 move controls, 3 ordinals, 3 difficulty chips, the "Order set by the GM" line present,
    // and no live region for an order that cannot change.
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
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-stacked',
    label: 'Player app — Crafting progressive stacked',
    smokeLabels: ['player-crafting-progressive-stacked'],
    // WINDOW, and the blocker is a WIDTH the lab cannot reach rather than a fixture gap.
    //
    // The counterpart shrinks `#fabricate-app` to 780px by writing `min-width: 0` inline, which
    // takes the grid under its 900px container breakpoint so the three columns STACK and the stage
    // rows get the full width. The lab cannot do that: `assertWindowGeometry` requires the applied
    // box to equal the declared one, and production's `.fabricate-app { min-width: 1024px }` is
    // therefore the floor for a PLAYER case. (That floor is player-only: `.fabricate-app` is the
    // player shell, so the manager's responsive cases sit below it at 1000, 900 and 680.)
    //
    // At 1024 the grid does NOT stack; the centre column lands at ~290px, and the counterpart's
    // own assertions fail there. Measured: `rowOverflow: 3` where the counterpart demands 0, and
    // all three stage names compute to zero width rather than ellipsing. That is a real finding
    // about the un-stacked narrow band — the smoke never renders this width — and the frame is
    // published as evidence of it, not as the counterpart's state.
    reaches: 'window',
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
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-alchemy-chooser',
    label: 'Player app — Alchemy chooser',
    smokeLabels: ['player-alchemy-chooser'],
    // The discipline chooser, reached exactly as the counterpart reaches it: the world remembers a
    // chosen discipline, so the tab opens on the workbench and "Switch discipline"
    // (`[data-alchemy-switch]`) is what returns to the chooser.
    //
    // It needed a SECOND alchemy-mode system to exist at all — `needsChooser` is
    // `systems.length > 1 && !activeSystemId`, so with one discipline this is not a state the app
    // can be driven into. `lab-tidewrack` supplies it, and the same `systems.length > 1` also
    // flips `canSwitch`, which is what puts the control this case clicks on the workbench frames.
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
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
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
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  }),
  playerCase({
    id: 'fabricate-journal',
    label: 'Player app — Journal',
    smokeLabels: ['fabricate-journal'],
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [],
    kinds: ['player', 'journal'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/journal\//, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
  playerCase({
    id: 'fabricate-journal-craft-detail',
    label: 'Player app — Journal craft detail',
    smokeLabels: ['fabricate-journal-craft-detail'],
    // The counterpart's condition is a HISTORY crafting run selected, so the run-detail
    // requirements card (`[data-journal-card="step-details"]`) is on screen — a different article
    // from the one `fabricate-journal` shows, which is the default ACTIVE run. With empty steps
    // this case published that same default frame under a second name.
    //
    // The multi-step succeeded run rather than the single-step one: its detail carries the step
    // rail as well as the requirements card, so the two journal frames differ in structure and not
    // only in which row is lit.
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [
      { selector: '.journal-history-row[data-history-run-id="lab-run-succeeded-multi"]' },
      {
        selector:
          '[data-journal-detail][data-run-type="crafting"] [data-journal-card="step-details"]',
        scroll: true,
      },
    ],
    kinds: ['player', 'journal'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/journal\//, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
  ...journalBlindRunCases(),
  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // Coverage matrix — states the live smoke does NOT photograph.
  //
  // Everything above mirrors a smoke frame, which makes the smoke the ceiling on coverage. It is
  // not a complete one: the smoke walks one system per screen, so whole rendering paths — the two
  // routed resolution modes, two of the three visibility modes, Foundry's light theme — never
  // appear in any frame it produces. These cases carry `reaches: 'beyond'` and no `smokeLabels`,
  // which is the registry's way of saying "no smoke counterpart exists to compare against".
  // ───────────────────────────────────────────────────────────────────────────────────────────────

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
    // Scrolls to its own named subject. Issue 975 gave Runework's check two authored
    // triggers, and a populated trigger card is tall enough to push the outcome-tier
    // table towards the fold — so without an anchor this case would drift into
    // photographing a panel that no longer contains the table it is named for.
    //
    // The anchor is a ROW OF THAT TABLE, not `[data-routed-tiers]`: that attribute
    // wraps `CheckRecipeTiers` — the recipe-tiers card — while the outcome-tier table
    // is the following unhooked section, so anchoring there would frame a card this
    // case is not photographing and would break the moment that fixture gains content.
    // `rw-ruined` is the LAST tier in Runework's `relativeOutcomes`, and
    // `scrollIntoViewIfNeeded` lands its anchor near the BOTTOM edge, so the whole
    // table sits above it in frame.
    steps: [
      'Checks',
      { selector: '#checks-tab-crafting' },
      { selector: '[data-outcome-row="rw-ruined"]', scroll: true },
    ],
    expectView: 'checks',
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
    // Criterion 14's subject: the dynamic-DC macro card, which is the ONE shipped consumer this
    // change converted from a hand-rolled `use:dragDrop` div onto the shared `ItemDropZone`. The
    // drop zone renders only under `dcMode: 'dynamic'`.
    //
    // The mode is reached by CLICKING rather than by authoring, which is the same choice
    // `manager-checks-crafting-modifiers-player-picks` records and for the same reason: `dcMode`
    // lives on the SHARED frozen `SIMPLE_CHECK` that five lab systems declare, so authoring
    // `dynamic` there would turn every one of their recipes' `DC 15` pills into `Dynamic DC` and
    // move a dozen already-captured frames to photograph one card. The Checks editor stages into a
    // draft, so the click reaches the same rendered state without persisting anything.
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#checks-tab-crafting' },
      { selector: '[data-dc-mode-option="dynamic"] input' },
      { selector: '[data-check-macro-dropzone]', scroll: true },
    ],
    expectView: 'checks',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ItemDropZone\.svelte$/,
      /^src\/utils\/macroReference\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-tier-step',
    label: 'Manager — Checks crafting tier-step triggers',
    // BEYOND the smoke. The capture walk never AUTHORS a trigger — it adds one, drives the
    // controls and removes it again to leave the Checks draft clean — so there is no
    // counterpart frame of a populated trigger list to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only fixture check carrying authored triggers, and the only crafting
    // check with named outcome tiers — which is what makes the `target` mode's tier select
    // renderable at all. A second case rather than a scroll step on the sibling above: that
    // one is named for the outcome-tier TABLE and photographs the top of the same panel, so
    // scrolling it down to the trigger card would move it off its own subject.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#checks-tab-crafting' },
      // Anchored on a NAMED trigger's own tier-step row, never on "the row's last control":
      // which control that is depends on the mode, so a mode change would silently move the
      // anchor. `scrollIntoViewIfNeeded` lands it near the bottom edge, so anchoring the
      // second (and last) authored trigger frames both cards — the `target` tier select
      // above and this one's step count — rather than one card and a fold.
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]', scroll: true },
    ],
    expectView: 'checks',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/],
  }),
  // Player recipe detail, one per resolution mode. Each mode draws a DIFFERENT body — the routed
  // ones a route rail, progressive a stage rail, simple a plain ingredient list — so the four
  // frames together are the only side-by-side evidence that a change to one did not move another.
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
  // KNOWN GAP — no `coverage-mode-progressive-detail`. The only progressive system in the fixture
  // is `lab-herbalism`, which is knowledge-gated on purpose (that is what makes the Books & Scrolls
  // and Knowledge rails exist at all), so a player who has learned nothing sees none of its recipes
  // and there is no row to click. Closing this properly means either granting the lab player
  // knowledge — which changes the recipe list in EVERY existing player frame — or adding a sixth,
  // progressive-and-global system. Both are larger than the frame is worth right now; the
  // progressive AUTHORING path is covered by `manager-recipe-edit-results-progressive`.
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
  // Foundry's LIGHT application theme. Everything else in this registry renders `theme-dark`,
  // because that is what the smoke world is configured for — but a GM is free to run light, and
  // `styles/fabricate.css` sets no heading colour of its own, so headings inherit Foundry's
  // `--color-text-primary`: rgb(17,17,17) under light, on Fabricate's own dark panels. These two
  // frames are the evidence for that, and the regression guard once it is fixed.
  playerCase({
    id: 'coverage-theme-light-player',
    label: 'Coverage — player app on Foundry light theme',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', colorScheme: 'light' },
    steps: [],
    kinds: ['player', 'crafting', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  }),
  managerCase({
    id: 'coverage-theme-light-manager',
    label: 'Coverage — manager on Foundry light theme',
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
  // Both were only ever photographed in their ON state on the player side.
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
]);

/**
 * Normalize a changed-file path to repository-relative POSIX form.
 *
 * @param {string} filePath Path from a diff.
 * @returns {string} Normalized path.
 */
export function normalizePath(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

/**
 * Whether one path can change what a window looks like.
 *
 * @param {string} filePath Repository-relative path.
 * @returns {boolean} True for render-affecting paths.
 */
export function isUiFile(filePath) {
  return UI_PATH_PATTERN.test(normalizePath(filePath));
}

/**
 * Whether a changed set requires screenshot evidence at all. A `lang/`-only change does not — but a
 * `lang/` change alongside a render file does, which is why this tests the whole set.
 *
 * @param {string[]} files Changed paths.
 * @returns {boolean} True when evidence is required.
 */
export function hasUiChanges(files = []) {
  const normalized = files.map((file) => normalizePath(file));
  if (normalized.some((file) => isUiFile(file))) return true;
  return false;
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
 *
 * @param {string} id Case id.
 * @returns {string|null} Label, or null when the id is unknown.
 */
export function labelForCaseId(id) {
  return getCaseById(id)?.label ?? null;
}

export function fallbackCase() {
  return getCaseById(FALLBACK_CASE_ID);
}

/**
 * The cases a set of RENDER files selects, by the `sourceMatches` patterns each case declares.
 *
 * @param {string[]} renderFiles Normalized paths that {@link isUiFile} accepts.
 * @returns {Set<string>} Selected case ids. Empty when nothing matched.
 */
function selectRenderFileCases(renderFiles) {
  const selected = new Set();
  let sawBroadSignal = false;
  for (const file of renderFiles) {
    if (BROAD_SIGNAL_PATTERN.test(file)) {
      sawBroadSignal = true;
      continue;
    }
    for (const viewCase of VIEW_LAB_CASES) {
      if (viewCase.sourceMatches.some((pattern) => pattern.test(file))) selected.add(viewCase.id);
    }
  }

  if (sawBroadSignal) for (const id of REPRESENTATIVE_CASE_IDS) selected.add(id);
  return selected;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Diff-aware selection for this registry file.
//
// Adding two cases used to select all 157, when the honest answer is those two. The selector had
// the diff available and did not use it. It does now — but only for changes it can PROVE are
// confined to case-object literals, and it proves that against this file's own text.
//
// The whole design is one question: when do we widen back to everything? The answer is "at the
// first sign of anything we do not fully understand", which here means:
//
//   - no patch, an empty patch, or a patch that is not a unified diff;
//   - a hunk header that does not parse, or a body line whose marker is not ` `, `+`, `-` or `\`;
//   - a context or added line whose text does NOT equal the line at that position in this file —
//     the patch describes a different revision than the one that will render, so its line numbers
//     mean nothing here (see {@link consumeNewFileLine});
//   - this file's own text not parsing into case regions;
//   - a changed line outside every case literal — a shared helper, a pattern constant, a factory,
//     or `mapChangedFilesToCases` itself, any of which can move every frame.
//
// The one thing DELIBERATELY not widened for is a blank or comment-only line. A comment cannot
// change a pixel, and a 157-frame, twenty-minute capture to answer a typo fix is exactly the cost
// this narrowing exists to remove.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** `  managerCase({` / `  playerCase({` — an element of the array, at Prettier's two-space indent. */
const CASE_OPEN_PATTERN = /^ {2}[A-Za-z]\w*\(\{$/;
/** The line that closes such an element. */
const CASE_CLOSE_LINE = '  }),';
/** A case's own id line, four spaces in. */
const CASE_ID_PATTERN = /^ {4}id: '([^']+)',$/;
const ARRAY_OPEN_PREFIX = 'export const VIEW_LAB_CASES';
const ARRAY_CLOSE_LINE = ']);';
/** `@@ -old,count +new,count @@` — only the new-file start is needed. */
const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
/** A line that cannot change a rendered frame: blank, a `//` comment, or inside a block comment. */
const INERT_LINE_PATTERN = /^\s*(\/\/|\/?\*)/;

let cachedSourceLines;
let cachedCaseRegions;

/**
 * This module's own source, by line, read once and only when a registry patch is supplied.
 *
 * Reading the file is the only way to know where each case literal SITS, and it is safe here for a
 * reason worth stating: the read is not trusted. Every context and added line of the patch is
 * checked against what is read back, so a mismatch between the patch's revision and the checkout's
 * (a `pull_request` checkout is the MERGE commit, not the head — if main also edited this file, the
 * positions shift) is detected and widens to everything rather than mis-attributing.
 *
 * This keeps the no-patch path free of I/O, so the ordinary selection stays a pure function of its
 * arguments, and it never shells out to git.
 *
 * @returns {string[]} Source lines; empty when the file cannot be read.
 */
function registrySourceLines() {
  if (cachedSourceLines) return cachedSourceLines;
  try {
    cachedSourceLines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  } catch {
    cachedSourceLines = [];
  }
  return cachedSourceLines;
}

/**
 * The `VIEW_LAB_CASES` array's body, with the file line number its first line has.
 *
 * @param {string[]} sourceLines This file, by line.
 * @returns {{firstLineNumber: number, lines: string[]}|null} The body, or null when not found.
 */
function registryArrayBody(sourceLines) {
  const start = sourceLines.findIndex((line) => line.startsWith(ARRAY_OPEN_PREFIX));
  if (start === -1) return null;
  const end = sourceLines.indexOf(ARRAY_CLOSE_LINE, start);
  if (end === -1) return null;
  return { firstLineNumber: start + 2, lines: sourceLines.slice(start + 1, end) };
}

/**
 * The 1-based, inclusive line span of every case literal in the array.
 *
 * Line-level rather than a brace count, because a brace count over raw text is wrong here: this
 * registry is full of regular-expression literals whose character classes and quantifiers carry
 * unbalanced `[`, `]` and `{`, and tokenising JavaScript to avoid that is far more machinery than
 * the question deserves. Prettier already guarantees the shape this reads — one element per
 * `  factory({` line, closed by `  }),` — and the id it extracts is checked against {@link caseIds},
 * so a file whose text stops matching what it exports parses to null and widens to everything.
 *
 * Lines BETWEEN elements (section banners, the `...journalBlindRunCases()` spread) belong to no
 * region on purpose: the spread is a call to shared code, and a change to it must widen.
 *
 * @param {string[]} sourceLines This file, by line.
 * @returns {{id: string, start: number, end: number}[]|null} Regions, or null when unparseable.
 */
function parseCaseLineRegions(sourceLines) {
  const body = registryArrayBody(sourceLines);
  if (!body) return null;

  const regions = [];
  let open = null;
  for (const [offset, line] of body.lines.entries()) {
    const lineNumber = body.firstLineNumber + offset;
    if (open === null) {
      if (CASE_OPEN_PATTERN.test(line)) open = { id: null, start: lineNumber };
      continue;
    }
    open.id ??= line.match(CASE_ID_PATTERN)?.[1] ?? null;
    if (line !== CASE_CLOSE_LINE) continue;
    regions.push({ id: open.id, start: open.start, end: lineNumber });
    open = null;
  }

  if (open || regions.length === 0) return null;
  if (regions.some((region) => !caseIds.includes(region.id))) return null;
  return regions;
}

/**
 * @returns {{id: string, start: number, end: number}[]|null} Memoized case regions.
 */
function caseLineRegions() {
  cachedCaseRegions ??= parseCaseLineRegions(registrySourceLines());
  return cachedCaseRegions;
}

/**
 * @param {string} text A source line.
 * @returns {boolean} True when changing it cannot change a rendered frame.
 */
function isInertSourceLine(text) {
  return text.trim() === '' || INERT_LINE_PATTERN.test(text);
}

/**
 * Start a hunk, moving the cursor to its first new-file line.
 *
 * @param {object} state Walk state.
 * @param {string} header The `@@` line.
 * @returns {boolean} False when the header does not parse.
 */
function startHunk(state, header) {
  const match = header.match(HUNK_HEADER_PATTERN);
  if (!match) return false;
  state.cursor = Number(match[1]);
  state.started = true;
  return true;
}

/**
 * Record a removed line. It has no position in the new file, so it is attributed to the line that
 * now occupies its place — which is inside the same case literal for any edit within one, and
 * outside every region (so: everything) for a removal at a boundary.
 *
 * @param {object} state Walk state.
 * @param {string} text The removed line.
 * @returns {boolean} Always true; a removal cannot make a patch unparseable.
 */
function recordRemoval(state, text) {
  if (!isInertSourceLine(text)) state.touched.add(state.cursor);
  return true;
}

/**
 * Consume a line that EXISTS in the new file — context or addition — and verify it.
 *
 * The verification is the load-bearing part. Line numbers from a patch are meaningless against a
 * different revision, and a wrong line number here does not fail loudly: it silently attributes a
 * change to whichever case happens to sit at that offset. So every line the patch claims is checked
 * against the file that will actually render, and one mismatch abandons the narrowing entirely.
 *
 * @param {object} state Walk state.
 * @param {string} marker ` ` or `+`.
 * @param {string} text The line's content.
 * @param {string[]} sourceLines This file, by line.
 * @returns {boolean} False when the patch does not describe this file.
 */
function consumeNewFileLine(state, marker, text, sourceLines) {
  if (sourceLines[state.cursor - 1] !== text) return false;
  if (marker === '+' && !isInertSourceLine(text)) state.touched.add(state.cursor);
  state.cursor += 1;
  return true;
}

/**
 * @param {object} state Walk state.
 * @param {string} raw One patch line.
 * @param {string[]} sourceLines This file, by line.
 * @returns {boolean} False when the line cannot be interpreted.
 */
function consumePatchLine(state, raw, sourceLines) {
  if (raw.startsWith('@@')) return startHunk(state, raw);
  // Anything before the first hunk header is either a `diff --git` / `index` / `---` / `+++`
  // preamble or not a diff at all. GitHub's `patch` field carries no preamble, so rather than
  // guess which it is, refuse: an unparseable patch is a full capture, not a wrong one.
  if (!state.started) return false;
  if (raw.startsWith('\\')) return true; // `\ No newline at end of file`
  // A blank context line is emitted as a bare space, but tools that strip trailing whitespace turn
  // it into an empty string; both mean "an unchanged empty line".
  const marker = raw === '' ? ' ' : raw[0];
  const text = raw.slice(1);
  if (marker === '-') return recordRemoval(state, text);
  if (marker === ' ' || marker === '+') return consumeNewFileLine(state, marker, text, sourceLines);
  return false;
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

/**
 * The new-file line numbers a patch changes.
 *
 * @param {string} patch A unified diff of this file.
 * @param {string[]} sourceLines This file, by line.
 * @returns {Set<number>|null} Changed line numbers, or null when the patch cannot be trusted.
 */
function changedRegistryLines(patch, sourceLines) {
  const state = { cursor: 0, started: false, touched: new Set() };
  for (const raw of patchLines(patch)) {
    if (!consumePatchLine(state, raw, sourceLines)) return null;
  }
  return state.started ? state.touched : null;
}

/**
 * The cases a change to THIS FILE selects, given the PR's patch for it.
 *
 * @param {string|undefined} patch The unified diff for this file, if the caller supplied one.
 * @returns {Set<string>|symbol} Selected ids, or {@link EVERY_PUBLISHABLE_CASE}.
 */
function casesFromRegistryPatch(patch) {
  if (typeof patch !== 'string' || patch.trim() === '') return EVERY_PUBLISHABLE_CASE;

  const regions = caseLineRegions();
  if (!regions) return EVERY_PUBLISHABLE_CASE;

  const touched = changedRegistryLines(patch, registrySourceLines());
  if (!touched) return EVERY_PUBLISHABLE_CASE;

  const ids = new Set();
  for (const line of touched) {
    const region = regions.find((candidate) => line >= candidate.start && line <= candidate.end);
    if (!region) return EVERY_PUBLISHABLE_CASE;
    ids.add(region.id);
  }
  return ids;
}

/**
 * The cases ONE lab input selects.
 *
 * @param {string} file A normalized path matching {@link LAB_INFRASTRUCTURE_PATTERN}.
 * @param {Map<string, string>} patchByPath Patches by path.
 * @returns {Set<string>|symbol} Selected ids, or {@link EVERY_PUBLISHABLE_CASE}.
 */
function selectLabInputCases(file, patchByPath) {
  if (file === REGISTRY_PATH) return casesFromRegistryPatch(patchByPath.get(file));
  const attribution = ATTRIBUTED_LAB_INPUTS.find((entry) => entry.path === file);
  // The DEFAULT, and the fail-safe: an input nobody has attributed — a new file under
  // `tests/view-lab/`, the mount page, the fixture assembler, the Foundry shim — selects the whole
  // corpus. See {@link mapChangedFilesToCases} for why that has to be the default.
  if (!attribution) return EVERY_PUBLISHABLE_CASE;
  return new Set(
    publishableCases()
      .filter((viewCase) => attribution.selects(viewCase))
      .map((viewCase) => viewCase.id)
  );
}

/**
 * The union of what every lab input in a changed set selects.
 *
 * @param {string[]} labInputs Normalized lab-input paths.
 * @param {Map<string, string>} patchByPath Patches by path.
 * @returns {Set<string>|symbol} Selected ids, or {@link EVERY_PUBLISHABLE_CASE}.
 */
function selectAllLabInputCases(labInputs, patchByPath) {
  const selected = new Set();
  for (const file of labInputs) {
    const ids = selectLabInputCases(file, patchByPath);
    if (ids === EVERY_PUBLISHABLE_CASE) return EVERY_PUBLISHABLE_CASE;
    for (const id of ids) selected.add(id);
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

/**
 * Map a changed-file set onto the cases that should be captured.
 *
 * A change to the lab's own inputs — the fixture world, the page that mounts it, the Foundry shim,
 * this registry — selects EVERYTHING that publishes unless it is one of the few inputs whose reach
 * can be derived (see {@link ATTRIBUTED_LAB_INPUTS} and {@link casesFromRegistryPatch}).
 *
 * That default is the rule that stops the harness lying about its riskiest change. Every frame
 * renders from one fixture world, so an edit to `labContent.js` can reflow all of them — and none
 * of those paths is a render file, so `isUiFile` rejects them and the selection came back EMPTY.
 * The PRs most able to invalidate the whole corpus were precisely the PRs that selected no evidence
 * and passed green. Verified before that rule existed:
 *   mapChangedFilesToCases(['tests/view-lab/world/labContent.js']) -> []
 *
 * Narrowing it is therefore allowed in exactly one direction: an input may select FEWER frames only
 * when the registry can show its work from what the cases declare about themselves, or from a diff
 * it has checked against the file that will render. Everything unmapped, unparseable or ambiguous
 * still selects all of them.
 *
 * @param {string[]} files Changed paths.
 * @param {object} [options] Selection inputs beyond the file list.
 * @param {Record<string, string>} [options.patches] Unified diffs by path, as GitHub's
 *   `pulls/{n}/files` endpoint returns them in each entry's `patch` field. Only this file's patch
 *   is read. Supplying none is always safe: it selects more frames, never fewer.
 * @returns {object[]} Cases to capture, in registry order.
 */
export function mapChangedFilesToCases(files = [], { patches } = {}) {
  const normalized = files.map((file) => normalizePath(file)).filter(Boolean);
  const labInputs = normalized.filter((file) => LAB_INFRASTRUCTURE_PATTERN.test(file));
  // Disjoint from `labInputs` so each path is attributed exactly once: `tests/view-lab/cascade.css`
  // is both a lab input and a `.css` file, and it is the lab input rule that governs it.
  const renderFiles = normalized.filter(
    (file) => isUiFile(file) && !LAB_INFRASTRUCTURE_PATTERN.test(file)
  );

  if (labInputs.length === 0 && renderFiles.length === 0) {
    // Nothing here renders, so there is no frame to select — a lang-only change included. The
    // MIXED case (a `lang/` edit shipping alongside render files) never reaches this branch at all,
    // because those render files put `renderFiles.length` above zero and selection proceeds below;
    // callers test `hasUiChanges` over the whole set for that distinction.
    //
    // This previously read `normalized.some(isLang) ? [] : []` — a ternary whose branches were
    // identical, guarding a distinction that had already been made two lines above. It selected
    // nothing either way, so it was dead, and the comment above it described a fallback return the
    // code did not perform.
    return [];
  }

  const labSelection = selectAllLabInputCases(labInputs, normalizePatches(patches));
  if (labSelection === EVERY_PUBLISHABLE_CASE) return publishableCases();

  // A UNION, not an early return. The lab-input branch used to answer for the whole changed set, so
  // the render files shipping alongside it were never consulted — which was invisible while the
  // answer was "everything" and would silently drop frames now that it is not.
  const selected = selectRenderFileCases(renderFiles);
  for (const id of labSelection) selected.add(id);
  if (selected.size === 0) selected.add(FALLBACK_CASE_ID);

  return VIEW_LAB_CASES.filter((viewCase) => selected.has(viewCase.id) && viewCase.publish);
}

/**
 * Every case that publishes, for a full capture run.
 *
 * @returns {object[]} Publishable cases.
 */
export function publishableCases() {
  return VIEW_LAB_CASES.filter((viewCase) => viewCase.publish);
}

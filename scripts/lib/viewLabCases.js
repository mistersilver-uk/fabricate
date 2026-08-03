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
    smokeLabels: ['manager-recipe-edit-normal'],
    // The per-recipe check-modifier override AT REST. `RecipeOverviewTab` gates the whole control
    // on `craftingModifierOptions.length > 0`, so it exists on exactly one lab system — herbalism,
    // the only one carrying a catalogue — and every other recipe-editor frame in this registry runs
    // on smithing or jewelry. The one herbalism recipe-editor case that did exist opens the Books &
    // Scrolls tab, so before this entry NO frame showed the Overview modifier row at all.
    //
    // `hb-r-kiln` authors no `craftingModifier`, so the select sits on its blank option and reads
    // "Inherit system default (Pick highest)" — the label composed from the SYSTEM policy, which is
    // the half of the control a per-recipe frame cannot otherwise show, and the half that would
    // have silently read "(Add all)" had the label map not gained a `playerPicks` entry.
    reaches: 'exact',
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
    // BEYOND the smoke: its one overriding recipe authors `byRecipe`, so no smoke frame shows the
    // Phase-2 policy chosen per recipe.
    reaches: 'beyond',
    smokeLabels: [],
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
  managerCase({
    id: 'manager-essences-normal',
    label: 'Manager — Essences normal',
    smokeLabels: ['manager-essences-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Essence/],
  }),
  managerCase({
    id: 'manager-essences-stacked',
    label: 'Manager — Essences stacked',
    smokeLabels: ['manager-essences-stacked'],
    reaches: 'exact',
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'essences', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Essence/],
  }),
  managerCase({
    id: 'manager-essence-edit-first-state',
    label: 'Manager — Essence edit first state',
    smokeLabels: ['manager-essence-edit-first-state'],
    // Already lands where its counterpart does: the smoke opens the FIRST essence row's Edit
    // action and photographs the editor as it arrives. Pinned to `earth` by row rather than left
    // on "whichever row is first", so the frame's identity card, its in-use inspector and its
    // deletion-blocked notice cannot change under a re-order.
    reaches: 'exact',
    query: {},
    steps: [
      'Essences',
      { selector: '.manager-essence-row[data-essence-id="earth"] .manager-icon-button' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/],
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
    // Smelt Iron Ingot, and a CHECKED recipe on purpose: the shim's `Roll` is an object, not a
    // constructor, so `evaluateCheckRoll` short-circuits on its own `typeof !== 'function'` guard
    // and returns `engine: false` — the documented headless path, which passes the check without
    // rolling. What the lab therefore cannot reach is the smoke's ROUTED craft, which needs a real
    // total to land on an outcome tier and otherwise aborts with "does not satisfy current
    // resolution mode requirements". A `Roll` class in the shim would close that;
    // `tests/view-lab/foundry/installFoundryShim.js` is where it would go.
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
    steps: ['Checks', { selector: '#checks-tab-crafting' }],
    expectView: 'checks',
    kinds: ['manager', 'checks', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//],
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
 * Map a changed-file set onto the cases that should be captured.
 *
 * @param {string[]} files Changed paths.
 * @returns {object[]} Cases to capture, in registry order.
 */
export function mapChangedFilesToCases(files = []) {
  const normalized = files.map((file) => normalizePath(file)).filter(Boolean);

  // A change to the lab's own fixture world or to this registry selects EVERYTHING that publishes.
  //
  // This is the rule that stops the harness lying about its riskiest change. Every frame renders
  // from one fixture world, so an edit to `labContent.js` can reflow all 150 — and none of those
  // paths is a render file, so `isUiFile` rejects them and the selection came back EMPTY. The PRs
  // most able to invalidate the whole corpus were precisely the PRs that selected no evidence and
  // passed green. Verified before this rule existed:
  //   mapChangedFilesToCases(['tests/view-lab/world/labContent.js']) -> []
  if (normalized.some((file) => LAB_INFRASTRUCTURE_PATTERN.test(file))) {
    return publishableCases();
  }

  const renderFiles = normalized.filter((file) => isUiFile(file));
  if (renderFiles.length === 0) {
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

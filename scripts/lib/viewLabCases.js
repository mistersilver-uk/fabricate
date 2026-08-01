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

/** One player screen and one manager screen: enough to show a shared-primitive change in context. */
const REPRESENTATIVE_CASE_IDS = Object.freeze(['fabricate-app-shell', 'manager-components-normal']);

export const FALLBACK_CASE_ID = 'fabricate-app-shell';

export const VIEW_LAB_CASES = Object.freeze([
  {
    id: 'manager-recipes-editor-roundtrip',
    label: 'Manager — Recipes editor roundtrip',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  },
  {
    id: 'manager-default-selection',
    label: 'Manager — Default selection',
    app: MANAGER,
    smokeLabels: ['manager-default-selection'],
    reaches: 'exact',
    query: {},
    steps: [],
    expectView: 'systems',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/Systems?(Browser|Overview)View\.svelte$/,
    ],
  },
  {
    id: 'manager-selected-normal',
    label: 'Manager — Selected normal',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'manager-rail-expanded',
    label: 'Manager — Rail expanded',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'manager-rail-collapsed',
    label: 'Manager — Rail collapsed',
    app: MANAGER,
    smokeLabels: ['manager-rail-collapsed'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '.manager-rail-toggle' }],
    expectView: 'systems',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'manager-selected-stacked',
    label: 'Manager — Selected stacked',
    app: MANAGER,
    smokeLabels: ['manager-selected-stacked'],
    reaches: 'exact',
    query: {},
    steps: [],
    expectView: 'systems',
    position: { width: 1000, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'manager-system-edit-normal',
    label: 'Manager — System edit normal',
    app: MANAGER,
    smokeLabels: ['manager-system-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(ResolutionModeCard|CraftingEffectPanel|ItemPageInspector)\.svelte$/,
    ],
  },
  {
    id: 'manager-system-edit-narrow',
    label: 'Manager — System edit narrow',
    app: MANAGER,
    smokeLabels: ['manager-system-edit-narrow'],
    reaches: 'exact',
    query: {},
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    position: { width: 900, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'manager-system-edit-dirty',
    label: 'Manager — System edit dirty',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'manager-system-edit-lists',
    label: 'Manager — System edit lists',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'currency-actor-property',
    label: 'Manager — Currency actor property',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'currency-macro',
    label: 'Manager — Currency macro',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'currency-actor-inventory',
    label: 'Manager — Currency actor inventory',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system-edit', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'manager-recipes-normal',
    label: 'Manager — Recipes normal',
    app: MANAGER,
    smokeLabels: ['manager-recipes-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Crafting'],
    expectView: 'recipes',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  },
  {
    id: 'manager-recipes-narrow',
    label: 'Manager — Recipes narrow',
    app: MANAGER,
    smokeLabels: ['manager-recipes-narrow'],
    reaches: 'exact',
    query: {},
    steps: ['Crafting'],
    expectView: 'recipes',
    position: { width: 900, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  },
  {
    id: 'manager-recipes-no-check',
    label: 'Manager — Recipes no check',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  },
  {
    id: 'manager-recipes-grouped-continuation',
    label: 'Manager — Recipes grouped continuation',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  },
  {
    id: 'manager-crafting-group-expanded',
    label: 'Manager — Crafting group expanded',
    app: MANAGER,
    smokeLabels: ['manager-crafting-group-expanded'],
    // The rail's Crafting GROUP expanded to all four subitems — Recipes, Books & Scrolls,
    // Knowledge, Settings — over a multi-category recipe library. Books & Scrolls and Knowledge
    // exist only for a knowledge-gated system (`buildCraftingNavItems`), so the default globally
    // visible system advertises two of the four and cannot show this rail at all.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting'],
    expectView: 'recipes',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  },
  {
    id: 'manager-books-scrolls-normal',
    label: 'Manager — Books scrolls normal',
    app: MANAGER,
    smokeLabels: ['manager-books-scrolls-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-books-scrolls' }],
    expectView: 'books-scrolls',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  },
  {
    id: 'manager-crafting-settings',
    label: 'Manager — Crafting settings',
    app: MANAGER,
    smokeLabels: ['manager-crafting-settings'],
    reaches: 'exact',
    query: {},
    steps: ['Crafting', { selector: '#manager-crafting-nav-settings' }],
    expectView: 'crafting-settings',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'crafting-settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  },
  {
    id: 'manager-recipe-item-validation',
    label: 'Manager — Recipe item validation',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  },
  {
    id: 'manager-recipe-item-validation-blocked',
    label: 'Manager — Recipe item validation blocked',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
    ],
  },
  {
    id: 'manager-recipe-edit-normal',
    label: 'Manager — Recipe edit normal',
    app: MANAGER,
    smokeLabels: ['manager-recipe-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-books-scrolls',
    label: 'Manager — Recipe edit books scrolls',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-tools',
    label: 'Manager — Recipe edit tools',
    app: MANAGER,
    smokeLabels: ['manager-recipe-edit-tools'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-tools' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-ingredients',
    label: 'Manager — Recipe edit ingredients',
    app: MANAGER,
    smokeLabels: ['manager-recipe-edit-ingredients'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-ingredients-cost',
    label: 'Manager — Recipe edit ingredients cost',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-validation',
    label: 'Manager — Recipe edit validation',
    app: MANAGER,
    smokeLabels: ['manager-recipe-edit-validation'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-validation' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-multistep',
    label: 'Manager — Recipe edit multistep',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-results',
    label: 'Manager — Recipe edit results',
    app: MANAGER,
    smokeLabels: ['manager-recipe-edit-results'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-results-multistep',
    label: 'Manager — Recipe edit results multistep',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-multistep-disable-confirm',
    label: 'Manager — Multistep disable confirm',
    app: MANAGER,
    smokeLabels: ['manager-multistep-disable-confirm'],
    reaches: 'window',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-collapsed',
    label: 'Manager — Recipe edit collapsed',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-results-progressive',
    label: 'Manager — Recipe edit results progressive',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-results-alchemy',
    label: 'Manager — Recipe edit results alchemy',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  },
  {
    id: 'manager-recipe-edit-access-rail',
    label: 'Manager — Recipe edit access rail',
    app: MANAGER,
    smokeLabels: ['manager-recipe-edit-access-rail'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-access' }],
    expectView: 'access',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
    ],
  },
  {
    id: 'manager-components-normal',
    label: 'Manager — Components normal',
    app: MANAGER,
    smokeLabels: ['manager-components-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Components'],
    expectView: 'components',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-bulk-edit',
    label: 'Manager — Components bulk edit',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-bulk-edit-unstaged',
    label: 'Manager — Components bulk edit unstaged',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-description-before',
    label: 'Manager — Components description before',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-description-repaired',
    label: 'Manager — Components description repaired',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-description-ingested',
    label: 'Manager — Components description ingested',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-component-edit-normal',
    label: 'Manager — Component edit normal',
    app: MANAGER,
    smokeLabels: ['manager-component-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Components', { selector: '.manager-icon-button[aria-label^="Edit"]' }],
    expectView: 'component-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-component-edit-salvage',
    label: 'Manager — Component edit salvage',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-component-edit-salvage-off',
    label: 'Manager — Component edit salvage off',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-component-edit-salvage-simple',
    label: 'Manager — Component edit salvage simple',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-checks-gathering',
    label: 'Manager — Checks gathering',
    app: MANAGER,
    smokeLabels: ['manager-checks-gathering'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#checks-tab-gathering' }],
    expectView: 'checks',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'checks', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  },
  {
    id: 'manager-checks-validation',
    label: 'Manager — Checks validation',
    app: MANAGER,
    smokeLabels: ['manager-checks-validation'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#checks-tab-validation' }],
    expectView: 'checks',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'checks', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  },
  {
    id: 'manager-checks-crafting-consumption',
    label: 'Manager — Checks crafting consumption',
    app: MANAGER,
    smokeLabels: ['manager-checks-crafting-consumption'],
    reaches: 'exact',
    query: {},
    steps: ['Checks', { selector: '#checks-tab-crafting' }],
    expectView: 'checks',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  },
  {
    id: 'manager-checks-crafting-modifiers',
    label: 'Manager — Checks crafting modifiers',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  },
  {
    id: 'manager-components-stacked',
    label: 'Manager — Components stacked',
    app: MANAGER,
    smokeLabels: ['manager-components-stacked'],
    reaches: 'exact',
    query: {},
    steps: ['Components'],
    expectView: 'components',
    position: { width: 1000, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-grouped-continuation',
    label: 'Manager — Components grouped continuation',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-tags-categories-normal',
    label: 'Manager — Tags categories normal',
    app: MANAGER,
    smokeLabels: ['manager-tags-categories-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Tags & Categories', { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tags'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategories/,
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyPanel|InlineVocabularyAdd)\.svelte$/,
    ],
  },
  {
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager — Tags categories tags tab',
    app: MANAGER,
    smokeLabels: ['manager-tags-categories-tags-tab'],
    reaches: 'exact',
    query: {},
    steps: ['Tags & Categories', { selector: '#vocabulary-tab-tag' }],
    expectView: 'tags',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tags', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategories/],
  },
  {
    id: 'manager-tags-categories-stacked',
    label: 'Manager — Tags categories stacked',
    app: MANAGER,
    smokeLabels: ['manager-tags-categories-stacked'],
    reaches: 'exact',
    query: {},
    steps: ['Tags & Categories', { selector: '#vocabulary-tab-recipe' }],
    expectView: 'tags',
    position: { width: 1000, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tags', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategories/],
  },
  {
    id: 'manager-essences-normal',
    label: 'Manager — Essences normal',
    app: MANAGER,
    smokeLabels: ['manager-essences-normal'],
    reaches: 'exact',
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'essences'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Essence/],
  },
  {
    id: 'manager-essences-stacked',
    label: 'Manager — Essences stacked',
    app: MANAGER,
    smokeLabels: ['manager-essences-stacked'],
    reaches: 'exact',
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    position: { width: 1000, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'essences', 'responsive'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Essence/],
  },
  {
    id: 'manager-essence-edit-first-state',
    label: 'Manager — Essence edit first state',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'essences'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/],
  },
  {
    id: 'manager-environments-browse-normal',
    label: 'Manager — Environments browse normal',
    app: MANAGER,
    smokeLabels: ['manager-environments-browse-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Gathering'],
    expectView: 'environments',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
      /^src\/ui\/svelte\/apps\/manager\/environment\//,
    ],
  },
  {
    id: 'manager-environments-browse-stacked',
    label: 'Manager — Environments browse stacked',
    app: MANAGER,
    smokeLabels: ['manager-environments-browse-stacked'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Gathering'],
    expectView: 'environments',
    position: { width: 1000, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  },
  {
    id: 'manager-gathering-task-editor-normal',
    label: 'Manager — Gathering task editor normal',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  },
  {
    id: 'manager-gathering-task-editor-stacked',
    label: 'Manager — Gathering task editor stacked',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'responsive', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  },
  {
    id: 'manager-environment-edit-placeholder',
    label: 'Manager — Environment edit placeholder',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/],
  },
  {
    id: 'manager-gathering-events-normal',
    label: 'Manager — Gathering events normal',
    app: MANAGER,
    smokeLabels: ['manager-gathering-events-normal'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // `encounters`, not `events`: the nav item's id is the route key, and the label is the only
    // place the word "Events" appears.
    steps: ['Gathering', { selector: '#manager-gathering-nav-encounters' }],
    // The events library is a SECTION of the environments route, so the route key is unchanged;
    // the section is what the second step moves.
    expectView: 'environments',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  },
  {
    id: 'manager-gathering-event-editor-normal',
    label: 'Manager — Gathering event editor normal',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  },
  {
    id: 'manager-gathering-travel-normal',
    label: 'Manager — Gathering travel normal',
    app: MANAGER,
    smokeLabels: ['manager-gathering-travel-normal'],
    // Still `window`, and the steps below are why it is now honestly so: the case lands on the
    // real Travel and parties surface (parties/realms/map-region tabs, a party row, the selected-
    // party inspector) instead of the environments browser it used to capture. What it cannot yet
    // match is the smoke's POPULATED party: `labWorld.js` seeds `memberActorIds` and no
    // `travelActorUuid`, while `GatheringPartyStore._normalizeParty` reads `memberActorUuids` and
    // refuses to enable a party without a travel actor — so the card renders "Disabled, 0
    // members". That seed is a one-line fix in `tests/view-lab/world/labWorld.js`.
    reaches: 'exact',
    // SMITHING, not herbalism. The Travel subitem exists only while the owning system's
    // `gatheringRealmSettings.enabled` is true, and switching that on for herbalism would
    // realm-lock all three of its environments (every one names an included realm) and take the
    // already-captured environments, blind and stacked frames with it. Smithing already runs the
    // Travel/Realms subsystem for the realm-locked environment teaser.
    query: { system: 'lab-smithing' },
    steps: ['Gathering', { selector: '#manager-gathering-nav-travel' }],
    expectView: 'environments',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
      /^src\/ui\/svelte\/apps\/manager\/(Party|Realm|RosterRow|MapRegionLinkPicker)/,
    ],
  },
  {
    id: 'manager-gathering-travel-stacked',
    label: 'Manager — Gathering travel stacked',
    app: MANAGER,
    smokeLabels: ['manager-gathering-travel-stacked'],
    // `window` for the same reason as its normal-width twin above.
    reaches: 'exact',
    query: { system: 'lab-smithing' },
    steps: ['Gathering', { selector: '#manager-gathering-nav-travel' }],
    expectView: 'environments',
    position: { width: 1000, height: 720 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'environments', 'responsive', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering(Economy|EventEditView|EventsBrowserView|MapLinksTab|PartiesTab|RealmsTab|TaskEditView|TasksBrowserView|TravelTabs)/,
    ],
  },
  {
    id: 'manager-tool-parity-01-library-1280x720',
    label: 'Manager — Tool parity 01 library 1280x720',
    app: MANAGER,
    smokeLabels: ['manager-tool-parity-01-library-1280x720'],
    reaches: 'exact',
    query: {},
    steps: ['Tools'],
    expectView: 'tools',
    position: { width: 1280, height: 720 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Tool/,
      /^src\/ui\/svelte\/apps\/manager\/tools\//,
    ],
  },
  {
    id: 'manager-tool-zero-state-empty-library-1280x720',
    label: 'Manager — Tool zero state empty library 1280x720',
    app: MANAGER,
    smokeLabels: ['manager-tool-zero-state-empty-library-1280x720'],
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: ['Tools'],
    expectView: 'tools',
    position: { width: 1280, height: 720 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Tool/,
      /^src\/ui\/svelte\/apps\/manager\/tools\//,
    ],
  },
  {
    id: 'manager-tool-parity-02-overview-1280x720',
    label: 'Manager — Tool parity 02 overview 1280x720',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-stress-long-name',
    label: 'Manager — Tool stress long name',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-parity-03-breakage-1280x720',
    label: 'Manager — Tool parity 03 breakage 1280x720',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-stress-repair',
    label: 'Manager — Tool stress repair',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-stress-replacement',
    label: 'Manager — Tool stress replacement',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-stress-immune',
    label: 'Manager — Tool stress immune',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-parity-04-requirements-1280x720',
    label: 'Manager — Tool parity 04 requirements 1280x720',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-parity-05-validation-1280x720',
    label: 'Manager — Tool parity 05 validation 1280x720',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-stress-invalid-validation',
    label: 'Manager — Tool stress invalid validation',
    app: MANAGER,
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
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-parity-06-breakage-900x700',
    label: 'Manager — Tool parity 06 breakage 900x700',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'responsive', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/],
  },
  {
    id: 'manager-tool-stress-wrapping-680',
    label: 'Manager — Tool stress wrapping 680',
    app: MANAGER,
    smokeLabels: ['manager-tool-stress-wrapping-680'],
    reaches: 'exact',
    query: {},
    steps: ['Tools'],
    expectView: 'tools',
    position: { width: 680, height: 700 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools', 'responsive', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Tool/,
      /^src\/ui\/svelte\/apps\/manager\/tools\//,
    ],
  },
  {
    id: 'manager-knowledge-owned-copies',
    label: 'Manager — Knowledge owned copies',
    app: MANAGER,
    smokeLabels: ['manager-knowledge-owned-copies'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    position: { width: 1280, height: 900 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  },
  {
    id: 'manager-knowledge-empty-tab',
    label: 'Manager — Knowledge empty tab',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  },
  {
    id: 'manager-knowledge-learned-lost-copy',
    label: 'Manager — Knowledge learned lost copy',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  },
  {
    id: 'manager-knowledge-party-pool-warning',
    label: 'Manager — Knowledge party pool warning',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  },
  {
    id: 'manager-knowledge-delete-armed',
    label: 'Manager — Knowledge delete armed',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  },
  {
    id: 'manager-knowledge-narrow',
    label: 'Manager — Knowledge narrow',
    app: MANAGER,
    smokeLabels: ['manager-knowledge-narrow'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    position: { width: 880, height: 900 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge', 'responsive', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/knowledge\//,
    ],
  },
  {
    id: 'manager-components-progressive',
    label: 'Manager — Components progressive',
    app: MANAGER,
    smokeLabels: ['manager-components-progressive'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: ['Components'],
    expectView: 'components',
    position: { width: 1280, height: 900 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-components-bulk-edit-progressive',
    label: 'Manager — Components bulk edit progressive',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Component/,
      /^src\/ui\/svelte\/apps\/manager\/components?\//,
    ],
  },
  {
    id: 'manager-component-edit-difficulty',
    label: 'Manager — Component edit difficulty',
    app: MANAGER,
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
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-import-report',
    label: 'Manager — Import report',
    app: MANAGER,
    smokeLabels: ['manager-import-report'],
    // Stays `window`, and the blocker is the harness's step vocabulary rather than the fixture.
    // `ImportReportModal` opens on ONE path: `importSystem()` -> `renderSystemImportDialog()`,
    // which puts up a `DialogV2.prompt` carrying a native `<input type="file" name="importFile">`
    // and returns `null` unless a FILE was chosen. The smoke feeds that input with
    // `setInputFiles`; the runner's four verbs are click / select / fill / scroll, and `fill` on a
    // file input throws rather than selecting anything. So there is no fixture that reaches this
    // screen — it needs a file verb in `scripts/view-lab-screenshots.mjs`, alongside the real
    // `DialogV2` the folder-mapping case is also waiting on.
    reaches: 'window',
    query: {},
    steps: [],
    expectView: 'systems',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/Import(ReportModal|FolderMappingModal)\.svelte$/,
    ],
  },
  {
    id: 'manager-import-folder-mapping',
    label: 'Manager — Import folder mapping',
    app: MANAGER,
    smokeLabels: ['manager-import-folder-mapping'],
    reaches: 'window',
    query: {},
    steps: [],
    expectView: 'systems',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'manager-alchemy-settings',
    label: 'Manager — Alchemy settings',
    app: MANAGER,
    smokeLabels: ['manager-alchemy-settings'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-settings' }],
    expectView: 'crafting-settings',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'crafting-settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  },
  {
    id: 'manager-experimental-off',
    label: 'Manager — Experimental off',
    app: MANAGER,
    smokeLabels: ['manager-experimental-off'],
    reaches: 'exact',
    query: { experimental: '0' },
    steps: [],
    expectView: 'systems',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'player-gathering-environments',
    label: 'Player app — Gathering environments',
    app: PLAYER,
    smokeLabels: ['player-gathering-environments'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'fabricate-app-shell',
    label: 'Player app — App shell',
    app: PLAYER,
    smokeLabels: ['fabricate-app-shell'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
    ],
  },
  {
    id: 'player-inventory',
    label: 'Player app — Inventory',
    app: PLAYER,
    smokeLabels: ['player-inventory'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'player-salvage',
    label: 'Player app — Salvage',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'player-salvage-no-check',
    label: 'Player app — Salvage no check',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'player-salvage-tools',
    label: 'Player app — Salvage tools',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'player-inventory-multi-system',
    label: 'Player app — Inventory multi system',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'player-salvage-misconfigured',
    label: 'Player app — Salvage misconfigured',
    app: PLAYER,
    smokeLabels: ['player-salvage-misconfigured'],
    // WINDOW, not exact, and the gap is specific: this frame renders the misconfigured salvage
    // body for the `routedNoFormula` reason, where the smoke's counterpart renders it for
    // `simpleMultiGroup`. The body dispatches on that reason and its copy differs.
    //
    // The Simple reason is unreachable from persisted data by construction:
    // `_normalizeSalvage`'s Simple success-first retain-one clamp runs on every save AND inside
    // `initialize()`, so a planted multi-group Simple config self-heals before anything renders
    // it. The smoke reproduces it with an in-memory post-init push onto the live normalized
    // system, which needs a hook in the lab's boot sequence (`world/labWorld.js`) rather than a
    // fixture. Until then this proves the panel's misconfigured PATH, not the smoke's reason.
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'player-gathering-events',
    label: 'Player app — Gathering events',
    app: PLAYER,
    smokeLabels: ['player-gathering-events'],
    reaches: 'window',
    query: { tab: 'gathering' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-task-ready',
    label: 'Player app — Gathering task ready',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-after-success',
    label: 'Player app — Gathering after success',
    app: PLAYER,
    smokeLabels: ['player-gathering-after-success'],
    // WINDOW, blocked by the Foundry shim rather than by the fixture. The attempt itself works
    // end to end in the lab (verified: `hb-task-ridgemoss` resolves, awards, and writes the run),
    // but a succeeded gather posts its result card through `ChatMessage.create`, and the lab's
    // shim (`tests/view-lab/foundry/installFoundryShim.js`) defines no `ChatMessage` global. The
    // engine catches the ReferenceError and `console.error`s it, which the capture driver treats
    // as a failed render — correctly, since it IS a missing seam. A `ChatMessage` stub in the
    // shim closes this case with the two steps below plus a click on
    // `.gathering-task-detail-attempt`; suppressing the system's `chatOutput` feature to dodge it
    // would hide the seam instead of supplying it.
    //
    // Steps stay EMPTY on purpose. Borrowing `player-gathering-task-ready`'s two steps would
    // publish a byte-identical frame under a second name — closing the entry while adding no
    // evidence, which is worse than an honest window-reach frame.
    reaches: 'window',
    query: { tab: 'gathering' },
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-ridgemoss"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-tool-blocked',
    label: 'Player app — Gathering tool blocked',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-timed-ready',
    label: 'Player app — Gathering timed ready',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-timed-active',
    label: 'Player app — Gathering timed active',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-blind',
    label: 'Player app — Gathering blind',
    app: PLAYER,
    smokeLabels: ['player-gathering-blind'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // `[data-gathering-blind-card]`: a blind-selection environment redacts its task list entirely
    // — one opaque attempt card instead of rows, with the mask chip on the environment card.
    steps: [{ selector: '.gathering-env-card[data-environment-id="hb-env-thicket"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-realm-locked',
    label: 'Player app — Gathering realm locked',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-stacked',
    label: 'Player app — Gathering stacked',
    app: PLAYER,
    smokeLabels: ['player-gathering-stacked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    position: { width: 1024, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering', 'responsive', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-crafting-simple',
    label: 'Player app — Crafting simple',
    app: PLAYER,
    smokeLabels: ['player-crafting-simple'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1100, height: 760 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-ingredient-routed',
    label: 'Player app — Crafting ingredient routed',
    app: PLAYER,
    smokeLabels: ['player-crafting-ingredient-routed'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-routed-by-check',
    label: 'Player app — Crafting routed by check',
    app: PLAYER,
    smokeLabels: ['player-crafting-routed-by-check'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-run-summary',
    label: 'Player app — Crafting run summary',
    app: PLAYER,
    smokeLabels: ['player-crafting-run-summary'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-roll-result',
    label: 'Player app — Crafting roll result',
    app: PLAYER,
    smokeLabels: ['player-crafting-roll-result'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-essence-alternative',
    label: 'Player app — Crafting essence alternative',
    app: PLAYER,
    smokeLabels: ['player-crafting-essence-alternative'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-emberbrand"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-alternatives',
    label: 'Player app — Crafting alternatives',
    app: PLAYER,
    smokeLabels: ['player-crafting-alternatives'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-essence-legacy',
    label: 'Player app — Crafting essence legacy',
    app: PLAYER,
    smokeLabels: ['player-crafting-essence-legacy'],
    // WINDOW, and unreachable from fixture data. The legacy surface is the IoTable's own
    // `[data-io-group="essences"]` group, which renders only from a set-level
    // `ingredientSet.essences` map. The lab seeds raw recipes into `game.settings`, and
    // `RecipeManager.initialize()` MIGRATES a stored set-level essence map into a first-class
    // essence group — verified: the set comes back with `essences: {}` and a uuid-named essence
    // group, so the frame shows the requirement rail rather than the legacy rows. The smoke's
    // counterpart escapes the migration only because it is authored through `createRecipe` after
    // initialize; reproducing that needs a post-init authoring hook in `world/labWorld.js`.
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-essence-ingredient',
    label: 'Player app — Crafting essence ingredient',
    app: PLAYER,
    smokeLabels: ['player-crafting-essence-ingredient'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-emberbrand"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-essence-shopping',
    label: 'Player app — Crafting essence shopping',
    app: PLAYER,
    smokeLabels: ['player-crafting-essence-shopping'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-slot-rail',
    label: 'Player app — Crafting slot rail',
    app: PLAYER,
    smokeLabels: ['player-crafting-slot-rail'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-pattern-blade"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-tag-unmatched',
    label: 'Player app — Crafting tag unmatched',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-essence-pool',
    label: 'Player app — Crafting essence pool',
    app: PLAYER,
    smokeLabels: ['player-crafting-essence-pool'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-pick-for-me',
    label: 'Player app — Crafting pick for me',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-essence-pool-shared',
    label: 'Player app — Crafting essence pool shared',
    app: PLAYER,
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
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-consumption-plan',
    label: 'Player app — Crafting consumption plan',
    app: PLAYER,
    smokeLabels: ['player-crafting-consumption-plan'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-shield"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-multistep',
    label: 'Player app — Crafting multistep',
    app: PLAYER,
    smokeLabels: ['player-crafting-multistep'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-pattern-blade"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-progressive',
    label: 'Player app — Crafting progressive',
    app: PLAYER,
    smokeLabels: ['player-crafting-progressive'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-progressive-reordered',
    label: 'Player app — Crafting progressive reordered',
    app: PLAYER,
    smokeLabels: ['player-crafting-progressive-reordered'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-progressive-fixed',
    label: 'Player app — Crafting progressive fixed',
    app: PLAYER,
    smokeLabels: ['player-crafting-progressive-fixed'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-progressive-stacked',
    label: 'Player app — Crafting progressive stacked',
    app: PLAYER,
    smokeLabels: ['player-crafting-progressive-stacked'],
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1024, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'responsive', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-crafting-stacked',
    label: 'Player app — Crafting stacked',
    app: PLAYER,
    smokeLabels: ['player-crafting-stacked'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1024, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'responsive', 'window-only'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  },
  {
    id: 'player-alchemy-chooser',
    label: 'Player app — Alchemy chooser',
    app: PLAYER,
    smokeLabels: ['player-alchemy-chooser'],
    reaches: 'window',
    query: { tab: 'alchemy' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'alchemy', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  },
  {
    id: 'player-alchemy-workbench',
    label: 'Player app — Alchemy workbench',
    app: PLAYER,
    smokeLabels: ['player-alchemy-workbench'],
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'alchemy'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  },
  {
    id: 'player-alchemy-stacked',
    label: 'Player app — Alchemy stacked',
    app: PLAYER,
    smokeLabels: ['player-alchemy-stacked'],
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [],
    position: { width: 1024, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'alchemy', 'responsive', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  },
  {
    id: 'fabricate-journal',
    label: 'Player app — Journal',
    app: PLAYER,
    smokeLabels: ['fabricate-journal'],
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'journal'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/journal\//, /^src\/ui\/svelte\/stores\/journalStore/],
  },
  {
    id: 'fabricate-journal-craft-detail',
    label: 'Player app — Journal craft detail',
    app: PLAYER,
    smokeLabels: ['fabricate-journal-craft-detail'],
    reaches: 'window',
    query: { tab: 'journal' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'journal', 'window-only'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/journal\//, /^src\/ui\/svelte\/stores\/journalStore/],
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // Coverage matrix — states the live smoke does NOT photograph.
  //
  // Everything above mirrors a smoke frame, which makes the smoke the ceiling on coverage. It is
  // not a complete one: the smoke walks one system per screen, so whole rendering paths — the two
  // routed resolution modes, two of the three visibility modes, Foundry's light theme — never
  // appear in any frame it produces. These cases carry `reaches: 'beyond'` and no `smokeLabels`,
  // which is the registry's way of saying "no smoke counterpart exists to compare against".
  // ───────────────────────────────────────────────────────────────────────────────────────────────

  {
    id: 'coverage-mode-routed-ingredients-results',
    label: 'Coverage — routedByIngredients results',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
    ],
  },
  {
    id: 'coverage-mode-routed-check-results',
    label: 'Coverage — routedByCheck results',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
    ],
  },
  {
    id: 'coverage-mode-routed-check-checks',
    label: 'Coverage — routedByCheck outcome tiers',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    steps: ['Checks', { selector: '#checks-tab-crafting' }],
    expectView: 'checks',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'checks', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//],
  },

  // Player recipe detail, one per resolution mode. Each mode draws a DIFFERENT body — the routed
  // ones a route rail, progressive a stage rail, simple a plain ingredient list — so the four
  // frames together are the only side-by-side evidence that a change to one did not move another.
  {
    id: 'coverage-mode-simple-detail',
    label: 'Coverage — simple recipe detail',
    app: PLAYER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  // KNOWN GAP — no `coverage-mode-progressive-detail`. The only progressive system in the fixture
  // is `lab-herbalism`, which is knowledge-gated on purpose (that is what makes the Books & Scrolls
  // and Knowledge rails exist at all), so a player who has learned nothing sees none of its recipes
  // and there is no row to click. Closing this properly means either granting the lab player
  // knowledge — which changes the recipe list in EVERY existing player frame — or adding a sixth,
  // progressive-and-global system. Both are larger than the frame is worth right now; the
  // progressive AUTHORING path is covered by `manager-recipe-edit-results-progressive`.
  {
    id: 'coverage-mode-routed-ingredients-detail',
    label: 'Coverage — routedByIngredients recipe detail',
    app: PLAYER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    // Brenna holds the silver billet and not the gold one, so this frame shows one route satisfied
    // and one short — which is the only way a routed body's routing is visible at all.
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  {
    id: 'coverage-mode-routed-check-detail',
    label: 'Coverage — routedByCheck recipe detail',
    app: PLAYER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' }],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },

  // Visibility mode changes which rails EXIST, not merely what they contain — a restricted system
  // has an Access rail, a knowledge-gated one has Books & Scrolls and Knowledge, a global one has
  // neither. The smoke walks a single system, so two of the three were never photographed.
  {
    id: 'coverage-visibility-global',
    label: 'Coverage — global visibility system',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  },
  {
    id: 'coverage-visibility-knowledge',
    label: 'Coverage — knowledge-gated system',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  },
  {
    id: 'coverage-visibility-restricted',
    label: 'Coverage — restricted system',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-alchemy' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  },

  // Foundry's LIGHT application theme. Everything else in this registry renders `theme-dark`,
  // because that is what the smoke world is configured for — but a GM is free to run light, and
  // `styles/fabricate.css` sets no heading colour of its own, so headings inherit Foundry's
  // `--color-text-primary`: rgb(17,17,17) under light, on Fabricate's own dark panels. These two
  // frames are the evidence for that, and the regression guard once it is fixed.
  {
    id: 'coverage-theme-light-player',
    label: 'Coverage — player app on Foundry light theme',
    app: PLAYER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', colorScheme: 'light' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  },
  {
    id: 'coverage-theme-light-manager',
    label: 'Coverage — manager on Foundry light theme',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { colorScheme: 'light' },
    steps: [],
    expectView: 'systems',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'systems', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  },

  // Feature toggles that remove UI. `multiStepRecipes: false` (the jewellers) drops the step rail
  // and the Multi-step chip from the recipe editor; `experimental: '0'` drops the Graph rail entry.
  // Both were only ever photographed in their ON state on the player side.
  {
    id: 'coverage-multistep-off-recipe-editor',
    label: 'Coverage — multi-step disabled recipe editor',
    app: MANAGER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    position: { width: 1280, height: 820 },
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes', 'settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/recipe\//],
  },
  {
    id: 'coverage-experimental-off-player',
    label: 'Coverage — player app with experimental off',
    app: PLAYER,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', experimental: '0' },
    steps: [],
    position: { width: 1280, height: 860 },
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting', 'settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
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

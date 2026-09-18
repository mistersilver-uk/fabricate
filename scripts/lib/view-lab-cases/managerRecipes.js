/**
 * System scope: the recipe browser, its bulk sets, books and scrolls, and the recipe item editor.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  BULK_DELETE_CARD_PATTERN,
  RECIPE_BULK_EDIT_MATCHES,
} from './caseConstants.js';
import { chooseSelectOption, managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
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
]);

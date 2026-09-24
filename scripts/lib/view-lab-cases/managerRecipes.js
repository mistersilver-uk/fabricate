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
      /^src\/ui\/model\/(?:recipe|entity)BrowserModel\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/(checksRouteModel\.svelte|checkDraftClone)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-recipes-blocked-enable-flash',
    label: 'Manager — Recipes blocked-enable flash',
    // The flash, which no case reached (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `sm-r-runeplate-draft` is the lab's one off-and-un-enableable recipe, so its switch refuses rather than writes.
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
    // The alert and its dismiss control, because the flash is specified as dismissible and non-auto-hiding.
    expectSelector:
      '.fabricate-manager .fab-notice[data-recipe-flash][role="alert"]' +
      ':has(.fab-notice-title)' +
      ' [data-notice-dismiss]',
    // The refusal is logged, and the log is the state working (issue 1515, driver capture).
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
    id: 'manager-recipes-inspector-empty-step',
    label: 'Manager — Recipes inspector on an empty intermediate step',
    // Issue 1907: the pager opens on `sm-r-pattern-blade` step 1, whose result group is authored
    // empty. The note is the neutral muted one, not the danger panel the terminal step keeps.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing' },
    steps: [
      'Crafting',
      // The row `<li>` is a container: `onSelectRecipe` is bound to the nested identity BUTTON, so
      // clicking the wrapper leaves the inspector on its fallback recipe and renders no pager.
      {
        selector:
          '.manager-recipe-row[data-recipe-id="sm-r-pattern-blade"] .manager-recipe-identity',
      },
      { selector: '[data-recipe-step-pager]', scroll: true },
    ],
    expectView: 'recipes',
    expectSelector:
      '.fabricate-manager [data-recipe-produces-empty].manager-muted:not(.manager-recipe-flow-empty)',
    // The note has to be IN the picture, not merely in the DOM. The inspector is a scrolling rail
    // BESIDE `.manager-main`, not inside it, so it is the container both pins are taken against.
    expectContained: [
      { container: '[data-recipe-inspector]', target: '[data-recipe-step-pager]' },
      { container: '[data-recipe-inspector]', target: '[data-recipe-produces-empty]' },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/recipes?\//,
    ],
  }),
  // The inspector's ingredient-set list (issue 1510), at a 1024 window: the inspector restacks
  // under the list there, so the trigger fills a column far past the `inline` rung's 240px panel
  // ceiling and the frame shows the panel spanning the manager's overlay inset under the call
  // site's raised cap.
  managerCase({
    id: 'manager-recipes-inspector-route-list',
    label: 'Manager — Recipes inspector ingredient-set list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-jewelry' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Crafting',
      { selector: '.manager-recipe-row[data-recipe-id="jw-r-cast"] .manager-recipe-identity' },
      { selector: '[data-recipe-route="ingredient-set"]' },
    ],
    expectView: 'recipes',
    // Two claims a closed frame cannot make: the panel exists and it is the ticked route list.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option="jw-set-gold"] .fabricate-select-label',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    position: { width: 1024, height: 720 },
    kinds: ['manager', 'recipes', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipes\/RecipeBrowserInspector\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
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
    // The row's `No check` pill is a system-level fact: any non-`routedByIngredients` system with no roll formula reports it.
    reaches: 'exact',
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-check-roll-formula]', fill: '' },
      // The Checks view is a staged editor: typing only marks the draft dirty, and the check pills read the persisted system.
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
    // Page two of a grouped list: ordering is category-major before pagination, so a large category continues across it.
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
      /^src\/ui\/model\/(?:recipe|entity)BrowserModel\.js$/,
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
      // Karrun Forgecraft is the only lab system authoring check tiers, so this is the world's only populated select.
      ...chooseSelectOption('[data-recipe-bulk-check-tier]', 'sm-tier-masterwork'),
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-book"]' },
      { selector: '[data-recipe-bulk-book-add]' },
      { selector: '.fab-bulk-book-trigger' },
      { selector: '[data-popover-option="sm-almanac"]' },
      { selector: '[data-recipe-bulk-book-remove]' },
    ],
    expectView: 'recipes',
    // Both staged states must be on screen at once, or staging one book at a time reads the same as showing one.
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
    // The blocked face: the panel's warning Callout counting the same rows the browser has pilled, in one photograph.
    reaches: 'exact',
    query: {},
    // Order is load-bearing and `expectSelector` cannot enforce it: the row ticked last is the one scrolled to.
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-runeplate-draft"])' },
      { selector: '[data-recipe-bulk-status-option="enable"]' },
    ],
    expectView: 'recipes',
    // Both halves in one selector: a Callout with no pilled row, or a pilled row with no Callout, each publishes a lie.
    expectSelector:
      '.fabricate-manager:has([data-recipe-bulk-blocked-warning]) ' +
      '.manager-recipe-row[data-recipe-id="sm-r-runeplate-draft"]:has(.manager-chip.is-danger)',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  // The staged case picks, presses and repeats; the pick clears on staging, so that frame shows the staged list.
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
    // Three claims the trigger-only frame fails: the popover exists, it is portaled, and its rows carry the second meta line.
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
    // The Folio card holds neither selected recipe, so `Add 2` is live and `Remove` is dead with its count dropped.
    expectSelector:
      '.fabricate-manager [data-recipe-bulk-book-pick="sm-book"]' +
      ':has([data-recipe-bulk-book-add]:not([disabled]))' +
      ':has([data-recipe-bulk-book-remove][disabled])',
    kinds: ['manager', 'recipes'],
    sourceMatches: RECIPE_BULK_EDIT_MATCHES,
  }),
  // The third surface this panel cannot hold, and the first frame in the registry drawing a `<Select>`'s option list.
  managerCase({
    id: 'manager-recipes-bulk-edit-check-tier',
    label: 'Manager — Recipes bulk edit check tier list',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    // The staged case's walk stopped one step in: the check-tier trigger and no row click, so the list is still open.
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="sm-r-longsword"])' },
      { selector: 'label:has(input[data-recipe-select="sm-r-greatsword"])' },
      { selector: '[data-recipe-bulk-check-tier]' },
    ],
    expectView: 'recipes',
    // Four claims the trigger-only frame fails: the panel exists, it is portaled, it is ticked, and the row carries a tick.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="sm-tier-masterwork"]:has(.fabricate-select-tick)',
    // A group heading and a per-option hint, each asserted inside the panel's own box rather than clipped by it.
    expectContained: [
      { container: '.fabricate-manager', target: '.fabricate-select-popover' },
      { container: '.fabricate-select-popover', target: '.manager-travel-popover-group-label' },
      { container: '.fabricate-select-popover', target: '.fabricate-select-hint' },
    ],
    kinds: ['manager', 'recipes'],
    // Spread rather than the shared array: this and the picker frame are the two bulk-edit frames resting on an open panel.
    sourceMatches: [...RECIPE_BULK_EDIT_MATCHES, ...ANCHORED_POPOVER_SOURCES],
  }),
  // Both frames run on herbalism rather than the flagship smithing library, which is why they say anything.
  managerCase({
    id: 'manager-recipes-bulk-delete-idle',
    label: 'Manager — Recipes bulk delete idle',
    smokeLabels: [],
    reaches: 'beyond',
    // The unarmed face: the impact statement and the standing permanence hint, before the control is armed.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: 'label:has(input[data-recipe-select="hb-r-healing"])' },
      { selector: 'label:has(input[data-recipe-select="hb-r-salve"])' },
      { selector: 'label:has(input[data-recipe-select="hb-r-oil"])' },
      { selector: '[data-recipe-bulk-delete-card]', scroll: true },
    ],
    expectView: 'recipes',
    // Unarmed is the state under test, and `data-armed="false"` is what separates this frame from its armed twin.
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
      // The button, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it arms.
      { selector: '[data-arm-token="delete-recipes"]' },
    ],
    expectView: 'recipes',
    // Armed is a state; a frame re-photographing the idle button would be indistinguishable from the case above.
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
    // The rail's Crafting group expanded to all four subitems over a multi-category recipe library.
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
      // The toolbar's three filter vocabularies (issue 1510), whose closed faces this frame draws.
      /^src\/ui\/svelte\/apps\/manager\/booksScrollsSelectOptions\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
      // The inspector aside this route mounts (issue 1505).
      /^src\/ui\/svelte\/apps\/manager\/ItemPageInspector\.svelte$/,
      // The manager router and the Crafting entry model (issue 1151).
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
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
    // The grid with its accented tile, not the aside root, and `tone="info"` is that tone's one reach in the tree.
    expectSelector: '[data-item-page-stats] [data-stat-tone="info"]',
    kinds: ['manager', 'books-scrolls'],
    // The inspector only.
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/ItemPageInspector\.svelte$/],
  }),
  // The browse toolbars' first open-panel frame (issue 1510), and the tightest panel of the commit
  // that converted them: `Limited learning` is 84px of the 128px an unticked row leaves once the
  // panel resolves to the `toolbar` band's own floor. This filter's caption is also the only
  // conditional one in the phase — `Uses` in item visibility mode, `Learning` in knowledge — so the
  // frame reads the name the trigger takes from it rather than from an `aria-label` of its own.
  managerCase({
    id: 'manager-books-scrolls-cap-filter-list',
    label: 'Manager — Books scrolls cap filter list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-books-scrolls' },
      { selector: '[data-books-scrolls-cap-filter]' },
    ],
    expectView: 'books-scrolls',
    // Three claims a closed frame cannot make: the panel exists, it is the UNTICKED list this
    // filter asks for, and it draws the limits row in the mode's own words.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover:not(.fabricate-select-popover-ticked)' +
      ' [data-popover-option="limited"] .fabricate-select-label',
    // The panel sits inside the application root rather than clipped by the toolbar it opened from.
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    kinds: ['manager', 'books-scrolls'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/booksScrollsSelectOptions\.js$/,
      ...ANCHORED_POPOVER_SOURCES,
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
    // The panel, not the tab button: a strip keeping its buttons while the panel stopped rendering passes otherwise.
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
    // The panel and the populated list inside it: the list is what says the fixture's membership reached the screen.
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
    // The panel, its search row and a row in it: the panel alone would pass over an empty list.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover.manager-travel-popover' +
      ':has(.manager-travel-popover-search)' +
      ' .manager-travel-popover-options .manager-travel-option',
    kinds: ['manager', 'books-scrolls'],
    // `...ANCHORED_POPOVER_SOURCES` because this frame rests on an open panel the shared seam clamped and portaled.
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
    // The same tab blocking: a different summary card, a different count split and a Block pill on the offending row.
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
    // The sixth converted select's only frame (issue 1511), and it is a manager case by measurement rather than choice.
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
    // `apps/inventory/detail/` is named here because this is the only case rendering an inventory detail body in the manager.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\//,
      /^src\/ui\/svelte\/apps\/inventory\/detail\//,
      /^src\/ui\/svelte\/util\/recipeItemPreviewRow\.js$/,
    ],
  }),
]);

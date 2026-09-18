/**
 * World scope: the tool catalogue's list, its paging, its bulk set and its filter states.
 */

import { WORLD_TOOL_SEARCH_MISS_TERM, WORLD_TOOL_SEARCH_TERM } from './caseConstants.js';
import { chooseSelectOption, managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
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
]);

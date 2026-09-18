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
      // The zone, inside the list: rendered anywhere it satisfies `expectSelector`, so the scope is the claim.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-item-drop-zone="tool-create"]',
      },
      // And the breakage card still spanning the column above it, which the zone's move is what allows.
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
    // `Tools Catalogue` is plural where its siblings are singular, and `Tools` is a live substring of it.
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
      // The fact run, where a Tool row's badges live since issue 1373: the chips render inside the identity column.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-row-facts]',
      },
      // And the foot pager, which eleven rows now have (issue 1373, maintainer feedback round 2).
      {
        container: '.manager-scoped-list-column',
        target: '[data-pagination-page]',
      },
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inherit-count="breakage"]',
      },
      // The fifth inspector card is gone, and nothing replaces it here.
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The placeholder claim is gone, and dropping it is not optional bookkeeping.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      // `MembershipActions` is no longer claimed here, and no case replaces it (issue 1373).
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
      // The row only page two has: present anywhere it satisfies a bare selector, so this says the walk landed.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-row="lab-tool-unlinked"] [data-scoped-list-source]',
      },
      // And the bar itself, inside the list column: the roster panel beside it carries a pager of its own.
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
      // The page window itself, restated on the lifted view-state so a change there cannot publish another screen.
      /^src\/ui\/model\/managerBrowserViewState\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-catalogue-bulk',
    label: 'Manager — World Tools Catalogue, bulk edit',
    reaches: 'beyond',
    smokeLabels: [],
    // The state that shipped broken and that no case could see (issue 1373).
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
      // The staged axis and the Apply that names the blast radius, both inside the panel's own dock.
      {
        container: '[data-world-tool-bulk-panel]',
        target: '[data-world-tool-bulk-status]',
      },
      {
        container: '[data-world-tool-bulk-panel]',
        target: '[data-world-tool-bulk-apply]',
      },
      // And the toolbar's own count, in the same frame.
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
    // The empty catalogue, which the fixture could not produce (issue 1373).
    query: { noTools: '1' },
    steps: [{ selector: '#manager-world-nav-tool-catalogue' }],
    expectView: 'world-tools',
    expectSelector: '[data-scoped-list-state="empty"]',
    expectContained: [
      // The hero, under the zone and inside the list.
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-item-drop-zone="tool-create"]',
      },
      {
        container: '[data-scoped-list="world-tools"]',
        target: '[data-scoped-list-state="empty"]',
      },
      // And the inspector's own no-state, inside the column that owns it.
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inspector-state="resting"]',
      },
      // The scope band survives an empty corpus and stays confined to the list column, not the inspector's track.
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
      // `EmptyState.svelte` and `ItemDropZone.svelte` were claimed here and are not anymore.
    ],
  }),
  // Until these four cases existed the registry contained no step naming any `data-scoped-list-*` control.
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
    // Filtered to nothing is not an absence: `EmptyState` at `filtered` offers `Clear filters`, not a creation prompt.
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
    // `systems` is one of this frame's own sort keys, so the direction composes with it and the toggle is live.
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
    // `aria-pressed` still follows `asc`: inert, not hidden — the control keeps saying which way the order runs.
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
      // The lane descriptor itself: `worldToolSorts` is the only `sorts` array here, and it is what makes the toggle inert.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
]);

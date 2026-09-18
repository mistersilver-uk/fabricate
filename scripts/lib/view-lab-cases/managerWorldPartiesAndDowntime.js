/**
 * World scope: travel, the parties route and the Downtime rollup, including the companion surfaces.
 */

import { ANCHORED_POPOVER_SOURCES, WORLD_PARTIES_SEARCH_TERM } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|EnvironmentsBrowserView|GatheringPartiesTab|EmptyState)\.svelte$/,
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
]);

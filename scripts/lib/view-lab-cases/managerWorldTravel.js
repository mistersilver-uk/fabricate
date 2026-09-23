/**
 * World scope: travel realms and maps, gathering settings and economy, and environment validation.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  ENVIRONMENT_DIR_EXCEPT_VALIDATION_TAB,
} from './caseConstants.js';
import { chooseSelectOption, managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringRealmsTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      // Issue 1707 moved this column's markup out of the root; `world/` has no directory regex,
      // so each travel case claims the leaf by name or it stops being photographed.
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-realm-open',
    label: 'Manager — World Travel realm row open',
    // A new case, `manager-world-travel-realms-normal` left as it was: that panel auto-selects its
    // first realm, so only this one activates a repaired header from the keyboard (issue 1512).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-realms', press: 'Enter' },
      {
        selector:
          '[data-manager-travel-realm-id="hb-realm-frostmark"] .manager-travel-realms-header',
        press: 'Enter',
      },
    ],
    expectView: 'world-travel',
    expectSelector:
      '.fabricate-manager [data-manager-travel-realm-id="hb-realm-frostmark"]' +
      ':has(.manager-travel-realms-header[aria-expanded="true"][aria-controls])' +
      ' [data-manager-realm-editor]',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringRealmsTab)\.svelte$/,
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringRealmsTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringMapLinksTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringMapLinksTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringMapLinksTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-map-empty',
    label: 'Manager — World Travel Map Region Links on a scene without regions',
    // `beyond`: the smoke's scene always carries a region, so it never reaches this empty state.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-smithing', noSceneRegions: '1' },
    steps: [
      { selector: '#manager-travel-toggle', press: 'Space' },
      { selector: '#manager-travel-nav-map', press: 'Enter' },
    ],
    expectView: 'world-travel',
    // The no-regions icon, which the no-scene empty state does not draw.
    expectSelector: '[data-travel-panel="map"] [data-travel-map-links-empty] .fa-map-location-dot',
    position: { width: 1330, height: 900 },
    kinds: ['manager', 'environments', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader|GatheringMapLinksTab)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-world-travel-long-label-focus',
    label: 'Manager — World Travel long child label keyboard focus',
    // The smoke uses shipped localization, so the View Lab supplies the long-label stress string and guards it.
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
      /^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|ManagerHeaderActions|ManagerHeaderBreadcrumbs|ManagerHeaderCraftingActions|ManagerHeaderGatheringActions|ManagerPageHeader)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/TravelInspector\.svelte$/,
      // And the rail that renders that leaf, since phase 3 moved it out of the root too.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
      /^styles\/fabricate\.css$/,
    ],
  }),
  managerCase({
    id: 'manager-gathering-settings-normal',
    label: 'Manager — Gathering settings as authored',
    smokeLabels: ['manager-gathering-settings'],
    // `exact`: the smoke reaches this tab by the same two gestures and photographs it without touching a control.
    reaches: 'exact',
    // Deliberately not `manager-gathering-economy-actors`, which reaches the same tab.
    query: { system: 'lab-herbalism' },
    steps: ['Gathering', { selector: '#manager-gathering-nav-settings' }],
    expectView: 'environments',
    // This page starts with its economy limitation controls; the route key alone cannot tell it from the browser.
    expectSelector: '.fabricate-manager [data-economy-mode-card] [data-economy-mode-option]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/GatheringEconomyView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/,
      // The only frame that draws the Gathering Rules rail, which issue 1707 moved out of the
      // root: this is the case that has to fire when its ten selects change.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringRulesInspector\.svelte$/,
      // And the rail that picks that arm, which phase 3 moved out of the root. On a maintainer
      // ruling this frame now asks for one when the chain changes, since it is the only case that
      // photographs the settings arm at all.
      /^src\/ui\/svelte\/apps\/manager\/environment\/GatheringInspectorRail\.svelte$/,
    ],
  }),
  // The conditions card's current-value list (issue 1510), pinned at a 1024 window: the settings
  // grid restacks to one column there, so the trigger fills the card far past the `form` rung's
  // 340px panel ceiling and the frame shows the panel matching the trigger's width under the call
  // site's raised cap. At the default 1280 the trigger sits under the ceiling and proves nothing.
  managerCase({
    id: 'manager-gathering-condition-current-list',
    label: 'Manager — Gathering condition current weather list',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      'Gathering',
      { selector: '#manager-gathering-nav-settings' },
      {
        selector:
          '[data-gathering-condition-panel="weather"] .manager-condition-current .fabricate-select-trigger',
      },
    ],
    expectView: 'environments',
    // Two claims a closed frame cannot make: the panel exists and it is the ticked weather list.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover.fabricate-select-popover-ticked' +
      ' [data-popover-option="rain"] .fabricate-select-label',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    position: { width: 1024, height: 720 },
    kinds: ['manager', 'environments', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-gathering-economy-actors',
    label: 'Manager — Gathering economy actor stamina pools',
    // `beyond`: the smoke never walks the Gathering Settings tab, so there is no counterpart to fall short of.
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
    // No pattern for `components/Stepper.svelte`: it is a broad signal, so no case's `sourceMatches` ever sees it.
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
    // `CompositionList`'s weight field renders only under `showBlindWeights`, and no other case reached it.
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
    id: 'manager-environment-edit-blind-weights-narrow',
    label: 'Manager — Environment edit blind task weights at the declared floor',
    // The composition list's AFTER frame (issue 1512): the column strip's lead track is the shared
    // list's own cluster, so every label has to sit over the column it names at the narrow
    // container as well as at the default one.
    reaches: 'beyond',
    smokeLabels: [],
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
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row[data-record-id] .manager-environment-comp-cells',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'environments', 'responsive'],
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
    // Issue 1315 moved Force add to automatic mode's Non-matching section, which no case reached.
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
    // Beyond, with an empty label array: `screenshotCaptureMap.js` carries no routine for this tab.
    reaches: 'beyond',
    smokeLabels: [],
    // The first frame of this tab, registered before the re-skin (issue 1517) so the conversion has a before.
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
    // The route survives a tab click that did nothing; every other environment editor case opens a different tab.
    expectSelector: '[data-environment-tab="validation"]',
    kinds: ['manager', 'environments'],
    sourceMatches: [
      // The tab itself, which no other case can now claim.
      /^src\/ui\/svelte\/apps\/manager\/environment\/EnvironmentValidationTab\.svelte$/,
      // Its producer: the same evaluator feeds the tab strip's badge counts, and this frame draws its verdict and rows.
      /^src\/ui\/svelte\/apps\/manager\/environment\/environmentReadiness\.js$/,
      // The host: it owns the tab panel wrapper and `is-inspector-hidden`, which only this tab reaches.
      /^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/,
    ],
  }),
]);

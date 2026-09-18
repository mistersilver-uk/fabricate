/**
 * The three GM canvas windows: the interactable browser, the config sheet and the interactables manager.
 */

import { ANCHORED_POPOVER_SOURCES } from './caseConstants.js';
import {
  browserCase,
  chooseSelectOption,
  configCase,
  interactablesManagerCase,
} from './caseFactories.js';

export const CASES = Object.freeze([
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

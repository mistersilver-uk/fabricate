/**
 * The Manager shell, the crafting-system browser and the system editor.
 */

import { ANCHORED_POPOVER_SOURCES } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-recipes-editor-roundtrip',
    label: 'Manager — Recipes editor roundtrip',
    smokeLabels: ['manager-recipes-editor-roundtrip'],
    // The state is what survived a round trip, so every step is load-bearing: filter to a category,
    // select a row into the shared inspector (the collapse below leaves no row to click), collapse
    // the group, open the editor from the inspector, and come back.
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
      // `SystemsBrowserView` alone (issue 1515).
      /^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/,
    ],
  }),
  managerCase({
    // A browse row's overflow menu, open (issue 1515).
    id: 'manager-systems-row-menu-open',
    label: 'Manager — System library row menu open',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      {
        selector:
          '.manager-system-row[data-system-id="lab-smithing"] .manager-icon-button[aria-haspopup="menu"]',
      },
    ],
    expectView: 'systems',
    // The panel's own accessible name is the assertion, not merely the panel.
    expectSelector:
      '.fabricate-manager .fabricate-action-menu-panel[role="menu"][aria-label^="System actions for"]',
    kinds: ['manager', 'systems'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/],
  }),
  managerCase({
    id: 'manager-systems-empty',
    label: 'Manager — System library empty',
    // `beyond`: the live smoke seeds a crafting system before it opens the manager at all, so no
    // smoke frame shows the library with nothing in it and there is no counterpart to fall short
    // of.
    reaches: 'beyond',
    smokeLabels: [],
    // No new lab input, and that is the finding rather than a shortcut.
    query: { clearSystem: '1' },
    steps: [],
    expectView: 'systems',
    // Both halves of what this frame is named for, in one assertion.
    expectSelector:
      '.fabricate-manager:has(.manager-table-scroll .manager-empty:not([data-systems-loading]))' +
      ' .manager-setup-card',
    kinds: ['manager', 'systems'],
    // Deliberately no pattern for `manager/EmptyState.svelte`, for the reason
    // `manager-gathering-economy-actors` records about `Stepper`: `EmptyState` is in
    // `MANAGER_PRIMITIVES`, so `BROAD_SIGNAL_PATTERN` matches it and `selectRenderFileCases`
    // `continue`s on a broad-signal file before consulting any case's `sourceMatches` — such an
    // entry would be unreachable.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-selected-normal',
    label: 'Manager — Selected normal',
    smokeLabels: ['manager-selected-normal'],
    // Reached the way the smoke reaches it: by CLICKING the system row's identity, which is what
    // `selectSmokeSystemInManager` does. This exact line is pinned by `tests/view-lab-cases.test.js`
    // as the comment-only registry change that must select one frame.
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
    // The smoke's counterpart is the expanded baseline it establishes before collapsing: it enters
    // the system scope, collapses the rail if it is not already expanded, and photographs that.
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
    // Clicks the row, exactly as its normal-width twin does.
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
      // `ResolutionModeCard` left this alternation at issue 1509, which deleted the file: the
      // shim's four call sites render `RadioCardGroup` directly now.
      /^src\/ui\/svelte\/apps\/manager\/(CraftingEffectPanel|ItemPageInspector)\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-system-edit-validation',
    label: 'Manager — System edit validation tab',
    // The validation tab, which had no frame at all (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `lab-smithing` stated rather than inherited from the seeded default, because the frame's
    // whole content is that system's validation report: `sm-r-runeplate-draft` contributes a
    // critical `noResultGroup` and a `disabledIncomplete` warning, and `sm-r-deepbind` a
    // `requirementOverlap` warning.
    query: { system: 'lab-smithing' },
    steps: ['System Overview', { selector: '#system-tab-validation' }],
    expectView: 'system-edit',
    // Three claims in one selector, because each alone publishes something this case is not.
    expectSelector:
      '.fabricate-manager [data-system-overview]:has([data-system-overview-counts])' +
      ' [data-system-overview-group="recipe"] .manager-system-overview-row',
    kinds: ['manager', 'system-edit'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/SystemOverviewView\.svelte$/,
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
    label: 'Manager — World Modifiers list ergonomics',
    smokeLabels: ['manager-system-edit-lists'],
    // The settings-list ergonomics card, with one modifier open and its IconPicker down.
    reaches: 'exact',
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
      { selector: '[data-world-modifier] [data-toggle-modifier]' },
      { selector: '[data-world-modifier] .essence-icon-picker-trigger' },
      // Anchored on the card's title, not the card.
      { selector: '[data-world-modifiers] .manager-card-title', scroll: true },
    ],
    expectView: 'world-modifiers',
    // The one authoring surface (issue 1117), asserted on the fields it absorbed from the retired
    // Checks-tab editor rather than only on the section it already had: the open row's `min`
    // Stepper is what proves the check-only bounds pair reached this card, and it is the only frame
    // in the registry that can show it now that no Checks route authors an entry.
    expectSelector:
      '.fabricate-manager [data-world-modifiers]' +
      ':has([data-world-modifier-bounds] [data-world-modifier-field="min"])',
    position: { width: 1280, height: 980 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/world\/WorldModifiersTab\.svelte$/,
      // The expression field this screen is now the only caller of (issue 1373).
      /^src\/ui\/svelte\/apps\/manager\/RollDataExpressionInput\.svelte$/,
      // The icon vocabulary the shared picker lists (issue 1269).
      /^src\/ui\/svelte\/util\/(?:essenceIcons|foundryIconVocabulary|foundryIconCatalogue)\.(?:js|json)$/,
      // The positioning seam the open picker's panel is placed by (issue 1500).
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-system-edit-modifier-rolls',
    label: 'Manager — World Modifiers rolling entry',
    // BEYOND the smoke: the walk opens no modifier entry at all, and `manager-system-edit-lists`
    // opens the FIRST one, which is flat. Nothing anywhere framed a rolling entry.
    reaches: 'beyond',
    smokeLabels: [],
    // The state issue 1118 creates.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
      { selector: '[data-world-modifier="hb-mod-luck"] [data-toggle-modifier]' },
      { selector: '[data-world-modifier="hb-mod-luck"]', scroll: true },
    ],
    expectView: 'world-modifiers',
    // The roll NOTE keyed to this entry is the assertion, because it is the element the retired
    // rule's copy occupied and the only one that cannot render if the note is dropped.
    expectSelector:
      '.fabricate-manager [data-world-modifiers]' +
      ':has([data-world-modifier-roll-note="hb-mod-luck"])',
    position: { width: 1280, height: 980 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldModifiersTab\.svelte$/],
  }),
]);

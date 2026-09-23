/**
 * System scope: the essence browser, its bulk sets and the essence editor.
 */

import { ANCHORED_POPOVER_SOURCES, BULK_DELETE_CARD_PATTERN } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  // Every case below carries the same `sourceMatches` set (issue 1372).
  managerCase({
    id: 'manager-essences-normal',
    label: 'Manager — Essences normal',
    smokeLabels: ['manager-essences-normal'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-essence-rules' }],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The `SYSTEM RULES n / m` panel, composed from the world catalogue's own component (issue 1372).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/SystemRulesRoster\.svelte$/,
      // The shared studio-library shelf — scroll section, empty states, list-or-grid `<ul>`, pager — is on every browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/(?:entityBrowserModel|essenceBrowserModel|essenceBulkEditModel|essenceValidation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-stacked',
    label: 'Manager — Essences stacked',
    smokeLabels: ['manager-essences-stacked'],
    // Repointed, not duplicated (issue 1036).
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-essence-rules' }],
    expectView: 'essences',
    position: { width: 1000, height: 700 },
    kinds: ['manager', 'essences', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library shelf — scroll section, empty states, list-or-grid `<ul>`, pager — is on every browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/(?:entityBrowserModel|essenceBrowserModel|essenceBulkEditModel|essenceValidation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-disabled-in-use',
    label: 'Manager — Essences disabled and in use',
    // Beyond the smoke: no smoke step selects a specific essence row, so there is no inspector counterpart.
    reaches: 'beyond',
    smokeLabels: [],
    // The state this feature exists to add: an essence disabled while components carry it and a recipe requires it.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-essence-identity' },
    ],
    expectView: 'essences',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library shelf — scroll section, empty states, list-or-grid `<ul>`, pager — is on every browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/(?:entityBrowserModel|essenceBrowserModel|essenceBulkEditModel|essenceValidation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-source-picker',
    label: 'Manager — Essences source picker open',
    // Beyond the smoke: the walk selects no essence row, so there is no counterpart frame.
    reaches: 'beyond',
    smokeLabels: [],
    // The other picker this epic re-platformed, and the one that had no frame at all (issue 1503).
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="mote"] .manager-essence-identity' },
      { selector: '.essence-source-trigger' },
    ],
    expectView: 'essences',
    // Named on the panel's own class pair, which `popoverClass` rides onto the node the primitive portals.
    expectSelector: '.essence-source-picker-popover',
    // The panel is portaled to the manager root, so containment against the inspector column would be a false claim.
    expectContained: [
      { container: '.fabricate-manager', target: '.essence-source-picker-popover' },
    ],
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // Deliberately no pattern for the two components that draw this frame's subject.
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-essences-grid',
    label: 'Manager — Essences grid',
    // Beyond the smoke: the presentation toggle is new, so nothing in the walk presses it.
    reaches: 'beyond',
    smokeLabels: [],
    // The grid carries the list's state vocabulary, because a presentation toggle must not silently remove state.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-view-option="grid"]' },
    ],
    expectView: 'essences',
    // A click that lands without switching presentation would photograph the list under the grid case's name.
    expectSelector: '.fabricate-manager .manager-essences-table[data-essence-view="grid"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library shelf — scroll section, empty states, list-or-grid `<ul>`, pager — is on every browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      // The card is claimed here alone: this is the one frame that renders a grid of them.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/(?:entityBrowserModel|essenceBrowserModel|essenceBulkEditModel|essenceValidation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-bulk-edit',
    label: 'Manager — Essences bulk edit',
    reaches: 'beyond',
    smokeLabels: [],
    // An active bulk selection, so the rail shows the bulk panel rather than the inspector.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-select="mote"]' },
      { selector: '[data-essence-select="aether"]' },
    ],
    expectView: 'essences',
    // The frame must show the live action, not the inert one.
    expectSelector:
      '.fabricate-manager [data-essence-bulk-delete-card] .manager-button.is-danger:not([disabled])',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/(?:entityBrowserModel|essenceBrowserModel|essenceBulkEditModel|essenceValidation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-bulk-delete-armed',
    label: 'Manager — Essences bulk delete armed',
    reaches: 'beyond',
    smokeLabels: [],
    // The armed half of the maintainer's binding decision, which no case photographed.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-select="mote"]' },
      { selector: '[data-essence-select="aether"]' },
      // The button, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it arms.
      { selector: '[data-arm-token="delete-essences"]' },
    ],
    expectView: 'essences',
    // Armed is a state; a frame re-photographing the idle button would be indistinguishable from the case above.
    expectSelector: '.fabricate-manager [data-arm-token="delete-essences"][data-armed="true"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/(?:entityBrowserModel|essenceBrowserModel|essenceBulkEditModel|essenceValidation)\.js$/,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-first-state',
    label: 'Manager — Essence edit first state',
    smokeLabels: ['manager-essence-edit-first-state'],
    // The smoke opens an essence row's Edit action and photographs the editor as it arrives, and this lands there.
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles come from this pure helper, and the rail renders on every editor tab (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: inherit switches, membership cluster, pure leaf.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout and the copy-to-systems action.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-on-craft',
    label: 'Manager — Essence edit On craft',
    reaches: 'beyond',
    smokeLabels: [],
    // The two behaviour cards, scrolled into the frame rather than reached by a tab click.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-scoped-copy-rules]', scroll: true },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles come from this pure helper, and the rail renders on every editor tab (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: inherit switches, membership cluster, pure leaf.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout and the copy-to-systems action.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-validation',
    label: 'Manager — Essence edit Validation',
    reaches: 'beyond',
    smokeLabels: [],
    // The only surface that reports an unresolvable property macro: at craft time one is logged and skipped silently.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-essence-tab="validation"]' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      // The shared scoped-entity validation shell (issue 1362), claimed on the two frames that photograph one.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedValidationTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles come from this pure helper, and the rail renders on every editor tab (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: inherit switches, membership cluster, pure leaf.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout and the copy-to-systems action.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),

  // The system-scope essence states issue 1372 adds, and the one it cannot photograph.
  managerCase({
    id: 'manager-essences-membership-all',
    label: 'Manager — Essences all world essences',
    reaches: 'beyond',
    smokeLabels: [],
    // The two-option membership filter with its counts, switched to `All world essences`.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      // The membership filter is a `SegmentedControl` (issue 1372), driven by clicking its option rather than `selectOption`.
      { selector: '[data-essence-membership-option="all"]' },
    ],
    expectView: 'essences',
    expectSelector: '[data-essence-membership-filter]',
    // Containment is for controls that must fit: a row in a scrolling column legitimately extends past `.manager-main`.
    expectContained: [{ container: '.manager-main', target: '[data-essence-membership-filter]' }],
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceBrowserView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/EssenceRow\.svelte$/,
    ],
  }),
]);

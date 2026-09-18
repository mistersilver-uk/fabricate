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
      // The `SYSTEM RULES n / m` panel, which the browser inspector composes from the world
      // catalogue's own component (issue 1372).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/SystemRulesRoster\.svelte$/,
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
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
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-disabled-in-use',
    label: 'Manager — Essences disabled and in use',
    // BEYOND the smoke: the smoke walk has no step that selects a specific essence row, so there is
    // no counterpart frame of the inspector to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // The state this whole feature exists to add, and the one the prototype never depicts: an
    // essence that is disabled while components carry it and a recipe requires it.
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
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essences-source-picker',
    label: 'Manager — Essences source picker open',
    // BEYOND the smoke: the walk selects no essence row, so there is no counterpart frame.
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
    // Named on the panel's own class pair, which is what the caller keeps through the re-platform:
    // `fabricate-source-picker-popover essence-source-picker-popover` rides `popoverClass` onto the
    // node the primitive portals.
    expectSelector: '.essence-source-picker-popover',
    // The panel is PORTALED to the manager root (`util/overlayHost.js`), so the container is that
    // root and not the inspector column: it is deliberately outside that scroller, and containment
    // against the column would be a claim about a box it does not sit in.
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
    // BEYOND the smoke: the presentation toggle is new, so nothing in the walk presses it.
    reaches: 'beyond',
    smokeLabels: [],
    // The grid carries the same state vocabulary as the list — the Disabled pill, the capability
    // pills and the recipe count — because a presentation toggle must not silently remove state.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '[data-essence-view-option="grid"]' },
    ],
    expectView: 'essences',
    // A click that lands but does not switch presentation would photograph the LIST under the
    // grid case's name — the "publishes an unrelated frame" failure this registry exists to
    // prevent, and one that would silently un-prove the crop fix above.
    expectSelector: '.fabricate-manager .manager-essences-table[data-essence-view="grid"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // The shared studio-library SHELF — the scroll section, the empty states, the
      // list-or-grid `<ul>` and the pager — is rendered by every essence browser frame.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryShelf\.svelte$/,
      // The CARD is claimed HERE and only here: this is the one frame that renders a grid of
      // them, so a change to `LibraryCard` picks a card as its evidence rather than a list
      // that never shows one.
      /^src\/ui\/svelte\/apps\/manager\/library\/LibraryCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
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
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
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
      // The BUTTON, not the card: `ArmedDangerButton` stamps `data-arm-token` on the control it
      // arms, so this cannot drift onto a wrapper the way a class selector could.
      { selector: '[data-arm-token="delete-essences"]' },
    ],
    expectView: 'essences',
    // Armed is a STATE, and a frame that merely re-photographed the idle button would be
    // indistinguishable from the case above. `ArmedDangerButton` marks the armed control.
    expectSelector: '.fabricate-manager [data-arm-token="delete-essences"][data-armed="true"]',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      /^src\/ui\/svelte\/util\/(?:essenceIcons|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
      BULK_DELETE_CARD_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-first-state',
    label: 'Manager — Essence edit first state',
    smokeLabels: ['manager-essence-edit-first-state'],
    // The smoke opens an essence row's Edit action and photographs the editor as it arrives, and
    // this lands in the same place.
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
      // The rail's two synthetic tiles are built by this pure helper, and the rail renders on
      // every tab (`showIdentity` defaults true; only the browser inspector passes false), so a
      // change to it is visible in all three editor cases (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: the inherit switches, the
      // membership cluster and the pure leaf behind their copy.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout it opens with
      // and the copy-to-other-systems action it closes with.
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
      // The rail's two synthetic tiles are built by this pure helper, and the rail renders on
      // every tab (`showIdentity` defaults true; only the browser inspector passes false), so a
      // change to it is visible in all three editor cases (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: the inherit switches, the
      // membership cluster and the pure leaf behind their copy.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout it opens with
      // and the copy-to-other-systems action it closes with.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-essence-edit-validation',
    label: 'Manager — Essence edit Validation',
    reaches: 'beyond',
    smokeLabels: [],
    // The third tab, and the only surface that reports an unresolvable property macro: at craft
    // time such a macro is logged and skipped silently, deliberately, so this is the GM's one route
    // to the fact.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      { selector: '.manager-essence-row[data-essence-id="aether"] .manager-icon-button' },
      { selector: '[data-essence-tab="validation"]' },
    ],
    expectView: 'essence-edit',
    kinds: ['manager', 'essences'],
    sourceMatches: [
      // The shared scoped-entity validation shell (issue 1362). Both validation tabs are
      // callers of it, so it is claimed on the two frames that photograph one.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedValidationTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/EssenceEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/Essence(?:EditorTabs|IdentityTab|OnCraftTab|ValidationTab|BehaviorPreview)\.svelte$/,
      // The rail's two synthetic tiles are built by this pure helper, and the rail renders on
      // every tab (`showIdentity` defaults true; only the browser inspector passes false), so a
      // change to it is visible in all three editor cases (issue 1124).
      /^src\/ui\/svelte\/util\/essencePreviewRow\.js$/,
      // The world-scope model this editor renders since issue 1372: the inherit switches, the
      // membership cluster and the pure leaf behind their copy.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:InheritRow|MembershipActions)\.svelte$/,
      // The two cards issue 1372 gives the rules tab: the shared-definition callout it opens with
      // and the copy-to-other-systems action it closes with.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/(?:CopyRulesCard|SharedDefinitionCallout)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
    ],
  }),

  // ── The two SYSTEM-SCOPE essence states issue 1372 adds ────────────────────────────────────
  // ── The system-scope essence state issue 1372 adds, and the ONE it cannot photograph ───────
  managerCase({
    id: 'manager-essences-membership-all',
    label: 'Manager — Essences all world essences',
    reaches: 'beyond',
    smokeLabels: [],
    // The two-option membership filter with its counts, switched to `All world essences`.
    query: {},
    steps: [
      { selector: '#manager-nav-essence-rules' },
      // The membership filter became a SegmentedControl (issue 1372) — the prototype states both
      // counts at once, which a <select> cannot. Driven by clicking its option, not by selectOption.
      { selector: '[data-essence-membership-option="all"]' },
    ],
    expectView: 'essences',
    expectSelector: '[data-essence-membership-filter]',
    // Containment is for controls that must fit, never for list rows: `expectContained` asserts a
    // target sits inside its container's box, and a row in a scrolling column legitimately extends
    // past `.manager-main`.
    expectContained: [{ container: '.manager-main', target: '[data-essence-membership-filter]' }],
    kinds: ['manager', 'essences'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/EssenceBrowserView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\/EssenceRow\.svelte$/,
    ],
  }),
]);

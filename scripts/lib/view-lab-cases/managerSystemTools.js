/**
 * System scope: the Tool Rules browser, the tool editor and the parity frames the smoke's tool walk pins.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  TOOL_EDITOR_SHELL_MATCHES,
  TOOL_LIST_MATCHES,
} from './caseConstants.js';
import { chooseSelectOption, managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-tool-parity-01-library-1280x720',
    label: 'Manager — Tool parity 01 library 1280x720',
    smokeLabels: ['manager-tool-parity-01-library-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-adopted-world-tool-1280x720',
    label: 'Manager — Tool rules, world Tool adopted 1280x720',
    // Beyond, with empty smoke labels: the smoke walks no world-Tool adoption, so there is no counterpart.
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    // The only state that proves the loop closes (issue 1373).
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      { selector: '[data-tool-add-to-system="hb-tool-mortar"]' },
    ],
    expectView: 'tools',
    // A member row, named by the control only a member renders.
    expectSelector:
      '.manager-tools-row[data-manager-tool-id="hb-tool-mortar"] [data-tool-edit-rules]',
    expectContained: [
      {
        container: '.manager-tools-library-list',
        target: '.manager-tools-row[data-manager-tool-id="hb-tool-mortar"]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-empty-library-1280x720',
    label: 'Manager — Tool zero state empty library 1280x720',
    smokeLabels: ['manager-tool-zero-state-empty-library-1280x720'],
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    // The two-button branch, named (issue 1373).
    expectSelector: '[data-tool-empty-browse-world]',
    expectContained: [
      {
        container: '[data-tool-library-empty]',
        target: '[data-tool-empty-browse-world]',
      },
      {
        container: '[data-tool-library-empty]',
        target: '[data-tool-empty-open-catalogue]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-no-world-tools-1280x720',
    label: 'Manager — Tool zero state on a world with no Tools at all 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    // The one-cta branch, which is the state A new world is actually in (issue 1373).
    query: { noTools: '1' },
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    expectSelector: '[data-tool-library-empty]',
    // The remaining route, inside the panel.
    expectContained: [
      {
        container: '[data-tool-library-empty]',
        target: '[data-tool-empty-open-catalogue]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-browse-world-1280x720',
    label: 'Manager — Tool zero state, world Tools browsed 1280x720',
    // Beyond: the live smoke walks no widened Tool rules list on a system holding none.
    reaches: 'beyond',
    smokeLabels: [],
    // What pressing the zero state's primary route draws (issue 1373), and until this case it was unproducible.
    query: { system: 'lab-jewelry' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-empty-browse-world]' },
    ],
    expectView: 'tools',
    // A non-member row carrying its one action.
    expectSelector: '.manager-tools-row[data-tool-row-member="absent"] [data-tool-add-to-system]',
    expectContained: [
      {
        container: '.manager-tools-library-list',
        target: '.manager-tools-row[data-tool-row-member="absent"]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    id: 'manager-tool-zero-state-membership-all-1280x720',
    label: 'Manager — Tool zero state, membership widened to all 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    // The second route to the same state, and it is not inferable from the first (issue 1373).
    query: { system: 'lab-jewelry' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
    ],
    expectView: 'tools',
    expectSelector: '.manager-tools-row[data-tool-row-member="absent"] [data-tool-add-to-system]',
    expectContained: [
      {
        container: '.manager-tools-library-list',
        target: '.manager-tools-row[data-tool-row-member="absent"]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The inheriting state of the rules editor (issue 1373), and the only frame that shows it.
    id: 'manager-tool-rules-inheriting-1280x720',
    label: 'Manager — Tool rules inheriting the world defaults 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      { selector: '[data-tool-add-to-system="hb-tool-mortar"]' },
      { selector: '[data-tool-edit-rules="hb-tool-mortar"]' },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-rule-card="bonus"][data-tool-rule-state="inheriting"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/tools\/ToolInheritCard\.svelte$/],
  }),
  managerCase({
    // A non-member tool, selected (issue 1373).
    id: 'manager-tool-non-member-selected-1280x720',
    label: 'Manager — Tool rules, non-member Tool selected 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="hb-tool-mortar"] .manager-tools-select-target',
      },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-inspector-add="hb-tool-mortar"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // Filtered to nothing (issue 1373), and the state that let a whole hero panel ship green.
    id: 'manager-tool-rules-filtered-empty-1280x720',
    label: 'Manager — Tool rules filtered to nothing 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-manager-tools-search] input', fill: 'qqzzxx' },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-library-filtered-empty]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The `Overriding` membership filter (issue 1373).
    id: 'manager-tool-rules-overriding-filter-1280x720',
    label: 'Manager — Tool rules filtered to overriding 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="over"]' },
    ],
    expectView: 'tools',
    // `data-tool-membership-filter` stamps `true` since issue 1515, so readiness is the third segment being lit.
    expectSelector: '[data-tool-membership-option="over"].is-active',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The sort row, driven (issue 1373).
    id: 'manager-tool-rules-sorted-desc-1280x720',
    label: 'Manager — Tool rules sorted by membership descending 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-membership-option="all"]' },
      ...chooseSelectOption('[data-tool-sort-key]', 'state'),
      { selector: '.manager-tools-sort-direction' },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-sort-direction="desc"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  // The sort key's open list (issue 1510): the one converted panel whose band floor cut its
  // longest label, so the frame shows `In this system` whole at the call site's `minWidth`.
  managerCase({
    id: 'manager-tool-rules-sort-key-list',
    label: 'Manager — Tool rules sort key list',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [{ selector: '#manager-nav-tool-rules' }, { selector: '[data-tool-sort-key]' }],
    expectView: 'tools',
    // Two claims a closed frame cannot make: the panel exists and it is the unticked sort list.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover:not(.fabricate-select-popover-ticked)' +
      ' [data-popover-option="state"] .fabricate-select-label',
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES, ...ANCHORED_POPOVER_SOURCES],
  }),
  managerCase({
    // A selected row under the pointer (issue 1373), which is how a live cascade defect survived three parity passes.
    id: 'manager-tool-rules-row-hovered-1280x720',
    label: 'Manager — Tool rules selected row under the pointer 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="sm-tool-hammer"] .manager-tools-select-target',
      },
    ],
    expectView: 'tools',
    expectSelector: '.manager-tools-row[data-manager-tool-id="sm-tool-hammer"].is-selected:hover',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The breakage-mode card's overridden face (issue 1373).
    id: 'manager-tool-rules-breakage-overridden-1280x720',
    label: 'Manager — Tool rules breakage mode overridden here 1280x720',
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
    ],
    expectView: 'tools',
    expectSelector: '[data-tool-authority-pill="system"]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
  managerCase({
    // The editor's rail, scrolled (issue 1373).
    id: 'manager-tool-editor-rail-scrolled-1280x720',
    label: 'Manager — Tool rules editor rail scrolled 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-required-for]', scroll: true },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-preview-usability]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntityPreview\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  // The Tool rails' first open-panel frame (issue 1510), and the first opened from an inspector
  // rail. Its labels are world actor names, so it is where the `toolbar` rung's 320px panel cap is
  // read against the longest name a roster holds.
  managerCase({
    id: 'manager-tool-preview-actor-list',
    label: 'Manager — Tool rules editor Preview as actor list',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    // Stops on the trigger and clicks no row, so the list is still open when the frame is taken.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-preview-actor]' },
    ],
    expectView: 'tool-edit',
    // Three claims a closed frame cannot make: the panel exists, it is the unticked list, and it
    // holds a world actor rather than the `No actor` sentinel alone, which is the name the panel
    // cap is being read against.
    expectSelector:
      '.fabricate-manager .fabricate-select-popover:not(.fabricate-select-popover-ticked)' +
      ' [data-popover-option="Actor.lab-actor-brenna"] .fabricate-select-label',
    // The panel sits inside the application root rather than clipped by the rail it opened from.
    expectContained: [{ container: '.fabricate-manager', target: '.fabricate-select-popover' }],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    // The editor with unsaved changes (issue 1373).
    id: 'manager-tool-editor-dirty-1280x720',
    label: 'Manager — Tool rules editor with unsaved changes 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-breakage-choice="limitedUses"]' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-limited-uses-stepper]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    // The overview frame is gone because the overview tab is (issue 1373).
    id: 'manager-tool-parity-02-remove-1280x720',
    label: 'Manager — Tool parity 02 remove from system 1280x720',
    smokeLabels: ['manager-tool-parity-02-remove-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '[data-tool-remove-from-system]', scroll: true },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-remove-from-system]',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-long-name',
    label: 'Manager — Tool stress long name',
    smokeLabels: ['manager-tool-stress-long-name'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system (see labContent.js's tool library note).
    query: { system: 'lab-runework' },
    // A long display label authored on the fixture: it reaches the same overflow the smoke types without a keystroke.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-stylus"] [data-tool-edit-rules]',
      },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-label]',
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolSystemScopeCards\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-03-breakage-1280x720',
    label: 'Manager — Tool parity 03 breakage 1280x720',
    smokeLabels: ['manager-tool-parity-03-breakage-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    // The strip is claimed here (issue 1373).
    sourceMatches: [
      ...TOOL_EDITOR_SHELL_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBehaviorPreview\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-repair',
    label: 'Manager — Tool stress repair',
    smokeLabels: ['manager-tool-stress-repair'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system (see labContent.js's tool library note).
    query: { system: 'lab-runework' },
    // The flag-broken tool, whose two populated repair-requirement groups are the frame.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-mallet"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-breakage' },
      // The repair editor sits below the breakage tab's fold, and the two populated requirement groups are the case.
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      // The repair set is `RecipeIngredientOption` rows at system scope, and only this frame photographs them there.
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
      // The summary sentence's own module, claimed by name since the list cases stopped swallowing `tools/`.
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolRepairSummary\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-replacement',
    label: 'Manager — Tool stress replacement',
    smokeLabels: ['manager-tool-stress-replacement'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system (see labContent.js's tool library note).
    query: { system: 'lab-runework' },
    // The replace-with tool, with its replacement component already chosen.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector: '.manager-tools-row[data-manager-tool-id="rw-tool-punch"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-breakage' },
      { selector: '[data-tool-replacement-target]', scroll: true },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    // The card itself is claimed here (issue 1373, maintainer round 2).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolReplacementTarget\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-immune',
    label: 'Manager — Tool stress immune',
    smokeLabels: ['manager-tool-stress-immune'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system (see labContent.js's tool library note).
    query: { system: 'lab-runework' },
    // Immune is check-driven, so the segment is clicked before the tool opens, exactly as the smoke does it.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-anvilstone"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-04-requirements-1280x720',
    label: 'Manager — Tool parity 04 requirements 1280x720',
    smokeLabels: ['manager-tool-parity-04-requirements-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    // No `ToolInheritCard` claim: this case opens the Anvil, whose two sections are the canonical empty.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-prerequisites-selected-1280x720',
    label: 'Manager — Tool requirements, prerequisites with a selection 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    // The state no frame photographed (issue 1373, maintainer round 5).
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-caliper"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-prerequisite-list]',
    // The checked row and an unchecked one: a list that renders without reading a selection differently is half the control.
    expectContained: [
      {
        container: '[data-tool-rule-card="prerequisites"]',
        target: '[data-tool-prerequisite-row="rw-prereq-arcana"].is-active input:checked',
      },
      {
        container: '[data-tool-rule-card="prerequisites"]',
        target:
          '[data-tool-prerequisite-row="rw-prereq-int"] .manager-modifier-readonly-expression',
      },
      {
        container: '[data-tool-rule-card="prerequisites"]',
        target: '[data-tool-prerequisites-summary]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // The row both of this tab's lists draw (issue 1373), and the checkbox the prerequisite list trails on it.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      // No pattern for `components/SelectionCheckbox.svelte`: it is a broad signal, so `sourceMatches` never sees it.
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolInheritCard\.svelte$/,
      // And the tab strip, on the one system frame that draws its requirements badge (issue 1373).
      ...TOOL_EDITOR_SHELL_MATCHES,
    ],
  }),
  managerCase({
    id: 'manager-tool-bonus-hand-typed-1280x720',
    label: 'Manager — Tool requirements, hand-typed bonus 1280x720',
    smokeLabels: [],
    reaches: 'beyond',
    // The value the library does not contain (issue 1373, maintainer round 3).
    query: { system: 'lab-runework' },
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-stylus"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-requirements' },
    ],
    expectView: 'tool-edit',
    expectSelector: '[data-tool-bonus-modifier="fabricate:tool-bonus-custom"]',
    expectContained: [
      {
        container: '[data-tool-rule-card="bonus"]',
        target: '[data-tool-bonus-modifier="fabricate:tool-bonus-custom"] input:checked',
      },
      { container: '[data-tool-rule-card="bonus"]', target: '[data-tool-bonus-note]' },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // The bonus list's row, shared with the Checks Studio catalogue (issue 1373, round 4).
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-05-validation-1280x720',
    label: 'Manager — Tool parity 05 validation 1280x720',
    smokeLabels: ['manager-tool-parity-05-validation-1280x720'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-validation' },
    ],
    expectView: 'tool-edit',
    // The tab had A case and no assertion (issue 1373).
    expectSelector: '[data-tool-validation-tab]',
    // The surface's three parts, each inside the region that owns it: medallion, counts rail, and a real check row.
    expectContained: [
      {
        container: '[data-tool-validation-tab]',
        target: '[data-editor-validation-summary]',
      },
      {
        container: '[data-tool-validation-tab]',
        target: '[data-editor-validation-counts]',
      },
      {
        container: '[data-tool-validation-tab]',
        target: '[data-tool-validation-check]',
      },
    ],
    position: { width: 1280, height: 720 },
    kinds: ['manager', 'tools'],
    // The strip's passing badge: the neutral tick issue 1373 took the filled success disc down to.
    sourceMatches: [
      ...TOOL_EDITOR_SHELL_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolValidationTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-invalid-validation',
    label: 'Manager — Tool stress invalid validation',
    smokeLabels: ['manager-tool-stress-invalid-validation'],
    reaches: 'exact',
    // The Tool Studio stress states live on the Runework fixture system (see labContent.js's tool library note).
    query: { system: 'lab-runework' },
    // The blocking Validation state.
    steps: [
      { selector: '#manager-nav-tool-rules' },
      {
        selector:
          '.manager-tools-row[data-manager-tool-id="rw-tool-caliper"] [data-tool-edit-rules]',
      },
      { selector: '#tool-tab-requirements' },
      // Addressed by the row's own hook since issue 1373: `data-tool-prerequisite-row` carries the entry id.
      { selector: '[data-tool-prerequisite-row="rw-prereq-arcana"]' },
      { selector: '#tool-tab-validation' },
    ],
    expectView: 'tool-edit',
    // The blocked row itself, not the tab (issue 1373).
    expectSelector: '[data-tool-validation-tab] .manager-recipe-val-row.is-block',
    expectContained: [
      {
        container: '[data-tool-validation-tab]',
        target: '[data-editor-validation-count="blocking"]',
      },
      {
        container: '[data-tool-validation-tab]',
        target: '.manager-recipe-val-row.is-block .manager-recipe-val-pill',
      },
    ],
    kinds: ['manager', 'tools'],
    // The strip's danger badge, which the neutral tick replaces: a change to either treatment is invisible in the other.
    sourceMatches: [
      ...TOOL_EDITOR_SHELL_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolValidationTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-parity-06-breakage-900x700',
    label: 'Manager — Tool parity 06 breakage 900x700',
    smokeLabels: ['manager-tool-parity-06-breakage-900x700'],
    reaches: 'exact',
    query: {},
    steps: [
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-edit-rules]' },
      { selector: '#tool-tab-breakage' },
    ],
    expectView: 'tool-edit',
    position: { width: 900, height: 700 },
    kinds: ['manager', 'tools', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/ToolEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolBreakageTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-tool-stress-wrapping-680',
    label: 'Manager — Tool stress wrapping 680',
    smokeLabels: ['manager-tool-stress-wrapping-680'],
    reaches: 'exact',
    query: {},
    steps: [{ selector: '#manager-nav-tool-rules' }],
    expectView: 'tools',
    position: { width: 680, height: 700 },
    kinds: ['manager', 'tools', 'responsive'],
    // Two claims removed here, and neither was routing (issue 1373).
    sourceMatches: [...TOOL_LIST_MATCHES],
  }),
]);

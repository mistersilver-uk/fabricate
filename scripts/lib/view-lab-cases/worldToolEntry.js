/**
 * World scope: the tool entry editor, its tabs and its on-break authoring states.
 */

import { ANCHORED_POPOVER_SOURCES } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  // An enumeration of about 200 reachable states over the four Tool surfaces found four that look like gaps and are not.
  managerCase({
    id: 'world-tool-entry',
    label: 'Manager — World Tool entry',
    reaches: 'beyond',
    smokeLabels: [],
    // Reached by clicking a catalogue row, the only way in: the entry route takes an id the rail cannot supply.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-scoped-page="world-tool-entry"]',
    // A section tab open with its inherit count, the read-only world break mode, and at least one per-system row.
    expectContained: [
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-world-tool-entry-inherit-count="breakage"]',
      },
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-world-tool-entry-break-label]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
      // The buffered-save seam (issue 1373), claimed by the second screen that renders it.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-dirty',
    label: 'Manager — World Tool entry, unsaved',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the explicit save exists for (issue 1373), and the twin of `world-essence-entry-dirty` beside it.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-name]', fill: 'Smith\u{2019}s Great Hammer' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-scoped-page="world-tool-entry"]',
    // The header pair, proved present and inside the band that owns it.
    expectContained: [
      {
        container: '.manager-header-actions',
        target: '[data-world-tool-save]',
      },
      {
        container: '.manager-header-actions',
        target: '[data-world-tool-back]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The same files the resting case claims: the resting frame shows the screen and this one shows Save is live.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-overview',
    label: 'Manager — World Tool entry, Overview',
    reaches: 'beyond',
    smokeLabels: [],
    // A second frame on one screen, because the entry's two tabs make different decisions and its sibling opens Breakage.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-card="enabled"]',
    // The switch and the consequence count beside it.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="enabled"]',
        target: '[data-world-tool-entry-enabled]',
      },
      // And the optional display label's helper (issue 1373).
      {
        container: '[data-world-tool-entry-card="display-label"]',
        target: '[data-world-tool-entry-name-hint]',
      },
      // The header `Delete`, which the design draws between Back and Save and which this screen did not have.
      {
        container: '.manager-header-actions',
        target: '[data-arm-token^="world-tool-delete:"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-unlinked',
    label: 'Manager — World Tool entry, no linked Item',
    reaches: 'beyond',
    smokeLabels: [],
    // The other face of the source tile, which no case reached (issue 1373, maintainer round 2).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
      {
        selector:
          '[data-scoped-list-row="lab-tool-unlinked"] [data-scoped-list-action="open-entry"]',
      },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-card="linked-item"]',
    // Both halves of the unlinked face inside their card: the drop prompt, and what the record has without an Item.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="linked-item"]',
        target: '[data-item-drop-zone="tool-source"]',
      },
      {
        container: '[data-world-tool-entry-card="linked-item"]',
        target: '[data-world-tool-entry-unlinked]',
      },
      // And the world master switch, off (issue 1373).
      {
        container: '[data-world-tool-entry-card="enabled"]',
        target: '[data-world-tool-entry-enabled="off"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-source-missing',
    label: 'Manager — World Tool entry, linked Item deleted',
    reaches: 'beyond',
    smokeLabels: [],
    // The third face of the source tile, and the one no corpus state could reach (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
      {
        selector:
          '[data-scoped-list-row="lab-tool-warped-crucible"] [data-scoped-list-action="open-entry"]',
      },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-item-drop-zone="tool-source"]',
    // The missing face itself, by its own state value.
    expectAttributes: [
      {
        selector: '[data-item-drop-zone="tool-source"]',
        name: 'data-item-drop-state',
        value: 'missing',
      },
    ],
    expectContained: [
      {
        container: '[data-world-tool-entry-card="linked-item"]',
        target: '[data-item-drop-zone="tool-source"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-name-blank',
    label: 'Manager — World Tool entry, display label left blank',
    reaches: 'beyond',
    smokeLabels: [],
    // The optional field, actually left blank (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-name]', fill: '' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-card="display-label"]',
    // The field and its helper, inside the card.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="display-label"]',
        target: '[data-world-tool-entry-name]',
      },
      {
        container: '[data-world-tool-entry-card="display-label"]',
        target: '[data-world-tool-entry-name-hint]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-requirements',
    label: 'Manager — World Tool entry, Requirements',
    reaches: 'beyond',
    smokeLabels: [],
    // The fourth tab, which the screen did not have (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="requirements"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-requirements-tab]',
    // The two controls and the reach line: a frame proving only the tab exists is evidence for the strip alone.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-prerequisites-enabled]',
      },
      // The reach line moved inside the section it counts (issue 1373, maintainer round 2).
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-section-note="prerequisites"]',
      },
      // And the bonus is A pick from the world modifier library (issue 1373, maintainer round 3).
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-modifier]',
      },
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-note]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // Both of this tab's lists' rows (issue 1373): the bonus list shared with the Checks Studio, and the prerequisite list.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      // The card the tab draws each of its two sections as (issue 1373).
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolInheritCard\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-bonus-empty-library',
    label: 'Manager — World Tool entry, bonus with no world modifiers',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the maintainer's own world is in (issue 1373): the bonus section selects over an unauthored library.
    query: { clearSystem: '1' },
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="requirements"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-bonus-empty]',
    // Both sentences, because the claim is that the two absences read the same way.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-empty]',
      },
      {
        container: '[data-world-tool-entry-card="requirements"]',
        target: '[data-tool-bonus-note]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRequirementsTab\.svelte$/,
      // The bonus list's row, shared with the Checks Studio catalogue (issue 1373, round 4).
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-unlimited-uses',
    label: 'Manager — World Tool entry, an unlimited-uses world default',
    reaches: 'beyond',
    smokeLabels: [],
    // The first-run breakage state, which no frame reached (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-anvil"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
    ],
    expectView: 'world-tool-entry',
    // The chosen card and the absent inset in one selector, and the absence is the load-bearing half.
    expectSelector:
      '[data-world-tool-entry-card="breakage"]' +
      ':has([data-world-tool-entry-breakage-mode="unlimited"] input:checked)' +
      ':not(:has([data-world-tool-entry-breakage-value]))',
    // The summary line the stepper used to contradict: with the fourth mode the card and the line agree.
    expectContained: [
      {
        container: '[data-world-tool-entry-card="breakage"]',
        target: '[data-world-tool-entry-breakage-summary]',
      },
      {
        container: '[data-world-tool-entry-card="breakage"]',
        target: '[data-world-tool-entry-breakage-mode="unlimited"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldToolStudio\.js$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-validation',
    label: 'Manager — World Tool entry, Validation',
    reaches: 'beyond',
    smokeLabels: [],
    // The fourth tab, which had no frame at all (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      { selector: '[data-pagination-next]' },
      {
        selector:
          '[data-scoped-list-row="lab-tool-warped-crucible"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="validation"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-world-tool-entry-validation]',
    // The summary, the counts rail and A named check.
    expectContained: [
      {
        container: '[data-world-tool-entry-validation]',
        target: '[data-editor-validation-summary]',
      },
      {
        container: '[data-world-tool-entry-validation]',
        target: '[data-editor-validation-count="warnings"]',
      },
      {
        container: '[data-world-tool-entry-validation]',
        target: '[data-world-tool-entry-check="breakage-value"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      // The shared shell both validation tabs call, claimed on the frame that draws its world face.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedValidationTab\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-empty',
    label: 'Manager — World Tool entry, an empty repair set',
    reaches: 'beyond',
    smokeLabels: [],
    // The state a GM is in the instant they pick `Mark as broken`, and it was drawn by nothing (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-world-tool-entry-onbreak-mode="flagBroken"]' },
    ],
    expectView: 'world-tool-entry',
    // The count at zero is the one selector separating this frame from its populated twin.
    expectSelector: '[data-tool-repair-count="0"]',
    expectContained: [
      {
        container: '[data-world-tool-entry-card="on-break"]',
        target: '[data-tool-repair-requirements]',
      },
      {
        container: '[data-tool-repair-requirements]',
        target: '[data-tool-repair-summary]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      // The sentence generator, which is this frame's last line and had no claim once the list cases stopped swallowing `tools/`.
      /^src\/ui\/svelte\/apps\/manager\/tools\/toolRepairSummary\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientSetCard\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-replace-empty',
    label: 'Manager — World Tool entry, a replacement with no target chosen',
    reaches: 'beyond',
    smokeLabels: [],
    // `ToolReplacementTarget`'s empty face, which has sixty lines of CSS and no frame at either scope (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-hammer"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-world-tool-entry-onbreak-mode="replaceWith"]' },
    ],
    expectView: 'world-tool-entry',
    // The drop face, by its own idle value.
    expectSelector: '[data-tool-replacement-drop="idle"]',
    expectContained: [
      {
        container: '[data-world-tool-entry-card="on-break"]',
        target: '[data-tool-replacement-target]',
      },
      {
        container: '[data-tool-replacement-drop="idle"]',
        target: '.manager-tool-replacement-component-trigger',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolReplacementTarget\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair',
    label: 'Manager — World Tool entry, repair route',
    reaches: 'beyond',
    smokeLabels: [],
    // A state no case could reach, which is why the screen shipped without the control (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      // Scrolled, because the repair editor is the last thing in the second card of the breakage panel.
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements]',
    // The rows and the adders.
    expectContained: [
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-tool-repair-requirements] [data-recipe-group]',
      },
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-tool-repair-requirements] [data-recipe-add="component"]',
      },
      {
        container: '[data-tool-repair-requirements] .manager-recipe-ingredient-option-row.is-tag',
        target: '[data-tool-repair-requirements] [data-recipe-option-tags]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      // The row itself, because this is the only frame photographing a tag requirement inside a Tool inspector.
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-empty-catalogue',
    label: 'Manager — World Tool entry, repair route with no catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the maintainer's own world is in (issue 1373, maintainer round 5).
    query: { clearSystem: '1', noAuthoredWorldComponents: '1' },
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements]',
    // The degraded field itself, not merely the section.
    expectContained: [
      {
        container: '[data-tool-repair-requirements] [data-recipe-option]',
        target: '[data-recipe-option-search]',
      },
      {
        container: '[data-tool-repair-requirements] [data-recipe-option]',
        target: '[data-recipe-option-empty-catalogue] input',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-empty-tag',
    label: 'Manager — World Tool entry, repair route with an empty tag row',
    reaches: 'beyond',
    smokeLabels: [],
    // The row the maintainer authored, which no fixture could seed (issue 1373).
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
      { selector: '[data-tool-repair-requirements] [data-recipe-add="tag-requirement"]' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements]',
    // The arm, in A row that holds no chips.
    expectContained: [
      {
        container:
          '[data-tool-repair-requirements] .manager-recipe-ingredient-option-row.is-tag:last-of-type',
        target: '[data-tool-repair-requirements] [data-recipe-option-tags]:last-of-type',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientSetCard\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-tag-picker-empty',
    label: 'Manager — World Tool entry, the tag picker over a world with no tags',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the maintainer's own world is in, and the one the redesign is actually about.
    query: { noAuthoredWorldComponents: '1' },
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
      { selector: '[data-tool-repair-requirements] [data-recipe-add-tag]' },
    ],
    expectView: 'world-tool-entry',
    // The note by its variant class: `.manager-empty` alone passes over the dashed hero this frame proves is gone.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover .manager-travel-popover-empty ' +
      '.manager-empty.is-note',
    expectContained: [
      {
        container: '.fabricate-manager',
        target: '.fabricate-picker-popover .manager-travel-popover-empty',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'world-tool-entry-on-break-repair-suggestions',
    label: 'Manager — World Tool entry, repair route with a suggestion list open',
    reaches: 'beyond',
    smokeLabels: [],
    // No case opened a suggestion list (issue 1373), which is why the completion row shipped centred and unphotographed.
    steps: [
      { selector: '#manager-world-nav-tool-catalogue' },
      {
        selector: '[data-scoped-list-row="sm-tool-tongs"] [data-scoped-list-action="open-entry"]',
      },
      { selector: '[data-world-tool-entry-tab="breakage"]' },
      { selector: '[data-tool-repair-requirements]', scroll: true },
      { selector: '[data-tool-repair-requirements] [data-recipe-option-clear]' },
      { selector: '[data-tool-repair-requirements] [data-recipe-option-search]', fill: 'ingot' },
    ],
    expectView: 'world-tool-entry',
    expectSelector: '[data-tool-repair-requirements] [data-recipe-option-suggestion]',
    // The panel under the field it completes.
    expectContained: [
      {
        container: '[data-scoped-page="world-tool-entry"]',
        target: '[data-tool-repair-requirements] [data-recipe-option-suggestion]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldToolEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/tools\/ToolRepairRequirements\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeIngredientOption\.svelte$/,
    ],
  }),
]);

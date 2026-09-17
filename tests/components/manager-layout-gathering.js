/**
 * Gathering rail, settings, task browser, chance slider and World Parties layout, measured in a real browser (issue 1670).
 *
 * A surface module of `manager-layout.test.js`. It registers its tests on import and owns no
 * browser: `tests/helpers/layout-harness.js` holds the one Chromium every surface shares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withScopeHash } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

import {
  blockFor,
  css,
  pagerBarFixture,
  readWorkspaceGrid,
} from './manager-layout-shared.js';
import {
  CHANCE_SLIDER_FIXTURE,
  colorPickerSource,
  partiesTabScoped,
  partiesTabSource,
  partyExpandedBodyScoped,
} from './manager-layout-gathering-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('manager gathering rail submenu controls clear host mouse focus and keep green keyboard focus', () => {
  const expandedGroupBlock = blockFor('.fabricate-manager .manager-nav-group.is-expanded');
  const parentBlock = blockFor('.fabricate-manager .manager-nav-parent');
  const expandedParentBlock = blockFor(
    '.fabricate-manager .manager-nav-group.is-expanded .manager-nav-parent'
  );
  const expandedParentHoverBlock = blockFor(
    '.fabricate-manager .manager-nav-group.is-expanded .manager-nav-parent:hover'
  );
  const submenuBlock = blockFor('.fabricate-manager .manager-nav-submenu');
  const toggleBlock = blockFor('.fabricate-manager .manager-nav-toggle');
  const expandedToggleBlock = blockFor(
    '.fabricate-manager .manager-nav-group.is-expanded .manager-nav-toggle'
  );
  const toggleFocusBlock = blockFor('.fabricate-manager .manager-nav-toggle:focus');
  const toggleFocusVisibleBlock = blockFor('.fabricate-manager .manager-nav-toggle:focus-visible');
  const subitemBlock = blockFor('.fabricate-manager .manager-nav-subitem');
  const subitemFocusBlock = blockFor('.fabricate-manager .manager-nav-subitem:focus');
  const activeSubitemBlock = blockFor('.fabricate-manager .manager-nav-subitem.is-active');
  const activeSubitemFocusBlock = blockFor(
    '.fabricate-manager .manager-nav-subitem.is-active:focus'
  );
  const subitemFocusVisibleBlock = blockFor(
    '.fabricate-manager .manager-nav-subitem:focus-visible'
  );

  // AN EXPANDED GROUP IS INDENTED ROWS AGAINST A GUIDE, NOT A SECOND CARD (issue 1373). The
  // filled, ring-inset box drew a panel around a run of nav rows in a rail that is otherwise a
  // flat list — and on the Tool Rules screen the boxed `Crafting` group sits directly above
  // `Tool Rules`, which is NOT in it, so the box read as a claim about membership that the
  // breadcrumb had also been making and that was equally untrue. The reference indents the
  // children and marks them with a thin vertical rule.
  assert.equal(
    expandedGroupBlock.includes('border-radius: 8px;'),
    false,
    'an expanded group draws no card corner'
  );
  assert.equal(
    expandedGroupBlock.includes('background: var(--fab-overlay-light-035);'),
    false,
    'and no card fill: it is a guide, not a container'
  );
  assert.equal(
    expandedGroupBlock.includes('box-shadow: inset 0 0 0 1px var(--fab-border);'),
    false,
    'and no inset ring: that WAS the container edge, drawn as a shadow so it shifted nothing'
  );
  // THE GUIDE IS ON THE SUBMENU, which is where the children actually are — so it starts and
  // ends exactly where they do, which a rule around the whole group could not do.
  const submenuGuide = blockFor('.fabricate-manager .manager-nav-submenu');
  assert.ok(
    submenuGuide.includes('border-left: 1px solid var(--fab-border);'),
    'the indented children are marked with a thin vertical rule instead'
  );
  assert.equal(
    expandedGroupBlock.includes('padding:'),
    false,
    'expanded gathering nav should not add layout padding that shifts the parent row'
  );
  assert.equal(
    expandedGroupBlock.includes('border:'),
    false,
    'expanded gathering nav should not add layout border that shifts the parent row'
  );
  assert.ok(
    parentBlock.includes('grid-template-columns: 24px minmax(0, 1fr) auto;'),
    'gathering parent should keep count chips inside the row before the toggle'
  );
  assert.ok(
    expandedParentBlock.includes('border-color: transparent;'),
    'expanded gathering parent should not use selected border styling'
  );
  assert.ok(
    expandedParentBlock.includes('background: transparent;'),
    'expanded gathering parent should not use selected fill styling'
  );
  assert.ok(
    expandedParentBlock.includes('box-shadow: none;'),
    'expanded gathering parent should not use the selected left accent'
  );
  assert.ok(
    expandedParentHoverBlock.includes('background: var(--fab-overlay-light-04);'),
    'expanded gathering parent may have a subtle hover without becoming selected'
  );
  assert.ok(
    toggleBlock.includes('top: 4px;') && toggleBlock.includes('right: 4px;'),
    'gathering toggle should have stable collapsed geometry'
  );
  assert.equal(
    expandedToggleBlock,
    '',
    'expanded gathering toggle should not override collapsed geometry'
  );
  assert.ok(
    submenuBlock.includes('padding-left: var(--fab-space-3);'),
    'gathering submenu entries should be nested inside the group'
  );
  assert.ok(
    // FOUR tracks since issue 1096: a Checks child can carry an unsaved marker AND an issue
    // badge beside its label, and the three-track grid put the second one into the ICON cell
    // of the row below it. The claim is unchanged — a submenu entry's trailing markers stay
    // inside its own row — and the extra track is simply empty for every other rail group.
    subitemBlock.includes('grid-template-columns: 20px minmax(0, 1fr) auto auto;'),
    'gathering submenu entries should keep count chips inside their rows'
  );
  // Issue 1179: World established the neutral active language and every corresponding
  // selected-system link now shares it.
  assert.ok(
    activeSubitemBlock.includes('background: var(--fab-surface-active);'),
    'selected submenu entries should use the neutral active fill'
  );
  assert.ok(
    activeSubitemBlock.includes('border-color: transparent;'),
    'selected submenu entries should not add a strong edge'
  );
  assert.equal(
    activeSubitemBlock.includes('var(--fab-success'),
    false,
    'the rail selected state should not reuse the enabled-status success family'
  );
  assert.ok(activeSubitemBlock.includes('box-shadow: none;'), 'selected entries have no stripe');
  assert.ok(
    toggleFocusBlock.includes('outline: none;'),
    'mouse focus on gathering toggle should not inherit the host outline'
  );
  assert.ok(
    toggleFocusBlock.includes('box-shadow: none;'),
    'mouse focus on gathering toggle should not inherit the host orange focus shadow'
  );
  assert.ok(
    toggleFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus on gathering toggle should use the manager accent'
  );
  assert.ok(
    subitemFocusBlock.includes('outline: none;'),
    'mouse focus on gathering submenu entries should not inherit the host outline'
  );
  assert.ok(
    subitemFocusBlock.includes('box-shadow: none;'),
    'mouse focus on gathering submenu entries should not inherit the host orange focus shadow'
  );
  assert.ok(activeSubitemFocusBlock.includes('box-shadow: none;'), 'active focus stays neutral');
  assert.ok(
    subitemFocusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus on gathering submenu entries should use the manager accent'
  );
  assert.equal(
    toggleFocusBlock.includes('orange'),
    false,
    'gathering toggle focus should not use orange'
  );
  assert.equal(
    subitemFocusVisibleBlock.includes('orange'),
    false,
    'gathering submenu keyboard focus should not use orange'
  );
});

test('manager gathering rules inspector stacks descriptions above normal-weight selects', () => {
  const ruleRowBlock = blockFor('.fabricate-manager .manager-rule-row');
  const ruleCopyBlock = blockFor('.fabricate-manager .manager-rule-copy');
  const ruleCopyDescriptionBlock = blockFor('.fabricate-manager .manager-rule-copy span');
  const ruleFieldBlock = blockFor('.fabricate-manager .manager-rule-field');
  // Was a two-selector rule that also painted `.manager-rule-stepper input`. That field is
  // the shared `Stepper` now (issue 1050) and brings its own chrome, so the rule is the
  // `<select>` alone.
  const ruleInputBlock = blockFor('.fabricate-manager .manager-rule-field select');

  assert.ok(
    ruleRowBlock.includes('grid-template-columns: 34px minmax(0, 1fr);'),
    'rule rows should place icon and description on the same row'
  );
  assert.ok(
    ruleCopyBlock.includes('display: flex;') && ruleCopyBlock.includes('flex-direction: column;'),
    'rule copy should stack label and description beside the icon'
  );
  assert.ok(
    ruleCopyDescriptionBlock.includes('color: var(--fab-text-muted);'),
    'rule descriptions should read as supporting copy'
  );
  assert.ok(
    ruleFieldBlock.includes('grid-column: 2;'),
    'rule selects should sit underneath the description column'
  );
  assert.ok(
    ruleFieldBlock.includes('font-weight: 400;'),
    'rule field text should not force bold select text'
  );
  assert.ok(
    ruleInputBlock.includes('font-weight: 400;'),
    'rule select and input text should not inherit bold labels'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-gathering-settings-summary'),
    false,
    'settings center panel should not keep the duplicated rules summary'
  );
});

test('manager gathering settings condition panels use a two-column responsive grid', () => {
  const settingsBlock = blockFor('.fabricate-manager .manager-gathering-settings');
  const panelBlock = blockFor('.fabricate-manager .manager-condition-panel');
  const addBlock = blockFor('.fabricate-manager .manager-condition-add');
  const biomeAddBlock = blockFor('.fabricate-manager .manager-biome-add');
  const pillBlock = blockFor('.fabricate-manager .manager-condition-pill');
  const regionPillBlock = blockFor('.fabricate-manager .manager-vocabulary-pill.is-region');
  const biomePillBlock = blockFor('.fabricate-manager .manager-vocabulary-pill.is-biome');
  const biomeCombinedTriggerBlock = blockFor(
    '.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only.manager-biome-combined-trigger'
  );
  const biomeCombinedTriggerIconBlock = blockFor(
    '.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only.manager-biome-combined-trigger i'
  );
  // Issue 1470 re-rooted the colour family off `.fabricate-manager` and onto the namespace
  // classes `ManagerColorPicker` and `ManagerColorPopover` write, so the two shared components
  // paint in whatever application they are mounted in. Same declarations, same specificity, same
  // place in the file — only the root moved, and these lookups follow it.
  const colorPickerPopoverBlock = blockFor(
    '.fabricate-color-picker-popover.manager-color-picker-popover'
  );
  const colorPresetGridBlock = blockFor('.fabricate-color-picker-popover .manager-color-preset-grid');
  const colorCustomInputBlock = blockFor('.fabricate-color-picker-popover .manager-color-custom input');
  const labelInputBlock = blockFor('.fabricate-manager .manager-condition-label-input');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));

  assert.ok(
    settingsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'settings conditions should sit side by side at normal widths'
  );
  assert.ok(
    settingsBlock.includes('align-items: stretch;'),
    'condition panels should stretch to equal height in the two-column layout'
  );
  assert.ok(
    settingsBlock.includes('padding: var(--fab-space-3);'),
    'settings panel should use uniform workspace padding on all sides'
  );
  assert.ok(
    panelBlock.includes('align-content: start;'),
    'condition panel content should pack to its natural height'
  );
  assert.ok(
    panelBlock.includes('height: 100%;'),
    'condition panel backgrounds should fill the stretched grid row'
  );
  // The trailing track is `max-content`, not 48px (issue 1118). A number here sized the
  // column to the two words the Add button happens to hold today; converted, that button
  // takes the primary role's `0 var(--fab-space-4)` — 32px of padding in a 48px box — and
  // clips its own label whatever it says. `.manager-region-add` re-templated this same grid
  // for a region row and was retired in the same edit: no component carries the class.
  assert.ok(
    addBlock.includes('grid-template-columns: 36px minmax(0, 1fr) max-content;'),
    'condition add controls should reserve icon picker, label input, and a content-sized Add column'
  );
  assert.equal(
    blockFor('.fabricate-manager .manager-region-add'),
    '',
    'the dead region-add grid override must not come back'
  );
  assert.ok(
    biomeAddBlock.includes('grid-template-columns: 36px 36px minmax(0, 1fr) max-content;'),
    'biome add controls should align icon, colour, input, and a content-sized Add column'
  );
  // The one declaration `.manager-add-button` keeps: the height that lines it up with the
  // input beside it. Its width, padding and font-size are the primitive's now.
  assert.ok(
    blockFor('.fabricate-manager .manager-add-button').includes('height: 36px;'),
    'the Add button still matches the sibling input height'
  );
  assert.equal(
    blockFor('.fabricate-manager .manager-add-button').includes('width: 48px;'),
    false,
    'and no longer pins itself to the retired 48px box'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-condition-pill-list {\n  display: grid;'),
    'condition pills should use grid rows instead of wrapping as single full-width flex pills'
  );
  assert.ok(
    css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'condition pills should fit two per line'
  );
  assert.ok(
    pillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'),
    'condition pills should reserve icon, label, and remove columns'
  );
  assert.ok(
    regionPillBlock.includes('grid-template-columns: minmax(0, 1fr) 24px;'),
    'region pills should expose editable labels and remove controls without icon columns'
  );
  assert.ok(
    biomePillBlock.includes('grid-template-columns: 30px minmax(0, 1fr) 24px;'),
    'biome pills should reserve combined icon/color, label, and remove columns'
  );
  assert.ok(
    !biomePillBlock.includes('28px 30px minmax(0, 1fr) 30px 24px;'),
    'biome pills should not reserve separate swatch and colour columns'
  );
  assert.ok(
    biomeCombinedTriggerBlock.includes('color: var(--fab-biome-icon-foreground);'),
    'biome combined icon trigger should use fixed charcoal foreground across themes'
  );
  assert.ok(
    biomeCombinedTriggerBlock.includes(
      'background: var(--manager-color-swatch, var(--fab-tag-sage));'
    ),
    'biome combined icon trigger should keep token/custom swatch backgrounds'
  );
  assert.ok(
    biomeCombinedTriggerIconBlock.includes('color: var(--fab-biome-icon-foreground);'),
    'biome combined nested icons should not inherit theme button colours'
  );
  assert.ok(
    css.includes('--fab-biome-icon-foreground: #202124;'),
    'biome icon foreground token should stay fixed charcoal in theme declarations'
  );
  assert.ok(
    colorPickerPopoverBlock.includes('box-sizing: border-box;'),
    'biome color picker popover should contain its padding and border in its width'
  );
  assert.ok(
    colorPickerPopoverBlock.includes('z-index: 120;'),
    'biome color picker popover should layer with Manager portaled pickers'
  );
  assert.equal(
    colorPickerPopoverBlock.includes('top: calc(100% + 6px);'),
    false,
    'biome color picker popover position should come from computed inline placement'
  );
  assert.ok(
    colorPickerPopoverBlock.includes('width: 220px;'),
    'biome color picker popover should be wide enough for presets and custom hex input'
  );
  assert.ok(
    colorPickerSource.includes('computeIconPickerPopoverLayout'),
    'biome color picker should use shared popover positioning'
  );
  assert.ok(
    colorPickerSource.includes('minWidth: 220') && colorPickerSource.includes('maxWidth: 220'),
    'biome color picker layout should keep a fixed compact width'
  );
  assert.ok(
    colorPickerSource.includes("horizontalAlign: 'left'"),
    'biome color picker layout should left-align with the trigger'
  );
  assert.ok(
    colorPresetGridBlock.includes('grid-template-columns: repeat(4, 1fr);'),
    'biome color picker presets should render as a compact grid'
  );
  assert.ok(
    colorCustomInputBlock.includes('width: 100%;'),
    'biome custom hex input should fill the popover without overflowing'
  );
  assert.ok(
    colorCustomInputBlock.includes('min-width: 0;'),
    'biome custom hex input should be allowed to shrink inside the popover grid'
  );
  assert.ok(
    pillBlock.includes('border-radius: 6px;'),
    'condition pills should be rounded rectangles rather than ovals'
  );
  assert.ok(
    labelInputBlock.includes('align-self: center;'),
    'condition label edit inputs should center inside the pill'
  );
  assert.ok(
    labelInputBlock.includes('min-height: 0;'),
    'condition label edit inputs should override inherited input minimum height'
  );
  assert.ok(
    labelInputBlock.includes('height: 20px;'),
    'condition label edit inputs should stay visually shorter than the pill'
  );
  assert.ok(
    labelInputBlock.includes('max-height: 20px;'),
    'condition label edit inputs should not expand to fill the pill on focus'
  );
  assert.equal(
    labelInputBlock.includes('font-size'),
    false,
    'condition label edit input should not reduce text size to shrink the control'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-condition-pill .essence-icon-picker-trigger.icon-only'
    ) && css.includes('justify-content: center;'),
    'condition pill icon picker buttons should center icons'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-gathering-settings') &&
      mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'condition panels should stack at medium widths'
  );
});

test('manager gathering task browser defines bounded toolbar and compact table geometry without reorder controls', () => {
  const toolbarBlock = blockFor('.fabricate-manager .manager-task-toolbar');
  const panelBlock = blockFor('.fabricate-manager .manager-gathering-panel-tasks');
  const tableBlock = blockFor('.fabricate-manager .manager-gathering-tasks-table');
  const rowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-table-head,\n.fabricate-manager .manager-gathering-task-row'
  );
  const identityBlock = blockFor(
    '.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity,\n.fabricate-manager .manager-gathering-task-identity,\n.fabricate-manager .manager-essence-identity'
  );
  const toolsRowBlock = blockFor('.fabricate-manager .manager-tools-row');
  const toolsSelectedRowBlock = blockFor('.fabricate-manager .manager-tools-row.is-selected');
  // THE RULE THAT ACTUALLY PAINTS A SELECTED ROW. `ToolsBrowserView` renders
  // `<article class="manager-tools-row"><button class="manager-tools-select-target">`, so the
  // two `> .manager-tools-row-body` rules this used to read were DEAD — nothing has rendered
  // that element since the list was rewritten, and the `--fab-success-soft` one was the rule
  // finding 8 of the parity pass cited without it ever reaching a pixel (issue 1373).
  const toolsSelectedListRowBlock = blockFor(
    '.fabricate-manager .manager-tools-library-list > article.is-selected'
  );
  const toolsIdentityBlock = blockFor('.fabricate-manager .manager-tools-identity');
  const editorBlock = blockFor('.fabricate-manager .manager-gathering-task-edit-view');
  const availabilityBlock = blockFor('.fabricate-manager .manager-task-availability-row');
  const componentBrowserBlock = blockFor('.fabricate-manager .manager-task-component-browser-card');
  const componentBrowserControlsBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-controls'
  );
  const componentBrowserScrollBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-scroll'
  );
  const componentGridBlock = blockFor('.fabricate-manager .manager-task-component-grid');
  const componentCardBlock = blockFor('.fabricate-manager .manager-task-component-card');
  const componentCardCopySharedBlock = blockFor(
    '.fabricate-manager .manager-task-component-card-copy strong,\n.fabricate-manager .manager-task-component-card-copy > span:not(.manager-task-component-card-tags)'
  );
  const componentCardGripBlock = blockFor('.fabricate-manager .manager-task-component-card-grip');
  const componentBrowserFooterBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-footer'
  );
  const componentBrowserFooterPaginationBlock = blockFor(
    '.fabricate-manager .manager-task-component-browser-footer .manager-pagination'
  );
  const componentPillsBlock = blockFor('.fabricate-manager .manager-task-component-pills');
  // Three classes since issue 883: the pill is a `Chip`, whose scoped block also sits at
  // two classes and is injected after this sheet, so the two-class form would lose.
  const selectedTagPillBlock = blockFor(
    '.fabricate-manager .manager-chip.manager-selected-tag-pill'
  );
  const dropCardBlock = blockFor('.fabricate-manager .manager-task-drops-card');
  const dropHeaderBlock = blockFor(
    '.fabricate-manager .manager-task-drops-card .manager-task-card-header'
  );
  const dropControlsBlock = blockFor('.fabricate-manager .manager-task-drop-controls');
  const dropSearchBlock = blockFor(
    '.fabricate-manager .manager-task-drop-controls .manager-search.is-compact'
  );
  const dropSearchInputBlock = blockFor(
    '.fabricate-manager .manager-task-drop-controls .manager-search.is-compact input'
  );
  const dropFooterBlock = blockFor('.fabricate-manager .manager-task-drop-footer');
  const dropFooterPaginationBlock = blockFor(
    '.fabricate-manager .manager-task-drop-footer .manager-pagination'
  );
  const dropScrollBlock = blockFor(
    '.fabricate-manager .manager-task-drops-card .manager-table-scroll'
  );
  const dropTableBlock = blockFor('.fabricate-manager .manager-gathering-task-drops-table');
  const dropTableRankedBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drops-table.is-ranked-mode'
  );
  const dropRankCellBlock = blockFor('.fabricate-manager .manager-drop-rank-cell');
  const dropRankValueBlock = blockFor('.fabricate-manager .manager-drop-rank-value');
  const dropRankButtonBlock = blockFor('.fabricate-manager .manager-drop-rank-button');
  const dropTableHeadBlock = blockFor('.fabricate-manager .manager-gathering-task-drop-table-head');
  const dropRowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head,\n.fabricate-manager .manager-gathering-task-drop-row'
  );
  const firstDropRowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head + .manager-gathering-task-drop-row'
  );
  const dropCellBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head > *,\n.fabricate-manager .manager-gathering-task-drop-row > *'
  );
  const dropCellSeparatorBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-table-head > * + *,\n.fabricate-manager .manager-gathering-task-drop-row > * + *'
  );
  const selectedDropRowBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-row.is-selected'
  );
  const dropComponentButtonBlock = blockFor(
    '.fabricate-manager .manager-drop-component-button,\n.fabricate-manager .manager-drop-empty-component'
  );
  const dropEmptyComponentBlock = blockFor('.fabricate-manager .manager-drop-empty-component');
  const dropEmptyComponentIconBlock = blockFor(
    '.fabricate-manager .manager-drop-empty-component .manager-inline-drop-zone'
  );
  const dropComponentCopyBlock = blockFor(
    '.fabricate-manager .manager-drop-component-button .manager-system-copy,\n.fabricate-manager .manager-drop-empty-component .manager-system-copy'
  );
  const dropComponentNameBlock = blockFor(
    '.fabricate-manager .manager-drop-component-button .manager-system-name'
  );
  const dropRateBlock = blockFor('.fabricate-manager .manager-drop-rate-cell');
  const dropRateValueBlock = blockFor('.fabricate-slider.manager-drop-rate-value');
  const dropRatePercentBlock = blockFor('.fabricate-slider .manager-drop-rate-percent');
  const dropRatePercentInputBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-percent input:is([type="text"], [type="number"])'
  );
  const dropRatePercentInputOverrideBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-edit-view .manager-drop-rate-percent input:is([type="text"], [type="number"])'
  );
  const dropRatePercentSuffixBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-percent > span[aria-hidden="true"]'
  );
  const dropRateControlBlock = blockFor('.fabricate-slider .manager-drop-rate-control');
  const guaranteedDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-guaranteed'
  );
  const commonDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-common'
  );
  const uncommonDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-uncommon'
  );
  const rareDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-rare'
  );
  const veryRareDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-very-rare'
  );
  const legendaryDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-legendary'
  );
  const noneDropRateControlBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.is-none'
  );
  const dropRateTrackBlock = blockFor('.fabricate-slider .manager-drop-rate-track');
  const dropRateFillBlock = blockFor('.fabricate-slider .manager-drop-rate-fill');
  const continuousGradientFillBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control.has-continuous-gradient .manager-drop-rate-fill'
  );
  const dropRateRangeBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control input[type="range"]'
  );
  const dropRateWebkitTrackBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control input[type="range"]::-webkit-slider-runnable-track'
  );
  const dropRateWebkitThumbBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control input[type="range"]::-webkit-slider-thumb'
  );
  const dropRateMozProgressBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control input[type="range"]::-moz-range-progress'
  );
  const dropRateMozThumbBlock = blockFor(
    '.fabricate-slider .manager-drop-rate-control input[type="range"]::-moz-range-thumb'
  );
  const toolBreakageChanceControlBlock = blockFor(
    '.fabricate-manager .manager-tool-breakage-chance-control'
  );
  const toolBreakageChanceCardBlock = blockFor(
    '.fabricate-manager .manager-tool-breakage-chance-card'
  );
  const toolBreakageChanceSliderBlock = blockFor(
    '.fabricate-manager .manager-tool-breakage-chance-card .manager-chance-slider'
  );
  const dropModifierListBlock = blockFor('.fabricate-manager .manager-drop-modifier-list');
  const dropModifierPillBlock = blockFor('.fabricate-manager .manager-drop-modifier-pill');
  const positiveDropModifierPillBlock = blockFor(
    '.fabricate-manager .manager-drop-modifier-pill.is-positive'
  );
  const negativeDropModifierPillBlock = blockFor(
    '.fabricate-manager .manager-drop-modifier-pill.is-negative'
  );
  const dropModifierOverflowBlock = blockFor('.fabricate-manager .manager-drop-modifier-overflow');
  const dropEditorInputBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))'
  );
  const dropEditorValuesBlock = blockFor('.fabricate-manager .manager-drop-editor-values');
  const dropEditorRatePercentBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card .manager-drop-rate-percent input[type="number"]'
  );
  const dropEditorRateValueBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-value'
  );
  const dropEditorRateInputBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-percent input[type="number"]'
  );
  const dropEditorRateSuffixBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-percent > span[aria-hidden="true"]'
  );
  const dropEditorRateControlBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control'
  );
  const dropEditorRateTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-track'
  );
  const dropEditorRateFillBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-fill'
  );
  const dropEditorRateRangeBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]'
  );
  const dropEditorRateWebkitTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]::-webkit-slider-runnable-track'
  );
  const dropEditorRateMozTrackBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] .manager-drop-rate-control input[type="range"]::-moz-range-track'
  );
  const dropEditorCountBlock = blockFor('.fabricate-manager .manager-drop-count-editor');
  const dropEditorCountInputBlock = blockFor(
    '.fabricate-manager .manager-drop-count-editor input[type="text"]'
  );
  const dropEditorInspectorCountInputBlock = blockFor(
    '.fabricate-manager .manager-drop-editor-card .manager-drop-count-editor[data-gathering-drop-inspector-count] input[type="text"]'
  );
  const dropInspectorButtonBlock = blockFor(
    '.fabricate-manager .manager-drop-inspector-stack .manager-button'
  );
  const dropInspectorIconButtonBlock = blockFor(
    '.fabricate-manager .manager-drop-inspector-stack .manager-icon-button'
  );
  const dropInspectorSearchInputBlock = blockFor(
    '.fabricate-manager .manager-drop-inspector-stack .manager-search input'
  );
  const dropInspectorCharacterFieldBlock = blockFor(
    '.fabricate-manager .manager-character-modifier-row-card .manager-field :is(select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]))'
  );
  const dropInspectorCharacterOperatorBlock = blockFor(
    '.fabricate-manager .manager-character-modifier-operator-select select'
  );
  const dropEditorActionsBlock = blockFor('.fabricate-manager .manager-drop-editor-actions');
  const dropInspectorStackBlock = blockFor('.fabricate-manager .manager-drop-inspector-stack');
  const dropInspectorRouteBlock = blockFor(
    '.fabricate-manager[data-manager-view="gathering-task-edit"] .manager-inspector'
  );
  const dropInspectorDividerBlock = blockFor('.fabricate-manager .manager-drop-inspector-divider');
  const dropInspectorScrollBlock = blockFor('.fabricate-manager .manager-drop-inspector-scroll');
  const dropQuantityCellBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-drop-row > .manager-drop-quantity-cell'
  );
  const dropQuantityInputBlock = blockFor(
    '.fabricate-manager .manager-drop-quantity-cell input[type="text"]'
  );
  const dropQuantityInputOverrideBlock = blockFor(
    '.fabricate-manager .manager-gathering-task-edit-view .manager-drop-quantity-cell input[type="text"]'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const taskEditorIntermediateQuery = css.slice(
    css.indexOf('@container fabricate-manager (max-width: 1320px)'),
    css.indexOf('@container fabricate-manager (max-width: 1120px)')
  );

  assert.ok(
    toolbarBlock.includes('max-height: 112px;') && toolbarBlock.includes('overflow-y: auto;'),
    'task toolbar should stay bounded when filters wrap or labels are long'
  );
  assert.ok(
    panelBlock.includes('grid-template-rows: auto minmax(0, 1fr) auto;'),
    'task panel should reserve toolbar, table scroll, and pagination rows'
  );
  assert.ok(
    tableBlock.includes('--fab-manager-gathering-task-grid:'),
    'task browser should define a compact desktop grid'
  );
  assert.ok(!tableBlock.includes('reorder'), 'task browser should not reserve a reorder column');
  assert.ok(
    rowBlock.includes('grid-template-columns: var(--fab-manager-gathering-task-grid);'),
    'task rows should use the shared task grid'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);'),
    'task identity should reserve thumbnail space'
  );
  assert.ok(
    toolsRowBlock.includes('position: relative;'),
    'tool rows should anchor the dirty pip overlay without involving header flow'
  );
  // SELECTION IS AN ACCENT EDGE AND THE ACTIVE FILL (issue 1373). This asserted
  // `--fab-border-strong` against a `--fab-surface-soft` fill — roughly an 11-level luminance
  // step over the row's own overlay, which reads as an accident of lighting rather than as a
  // chosen row — and forbade the accent alongside it. The reference marks a selected row the
  // way it marks every other chosen thing on these screens: `--fab-accent-border` with
  // `--fab-surface-active`.
  //
  // THE INSET MARKER STAYS FORBIDDEN, and that half of the original ratchet is intact: an
  // accent BORDER is the edge of the card, while `box-shadow: inset 3px 0 0` is a second
  // vocabulary this list does not use anywhere else.
  assert.ok(
    toolsSelectedListRowBlock.includes('border-color: var(--fab-accent-border);') &&
      toolsSelectedListRowBlock.includes('background: var(--fab-surface-active);') &&
      toolsSelectedListRowBlock.includes('box-shadow: none;') &&
      !toolsSelectedListRowBlock.includes('box-shadow: inset 3px 0 0 var(--fab-accent);'),
    'a selected tool row takes the accent edge and the active fill, never an inset line marker'
  );
  assert.ok(
    toolsSelectedRowBlock.includes('border-color: var(--fab-accent-border);') &&
      toolsSelectedRowBlock.includes('box-shadow: none;'),
    'and the shared row rule agrees with it rather than stating a second answer'
  );
  assert.equal(
    toolsSelectedListRowBlock.includes('var(--fab-success'),
    false,
    'never the SUCCESS family: green is this screen `Enabled` tone, and one colour cannot say ' +
      'both "selected" and "enabled" on a list whose every row carries an enable switch'
  );
  assert.ok(
    toolsIdentityBlock.includes('width: 100%;'),
    'tool identity drop zones should fill the stable component column'
  );
  assert.ok(
    editorBlock.includes('grid-auto-rows: auto;'),
    'task edit route should size rows to each card so sections can be reordered; the fixed-height cards (component browser, drops) set their own height'
  );
  assert.ok(
    editorBlock.includes('overflow: auto;'),
    'task editor should allow vertical scrolling without horizontal overflow'
  );
  assert.ok(
    availabilityBlock.includes('grid-template-columns: repeat(2, minmax(160px, 1fr));'),
    'task availability controls should form a stable two-column grid'
  );
  assert.ok(
    componentBrowserBlock.includes('height: 340px;') &&
      componentBrowserBlock.includes('max-height: 340px;') &&
      componentBrowserBlock.includes('overflow: hidden;'),
    'component browser should own a fixed bounded height that keeps the footer visible'
  );
  assert.ok(
    componentBrowserBlock.includes('grid-template-rows: auto auto minmax(0, 1fr) auto;'),
    'component browser should reserve header, optional pills, card scroll, and footer rows'
  );
  assert.ok(
    componentPillsBlock.includes('border-top: 1px solid var(--fab-border);'),
    'component browser selected tags should occupy a distinct pill row'
  );
  assert.ok(
    selectedTagPillBlock.includes('background: var(--fab-success-soft);'),
    'selected component tag filters should use removable selected-tag pill styling'
  );
  assert.ok(
    componentBrowserControlsBlock.includes(
      'grid-template-columns: minmax(180px, 0.9fr) minmax(180px, 0.9fr);'
    ),
    'component browser should keep name and tag search in a compact control grid'
  );
  assert.ok(
    componentBrowserScrollBlock.includes('overflow: hidden auto;'),
    'component browser card area should scroll internally without horizontal overflow'
  );
  assert.ok(
    componentGridBlock.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'),
    'component browser should use a three-column card grid'
  );
  assert.ok(
    componentCardBlock.includes('grid-template-columns: 38px minmax(0, 1fr) 18px;') &&
      componentCardBlock.includes('min-height: 72px;'),
    'component browser cards should reserve image, copy, and grip columns'
  );
  assert.ok(
    componentCardCopySharedBlock.includes('text-overflow: ellipsis;'),
    'component card shared copy should truncate within the card'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-task-component-card-copy strong {\n  -webkit-line-clamp: 1;'
    ) &&
      css.includes(
        '.fabricate-manager .manager-task-component-card-copy > span:not(.manager-task-component-card-tags) {\n  -webkit-line-clamp: 1;'
      ),
    'component card name and description should clamp to one line'
  );
  assert.ok(
    componentCardGripBlock.includes('letter-spacing: 0;'),
    'component grip should avoid viewport-scaled or negative tracking'
  );
  assert.ok(
    componentBrowserFooterBlock.includes('border-top: 1px solid var(--fab-border);'),
    'component browser should own a pagination footer'
  );
  assert.ok(
    componentBrowserFooterPaginationBlock.includes('background: transparent;'),
    'component browser footer should not nest pagination chrome'
  );
  assert.ok(
    dropCardBlock.includes('--fab-manager-task-drop-table-visible-height: 262px;'),
    'drop rules card should define an exact table viewport equal to header plus three rows'
  );
  assert.ok(
    dropCardBlock.includes(
      'grid-template-rows: auto var(--fab-manager-task-drop-table-visible-height) auto;'
    ),
    'drop rules card should keep the table viewport definite between the card header and footer'
  );
  assert.ok(
    dropCardBlock.includes('height: 410px;') && dropCardBlock.includes('max-height: 410px;'),
    'task editor drop rules card should be exactly tall enough for the three-row table viewport and footer'
  );
  assert.ok(
    dropHeaderBlock.includes('grid-template-columns: minmax(0, 1fr) auto;'),
    'drop rules header should put copy left and controls right'
  );
  assert.ok(
    dropControlsBlock.includes('display: inline-flex;') &&
      dropControlsBlock.includes('justify-content: flex-end;'),
    'drop rules search and add action should share a compact toolbar'
  );
  assert.ok(
    dropSearchBlock.includes('min-width: min(220px, 100%);'),
    'drop rules search should not collapse until its icon overlaps the text area'
  );
  assert.ok(
    dropSearchInputBlock.includes('padding-left: 36px;'),
    'drop rules search input should reserve text inset for the leading search icon'
  );
  assert.ok(
    dropFooterBlock.includes('border-top: 1px solid var(--fab-border);'),
    'drop rules count should live in a footer area with pagination'
  );
  assert.ok(
    dropFooterPaginationBlock.includes('background: transparent;'),
    'drop rules footer should not nest pagination chrome'
  );
  assert.ok(
    dropScrollBlock.includes('height: var(--fab-manager-task-drop-table-visible-height);') &&
      dropScrollBlock.includes('max-height: var(--fab-manager-task-drop-table-visible-height);'),
    'drop rules table scroll region should show exactly three complete rows before scrolling'
  );
  assert.ok(
    dropScrollBlock.includes('padding: var(--fab-space-3) 0 0;'),
    'drop rules table scroll region should not add horizontal inset'
  );
  assert.ok(
    dropScrollBlock.includes('overflow: hidden auto;'),
    'drop rules table should suppress horizontal scroll while retaining vertical scrolling'
  );
  assert.ok(
    dropTableBlock.includes('--fab-manager-task-drop-grid:'),
    'task editor drop rows should define compact desktop geometry'
  );
  assert.ok(
    dropTableBlock.includes('minmax(0, 1.05fr)') &&
      dropTableBlock.includes('minmax(220px, 1.35fr)') &&
      dropTableBlock.includes('56px') &&
      dropTableBlock.includes('minmax(180px, 1.65fr)'),
    'drop row desktop grid should keep component/chance/quantity geometry while widening modifiers'
  );
  assert.equal(
    dropTableBlock.includes('88px'),
    false,
    'drop row desktop grid should not reserve a row actions column'
  );
  assert.ok(
    dropTableBlock.includes('width: 100%;') && dropTableBlock.includes('max-width: 100%;'),
    'drop table should fill the drop rules card without exceeding it'
  );
  assert.ok(
    dropTableHeadBlock.includes('padding: 0;'),
    'drop rules header row should clear generic table-head padding so columns align with value rows'
  );
  assert.ok(
    dropRowBlock.includes('grid-template-columns: var(--fab-manager-task-drop-grid);'),
    'drop rows should use the shared single-line editor grid'
  );
  assert.ok(
    dropRowBlock.includes('gap: 0;') && dropRowBlock.includes('max-width: 100%;'),
    'drop rows should use separators instead of gap-driven overflow'
  );
  assert.ok(
    firstDropRowBlock.includes('border-top: 0;'),
    'first drop row should not double the header bottom border'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-gathering-task-drop-row {\n  min-height: 72px;'),
    'drop rows should be tall enough for two visible modifier chip lines'
  );
  assert.ok(
    dropCellBlock.includes('padding: var(--fab-space-1) var(--fab-space-2);') &&
      dropCellBlock.includes('box-sizing: border-box;'),
    'drop cells should keep padding inside full-width rows'
  );
  assert.ok(
    dropCellSeparatorBlock.includes('border-left: 1px solid var(--fab-border);'),
    'drop cells should use vertical separators'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-gathering-task-drop-row.is-drop-active'),
    'drop rows should expose a full-row active drop target state'
  );
  assert.ok(
    selectedDropRowBlock.includes('background: var(--fab-success-soft);') &&
      selectedDropRowBlock.includes('var(--fab-accent)'),
    'selected drop rows should use the component-browser success/accent family'
  );
  assert.ok(
    selectedDropRowBlock.includes('inset 0 1px 0 var(--fab-border-strong)') &&
      selectedDropRowBlock.includes('inset 0 -1px 0 var(--fab-border-strong)'),
    'selected drop row outline should avoid a right edge next to the card border'
  );
  assert.equal(
    selectedDropRowBlock.includes('inset 0 0 0 1px'),
    false,
    'selected drop row should not draw a full inset border against the card edge'
  );
  assert.equal(
    selectedDropRowBlock.includes('var(--fab-info'),
    false,
    'selected drop rows should not use the info family'
  );
  assert.equal(
    selectedDropRowBlock.includes('var(--fab-warning'),
    false,
    'selected drop rows should not use the warning family'
  );
  assert.ok(
    dropComponentButtonBlock.includes('grid-template-columns: 42px minmax(0, 1fr);') &&
      dropComponentButtonBlock.includes('min-height: 40px;'),
    'drop component cells should keep compact thumbnail/name geometry'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-drop-empty-component {\n  min-height: 52px;\n  padding: var(--fab-space-chip) var(--fab-space-2);\n  border: 1px dashed var(--fab-border-strong);'
    ),
    'empty component placeholders should show the full drop-zone boundary'
  );
  assert.ok(
    dropEmptyComponentIconBlock.includes('border: 0;'),
    'empty component placeholders should avoid a nested icon-only dashed border'
  );
  assert.ok(
    dropComponentCopyBlock.includes('align-content: center;'),
    'drop component text should be vertically centered after description removal'
  );
  assert.ok(
    dropComponentNameBlock.includes('display: -webkit-box;') &&
      dropComponentNameBlock.includes('-webkit-line-clamp: 2;') &&
      dropComponentNameBlock.includes('white-space: normal;'),
    'drop component names should wrap to two lines instead of relying on descriptions'
  );
  assert.ok(
    dropRateBlock.includes('display: block;'),
    'drop chance cell should expose one wrapped value'
  );
  assert.ok(
    dropRateValueBlock.includes('grid-template-columns: 52px minmax(0, 1fr);') &&
      dropRateValueBlock.includes('gap: var(--fab-space-1);'),
    'drop chance value should keep the row editable percent close to a wider slider'
  );
  assert.ok(
    dropRatePercentBlock.includes('position: relative;') &&
      dropRatePercentBlock.includes('display: block;'),
    'drop chance percent should overlay the suffix without taking slider width'
  );
  assert.ok(
    css.includes('--fab-drop-rate-none: #E26F6B;'),
    'drop chance slider should define a distinct exact-zero colour token'
  );
  assert.ok(
    dropRatePercentInputBlock.includes('height: 28px;') &&
      dropRatePercentInputBlock.includes('box-sizing: border-box;') &&
      dropRatePercentInputBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);'
      ) &&
      dropRatePercentInputBlock.includes('text-align: center;'),
    'drop chance row percent should keep its existing compact centered editable numeric field'
  );
  assert.ok(
    dropRatePercentInputOverrideBlock.includes('min-height: 28px;') &&
      dropRatePercentInputOverrideBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);'
      ) &&
      dropRatePercentInputOverrideBlock.includes('box-shadow: none;'),
    'drop chance row percent should override generic gathering task input chrome without affecting other fields'
  );
  assert.ok(
    css.includes(
      '.fabricate-slider .manager-drop-rate-percent > span[aria-hidden="true"] {\n  position: absolute;\n  right: 6px;'
    ) && css.includes('pointer-events: none;'),
    'drop chance row percent suffix should keep its existing placement'
  );
  assert.ok(
    dropRateControlBlock.includes('--fab-drop-rate-value: 1%;') &&
      dropRateControlBlock.includes('--fab-drop-rate-color: var(--fab-drop-rate-very-rare);'),
    'drop chance slider should expose value and tier colour variables'
  );
  assert.ok(
    dropRateTrackBlock.includes('left: var(--fab-chance-slider-thumb-radius);') &&
      dropRateTrackBlock.includes('right: var(--fab-chance-slider-thumb-radius);') &&
      dropRateTrackBlock.includes('background: var(--fab-overlay-dark-18);') &&
      dropRateTrackBlock.includes('overflow: hidden;'),
    'shared chance sliders should inset the clipped track to the thumb centers without endpoint tails'
  );
  assert.ok(
    dropRateFillBlock.includes('width: var(--fab-drop-rate-value);') &&
      dropRateFillBlock.includes('background: var(--fab-drop-rate-color);'),
    'Gathering chance sliders should retain their active-width rarity-derived fill'
  );
  assert.ok(
    continuousGradientFillBlock.includes('width: 100%;') &&
      continuousGradientFillBlock.includes('background: var(--fab-chance-slider-track-gradient);'),
    'configured chance sliders should paint their semantic gradient across the complete inset track'
  );
  assert.ok(
    dropRateRangeBlock.includes('appearance: none;') &&
      dropRateRangeBlock.includes('-webkit-appearance: none;') &&
      dropRateRangeBlock.includes('padding: 0;') &&
      dropRateRangeBlock.includes('background: transparent;') &&
      dropRateRangeBlock.includes('box-shadow: none;'),
    'drop chance range should clear native and Foundry host slider rendering'
  );
  assert.ok(
    dropRateRangeBlock.includes('accent-color: var(--fab-drop-rate-color);'),
    'drop chance native range should inherit the current tier colour'
  );
  assert.ok(
    dropRateWebkitTrackBlock.includes('border: 0;') &&
      dropRateWebkitTrackBlock.includes('background: transparent;'),
    'the WebKit native track should stay invisible behind the inset shared rail'
  );
  assert.ok(
    blockFor(
      '.fabricate-slider .manager-drop-rate-control input[type="range"]::-moz-range-track'
    ).includes('border: 0;'),
    'the Firefox native track should stay invisible behind the inset shared rail'
  );
  assert.ok(
    dropRateMozProgressBlock.includes('background: transparent;'),
    'the Firefox native progress segment should not create endpoint tails over the shared fill'
  );
  assert.ok(
    dropRateWebkitThumbBlock.includes('background: var(--fab-drop-rate-color);') &&
      dropRateMozThumbBlock.includes('background: var(--fab-drop-rate-color);'),
    'drop chance range thumbs should retain current-tier colour'
  );
  assert.ok(
    toolBreakageChanceCardBlock.includes('display: grid;') &&
      toolBreakageChanceCardBlock.includes('padding: var(--fab-space-3);') &&
      toolBreakageChanceCardBlock.includes('border: 1px solid var(--fab-border);'),
    'tool breakage chance should present the shared slider in a full-width configuration card'
  );
  assert.ok(
    toolBreakageChanceSliderBlock.includes('grid-template-columns: 72px minmax(0, 1fr);') &&
      toolBreakageChanceSliderBlock.includes('gap: var(--fab-space-3);'),
    'tool breakage chance should give its synchronized number field and slider comfortable space'
  );
  assert.ok(
    toolBreakageChanceControlBlock.includes('min-width: 0;'),
    'tool breakage chance should reuse the common slider rail without overflow'
  );
  assert.ok(
    guaranteedDropRateControlBlock.includes('var(--fab-drop-rate-guaranteed)') &&
      commonDropRateControlBlock.includes('var(--fab-drop-rate-common)') &&
      uncommonDropRateControlBlock.includes('var(--fab-drop-rate-uncommon)') &&
      rareDropRateControlBlock.includes('var(--fab-drop-rate-rare)') &&
      veryRareDropRateControlBlock.includes('var(--fab-drop-rate-very-rare)') &&
      legendaryDropRateControlBlock.includes('var(--fab-drop-rate-legendary)') &&
      noneDropRateControlBlock.includes('var(--fab-drop-rate-none)'),
    'drop chance control classes should map the selected rarity palette to the current value'
  );
  assert.ok(
    dropQuantityCellBlock.includes('display: flex;') &&
      dropQuantityCellBlock.includes('justify-content: center;') &&
      dropQuantityCellBlock.includes('padding: var(--fab-space-chip);'),
    'quantity cells should spend less horizontal space while centering the input'
  );
  assert.ok(
    dropQuantityInputBlock.includes('max-width: 44px;') &&
      dropQuantityInputBlock.includes('box-sizing: border-box;') &&
      dropQuantityInputBlock.includes('text-align: center;') &&
      dropQuantityInputBlock.includes('font-variant-numeric: tabular-nums;'),
    'quantity should remain a compact numeric text input sized for three digits'
  );
  assert.ok(
    dropQuantityInputOverrideBlock.includes('min-height: 28px;') &&
      dropQuantityInputOverrideBlock.includes('padding: var(--fab-space-1);'),
    'quantity should override generic gathering input padding without widening the column'
  );
  assert.ok(
    dropModifierListBlock.includes('flex-wrap: wrap;') &&
      dropModifierListBlock.includes('align-content: flex-start;'),
    'drop modifiers should wrap into a top-aligned chip group'
  );
  assert.ok(
    dropModifierListBlock.includes('max-height: 58px;') &&
      dropModifierListBlock.includes('overflow-y: auto;'),
    'drop modifiers should scroll after the two-line chip budget'
  );
  assert.ok(
    dropModifierPillBlock.includes('background: var(--fab-overlay-light-06);'),
    'drop modifier pills should use restrained neutral chip backgrounds'
  );
  assert.ok(
    positiveDropModifierPillBlock.includes('color: var(--fab-text);') &&
      negativeDropModifierPillBlock.includes('color: var(--fab-text);'),
    'drop modifier chips should avoid saturated text across the whole pill'
  );
  assert.ok(
    dropModifierOverflowBlock.includes('text-overflow: ellipsis;') &&
      dropModifierOverflowBlock.includes('white-space: nowrap;'),
    'the modifier overflow hint should stay a single clipped table label'
  );
  assert.ok(
    dropEditorInputBlock.includes(':not([type="range"])'),
    'selected drop inspector generic input chrome should not override row-style range sliders'
  );
  assert.ok(
    dropEditorInputBlock.includes('height: 28px;') &&
      dropEditorInputBlock.includes('min-height: 28px;') &&
      dropEditorInputBlock.includes('padding: var(--fab-space-2xs) var(--fab-space-2);'),
    'selected drop inspector generic inputs and selects should use compact 28px right-sidebar geometry'
  );
  assert.ok(
    dropEditorValuesBlock.includes('grid-template-columns: minmax(0, 1fr) 72px;') &&
      dropEditorValuesBlock.includes('align-items: end;'),
    'selected drop inspector should place chance and count in a compact two-column grid'
  );
  assert.ok(
    dropEditorRateValueBlock.includes('grid-template-columns: 64px minmax(0, 1fr);'),
    'selected drop inspector chance should widen only the right-menu percent column'
  );
  assert.ok(
    dropEditorRatePercentBlock.includes('height: 28px;') &&
      dropEditorRatePercentBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-2xs);'
      ) &&
      dropEditorRatePercentBlock.includes('background: var(--fab-overlay-dark-18);'),
    'selected drop inspector broad chance input rule should not carry the right-menu suffix padding'
  );
  assert.ok(
    dropEditorRateInputBlock.includes('height: 28px;') &&
      dropEditorRateInputBlock.includes('min-height: 28px;') &&
      dropEditorRateInputBlock.includes(
        'padding: var(--fab-space-1) var(--fab-space-4) var(--fab-space-1) var(--fab-space-chip);'
      ) &&
      dropEditorRateInputBlock.includes('box-shadow: none;'),
    'selected drop inspector chance input should keep compact row-style geometry without extra suffix padding'
  );
  assert.ok(
    dropEditorRateSuffixBlock.includes('right: 8px;'),
    'selected drop inspector percent suffix should sit away from three-digit values'
  );
  assert.ok(
    dropEditorRateControlBlock.includes('height: 28px;') &&
      dropEditorRateControlBlock.includes('padding: 0 var(--fab-space-2);') &&
      dropEditorRateControlBlock.includes('background: var(--fab-overlay-dark-18);') &&
      dropEditorRateControlBlock.includes('overflow: hidden;'),
    'selected drop inspector slider should own the dark backing box instead of relying on native range chrome'
  );
  assert.ok(
    dropEditorRateTrackBlock.includes('left: 7px;') &&
      dropEditorRateTrackBlock.includes('right: 7px;') &&
      dropEditorRateTrackBlock.includes('border: 0;') &&
      dropEditorRateTrackBlock.includes('background: var(--fab-overlay-dark-18);'),
    'selected drop inspector custom track should be inset to the thumb radius to avoid endpoint tails'
  );
  assert.ok(
    dropEditorRateFillBlock.includes('border-radius: 999px;'),
    'selected drop inspector fill should be rounded without relying on a wider track border'
  );
  assert.equal(
    dropRateTrackBlock.includes('linear-gradient'),
    false,
    'drop chance slider styling should keep the flat-ui no-gradient contract'
  );
  assert.equal(
    dropEditorRateTrackBlock.includes('linear-gradient'),
    false,
    'selected drop inspector slider styling should keep the flat-ui no-gradient contract'
  );
  assert.ok(
    dropEditorRateRangeBlock.includes('height: 26px;') &&
      dropEditorRateRangeBlock.includes('padding: 0;') &&
      dropEditorRateRangeBlock.includes('background: transparent;') &&
      dropEditorRateRangeBlock.includes('box-shadow: none;'),
    'selected drop inspector native range should remain a transparent thumb hit target over the custom track'
  );
  assert.ok(
    dropEditorRateWebkitTrackBlock.includes('border: 0;') &&
      dropEditorRateWebkitTrackBlock.includes('background: transparent;'),
    'selected drop inspector WebKit native range track should not draw over the custom track'
  );
  assert.ok(
    dropEditorRateMozTrackBlock.includes('border: 0;') &&
      dropEditorRateMozTrackBlock.includes('background: transparent;'),
    'selected drop inspector Firefox native range track should not draw over the custom track'
  );
  assert.ok(
    dropEditorCountBlock.includes('display: grid;') &&
      dropEditorCountBlock.includes('gap: var(--fab-space-chip);'),
    'selected drop inspector count editor should use a compact labeled field'
  );
  assert.ok(
    dropEditorCountInputBlock.includes('min-height: 28px;') &&
      dropEditorCountInputBlock.includes('text-align: center;'),
    'selected drop inspector count input should match row count input geometry'
  );
  assert.ok(
    dropEditorInspectorCountInputBlock.includes('height: 28px;') &&
      dropEditorInspectorCountInputBlock.includes('min-height: 28px;') &&
      dropEditorInspectorCountInputBlock.includes('padding: var(--fab-space-1);') &&
      dropEditorInspectorCountInputBlock.includes('box-shadow: none;'),
    'selected drop inspector count input should override generic inspector input chrome with chance-field geometry'
  );
  assert.ok(
    dropInspectorButtonBlock.includes('min-height: 28px;') &&
      dropInspectorButtonBlock.includes('padding: 0 var(--fab-space-2);'),
    'selected drop inspector text buttons should match the compact 28px sidebar rhythm'
  );
  assert.ok(
    dropInspectorIconButtonBlock.includes('width: 28px;') &&
      dropInspectorIconButtonBlock.includes('height: 28px;') &&
      dropInspectorIconButtonBlock.includes('flex: 0 0 28px;'),
    'selected drop inspector icon buttons should match the compact 28px sidebar rhythm'
  );
  assert.ok(
    dropInspectorSearchInputBlock.includes('height: 28px;') &&
      dropInspectorSearchInputBlock.includes('min-height: 28px;') &&
      dropInspectorSearchInputBlock.includes('padding-block: 0;'),
    'selected drop inspector search input should keep icon padding while using 28px height'
  );
  assert.ok(
    dropInspectorCharacterFieldBlock.includes('height: 28px;') &&
      dropInspectorCharacterFieldBlock.includes('min-height: 28px;') &&
      dropInspectorCharacterFieldBlock.includes(
        'padding: var(--fab-space-2xs) var(--fab-space-2);'
      ),
    'selected drop inspector character modifier fields should override shared 36px field height'
  );
  assert.ok(
    dropInspectorCharacterOperatorBlock.includes('height: 28px;') &&
      dropInspectorCharacterOperatorBlock.includes('min-height: 28px;') &&
      dropInspectorCharacterOperatorBlock.includes('padding: 0 var(--fab-space-chip);'),
    'selected drop inspector character modifier operator select should keep compact 28px height'
  );
  assert.ok(
    dropEditorActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));') &&
      dropEditorActionsBlock.includes('margin-top: 0;'),
    'selected drop rule actions should sit beneath the inspector title row'
  );
  assert.ok(
    dropInspectorStackBlock.includes('grid-template-rows: auto auto minmax(0, 1fr);'),
    'selected drop inspector should reserve fixed header, divider, and lower scroll rows'
  );
  assert.ok(
    dropInspectorStackBlock.includes('height: 100%;') &&
      dropInspectorStackBlock.includes('overflow: visible;'),
    'selected drop inspector stack should allow the divider to span the full right inspector width'
  );
  assert.ok(
    dropInspectorRouteBlock.includes('overflow: hidden;'),
    'gathering task edit inspector should delegate selected-drop scrolling to the lower viewport'
  );
  assert.ok(
    dropInspectorDividerBlock.includes('width: calc(100% + 24px);') &&
      dropInspectorDividerBlock.includes(
        'margin: var(--fab-space-3) calc(-1 * var(--fab-space-3)) 0;'
      ),
    'selected drop inspector divider should bleed through the right inspector padding'
  );
  assert.ok(
    dropInspectorDividerBlock.includes('height: 1px;') &&
      dropInspectorDividerBlock.includes('background: var(--fab-border);'),
    'selected drop inspector should render a visible divider below the header'
  );
  assert.ok(
    dropInspectorScrollBlock.includes('overflow: hidden auto;'),
    'selected drop lower editor content should own vertical scrolling without horizontal overflow'
  );
  assert.ok(
    dropInspectorScrollBlock.includes('padding-top: var(--fab-space-3);') &&
      dropInspectorScrollBlock.includes('gap: var(--fab-space-3);'),
    'selected drop scroll viewport should visually separate lower cards from the divider'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-drop-actions'),
    false,
    'drop row actions should not reserve row layout or styling'
  );
  assert.equal(
    taskEditorIntermediateQuery.includes(
      '.manager-gathering-task-drop-row {\n    grid-template-columns: minmax(0, 1fr);'
    ),
    false,
    'task editor should not stack drop rows at the intermediate desktop width'
  );
  assert.ok(
    taskEditorIntermediateQuery.includes('minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr)'),
    'intermediate task editor drop grid should preserve drop chance width while widening modifiers'
  );
  assert.ok(
    dropTableRankedBlock.includes(
      '--fab-manager-task-drop-grid: 44px minmax(0, 0.92fr) minmax(220px, 1.35fr) 56px minmax(180px, 1.65fr);'
    ),
    'ranked-mode drop grid should prepend a narrow 44px rank column and take width from the component column while preserving drop chance and quantity widths'
  );
  assert.ok(
    taskEditorIntermediateQuery.includes(
      '--fab-manager-task-drop-grid: 44px minmax(0, 0.96fr) minmax(154px, 1.04fr) 54px minmax(150px, 1.38fr);'
    ),
    'intermediate ranked-mode drop grid should keep drop chance and quantity widths while reducing the component column'
  );
  assert.ok(
    dropRankCellBlock.includes('display: flex;') &&
      dropRankCellBlock.includes('flex-direction: column;'),
    'rank cell should stack the up button, label, and down button vertically'
  );
  assert.ok(
    dropRankValueBlock.includes('text-align: center;') &&
      dropRankValueBlock.includes('line-height: 1;'),
    'rank value should sit centered between the buttons with a tight line height'
  );
  assert.ok(
    dropRankButtonBlock.includes('width: 18px;') && dropRankButtonBlock.includes('height: 18px;'),
    'rank reorder buttons should be small enough to stack inside the row'
  );
  assert.ok(
    mediumQuery.includes(
      '.fabricate-manager .manager-gathering-task-drop-table-head,\n  .fabricate-manager .manager-gathering-task-drop-row'
    ) && mediumQuery.includes('grid-template-columns: var(--fab-manager-task-drop-grid);'),
    'medium manager layout should preserve the drop row grid and headers instead of duplicate row labels'
  );
  assert.equal(
    css.includes(
      '.fabricate-manager .manager-gathering-task-row .manager-environment-reorder-stack'
    ),
    false,
    'task rows should not render environment reorder controls'
  );
});

// EACH CONTROL IS WRAPPED IN A BARE `<span class="fabricate-slider">` (issue 1508), and the shape
// of the repair is load-bearing rather than cosmetic. `ChanceSlider` writes
// `manager-drop-rate-control` on a CHILD of its root span, so every rule this fixture depends on
// re-roots to a DESCENDANT chain — `.fabricate-slider .manager-drop-rate-control`,
// `.fabricate-slider .manager-drop-rate-track`, `.fabricate-slider .manager-drop-rate-fill` and the
// six `input[type="range"]` rules beneath them. A token added to the control ELEMENT matches none
// of those, so it would satisfy `searchable-popover-area-scope.test.js`'s ancestry clause — which
// reads an element's own classes as part of its ancestry — while leaving this test measuring an
// unstyled span, and the `leftInset` assertion below is the only thing in the repository that can
// tell the two repairs apart.
//
// The wrapper moves nothing it is measuring: no rule matches `.fabricate-slider` alone (every
// family rule is either a compound with a `manager-*` class or a descendant chain), each control
// keeps its own inline `width: 240px`, and every assertion below is relative to the control's own
// rect.
test('chance slider rails clip continuous Tool gradients at thumb-centre endpoints without changing Gathering fill', async () => {
  const context = await openLayoutContext({
    viewport: { width: 640, height: 240 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <style>${css}</style><style>${partiesTabScoped.css}</style>
      <main class="fabricate-manager" style="padding: 24px;">
        <span class="fabricate-slider">
        <span
          class="manager-drop-rate-control has-continuous-gradient"
          data-slider="tool"
          style="width: 240px; --fab-drop-rate-value: 62%; --fab-drop-rate-color: var(--fab-badge-gold); --fab-chance-slider-track-gradient: linear-gradient(90deg, var(--fab-success) 0%, var(--fab-warning) 33%, var(--fab-badge-gold) 66%, var(--fab-danger) 100%);"
        >
          <span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>
          <input type="range" min="0" max="100" value="62">
        </span>
        </span>
        <span class="fabricate-slider">
        <span
          class="manager-drop-rate-control is-uncommon"
          data-slider="gathering"
          style="width: 240px; --fab-drop-rate-value: 40%; --fab-drop-rate-color: var(--fab-drop-rate-uncommon);"
        >
          <span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>
          <input type="range" min="0" max="100" value="40">
        </span>
        </span>
      </main>
    `);

    const report = await page.evaluate(() => {
      const inspect = (kind) => {
        const control = document.querySelector(`[data-slider="${kind}"]`);
        const track = control.querySelector('.manager-drop-rate-track');
        const fill = control.querySelector('.manager-drop-rate-fill');
        const controlRect = control.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        const fillRect = fill.getBoundingClientRect();
        const fillStyle = getComputedStyle(fill);
        return {
          leftInset: trackRect.left - controlRect.left,
          rightInset: controlRect.right - trackRect.right,
          trackWidth: trackRect.width,
          fillWidth: fillRect.width,
          fillOffset: fillRect.left - trackRect.left,
          backgroundImage: fillStyle.backgroundImage,
          backgroundColor: fillStyle.backgroundColor,
        };
      };
      return {
        tool: inspect('tool'),
        gathering: inspect('gathering'),
      };
    });

    assert.equal(report.tool.leftInset, 7);
    assert.equal(report.tool.rightInset, 7);
    assert.equal(report.gathering.leftInset, 7);
    assert.equal(report.gathering.rightInset, 7);
    assert.ok(
      Math.abs(report.tool.fillWidth - (report.tool.trackWidth - 2)) <= 0.1,
      'Tool gradient should occupy the full clipped track inside its border'
    );
    assert.equal(report.tool.fillOffset, 1);
    assert.match(report.tool.backgroundImage, /^linear-gradient\(/);
    assert.ok(
      Math.abs(report.gathering.fillWidth / (report.gathering.trackWidth - 2) - 0.4) <= 0.01,
      'Gathering should retain a percentage-width fill'
    );
    assert.equal(report.gathering.backgroundImage, 'none');
    assert.notEqual(report.gathering.backgroundColor, 'rgba(0, 0, 0, 0)');
  } finally {
    await context.close();
  }
});

// The chance slider paints a coloured fill in a 6px track BEHIND a transparent range
// input, so anything that gives that input a background hides the bar completely and
// leaves only the thumb — which reads as "the slider renders a dot and no bar".
//
// The gathering edit views carry a blanket field rule over `:is(input…, select, textarea)`
// that computes to (0,4,1) and outranks the slider's own (0,3,1) reset. It excluded
// checkbox and radio but not range, so every drop row in the task and event editors lost
// its bar while the inspector — whose twin rule already excluded range — kept it.
//
// Asserted on the RENDERED background rather than on the selector text, so a future rule
// that reintroduces a background by some other route fails too (issue 883).
test('a range input inside the gathering edit views stays transparent for the slider fill', async () => {
  const context = await openLayoutContext({ viewport: { width: 900, height: 200 } });
  try {
    for (const view of ['manager-gathering-task-edit-view', 'manager-gathering-event-edit-view']) {
      const page = await context.newPage();
      try {
        await page.setContent(
          `<style>${css}</style>` +
            `<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate"><div class="${view}">` +
            '<div class="manager-gathering-task-drop-row" role="row" style="width:640px">' +
            '<span role="cell" class="manager-drop-cell manager-drop-rate-cell">' +
            '<span class="fabricate-slider manager-chance-slider manager-drop-rate-value">' +
            '<span class="manager-chance-slider-control manager-drop-rate-control is-common" ' +
            'style="--fab-drop-rate-value:90%; --fab-drop-rate-color:#5EC3B0;">' +
            '<span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>' +
            '<input type="range" min="0" max="100" step="1" value="90"/>' +
            '</span></span></span></div></div></div>'
        );
        const seen = await page.evaluate(() => {
          const input = document.querySelector('input[type="range"]');
          const fill = document.querySelector('.manager-drop-rate-fill');
          return {
            inputBackground: getComputedStyle(input).backgroundColor,
            fillWidth: Math.round(fill.getBoundingClientRect().width),
            fillBackground: getComputedStyle(fill).backgroundColor,
          };
        });
        assert.equal(
          seen.inputBackground,
          'rgba(0, 0, 0, 0)',
          `${view}: the range input must stay transparent or it hides the slider fill, got ${seen.inputBackground}`
        );
        assert.ok(
          seen.fillWidth > 0 && seen.fillBackground !== 'rgba(0, 0, 0, 0)',
          `${view}: the slider fill must render, got ${seen.fillWidth}px ${seen.fillBackground}`
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
});

// The gathering task library's inspector rail stacks three cards: "Gathering task details",
// "Drops summary" and "Used in environments". The middle one restated the whole
// `.manager-inspector-card` contract and then diverged on the two values it changed — a
// `--fab-bg-3` fill instead of the shell's, and 16px of horizontal padding instead
// of 12px — so it read as a different KIND of card from its neighbours.
//
// Asserted on the RENDERED box rather than on the absence of a selector, so a fill
// reintroduced by any route (a new rule, an ancestor, a different class) fails too, and so
// this stays true if the shell's own values are ever retuned (issue 883).
test('the gathering inspector rail cards render as one card, not three treatments', async () => {
  const context = await openLayoutContext({ viewport: { width: 420, height: 600 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style>` +
        '<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">' +
        '<aside class="manager-inspector" style="width:320px">' +
        '<section class="fabricate-card manager-inspector-card" data-card="details">' +
        '<h3 class="manager-card-title">Gathering task details</h3><p>Three facts</p>' +
        '</section>' +
        '<section class="fabricate-card manager-inspector-card" data-task-drops-summary data-card="drops">' +
        '<h3 class="manager-card-title">Drops summary</h3>' +
        '<div class="manager-task-drops-summary-list"><span class="manager-task-drop-summary-chip">' +
        '<span class="manager-task-drop-summary-label">Nightshade</span>' +
        '<strong class="manager-task-drop-summary-percent">80%</strong></span></div>' +
        '</section>' +
        '<section class="fabricate-card manager-inspector-card manager-task-environment-usage-card" data-card="usage">' +
        '<h3 class="manager-card-title">Used in environments</h3><p>Not used yet.</p>' +
        '</section>' +
        '</aside></div>'
    );
    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-card]')).map((card) => {
        const style = getComputedStyle(card);
        return {
          card: card.dataset.card,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          borderRadius: style.borderTopLeftRadius,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          width: Math.round(card.getBoundingClientRect().width),
        };
      })
    );

    const [details, drops, usage] = measured;
    assert.equal(measured.length, 3, 'the fixture should render all three rail cards');
    // A real fill, not a transparent card that trivially "matches".
    assert.notEqual(
      details.backgroundColor,
      'rgba(0, 0, 0, 0)',
      `the shared card shell should paint a fill, got ${details.backgroundColor}`
    );
    for (const property of [
      'backgroundColor',
      'borderColor',
      'borderWidth',
      'borderRadius',
      'padding',
      'width',
    ]) {
      assert.equal(
        drops[property],
        details[property],
        `drops summary ${property} should match the details card, got ${drops[property]} vs ${details[property]}`
      );
      assert.equal(
        usage[property],
        details[property],
        `environment usage ${property} should match the details card, got ${usage[property]} vs ${details[property]}`
      );
    }
  } finally {
    await context.close();
  }
});

test('both converted chance-slider sites render a real fill, not a bare thumb', async () => {
  // The fixture is hand-written, so it is pinned to what the component actually renders —
  // otherwise a renamed class would leave this measuring markup the app never produces.
  const chanceSliderSource = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/ChanceSlider.svelte'),
    'utf8'
  );
  for (const claim of [
    'manager-chance-slider manager-drop-rate-value',
    'manager-chance-slider-number manager-drop-rate-percent',
    'manager-chance-slider-control manager-drop-rate-control',
    'manager-drop-rate-track',
    'manager-drop-rate-fill',
    'type="number"',
    'type="range"',
  ]) {
    assert.ok(
      chanceSliderSource.includes(claim),
      `the fixture assumes ChanceSlider renders ${claim}`
    );
  }

  const sites = [
    {
      name: 'gathering drop inspector',
      // The dense inspector treatment: 28px, matching the drop rows it mirrors.
      percentHeight: 28,
      markup:
        '<aside class="manager-inspector manager-drop-inspector-stack" style="width:320px">' +
        '<section class="fabricate-card manager-inspector-card manager-drop-editor-card">' +
        '<div class="manager-drop-editor-values">' +
        '<label class="fabricate-field manager-field manager-drop-rate-editor" data-gathering-drop-inspector-rate>' +
        `<span>Drop chance</span>${CHANCE_SLIDER_FIXTURE}</label>` +
        '</div></section></aside>',
    },
    {
      name: 'gathering event editor',
      // 36px, and deliberately NOT normalised to the inspector's 28px. This field is a
      // full-width form control in a normal editor card, so it takes the manager standard
      // `.manager-field` height; 28px is the DENSE treatment for a table cell and the
      // inspector rail. The divergence pre-dates this conversion and is a real difference
      // of context, not a second spelling of one control (issue 883).
      percentHeight: 36,
      markup:
        '<main class="manager-main manager-gathering-event-edit-view" style="width:640px">' +
        '<section class="manager-task-availability-card" data-gathering-event-drop-rate>' +
        '<div class="manager-task-availability-row">' +
        '<label class="fabricate-field manager-field manager-drop-rate-editor">' +
        `<span>Drop rate (%)</span>${CHANCE_SLIDER_FIXTURE}</label>` +
        '</div></section></main>',
    },
  ];

  const context = await openLayoutContext({ viewport: { width: 900, height: 260 } });
  try {
    for (const site of sites) {
      const page = await context.newPage();
      try {
        await page.setContent(
          `<style>${css}</style>` +
            `<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">${site.markup}</div>`
        );
        const seen = await page.evaluate(() => {
          const range = document.querySelector('input[type="range"]');
          const number = document.querySelector('.manager-drop-rate-percent input');
          const track = document.querySelector('.manager-drop-rate-track');
          const fill = document.querySelector('.manager-drop-rate-fill');
          return {
            rangeBackground: getComputedStyle(range).backgroundColor,
            fillWidth: Math.round(fill.getBoundingClientRect().width),
            trackWidth: Math.round(track.getBoundingClientRect().width),
            fillBackground: getComputedStyle(fill).backgroundColor,
            numberHeight: Math.round(number.getBoundingClientRect().height),
            numberWidth: Math.round(number.getBoundingClientRect().width),
          };
        });

        assert.equal(
          seen.rangeBackground,
          'rgba(0, 0, 0, 0)',
          `${site.name}: the range input must stay transparent or it hides the fill, got ${seen.rangeBackground}`
        );
        assert.ok(
          seen.trackWidth > 0,
          `${site.name}: the slider track must have width, got ${seen.trackWidth}px`
        );
        // Not merely present: at 80% the fill must cover most of the track, in its colour.
        assert.ok(
          seen.fillWidth > seen.trackWidth * 0.7,
          `${site.name}: the fill should span ~80% of the ${seen.trackWidth}px track, got ${seen.fillWidth}px`
        );
        assert.equal(
          seen.fillBackground,
          'rgb(94, 195, 176)',
          `${site.name}: the fill should paint its tier colour, got ${seen.fillBackground}`
        );
        // The number field moved from `[type="text"]` to `[type="number"]` in this
        // conversion; a rule still keyed on the old type leaves it at the unstyled default.
        assert.equal(
          seen.numberHeight,
          site.percentHeight,
          `${site.name}: the percent field should keep its ${site.percentHeight}px control height, got ${seen.numberHeight}px`
        );
        assert.ok(
          seen.numberWidth > 20,
          `${site.name}: the percent field should be laid out, got ${seen.numberWidth}px`
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
});

test('World Parties preserves the shared stacked rail and body layout at narrow widths', async () => {
  // The World route deliberately releases the unused inspector at desktop widths. Its route
  // rule is more specific than the shared 1120px stack, however, so this must be measured:
  // a source-text assertion would pass while the cascade left the two desktop tracks alive.
  const wide = await readWorkspaceGrid(1280, 'world', 'parties');
  assert.equal(wide.bodyColumns, 2, 'wide World Parties keeps its rail beside the full-width body');

  for (const width of [1100, 1024]) {
    const narrow = await readWorkspaceGrid(width, 'world', 'parties');
    assert.equal(
      narrow.bodyColumns,
      1,
      `World Parties uses the shared stacked rail/body layout at ${width}px`
    );
  }
});

test('World Parties keeps its card scroller and sibling pager independently reachable at 1100px', async () => {
  // `gathering-parties-tab.test.js` mounts this component and pins the sibling DOM. This
  // source join keeps the Chromium geometry below attached to those real rendered classes:
  // deleting or renaming either node fails here instead of leaving a stale layout fixture.
  const contentAt = partiesTabSource.indexOf('class="manager-travel-parties-content"');
  const footerAt = partiesTabSource.indexOf('class="manager-travel-parties-pagination"');
  assert.ok(contentAt > -1, 'the product component renders the card scroller class');
  assert.ok(footerAt > contentAt, 'the product component renders the sibling pager after it');

  const hash = partiesTabScoped.hashClass;
  const cards = Array.from(
    { length: 4 },
    (_, index) =>
      `<div class="manager-travel-parties-row ${hash}" data-manager-travel-party-id="party-${index + 1}"><div class="probe-card-editor">Party ${index + 1} editor</div></div>`
  ).join('');
  const productContractMarkup = `<div class="manager-travel-parties ${hash}">
    <div class="manager-travel-parties-content ${hash}">
      <div class="manager-travel-parties-list ${hash}">${cards}</div>
    </div>
    <div class="manager-travel-parties-pagination ${hash}" data-manager-party-pagination>
      ${pagerBarFixture({ probe: 'parties' })}
    </div>
  </div>`;

  const context = await openLayoutContext({
    viewport: { width: 1100, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const nav = Array.from(
      { length: 10 },
      (_, index) =>
        `<button class="manager-nav-button"><span class="manager-nav-label">Section ${index + 1}</span></button>`
    ).join('');
    // The component's OWN scoped CSS, after the global sheet — the same pairing every
    // other probe in this file uses (see the components-route probe above) and matching
    // `css: 'injected'`, which puts a component's block in `document.head` after Foundry's
    // `<link>`. Omitting it is what disabled this test: the fixture carried the real hash
    // class but nothing declared `.manager-travel-parties` or its content child, so the
    // pane rendered `display: block; overflow: visible`, the scroller sized to its cards,
    // and the opening `scrollRange > 100` precondition read 0 — a fixture that proved
    // nothing rather than a product regression.
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <style>${css}</style>
      <style>${partiesTabScoped.css}</style>
      <style>
        html, body { margin: 0; width: 100%; height: 100%; }
        :root { --font-primary: Arial, sans-serif; }
        .probe-titlebar { height: 28px; }
        .probe-header { height: 76px; }
        .probe-card-editor { height: 220px; }
      </style></head><body>
      <div class="fabricate fabricate-manager" data-fabricate-theme="fabricate"
        data-manager-view="world" data-world-travel-tab="parties">
        <div class="probe-titlebar"></div><div class="probe-header"></div>
        <div class="manager-body">
          <aside class="manager-rail"><nav class="manager-nav">${nav}</nav></aside>
          <main class="manager-main">
            <div class="manager-gathering-panel manager-travel-view is-parties-pane">${productContractMarkup}</div>
          </main>
        </div>
      </div></body></html>`);

    const report = await page.evaluate(() => {
      const body = document.querySelector('.manager-body');
      const main = document.querySelector('.manager-main');
      const pane = document.querySelector('.manager-travel-parties');
      const scroller = document.querySelector('.manager-travel-parties-content');
      const footer = document.querySelector('[data-manager-party-pagination]');
      const pagerControl = footer.querySelector('[data-pagination-size]');
      const before = footer.getBoundingClientRect();
      const paneBox = pane.getBoundingClientRect();
      const mainBox = main.getBoundingClientRect();
      const scrollRange = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = scroller.scrollHeight;
      const after = footer.getBoundingClientRect();
      const controlBox = pagerControl.getBoundingClientRect();
      const hit = document.elementFromPoint(
        controlBox.left + controlBox.width / 2,
        controlBox.top + controlBox.height / 2
      );
      const horizontalOverflow = [body, main, pane, scroller].map(
        (element) => element.scrollWidth - element.clientWidth
      );
      return {
        scrollRange,
        scrolledBy: scroller.scrollTop,
        scrollerOverflowY: getComputedStyle(scroller).overflowY,
        footerIsSibling: footer.parentElement === pane && !scroller.contains(footer),
        footerFullWidth:
          Math.abs(before.left - paneBox.left) <= 1 && Math.abs(before.right - paneBox.right) <= 1,
        footerVisible: before.top >= mainBox.top - 1 && before.bottom <= mainBox.bottom + 1,
        footerStable:
          Math.abs(before.top - after.top) <= 1 &&
          Math.abs(before.bottom - after.bottom) <= 1 &&
          Math.abs(before.left - after.left) <= 1 &&
          Math.abs(before.right - after.right) <= 1,
        pagerControlHit: hit === pagerControl || pagerControl.contains(hit),
        pagerControlVisible:
          controlBox.width > 0 &&
          controlBox.height > 0 &&
          controlBox.top >= mainBox.top - 1 &&
          controlBox.bottom <= mainBox.bottom + 1,
        bodyScrollRange: body.scrollHeight - body.clientHeight,
        bodyScrollTop: body.scrollTop,
        mainScrollRange: main.scrollHeight - main.clientHeight,
        horizontalOverflow,
      };
    });

    assert.ok(
      report.scrollRange > 100,
      `cards must overflow the pane (got ${report.scrollRange}px)`
    );
    assert.equal(report.scrollerOverflowY, 'auto', 'the card content remains the scroll node');
    assert.ok(report.scrolledBy > 0, 'the card scroller accepts an independent scroll');
    assert.equal(report.footerIsSibling, true, 'the pager is a sibling outside the scroll node');
    assert.equal(report.footerFullWidth, true, 'the sibling footer spans the full Parties pane');
    assert.equal(report.footerVisible, true, 'the footer remains visible inside the bounded main');
    assert.equal(report.footerStable, true, 'inner scrolling does not move the footer bounds');
    assert.equal(report.pagerControlVisible, true, 'a pager control remains visibly reachable');
    assert.equal(report.pagerControlHit, true, 'the visible pager control owns its pointer target');
    assert.ok(report.bodyScrollRange <= 1, 'the outer manager body must not scroll the footer');
    assert.equal(report.bodyScrollTop, 0, 'inner scrolling leaves the manager body fixed');
    assert.ok(report.mainScrollRange <= 1, 'the main column does not become a second scroller');
    assert.ok(
      report.horizontalOverflow.every((overflow) => overflow <= 1),
      `the 1100px route has no horizontal overflow (${report.horizontalOverflow.join(', ')})`
    );
  } finally {
    await context.close();
  }
});

test('a 680px manager container stacks each party body without viewport coupling or overflow', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const markup = withScopeHash(
      `<div class="fabricate-manager" style="container: fabricate-manager / inline-size; width: 680px">
        <div class="manager-party-body">
          <div class="manager-party-members-col"><button>Add a member</button></div>
          <div class="manager-party-travel-col"><button>Link an actor</button></div>
        </div>
      </div>`,
      'manager-party-body',
      partyExpandedBodyScoped.hashClass
    );
    await page.setContent(`<style>${partyExpandedBodyScoped.css}</style>${markup}`);
    const report = await page.evaluate(() => {
      const root = document.querySelector('.fabricate-manager');
      const body = document.querySelector('.manager-party-body');
      const rootRect = root.getBoundingClientRect();
      const controls = Array.from(body.querySelectorAll('button'), (button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          selfHit: hit === button || button.contains(hit),
        };
      });
      return {
        viewportWidth: document.documentElement.clientWidth,
        columns: getComputedStyle(body).gridTemplateColumns.split(' ').length,
        overflow: body.scrollWidth > body.clientWidth + 1,
        rootLeft: rootRect.left,
        rootRight: rootRect.right,
        controls,
      };
    });

    assert.ok(report.viewportWidth > 720, 'the outer browser viewport stays above the breakpoint');
    assert.equal(report.columns, 1, 'the 680px manager container selects one party column');
    assert.equal(report.overflow, false, 'the stacked body has no horizontal overflow');
    for (const control of report.controls) {
      assert.ok(control.width > 0 && control.height > 0, 'each editing control has a hit box');
      assert.ok(
        control.left >= report.rootLeft - 1,
        'each editing control starts inside the manager'
      );
      assert.ok(control.right <= report.rootRight + 1, 'each editing control remains reachable');
      assert.equal(control.selfHit, true, 'each editing control owns its pointer target');
    }
  } finally {
    await context.close();
  }
});
/**
 * Component, essence, environment, system and Knowledge browser layout, measured in a real browser (issue 1670).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { openLayoutContext } from '../helpers/layout-harness.js';

import {
  blockFor,
  blockIn,
  chipStyles,
  css,
  managerComponentDir,
} from './manager-layout-shared.js';
import { readRenderedKnowledgeGeometry } from './manager-layout-browsers-fixtures.js';

test('manager systems text and action cells are constrained at normal widths', () => {
  const nameBlock = blockFor('.fabricate-manager .manager-system-name');
  const descriptionBlock = blockFor('.fabricate-manager .manager-system-description');

  assert.ok(
    nameBlock.includes('-webkit-line-clamp: 2;'),
    'row names should clamp instead of overflowing rows'
  );
  assert.ok(
    descriptionBlock.includes('-webkit-line-clamp: 1;'),
    'row descriptions should stay on one line inside compact rows'
  );
  const gatheringNameClampBlock = css.match(
    /\.manager-environment-identity \.manager-system-name,[\s\S]*?\.manager-gathering-events-table \.manager-gathering-event-identity \.manager-system-name\s*\{[^}]*\}/
  );
  assert.ok(
    gatheringNameClampBlock &&
      gatheringNameClampBlock[0].includes(
        '.manager-gathering-tasks-table .manager-gathering-task-identity .manager-system-name'
      ) &&
      gatheringNameClampBlock[0].includes('-webkit-line-clamp: 1;'),
    'gathering identity rows (environments, tasks, and events) should clamp the name to one line so the 64px thumbnail drives row height and image + text stay centered'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-inspector-name {\n  display: -webkit-box;') &&
      css.includes('-webkit-line-clamp: 3;'),
    'inspector names should stay readable without dominating the inspector'
  );
  assert.ok(
    !css.includes('.fabricate-manager .manager-count-cluster'),
    'system row counts should not duplicate the inspector counts'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-system-row .manager-action-group'),
    'system row actions should have stable width rules'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-system-row:focus-visible'),
    'system rows should own the accessible focus state'
  );
  assert.ok(
    css.includes('overflow-wrap: break-word;'),
    'text should avoid single-letter wrapping unless needed for long strings'
  );
});

test('manager systems status cells use stable interactive on-off toggles', () => {
  const toggleBlock = blockFor('.fabricate-toggle.manager-status-toggle');
  const onBlock = blockFor('.fabricate-toggle.manager-status-toggle.is-on');
  const offBlock = blockFor('.fabricate-toggle.manager-status-toggle.is-off');
  const trackBlock = blockFor('.fabricate-toggle .manager-status-toggle-track');
  const knobBlock = blockFor('.fabricate-toggle .manager-status-toggle-knob');
  const onKnobBlock = blockFor(
    '.fabricate-toggle.manager-status-toggle.is-on .manager-status-toggle-knob'
  );
  const focusBlock = blockFor('.fabricate-toggle.manager-status-toggle:focus');
  const focusVisibleBlock = blockFor('.fabricate-toggle.manager-status-toggle:focus-visible');

  assert.ok(
    toggleBlock.includes('appearance: none;'),
    'system status toggles should normalize host button styles'
  );
  assert.ok(
    toggleBlock.includes('width: auto;'),
    'system status toggles should size to their On/Off label instead of filling the status column'
  );
  assert.ok(
    toggleBlock.includes('max-width: 78px;'),
    'system status toggles should keep compact geometry'
  );
  assert.ok(
    toggleBlock.includes('border-radius: 999px;'),
    'system status toggles should read as toggle buttons'
  );
  assert.ok(
    focusBlock.includes('outline: none;') && focusBlock.includes('box-shadow: none;'),
    'mouse focus should not inherit the host orange focus ring'
  );
  assert.ok(
    focusVisibleBlock.includes('outline: 2px solid var(--fab-accent);'),
    'keyboard focus should keep a manager focus-visible ring'
  );
  // ONE ACCENT FOR BOTH POSITIONS (issue 1373). This asserted the SUCCESS family for `on`,
  // beside the note below asserting a neutral track and a `--fab-text-secondary` (tan) knob for
  // `off` — so the manager's most semantically loaded control changed HUE when it changed
  // meaning, and the off position was the louder of the two. On the Tool rules editor that is
  // two accents for one control type on one screen: the enable switch sits inches from four
  // inherit switches. The reference builds every switch it draws from one pair —
  // `svTrack(on)` / `svKnob(on)` — which is the accent track with the on-accent knob when on,
  // and a raised neutral track with a subtle knob when off.
  assert.ok(
    onBlock.includes('var(--fab-accent)'),
    'the lit switch is the ACCENT family, which is the one accent this manager has'
  );
  assert.ok(
    onBlock.includes('--fab-toggle-knob: var(--fab-on-accent);'),
    'and its knob is the ink that family reads against'
  );
  // Issue 643: OFF is now NEUTRAL (bg-3 / border-strong).
  assert.ok(
    offBlock.includes('var(--fab-surface-raised)'),
    'disabled status should read as a neutral off switch, not a warning'
  );
  assert.ok(offBlock.includes('var(--fab-border)'), 'the off track should keep a visible edge');
  // AND ITS KNOB IS SUBTLE, NOT THE TAN SECONDARY INK (issue 1373). The off knob used to be the
  // brightest part of the whole control, so the switch shouted loudest in the position that
  // means "nothing is happening here".
  assert.ok(
    offBlock.includes('--fab-toggle-knob: var(--fab-text-subtle);'),
    'the off knob recedes; the lit position is the loud one'
  );
  // The switch sets `border: 0` on the BUTTON.
  const toggleHoverBlock = blockFor(
    '.fabricate-toggle.manager-status-toggle:not(:disabled, .is-disabled, .is-locked):hover .manager-status-toggle-track'
  );
  assert.ok(
    toggleHoverBlock.includes('border-color:') && toggleHoverBlock.includes('background:'),
    'hovering a switch must visibly change its track'
  );
  assert.equal(
    /\.manager-status-toggle:hover \{/.test(css),
    false,
    'a hover rule on the border-less button itself is dead code'
  );
  assert.ok(
    trackBlock.includes('width: 34px;'),
    'toggle track should use the 34x20 switch geometry'
  );
  assert.ok(
    trackBlock.includes('height: 20px;'),
    'toggle track should use the 34x20 switch geometry'
  );
  assert.ok(
    trackBlock.includes('background: var(--fab-toggle-track);'),
    'the track should carry the state colour'
  );
  assert.ok(knobBlock.includes('width: 14px;'), 'toggle knob should use the 14x14 switch geometry');
  assert.ok(
    knobBlock.includes('transition: transform'),
    'toggle knob should expose a clear state change'
  );
  // 34px track - 2px inset - 14px knob - 2px inset = 14px of travel (left 2 -> 16).
  assert.ok(
    onKnobBlock.includes('transform: translateX(14px);'),
    'enabled status should move the toggle knob on'
  );
});

// The three multi-select browsers state the ticked-row treatment ONCE. A per-studio copy is
// the variant the shared-primitive rule refuses, and it would drift the moment any one
// surface is re-toned.
test('the bulk-selected row state is one joined selector across every multi-select studio', () => {
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-component-row.is-bulk-selected,\n.fabricate-manager .manager-recipe-row.is-bulk-selected,\n.fabricate-manager .manager-essence-row.is-bulk-selected {'
    ),
    'the recipe and essence rows JOIN the component row rule rather than authoring a second block'
  );
  // ── A ROUTE MAY RESTATE THE TONE.
  const declarations = css.replaceAll(/[/][*][^]*?[*][/]/g, '');
  const ruleAt = (selector) => {
    const at = declarations.indexOf(selector);
    return at < 0 ? '' : declarations.slice(at, declarations.indexOf('}', at) + 1);
  };
  const bulkRows = [
    'manager-component-row',
    'manager-recipe-row',
    'manager-essence-row',
    'manager-scoped-list-row',
  ];
  for (const row of bulkRows) {
    // Every selector that names this row's ticked state.
    const needle = `.${row}.is-bulk-selected`;
    const written = declarations
      .split(needle)
      .slice(0, -1)
      .map((before) => before.slice(before.lastIndexOf('\n') + 1) + needle);
    const routed = written.filter((selector) => selector.includes('[data-manager-view='));
    assert.equal(
      written.length - routed.length,
      1,
      `${row}.is-bulk-selected must be written exactly once outside any route`
    );
    for (const selector of routed) {
      assert.ok(
        ruleAt(selector).includes('background: var(--fab-surface-active)'),
        `${selector} may restate the shared ticked fill, never re-tone it`
      );
    }
  }
  // The negative control on the widening.
  for (const row of ['manager-environment-row', 'manager-gathering-task-row']) {
    assert.equal(
      css.includes(`.${row}.is-bulk-selected`),
      false,
      `${row} carries no bulk selection, so it must not join the ticked-row treatment`
    );
  }

  // The selection ROW joins the same way, for the same reason.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-recipe-filter-row.is-selection,\n.fabricate-manager .manager-component-filter-row.is-selection,\n.fabricate-manager .manager-essence-filter-row.is-selection {'
    ),
    'every toolbar rendering the shared selection row joins one selection-row block'
  );
  assert.equal(
    css.includes('has no selection row at all'),
    false,
    "that block's stated reason is retired by issue 1010 and must not survive as a false claim"
  );
});

// Two long-label regressions the shared switch caused.
test('long-labelled switches escape the status cell geometry', () => {
  // (1) The library's grouping switch used to render as "Grou…".
  const groupToggleBlock = blockFor(
    '.fabricate-manager .manager-recipe-filter-row .manager-status-toggle[data-recipe-group-toggle],\n.fabricate-manager .manager-component-filter-row .manager-status-toggle[data-component-group-by-category]'
  );
  assert.ok(
    groupToggleBlock.includes('max-width: none;'),
    'the group-by-category switch must not inherit the 78px status-cell cap'
  );
  assert.ok(groupToggleBlock.includes('width: auto;'), 'a track-only switch is sized by its track');

  // The micro-label is what titles the control.
  const filterLabelBlock = blockFor(
    '.fabricate-manager .manager-recipe-filter-label,\n.fabricate-manager .manager-component-filter-label,\n.fabricate-manager .manager-essence-filter-label'
  );
  assert.ok(filterLabelBlock.includes('white-space: nowrap;'), 'a filter micro-label never wraps');
  assert.ok(
    filterLabelBlock.includes('text-transform: uppercase;'),
    'a filter micro-label is a micro-label'
  );
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-filter-divider,\n.fabricate-manager .manager-component-filter-divider'
    ).includes('width: 1px;'),
    'the view controls are ruled apart'
  );

  // (2) The Overview Enabled/Locked status cards are left-aligned rows (icon + copy
  // + switch), not the media column's centred, 14ch-clamped stack (issue 643).
  const statusCardBlock = blockFor('.fabricate-toggle-card.manager-recipe-status-card');
  const statusSubBlock = blockFor('.fabricate-toggle-card .manager-recipe-status-sub');
  assert.ok(
    statusCardBlock.includes('display: flex;') && statusCardBlock.includes('align-items: center;'),
    'a status card is an icon + copy + switch row, not a centred stack'
  );
  assert.equal(
    statusSubBlock.includes('max-width:'),
    false,
    'the status sub-line must not be clamped to the 96px media column width'
  );
  assert.equal(
    statusSubBlock.includes('text-align: center;'),
    false,
    'the status sub-line reads left-aligned, not centred mid-card'
  );
});

// Selection is an identity cue ("you are here").
test('a selected browser row reads as an identity cue in the accent family, not a status', () => {
  const selectedRowBlock = blockFor(
    '.fabricate-manager .manager-recipe-row.is-selected,\n.fabricate-manager .manager-component-row.is-selected,\n.fabricate-manager .manager-environment-row.is-selected,\n.fabricate-manager .manager-gathering-task-row.is-selected,\n.fabricate-manager .manager-essence-row.is-selected'
  );
  const selectedSystemBlock = blockFor('.fabricate-manager .manager-system-row.is-selected');
  const identityFocusBlock = blockFor(
    '.fabricate-manager .manager-system-identity:focus-visible,\n.fabricate-manager .manager-recipe-identity:focus-visible,\n.fabricate-manager .manager-component-identity:focus-visible,\n.fabricate-manager .manager-environment-identity:focus-visible,\n.fabricate-manager .manager-gathering-task-identity:focus-visible,\n.fabricate-manager .manager-essence-identity:focus-visible'
  );

  for (const [name, block] of [
    ['the selected row', selectedRowBlock],
    ['the selected system card', selectedSystemBlock],
  ]) {
    assert.ok(
      block.includes('background: var(--fab-surface-soft);'),
      `${name} uses a neutral soft surface`
    );
    assert.ok(
      block.includes('border-color: var(--fab-accent-border);'),
      `${name} rings in the accent`
    );
    assert.equal(
      block.includes('var(--fab-success-soft)'),
      false,
      `${name} must not wear the enabled-status colour`
    );
  }

  assert.ok(
    identityFocusBlock.includes('outline: 2px solid var(--fab-accent);'),
    'the identity focus ring follows the accent focus standard, not the success family'
  );
});

// The typographic contract (issue 643, `openspec/specs/ui-integration/spec.md`
// § Typographic contract): serif on names and headings, mono + tabular figures on
// every numeric. A count badge that shifts width between 9 and 10 moves the control
// beside it, so tabular-nums is part of the contract, not a nicety.
test('the typographic contract sets names in the serif and numerics in the mono face', () => {
  const SERIF = [
    '.fabricate-manager .manager-rail-title,\n.fabricate-manager .manager-card-title',
    '.fabricate-manager .manager-inspector-name',
    '.fabricate-manager .manager-recipe-name-row .manager-system-name',
    // The rail's selected system is now the `<select>`'s own value, not a static span.
    '.fabricate-manager .manager-scope-select',
    '.fabricate-manager .manager-recipe-ingredient-set-name',
    '.fabricate-manager input[data-recipe-field="name"]',
  ];
  for (const selector of SERIF) {
    assert.ok(
      blockFor(selector).includes('font-family: var(--fab-font-serif);'),
      `${selector} is a name or a heading and belongs in the serif`
    );
  }

  const MONO = [
    // Read out of `Chip.svelte`'s scoped block.
    '.manager-chip.is-mono',
    // Three classes, and issue 1509 keeps all three WITHOUT the reason issue 883 gave. That
    // reason was that three classes out-rank `Chip.svelte`'s own scoped `.manager-chip.svelte-
    // <hash>` block; specificity never decides that contest, because the sheet is loaded into
    // `layer(modules)` and a Svelte scoped block is injected unlayered, and an unlayered
    // declaration beats a layered one at any specificity. What this row still measures is the
    // one thing that IS true of it: the rule declares the mono face and tabular figures, which
    // `Chip` does not, so those two properties are the badge's from here. The class count is
    // preserved because changing it would be a change, and issue 1509 re-roots this family
    // without moving a frame. The rendering defect the old reason implies is issue 1507's.
    '.fabricate-tabs .manager-chip.manager-editor-tab-badge',
    // The composition list's mono pip is the shared ordered list's ordinal badge (issue 1512).
    '.fabricate-sortable-list-ordinal',
    '.fabricate-manager .manager-nav-count',
  ];
  for (const selector of MONO) {
    const block = selector.startsWith('.manager-chip')
      ? blockIn(chipStyles, selector)
      : blockFor(selector);
    assert.ok(
      block.includes('font-family: var(--fab-font-mono);'),
      `${selector} renders a number and belongs in the mono face`
    );
    assert.ok(
      block.includes('font-variant-numeric: tabular-nums;'),
      `${selector} must not change width between 9 and 10`
    );
  }

  // The last clause of the contract, applied.
  assert.equal(
    blockFor('.fabricate-manager .manager-recipe-io-counts').includes(
      'font-family: var(--fab-font-mono);'
    ),
    false,
    "the row's I/O readout is a phrase, not a numeric, and stays in the UI face"
  );
});

test('manager components browser defines drop target and compact responsive list geometry', () => {
  // Issue 676: the component library is a LIST.
  const listBlock = blockFor('.fabricate-manager .manager-components-list');
  const rowBlock = blockFor('.fabricate-manager .manager-component-row');
  const rowMetaBlock = blockFor('.fabricate-manager .manager-component-row-meta');
  // ROOTED AT THE CLASS THE PRIMITIVE EMITS (issue 1508).
  const toolbarBlock = Array.from(
    css.matchAll(/\.fabricate-filter-bar\.manager-toolbar\s*\{[\s\S]*?\}/g)
  )
    .map((match) => match[0])
    .join('\n');
  const dropBlock = blockFor('.fabricate-manager .manager-component-drop-zone');
  const identityBlock = blockFor('.fabricate-manager .manager-component-identity');
  const componentCopyBlock = blockFor(
    '.fabricate-manager .manager-component-identity .manager-system-copy'
  );

  // Drop target, toolbar, LIST (it takes the slack).
  assert.ok(
    blockFor('.fabricate-manager[data-manager-view="components"] .manager-main').includes(
      'grid-template-rows: auto auto minmax(0, 1fr) auto;'
    ),
    'components route should give the growing row to the list, not the pager'
  );
  // The absence assertion on that dropped column template is GONE (issue 1399).
  assert.ok(listBlock.includes('display: flex;'), 'the component list stacks its rows');
  assert.ok(
    rowBlock.includes('display: flex;'),
    'a component row is a flex row, not a column grid'
  );
  assert.ok(rowBlock.includes('flex-wrap: wrap;'), 'a component row wraps rather than compressing');
  assert.ok(rowMetaBlock.includes('flex-wrap: wrap;'), 'the badge run wraps inside the row');
  // The row's identity tile is the shared `Medallion` component (issue 676, ruling 1 —
  // the recipe row already leads with it), which is flat-by-contract in its own scoped
  // style and carries a real glyph fallback. The hand-rolled `.manager-component-chip` /
  // `.manager-component-thumb` pair it replaced must not linger as dead CSS.
  for (const dead of [
    'manager-component-chip',
    'manager-component-thumb',
    'manager-component-preview',
  ]) {
    assert.equal(
      new RegExp(`\\.${dead}[\\s,{:]`).test(css),
      false,
      `${dead} was replaced by the shared Medallion and must not survive as dead CSS`
    );
  }
  // The row geometry matches the recipe row, not the 76px group it left.
  assert.ok(rowBlock.includes('min-height: 62px;'), 'the component row is the denser ~62px card');
  // As for the recipe row: issue 883 retired the per-surface 9px corner in favour of the
  // one shared browser-row treatment, so the row block declares size and nothing else.
  assert.equal(
    /border-radius:|border: 1px|background:/.test(rowBlock),
    false,
    'the component row must not restate the shared browser-row edge, corner or fill'
  );
  assert.ok(
    dropBlock.includes('grid-template-columns: 42px minmax(0, 1fr);'),
    'component drop zone should reserve icon and copy space'
  );
  assert.ok(
    dropBlock.includes('margin: var(--fab-space-3);'),
    'component drop zone should keep balanced vertical spacing around the toolbar'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-component-drop-zone.is-drop-active'),
    'component drop zone should expose an active drag state'
  );
  assert.ok(
    toolbarBlock.includes('display: grid;'),
    'manager toolbar should own a grid layout for primary controls and auxiliary rows'
  );
  assert.ok(
    toolbarBlock.includes('grid-template-columns: minmax(0, 1fr);'),
    'manager toolbar grid should keep rows bounded to the main content width'
  );
  // The component toolbar adopted the recipe bar's three-row shape (issue 676, ruling 1),
  // so it JOINS those rules rather than re-deriving a second, drifting filter bar. Its
  // own selects carried no font-size at all and were rendering at Foundry's 14px app base.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-filter-row,\n.fabricate-manager .manager-component-filter-row,\n.fabricate-manager .manager-essence-filter-row'
    ).includes('flex-wrap: wrap;'),
    'the component and essence filter rows share the recipe filter row rule'
  );
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-toolbar .manager-search input,\n.fabricate-manager .manager-recipe-toolbar select,\n.fabricate-manager .manager-component-toolbar .manager-search input,\n.fabricate-manager .manager-component-toolbar select,\n.fabricate-manager .manager-essence-toolbar .manager-search input,\n.fabricate-manager .manager-essence-toolbar select'
    ).includes('font-size: var(--fab-recipe-control-font);'),
    'the component and essence toolbar controls are typed by the shared control font, not the Foundry bleed'
  );
  // The essence toolbar's selects also take the Fabricate select TREATMENT. Without it they
  // rendered with Foundry core's own chrome — full-width, taller than the segmented controls
  // beside them, and wrapping one filter row into three.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-toolbar select,\n.fabricate-manager .manager-component-toolbar select,\n.fabricate-manager .manager-essence-toolbar select'
    ).includes('height: 34px;'),
    'every studio filter bar dresses its own selects rather than inheriting Foundry core chrome'
  );
  // The ESSENCE browser's toggle is the third selector in that group (issue 1118). It is
  // addressed by its `data-*` hook because the class it used to carry styled nothing at all —
  // the sheet declared `.manager-essence-sort-direction` NOWHERE — so the third instance of
  // this control rendered at the base 6px/700 scale beside two siblings at 9px/600. Naming all
  // three here is what makes `blockFor` read the whole group: it anchors on `{`, so a selector
  // appended to the list leaves a two-selector lookup matching nothing and failing silently.
  const sortDirectionBlock = blockFor(
    '.fabricate-button.manager-button.manager-recipe-sort-direction,\n.fabricate-button.manager-button.manager-component-sort-direction,\n.fabricate-button.manager-button.fab-manager-button[data-essence-sort-direction]'
  );
  assert.ok(
    sortDirectionBlock.includes('border-radius: 9px;'),
    'the component sort-direction button escapes the boxy base .manager-button scale'
  );
  assert.ok(
    sortDirectionBlock.includes('font-weight: 600;'),
    'and all three sort-direction toggles are typed by one rule rather than three scales'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);') ||
      css.includes(
        '.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity'
      ),
    'component identity should reserve thumbnail space'
  );
  assert.ok(
    componentCopyBlock.includes('max-height: 52px;') &&
      componentCopyBlock.includes('overflow: hidden;'),
    'component identity copy should clamp inside the row instead of overflowing below the thumbnail'
  );
  // No medium-query stacking rule is needed any more: the row wraps natively.
});

// Issue 1036. The essence-grid column template.
// the `.manager-essence-source-cell-image` block and the narrow-container `grid-template-
// columns` stacking rule are all RETIRED here, and that is a deliberate edit rather than
// incidental churn: the essence row is a FLEX card that wraps, so a column template on it
// would place nothing, and the narrow join's `align-items: stretch` is a live flex property
// that would stretch the medallion and the whole control cluster to full card height. The
// replacement narrow behaviour is authored in `EssenceRow.svelte`'s own scoped block.
test('manager essence browser defines a wrapping card row rather than a column template', () => {
  const identityResetBlock = blockFor(
    '.fabricate-manager .manager-recipe-identity,\n.fabricate-manager .manager-component-identity,\n.fabricate-manager .manager-environment-identity,\n.fabricate-manager .manager-gathering-task-identity,\n.fabricate-manager .manager-essence-identity'
  );

  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="essences"] .manager-main'),
    'essences route should define route-specific rows'
  );
  assert.ok(
    blockFor('.fabricate-manager[data-manager-view="essences"] .manager-main').includes(
      'grid-template-rows: auto minmax(0, 1fr) auto;'
    ),
    'essences route should put the slack on the LIST, between the toolbar and the pager'
  );

  // The retirements, asserted as absences so a re-introduction is caught rather than
  // silently coexisting with the flex row. Each needle carries the punctuation that only a
  // DECLARATION or a RULE OPENER has — a bare class-name match would be satisfied by the
  // retirement comments themselves, which name what they retired.
  assert.equal(
    css.includes('.manager-essences-table.has-no-source {'),
    false,
    'and so is its no-source variant'
  );
  assert.equal(
    css.includes('.manager-essence-source-cell-image {'),
    false,
    'and the source column cell, which reported one bit in a column of its own'
  );
  assert.equal(
    css.includes('.manager-essence-table-head,') || css.includes('.manager-essence-table-head {'),
    false,
    'and the table head itself'
  );

  // The identity button JOINS the shared reset.
  assert.ok(
    identityResetBlock.includes('appearance: none;'),
    'the essence identity button joins the shared manager button reset'
  );
  assert.ok(
    identityResetBlock.includes('min-height: 46px;'),
    'including the min-height that stops Foundry cropping it'
  );
  // `min-height` ALONE does not stop the crop. Foundry pins a fixed `height` on every
  // `button`, so used height is `max(height, min-height)` and a grow-tall variant still
  // resolves to 46px — which is what the essence grid CARD is: the same button laid out as
  // a ~150px stack. The four row-shaped siblings escape it only because their content never
  // exceeds 46px, so the property was missing without being visible. CONTRIBUTING.md's
  // "Instance 1 — button layout" states the pair; happy-dom computes no cascade, so this
  // source assertion and the rendered `manager-essences-grid` frame are the only proofs.
  assert.ok(
    identityResetBlock.includes('height: auto;'),
    'and the height:auto that lets the grid card grow past it'
  );

  // The row still joins the four shared lists.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-environment-row,\n.fabricate-manager .manager-gathering-task-row,\n.fabricate-manager .manager-essence-row'
    ).includes('min-height: 76px;'),
    'the essence row keeps the shared 76px row height'
  );
});

test('manager essence edit route defines a tabbed two-row shell', () => {
  const mainBlock = blockFor('.fabricate-manager[data-manager-view="essence-edit"] .manager-main');
  const editGridBlock = blockFor('.fabricate-manager .manager-essence-edit-grid');
  const sourceSummaryBlock = blockFor('.fabricate-manager .manager-essence-source-summary');
  const inspectorSourceActionsBlock = blockFor(
    '.fabricate-manager .manager-essence-inspector-source-actions'
  );
  // Issue 1315 retired the `.manager-icon-button` half of this pair with the manual-mode icon
  // Force add that was its only consumer, so the rule is now the labelled button alone.
  const warningActionBlock = blockFor('.fabricate-button.manager-button.is-warning-action');
  const sourceDropBlock = blockFor(
    '.fabricate-manager .manager-essence-source-drop-zone .essence-source-trigger'
  );
  const usageGridBlock = blockFor('.fabricate-manager .manager-essence-usage-grid');
  const usageItemBlock = blockFor('.fabricate-manager .manager-essence-usage-item');
  // Both blocks moved off `.fabricate-manager` onto the pickers' own namespace roots (issue
  // 1470): `IconPicker` and `EssenceSourceSelector` are shared components, and a rule rooted at
  // one application cannot paint them anywhere else.
  const iconTriggerBlock = blockFor('.fabricate-icon-picker .essence-icon-picker-trigger');
  const sourceTriggerBlock = blockFor('.fabricate-source-picker .essence-source-trigger');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 680px)'));

  // TWO tracks now, not one: the tab strip and the scrolling tab body. A single `1fr`
  // would stretch the strip, which is what the shipped single-card editor did not have.
  assert.ok(
    mainBlock.includes('grid-template-rows: auto minmax(0, 1fr);'),
    'essence edit route reserves a row for the tab strip and gives the body the slack'
  );
  assert.ok(
    editGridBlock.includes(
      'grid-template-columns: 124px minmax(0, 1fr);'
    ),
    'essence edit identity fields should reserve stable square-icon picker space'
  );
  // TWO tracks. The third reserved an inline clear button that no surface renders any more
  // (issue 1036, maintainer round 2): the editor's linked source is the shared `ItemDropZone`
  // card, whose actions are the primitive's own, and the browser inspector always overrode
  // the third track away. The per-inspector override is retired with it, so this asserts the
  // ONE geometry rather than a base and the rule that cancelled it.
  assert.ok(
    sourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr);'),
    'essence source summary should be the linked item evidence card, image beside evidence'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-essence-inspector-source-summary {'),
    false,
    'and no per-inspector override survives to re-declare it'
  );
  assert.ok(
    inspectorSourceActionsBlock.includes('margin-top: var(--fab-space-3);'),
    'inspector source action row should sit below the linked item card'
  );
  assert.ok(
    inspectorSourceActionsBlock.includes('display: grid;'),
    'inspector source actions should use stable row geometry'
  );
  assert.ok(
    inspectorSourceActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'inspector source actions should keep copy and unlink on the same row'
  );
  assert.ok(
    !mediumQuery.includes(
      '.fabricate-manager .manager-essence-inspector-source-actions .manager-button'
    ),
    'narrow manager layout should not stack the selected essence source actions'
  );
  assert.ok(
    warningActionBlock.includes('var(--fab-warning'),
    'unlink source should have an amber warning-action button style'
  );
  assert.ok(
    sourceDropBlock.includes('width: 100%;'),
    'essence source drop target should use the full source panel width'
  );
  assert.ok(
    sourceDropBlock.includes('height: 84px;'),
    'essence source drop target should have a stable wide drop-zone height'
  );
  assert.ok(
    iconTriggerBlock.includes(
      'grid-template-columns: var(--fab-icon-picker-chip) minmax(0, 1fr) 16px;'
    ),
    'icon picker trigger should be a real picker control, not a raw text field'
  );
  assert.ok(
    sourceTriggerBlock.includes('aspect-ratio: 1 / 1;'),
    'source picker should keep a stable drop target'
  );
  assert.ok(
    usageGridBlock.includes('max-height: 132px;'),
    'essence usage thumbnails should stay scroll-contained in the inspector'
  );
  assert.ok(
    usageItemBlock.includes('aspect-ratio: 1 / 1;'),
    'essence usage thumbnails should be square image-only controls'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-essence-edit-grid') &&
      mediumQuery.includes('.fabricate-manager .manager-essence-source-summary'),
    'narrow manager layout should stack essence edit controls'
  );
});

test('manager environments browser and edit route define compact responsive geometry', () => {
  const toolbarBlock = blockFor('.fabricate-manager .manager-environments-toolbar');
  const gatheringPanelBlock = blockFor('.fabricate-manager .manager-gathering-panel');
  const gatheringEnvironmentsPanelBlock = blockFor(
    '.fabricate-manager .manager-gathering-panel-environments'
  );
  const tableScrollBlock = blockFor('.fabricate-manager .manager-table-scroll');
  const tableBlock = blockFor('.fabricate-manager .manager-environments-table');
  const taskCountBlock = blockFor('.fabricate-manager .manager-environment-task-count');
  const actionsBlock = blockFor('.fabricate-manager .manager-environment-actions');
  const actionGridBlock = blockFor('.fabricate-manager .manager-environment-action-grid');
  const reorderStackBlock = blockFor('.fabricate-manager .manager-environment-reorder-stack');
  const editorShellBlock = blockFor('.fabricate-manager .manager-environment-editor-shell');
  const editorViewBlock = blockFor('.fabricate-manager .manager-environment-edit-view');
  // NOT `blockFor`: that returns the FIRST block matching the selector.
  const workspaceBlock = (css.match(
    /^\.fabricate-manager \.manager-environment-workspace \{[\s\S]*?\}/m
  ) || [''])[0];
  const weightFieldBlock = blockFor('.fabricate-manager .manager-environment-comp-weight-field');
  // The overflow menu is the shared `<ActionMenu>` primitive since issue 1477.
  const compMenuBlock = blockFor(
    '.fabricate-action-menu-panel.manager-action-menu-panel'
  );
  const compMenuButtonBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item'
  );
  const compMenuIconBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item > i'
  );
  const compMenuLabelBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item > span'
  );
  const compMenuDisabledBlock = blockFor(
    '.fabricate-action-menu-panel button.manager-action-menu-item:disabled'
  );
  const compQuickActionBlock = blockFor(
    '.fabricate-manager .manager-environment-comp-quick-action'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const environmentCompContainerQuery = css.slice(
    css.indexOf('@container fabricate-manager (max-width: 960px)')
  );

  assert.ok(
    toolbarBlock.includes('max-height: 100px;') && toolbarBlock.includes('overflow-y: auto;'),
    'environments toolbar should keep wrapped filters height-bounded instead of pushing the empty state down'
  );
  assert.ok(
    toolbarBlock.includes('align-content: flex-start;'),
    'environments toolbar should keep wrapped filter rows pinned to the top of its bounded scroll area'
  );
  assert.ok(
    gatheringPanelBlock.includes('min-height: 0;') &&
      gatheringPanelBlock.includes('overflow: hidden;'),
    'gathering panels should participate in the manager bounded grid instead of expanding to content height'
  );
  assert.ok(
    gatheringEnvironmentsPanelBlock.includes('grid-template-rows: auto minmax(0, 1fr) auto;'),
    'environments gathering panel should reserve a bounded scroll row between toolbar and pagination'
  );
  assert.ok(
    tableScrollBlock.includes('overflow: auto;') && tableScrollBlock.includes('min-height: 0;'),
    'environment table scroll region should own internal overflow once bounded by the gathering panel'
  );
  assert.ok(
    tableBlock.includes('--fab-manager-environment-grid: minmax(0, 1fr) 120px 56px 88px 116px;'),
    'environments table should define one flexible identity column and fixed compact columns so headers and rows align'
  );
  assert.ok(
    !css.includes(
      '.fabricate-manager .manager-environment-row {\n  position: relative;\n  min-height: 88px;\n}'
    ),
    'environment rows should no longer carry the taller reorder-overlay height override'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-row,') &&
      css.includes('min-height: 76px;'),
    'environment rows should share the compact 76px row height with the task and event browsers'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-environment-identity {\n  grid-template-columns: 64px minmax(0, 1fr);\n  gap: var(--fab-space-3);\n  align-self: center;\n  min-height: 64px;'
    ),
    'environment identity should reserve a square 64px thumbnail column like the task and event browsers'
  );
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-environment-thumb {\n  display: block;\n  align-self: center;\n  width: 64px;\n  height: 64px;'
    ),
    'environment thumbnails should render as a square 64px image that suits both scene thumbnails and chosen images'
  );
  assert.ok(
    taskCountBlock.includes('font-weight: 800;'),
    'environment task count should render as plain emphasized text'
  );
  assert.ok(
    actionGridBlock.includes('display: flex;'),
    'environment edit duplicate delete buttons should sit inline in a flex row'
  );
  assert.ok(
    !css.includes(
      '.fabricate-manager .manager-environment-action-grid .manager-icon-button.is-danger {\n  grid-column: 2;\n}'
    ),
    'environment delete quick action should no longer be forced into a second reorder-era grid column'
  );
  assert.ok(
    !css.includes('manager-environment-reorder-stack'),
    'environment reorder controls and their styles should be removed'
  );
  assert.ok(
    css.includes('.fabricate-manager .manager-environment-row .manager-status-cell'),
    'environment status cells should align the shared compact status toggle'
  );
  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="environment-edit"] .manager-main'),
    'environment edit route should reserve scrollable editor space'
  );
  assert.ok(
    editorShellBlock.includes('overflow: hidden;') &&
      editorShellBlock.includes('grid-template-rows: minmax(0, 1fr);'),
    'environment editor shell should bound the editor height (not scroll) so the tab bar stays fixed'
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-environment-tab-panel').includes('overflow: auto;'),
    'the environment editor tab panel should own internal scroll while the tab bar stays pinned'
  );
  assert.ok(
    css.includes('.fabricate-manager[data-manager-view="environment-edit"] .manager-body') &&
      css.includes('grid-template-columns: 220px minmax(0, 1fr);'),
    'environment edit route should replace the browse inspector with a two-region rail/editor grid'
  );
  assert.ok(
    editorViewBlock.includes('grid-template-rows: auto minmax(0, 1fr);'),
    'environment editor should reserve details band plus scrollable workspace'
  );
  assert.ok(
    workspaceBlock.includes(
      'grid-template-columns: var(--fab-env-workspace-grid, minmax(0, 1fr) 300px);'
    ),
    'environment editor workspace should pair the main composition column with a fixed 300px inspector (matching the standard manager inspector width) at normal widths, through the token its narrow override sets'
  );
  const compBlock = blockFor('.fabricate-manager .manager-environment-comp');
  assert.ok(
    compBlock.includes('--fab-env-comp-grid: minmax(0, 1fr) 92px 132px 92px;'),
    'composition grid keeps the shared fallback layout for non-task rows'
  );
  assert.ok(
    css.includes('.manager-environment-comp[data-composition-kind="task"]') &&
      css.includes('--fab-env-comp-grid: minmax(0, 1fr) 72px 132px 72px;'),
    'task rows reserve space for a quick action icon beside the overflow-menu action'
  );
  assert.ok(
    css.includes(
      '.manager-environment-comp[data-composition-kind="task"][data-composition-selection="blind"]'
    ) && css.includes('--fab-env-comp-grid: minmax(0, 1fr) 158px 72px 132px 72px;'),
    'blind-mode tasks reserve a Weight column wide enough for the stepper and its calculated percentage'
  );
  assert.ok(
    environmentCompContainerQuery.includes(
      '.fabricate-manager .manager-environment-comp[data-composition-kind="task"]'
    ) &&
      environmentCompContainerQuery.includes(
        '--fab-env-comp-grid: minmax(0, 1fr) 64px 110px 72px;'
      ),
    'narrow task rows key off manager container width and keep enough action-column width for quick action plus menu buttons'
  );
  // The NARROW blind row, pinned nowhere before the weight field became a Stepper. The
  // weight track must NOT shrink with the container — 102px is the primitive's natural
  // width and the selection-share readout still sits beside it — so only the name column
  // gives. Without this pin the container-query branch could drift back to a width the
  // control overflows, on exactly the 880/900px View Lab cases that render it.
  assert.ok(
    environmentCompContainerQuery.includes(
      '.fabricate-manager .manager-environment-comp[data-composition-kind="task"][data-composition-selection="blind"]'
    ) &&
      environmentCompContainerQuery.includes(
        '--fab-env-comp-grid: minmax(0, 1fr) 158px 64px 110px 72px;'
      ),
    'narrow blind task rows keep the full-width Weight column so the stepper never overflows it'
  );
  assert.ok(
    weightFieldBlock.includes('flex: 0 0 102px;') &&
      weightFieldBlock.includes('--fab-stepper-fill-height: 28px;'),
    'the blind task weight slot pins the stepper to its natural width and to the row height the bare input had'
  );
  assert.ok(
    compQuickActionBlock.includes('flex: 0 0 34px;'),
    'composition quick actions should keep the same fixed geometry as manager icon buttons'
  );
  assert.ok(
    compMenuBlock.includes('position: absolute;') && !compMenuBlock.includes('right: 0;'),
    'the overflow menu is PORTALED (issue 1477), so its placement is measured against the host ' +
      'it lands in and written inline by `computeActionMenuLayout`. A `right: 0` here would be ' +
      'read against the portal host rather than the row, which is a panel in the wrong place ' +
      'with byte-identical markup — the exact failure `util/overlayHost.js` documents'
  );
  assert.ok(
    compMenuBlock.includes('width: max-content;') &&
      compMenuBlock.includes('max-width: min(260px, calc(100vw - 32px));') &&
      compMenuBlock.includes('min-width: 176px;'),
    'composition overflow menus should size to single-line labels with compact minimum and bounded maximum widths'
  );
  assert.ok(
    compMenuButtonBlock.includes('display: grid;') &&
      compMenuButtonBlock.includes('grid-template-columns: 18px minmax(0, 1fr);'),
    'composition overflow menu items should reserve a fixed icon column before a truncating label column'
  );
  assert.ok(
    compMenuButtonBlock.includes('min-width: 0;'),
    'composition overflow menu rows should be allowed to shrink inside the flex menu container'
  );
  assert.ok(
    compMenuButtonBlock.includes('justify-content: start;') &&
      compMenuButtonBlock.includes('place-items: center start;') &&
      compMenuButtonBlock.includes('text-align: left;'),
    'composition overflow menu item content should be left-aligned'
  );
  assert.ok(
    compMenuButtonBlock.includes('white-space: nowrap;'),
    'composition overflow menu labels should remain on one line'
  );
  assert.ok(
    compMenuButtonBlock.includes('font-size: 0.82rem;') &&
      compMenuButtonBlock.includes('font-weight: 500;'),
    'composition overflow menu items should use compact lighter text'
  );
  assert.ok(
    compMenuIconBlock.includes('justify-self: center;'),
    'composition overflow menu icons should stack in the center of the fixed icon column'
  );
  assert.ok(
    compMenuLabelBlock.includes('display: block;') &&
      compMenuLabelBlock.includes('min-width: 0;') &&
      compMenuLabelBlock.includes('max-width: 100%;') &&
      compMenuLabelBlock.includes('overflow: hidden;') &&
      compMenuLabelBlock.includes('text-overflow: ellipsis;'),
    'composition overflow menu labels should truncate inside the bounded menu width'
  );
  // The disabled NOTE ("Enable in library first") used to be a second.
  assert.ok(
    compMenuDisabledBlock.includes('opacity: 0.45;') &&
      compMenuDisabledBlock.includes('cursor: default;'),
    'a disabled menu item still reads as inert'
  );
  // A RULE, not a mention: the re-rooting comment above the new family names the retired
  // selectors in prose, and `css` is the raw sheet. Requiring the opening brace is what makes
  // this a claim about selectors rather than about words.
  assert.ok(
    !/\.manager-environment-comp-menu[\w-]*(::[\w-]+)?[^{}\n]*\{/.test(css),
    'and the note rule and its icon-column spacer are gone rather than left behind matching ' +
      'nothing, which is what a class that moves onto a component tag otherwise leaves in a sheet'
  );
  // The included rows are the shared ordered list's as of issue 1512, so the ranked grid is not a
  // row variant any more: the strip's LEAD track is the list's own cluster, the record's cells are a
  // grid of their own on the same template, and `--fab-env-comp-grid-ranked` is retired with the
  // row variant that read it.
  assert.ok(
    !css.includes('--fab-env-comp-grid-ranked'),
    'the ranked grid variable is retired with the row variant that read it'
  );
  assert.ok(
    compBlock.includes('--fab-env-comp-lead: 22px;') &&
      compBlock.includes('--fab-env-comp-lead-ranked: 58px;'),
    "the strip's lead track is declared from the list's own badge, grip and gap"
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-environment-comp-head').includes(
      'grid-template-columns: var(--fab-env-comp-lead) var(--fab-env-comp-grid);'
    ),
    'the column strip reads the lead track ahead of the record cells'
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-environment-comp-head.has-rank-controls').includes(
      'grid-template-columns: var(--fab-env-comp-lead-ranked) var(--fab-env-comp-grid) 24px;'
    ),
    'and a ranked strip widens that lead and adds a track under the trailing rocker'
  );
  assert.ok(
    blockFor('.fabricate-manager .manager-environment-comp-cells').includes(
      'grid-template-columns: var(--fab-env-comp-grid);'
    ),
    'while the record cells read the SAME template, so a label sits over the column it names'
  );
  assert.ok(
    !css.includes('.manager-environment-comp-row.has-rank-controls'),
    'and the row variant is gone rather than left matching nothing'
  );
  assert.ok(
    !compBlock.includes('minmax(150px'),
    'composition grid should not hard-floor flexible columns and overflow the panel'
  );
  assert.ok(
    !css.includes('manager-environment-evidence-column'),
    'environment editor CSS should no longer reference the removed evidence column'
  );
  assert.ok(
    !css.includes('.manager-environment-comp-evidence'),
    'environment editor CSS should no longer reference the removed inline-row evidence cell'
  );
  assert.equal(
    css.includes('.fabricate-manager .manager-environment-details-tabs'),
    false,
    'environment editor should not define removed environment advanced tabs'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-row') &&
      mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager layout should stack environment rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-environment-editor-shell') &&
      mediumQuery.includes('overflow: visible;'),
    'stacked environment edit layout should release nested scroll containment'
  );
  // The workspace's own narrow override is NOT asserted as text here. It was.
});

test('manager environment inspector evidence table wraps compact pills without horizontal overflow', async () => {
  const context = await openLayoutContext({
    viewport: { width: 360, height: 360 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body {
              margin: 0;
              padding: 16px;
              font-family: Arial, sans-serif;
            }
            .harness {
              width: 260px;
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <section class="fabricate-card manager-inspector-card harness">
              <h3 class="manager-card-title">Matching evidence</h3>
              <table class="manager-environment-evidence is-checks manager-environment-evidence-table" aria-label="Matching evidence">
                <tbody>
                  <tr class="manager-environment-evidence-row is-positive" data-evidence-field="biome" data-evidence-state="match">
                    <th class="manager-environment-evidence-dimension" scope="row">Biome</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-positive" data-evidence-value-state="match">Forest</span>
                        <span class="manager-environment-evidence-value-pill is-danger" data-evidence-value-state="mismatch">VeryLongUnbrokenBiomeNameThatMustWrapInsideTheInspectorColumn</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-positive" data-evidence-field="region" data-evidence-state="match">
                    <th class="manager-environment-evidence-dimension" scope="row">Region</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-positive" data-evidence-value-state="match">North</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-warning" data-evidence-field="weather" data-evidence-state="mismatch">
                    <th class="manager-environment-evidence-dimension" scope="row">Weather</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-warning" data-evidence-value-state="mismatch">Storm</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-warning" data-evidence-field="time" data-evidence-state="mismatch">
                    <th class="manager-environment-evidence-dimension" scope="row">Time</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-warning" data-evidence-value-state="mismatch">Night</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="manager-environment-evidence-row is-any" data-evidence-field="danger" data-evidence-state="any">
                    <th class="manager-environment-evidence-dimension" scope="row">Danger</th>
                    <td class="manager-environment-evidence-values">
                      <div class="manager-environment-evidence-value-list">
                        <span class="manager-environment-evidence-value-pill is-any" data-evidence-value-state="any">Any danger</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const rectFor = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const table = document.querySelector('.manager-environment-evidence-table');
      const card = document.querySelector('.manager-inspector-card');
      const longPill = Array.from(
        document.querySelectorAll('.manager-environment-evidence-value-pill')
      ).find((pill) => pill.textContent.includes('VeryLongUnbroken'));
      const rowStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-row')
      );
      const tableStyle = getComputedStyle(table);
      const dimensionStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-dimension')
      );
      const valueCellStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-values')
      );
      const valueListStyle = getComputedStyle(
        document.querySelector('.manager-environment-evidence-value-list')
      );
      const pillStyle = getComputedStyle(longPill);
      const valueCells = Array.from(
        document.querySelectorAll('.manager-environment-evidence-values')
      ).map(rectFor);

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        rowFields: Array.from(document.querySelectorAll('.manager-environment-evidence-row')).map(
          (row) => row.dataset.evidenceField
        ),
        table: rectFor(table),
        card: rectFor(card),
        longPill: rectFor(longPill),
        firstValueCell: valueCells[0],
        valueLefts: valueCells.map((cell) => Math.round(cell.left)),
        rowBorderBottom: rowStyle.borderBottomWidth,
        rowBackgroundColor: rowStyle.backgroundColor,
        tableStyle: {
          display: tableStyle.display,
          tableLayout: tableStyle.tableLayout,
          backgroundColor: tableStyle.backgroundColor,
        },
        dimensionStyle: {
          width: dimensionStyle.width,
          fontWeight: dimensionStyle.fontWeight,
          backgroundColor: dimensionStyle.backgroundColor,
        },
        valueCellStyle: {
          backgroundColor: valueCellStyle.backgroundColor,
        },
        valueListStyle: {
          display: valueListStyle.display,
          flexWrap: valueListStyle.flexWrap,
        },
        pillStyle: {
          borderRadius: pillStyle.borderRadius,
          overflowWrap: pillStyle.overflowWrap,
          backgroundColor: pillStyle.backgroundColor,
        },
      };
    });

    assert.deepEqual(
      report.rowFields,
      ['biome', 'region', 'weather', 'time', 'danger'],
      'inspector evidence table should render all five rows'
    );
    assert.equal(
      report.tableStyle.display,
      'table',
      'inspector evidence should keep table layout despite shared evidence flex styles'
    );
    assert.equal(
      report.tableStyle.tableLayout,
      'fixed',
      'inspector evidence table should keep fixed columns'
    );
    assert.equal(
      report.tableStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence table should not draw a dark inset panel'
    );
    assert.equal(
      report.rowBackgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence rows should not draw alternating backgrounds'
    );
    assert.equal(
      report.dimensionStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence label cells should not draw row fill'
    );
    assert.equal(
      report.valueCellStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'inspector evidence value cells should not draw row fill'
    );
    assert.equal(
      report.rowBorderBottom,
      '1px',
      'inspector evidence rows should use horizontal separators'
    );
    assert.ok(
      report.dimensionStyle.width.startsWith('82'),
      'inspector evidence labels should keep a fixed left column'
    );
    assert.ok(
      Number(report.dimensionStyle.fontWeight) >= 650,
      'inspector evidence labels should render as strong labels'
    );
    assert.equal(
      report.valueListStyle.display,
      'flex',
      'inspector values should align as inline pill rows'
    );
    assert.equal(
      report.valueListStyle.flexWrap,
      'wrap',
      'inspector value pills should wrap inside the right column'
    );
    assert.equal(
      new Set(report.valueLefts).size,
      1,
      'inspector value columns should align across rows'
    );
    assert.ok(
      report.table.right <= report.card.right + 1,
      'evidence table should stay inside the inspector card'
    );
    assert.ok(
      report.documentWidth <= report.viewportWidth,
      'evidence table should not create page-level horizontal overflow'
    );
    assert.ok(
      report.longPill.width <= report.firstValueCell.width + 1,
      'long value pills should stay inside the right column'
    );
    assert.ok(
      report.longPill.height > 20,
      'long value pills should wrap to multiple compact lines instead of clipping'
    );
    assert.equal(
      report.pillStyle.borderRadius,
      '4px',
      'value pills should use compact chip corners'
    );
    assert.equal(
      report.pillStyle.overflowWrap,
      'anywhere',
      'value pills should be able to break long localized values'
    );
    assert.notEqual(
      report.pillStyle.backgroundColor,
      'rgba(0, 0, 0, 0)',
      'status pills should retain subtle state backgrounds'
    );
  } finally {
    await context.close();
  }
});

test('manager environment composition overflow menu renders bounded single-line rows', async () => {
  const context = await openLayoutContext({
    viewport: { width: 360, height: 260 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body {
              margin: 0;
              padding: 16px;
              font-family: Arial, sans-serif;
            }
            .harness {
              position: relative;
              width: 320px;
              height: 180px;
            }
            .harness .fabricate-action-menu {
              width: 34px;
              margin-left: 260px;
            }
            /*
              The panel is PORTALED in the product, so its placement is written inline against the
              host it lands in. This fixture measures the DECLARATIONS the sheet supplies — sizing,
              the icon column, truncation — so it supplies that placement itself, right-aligned to
              the trigger exactly as computeActionMenuLayout computes it. No backticks in here: the
              whole page is a JS template literal.
            */
            .harness .fabricate-action-menu-panel {
              right: 0;
              top: 38px;
            }
            .harness .manager-icon-button {
              width: 34px;
              height: 34px;
            }
            .fa-solid::before,
            .fas::before {
              content: "■";
              display: inline-block;
              width: 10px;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness">
              <div class="fabricate-action-menu manager-action-menu">
                <button type="button" class="fabricate-icon-button manager-icon-button" aria-haspopup="menu" aria-label="Open task actions">
                  <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                </button>
                <div class="fabricate-action-menu-panel manager-action-menu-panel" role="menu" tabindex="-1" data-keyboard-focus="true" aria-label="Open task actions">
                  <button type="button" role="menuitem" tabindex="-1" class="manager-action-menu-item">
                    <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
                    <span>OpenSourceRecordWithAnIntentionallyExtendedLocalizedMenuLabelThatMustTruncateInsideTheBoundedMenuWidth</span>
                  </button>
                  <button type="button" role="menuitem" tabindex="-1" class="manager-action-menu-item is-danger">
                    <i class="fas fa-ban" aria-hidden="true"></i>
                    <span>Exclude from environment</span>
                  </button>
                  <button type="button" role="menuitem" tabindex="-1" class="manager-action-menu-item" disabled>
                    <i class="" aria-hidden="true"></i>
                    <span>EnableInLibraryFirstWithAnIntentionallyExtendedLocalizedNoteThatMustTruncateInsideTheBoundedMenuWidth</span>
                  </button>
                </div>
              </div>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const rectFor = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const rowFor = (element) => {
        const icon = element.querySelector('i');
        const label = element.querySelector('span');
        const rowStyle = getComputedStyle(element);
        const labelStyle = getComputedStyle(label);
        return {
          row: rectFor(element),
          icon: icon ? rectFor(icon) : null,
          label: rectFor(label),
          rowStyle: {
            display: rowStyle.display,
            gridTemplateColumns: rowStyle.gridTemplateColumns,
            justifyContent: rowStyle.justifyContent,
            justifyItems: rowStyle.justifyItems,
            textAlign: rowStyle.textAlign,
            whiteSpace: rowStyle.whiteSpace,
            fontSize: rowStyle.fontSize,
            fontWeight: rowStyle.fontWeight,
          },
          labelStyle: {
            overflow: labelStyle.overflow,
            textOverflow: labelStyle.textOverflow,
            whiteSpace: labelStyle.whiteSpace,
          },
          labelClientWidth: label.clientWidth,
          labelScrollWidth: label.scrollWidth,
        };
      };

      return {
        viewportWidth: window.innerWidth,
        wrap: rectFor(document.querySelector('.fabricate-action-menu')),
        menu: rectFor(document.querySelector('.fabricate-action-menu-panel')),
        rows: Array.from(
          document.querySelectorAll('.fabricate-action-menu-panel button')
        ).map(rowFor),
      };
    });

    const [firstRow, dangerRow, noteRow] = report.rows;
    const iconCenters = [firstRow, dangerRow].map((row) => row.icon.left + row.icon.width / 2);
    const labelLefts = report.rows.map((row) => row.label.left);

    assert.ok(
      report.menu.width <= 261,
      'composition menu should render within the bounded maximum width'
    );
    assert.ok(
      report.menu.right <= report.viewportWidth - 16,
      'composition menu should avoid viewport horizontal overflow'
    );
    assert.ok(
      Math.abs(report.menu.right - report.wrap.right) <= 1,
      'composition menu should remain right-aligned to the action button'
    );
    assert.ok(
      report.rows.every((row) => row.rowStyle.display === 'grid'),
      'composition menu rows should render as grid rows'
    );
    assert.ok(
      report.rows.every((row) => row.rowStyle.gridTemplateColumns.startsWith('18px ')),
      'composition menu rows should render the fixed icon column'
    );
    assert.ok(
      report.rows.every((row) => row.rowStyle.whiteSpace === 'nowrap'),
      'composition menu rows should render as single-line actions'
    );
    assert.ok(
      report.rows.every(
        (row) => row.rowStyle.justifyContent === 'start' && row.rowStyle.justifyItems === 'start'
      ),
      'composition menu row content should be left-aligned'
    );
    assert.ok(
      report.rows.every(
        (row) => row.rowStyle.fontSize === '13.12px' && row.rowStyle.fontWeight === '500'
      ),
      'composition menu rows should render compact medium-weight text'
    );
    assert.ok(
      Math.abs(iconCenters[0] - iconCenters[1]) <= 1,
      'composition menu icons should stack in one vertical column'
    );
    assert.ok(
      Math.max(...labelLefts) - Math.min(...labelLefts) <= 1,
      'composition menu labels and disabled notes should align in one text column'
    );
    assert.equal(firstRow.labelStyle.overflow, 'hidden', 'long menu labels should hide overflow');
    assert.equal(
      firstRow.labelStyle.textOverflow,
      'ellipsis',
      'long menu labels should use an ellipsis'
    );
    assert.ok(
      firstRow.labelScrollWidth > firstRow.labelClientWidth,
      'long menu labels should truncate within the bounded label column'
    );
    assert.ok(
      noteRow.labelScrollWidth > noteRow.labelClientWidth,
      'disabled note labels should truncate within the same bounded label column'
    );
  } finally {
    await context.close();
  }
});

test('manager system edit view defines scoped stable form and toggle layout', () => {
  const mainBlock = blockFor('.fabricate-manager .manager-system-edit-main');
  const formBlock = blockFor('.fabricate-manager .manager-system-edit-form');
  const gridBlock = blockFor('.fabricate-manager .manager-edit-grid');
  // `:not(.fab-stepper-input)` (issue 676).
  const fieldInputBlock = blockFor(
    ".fabricate-field.manager-field input:not(.fab-stepper-input):not([type='radio']):not([type='range']),\n" +
      '.fabricate-field.manager-field select'
  );
  const toggleListBlock = blockFor('.fabricate-manager .manager-toggle-list');
  const featureTileBlock = blockFor('.fabricate-manager .manager-feature-tile');
  const featureTileIconBlock = blockFor('.fabricate-manager .manager-feature-tile-icon');
  const featureTileIconOnBlock = blockFor('.fabricate-manager .manager-feature-tile-icon.is-on');
  const featureTileIconOffBlock = blockFor('.fabricate-manager .manager-feature-tile-icon.is-off');
  const featureTileBodyBlock = blockFor('.fabricate-manager .manager-feature-tile-body');
  const featureTileHeadBlock = blockFor('.fabricate-manager .manager-feature-tile-head');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const narrowQuery = css.slice(css.indexOf('@container fabricate-manager (max-width: 680px)'));

  // ONE track since issue 1515 deleted this tab's duplicate page header.
  assert.ok(
    mainBlock.includes('grid-template-rows: minmax(0, 1fr);'),
    'system edit main should reserve scrollable form space'
  );
  assert.ok(
    formBlock.includes('overflow: auto;'),
    'system edit form should own scroll containment at normal widths'
  );
  assert.ok(
    gridBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'system edit fields should use a stable two-column grid'
  );
  assert.ok(
    fieldInputBlock.includes('height: 36px;'),
    'system edit inputs and selects should have stable control height'
  );
  assert.ok(
    toggleListBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'feature toggles should use stable two-column rows'
  );
  assert.ok(
    featureTileBlock.includes('flex-direction: row;'),
    'feature tiles should seat the state icon beside the copy'
  );
  assert.ok(
    featureTileIconBlock.includes('flex: 0 0 40px;'),
    'feature tile icon should hold the resolution card chip width without shrinking'
  );
  assert.ok(
    featureTileIconOnBlock.includes('background: var(--fab-bg-3);') &&
      featureTileIconOnBlock.includes('color: var(--fab-accent);'),
    'an enabled feature chip should match the resolution mode card chip fill'
  );
  assert.ok(
    featureTileIconOffBlock.includes('background: transparent;') &&
      featureTileIconOffBlock.includes('border-style: dashed;'),
    'a disabled feature chip should read as a hollow outline rather than a lit chip'
  );
  assert.ok(
    featureTileBodyBlock.includes('flex-direction: column;'),
    'feature tile body should stack heading and hint vertically'
  );
  assert.ok(
    featureTileBodyBlock.includes('min-width: 0;'),
    'feature tile body should allow the label and hint to wrap in the grid track'
  );
  assert.ok(
    featureTileHeadBlock.includes('justify-content: space-between;'),
    'feature tile heading should push the pill toggle to the trailing edge'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager .manager-toggle-list') &&
      mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium edit layout should collapse feature toggles before text becomes cramped'
  );
  assert.ok(
    narrowQuery.includes('.fabricate-manager .manager-edit-card-heading') &&
      narrowQuery.includes('flex-direction: column;'),
    'narrow edit card headings should stack actions under titles'
  );
});

// The GM Knowledge surface (issue 785). Its layout is FIVE pieces.
test('the Knowledge surface owns its third column and wraps its row action clusters', () => {
  const bodyBlock = blockFor('.fabricate-manager[data-manager-view="knowledge"] .manager-body');
  const collapsedBlock = blockFor(
    '.fabricate-manager[data-manager-view="knowledge"] .manager-body.is-rail-collapsed'
  );
  // `display: contents` is authored ONCE for every view that owns its own columns,
  // so the Knowledge main shares the Tool editor's rule rather than restating it.
  const mainBlock = blockFor(
    '.fabricate-manager .manager-tool-edit-main,\n.fabricate-manager .manager-knowledge-main'
  );
  const rowBlock = blockFor(
    '.fabricate-manager .manager-knowledge-copy-row,\n.fabricate-manager .manager-knowledge-learned-row'
  );
  const copyColumnBlock = blockFor('.fabricate-manager .manager-knowledge-copy-identity');
  const factBlock = blockFor('.fabricate-manager .manager-knowledge-fact-cluster .manager-fact');
  const spentBlock = blockFor(
    '.fabricate-manager .manager-knowledge-copy-row.is-spent .manager-knowledge-copy-name'
  );

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px 250px minmax(0, 1fr);'),
    'the knowledge route re-templates the body as rail, roster, detail'
  );
  assert.ok(
    collapsedBlock.includes('grid-template-columns: 56px 250px minmax(0, 1fr);'),
    'the collapsed rail keeps the roster and detail columns'
  );
  assert.ok(
    mainBlock.includes('display: contents;'),
    "the view's own main must not become a fourth grid item"
  );
  // The 832-1000px band is the real hazard.
  assert.ok(rowBlock.includes('flex-wrap: wrap;'), 'rows wrap rather than clip');
  assert.ok(copyColumnBlock.includes('min-width: 0;'), 'the copy column may shrink');
  assert.ok(
    factBlock.includes('width: auto;'),
    '.manager-fact is authored width:100% for grids and must hug content in this flex cluster'
  );
  // A spent row is muted by COLOUR on its name, never by a group `opacity`.
  assert.ok(
    spentBlock.includes('color: var(--fab-text-muted);'),
    'the spent row is muted by colour on its name'
  );
  assert.equal(
    spentBlock.includes('opacity'),
    false,
    'the spent state must not use a group opacity'
  );
  for (const forbidden of [
    '.manager-knowledge-copy-row.is-spent .manager-knowledge-row-actions',
    '.manager-knowledge-copy-row.is-spent .manager-knowledge-copy-identity',
    '.manager-knowledge-copy-row.is-spent .manager-knowledge-copy-chips',
  ]) {
    assert.equal(css.includes(forbidden), false, `the spent mute must not reach ${forbidden}`);
  }
  assert.ok(
    css.includes(
      '  .fabricate-manager[data-manager-view="knowledge"] .manager-body,\n  .fabricate-manager[data-manager-view="knowledge"] .manager-body.is-rail-collapsed {'
    ),
    'the knowledge surface collapses to one column in the 831px container query'
  );
});

// Every Knowledge rule that an existing rule already expressed is authored ONCE.
test('the Knowledge surface joins the rules it shares instead of restating them', () => {
  const occurrences = (needle) => css.split(needle).length - 1;

  for (const [shared, ruleOpener, expected] of [
    [
      '.fabricate-manager .manager-tool-edit-main,\n.fabricate-manager .manager-knowledge-main {',
      '.manager-knowledge-main {',
      1,
    ],
    // The compact chip scale used to be a fourth entry here.
    [
      // The Tool Studio editor's Back/Delete/Save cluster is canonical for action-button
      // scale; the Knowledge row actions and reset cluster join it rather than restating
      // min-height/padding/font-size.
      '.fabricate-manager .manager-tool-edit-actions .manager-button,\n' +
        '.fabricate-manager .manager-knowledge-row-actions .manager-button,\n' +
        '.fabricate-manager .manager-knowledge-reset-actions .manager-button {',
      '.manager-knowledge-reset-actions .manager-button {',
      1,
    ],
    [
      '.fabricate-manager .manager-access-roster .manager-search,\n.fabricate-manager .manager-knowledge-roster .manager-search {',
      // The class the markup used to carry solely to re-derive the Access roster's
      // rule; it is gone from both the stylesheet and the component.
      '.manager-knowledge-roster-search',
      0,
    ],
  ]) {
    assert.ok(css.includes(shared), `expected the joined rule ${shared}`);
    assert.equal(
      occurrences(ruleOpener),
      expected,
      `${ruleOpener} should appear ${expected} time(s) — a second block is a restatement`
    );
  }

  // Class names that carry no CSS and no consumer.
  const retired = [
    'manager-knowledge-quantity-chip',
    'manager-knowledge-type-pill',
    'manager-knowledge-uses-chip',
    'manager-knowledge-inert-chip',
    'manager-knowledge-match-chip',
    'manager-knowledge-category-pill',
    'manager-knowledge-expend',
    // Central no-state panels that were hand-rolled beside the primitive.
    'manager-recipe-empty-filtered',
    'manager-component-empty-filtered',
    'manager-recipe-section-empty',
    'manager-vocabulary-empty-icon',
    'manager-vocabulary-noresults',
    // Bare inline "nothing here" sentences with their own bespoke class.
    'manager-travel-empty-hint',
    'manager-environment-comp-empty',
    'manager-character-modifier-empty',
    'manager-character-modifier-row-empty',
    'manager-condition-modifier-row-empty',
    'manager-recipe-item-prereq-empty',
    'manager-travel-map-links-empty',
    'manager-travel-realms-empty',
    'manager-travel-parties-empty',
    'manager-recipe-tools-empty',
    'manager-recipe-tags-empty',
    // The per-screen re-size of the shared warning band.
    'manager-knowledge-learned-band',
    // The Knowledge page-header roll-up pill.
    'manager-knowledge-header-pills',
    // The reserved row's inline explanatory sentence.
    'manager-vocabulary-locked-hint',
    // The third block (issue 772): classes retired by extracting three shared primitives
    // and CONVERTING the duplicates that would otherwise have sat beside them. A primitive
    // whose duplicate survives has added a variant rather than removed one, so each of
    // these names is the proof that the conversion actually happened.
    'manager-checklist-card-check',
    // The fourth block (issue 1373, round 5): the Tool Studio's checklist ROW itself.
    'manager-checklist-card-row',
    'manager-checklist-card-icon',
    'manager-checklist-card-copy',
    // And the hand-rolled box it used before issue 772, dead in the sheet ever since.
    'manager-tool-prerequisite-check',
    // The component editor's hand-rolled tag pill, now `Chip tone="tag"`.
    // The CONTAINER is retired with it, and that is not tidiness: this assertion is a bare
    // `css.includes(dead)` substring test, and `manager-component-tag-toggles` (plural)
    // CONTAINS `manager-component-tag-toggle`. Left in the sheet as layout context under
    // the "layout stays global" rule, it would have kept the singular entry below true
    // forever and made this ratchet impossible to satisfy. The surviving run is
    // `manager-component-tag-run`.
    'manager-component-tag-toggles',
    'manager-component-tag-toggle',
    // The component editor's hand-rolled −/input/+ essence row.
    'manager-component-essence-stepper',
    'manager-component-essence-quantity',
  ];
  for (const dead of retired) {
    assert.equal(css.includes(dead), false, `${dead} carries no CSS and should not exist`);
  }

  // And they must be gone from the MARKUP too, not merely unstyled. BOTH primitive directories are
  // walked, because issue 1710 moved `EmptyState` and `Callout` into `components/`.
  const sharedComponentDir = resolve(managerComponentDir, '../../components');
  const managerComponents = [managerComponentDir, sharedComponentDir]
    .flatMap((directory) => readdirSync(directory, { recursive: true, withFileTypes: true }))
    // The primitives themselves are the ONE place the contract markup may be written.
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.svelte') &&
        entry.name !== 'EmptyState.svelte' &&
        entry.name !== 'Callout.svelte'
    )
    // COMMENTS ARE NOT MARKUP. This half asks whether a retired class is still RENDERED;
    // a component that documents why it stopped rendering one is the opposite of the
    // failure, and several already do. Stripping the two block-comment forms — Svelte's
    // `<!-- -->` doc block and the `/* */` used inside `<script>` — is what lets the list
    // below be the ratchet's own list rather than a hardcoded pair (issue 772).
    .map((entry) =>
      readFileSync(resolve(entry.parentPath, entry.name), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
    )
    .join('\n');
  // The markup half used to walk a HARDCODED two-string list.
  for (const dead of [...retired, 'class="manager-empty', 'manager-recipe-section-empty"']) {
    assert.equal(
      managerComponents.includes(dead),
      false,
      `${dead} should render through the shared primitive, not hand-rolled markup`
    );
  }
});

// Issue 883: eight manager browser rows and value cards each declared their own edge,
// corner and fill, and had already drifted to three corner radii (8px, 9px, 10px) and two
// fills. The Tool Studio's row is canonical, and every other surface JOINS it.
test('every manager browser row joins ONE edge, corner and fill treatment', () => {
  const occurrences = (needle) => css.split(needle).length - 1;

  const ROWS = [
    // The canonical row, and the value card issue 883 names as the furthest drifted.
    '.manager-tools-row',
    '.manager-vocabulary-card',
    '.manager-system-row',
    '.manager-recipe-row',
    '.manager-component-row',
    '.manager-environment-row',
    '.manager-gathering-task-row',
    '.manager-gathering-event-row',
    // Not in issue 883's list, but it shared the geometry group with the environment and
    // gathering-task rows: converting those two and leaving it behind would have made it
    // the one surviving per-surface copy of the very treatment being unified.
    '.manager-essence-row',
  ];

  const shared = `${ROWS.map((row) => `.fabricate-manager ${row}`).join(',\n')} {`;
  // Counted on the WHOLE selector list.
  assert.equal(
    occurrences(shared),
    1,
    'the browser-row treatment should be authored exactly once, as one join'
  );

  const treatment = blockIn(css, shared.slice(0, -2));
  for (const declaration of [
    'border: 1px solid var(--fab-border);',
    'border-radius: 8px;',
    'background: var(--fab-overlay-light-03);',
  ]) {
    assert.ok(treatment.includes(declaration), `the shared row treatment declares ${declaration}`);
  }

  // No surface restates it, in ANY of its blocks.
  for (const row of ROWS) {
    const escaped = row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blocks = [
      ...css.matchAll(new RegExp(`\\.fabricate-manager ${escaped}\\s*\\{[\\s\\S]*?\\}`, 'g')),
    ].map(([block]) => block);
    for (const block of blocks) {
      // The shared rule itself matches here.
      if (treatment.includes(block)) continue;
      assert.equal(
        /border-radius:|border: 1px solid|background: var\(--fab-bg-3\);/.test(block),
        false,
        `${row} must not restate the shared browser-row treatment:\n${block}`
      );
    }
  }

  // The selected Tool Studio row moved the EDGE only. It used to repaint the identical
  // fill, which is the same statement made twice.
  assert.equal(
    blockFor('.fabricate-manager .manager-tools-row.is-selected').includes('background:'),
    false,
    'selection changes the edge, not the fill it already shares'
  );
});

test('Knowledge keeps a rail/roster/detail triptych with unclipped row actions from 1000px to 832px', async () => {
  for (const width of [1212, 1000, 880, 832]) {
    const report = await readRenderedKnowledgeGeometry(width);
    assert.equal(Math.round(report.rail.width), 220, `${width}px rail column`);
    assert.equal(Math.round(report.roster.width), 250, `${width}px roster column`);
    assert.ok(report.roster.left >= report.rail.right - 1, `${width}px roster follows the rail`);
    assert.ok(
      report.detail.left >= report.roster.right - 1,
      `${width}px detail follows the roster`
    );
    assert.equal(report.inspectorPresent, false, `${width}px no fourth inspector column`);
    assert.ok(
      report.actions.right <= report.row.right + 1,
      `${width}px row actions stay inside the row`
    );
    assert.equal(report.rowOverflow, false, `${width}px row does not overflow`);
    assert.equal(report.overflow, false, `${width}px surface does not overflow`);
  }
});
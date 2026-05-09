import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`));
  return match?.[0] || '';
}

test('manager-v2 root defines a scoped responsive app container', () => {
  const block = blockFor('.fabricate-manager-v2');

  assert.ok(block.includes('container-type: inline-size;'), 'manager-v2 should use container queries');
  assert.ok(block.includes('container-name: fabricate-manager-v2;'), 'manager-v2 should name its container');
  assert.ok(block.includes('isolation: isolate;'), 'manager-v2 should isolate its shell');
  assert.ok(block.includes('height: 100%;'), 'manager-v2 should fill the ApplicationV2 body');
  assert.ok(block.includes('overflow: hidden;'), 'manager-v2 shell should own overflow');
});

test('manager-v2 body starts as a three-region grid and stacks at narrow width', () => {
  const bodyBlock = blockFor('.fabricate-manager-v2 .manager-v2-body');

  assert.ok(
    bodyBlock.includes('grid-template-columns: 220px minmax(0, 1fr) 300px;'),
    'normal manager-v2 layout should have rail, main region, and inspector'
  );
  assert.ok(
    css.includes('@container fabricate-manager-v2 (max-width: 1120px)'),
    'manager-v2 should stack before the center table becomes unreadable'
  );
  assert.ok(
    css.includes('@container fabricate-manager-v2 (max-width: 680px)'),
    'manager-v2 should define a narrow container query'
  );
  assert.ok(
    css.includes('grid-template-columns: 1fr;'),
    'narrow manager-v2 layout should stack to one column'
  );
  assert.ok(
    css.includes('grid-template-columns: minmax(0, 1.55fr) minmax(92px, 0.42fr) 72px 118px;'),
    'normal systems table should use compact System, Resolution, Status, and Actions columns'
  );
  assert.ok(
    css.includes('min-width: 0;'),
    'manager-v2 table rows should avoid forcing default-width horizontal overflow'
  );
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-table-head') && mediumQuery.includes('display: none;'),
    'medium manager-v2 layout should switch rows to stacked cards before row actions become hidden'
  );
});

test('manager-v2 systems text and action cells are constrained at normal widths', () => {
  const nameBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-name');
  const descriptionBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-description');

  assert.ok(nameBlock.includes('-webkit-line-clamp: 2;'), 'row names should clamp instead of overflowing rows');
  assert.ok(descriptionBlock.includes('-webkit-line-clamp: 1;'), 'row descriptions should stay on one line inside compact rows');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-inspector-name {\n  display: -webkit-box;')
      && css.includes('-webkit-line-clamp: 3;'),
    'inspector names should stay readable without dominating the inspector'
  );
  assert.ok(!css.includes('.fabricate-manager-v2 .manager-v2-count-cluster'), 'system row counts should not duplicate the inspector counts');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-system-row .manager-v2-action-group'), 'system row actions should have stable width rules');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-system-row:focus-visible'), 'system rows should own the accessible focus state');
  assert.ok(css.includes('overflow-wrap: break-word;'), 'text should avoid single-letter wrapping unless needed for long strings');
});

test('manager-v2 systems status cells use stable interactive on-off toggles', () => {
  const toggleBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle');
  const onBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle.is-on');
  const offBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle.is-off');
  const trackBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle-track');
  const knobBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle-knob');
  const onKnobBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle.is-on .manager-v2-status-toggle-knob');
  const focusBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle:focus');
  const focusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-status-toggle:focus-visible');

  assert.ok(toggleBlock.includes('appearance: none;'), 'system status toggles should normalize host button styles');
  assert.ok(toggleBlock.includes('width: auto;'), 'system status toggles should size to their On/Off label instead of filling the status column');
  assert.ok(toggleBlock.includes('max-width: 64px;'), 'system status toggles should keep compact geometry');
  assert.ok(toggleBlock.includes('border-radius: 999px;'), 'system status toggles should read as toggle buttons');
  assert.ok(focusBlock.includes('outline: none;') && focusBlock.includes('box-shadow: none;'), 'mouse focus should not inherit the host orange focus ring');
  assert.ok(focusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus should keep a manager-v2 focus-visible ring');
  assert.ok(onBlock.includes('var(--fab-success'), 'enabled status should use the manager-v2 success accent family');
  assert.ok(offBlock.includes('var(--fab-warning'), 'disabled status should use a distinct muted warning/off color');
  assert.ok(trackBlock.includes('width: 24px;'), 'toggle track should reserve only enough space for the compact state control');
  assert.ok(knobBlock.includes('transition: transform'), 'toggle knob should expose a clear state change');
  assert.ok(onKnobBlock.includes('transform: translateX(10px);'), 'enabled status should move the toggle knob on');
});

test('manager-v2 selected system scope is static text with a return-to-library control', () => {
  const scopeBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-card');
  const scopeTitleBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-name');
  const returnBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-return');
  const returnFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-return:hover,\n.fabricate-manager-v2 .manager-v2-scope-return:focus-visible');
  const focusBlock = blockFor('.fabricate-manager-v2 button:focus-visible,\n.fabricate-manager-v2 input:focus-visible,\n.fabricate-manager-v2 select:focus-visible,\n.fabricate-manager-v2 [tabindex]:focus-visible');

  assert.ok(scopeBlock.includes('display: grid;'), 'selected system scope should reserve space for the return icon');
  assert.ok(scopeBlock.includes('grid-template-columns: minmax(0, 1fr) 28px;'), 'scope card should keep name and return icon aligned');
  assert.ok(scopeBlock.includes('height: 64px;'), 'scope card should keep a stable fixed height');
  assert.ok(scopeBlock.includes('white-space: normal;'), 'scope card should not inherit host nowrap rules');
  assert.ok(scopeBlock.includes('overflow: hidden;'), 'scope card should prevent long names from affecting nav layout');
  assert.ok(scopeBlock.includes('border: 1px solid var(--fab-mv2-border);'), 'scope card should render as a visible rail card');
  assert.ok(scopeTitleBlock.includes('min-width: 0;'), 'scope title should be allowed to shrink inside the grid');
  assert.ok(scopeTitleBlock.includes('max-width: 100%;'), 'scope title should not overflow the scope card');
  assert.ok(scopeTitleBlock.includes('max-height: 2.36em;'), 'scope title should have a hard two-line height cap');
  assert.ok(scopeTitleBlock.includes('font-size: 1.05rem;'), 'scope title should be prominent in the rail card');
  assert.ok(scopeTitleBlock.includes('-webkit-line-clamp: 2;'), 'scope title should clamp long selected system names');
  assert.ok(scopeTitleBlock.includes('overflow: hidden;'), 'scope title should not overflow its parent');
  assert.ok(scopeTitleBlock.includes('overflow-wrap: anywhere;'), 'scope title should break very long system names before overflow');
  assert.ok(scopeTitleBlock.includes('white-space: normal;'), 'scope title should not inherit host nowrap rules');
  assert.ok(returnBlock.includes('width: 28px;'), 'return icon should have a stable hit target inside the scope card');
  assert.ok(returnBlock.includes('color: var(--fab-mv2-text-muted);'), 'return icon should avoid danger styling');
  assert.ok(returnFocusBlock.includes('border-color: var(--fab-mv2-border-strong);'), 'return focus should stay within manager-v2 styling');
  assert.ok(focusBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'manager-v2 focus should remain visible');
  assert.equal(scopeBlock.includes('orange'), false, 'scope card should not use orange focus styling');
  assert.equal(scopeBlock.includes('red'), false, 'scope card should not use red focus styling');
});

test('manager-v2 nav buttons clear host mouse focus and keep green keyboard focus', () => {
  const navFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-button:focus');
  const activeNavFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-button.is-active:focus');
  const navFocusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-nav-button:focus-visible');

  assert.ok(navFocusBlock.includes('outline: none;'), 'mouse focus on nav buttons should not inherit the host outline');
  assert.ok(navFocusBlock.includes('box-shadow: none;'), 'mouse focus on nav buttons should not inherit the host orange focus shadow');
  assert.ok(activeNavFocusBlock.includes('box-shadow: inset 3px 0 0 var(--fab-mv2-accent);'), 'active nav focus should keep the active left accent');
  assert.ok(navFocusVisibleBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'keyboard focus on nav buttons should use the manager-v2 accent');
  assert.equal(navFocusBlock.includes('orange'), false, 'nav focus should not use orange');
  assert.equal(navFocusVisibleBlock.includes('orange'), false, 'nav keyboard focus should not use orange');
});

test('manager-v2 gathering tab buttons clear host mouse focus and keep green keyboard focus', () => {
  const gatheringTabFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-tab:focus');
  const gatheringTabFocusVisibleBlock = blockFor('.fabricate-manager-v2 .manager-v2-gathering-tab:focus-visible');

  assert.ok(gatheringTabFocusBlock.includes('outline: none;'), 'mouse focus on gathering tabs should not inherit the host outline');
  assert.ok(gatheringTabFocusBlock.includes('box-shadow: none;'), 'mouse focus on gathering tabs should not inherit the host orange focus shadow');
  assert.ok(gatheringTabFocusVisibleBlock.includes('outline: 2px solid var(--fab-success-border);'), 'keyboard focus on gathering tabs should use the manager-v2 accent');
  assert.equal(gatheringTabFocusBlock.includes('orange'), false, 'gathering tab focus should not use orange');
  assert.equal(gatheringTabFocusVisibleBlock.includes('orange'), false, 'gathering tab keyboard focus should not use orange');
});

test('manager-v2 inspector count labels wrap without truncation', () => {
  const factBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact');
  const factLineBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact-line');
  const factLeadingBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact-leading');
  const featureListBlock = blockFor('.fabricate-manager-v2 .manager-v2-feature-list');

  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'count facts should use a two-column inspector grid');
  assert.ok(factBlock.includes('display: block;'), 'count facts should render one phrase instead of wrapping separate flex children');
  assert.ok(!factBlock.includes('display: flex;'), 'count facts should not split values and labels into separate flex items');
  assert.ok(factLineBlock.includes('display: inline;'), 'count facts should keep value and label in normal inline text flow');
  assert.ok(factLeadingBlock.includes('white-space: nowrap;'), 'count facts should keep the value and first label word together');
  assert.ok(!factBlock.includes('white-space: nowrap;'), 'count fact cards should not force single-line labels');
  assert.ok(factLineBlock.includes('overflow-wrap: break-word;'), 'count fact text should wrap at word boundaries with long-word fallback');
  assert.ok(!factLineBlock.includes('overflow: hidden;'), 'count fact text should not clip full labels');
  assert.ok(!factLineBlock.includes('text-overflow: ellipsis;'), 'count fact text should not ellipsize full labels');
  assert.ok(!factLineBlock.includes('overflow-wrap: anywhere;'), 'count facts should not allow character-level wrapping');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-fact.is-off'), 'disabled count facts should span the count grid');
  assert.ok(css.includes('grid-column: 1 / -1;'), 'disabled count facts should have enough width for label-first text');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-fact strong.is-disabled'), 'disabled count values should preserve emphasis');
  assert.ok(featureListBlock.includes('align-items: flex-start;'), 'feature pills should align to the top of the card');
  assert.ok(featureListBlock.includes('justify-content: flex-start;'), 'feature pills should align to the left of the card');
});

test('manager-v2 empty states use refined heading and setup-panel styling', () => {
  const emptyIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-empty > div > i');
  const emptyLayerIconBlock = blockFor('.fabricate-manager-v2 .manager-v2-empty > div > i.fa-layer-group');
  const emptyHeadingBlock = blockFor('.fabricate-manager-v2 .manager-v2-empty h3');
  const setupCardBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-card');
  const setupHeaderBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-card-header');
  const setupListBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-list');
  const setupLinksBlock = blockFor('.fabricate-manager-v2 .manager-v2-setup-links');

  assert.ok(emptyIconBlock.includes('font-size: 1.55rem;'), 'generic empty-state icons should be larger than body text');
  assert.ok(emptyLayerIconBlock.includes('font-size: 1.9rem;'), 'no-systems empty icon should be more prominent');
  assert.ok(emptyHeadingBlock.includes('font-weight: 600;'), 'empty-state headings should be lighter than heavy admin titles');
  assert.ok(emptyHeadingBlock.includes('font-size: 0.98rem;'), 'empty-state headings should stay compact');
  assert.ok(setupCardBlock.includes('display: grid;'), 'no-systems inspector setup panel should use compact grid layout');
  assert.ok(setupCardBlock.includes('border: 1px solid var(--fab-mv2-border);'), 'setup panel should use manager-v2 flat borders');
  assert.ok(setupHeaderBlock.includes('grid-template-columns: 38px minmax(0, 1fr);'), 'setup panel should reserve icon space');
  assert.ok(setupListBlock.includes('line-height: 1.35;'), 'setup tips should stay dense and readable');
  assert.ok(setupLinksBlock.includes('flex-wrap: wrap;'), 'setup links should wrap in narrow inspectors');
});

test('manager-v2 recipes browser defines compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipes-table');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipe-identity');
  const statusCellBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-row .manager-v2-status-cell,\n.fabricate-manager-v2 .manager-v2-recipe-row .manager-v2-status-cell,\n.fabricate-manager-v2 .manager-v2-environment-row .manager-v2-status-cell');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    tableBlock.includes('--fab-mv2-recipe-grid: minmax(0, 1.35fr)'),
    'recipes table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-recipes-table.has-no-category'),
    'recipes table should have a no-category grid variant'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-recipe-row,\n.fabricate-manager-v2 .manager-v2-component-row,\n.fabricate-manager-v2 .manager-v2-environment-row,\n.fabricate-manager-v2 .manager-v2-essence-row {\n  width: 100%;\n  min-height: 76px;'),
    'recipe, component, environment, and essence rows should have stable row height'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity'),
    'recipe identity should reserve thumbnail space'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-recipe-row .manager-v2-status-cell'),
    'recipe status cells should use the shared compact status-toggle alignment'
  );
  assert.ok(statusCellBlock.includes('justify-self: start;'), 'shared status toggle cells should align compact toggles to the start');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-recipe-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack recipe rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-labeled-cell::before') && mediumQuery.includes('content: attr(data-label);'),
    'stacked recipe cells should expose visible labels after table headers are hidden'
  );
});

test('manager-v2 components browser defines drop target and compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-components-table');
  const toolbarBlock = Array.from(css.matchAll(/\.fabricate-manager-v2 \.manager-v2-toolbar\s*\{[\s\S]*?\}/g))
    .map(match => match[0])
    .join('\n');
  const toolbarPrimaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-toolbar-primary');
  const toolbarPillsBlock = blockFor('.fabricate-manager-v2 .manager-v2-toolbar-pills');
  const dropBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-drop-zone');
  const tagSearchBlock = blockFor('.fabricate-manager-v2 .manager-v2-tag-search');
  const tagSuggestionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-tag-suggestions');
  const selectedTagPillBlock = blockFor('.fabricate-manager-v2 .manager-v2-selected-tag-pill');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-identity');
  const componentCopyBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-identity .manager-v2-system-copy');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="components"] .manager-v2-main'),
    'components route should reserve rows for header, drop target, toolbar, and table'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-component-grid: minmax(0, 1.42fr)'),
    'components table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-components-table.has-no-tags.has-no-essences.has-progressive-difficulty'),
    'components table should have a no-tags/no-essences progressive grid variant'
  );
  assert.ok(dropBlock.includes('grid-template-columns: 42px minmax(0, 1fr);'), 'component drop zone should reserve icon and copy space');
  assert.ok(dropBlock.includes('margin: 12px;'), 'component drop zone should keep balanced vertical spacing around the toolbar');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-component-drop-zone.is-drop-active'), 'component drop zone should expose an active drag state');
  assert.ok(toolbarBlock.includes('display: grid;'), 'manager-v2 toolbar should own a grid layout for primary controls and auxiliary rows');
  assert.ok(toolbarBlock.includes('grid-template-columns: minmax(0, 1fr);'), 'manager-v2 toolbar grid should keep rows bounded to the main content width');
  assert.ok(toolbarPrimaryBlock.includes('display: flex;'), 'manager-v2 primary toolbar row should lay out controls as a flex row');
  assert.ok(toolbarPrimaryBlock.includes('flex-wrap: wrap;'), 'manager-v2 primary toolbar row should wrap controls without involving selected pills');
  assert.ok(toolbarPillsBlock.includes('display: flex;'), 'manager-v2 pill row should be its own flex row');
  assert.ok(toolbarPillsBlock.includes('flex-wrap: wrap;'), 'manager-v2 pill row should wrap selected tags independently');
  assert.ok(toolbarPillsBlock.includes('width: 100%;'), 'manager-v2 pill row should occupy a full toolbar row');
  assert.ok(tagSearchBlock.includes('position: relative;'), 'component tag search should anchor its suggestion list to the control');
  assert.ok(tagSearchBlock.includes('max-width: 320px;'), 'component tag search should keep bounded toolbar geometry');
  assert.ok(tagSuggestionsBlock.includes('position: absolute;'), 'component tag suggestions should overlay below the search field without shifting the toolbar');
  assert.ok(tagSuggestionsBlock.includes('max-height: 148px;'), 'component tag suggestions should be scroll bounded');
  assert.ok(selectedTagPillBlock.includes('padding-right: 4px;'), 'selected tag pills should reserve compact space for the remove button');
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity,\n.fabricate-manager-v2 .manager-v2-environment-identity'),
    'component identity should reserve thumbnail space'
  );
  assert.ok(
    componentCopyBlock.includes('max-height: 52px;') && componentCopyBlock.includes('overflow: hidden;'),
    'component identity copy should clamp inside the row instead of overflowing below the thumbnail'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-component-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack component rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-action-group.manager-v2-labeled-cell') && mediumQuery.includes('display: flex;'),
    'stacked component action groups should keep buttons in a compact action cluster'
  );
});

test('manager-v2 essence browser defines compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-essences-table');
  const noSourceBlock = blockFor('.fabricate-manager-v2 .manager-v2-essences-table.has-no-source');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-identity');
  const sourceImageBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-source-cell-image');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="essences"] .manager-v2-main'),
    'essences route should define route-specific rows'
  );
  assert.ok(
    blockFor('.fabricate-manager-v2[data-manager-v2-view="essences"] .manager-v2-main').includes('grid-template-rows: auto auto minmax(0, 1fr);'),
    'essences route should reserve rows for header, toolbar, and table'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-essence-grid: minmax(0, 1.55fr)'),
    'essences table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    noSourceBlock.includes('--fab-mv2-essence-grid: minmax(0, 1.7fr)'),
    'essences table should have a no-source grid variant when effect transfer is disabled'
  );
  assert.ok(identityBlock.includes('grid-template-columns: 44px minmax(0, 1fr);'), 'essence identity should reserve icon space');
  assert.ok(sourceImageBlock.includes('width: 36px;') && sourceImageBlock.includes('height: 36px;'), 'essence source cells should render stable image-only evidence');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack essence rows before columns become cramped'
  );
});

test('manager-v2 essence edit route defines picker-based responsive geometry', () => {
  const mainBlock = blockFor('.fabricate-manager-v2[data-manager-v2-view="essence-edit"] .manager-v2-main');
  const editGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-edit-grid');
  const sourceSummaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-source-summary');
  const inspectorSourceSummaryBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-inspector-source-summary');
  const inspectorSourceActionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-inspector-source-actions');
  const warningActionBlock = blockFor('.fabricate-manager-v2 .manager-v2-button.is-warning-action,\n.fabricate-manager-v2 .manager-v2-icon-button.is-warning-action');
  const sourceDropBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-source-drop-zone .essence-source-trigger');
  const usageGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-usage-grid');
  const usageItemBlock = blockFor('.fabricate-manager-v2 .manager-v2-essence-usage-item');
  const iconTriggerBlock = blockFor('.fabricate-manager-v2 .essence-icon-picker-trigger');
  const sourceTriggerBlock = blockFor('.fabricate-manager-v2 .essence-source-trigger');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 680px)'));

  assert.ok(mainBlock.includes('grid-template-rows: minmax(0, 1fr);'), 'essence edit route should let the identity card be the first main content');
  assert.ok(editGridBlock.includes('grid-template-columns: var(--fab-mv2-essence-icon-column, 156px) minmax(0, 1fr);'), 'essence edit identity fields should reserve stable icon picker space');
  assert.ok(sourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr) 34px;'), 'essence source summary should reserve source image, evidence, and clear action columns');
  assert.ok(!inspectorSourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr) auto;'), 'inspector source summary should not crowd evidence and unlink into a three-column row');
  assert.ok(inspectorSourceSummaryBlock.includes('grid-template-columns: 54px minmax(0, 1fr);'), 'inspector source summary should be only the linked item evidence card');
  assert.ok(inspectorSourceActionsBlock.includes('margin-top: 10px;'), 'inspector source action row should sit below the linked item card');
  assert.ok(inspectorSourceActionsBlock.includes('display: grid;'), 'inspector source actions should use stable row geometry');
  assert.ok(inspectorSourceActionsBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'inspector source actions should keep copy and unlink on the same row');
  assert.ok(!mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-inspector-source-actions .manager-v2-button'), 'narrow manager-v2 layout should not stack the selected essence source actions');
  assert.ok(warningActionBlock.includes('var(--fab-warning'), 'unlink source should have an amber warning-action button style');
  assert.ok(sourceDropBlock.includes('width: 100%;'), 'essence source drop target should use the full source panel width');
  assert.ok(sourceDropBlock.includes('height: 84px;'), 'essence source drop target should have a stable wide drop-zone height');
  assert.ok(iconTriggerBlock.includes('grid-template-columns: 28px minmax(0, 1fr) 16px;'), 'icon picker trigger should be a real picker control, not a raw text field');
  assert.ok(sourceTriggerBlock.includes('aspect-ratio: 1 / 1;'), 'source picker should keep a stable drop target');
  assert.ok(usageGridBlock.includes('max-height: 132px;'), 'essence usage thumbnails should stay scroll-contained in the inspector');
  assert.ok(usageItemBlock.includes('aspect-ratio: 1 / 1;'), 'essence usage thumbnails should be square image-only controls');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-edit-grid')
      && mediumQuery.includes('.fabricate-manager-v2 .manager-v2-essence-source-summary'),
    'narrow manager-v2 layout should stack essence edit controls'
  );
});

test('manager-v2 environments browser and edit route define compact responsive geometry', () => {
  const toolbarBlock = blockFor('.fabricate-manager-v2 .manager-v2-environments-toolbar');
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-environments-table');
  const taskCountBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-task-count');
  const actionsBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-actions');
  const actionGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-action-grid');
  const editorShellBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-editor-shell');
  const editorViewBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-edit-view');
  const detailsGridBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-details-grid');
  const workspaceBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-workspace');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    toolbarBlock.includes('max-height: 100px;') && toolbarBlock.includes('overflow-y: auto;'),
    'environments toolbar should keep wrapped filters height-bounded instead of pushing the empty state down'
  );
  assert.ok(
    toolbarBlock.includes('align-content: flex-start;'),
    'environments toolbar should keep wrapped filter rows pinned to the top of its bounded scroll area'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-environment-grid: minmax(0, 1.72fr) minmax(86px, 0.42fr) 46px 72px 116px;'),
    'environments table should define five compact columns without a linked-scene column'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-identity {\n  grid-template-columns: 72px minmax(0, 1fr);'),
    'environment identity should reserve a wider scene thumbnail'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-thumb {\n  width: 72px;\n  height: 48px;'),
    'environment thumbnails should use scene-like proportions'
  );
  assert.ok(taskCountBlock.includes('font-weight: 800;'), 'environment task count should render as plain emphasized text');
  assert.ok(actionsBlock.includes('grid-template-columns: 72px 34px;'), 'environment row actions should reserve edit/delete grid plus reorder stack');
  assert.ok(actionGridBlock.includes('grid-template-columns: repeat(2, 34px);'), 'environment edit duplicate delete buttons should sit in a compact grid');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-reorder-stack {\n  grid-template-rows: repeat(2, 34px);'),
    'environment move up/down buttons should stack at the right edge'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-row .manager-v2-status-cell'),
    'environment status cells should align the shared compact status toggle'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="environment-edit"] .manager-v2-main'),
    'environment edit route should reserve scrollable editor space'
  );
  assert.ok(editorShellBlock.includes('overflow: auto;'), 'environment editor shell should own scroll containment at normal widths');
  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="environment-edit"] .manager-v2-body') && css.includes('grid-template-columns: 220px minmax(0, 1fr);'),
    'environment edit route should replace the browse inspector with a two-region rail/editor grid'
  );
  assert.ok(editorViewBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'environment editor should reserve details band plus scrollable workspace');
  assert.ok(
    detailsGridBlock.includes('grid-template-columns: minmax(300px, 1.02fr) minmax(360px, 1.1fr) minmax(230px, 0.58fr);'),
    'environment details band should expose identity, scene linkage, and status/evidence at normal widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-status-card {\n  display: flex;'),
    'environment details band should include a compact status/evidence card'
  );
  assert.ok(
    workspaceBlock.includes('grid-template-columns: minmax(220px, 0.45fr) minmax(420px, 1fr);'),
    'environment editor workspace should expose only task rail and selected task editor at normal widths'
  );
  assert.ok(
    !css.includes('manager-v2-environment-evidence-column'),
    'environment editor CSS should no longer reference the removed evidence column'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-environment-validation-band'),
    'environment editor should style the collapsible validation band above the workspace'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-scene-drop-zone'),
    'environment editor should style the scene drag-drop zone'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .image-path-picker.is-button-only .image-path-picker-button'),
    'environment editor should style the button-only ImagePathPicker variant'
  );
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-environment-scene-card'), 'environment editor should define a linked scene card');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-task-tabs'), 'environment editor should define task tabs');
  assert.equal(css.includes('.fabricate-manager-v2 .manager-v2-environment-details-tabs'), false, 'environment editor should not define removed environment advanced tabs');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-row') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium manager-v2 layout should stack environment rows before columns become cramped'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-editor-shell') && mediumQuery.includes('overflow: visible;'),
    'stacked environment edit layout should release nested scroll containment'
  );
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-environment-workspace') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'stacked environment editor should put details, task rail, editor, and evidence in one column'
  );
});

test('manager-v2 system edit view defines scoped stable form and toggle layout', () => {
  const mainBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-edit-main');
  const formBlock = blockFor('.fabricate-manager-v2 .manager-v2-system-edit-form');
  const gridBlock = blockFor('.fabricate-manager-v2 .manager-v2-edit-grid');
  const fieldInputBlock = blockFor('.fabricate-manager-v2 .manager-v2-field input,\n.fabricate-manager-v2 .manager-v2-field select');
  const toggleListBlock = blockFor('.fabricate-manager-v2 .manager-v2-toggle-list');
  const toggleRowBlock = blockFor('.fabricate-manager-v2 .manager-v2-toggle-row');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));
  const narrowQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 680px)'));

  assert.ok(mainBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'system edit main should reserve scrollable form space');
  assert.ok(formBlock.includes('overflow: auto;'), 'system edit form should own scroll containment at normal widths');
  assert.ok(gridBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'system edit fields should use a stable two-column grid');
  assert.ok(fieldInputBlock.includes('height: 36px;'), 'system edit inputs and selects should have stable control height');
  assert.ok(toggleListBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'feature toggles should use stable two-column rows');
  assert.ok(toggleRowBlock.includes('grid-template-columns: 20px minmax(0, 1fr);'), 'toggle rows should reserve checkbox width');
  assert.ok(
    mediumQuery.includes('.fabricate-manager-v2 .manager-v2-toggle-list') && mediumQuery.includes('grid-template-columns: minmax(0, 1fr);'),
    'medium edit layout should collapse feature toggles before text becomes cramped'
  );
  assert.ok(
    narrowQuery.includes('.fabricate-manager-v2 .manager-v2-edit-card-heading') && narrowQuery.includes('flex-direction: column;'),
    'narrow edit card headings should stack actions under titles'
  );
});

test('manager-v2 pagination footer uses scoped chrome with stable summary, nav, and per-page controls', () => {
  const block = blockFor('.fabricate-manager-v2 .manager-v2-pagination');

  assert.ok(block.includes('display: flex;'), 'pagination footer should layout horizontally');
  assert.ok(block.includes('justify-content: space-between;'), 'pagination footer should distribute summary, nav, per-page across the row');
  assert.ok(block.includes('flex-wrap: wrap;'), 'pagination footer should wrap on narrow widths');
  assert.ok(block.includes('border-top: 1px solid var(--fab-mv2-border);'), 'pagination footer should anchor to the table with a manager-v2 border');
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-pagination-page'),
    'pagination should expose a stable Page-of label for keyboard users'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-pagination-size select'),
    'pagination should style the per-page selector inside the manager-v2 scope'
  );
});

test('design-system colour tokens are declared in the theme layer as the agreed source of truth', () => {
  const rootBlock = blockFor(':root');
  const themeBlock = [
    blockFor(':root,\n:root[data-fabricate-theme="fabricate"],\n.fabricate[data-fabricate-theme="fabricate"]'),
    blockFor(':root[data-fabricate-theme="mythwright"],\n.fabricate[data-fabricate-theme="mythwright"]')
  ].join('\n');

  for (const token of [
    '--fab-bg-0:',
    '--fab-bg-1:',
    '--fab-bg-2:',
    '--fab-bg-3:',
    '--fab-surface:',
    '--fab-surface-soft:',
    '--fab-surface-raised:',
    '--fab-border:',
    '--fab-border-strong:',
    '--fab-text:',
    '--fab-text-muted:',
    '--fab-text-subtle:',
    '--fab-accent:',
    '--fab-accent-hover:',
    '--fab-accent-strong:',
    '--fab-accent-soft:',
    '--fab-info:',
    '--fab-info-soft:',
    '--fab-warning:',
    '--fab-warning-soft:',
    '--fab-danger:',
    '--fab-danger-soft:',
    '--fab-purple:',
    '--fab-purple-soft:'
  ]) {
    assert.ok(themeBlock.includes(token), `theme layer should declare design-system colour token ${token.replace(':', '')}`);
  }

  for (const token of [
    '--fab-space-1:',
    '--fab-space-2:',
    '--fab-space-3:',
    '--fab-space-4:',
    '--fab-space-5:',
    '--fab-space-6:'
  ]) {
    assert.ok(rootBlock.includes(token), `root layer should declare design-system layout token ${token.replace(':', '')}`);
  }
});

test('manager-v2 icon buttons normalize host button defaults and keep pointer targets stable', () => {
  const block = blockFor('.fabricate-manager-v2 .manager-v2-button,\n.fabricate-manager-v2 .manager-v2-icon-button');
  const iconBlocks = Array.from(css.matchAll(/\.fabricate-manager-v2 \.manager-v2-icon-button\s*\{[\s\S]*?\}/g));
  const iconBlock = iconBlocks.at(-1)?.[0] || '';

  assert.ok(block.includes('appearance: none;'), 'manager-v2 buttons should clear host appearance');
  assert.ok(block.includes('-webkit-appearance: none;'), 'manager-v2 buttons should clear WebKit host appearance');
  assert.ok(block.includes('box-sizing: border-box;'), 'manager-v2 buttons should use border-box sizing');
  assert.ok(block.includes('display: inline-flex;'), 'manager-v2 buttons should center contents with inline-flex');
  assert.ok(block.includes('min-width: 0;'), 'manager-v2 buttons should clear host min-width defaults');
  assert.ok(iconBlock.includes('width: 34px;'), 'icon buttons should have a stable width of at least 32px');
  assert.ok(iconBlock.includes('height: 34px;'), 'icon buttons should have a stable height of at least 32px');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-button:disabled'), 'disabled manager-v2 buttons should have explicit disabled styling');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-button:not(:disabled):hover'), 'manager-v2 hover styles should not target disabled buttons');
});

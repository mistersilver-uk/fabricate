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
    bodyBlock.includes('grid-template-columns: 210px minmax(0, 1fr) 280px;'),
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
    css.includes('grid-template-columns: minmax(0, 1.5fr) minmax(92px, 0.45fr) minmax(92px, 0.45fr) 118px;'),
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

test('manager-v2 selected system scope is a clear-selection card with accessible focus', () => {
  const scopeBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-button');
  const scopeFocusBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-button:hover,\n.fabricate-manager-v2 .manager-v2-scope-button:focus-visible');
  const clearBlock = blockFor('.fabricate-manager-v2 .manager-v2-scope-clear');
  const focusBlock = blockFor('.fabricate-manager-v2 button:focus-visible,\n.fabricate-manager-v2 input:focus-visible,\n.fabricate-manager-v2 select:focus-visible,\n.fabricate-manager-v2 [tabindex]:focus-visible');

  assert.ok(scopeBlock.includes('display: grid;'), 'selected system scope should reserve space for the clear icon');
  assert.ok(scopeBlock.includes('grid-template-columns: minmax(0, 1fr) 28px;'), 'scope button should keep name and x icon aligned');
  assert.ok(scopeBlock.includes('border: 1px solid var(--fab-mv2-border);'), 'scope button should render as a visible rail card');
  assert.ok(clearBlock.includes('width: 28px;'), 'clear icon should have a stable hit target inside the scope card');
  assert.ok(clearBlock.includes('color: var(--fab-mv2-text-muted);'), 'clear icon should avoid danger styling');
  assert.ok(scopeFocusBlock.includes('border-color: var(--fab-mv2-border-strong);'), 'scope focus should stay within manager-v2 styling');
  assert.ok(focusBlock.includes('outline: 2px solid var(--fab-mv2-accent);'), 'manager-v2 focus should remain visible');
  assert.equal(scopeBlock.includes('orange'), false, 'scope button should not use orange focus styling');
  assert.equal(scopeBlock.includes('red'), false, 'scope button should not use red focus styling');
});

test('manager-v2 inspector count labels wrap without truncation', () => {
  const factBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact');
  const factTextBlock = blockFor('.fabricate-manager-v2 .manager-v2-fact strong,\n.fabricate-manager-v2 .manager-v2-fact span');
  const featureListBlock = blockFor('.fabricate-manager-v2 .manager-v2-feature-list');

  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), 'count facts should use a two-column inspector grid');
  assert.ok(factBlock.includes('display: flex;'), 'count facts should keep value and label in one compact row when space allows');
  assert.ok(factBlock.includes('flex-wrap: wrap;'), 'count facts should allow labels such as Recipe categories to wrap instead of truncating');
  assert.ok(factBlock.includes('align-items: baseline;'), 'count facts should align numeric values with labels');
  assert.ok(!factBlock.includes('white-space: nowrap;'), 'count fact cards should not force single-line labels');
  assert.ok(factTextBlock.includes('overflow-wrap: break-word;'), 'count fact text should wrap at word boundaries with long-word fallback');
  assert.ok(!factTextBlock.includes('overflow: hidden;'), 'count fact text should not clip full labels');
  assert.ok(!factTextBlock.includes('text-overflow: ellipsis;'), 'count fact text should not ellipsize full labels');
  assert.ok(!factTextBlock.includes('white-space: nowrap;'), 'count fact text should not suppress label wrapping');
  assert.ok(!factTextBlock.includes('overflow-wrap: anywhere;'), 'count facts should not allow character-level wrapping');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-fact.is-off'), 'disabled count facts should span the count grid');
  assert.ok(css.includes('grid-column: 1 / -1;'), 'disabled count facts should have enough width for label-first text');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-fact strong.is-disabled'), 'disabled count values should preserve emphasis');
  assert.ok(featureListBlock.includes('align-items: flex-start;'), 'feature pills should align to the top of the card');
  assert.ok(featureListBlock.includes('justify-content: flex-start;'), 'feature pills should align to the left of the card');
});

test('manager-v2 recipes browser defines compact responsive table geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipes-table');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-recipe-identity');
  const toggleBlock = blockFor('.fabricate-manager-v2 .manager-v2-toggle input');
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
    css.includes('.fabricate-manager-v2 .manager-v2-recipe-row,\n.fabricate-manager-v2 .manager-v2-component-row,\n.fabricate-manager-v2 .manager-v2-environment-row {\n  width: 100%;\n  min-height: 76px;'),
    'recipe, component, and environment rows should have stable row height'
  );
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity'),
    'recipe identity should reserve thumbnail space'
  );
  assert.ok(toggleBlock.includes('width: 18px;'), 'recipe enabled toggle should keep a stable hit target');
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
  const dropBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-drop-zone');
  const identityBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-identity');
  const evidenceBlock = blockFor('.fabricate-manager-v2 .manager-v2-component-evidence');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="components"] .manager-v2-main'),
    'components route should reserve rows for header, drop target, toolbar, and table'
  );
  assert.ok(
    tableBlock.includes('--fab-mv2-component-grid: minmax(0, 1.25fr)'),
    'components table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2 .manager-v2-components-table.has-no-tags.has-no-essences'),
    'components table should have a no-tags/no-essences grid variant'
  );
  assert.ok(dropBlock.includes('grid-template-columns: 42px minmax(0, 1fr);'), 'component drop zone should reserve icon and copy space');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-component-drop-zone.is-drop-active'), 'component drop zone should expose an active drag state');
  assert.ok(
    identityBlock.includes('grid-template-columns: 46px minmax(0, 1fr);')
      || css.includes('.fabricate-manager-v2 .manager-v2-recipe-identity,\n.fabricate-manager-v2 .manager-v2-component-identity,\n.fabricate-manager-v2 .manager-v2-environment-identity'),
    'component identity should reserve thumbnail space'
  );
  assert.ok(
    evidenceBlock.includes('flex-wrap: wrap;')
      || css.includes('.fabricate-manager-v2 .manager-v2-component-evidence,\n.fabricate-manager-v2 .manager-v2-environment-evidence'),
    'component evidence chips should wrap instead of overflowing'
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

test('manager-v2 environments browser and edit route define compact responsive geometry', () => {
  const tableBlock = blockFor('.fabricate-manager-v2 .manager-v2-environments-table');
  const editorShellBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-editor-shell');
  const editorViewBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-edit-view');
  const workspaceBlock = blockFor('.fabricate-manager-v2 .manager-v2-environment-workspace');
  const mediumQuery = css.slice(css.indexOf('@container fabricate-manager-v2 (max-width: 1120px)'));

  assert.ok(
    tableBlock.includes('--fab-mv2-environment-grid: minmax(0, 1.35fr)'),
    'environments table should define shrinkable compact columns for normal Foundry manager widths'
  );
  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="environment-edit"] .manager-v2-main'),
    'environment edit route should reserve scrollable editor space'
  );
  assert.ok(editorShellBlock.includes('overflow: auto;'), 'environment editor shell should own scroll containment at normal widths');
  assert.ok(
    css.includes('.fabricate-manager-v2[data-manager-v2-view="environment-edit"] .manager-v2-body') && css.includes('grid-template-columns: 210px minmax(0, 1fr);'),
    'environment edit route should replace the browse inspector with a two-region rail/editor grid'
  );
  assert.ok(editorViewBlock.includes('grid-template-rows: auto minmax(0, 1fr);'), 'environment editor should reserve details band plus scrollable workspace');
  assert.ok(
    workspaceBlock.includes('grid-template-columns: minmax(210px, 0.58fr) minmax(360px, 1.45fr) minmax(250px, 0.72fr);'),
    'environment editor workspace should expose task rail, selected task editor, and evidence column at normal widths'
  );
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-environment-scene-card'), 'environment editor should define a linked scene card');
  assert.ok(css.includes('.fabricate-manager-v2 .manager-v2-task-tabs'), 'environment editor should define task tabs');
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

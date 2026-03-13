import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

function buildEssenceCreateLayout() {
  const root = document.createElement('div');
  root.className = 'essence-creation-form';

  const selector = document.createElement('div');
  selector.className = 'essence-source-selector';
  root.appendChild(selector);

  const fields = document.createElement('div');
  fields.className = 'essence-creation-fields';

  const toolbar = document.createElement('div');
  toolbar.className = 'panel-toolbar compact essence-creation-toolbar';
  fields.appendChild(toolbar);

  const descriptionRow = document.createElement('div');
  descriptionRow.className = 'essence-creation-description-row';
  fields.appendChild(descriptionRow);

  const actions = document.createElement('div');
  actions.className = 'essence-creation-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'essence-create-submit';
  actions.appendChild(button);
  fields.appendChild(actions);

  root.appendChild(fields);
  return root;
}

function buildEssenceDefinitionRow() {
  const article = document.createElement('article');
  article.className = 'essence-definition-row';

  const selector = document.createElement('div');
  selector.className = 'essence-source-selector';

  const selectorShell = document.createElement('div');
  selectorShell.className = 'essence-source-selector-shell';
  selector.appendChild(selectorShell);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'essence-source-trigger has-value';
  selectorShell.appendChild(trigger);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'essence-source-clear';
  selectorShell.appendChild(clear);

  const meta = document.createElement('div');
  meta.className = 'essence-definition-meta';

  const actions = document.createElement('div');
  actions.className = 'essence-definition-actions';

  article.appendChild(selector);
  article.appendChild(meta);
  article.appendChild(actions);

  return article;
}

function buildEssenceSourcePopover() {
  const selector = document.createElement('div');
  selector.className = 'essence-source-selector';

  const popover = document.createElement('div');
  popover.className = 'essence-source-picker-popover';

  const search = document.createElement('div');
  search.className = 'essence-source-picker-search';
  const input = document.createElement('input');
  search.appendChild(input);

  const grid = document.createElement('div');
  grid.className = 'essence-source-picker-grid';

  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'essence-source-picker-option selected';
  grid.appendChild(option);

  popover.appendChild(search);
  popover.appendChild(grid);
  selector.appendChild(popover);
  return selector;
}

describe('Essence source item layout structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('places the create-form source selector to the left of the creation fields', () => {
    const root = buildEssenceCreateLayout();
    assert.equal(root.firstElementChild?.className, 'essence-source-selector');
    assert.equal(root.lastElementChild?.className, 'essence-creation-fields');
  });

  it('keeps the create description row separate from the top toolbar row', () => {
    const root = buildEssenceCreateLayout();
    const fields = root.querySelector('.essence-creation-fields');
    const children = [...fields.children].map(node => node.className);

    assert.deepEqual(children, [
      'panel-toolbar compact essence-creation-toolbar',
      'essence-creation-description-row',
      'essence-creation-actions'
    ]);
  });

  it('renders the create action as the final full-row button', () => {
    const root = buildEssenceCreateLayout();
    const actions = root.querySelector('.essence-creation-actions');

    assert.ok(actions.querySelector('.essence-create-submit'));
    assert.equal(actions, root.querySelector('.essence-creation-fields').lastElementChild);
  });

  it('places the edit-row source selector before the meta and action columns', () => {
    const row = buildEssenceDefinitionRow();
    const children = [...row.children].map(node => node.className);

    assert.deepEqual(children, [
      'essence-source-selector',
      'essence-definition-meta',
      'essence-definition-actions'
    ]);
  });

  it('renders the source selector shell with a trigger and clear button overlay', () => {
    const row = buildEssenceDefinitionRow();
    const shell = row.querySelector('.essence-source-selector-shell');

    assert.ok(shell.querySelector('.essence-source-trigger'));
    assert.ok(shell.querySelector('.essence-source-clear'));
  });

  it('renders the source picker popover with search and option grid', () => {
    const selector = buildEssenceSourcePopover();
    const popover = selector.querySelector('.essence-source-picker-popover');

    assert.ok(popover.querySelector('.essence-source-picker-search input'));
    assert.ok(popover.querySelector('.essence-source-picker-grid'));
    assert.ok(popover.querySelector('.essence-source-picker-option.selected'));
  });
});

describe('Essence source item layout CSS', () => {
  it('defines a two-column create-form layout with the source selector on the left', () => {
    const match = css.match(/\.fabricate-admin \.essence-creation-form \{[\s\S]*?\}/);
    assert.ok(match, '.essence-creation-form selector should exist');
    const block = match[0];

    assert.ok(block.includes('display: grid'), 'create form should use grid layout');
    assert.ok(
      block.includes('grid-template-columns: 80px minmax(0, 1fr)'),
      'create form should reserve a fixed left column for the source selector'
    );
  });

  it('defines the edit row with source selector, meta column, and actions column', () => {
    const match = css.match(/\.fabricate-admin \.essence-definition-row \{[\s\S]*?\}/);
    assert.ok(match, '.essence-definition-row selector should exist');
    const block = match[0];

    assert.ok(
      block.includes('grid-template-columns: 80px minmax(0, 1fr) auto'),
      'edit rows should reserve the left source selector column'
    );
  });

  it('defines a dedicated full-row create action style for the essence creation button', () => {
    assert.ok(
      css.includes('.fabricate-admin .essence-creation-actions'),
      'create action row selector should exist'
    );
    assert.ok(
      css.includes('.fabricate-admin .essence-create-submit'),
      'create submit button selector should exist'
    );
  });

  it('styles the source trigger, remove overlay, drop-active state, and picker popover', () => {
    assert.ok(
      css.includes('.fabricate-admin .essence-source-trigger'),
      'source trigger selector should exist'
    );
    assert.ok(
      css.includes('.fabricate-admin .essence-source-clear'),
      'source clear button selector should exist'
    );
    assert.ok(
      css.includes('.fabricate-admin .essence-source-selector-shell.drop-active .essence-source-trigger'),
      'drop-active selector should exist for drag feedback'
    );
    assert.ok(
      css.includes('.fabricate-admin .essence-source-picker-popover'),
      'source picker popover selector should exist'
    );
    assert.ok(
      css.includes('.fabricate-admin .essence-source-picker-option.selected'),
      'selected picker option selector should exist'
    );
  });
});

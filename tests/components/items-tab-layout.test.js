import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
const css = readFileSync(cssPath, 'utf8');

function buildItemsTab({ hasSystem = true, itemCount = 2 } = {}) {
  const section = document.createElement('section');
  section.className = 'admin-panel items-panel';

  if (!hasSystem) {
    const empty = document.createElement('div');
    empty.className = 'fabricate-empty';
    section.appendChild(empty);
    return section;
  }

  const header = document.createElement('div');
  header.className = 'items-panel-header';

  const toolbar = document.createElement('div');
  toolbar.className = 'panel-toolbar component-toolbar';

  const search = document.createElement('div');
  search.className = 'fabricate-search has-clear-button';

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'search';
  search.appendChild(input);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'fabricate-search-clear';
  search.appendChild(clearButton);

  const searchIcon = document.createElement('span');
  searchIcon.className = 'fabricate-search-icon';
  search.appendChild(searchIcon);

  toolbar.appendChild(search);
  header.appendChild(toolbar);

  const dropZoneShell = document.createElement('div');
  dropZoneShell.className = 'admin-item-drop-zone';

  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZoneShell.appendChild(dropZone);

  header.appendChild(dropZoneShell);
  section.appendChild(header);

  const scrollRegion = document.createElement('div');
  scrollRegion.className = 'items-panel-scroll';

  if (itemCount > 0) {
    const grid = document.createElement('div');
    grid.className = 'system-item-grid';

    for (let index = 0; index < itemCount; index++) {
      const card = document.createElement('article');
      card.className = 'system-item-card';

      const overlay = document.createElement('div');
      overlay.className = 'item-replace-overlay';
      card.appendChild(overlay);

      const preview = document.createElement('div');
      preview.className = 'item-preview';
      card.appendChild(preview);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const metaHeader = document.createElement('div');
      metaHeader.className = 'item-meta-header';
      const sourceButton = document.createElement('button');
      sourceButton.className = 'item-source-button';
      metaHeader.appendChild(sourceButton);
      meta.appendChild(metaHeader);
      grid.appendChild(card);
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'item-actions';
      card.appendChild(actions);
    }

    scrollRegion.appendChild(grid);
  } else {
    const empty = document.createElement('div');
    empty.className = 'fabricate-empty';
    scrollRegion.appendChild(empty);
  }

  section.appendChild(scrollRegion);
  return section;
}

describe('ItemsTab layout structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders the fixed header before the scroll region when a system is selected', () => {
    const panel = buildItemsTab();
    const children = [...panel.children];

    assert.equal(children[0]?.className, 'items-panel-header');
    assert.equal(children[1]?.className, 'items-panel-scroll');
  });

  it('places the search toolbar and import drop zone inside the header', () => {
    const panel = buildItemsTab();
    const header = panel.querySelector('.items-panel-header');

    assert.ok(header.querySelector('.panel-toolbar.component-toolbar'));
    assert.ok(header.querySelector('.fabricate-search'));
    assert.ok(header.querySelector('.admin-item-drop-zone'));
    assert.equal(panel.querySelector('.items-panel-scroll .admin-item-drop-zone'), null);
  });

  it('renders the component grid inside the scroll region', () => {
    const panel = buildItemsTab({ itemCount: 3 });
    const scrollRegion = panel.querySelector('.items-panel-scroll');
    const grid = scrollRegion.querySelector('.system-item-grid');

    assert.ok(grid, 'system-item-grid should exist inside the scroll region');
    assert.equal(grid.querySelectorAll('.system-item-card').length, 3);
    assert.equal(panel.querySelector('.items-panel-header .system-item-grid'), null);
  });

  it('uses a card-level replace overlay instead of a nested replace drop box', () => {
    const panel = buildItemsTab({ itemCount: 1 });
    const card = panel.querySelector('.system-item-card');

    assert.equal(card.firstElementChild?.className, 'item-replace-overlay');
    assert.equal(card.querySelector('.item-replace-drop'), null);
    assert.ok(card.querySelector('.item-source-button'));
  });

  it('keeps the header visible when the component list is empty', () => {
    const panel = buildItemsTab({ itemCount: 0 });

    assert.ok(panel.querySelector('.items-panel-header'));
    assert.ok(panel.querySelector('.items-panel-scroll > .fabricate-empty'));
  });
});

describe('ItemsTab layout CSS', () => {
  it('defines items-panel as a bounded container', () => {
    const match = css.match(/\.fabricate-admin \.items-panel \{[\s\S]*?\}/);
    assert.ok(match, '.items-panel selector should exist');
    const block = match[0];

    assert.ok(block.includes('height: 100%'), '.items-panel should fill the available height');
    assert.ok(block.includes('overflow: hidden'), '.items-panel should clip overflow so the inner list owns scrolling');
  });

  it('defines items-panel-scroll as the vertical scroll owner', () => {
    const match = css.match(/\.fabricate-admin \.items-panel-scroll \{[\s\S]*?\}/);
    assert.ok(match, '.items-panel-scroll selector should exist');
    const block = match[0];

    assert.ok(block.includes('overflow-y: auto'), '.items-panel-scroll should own vertical scrolling');
    assert.ok(block.includes('min-height: 0'), '.items-panel-scroll should allow shrinking inside the panel');
  });

  it('defines a card-level replace overlay selector and removes the legacy nested drop selector', () => {
    assert.ok(
      css.includes('.fabricate-admin .system-item-card .item-replace-overlay'),
      'item-replace-overlay selector should exist'
    );
    assert.ok(
      css.includes('.fabricate-admin .system-item-card.replace-active .item-replace-overlay'),
      'overlay should become visible for the active drag state'
    );
    assert.equal(
      css.includes('.fabricate-admin .system-item-card:hover .item-replace-overlay'),
      false,
      'overlay should not become visible on hover alone'
    );
    assert.equal(
      css.includes('.fabricate-admin .system-item-card .item-replace-drop'),
      false,
      'legacy item-replace-drop selector should be removed'
    );
    assert.equal(
      css.includes('.fabricate-admin .system-item-card .item-description'),
      false,
      'item descriptions should no longer have dedicated card styling'
    );
  });
});

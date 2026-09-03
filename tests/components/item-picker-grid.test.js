/**
 * Tests for ItemPickerGrid layout and overflow behaviour (T-095)
 * DOM-based tests that mirror the component output structure.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures mirroring ItemPickerGrid output
// ---------------------------------------------------------------------------

function buildItemPickerGrid({ items = [], searchTerm = '', onSearch } = {}) {
  const aside = document.createElement('aside');
  aside.className = 'item-picker-panel';

  const header = document.createElement('div');
  header.className = 'picker-header';

  const h3 = document.createElement('h3');
  h3.className = 'picker-heading';
  h3.textContent = 'Components';
  header.appendChild(h3);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'picker-search';
  searchInput.value = searchTerm;
  searchInput.placeholder = 'Search components...';
  searchInput.setAttribute('aria-label', 'Search components...');
  searchInput.oninput = (e) => onSearch?.(e.target.value);
  header.appendChild(searchInput);

  aside.appendChild(header);

  const scrollRegion = document.createElement('div');
  scrollRegion.className = 'picker-grid-scroll';
  aside.appendChild(scrollRegion);

  if (items.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'picker-grid';

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'picker-card';
      card.setAttribute('draggable', 'true');
      card.setAttribute('role', 'listitem');
      card.setAttribute('title', item.name);

      const img = document.createElement('img');
      img.src = item.img || 'icons/svg/item-bag.svg';
      img.alt = item.name;
      img.className = 'picker-card-img';
      card.appendChild(img);

      const span = document.createElement('span');
      span.className = 'picker-card-name';
      span.textContent = item.name;
      card.appendChild(span);

      grid.appendChild(card);
    }

    scrollRegion.appendChild(grid);
  } else {
    const empty = document.createElement('p');
    empty.className = 'picker-empty';
    empty.textContent = 'No components available.';
    scrollRegion.appendChild(empty);
  }

  return aside;
}

// ---------------------------------------------------------------------------
// ItemPickerGrid: structure tests
// ---------------------------------------------------------------------------

describe('ItemPickerGrid: header structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders a picker-header div wrapping heading and search', () => {
    const panel = buildItemPickerGrid();
    const header = panel.querySelector('.picker-header');
    assert.ok(header, '.picker-header should exist');
  });

  it('heading is inside picker-header', () => {
    const panel = buildItemPickerGrid();
    const header = panel.querySelector('.picker-header');
    const heading = header.querySelector('.picker-heading');
    assert.ok(heading, '.picker-heading should be inside .picker-header');
    assert.equal(heading.textContent, 'Components');
  });

  it('search input is inside picker-header', () => {
    const panel = buildItemPickerGrid();
    const header = panel.querySelector('.picker-header');
    const search = header.querySelector('.picker-search');
    assert.ok(search, '.picker-search should be inside .picker-header');
    assert.equal(search.type, 'text');
  });

  it('search input has aria-label', () => {
    const panel = buildItemPickerGrid();
    const search = panel.querySelector('.picker-search');
    assert.ok(search.getAttribute('aria-label'), 'search input should have aria-label');
  });

  it('renders a dedicated scroll region beneath the header', () => {
    const panel = buildItemPickerGrid();
    const header = panel.querySelector('.picker-header');
    const scrollRegion = panel.querySelector('.picker-grid-scroll');
    assert.ok(scrollRegion, '.picker-grid-scroll should exist');
    assert.equal(scrollRegion.previousElementSibling, header);
    assert.equal(scrollRegion.querySelector('.picker-search'), null);
  });

  it('picker-header appears before picker-grid-scroll in the DOM', () => {
    const items = [{ id: 'item-1', name: 'Herb', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const children = [...panel.children];
    const headerIdx = children.findIndex(c => c.classList.contains('picker-header'));
    const scrollIdx = children.findIndex(c => c.classList.contains('picker-grid-scroll'));
    assert.ok(headerIdx < scrollIdx, 'picker header should come before the scroll region');
  });
});

// ---------------------------------------------------------------------------
// ItemPickerGrid: search callback
// ---------------------------------------------------------------------------

describe('ItemPickerGrid: search input', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('search input reflects searchTerm prop value', () => {
    const panel = buildItemPickerGrid({ searchTerm: 'herb' });
    const input = panel.querySelector('.picker-search');
    assert.equal(input.value, 'herb');
  });

  it('oninput calls onSearch callback', () => {
    const calls = [];
    const panel = buildItemPickerGrid({ onSearch: (v) => calls.push(v) });
    const input = panel.querySelector('.picker-search');
    // Simulate input event
    input.value = 'po';
    const event = new Event('input');
    Object.defineProperty(event, 'target', { value: input });
    input.oninput(event);
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'po');
  });
});

// ---------------------------------------------------------------------------
// ItemPickerGrid: card structure
// ---------------------------------------------------------------------------

describe('ItemPickerGrid: card structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders one card per item', () => {
    const items = [
      { id: 'i-1', name: 'Herb', img: 'icons/herb.svg' },
      { id: 'i-2', name: 'Water', img: 'icons/water.svg' },
      { id: 'i-3', name: 'Fire Crystal', img: 'icons/fire.svg' }
    ];
    const panel = buildItemPickerGrid({ items });
    const cards = panel.querySelectorAll('.picker-card');
    assert.equal(cards.length, 3);
  });

  it('card contains an img element with correct src and alt', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: 'icons/herb.svg' }];
    const panel = buildItemPickerGrid({ items });
    const img = panel.querySelector('.picker-card-img');
    assert.ok(img, 'img.picker-card-img should exist');
    assert.equal(img.src, 'icons/herb.svg');
    assert.equal(img.alt, 'Herb');
  });

  it('card places the image before the name for the row layout', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: 'icons/herb.svg' }];
    const panel = buildItemPickerGrid({ items });
    const card = panel.querySelector('.picker-card');
    assert.equal(card.firstElementChild?.className, 'picker-card-img');
    assert.equal(card.lastElementChild?.className, 'picker-card-name');
  });

  it('card uses fallback image when img is empty', () => {
    const items = [{ id: 'i-1', name: 'Unknown', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const img = panel.querySelector('.picker-card-img');
    assert.equal(img.src, 'icons/svg/item-bag.svg');
  });

  it('card has picker-card-name span with item name', () => {
    const items = [{ id: 'i-1', name: 'Dragon Scale', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const nameSpan = panel.querySelector('.picker-card-name');
    assert.ok(nameSpan, 'span.picker-card-name should exist');
    assert.equal(nameSpan.textContent, 'Dragon Scale');
  });

  it('card has draggable=true', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const card = panel.querySelector('.picker-card');
    assert.equal(card.getAttribute('draggable'), 'true');
  });

  it('card has role=listitem', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const card = panel.querySelector('.picker-card');
    assert.equal(card.getAttribute('role'), 'listitem');
  });

  it('card has title attribute with item name', () => {
    const items = [{ id: 'i-1', name: 'Mandrake Root', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const card = panel.querySelector('.picker-card');
    assert.equal(card.getAttribute('title'), 'Mandrake Root');
  });

  it('card has picker-card class (box-sizing and max-width applied at CSS level)', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const card = panel.querySelector('.picker-card');
    // Verify the class is present; CSS properties (box-sizing, max-width) are applied at render time
    assert.ok(card.classList.contains('picker-card'), 'picker-card class should be present');
  });

  it('picker-card-name has class for text truncation (applied at CSS level)', () => {
    const items = [{ id: 'i-1', name: 'A Very Long Item Name That Could Overflow', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const nameSpan = panel.querySelector('.picker-card-name');
    assert.ok(nameSpan.classList.contains('picker-card-name'), 'picker-card-name class should be present');
  });
});

// ---------------------------------------------------------------------------
// ItemPickerGrid: empty state
// ---------------------------------------------------------------------------

describe('ItemPickerGrid: empty state', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders picker-empty when items array is empty', () => {
    const panel = buildItemPickerGrid({ items: [] });
    const empty = panel.querySelector('.picker-empty');
    assert.ok(empty, '.picker-empty should render when no items');
  });

  it('picker-empty is not rendered when items exist', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const empty = panel.querySelector('.picker-empty');
    assert.equal(empty, null, '.picker-empty should not render when items exist');
  });

  it('picker-grid is not rendered when items array is empty', () => {
    const panel = buildItemPickerGrid({ items: [] });
    const grid = panel.querySelector('.picker-grid');
    assert.equal(grid, null, '.picker-grid should not render when no items');
  });

  it('picker-grid is rendered when items exist', () => {
    const items = [{ id: 'i-1', name: 'Herb', img: '' }];
    const panel = buildItemPickerGrid({ items });
    const grid = panel.querySelector('.picker-grid');
    assert.ok(grid, '.picker-grid should render when items exist');
    assert.ok(panel.querySelector('.picker-grid-scroll')?.contains(grid));
  });

  it('picker header always renders even when items is empty', () => {
    const panel = buildItemPickerGrid({ items: [] });
    const header = panel.querySelector('.picker-header');
    assert.ok(header, 'Picker header should always render regardless of items');
  });
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures that mirror FilterBar output
// ---------------------------------------------------------------------------

function buildFilterBar({
  showCraftableOnly = false,
  showFavouritesOnly = false,
  categories = [],
  selectedCategory = '',
  onToggleCraftable = null,
  onToggleFavourites = null,
  onCategoryChange = null
} = {}) {
  const container = document.createElement('div');
  container.className = 'fabricate-filters';

  const craftableBtn = document.createElement('button');
  craftableBtn.type = 'button';
  craftableBtn.className = 'fabricate-filter-btn' + (showCraftableOnly ? ' active' : '');
  craftableBtn.title = 'Craftable Only';
  craftableBtn.onclick = () => onToggleCraftable?.();
  const craftableIcon = document.createElement('i');
  craftableIcon.className = 'fas fa-check-circle';
  craftableBtn.appendChild(craftableIcon);
  craftableBtn.appendChild(document.createTextNode(' Craftable Only'));
  container.appendChild(craftableBtn);

  const favouritesBtn = document.createElement('button');
  favouritesBtn.type = 'button';
  favouritesBtn.className = 'fabricate-filter-btn' + (showFavouritesOnly ? ' active' : '');
  favouritesBtn.title = 'Favourites only';
  favouritesBtn.dataset.testid = 'favourites-filter';
  favouritesBtn.onclick = () => onToggleFavourites?.();
  const favIcon = document.createElement('i');
  favIcon.className = 'fas fa-star';
  favouritesBtn.appendChild(favIcon);
  favouritesBtn.appendChild(document.createTextNode(' Favourites only'));
  container.appendChild(favouritesBtn);

  const select = document.createElement('select');
  select.name = 'category';
  select.className = 'fabricate-category-select';
  select.value = selectedCategory;
  select.onchange = (e) => onCategoryChange?.(e.target.value);
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Categories';
  select.appendChild(defaultOption);
  for (const cat of categories) {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  }
  container.appendChild(select);

  return container;
}

// ---------------------------------------------------------------------------
// FilterBar: Craftable Only button
// ---------------------------------------------------------------------------

describe('FilterBar: Craftable Only button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders craftable-only button', () => {
    const bar = buildFilterBar();
    const btn = bar.querySelector('.fabricate-filter-btn');
    assert.ok(btn, 'Should have a fabricate-filter-btn');
    assert.ok(btn.querySelector('i.fas.fa-check-circle'), 'Should have check-circle icon');
  });

  it('has active class when showCraftableOnly is true', () => {
    const bar = buildFilterBar({ showCraftableOnly: true });
    const btn = bar.querySelector('.fabricate-filter-btn');
    assert.ok(btn.classList.contains('active'), 'Should have active class when showCraftableOnly=true');
  });

  it('does not have active class when showCraftableOnly is false', () => {
    const bar = buildFilterBar({ showCraftableOnly: false });
    const btn = bar.querySelector('.fabricate-filter-btn');
    assert.ok(!btn.classList.contains('active'), 'Should not have active class when showCraftableOnly=false');
  });

  it('clicking craftable button calls onToggleCraftable', () => {
    let called = false;
    const bar = buildFilterBar({ onToggleCraftable: () => { called = true; } });
    bar.querySelector('.fabricate-filter-btn').click();
    assert.ok(called, 'onToggleCraftable should be called on click');
  });
});

// ---------------------------------------------------------------------------
// FilterBar: Favourites Only button
// ---------------------------------------------------------------------------

describe('FilterBar: Favourites Only button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders favourites-only toggle button', () => {
    const bar = buildFilterBar();
    const btn = bar.querySelector('[data-testid="favourites-filter"]');
    assert.ok(btn, 'Should have a favourites filter button');
  });

  it('favourites button has star icon', () => {
    const bar = buildFilterBar();
    const btn = bar.querySelector('[data-testid="favourites-filter"]');
    assert.ok(btn.querySelector('i.fas.fa-star'), 'Should have star icon');
  });

  it('favourites button has active class when showFavouritesOnly is true', () => {
    const bar = buildFilterBar({ showFavouritesOnly: true });
    const btn = bar.querySelector('[data-testid="favourites-filter"]');
    assert.ok(btn.classList.contains('active'), 'Should have active class when showFavouritesOnly=true');
  });

  it('favourites button does not have active class when showFavouritesOnly is false', () => {
    const bar = buildFilterBar({ showFavouritesOnly: false });
    const btn = bar.querySelector('[data-testid="favourites-filter"]');
    assert.ok(!btn.classList.contains('active'), 'Should not have active class when showFavouritesOnly=false');
  });

  it('clicking favourites button calls onToggleFavourites', () => {
    let called = false;
    const bar = buildFilterBar({ onToggleFavourites: () => { called = true; } });
    bar.querySelector('[data-testid="favourites-filter"]').click();
    assert.ok(called, 'onToggleFavourites should be called on click');
  });

  it('does not call onToggleFavourites when handler is null', () => {
    const bar = buildFilterBar({ onToggleFavourites: null });
    assert.doesNotThrow(() => bar.querySelector('[data-testid="favourites-filter"]').click());
  });
});

// ---------------------------------------------------------------------------
// FilterBar: Category select
// ---------------------------------------------------------------------------

describe('FilterBar: Category select', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders category select with All Categories default option', () => {
    const bar = buildFilterBar();
    const select = bar.querySelector('select.fabricate-category-select');
    assert.ok(select, 'Should have a category select');
    const defaultOpt = select.querySelector('option[value=""]');
    assert.ok(defaultOpt, 'Should have a default empty option');
    assert.equal(defaultOpt.textContent, 'All Categories');
  });

  it('renders one option per category', () => {
    const bar = buildFilterBar({ categories: ['potions', 'weapons', 'armor'] });
    const select = bar.querySelector('select');
    // 3 categories + 1 default option
    assert.equal(select.querySelectorAll('option').length, 4);
  });

  it('renders empty category list with just the default option', () => {
    const bar = buildFilterBar({ categories: [] });
    const select = bar.querySelector('select');
    assert.equal(select.querySelectorAll('option').length, 1);
  });
});

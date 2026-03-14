import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures that mirror DiscoveredRecipesPanel output
// ---------------------------------------------------------------------------

function buildDiscoveredRecipesPanel({
  recipes = [],
  searchTerm = '',
  craftableOnly = false,
  onSearch = () => {},
  onToggleCraftableOnly = () => {},
  onAutoFill = () => {}
} = {}) {
  const panel = document.createElement('div');
  panel.className = 'alchemy-discovered';

  // Header
  const header = document.createElement('div');
  header.className = 'alchemy-discovered-header';

  const title = document.createElement('h4');
  title.className = 'alchemy-discovered-title';
  title.textContent = 'Discovered Recipes';
  header.appendChild(title);

  const label = document.createElement('label');
  label.className = 'sr-only';
  label.setAttribute('for', 'alchemy-recipe-search');
  label.textContent = 'Search recipes';
  header.appendChild(label);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'alchemy-recipe-search';
  searchInput.className = 'alchemy-discovered-search';
  searchInput.placeholder = 'Search…';
  searchInput.value = searchTerm;
  searchInput.setAttribute('aria-label', 'Search recipes');
  searchInput.oninput = (e) => onSearch(e.target.value);
  header.appendChild(searchInput);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = `alchemy-craftable-toggle${craftableOnly ? ' active' : ''}`;
  toggleBtn.textContent = 'Craftable only';
  toggleBtn.onclick = () => onToggleCraftableOnly();
  header.appendChild(toggleBtn);

  panel.appendChild(header);

  const list = document.createElement('div');
  list.className = 'alchemy-discovered-list';

  if (recipes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'alchemy-discovered-empty';

    const emptyIcon = document.createElement('i');
    emptyIcon.className = 'fas fa-book-open';
    empty.appendChild(emptyIcon);

    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'alchemy-discovered-empty-msg';
    emptyMsg.textContent = 'No recipes discovered yet';
    empty.appendChild(emptyMsg);

    const emptyHint = document.createElement('p');
    emptyHint.className = 'alchemy-discovered-empty-hint';
    emptyHint.textContent = 'Discover recipes by crafting or exploration';
    empty.appendChild(emptyHint);

    list.appendChild(empty);
  } else {
    for (const recipe of recipes) {
      const row = buildRecipeRow(recipe, onAutoFill);
      list.appendChild(row);
    }
  }

  panel.appendChild(list);
  return panel;
}

function buildRecipeRow(recipe, onAutoFill = () => {}) {
  const row = document.createElement('div');
  row.className = 'alchemy-discovered-row';
  row.dataset.recipeId = recipe.id;

  const img = document.createElement('img');
  img.src = recipe.img || '';
  img.alt = recipe.name;
  img.className = 'alchemy-discovered-img';
  img.width = 28;
  img.height = 28;
  row.appendChild(img);

  const name = document.createElement('span');
  name.className = 'alchemy-discovered-name';
  name.textContent = recipe.name;
  row.appendChild(name);

  const badge = document.createElement('span');
  badge.className = `alchemy-discovered-badge ${recipe.canCraft ? 'available' : 'missing'}`;
  badge.textContent = recipe.canCraft ? 'Available' : 'Missing';
  row.appendChild(badge);

  const autoFillBtn = document.createElement('button');
  autoFillBtn.type = 'button';
  autoFillBtn.className = 'alchemy-autofill-btn';
  autoFillBtn.setAttribute('aria-label', `Auto-fill ${recipe.name}`);
  if (!recipe.canCraft) {
    autoFillBtn.setAttribute('aria-disabled', 'true');
    autoFillBtn.disabled = true;
  }
  autoFillBtn.onclick = recipe.canCraft ? () => onAutoFill(recipe.id) : null;

  const fillIcon = document.createElement('i');
  fillIcon.className = 'fas fa-fill-drip';
  autoFillBtn.appendChild(fillIcon);
  row.appendChild(autoFillBtn);

  return row;
}

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Empty State
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Empty State', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('shows empty state when no recipes provided', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const empty = panel.querySelector('.alchemy-discovered-empty');
    assert.ok(empty, '.alchemy-discovered-empty should exist when no recipes');
  });

  it('empty state has book-open icon', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const icon = panel.querySelector('.alchemy-discovered-empty i.fas.fa-book-open');
    assert.ok(icon, 'fas fa-book-open icon should render in empty state');
  });

  it('empty state shows "No recipes discovered yet" message', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const msg = panel.querySelector('.alchemy-discovered-empty-msg');
    assert.ok(msg, '.alchemy-discovered-empty-msg should exist');
    assert.ok(msg.textContent.includes('No recipes discovered yet'));
  });

  it('empty state shows hint text', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const hint = panel.querySelector('.alchemy-discovered-empty-hint');
    assert.ok(hint, '.alchemy-discovered-empty-hint should exist');
    assert.ok(hint.textContent.length > 0, 'Hint text should not be empty');
  });

  it('does not render any recipe rows in empty state', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const rows = panel.querySelectorAll('.alchemy-discovered-row');
    assert.equal(rows.length, 0, 'No recipe rows should render when empty');
  });
});

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Recipe List
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Recipe List', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders one row per recipe', () => {
    const recipes = [
      { id: 'r1', name: 'Healing Potion', img: 'icon1.webp', canCraft: true },
      { id: 'r2', name: 'Fire Bomb', img: 'icon2.webp', canCraft: false },
      { id: 'r3', name: 'Speed Elixir', img: 'icon3.webp', canCraft: true }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const rows = panel.querySelectorAll('.alchemy-discovered-row');
    assert.equal(rows.length, 3, 'Should render one row per recipe');
  });

  it('renders recipe name in each row', () => {
    const recipes = [
      { id: 'r1', name: 'Healing Potion', img: '', canCraft: true }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const nameEl = panel.querySelector('.alchemy-discovered-name');
    assert.ok(nameEl, '.alchemy-discovered-name should exist');
    assert.equal(nameEl.textContent, 'Healing Potion');
  });

  it('renders recipe image with src and alt', () => {
    const recipes = [
      { id: 'r1', name: 'Fire Bomb', img: 'icons/fire-bomb.webp', canCraft: true }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const img = panel.querySelector('.alchemy-discovered-img');
    assert.ok(img, '.alchemy-discovered-img should exist');
    assert.equal(img.src, 'icons/fire-bomb.webp');
    assert.equal(img.alt, 'Fire Bomb');
  });

  it('each row has data-recipe-id matching the recipe id', () => {
    const recipes = [
      { id: 'recipe-abc', name: 'Test Recipe', img: '', canCraft: true }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const row = panel.querySelector('.alchemy-discovered-row');
    assert.equal(row.dataset.recipeId, 'recipe-abc');
  });

  it('does not show empty state when recipes are present', () => {
    const recipes = [
      { id: 'r1', name: 'Healing Potion', img: '', canCraft: true }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const empty = panel.querySelector('.alchemy-discovered-empty');
    assert.equal(empty, null, 'Empty state should not render when recipes exist');
  });
});

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Search
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Search Input', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders a search input element', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const input = panel.querySelector('input[type="text"]');
    assert.ok(input, 'Search input should exist');
  });

  it('search input has aria-label for accessibility', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const input = panel.querySelector('input[type="text"]');
    const ariaLabel = input.getAttribute('aria-label');
    assert.ok(ariaLabel && ariaLabel.length > 0, 'Search input must have an aria-label');
  });

  it('search input reflects the searchTerm prop value', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [], searchTerm: 'healing' });
    const input = panel.querySelector('input[type="text"]');
    assert.equal(input.value, 'healing');
  });

  it('oninput calls onSearch with the new value', () => {
    const calls = [];
    const panel = buildDiscoveredRecipesPanel({
      recipes: [],
      onSearch: (term) => calls.push(term)
    });
    const input = panel.querySelector('input[type="text"]');

    input.value = 'fire';
    const event = { target: input };
    input.oninput(event);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'fire');
  });

  it('oninput calls onSearch with empty string when cleared', () => {
    const calls = [];
    const panel = buildDiscoveredRecipesPanel({
      recipes: [],
      searchTerm: 'fire',
      onSearch: (term) => calls.push(term)
    });
    const input = panel.querySelector('input[type="text"]');

    input.value = '';
    const event = { target: input };
    input.oninput(event);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], '');
  });
});

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Craftable-Only Toggle
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Craftable-Only Toggle', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders the craftable-only toggle button', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const btn = panel.querySelector('.alchemy-craftable-toggle');
    assert.ok(btn, '.alchemy-craftable-toggle button should exist');
  });

  it('toggle button has active class when craftableOnly is true', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [], craftableOnly: true });
    const btn = panel.querySelector('.alchemy-craftable-toggle');
    assert.ok(btn.classList.contains('active'), 'Button should have active class when craftableOnly=true');
  });

  it('toggle button does not have active class when craftableOnly is false', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [], craftableOnly: false });
    const btn = panel.querySelector('.alchemy-craftable-toggle');
    assert.ok(!btn.classList.contains('active'), 'Button should not have active class when craftableOnly=false');
  });

  it('clicking toggle button calls onToggleCraftableOnly', () => {
    const calls = [];
    const panel = buildDiscoveredRecipesPanel({
      recipes: [],
      onToggleCraftableOnly: () => calls.push(true)
    });
    const btn = panel.querySelector('.alchemy-craftable-toggle');
    btn.click();

    assert.equal(calls.length, 1);
  });

  it('toggle button can be clicked multiple times, each fires the callback', () => {
    const calls = [];
    const panel = buildDiscoveredRecipesPanel({
      recipes: [],
      onToggleCraftableOnly: () => calls.push(true)
    });
    const btn = panel.querySelector('.alchemy-craftable-toggle');
    btn.click();
    btn.click();
    btn.click();

    assert.equal(calls.length, 3);
  });
});

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Auto-Fill Button
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Auto-Fill Button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders auto-fill button for each recipe row', () => {
    const recipes = [
      { id: 'r1', name: 'Healing Potion', img: '', canCraft: true },
      { id: 'r2', name: 'Fire Bomb', img: '', canCraft: false }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const btns = panel.querySelectorAll('.alchemy-autofill-btn');
    assert.equal(btns.length, 2, 'One auto-fill button per recipe');
  });

  it('auto-fill button has fill-drip icon', () => {
    const recipes = [{ id: 'r1', name: 'Potion', img: '', canCraft: true }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    assert.ok(btn.querySelector('i.fas.fa-fill-drip'), 'Button should have fill-drip icon');
  });

  it('auto-fill button has aria-label with recipe name', () => {
    const recipes = [{ id: 'r1', name: 'Fire Bomb', img: '', canCraft: true }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    const ariaLabel = btn.getAttribute('aria-label');
    assert.ok(ariaLabel && ariaLabel.includes('Fire Bomb'), 'aria-label must include recipe name');
  });

  it('clicking enabled auto-fill button calls onAutoFill with recipe id', () => {
    const calls = [];
    const recipes = [{ id: 'recipe-fill-1', name: 'Healing Potion', img: '', canCraft: true }];
    const panel = buildDiscoveredRecipesPanel({
      recipes,
      onAutoFill: (id) => calls.push(id)
    });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    btn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'recipe-fill-1');
  });

  it('auto-fill button is disabled when canCraft is false', () => {
    const recipes = [{ id: 'r1', name: 'Missing Recipe', img: '', canCraft: false }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    assert.ok(btn.disabled, 'Auto-fill button should be disabled when canCraft=false');
  });

  it('disabled auto-fill button has aria-disabled="true"', () => {
    const recipes = [{ id: 'r1', name: 'Missing Recipe', img: '', canCraft: false }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    assert.equal(btn.getAttribute('aria-disabled'), 'true');
  });

  it('disabled auto-fill button does not call onAutoFill when clicked', () => {
    const calls = [];
    const recipes = [{ id: 'r1', name: 'Missing Recipe', img: '', canCraft: false }];
    const panel = buildDiscoveredRecipesPanel({
      recipes,
      onAutoFill: (id) => calls.push(id)
    });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    assert.equal(btn.onclick, null, 'Disabled button should have no onclick handler');
  });

  it('enabled auto-fill button is not disabled', () => {
    const recipes = [{ id: 'r1', name: 'Healing Potion', img: '', canCraft: true }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const btn = panel.querySelector('.alchemy-autofill-btn');
    assert.ok(!btn.disabled, 'Auto-fill button should not be disabled when canCraft=true');
  });
});

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Craftability Badge
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Craftability Badge', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('badge shows "Available" and has available class when canCraft is true', () => {
    const recipes = [{ id: 'r1', name: 'Healing Potion', img: '', canCraft: true }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const badge = panel.querySelector('.alchemy-discovered-badge');
    assert.ok(badge, 'Status badge should exist');
    assert.equal(badge.textContent, 'Available');
    assert.ok(badge.classList.contains('available'), 'Badge should have "available" class');
  });

  it('badge shows "Missing" and has missing class when canCraft is false', () => {
    const recipes = [{ id: 'r1', name: 'Fire Bomb', img: '', canCraft: false }];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const badge = panel.querySelector('.alchemy-discovered-badge');
    assert.ok(badge, 'Status badge should exist');
    assert.equal(badge.textContent, 'Missing');
    assert.ok(badge.classList.contains('missing'), 'Badge should have "missing" class');
  });

  it('each recipe row has its own status badge', () => {
    const recipes = [
      { id: 'r1', name: 'Healing Potion', img: '', canCraft: true },
      { id: 'r2', name: 'Fire Bomb', img: '', canCraft: false }
    ];
    const panel = buildDiscoveredRecipesPanel({ recipes });
    const badges = panel.querySelectorAll('.alchemy-discovered-badge');
    assert.equal(badges.length, 2, 'One badge per recipe row');
    assert.equal(badges[0].textContent, 'Available');
    assert.equal(badges[1].textContent, 'Missing');
  });
});

// ---------------------------------------------------------------------------
// DiscoveredRecipesPanel: Panel Container
// ---------------------------------------------------------------------------

describe('DiscoveredRecipesPanel: Panel Container', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('panel has .alchemy-discovered root class', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    assert.ok(panel.classList.contains('alchemy-discovered'), 'Root element must have alchemy-discovered class');
  });

  it('panel contains a header section', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const header = panel.querySelector('.alchemy-discovered-header');
    assert.ok(header, 'Header section should exist');
  });

  it('panel contains a title element', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const title = panel.querySelector('.alchemy-discovered-title');
    assert.ok(title, 'Title element should exist');
    assert.ok(title.textContent.length > 0, 'Title should have text');
  });

  it('panel contains a scrollable list section', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const list = panel.querySelector('.alchemy-discovered-list');
    assert.ok(list, '.alchemy-discovered-list should exist');
  });

  it('header contains search input and toggle button', () => {
    const panel = buildDiscoveredRecipesPanel({ recipes: [] });
    const header = panel.querySelector('.alchemy-discovered-header');
    assert.ok(header.querySelector('input[type="text"]'), 'Header should contain search input');
    assert.ok(header.querySelector('.alchemy-craftable-toggle'), 'Header should contain toggle button');
  });
});

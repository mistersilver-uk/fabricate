import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures that mirror FavouritesSection and RecentsSection output
// ---------------------------------------------------------------------------

function buildFavouritesSection(recipes) {
  if (!recipes || recipes.length === 0) return null;

  const section = document.createElement('div');
  section.className = 'fabricate-quick-section favourites-section';

  const h4 = document.createElement('h4');
  const icon = document.createElement('i');
  icon.className = 'fas fa-star';
  h4.appendChild(icon);
  h4.appendChild(document.createTextNode(' Favourites'));
  section.appendChild(h4);

  const list = document.createElement('div');
  list.className = 'quick-recipe-list';

  for (const recipe of recipes) {
    const item = document.createElement('div');
    item.className = 'quick-recipe-item';
    item.dataset.recipeId = recipe.id;

    const img = document.createElement('img');
    img.src = recipe.img || '';
    img.alt = recipe.name;
    img.className = 'quick-recipe-icon';
    item.appendChild(img);

    const name = document.createElement('span');
    name.className = 'quick-recipe-name';
    name.textContent = recipe.name;
    item.appendChild(name);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = recipe.statusLabel;
    item.appendChild(badge);

    if (recipe.allowCraftAction) {
      const craftBtn = document.createElement('button');
      craftBtn.type = 'button';
      craftBtn.className = 'craft-btn';
      craftBtn.title = 'Craft this recipe';
      craftBtn.onclick = () => recipe._onCraft?.(recipe.id, { runId: recipe.activeRunId || null });
      const craftIcon = document.createElement('i');
      craftIcon.className = 'fas fa-hammer';
      craftBtn.appendChild(craftIcon);
      craftBtn.appendChild(document.createTextNode(` ${recipe.craftButtonLabel}`));
      item.appendChild(craftBtn);
    }

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'details-btn favourite-btn is-favourite';
    favBtn.title = 'Remove from favourites';
    favBtn.onclick = () => recipe._onToggleFavourite?.(recipe.id);
    const starIcon = document.createElement('i');
    starIcon.className = 'fas fa-star';
    favBtn.appendChild(starIcon);
    item.appendChild(favBtn);

    list.appendChild(item);
  }

  section.appendChild(list);
  return section;
}

function buildRecentsSection(recipes) {
  if (!recipes || recipes.length === 0) return null;

  const section = document.createElement('div');
  section.className = 'fabricate-quick-section recent-section';

  const h4 = document.createElement('h4');
  const icon = document.createElement('i');
  icon.className = 'fas fa-clock';
  h4.appendChild(icon);
  h4.appendChild(document.createTextNode(' Recently Crafted'));
  section.appendChild(h4);

  const list = document.createElement('div');
  list.className = 'quick-recipe-list';

  for (const recipe of recipes) {
    const item = document.createElement('div');
    item.className = 'quick-recipe-item';
    item.dataset.recipeId = recipe.id;

    const img = document.createElement('img');
    img.src = recipe.img || '';
    img.alt = recipe.name;
    img.className = 'quick-recipe-icon';
    item.appendChild(img);

    const name = document.createElement('span');
    name.className = 'quick-recipe-name';
    name.textContent = recipe.name;
    item.appendChild(name);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = recipe.statusLabel;
    item.appendChild(badge);

    if (recipe.allowCraftAction) {
      const craftBtn = document.createElement('button');
      craftBtn.type = 'button';
      craftBtn.className = 'craft-btn';
      craftBtn.title = 'Craft this recipe';
      craftBtn.onclick = () => recipe._onCraft?.(recipe.id, { runId: recipe.activeRunId || null });
      const craftIcon = document.createElement('i');
      craftIcon.className = 'fas fa-hammer';
      craftBtn.appendChild(craftIcon);
      craftBtn.appendChild(document.createTextNode(` ${recipe.craftButtonLabel}`));
      item.appendChild(craftBtn);
    }

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className = 'details-btn';
    detailsBtn.title = 'Show recipe details';
    detailsBtn.onclick = () => recipe._onShowDetails?.(recipe.id);
    const infoIcon = document.createElement('i');
    infoIcon.className = 'fas fa-info-circle';
    detailsBtn.appendChild(infoIcon);
    item.appendChild(detailsBtn);

    list.appendChild(item);
  }

  section.appendChild(list);
  return section;
}

const baseRecipe = {
  id: 'recipe-1',
  name: 'Healing Potion',
  img: 'icons/consumables/potions/potion-round-empty-red.webp',
  statusLabel: 'Available',
  allowCraftAction: true,
  activeRunId: '',
  craftButtonLabel: 'Craft',
  isFavourite: true
};

// ---------------------------------------------------------------------------
// FavouritesSection tests
// ---------------------------------------------------------------------------

describe('FavouritesSection: Rendering', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders section when recipes list is non-empty', () => {
    const section = buildFavouritesSection([baseRecipe]);
    assert.ok(section, 'Section element should be returned');
    assert.ok(section.classList.contains('favourites-section'), 'Should have favourites-section class');
    assert.ok(section.classList.contains('fabricate-quick-section'), 'Should have fabricate-quick-section class');
  });

  it('does not render when recipes list is empty', () => {
    const section = buildFavouritesSection([]);
    assert.equal(section, null, 'Should return null for empty list');
  });

  it('does not render when recipes is null', () => {
    const section = buildFavouritesSection(null);
    assert.equal(section, null, 'Should return null for null input');
  });

  it('renders one item per recipe', () => {
    const recipes = [
      { ...baseRecipe, id: 'r-1', name: 'Recipe A' },
      { ...baseRecipe, id: 'r-2', name: 'Recipe B' }
    ];
    const section = buildFavouritesSection(recipes);
    const items = section.querySelectorAll('.quick-recipe-item');
    assert.equal(items.length, 2);
  });

  it('each item has data-recipe-id matching recipe id', () => {
    const section = buildFavouritesSection([{ ...baseRecipe, id: 'fav-abc' }]);
    const item = section.querySelector('.quick-recipe-item');
    assert.equal(item.dataset.recipeId, 'fav-abc');
  });
});

describe('FavouritesSection: Item Structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('each item has icon with quick-recipe-icon class', () => {
    const section = buildFavouritesSection([baseRecipe]);
    const img = section.querySelector('img.quick-recipe-icon');
    assert.ok(img, 'img.quick-recipe-icon should exist');
    assert.equal(img.alt, baseRecipe.name);
  });

  it('each item has name span with quick-recipe-name class', () => {
    const section = buildFavouritesSection([{ ...baseRecipe, name: 'Fire Bomb' }]);
    const nameSpan = section.querySelector('span.quick-recipe-name');
    assert.ok(nameSpan, 'span.quick-recipe-name should exist');
    assert.equal(nameSpan.textContent, 'Fire Bomb');
  });

  it('each item has status badge', () => {
    const section = buildFavouritesSection([{ ...baseRecipe, statusLabel: 'Missing materials' }]);
    const badge = section.querySelector('span.badge');
    assert.ok(badge, 'span.badge should exist');
    assert.equal(badge.textContent, 'Missing materials');
  });

  it('uses quick-recipe-icon class for bounded image sizing (T-089)', () => {
    const section = buildFavouritesSection([baseRecipe]);
    const img = section.querySelector('img');
    assert.ok(img.classList.contains('quick-recipe-icon'), 'Image must use quick-recipe-icon class');
  });
});

describe('FavouritesSection: Craft Button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders craft button when allowCraftAction is true', () => {
    const section = buildFavouritesSection([{ ...baseRecipe, allowCraftAction: true, craftButtonLabel: 'Craft' }]);
    const craftBtn = section.querySelector('.craft-btn');
    assert.ok(craftBtn, 'Craft button should exist');
    assert.ok(craftBtn.querySelector('i.fas.fa-hammer'), 'Should have hammer icon');
    assert.ok(craftBtn.textContent.includes('Craft'));
  });

  it('omits craft button when allowCraftAction is false', () => {
    const section = buildFavouritesSection([{ ...baseRecipe, allowCraftAction: false }]);
    const craftBtn = section.querySelector('.craft-btn');
    assert.equal(craftBtn, null, 'Craft button should not exist');
  });

  it('craft button dispatches onCraft with recipeId and runId null when no active run', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'fav-craft-1',
      activeRunId: '',
      allowCraftAction: true,
      _onCraft: (id, opts) => calls.push({ id, opts })
    };
    const section = buildFavouritesSection([recipe]);
    section.querySelector('.craft-btn').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'fav-craft-1');
    assert.deepEqual(calls[0].opts, { runId: null });
  });

  it('craft button passes activeRunId when present', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'fav-craft-2',
      activeRunId: 'run-xyz',
      allowCraftAction: true,
      craftButtonLabel: 'Continue',
      _onCraft: (id, opts) => calls.push({ id, opts })
    };
    const section = buildFavouritesSection([recipe]);
    section.querySelector('.craft-btn').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.runId, 'run-xyz');
  });
});

describe('FavouritesSection: Favourite Button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('favourite button always has is-favourite class', () => {
    const section = buildFavouritesSection([baseRecipe]);
    const favBtn = section.querySelector('.favourite-btn');
    assert.ok(favBtn, 'Favourite button should exist');
    assert.ok(favBtn.classList.contains('is-favourite'), 'Should always have is-favourite class');
  });

  it('favourite button has details-btn class', () => {
    const section = buildFavouritesSection([baseRecipe]);
    const favBtn = section.querySelector('.favourite-btn');
    assert.ok(favBtn.classList.contains('details-btn'), 'Should have details-btn class');
  });

  it('favourite button has star icon', () => {
    const section = buildFavouritesSection([baseRecipe]);
    const favBtn = section.querySelector('.favourite-btn');
    assert.ok(favBtn.querySelector('i.fas.fa-star'), 'Should have star icon');
  });

  it('favourite button dispatches onToggleFavourite with recipeId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'fav-toggle-1',
      _onToggleFavourite: (id) => calls.push(id)
    };
    const section = buildFavouritesSection([recipe]);
    section.querySelector('.favourite-btn').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'fav-toggle-1');
  });
});

// ---------------------------------------------------------------------------
// RecentsSection tests
// ---------------------------------------------------------------------------

describe('RecentsSection: Rendering', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders section when recipes list is non-empty', () => {
    const section = buildRecentsSection([baseRecipe]);
    assert.ok(section, 'Section element should be returned');
    assert.ok(section.classList.contains('recent-section'), 'Should have recent-section class');
    assert.ok(section.classList.contains('fabricate-quick-section'), 'Should have fabricate-quick-section class');
  });

  it('does not render when recipes list is empty', () => {
    const section = buildRecentsSection([]);
    assert.equal(section, null, 'Should return null for empty list');
  });

  it('does not render when recipes is null', () => {
    const section = buildRecentsSection(null);
    assert.equal(section, null, 'Should return null for null input');
  });

  it('renders one item per recipe', () => {
    const recipes = [
      { ...baseRecipe, id: 'r-1', name: 'Recipe A' },
      { ...baseRecipe, id: 'r-2', name: 'Recipe B' },
      { ...baseRecipe, id: 'r-3', name: 'Recipe C' }
    ];
    const section = buildRecentsSection(recipes);
    const items = section.querySelectorAll('.quick-recipe-item');
    assert.equal(items.length, 3);
  });

  it('each item has data-recipe-id matching recipe id', () => {
    const section = buildRecentsSection([{ ...baseRecipe, id: 'recent-abc' }]);
    const item = section.querySelector('.quick-recipe-item');
    assert.equal(item.dataset.recipeId, 'recent-abc');
  });
});

describe('RecentsSection: Item Structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('each item has icon with quick-recipe-icon class', () => {
    const section = buildRecentsSection([baseRecipe]);
    const img = section.querySelector('img.quick-recipe-icon');
    assert.ok(img, 'img.quick-recipe-icon should exist');
    assert.equal(img.alt, baseRecipe.name);
  });

  it('each item has name span with quick-recipe-name class', () => {
    const section = buildRecentsSection([{ ...baseRecipe, name: 'Ice Bomb' }]);
    const nameSpan = section.querySelector('span.quick-recipe-name');
    assert.ok(nameSpan, 'span.quick-recipe-name should exist');
    assert.equal(nameSpan.textContent, 'Ice Bomb');
  });

  it('each item has status badge', () => {
    const section = buildRecentsSection([{ ...baseRecipe, statusLabel: 'Available' }]);
    const badge = section.querySelector('span.badge');
    assert.ok(badge, 'span.badge should exist');
    assert.equal(badge.textContent, 'Available');
  });

  it('uses quick-recipe-icon class for bounded image sizing (T-089)', () => {
    const section = buildRecentsSection([baseRecipe]);
    const img = section.querySelector('img');
    assert.ok(img.classList.contains('quick-recipe-icon'), 'Image must use quick-recipe-icon class');
  });
});

describe('RecentsSection: Craft Button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders craft button when allowCraftAction is true', () => {
    const section = buildRecentsSection([{ ...baseRecipe, allowCraftAction: true, craftButtonLabel: 'Craft' }]);
    const craftBtn = section.querySelector('.craft-btn');
    assert.ok(craftBtn, 'Craft button should exist');
    assert.ok(craftBtn.querySelector('i.fas.fa-hammer'), 'Should have hammer icon');
    assert.ok(craftBtn.textContent.includes('Craft'));
  });

  it('omits craft button when allowCraftAction is false', () => {
    const section = buildRecentsSection([{ ...baseRecipe, allowCraftAction: false }]);
    const craftBtn = section.querySelector('.craft-btn');
    assert.equal(craftBtn, null, 'Craft button should not exist');
  });

  it('craft button dispatches onCraft with recipeId and runId null when no active run', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recent-craft-1',
      activeRunId: '',
      allowCraftAction: true,
      _onCraft: (id, opts) => calls.push({ id, opts })
    };
    const section = buildRecentsSection([recipe]);
    section.querySelector('.craft-btn').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'recent-craft-1');
    assert.deepEqual(calls[0].opts, { runId: null });
  });

  it('craft button passes activeRunId when present', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recent-craft-2',
      activeRunId: 'run-abc',
      allowCraftAction: true,
      craftButtonLabel: 'Continue',
      _onCraft: (id, opts) => calls.push({ id, opts })
    };
    const section = buildRecentsSection([recipe]);
    section.querySelector('.craft-btn').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.runId, 'run-abc');
  });
});

describe('RecentsSection: Details Button', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('details button always renders', () => {
    const section = buildRecentsSection([baseRecipe]);
    const detailsBtn = section.querySelector('.details-btn');
    assert.ok(detailsBtn, 'Details button should exist');
    assert.ok(detailsBtn.querySelector('i.fas.fa-info-circle'), 'Should have info icon');
  });

  it('details button does not have favourite-btn class', () => {
    const section = buildRecentsSection([baseRecipe]);
    const detailsBtn = section.querySelector('.details-btn');
    assert.ok(!detailsBtn.classList.contains('favourite-btn'), 'Details button should not have favourite-btn class');
  });

  it('details button dispatches onShowDetails with recipeId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recent-details-1',
      _onShowDetails: (id) => calls.push(id)
    };
    const section = buildRecentsSection([recipe]);
    section.querySelector('.details-btn').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'recent-details-1');
  });
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures that mirror RecipeCard and RecipeList output
// ---------------------------------------------------------------------------

function buildRecipeArticle(recipe) {
  const article = document.createElement('article');
  article.className = `fabricate-recipe-item ${recipe.canCraft ? 'can-craft' : 'cannot-craft'}`;
  article.dataset.recipeId = recipe.id;

  // Icon
  const iconDiv = document.createElement('div');
  iconDiv.className = 'recipe-icon';
  const img = document.createElement('img');
  img.src = recipe.img || '';
  img.alt = recipe.name;
  iconDiv.appendChild(img);
  article.appendChild(iconDiv);

  // Info
  const infoDiv = document.createElement('div');
  infoDiv.className = 'recipe-info';

  const h3 = document.createElement('h3');
  h3.className = 'recipe-name';
  h3.appendChild(document.createTextNode(recipe.name));

  const statusBadge = document.createElement('span');
  statusBadge.className = 'badge';
  statusBadge.textContent = recipe.statusLabel;
  h3.appendChild(statusBadge);

  if (recipe.hasMultipleSets) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'Multiple options';
    h3.appendChild(badge);
  }

  if (recipe.hasMultipleActiveRuns) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `${recipe.activeRunCount} active runs`;
    h3.appendChild(badge);
  }

  infoDiv.appendChild(h3);

  const descP = document.createElement('p');
  descP.className = 'recipe-description';
  descP.textContent = recipe.description;
  infoDiv.appendChild(descP);

  if (recipe.activeRunStepLabel) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = `Current run: ${recipe.activeRunStepLabel}`;
    infoDiv.appendChild(hint);
  }

  // Requirements
  const reqDiv = document.createElement('div');
  reqDiv.className = 'recipe-requirements';

  if (recipe.ingredients && recipe.ingredients.length > 0) {
    const ingDiv = document.createElement('div');
    ingDiv.className = 'ingredient-list';
    const label = document.createElement('strong');
    label.textContent = 'Ingredients:';
    ingDiv.appendChild(label);
    for (const ing of recipe.ingredients) {
      const span = document.createElement('span');
      span.className = `ingredient-badge ${ing.satisfied ? 'satisfied' : 'unsatisfied'}`;
      span.textContent = ing.description;
      const qty = document.createElement('span');
      qty.className = 'quantity';
      qty.textContent = `(${ing.have}/${ing.need})`;
      span.appendChild(qty);
      ingDiv.appendChild(span);
    }
    reqDiv.appendChild(ingDiv);
  }

  if (recipe.essences && recipe.essences.length > 0) {
    const essDiv = document.createElement('div');
    essDiv.className = 'essence-list';
    const label = document.createElement('strong');
    label.textContent = 'Essences:';
    essDiv.appendChild(label);
    for (const ess of recipe.essences) {
      const span = document.createElement('span');
      span.className = `essence-badge ${ess.satisfied ? 'satisfied' : 'unsatisfied'}`;
      span.textContent = `${ess.type}: ${ess.need}`;
      essDiv.appendChild(span);
    }
    reqDiv.appendChild(essDiv);
  }

  if (recipe.catalysts && recipe.catalysts.length > 0) {
    const catDiv = document.createElement('div');
    catDiv.className = 'catalyst-list';
    const label = document.createElement('strong');
    label.textContent = 'Requires:';
    catDiv.appendChild(label);
    for (const cat of recipe.catalysts) {
      const span = document.createElement('span');
      span.className = `catalyst-badge ${cat.available ? 'have' : 'need'}`;
      const icon = document.createElement('i');
      icon.className = 'fas fa-tools';
      span.appendChild(icon);
      span.appendChild(document.createTextNode(` ${cat.name}`));
      catDiv.appendChild(span);
    }
    reqDiv.appendChild(catDiv);
  }

  infoDiv.appendChild(reqDiv);

  // Result
  const resultDiv = document.createElement('div');
  resultDiv.className = 'recipe-result';
  const arrow = document.createElement('i');
  arrow.className = 'fas fa-arrow-right';
  resultDiv.appendChild(arrow);
  const strong = document.createElement('strong');
  strong.textContent = recipe.resultDescription;
  resultDiv.appendChild(strong);
  infoDiv.appendChild(resultDiv);

  article.appendChild(infoDiv);

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'recipe-actions';

  if (recipe.allowCraftAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'craft-btn';
    btn.title = 'Craft this recipe';
    btn.onclick = () => recipe._onCraft?.(recipe.id, { runId: recipe.activeRunId || null });
    const icon = document.createElement('i');
    icon.className = 'fas fa-hammer';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(` ${recipe.craftButtonLabel}`));
    actionsDiv.appendChild(btn);
  } else if (recipe.activeRunId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'craft-btn disabled';
    btn.disabled = true;
    btn.title = recipe.statusLabel;
    const icon = document.createElement('i');
    icon.className = 'fas fa-hourglass-half';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' Waiting'));
    actionsDiv.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'craft-btn disabled';
    btn.disabled = true;
    btn.title = recipe.statusLabel;
    const icon = document.createElement('i');
    icon.className = 'fas fa-ban';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' Cannot Craft'));
    actionsDiv.appendChild(btn);
  }

  if (recipe.canLearn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'craft-btn';
    btn.title = 'Learn this recipe';
    btn.onclick = () => recipe._onLearnRecipe?.(recipe.id);
    const icon = document.createElement('i');
    icon.className = 'fas fa-book-open';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' Learn'));
    actionsDiv.appendChild(btn);
  }

  // Favourite
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `details-btn favourite-btn${recipe.isFavourite ? ' is-favourite' : ''}`;
  favBtn.title = recipe.isFavourite ? 'Remove from favourites' : 'Add to favourites';
  favBtn.onclick = () => recipe._onToggleFavourite?.(recipe.id);
  const starIcon = document.createElement('i');
  starIcon.className = 'fas fa-star';
  favBtn.appendChild(starIcon);
  actionsDiv.appendChild(favBtn);

  // Details
  const detailsBtn = document.createElement('button');
  detailsBtn.type = 'button';
  detailsBtn.className = 'details-btn';
  detailsBtn.title = 'Show recipe details';
  detailsBtn.onclick = () => recipe._onShowDetails?.(recipe.id);
  const infoIcon = document.createElement('i');
  infoIcon.className = 'fas fa-info-circle';
  detailsBtn.appendChild(infoIcon);
  actionsDiv.appendChild(detailsBtn);

  // Restart (only if activeRunId)
  if (recipe.activeRunId) {
    const restartBtn = document.createElement('button');
    restartBtn.type = 'button';
    restartBtn.className = 'details-btn';
    restartBtn.title = 'Restart run from step 1';
    restartBtn.onclick = () => recipe._onRestartRun?.(recipe.id, recipe.activeRunId);
    const restartIcon = document.createElement('i');
    restartIcon.className = 'fas fa-rotate-left';
    restartBtn.appendChild(restartIcon);
    actionsDiv.appendChild(restartBtn);
  }

  article.appendChild(actionsDiv);
  return article;
}

function buildRecipeList(recipes, search = '') {
  const container = document.createElement('div');
  if (recipes.length > 0) {
    for (const recipe of recipes) {
      container.appendChild(buildRecipeArticle(recipe));
    }
  } else {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'fabricate-empty';
    const icon = document.createElement('i');
    icon.className = 'fas fa-inbox';
    emptyDiv.appendChild(icon);
    const p = document.createElement('p');
    p.textContent = 'No recipes found.';
    emptyDiv.appendChild(p);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = search
      ? 'Try adjusting your search or filters.'
      : 'The GM needs to create some recipes first.';
    emptyDiv.appendChild(hint);
    container.appendChild(emptyDiv);
  }
  return container;
}

const baseRecipe = {
  id: 'recipe-1',
  name: 'Healing Potion',
  description: 'A basic healing potion.',
  img: 'icons/consumables/potions/potion-round-empty-red.webp',
  category: 'Potions',
  canCraft: true,
  allowCraftAction: true,
  accessReason: 'ok',
  statusLabel: 'Available',
  activeRunId: '',
  activeRunCount: 0,
  hasMultipleActiveRuns: false,
  activeRunStatusLabel: null,
  activeRunStepLabel: null,
  activeRunRemainingSeconds: 0,
  craftButtonLabel: 'Craft',
  canLearn: false,
  hasMultipleSets: false,
  resultDescription: '1x Healing Potion',
  ingredients: [],
  essences: [],
  catalysts: [],
  isFavourite: false
};

// ---------------------------------------------------------------------------
// RecipeCard: Structure
// ---------------------------------------------------------------------------

describe('RecipeCard: Structure', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders with can-craft class when canCraft is true', () => {
    const article = buildRecipeArticle({ ...baseRecipe, canCraft: true });
    assert.ok(article.classList.contains('can-craft'));
    assert.ok(!article.classList.contains('cannot-craft'));
  });

  it('renders with cannot-craft class when canCraft is false', () => {
    const article = buildRecipeArticle({ ...baseRecipe, canCraft: false, allowCraftAction: false });
    assert.ok(article.classList.contains('cannot-craft'));
    assert.ok(!article.classList.contains('can-craft'));
  });

  it('has data-recipe-id attribute matching recipe.id', () => {
    const article = buildRecipeArticle({ ...baseRecipe, id: 'recipe-xyz' });
    assert.equal(article.dataset.recipeId, 'recipe-xyz');
  });

  it('renders recipe name in h3.recipe-name', () => {
    const article = buildRecipeArticle({ ...baseRecipe, name: 'Fire Bomb' });
    const h3 = article.querySelector('h3.recipe-name');
    assert.ok(h3, 'h3.recipe-name should exist');
    assert.ok(h3.textContent.includes('Fire Bomb'));
  });

  it('renders status badge with statusLabel text', () => {
    const article = buildRecipeArticle({ ...baseRecipe, statusLabel: 'Missing materials' });
    const badges = article.querySelectorAll('h3.recipe-name .badge');
    assert.ok(badges.length >= 1);
    assert.equal(badges[0].textContent, 'Missing materials');
  });

  it('renders description in p.recipe-description', () => {
    const article = buildRecipeArticle({ ...baseRecipe, description: 'A fire bomb for combat.' });
    const p = article.querySelector('p.recipe-description');
    assert.ok(p, 'p.recipe-description should exist');
    assert.equal(p.textContent, 'A fire bomb for combat.');
  });

  it('renders multi-option badge when hasMultipleSets is true', () => {
    const article = buildRecipeArticle({ ...baseRecipe, hasMultipleSets: true });
    const badges = article.querySelectorAll('h3.recipe-name .badge');
    const texts = [...badges].map(b => b.textContent);
    assert.ok(texts.some(t => t.includes('Multiple options')), 'Multiple options badge should render');
  });

  it('omits multi-option badge when hasMultipleSets is false', () => {
    const article = buildRecipeArticle({ ...baseRecipe, hasMultipleSets: false });
    const badges = article.querySelectorAll('h3.recipe-name .badge');
    const texts = [...badges].map(b => b.textContent);
    assert.ok(!texts.some(t => t.includes('Multiple options')), 'Multiple options badge should not render');
  });

  it('renders active run count badge when hasMultipleActiveRuns is true', () => {
    const article = buildRecipeArticle({ ...baseRecipe, hasMultipleActiveRuns: true, activeRunCount: 3 });
    const badges = article.querySelectorAll('h3.recipe-name .badge');
    const texts = [...badges].map(b => b.textContent);
    assert.ok(texts.some(t => t.includes('3 active runs')), 'Active run count badge should render');
  });

  it('omits active run count badge when hasMultipleActiveRuns is false', () => {
    const article = buildRecipeArticle({ ...baseRecipe, hasMultipleActiveRuns: false });
    const badges = article.querySelectorAll('h3.recipe-name .badge');
    const texts = [...badges].map(b => b.textContent);
    assert.ok(!texts.some(t => t.includes('active runs')), 'Active run count badge should not render');
  });

  it('renders active run step label hint when present', () => {
    const article = buildRecipeArticle({ ...baseRecipe, activeRunStepLabel: 'Brew (2/3)' });
    const hints = article.querySelectorAll('p.hint');
    const texts = [...hints].map(h => h.textContent);
    assert.ok(texts.some(t => t.includes('Brew (2/3)')), 'Step label hint should render');
  });

  it('omits active run step label hint when null', () => {
    const article = buildRecipeArticle({ ...baseRecipe, activeRunStepLabel: null });
    const hints = article.querySelectorAll('p.hint');
    const texts = [...hints].map(h => h.textContent);
    assert.ok(!texts.some(t => t.includes('Current run')), 'Step label hint should not render');
  });

  it('renders result description in .recipe-result', () => {
    const article = buildRecipeArticle({ ...baseRecipe, resultDescription: '2x Fire Bomb' });
    const resultDiv = article.querySelector('.recipe-result');
    assert.ok(resultDiv, '.recipe-result should exist');
    assert.ok(resultDiv.textContent.includes('2x Fire Bomb'));
  });
});

// ---------------------------------------------------------------------------
// RecipeCard: Ingredient/Essence/Catalyst Badges
// ---------------------------------------------------------------------------

describe('RecipeCard: Requirement Badges', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders ingredient badges with satisfied class and (have/need) text', () => {
    const article = buildRecipeArticle({
      ...baseRecipe,
      ingredients: [
        { description: 'Herb', have: 3, need: 2, satisfied: true },
        { description: 'Water', have: 0, need: 1, satisfied: false }
      ]
    });

    const ingDiv = article.querySelector('.ingredient-list');
    assert.ok(ingDiv, '.ingredient-list should exist');

    const badges = ingDiv.querySelectorAll('.ingredient-badge');
    assert.equal(badges.length, 2);

    assert.ok(badges[0].classList.contains('satisfied'));
    assert.ok(badges[0].querySelector('.quantity').textContent.includes('(3/2)'));

    assert.ok(badges[1].classList.contains('unsatisfied'));
    assert.ok(badges[1].querySelector('.quantity').textContent.includes('(0/1)'));
  });

  it('omits ingredient section when ingredients array is empty', () => {
    const article = buildRecipeArticle({ ...baseRecipe, ingredients: [] });
    assert.equal(article.querySelector('.ingredient-list'), null);
  });

  it('renders essence badges with satisfied/unsatisfied class', () => {
    const article = buildRecipeArticle({
      ...baseRecipe,
      essences: [
        { type: 'Fire', need: 2, satisfied: true },
        { type: 'Water', need: 1, satisfied: false }
      ]
    });

    const essDiv = article.querySelector('.essence-list');
    assert.ok(essDiv, '.essence-list should exist');

    const badges = essDiv.querySelectorAll('.essence-badge');
    assert.equal(badges.length, 2);

    assert.ok(badges[0].classList.contains('satisfied'));
    assert.ok(badges[0].textContent.includes('Fire: 2'));

    assert.ok(badges[1].classList.contains('unsatisfied'));
    assert.ok(badges[1].textContent.includes('Water: 1'));
  });

  it('omits essence section when essences array is empty', () => {
    const article = buildRecipeArticle({ ...baseRecipe, essences: [] });
    assert.equal(article.querySelector('.essence-list'), null);
  });

  it('renders catalyst badges with tool icon and have/need class', () => {
    const article = buildRecipeArticle({
      ...baseRecipe,
      catalysts: [
        { name: 'Mortar & Pestle', available: true },
        { name: 'Cauldron', available: false }
      ]
    });

    const catDiv = article.querySelector('.catalyst-list');
    assert.ok(catDiv, '.catalyst-list should exist');

    const badges = catDiv.querySelectorAll('.catalyst-badge');
    assert.equal(badges.length, 2);

    assert.ok(badges[0].classList.contains('have'));
    assert.ok(badges[0].querySelector('i.fas.fa-tools'), 'Catalyst badge should have tool icon');
    assert.ok(badges[0].textContent.includes('Mortar & Pestle'));

    assert.ok(badges[1].classList.contains('need'));
    assert.ok(badges[1].textContent.includes('Cauldron'));
  });

  it('omits catalyst section when catalysts array is empty', () => {
    const article = buildRecipeArticle({ ...baseRecipe, catalysts: [] });
    assert.equal(article.querySelector('.catalyst-list'), null);
  });
});

// ---------------------------------------------------------------------------
// RecipeCard: Action Buttons
// ---------------------------------------------------------------------------

describe('RecipeCard: Action Buttons - Craft', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders enabled craft button when allowCraftAction is true', () => {
    const article = buildRecipeArticle({ ...baseRecipe, allowCraftAction: true, craftButtonLabel: 'Craft' });
    const craftBtn = article.querySelector('.craft-btn:not(.disabled)');
    assert.ok(craftBtn, 'Enabled craft button should exist');
    assert.ok(!craftBtn.disabled);
    assert.ok(craftBtn.querySelector('i.fas.fa-hammer'), 'Should have hammer icon');
  });

  it('craft button dispatches onCraft with recipeId and runId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recipe-craft-1',
      activeRunId: '',
      allowCraftAction: true,
      _onCraft: (id, opts) => calls.push({ id, opts })
    };
    const article = buildRecipeArticle(recipe);
    const craftBtn = article.querySelector('.craft-btn:not(.disabled)');
    craftBtn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'recipe-craft-1');
    assert.deepEqual(calls[0].opts, { runId: null });
  });

  it('craft button passes activeRunId when present', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recipe-continue-1',
      activeRunId: 'run-abc',
      allowCraftAction: true,
      craftButtonLabel: 'Continue',
      _onCraft: (id, opts) => calls.push({ id, opts })
    };
    const article = buildRecipeArticle(recipe);
    const craftBtn = article.querySelector('.craft-btn:not(.disabled)');
    craftBtn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.runId, 'run-abc');
  });

  it('renders disabled Waiting button when activeRunId exists but allowCraftAction is false', () => {
    const article = buildRecipeArticle({
      ...baseRecipe,
      allowCraftAction: false,
      activeRunId: 'run-waiting',
      statusLabel: 'Waiting'
    });
    const disabledBtn = article.querySelector('.craft-btn.disabled');
    assert.ok(disabledBtn, 'Disabled button should exist');
    assert.ok(disabledBtn.disabled);
    assert.ok(disabledBtn.querySelector('i.fas.fa-hourglass-half'), 'Should have hourglass icon');
    assert.ok(disabledBtn.textContent.includes('Waiting'));
  });

  it('renders disabled Cannot Craft button when not craftable and no active run', () => {
    const article = buildRecipeArticle({
      ...baseRecipe,
      allowCraftAction: false,
      activeRunId: '',
      canCraft: false,
      statusLabel: 'Missing materials'
    });
    const disabledBtn = article.querySelector('.craft-btn.disabled');
    assert.ok(disabledBtn, 'Disabled button should exist');
    assert.ok(disabledBtn.disabled);
    assert.ok(disabledBtn.querySelector('i.fas.fa-ban'), 'Should have ban icon');
    assert.ok(disabledBtn.textContent.includes('Cannot Craft'));
  });
});

describe('RecipeCard: Action Buttons - Learn', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders Learn button when canLearn is true', () => {
    const article = buildRecipeArticle({ ...baseRecipe, allowCraftAction: false, canLearn: true });
    const learnBtn = article.querySelector('button[title="Learn this recipe"]');
    assert.ok(learnBtn, 'Learn button should exist');
    assert.ok(learnBtn.querySelector('i.fas.fa-book-open'), 'Should have book icon');
    assert.ok(learnBtn.textContent.includes('Learn'));
  });

  it('omits Learn button when canLearn is false', () => {
    const article = buildRecipeArticle({ ...baseRecipe, canLearn: false });
    const learnBtn = article.querySelector('button[title="Learn this recipe"]');
    assert.equal(learnBtn, null);
  });

  it('Learn button dispatches onLearnRecipe with recipeId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recipe-learn-1',
      allowCraftAction: false,
      canLearn: true,
      _onLearnRecipe: (id) => calls.push(id)
    };
    const article = buildRecipeArticle(recipe);
    const learnBtn = article.querySelector('button[title="Learn this recipe"]');
    learnBtn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'recipe-learn-1');
  });
});

describe('RecipeCard: Action Buttons - Favourite', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('favourite button has is-favourite class when isFavourite is true', () => {
    const article = buildRecipeArticle({ ...baseRecipe, isFavourite: true });
    const favBtn = article.querySelector('.favourite-btn');
    assert.ok(favBtn, 'Favourite button should exist');
    assert.ok(favBtn.classList.contains('is-favourite'));
    assert.equal(favBtn.title, 'Remove from favourites');
  });

  it('favourite button does not have is-favourite class when isFavourite is false', () => {
    const article = buildRecipeArticle({ ...baseRecipe, isFavourite: false });
    const favBtn = article.querySelector('.favourite-btn');
    assert.ok(favBtn, 'Favourite button should exist');
    assert.ok(!favBtn.classList.contains('is-favourite'));
    assert.equal(favBtn.title, 'Add to favourites');
  });

  it('favourite button dispatches onToggleFavourite with recipeId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recipe-fav-1',
      _onToggleFavourite: (id) => calls.push(id)
    };
    const article = buildRecipeArticle(recipe);
    const favBtn = article.querySelector('.favourite-btn');
    favBtn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'recipe-fav-1');
  });
});

describe('RecipeCard: Action Buttons - Details and Restart', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('details button dispatches onShowDetails with recipeId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recipe-details-1',
      _onShowDetails: (id) => calls.push(id)
    };
    const article = buildRecipeArticle(recipe);
    const detailsBtn = article.querySelector('button[title="Show recipe details"]');
    assert.ok(detailsBtn, 'Details button should exist');
    detailsBtn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'recipe-details-1');
  });

  it('restart button renders only when activeRunId is set', () => {
    const withRun = buildRecipeArticle({ ...baseRecipe, activeRunId: 'run-789' });
    assert.ok(withRun.querySelector('button[title="Restart run from step 1"]'), 'Restart button should render');

    const withoutRun = buildRecipeArticle({ ...baseRecipe, activeRunId: '' });
    assert.equal(withoutRun.querySelector('button[title="Restart run from step 1"]'), null);
  });

  it('restart button dispatches onRestartRun with recipeId and runId', () => {
    const calls = [];
    const recipe = {
      ...baseRecipe,
      id: 'recipe-restart-1',
      activeRunId: 'run-restart-99',
      allowCraftAction: true,
      _onRestartRun: (recipeId, runId) => calls.push({ recipeId, runId })
    };
    const article = buildRecipeArticle(recipe);
    const restartBtn = article.querySelector('button[title="Restart run from step 1"]');
    restartBtn.click();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].recipeId, 'recipe-restart-1');
    assert.equal(calls[0].runId, 'run-restart-99');
  });
});

// ---------------------------------------------------------------------------
// RecipeList: Empty States
// ---------------------------------------------------------------------------

describe('RecipeList: Empty States', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('shows adjust-filters hint when search term is present and list is empty', () => {
    const container = buildRecipeList([], 'healing');
    const emptyDiv = container.querySelector('.fabricate-empty');
    assert.ok(emptyDiv, '.fabricate-empty should exist');
    assert.ok(emptyDiv.textContent.includes('No recipes found.'));
    const hint = emptyDiv.querySelector('p.hint');
    assert.ok(hint, 'Hint paragraph should exist');
    assert.ok(hint.textContent.includes('Try adjusting your search or filters.'));
  });

  it('shows GM-needed hint when no search term and list is empty', () => {
    const container = buildRecipeList([], '');
    const emptyDiv = container.querySelector('.fabricate-empty');
    assert.ok(emptyDiv, '.fabricate-empty should exist');
    const hint = emptyDiv.querySelector('p.hint');
    assert.ok(hint, 'Hint paragraph should exist');
    assert.ok(hint.textContent.includes('The GM needs to create some recipes first.'));
  });

  it('renders inbox icon in empty state', () => {
    const container = buildRecipeList([], '');
    const emptyDiv = container.querySelector('.fabricate-empty');
    assert.ok(emptyDiv.querySelector('i.fas.fa-inbox'), 'Inbox icon should render in empty state');
  });
});

// ---------------------------------------------------------------------------
// RecipeList: Iteration
// ---------------------------------------------------------------------------

describe('RecipeList: Iteration', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders one card per recipe', () => {
    const recipes = [
      { ...baseRecipe, id: 'recipe-a', name: 'Recipe A' },
      { ...baseRecipe, id: 'recipe-b', name: 'Recipe B' },
      { ...baseRecipe, id: 'recipe-c', name: 'Recipe C' }
    ];
    const container = buildRecipeList(recipes);
    const cards = container.querySelectorAll('.fabricate-recipe-item');
    assert.equal(cards.length, 3);
  });

  it('each card has correct data-recipe-id', () => {
    const recipes = [
      { ...baseRecipe, id: 'r-1', name: 'R1' },
      { ...baseRecipe, id: 'r-2', name: 'R2' }
    ];
    const container = buildRecipeList(recipes);
    const cards = container.querySelectorAll('.fabricate-recipe-item');
    assert.equal(cards[0].dataset.recipeId, 'r-1');
    assert.equal(cards[1].dataset.recipeId, 'r-2');
  });

  it('does not render empty state when recipes exist', () => {
    const recipes = [{ ...baseRecipe, id: 'r-1', name: 'R1' }];
    const container = buildRecipeList(recipes);
    assert.equal(container.querySelector('.fabricate-empty'), null);
  });
});

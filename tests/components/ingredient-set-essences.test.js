/**
 * Tests for the recipe editor ingredient-set essence requirements section.
 *
 * Mirrors the component editor card-roster interaction model:
 * - render every system essence definition
 * - edit quantities inline with steppers and direct numeric input
 * - treat 0 as the neutral "not required" state
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

function sortEssenceDefinitions(definitions = []) {
  return [...definitions].sort((left, right) => {
    const nameCompare = String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
      sensitivity: 'base'
    });
    if (nameCompare !== 0) return nameCompare;
    return String(left?.id || '').localeCompare(String(right?.id || ''), undefined, {
      sensitivity: 'base'
    });
  });
}

function clampQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.max(0, Math.floor(quantity));
}

function buildEssenceSection(set, allEssences, showEssences, callbacks = {}) {
  if (!showEssences) return null;

  const container = document.createElement('div');
  container.className = 'essence-requirements';

  const heading = document.createElement('h4');
  heading.textContent = 'Essence Requirements';
  container.appendChild(heading);

  const essenceOptions = sortEssenceDefinitions(allEssences).map(def => ({
    id: def.id,
    name: def.name || def.id,
    icon: String(def.icon || '').trim() || DEFAULT_ESSENCE_ICON,
    quantity: clampQuantity(set?.essences?.[def.id])
  }));

  if (essenceOptions.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'No essences defined yet. Add essences in Crafting Admin > Systems.';
    container.appendChild(hint);
    return container;
  }

  const grid = document.createElement('div');
  grid.className = 'essence-grid';
  container.appendChild(grid);

  for (const option of essenceOptions) {
    const card = document.createElement('article');
    card.className = 'essence-card';
    card.dataset.essenceId = option.id;

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'essence-step essence-step-minus';
    minusBtn.title = `Decrease ${option.name}`;
    minusBtn.setAttribute('aria-label', `Decrease ${option.name}`);
    minusBtn.onclick = () => callbacks.onUpdateEssence?.(0, option.id, Math.max(0, option.quantity - 1));
    minusBtn.appendChild(document.createElement('i')).className = 'fas fa-minus';
    card.appendChild(minusBtn);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.className = 'essence-quantity-input';
    input.value = String(option.quantity);
    input.setAttribute('aria-label', `${option.name} quantity`);
    input.oninput = (event) => {
      callbacks.onUpdateEssence?.(0, option.id, clampQuantity(event.target.value));
    };
    card.appendChild(input);

    const iconBadge = document.createElement('div');
    iconBadge.className = 'essence-icon';
    iconBadge.setAttribute('aria-hidden', 'true');
    iconBadge.appendChild(document.createElement('i')).className = option.icon;
    card.appendChild(iconBadge);

    const nameEl = document.createElement('strong');
    nameEl.className = 'essence-name';
    nameEl.textContent = option.name;
    card.appendChild(nameEl);

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'essence-step essence-step-plus';
    plusBtn.title = `Increase ${option.name}`;
    plusBtn.setAttribute('aria-label', `Increase ${option.name}`);
    plusBtn.onclick = () => callbacks.onUpdateEssence?.(0, option.id, option.quantity + 1);
    plusBtn.appendChild(document.createElement('i')).className = 'fas fa-plus';
    card.appendChild(plusBtn);

    grid.appendChild(card);
  }

  return container;
}

describe('IngredientSetPanel essence requirements section', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders nothing when showEssences is false', () => {
    const result = buildEssenceSection(
      { essences: { fire: 2 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      false
    );

    assert.equal(result, null);
  });

  it('renders the section heading when showEssences is true', () => {
    const section = buildEssenceSection({ essences: {} }, [], true);

    assert.ok(section);
    assert.equal(section.className, 'essence-requirements');
    assert.equal(section.querySelector('h4').textContent, 'Essence Requirements');
  });

  it('renders a hint when the system defines no essences', () => {
    const section = buildEssenceSection({ essences: {} }, [], true);

    const hint = section.querySelector('.hint');
    assert.ok(hint);
    assert.match(hint.textContent, /No essences defined yet/i);
  });

  it('renders one card per system essence definition', () => {
    const allEssences = [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
      { id: 'water', name: 'Water', icon: 'fas fa-water' }
    ];
    const section = buildEssenceSection(
      { essences: { fire: 3 } },
      allEssences,
      true
    );

    const cards = section.querySelectorAll('.essence-card');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].dataset.essenceId, 'fire');
    assert.equal(cards[1].dataset.essenceId, 'water');
  });

  it('sorts essence cards alphabetically by display name', () => {
    const section = buildEssenceSection(
      { essences: { 'ess-z': 4, 'ess-a': 1 } },
      [
        { id: 'ess-z', name: 'Zephyr', icon: 'fas fa-wind' },
        { id: 'ess-a', name: 'Amber', icon: 'fas fa-gem' }
      ],
      true
    );

    const names = [...section.querySelectorAll('.essence-name')].map(el => el.textContent);
    assert.deepEqual(names, ['Amber', 'Zephyr']);
  });

  it('shows quantity 0 for unselected essences instead of hiding them', () => {
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
        { id: 'water', name: 'Water', icon: 'fas fa-water' }
      ],
      true
    );

    const cards = section.querySelectorAll('.essence-card');
    assert.equal(cards[0].querySelector('.essence-quantity-input').value, '2');
    assert.equal(cards[1].querySelector('.essence-quantity-input').value, '0');
  });

  it('renders increment and decrement buttons but no remove button', () => {
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true
    );

    const card = section.querySelector('.essence-card');
    assert.ok(card.querySelector('.essence-step-minus'));
    assert.ok(card.querySelector('.essence-step-plus'));
    assert.equal(card.querySelector('.essence-remove'), null);
  });

  it('does not render the legacy add-essence row', () => {
    const section = buildEssenceSection(
      { essences: {} },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true
    );

    assert.equal(section.querySelector('.add-essence-row'), null);
  });

  it('uses min=0 on quantity inputs', () => {
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true
    );

    assert.equal(section.querySelector('.essence-quantity-input').min, '0');
  });

  it('uses the default icon when an essence definition has no icon', () => {
    const section = buildEssenceSection(
      { essences: { mystery: 1 } },
      [{ id: 'mystery', name: 'Mystery', icon: '' }],
      true
    );

    const icon = section.querySelector('.essence-icon i');
    assert.equal(icon.className, DEFAULT_ESSENCE_ICON);
  });

  it('incrementing an unselected essence requests quantity 1', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: {} },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onUpdateEssence: (...args) => calls.push(args) }
    );

    section.querySelector('.essence-step-plus').click();
    assert.deepEqual(calls, [[0, 'fire', 1]]);
  });

  it('decrementing a zero-quantity essence keeps the quantity at zero', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: {} },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onUpdateEssence: (...args) => calls.push(args) }
    );

    section.querySelector('.essence-step-minus').click();
    assert.deepEqual(calls, [[0, 'fire', 0]]);
  });

  it('typing 0 into the quantity input requests removal through updateEssence', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: { fire: 3 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onUpdateEssence: (...args) => calls.push(args) }
    );

    const input = section.querySelector('.essence-quantity-input');
    input.value = '0';
    input.oninput({ target: input });

    assert.deepEqual(calls, [[0, 'fire', 0]]);
  });
});

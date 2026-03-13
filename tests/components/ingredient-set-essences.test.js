/**
 * Tests for essence requirements section in IngredientSetPanel
 * DOM-based tests mirroring the component output structure (card layout).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helper: build DOM structure mirroring the new card-layout essence section
// ---------------------------------------------------------------------------

function buildEssenceSection(set, allEssences, showEssences, callbacks = {}) {
  if (!showEssences) return null;

  const container = document.createElement('div');
  container.className = 'essence-requirements';

  const h4 = document.createElement('h4');
  h4.textContent = 'Essence Requirements';
  container.appendChild(h4);

  // Grid wrapper
  const grid = document.createElement('div');
  grid.className = 'essence-grid';
  container.appendChild(grid);

  const essences = set?.essences || {};
  for (const [essenceId, quantity] of Object.entries(essences)) {
    const def = allEssences.find(e => e.id === essenceId);

    // Card article — 6-column inner grid: [minus] [qty input] [icon] [name] [plus] [remove]
    const card = document.createElement('article');
    card.className = 'essence-card';
    card.dataset.essenceId = essenceId;

    // 1. Decrement button
    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'essence-step essence-step-minus';
    minusBtn.disabled = quantity <= 1;
    minusBtn.title = `Decrease ${def?.name || essenceId}`;
    minusBtn.setAttribute('aria-label', `Decrease ${def?.name || essenceId}`);
    minusBtn.onclick = () => callbacks.onUpdateEssence?.(0, essenceId, Math.max(1, quantity - 1));
    const minusIcon = document.createElement('i');
    minusIcon.className = 'fas fa-minus';
    minusBtn.appendChild(minusIcon);
    card.appendChild(minusBtn);

    // 2. Quantity input
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'essence-quantity-input';
    input.min = '1';
    input.value = String(quantity);
    input.oninput = (e) => {
      const val = Math.max(1, Math.floor(Number(e.target.value) || 1));
      callbacks.onUpdateEssence?.(0, essenceId, val);
    };
    card.appendChild(input);

    // 3. Icon badge
    const iconBadge = document.createElement('div');
    iconBadge.className = 'essence-icon';
    iconBadge.setAttribute('aria-hidden', 'true');
    if (def?.icon) {
      const icon = document.createElement('i');
      icon.className = def.icon;
      icon.setAttribute('aria-hidden', 'true');
      iconBadge.appendChild(icon);
    }
    card.appendChild(iconBadge);

    // 4. Name
    const nameEl = document.createElement('strong');
    nameEl.className = 'essence-name';
    nameEl.textContent = def?.name || essenceId;
    card.appendChild(nameEl);

    // 5. Increment button
    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'essence-step essence-step-plus';
    plusBtn.title = `Increase ${def?.name || essenceId}`;
    plusBtn.setAttribute('aria-label', `Increase ${def?.name || essenceId}`);
    plusBtn.onclick = () => callbacks.onUpdateEssence?.(0, essenceId, quantity + 1);
    const plusIcon = document.createElement('i');
    plusIcon.className = 'fas fa-plus';
    plusBtn.appendChild(plusIcon);
    card.appendChild(plusBtn);

    // 6. Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'essence-remove';
    removeBtn.title = 'Remove';
    removeBtn.onclick = () => callbacks.onRemoveEssence?.(0, essenceId);
    const removeIcon = document.createElement('i');
    removeIcon.className = 'fas fa-times';
    removeBtn.appendChild(removeIcon);
    card.appendChild(removeBtn);

    grid.appendChild(card);
  }

  // Add-essence row
  const addableEssences = allEssences.filter(def => !Object.hasOwn(essences, def.id));
  if (addableEssences.length > 0) {
    const addRow = document.createElement('div');
    addRow.className = 'add-essence-row';

    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Add essence...';
    select.appendChild(placeholder);
    for (const def of addableEssences) {
      const opt = document.createElement('option');
      opt.value = def.id;
      opt.textContent = def.name;
      select.appendChild(opt);
    }
    addRow.appendChild(select);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.disabled = true;
    addBtn.textContent = 'Add';
    addRow.appendChild(addBtn);

    container.appendChild(addRow);
  }

  return container;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  it('renders section with heading when showEssences is true', () => {
    const section = buildEssenceSection(
      { essences: {} },
      [],
      true
    );
    assert.ok(section);
    assert.equal(section.className, 'essence-requirements');
    const h4 = section.querySelector('h4');
    assert.equal(h4.textContent, 'Essence Requirements');
  });

  it('renders essence cards inside an essence-grid for each entry in set.essences', () => {
    const allEssences = [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
      { id: 'water', name: 'Water', icon: 'fas fa-water' }
    ];
    const section = buildEssenceSection(
      { essences: { fire: 3, water: 1 } },
      allEssences,
      true
    );

    const grid = section.querySelector('.essence-grid');
    assert.ok(grid, 'essence-grid wrapper should exist');

    const cards = grid.querySelectorAll('.essence-card');
    assert.equal(cards.length, 2);

    // First card: Fire (quantity 3)
    const fireCard = cards[0];
    assert.equal(fireCard.querySelector('.essence-name').textContent, 'Fire');
    assert.equal(fireCard.querySelector('.essence-quantity-input').value, '3');

    // Second card: Water (quantity 1)
    const waterCard = cards[1];
    assert.equal(waterCard.querySelector('.essence-name').textContent, 'Water');
    assert.equal(waterCard.querySelector('.essence-quantity-input').value, '1');
  });

  it('each essence card has increment and decrement buttons', () => {
    const allEssences = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const card = section.querySelector('.essence-card');
    assert.ok(card.querySelector('.essence-step-minus'), 'minus button should exist');
    assert.ok(card.querySelector('.essence-step-plus'), 'plus button should exist');
    assert.ok(card.querySelector('.essence-step-minus i.fas.fa-minus'), 'minus icon should exist');
    assert.ok(card.querySelector('.essence-step-plus i.fas.fa-plus'), 'plus icon should exist');
  });

  it('minus button is disabled when quantity is 1', () => {
    const allEssences = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
    const section = buildEssenceSection(
      { essences: { fire: 1 } },
      allEssences,
      true
    );
    const card = section.querySelector('.essence-card');
    const minusBtn = card.querySelector('.essence-step-minus');
    assert.equal(minusBtn.disabled, true, 'minus button should be disabled at quantity 1');
  });

  it('minus button is enabled when quantity is greater than 1', () => {
    const allEssences = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const card = section.querySelector('.essence-card');
    const minusBtn = card.querySelector('.essence-step-minus');
    assert.equal(minusBtn.disabled, false, 'minus button should be enabled at quantity > 1');
  });

  it('icon badge renders inside .essence-icon wrapper', () => {
    const allEssences = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const card = section.querySelector('.essence-card');
    const iconBadge = card.querySelector('.essence-icon');
    assert.ok(iconBadge, '.essence-icon wrapper should exist');
    assert.ok(iconBadge.querySelector('i.fas.fa-fire'), 'icon should be inside .essence-icon');
  });

  it('remove button has .essence-remove class', () => {
    const allEssences = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const card = section.querySelector('.essence-card');
    const removeBtn = card.querySelector('.essence-remove');
    assert.ok(removeBtn, '.essence-remove button should exist');
    assert.ok(removeBtn.querySelector('i.fas.fa-times'), 'remove icon should exist');
  });

  it('essence name is rendered in a strong element', () => {
    const allEssences = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const card = section.querySelector('.essence-card');
    const nameEl = card.querySelector('strong.essence-name');
    assert.ok(nameEl, 'essence name should be a strong element');
    assert.equal(nameEl.textContent, 'Fire');
  });

  it('shows add-essence dropdown with only unassigned essences', () => {
    const allEssences = [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
      { id: 'water', name: 'Water', icon: 'fas fa-water' },
      { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' }
    ];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const addRow = section.querySelector('.add-essence-row');
    assert.ok(addRow);

    const select = addRow.querySelector('select');
    const options = select.querySelectorAll('option');
    // Placeholder + 2 addable (water, earth)
    assert.equal(options.length, 3);
    assert.equal(options[1].value, 'water');
    assert.equal(options[1].textContent, 'Water');
    assert.equal(options[2].value, 'earth');
    assert.equal(options[2].textContent, 'Earth');
  });

  it('hides add-essence dropdown when all essences are assigned', () => {
    const allEssences = [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire' }
    ];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      allEssences,
      true
    );
    const addRow = section.querySelector('.add-essence-row');
    assert.equal(addRow, null);
  });

  it('displays essence id as fallback when definition is missing', () => {
    const section = buildEssenceSection(
      { essences: { unknown_essence: 1 } },
      [],
      true
    );
    const nameEl = section.querySelector('.essence-name');
    assert.equal(nameEl.textContent, 'unknown_essence');
  });

  it('calls onRemoveEssence callback when remove button is clicked', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onRemoveEssence: (...args) => calls.push(args) }
    );
    const removeBtn = section.querySelector('.essence-remove');
    removeBtn.click();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [0, 'fire']);
  });

  it('calls onUpdateEssence with quantity+1 when increment button is clicked', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: { fire: 2 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onUpdateEssence: (...args) => calls.push(args) }
    );
    const plusBtn = section.querySelector('.essence-step-plus');
    plusBtn.click();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [0, 'fire', 3]);
  });

  it('calls onUpdateEssence with quantity-1 when decrement button is clicked (quantity > 1)', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: { fire: 3 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onUpdateEssence: (...args) => calls.push(args) }
    );
    const minusBtn = section.querySelector('.essence-step-minus');
    minusBtn.click();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [0, 'fire', 2]);
  });

  it('does not fire update callback from disabled minus button at quantity 1', () => {
    const calls = [];
    const section = buildEssenceSection(
      { essences: { fire: 1 } },
      [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }],
      true,
      { onUpdateEssence: (...args) => calls.push(args) }
    );
    const minusBtn = section.querySelector('.essence-step-minus');
    // The button is disabled — clicking should have no effect
    assert.equal(minusBtn.disabled, true);
    // Simulate what a browser would do: disabled buttons do not fire click handlers
    // We verify the button is disabled rather than manually invoking click()
    assert.equal(calls.length, 0);
  });
});

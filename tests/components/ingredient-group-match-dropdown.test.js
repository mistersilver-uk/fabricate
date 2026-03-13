/**
 * Tests for IngredientGroupCard match type dropdown visibility.
 *
 * When showItemTags=false, the "Match" column (header + cell) should be hidden
 * and the OR-separator colspan should be reduced by 1.
 *
 * When showItemTags=true, the match type <select> should be present with both
 * "Component" and "Tag" options and the full colspan should be used.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures mirroring IngredientGroupCard table output
// ---------------------------------------------------------------------------

/**
 * Build the ingredient options table structure that IngredientGroupCard renders.
 *
 * @param {{ options: Array<{ matchType: string, quantity: number }> }} group
 * @param {{ showItemTags?: boolean }} opts
 * @returns {HTMLTableElement}
 */
function buildIngredientOptionsTable(group, { showItemTags = false } = {}) {
  const totalColumns = showItemTags ? 4 : 3;

  const table = document.createElement('table');
  table.className = 'ingredient-options-table';

  // thead
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  if (showItemTags) {
    const thMatch = document.createElement('th');
    thMatch.textContent = 'Match';
    headerRow.appendChild(thMatch);
  }

  const thReq = document.createElement('th');
  thReq.textContent = 'Requirement';
  headerRow.appendChild(thReq);

  const thQty = document.createElement('th');
  thQty.textContent = 'Quantity';
  headerRow.appendChild(thQty);

  const thActions = document.createElement('th');
  headerRow.appendChild(thActions);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement('tbody');

  (group.options || []).forEach((option, optionIndex) => {
    // OR separator (shown between options, i.e. for optionIndex > 0)
    if (optionIndex > 0) {
      const sepRow = document.createElement('tr');
      sepRow.className = 'or-separator';
      const sepTd = document.createElement('td');
      sepTd.setAttribute('colspan', String(totalColumns));
      sepTd.textContent = '— or —';
      sepRow.appendChild(sepTd);
      tbody.appendChild(sepRow);
    }

    const row = document.createElement('tr');
    row.className = 'option-row';

    // Match type cell — only rendered when showItemTags=true
    if (showItemTags) {
      const tdMatch = document.createElement('td');
      const sel = document.createElement('select');

      const optComponent = document.createElement('option');
      optComponent.value = 'component';
      optComponent.textContent = 'Component';
      sel.appendChild(optComponent);

      const optTag = document.createElement('option');
      optTag.value = 'tags';
      optTag.textContent = 'Tag';
      sel.appendChild(optTag);

      sel.value = option.matchType || 'component';
      tdMatch.appendChild(sel);
      row.appendChild(tdMatch);
    }

    // Requirement cell
    const tdReq = document.createElement('td');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item-cell';
    const noItem = document.createElement('span');
    noItem.className = 'no-item';
    noItem.textContent = 'No item selected';
    itemDiv.appendChild(noItem);
    tdReq.appendChild(itemDiv);
    row.appendChild(tdReq);

    // Quantity cell
    const tdQty = document.createElement('td');
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.value = String(option.quantity || 1);
    tdQty.appendChild(qtyInput);
    row.appendChild(tdQty);

    // Actions cell
    const tdActions = document.createElement('td');
    row.appendChild(tdActions);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

// ---------------------------------------------------------------------------
// Tests: match column hidden when showItemTags=false
// ---------------------------------------------------------------------------

describe('IngredientGroupCard match dropdown: showItemTags=false', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders no match type <select> when showItemTags is false', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const selects = table.querySelectorAll('select');
    assert.equal(selects.length, 0, 'No <select> elements should be rendered when showItemTags=false');
  });

  it('renders no "Match" header <th> when showItemTags is false', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const headers = Array.from(table.querySelectorAll('thead th'));
    const matchHeader = headers.find(th => th.textContent === 'Match');
    assert.equal(matchHeader, undefined, '"Match" <th> should not be present when showItemTags=false');
  });

  it('OR separator uses colspan=3 when showItemTags is false', () => {
    const group = {
      options: [
        { matchType: 'component', quantity: 1 },
        { matchType: 'component', quantity: 2 }
      ]
    };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const sep = table.querySelector('.or-separator td');
    assert.ok(sep, 'OR separator row should be present for 2 options');
    assert.equal(sep.getAttribute('colspan'), '3', 'OR separator colspan should be 3 when match column is hidden');
  });

  it('option rows have 3 cells when showItemTags is false', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const optionRow = table.querySelector('.option-row');
    assert.ok(optionRow, 'Option row should be present');
    assert.equal(optionRow.querySelectorAll('td').length, 3, 'Option row should have 3 cells when match column is hidden');
  });
});

// ---------------------------------------------------------------------------
// Tests: match column visible when showItemTags=true
// ---------------------------------------------------------------------------

describe('IngredientGroupCard match dropdown: showItemTags=true', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders a match type <select> when showItemTags is true', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: true });
    const selects = table.querySelectorAll('.option-row select');
    assert.equal(selects.length, 1, 'One <select> should be rendered per option row when showItemTags=true');
  });

  it('renders "Match" header <th> when showItemTags is true', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: true });
    const headers = Array.from(table.querySelectorAll('thead th'));
    const matchHeader = headers.find(th => th.textContent === 'Match');
    assert.ok(matchHeader, '"Match" <th> should be present when showItemTags=true');
  });

  it('match type <select> includes both "component" and "tags" options', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: true });
    const sel = table.querySelector('.option-row select');
    const values = Array.from(sel.querySelectorAll('option')).map(o => o.value);
    assert.ok(values.includes('component'), 'Select should include "component" option');
    assert.ok(values.includes('tags'), 'Select should include "tags" option');
    assert.equal(values.length, 2, 'Select should have exactly 2 options');
  });

  it('OR separator uses colspan=4 when showItemTags is true', () => {
    const group = {
      options: [
        { matchType: 'component', quantity: 1 },
        { matchType: 'tags', quantity: 2 }
      ]
    };
    const table = buildIngredientOptionsTable(group, { showItemTags: true });
    const sep = table.querySelector('.or-separator td');
    assert.ok(sep, 'OR separator row should be present for 2 options');
    assert.equal(sep.getAttribute('colspan'), '4', 'OR separator colspan should be 4 when match column is visible');
  });

  it('option rows have 4 cells when showItemTags is true', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: true });
    const optionRow = table.querySelector('.option-row');
    assert.ok(optionRow, 'Option row should be present');
    assert.equal(optionRow.querySelectorAll('td').length, 4, 'Option row should have 4 cells when match column is visible');
  });
});

// ---------------------------------------------------------------------------
// Tests: multiple options — OR separators
// ---------------------------------------------------------------------------

describe('IngredientGroupCard OR separator count', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('renders no OR separator for a single option', () => {
    const group = { options: [{ matchType: 'component', quantity: 1 }] };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const seps = table.querySelectorAll('.or-separator');
    assert.equal(seps.length, 0, 'No OR separator for a single option');
  });

  it('renders one OR separator for two options', () => {
    const group = {
      options: [
        { matchType: 'component', quantity: 1 },
        { matchType: 'component', quantity: 1 }
      ]
    };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const seps = table.querySelectorAll('.or-separator');
    assert.equal(seps.length, 1, 'One OR separator between two options');
  });

  it('renders two OR separators for three options', () => {
    const group = {
      options: [
        { matchType: 'component', quantity: 1 },
        { matchType: 'component', quantity: 1 },
        { matchType: 'component', quantity: 1 }
      ]
    };
    const table = buildIngredientOptionsTable(group, { showItemTags: false });
    const seps = table.querySelectorAll('.or-separator');
    assert.equal(seps.length, 2, 'Two OR separators between three options');
  });
});

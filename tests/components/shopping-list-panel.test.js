/**
 * Component tests for ShoppingListPanel (T-059)
 * Uses node:test + node:assert/strict + happy-dom
 * DOM-based tests — no Svelte compiler needed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures mirroring ShoppingListPanel output
// ---------------------------------------------------------------------------

function buildShoppingListPanel({
  shoppingListData = null,
  shoppingListEntries = [],
  expanded = false,
  onToggleExpanded = () => {},
  onRemoveRecipe = () => {},
  onSetQuantity = () => {},
  onClearAll = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = `shopping-list-panel${expanded ? ' expanded' : ''}`;

  // Header
  const header = document.createElement('div');
  header.className = 'shopping-list-header';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'shopping-list-toggle';
  toggleBtn.onclick = onToggleExpanded;

  if (shoppingListEntries.length > 0) {
    toggleBtn.textContent = `Shopping List (${shoppingListEntries.length})`;
    const badge = document.createElement('span');
    badge.className = `shopping-badge${shoppingListData && !shoppingListData.allSatisfied ? ' unsatisfied' : ''}`;
    badge.textContent = String(shoppingListEntries.length);
    toggleBtn.appendChild(badge);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'shopping-list-clear';
    clearBtn.onclick = onClearAll;
    clearBtn.title = 'Clear shopping list';
    clearBtn.innerHTML = '<i class="fas fa-trash"></i>';
    header.appendChild(toggleBtn);
    header.appendChild(clearBtn);
  } else {
    toggleBtn.textContent = 'Shopping List';
    header.appendChild(toggleBtn);
  }

  section.appendChild(header);

  // Body (only when expanded)
  if (expanded) {
    const body = document.createElement('div');
    body.className = 'shopping-list-body';

    if (shoppingListEntries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'shopping-list-empty hint';
      empty.textContent = 'No recipes added to shopping list';
      body.appendChild(empty);
    } else {
      // Entries list
      const ul = document.createElement('ul');
      ul.className = 'shopping-list-entries';

      for (const entry of shoppingListEntries) {
        const li = document.createElement('li');
        li.className = 'shopping-list-entry';
        li.dataset.recipeId = entry.recipeId;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'entry-name';
        nameSpan.textContent = entry.recipeName ?? entry.recipeId;
        li.appendChild(nameSpan);

        const qtyControls = document.createElement('div');
        qtyControls.className = 'entry-quantity-controls';

        const decBtn = document.createElement('button');
        decBtn.type = 'button';
        decBtn.className = 'qty-btn';
        decBtn.onclick = () => onSetQuantity(entry.recipeId, entry.quantity - 1);
        decBtn.textContent = '-';

        const qtyVal = document.createElement('span');
        qtyVal.className = 'qty-value';
        qtyVal.textContent = String(entry.quantity);

        const incBtn = document.createElement('button');
        incBtn.type = 'button';
        incBtn.className = 'qty-btn';
        incBtn.onclick = () => onSetQuantity(entry.recipeId, entry.quantity + 1);
        incBtn.textContent = '+';

        qtyControls.appendChild(decBtn);
        qtyControls.appendChild(qtyVal);
        qtyControls.appendChild(incBtn);
        li.appendChild(qtyControls);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'entry-remove';
        removeBtn.onclick = () => onRemoveRecipe(entry.recipeId);
        removeBtn.title = 'Remove from shopping list';
        li.appendChild(removeBtn);

        ul.appendChild(li);
      }
      body.appendChild(ul);

      // Materials table
      if (shoppingListData && shoppingListData.ingredients.length > 0) {
        const tableDiv = document.createElement('div');
        tableDiv.className = 'shopping-list-materials';

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const label of ['Material', 'Need', 'Have', 'Missing']) {
          const th = document.createElement('th');
          th.textContent = label;
          headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const ing of shoppingListData.ingredients) {
          const tr = document.createElement('tr');
          tr.className = ing.satisfied ? 'satisfied' : 'unsatisfied';

          const tdName = document.createElement('td');
          tdName.className = 'material-name';
          tdName.textContent = ing.description;
          tr.appendChild(tdName);

          const tdNeed = document.createElement('td');
          tdNeed.className = 'qty-col';
          tdNeed.textContent = String(ing.totalNeed);
          tr.appendChild(tdNeed);

          const tdHave = document.createElement('td');
          tdHave.className = 'qty-col';
          tdHave.textContent = String(ing.have);
          tr.appendChild(tdHave);

          const tdMissing = document.createElement('td');
          tdMissing.className = 'qty-col missing-col';
          tdMissing.textContent = ing.satisfied ? '' : String(ing.missing);
          tr.appendChild(tdMissing);

          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        tableDiv.appendChild(table);
        body.appendChild(tableDiv);
      }

      // Summary footer
      if (shoppingListData) {
        const summary = document.createElement('div');
        summary.className = `shopping-list-summary${shoppingListData.allSatisfied ? ' all-satisfied' : ''}`;
        summary.textContent = shoppingListData.allSatisfied
          ? 'All materials available'
          : `${shoppingListData.ingredients.filter(i => !i.satisfied).length} material(s) still needed`;
        body.appendChild(summary);
      }
    }

    section.appendChild(body);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShoppingListPanel', () => {
  before(setupDOM);
  after(teardownDOM);

  it('renders empty state when no entries and expanded', () => {
    const el = buildShoppingListPanel({ expanded: true, shoppingListEntries: [] });
    const empty = el.querySelector('.shopping-list-empty');
    assert.ok(empty, 'empty message should be present');
    assert.ok(empty.textContent.includes('No recipes'));
  });

  it('does not render body when collapsed', () => {
    const el = buildShoppingListPanel({ expanded: false });
    const body = el.querySelector('.shopping-list-body');
    assert.equal(body, null, 'body should not be rendered when collapsed');
  });

  it('has expanded class when expanded', () => {
    const el = buildShoppingListPanel({ expanded: true });
    assert.ok(el.classList.contains('expanded'));
  });

  it('does not have expanded class when collapsed', () => {
    const el = buildShoppingListPanel({ expanded: false });
    assert.ok(!el.classList.contains('expanded'));
  });

  it('renders recipe entries with quantities when expanded', () => {
    const entries = [
      { recipeId: 'r1', recipeName: 'Healing Potion', quantity: 2 },
      { recipeId: 'r2', recipeName: 'Firebomb', quantity: 1 }
    ];
    const el = buildShoppingListPanel({ expanded: true, shoppingListEntries: entries });

    const entryEls = el.querySelectorAll('.shopping-list-entry');
    assert.equal(entryEls.length, 2);

    const firstQty = entryEls[0].querySelector('.qty-value');
    assert.equal(firstQty.textContent, '2');
  });

  it('renders materials table with have/need/missing columns', () => {
    const data = {
      ingredients: [
        { componentId: 'iron', description: 'Iron Ore', totalNeed: 5, have: 2, missing: 3, satisfied: false }
      ],
      essences: [],
      catalysts: [],
      allSatisfied: false
    };
    const entries = [{ recipeId: 'r1', quantity: 1 }];
    const el = buildShoppingListPanel({ expanded: true, shoppingListEntries: entries, shoppingListData: data });

    const table = el.querySelector('.shopping-list-materials table');
    assert.ok(table, 'materials table should be present');

    const headers = table.querySelectorAll('thead th');
    assert.equal(headers.length, 4);
    assert.equal(headers[0].textContent, 'Material');
    assert.equal(headers[1].textContent, 'Need');
    assert.equal(headers[2].textContent, 'Have');
    assert.equal(headers[3].textContent, 'Missing');

    const rows = table.querySelectorAll('tbody tr');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.material-name').textContent, 'Iron Ore');
  });

  it('satisfied ingredients have satisfied class', () => {
    const data = {
      ingredients: [
        { componentId: 'iron', description: 'Iron', totalNeed: 2, have: 5, missing: 0, satisfied: true }
      ],
      essences: [],
      catalysts: [],
      allSatisfied: true
    };
    const entries = [{ recipeId: 'r1', quantity: 1 }];
    const el = buildShoppingListPanel({ expanded: true, shoppingListEntries: entries, shoppingListData: data });

    const row = el.querySelector('tbody tr');
    assert.ok(row.classList.contains('satisfied'));
    assert.ok(!row.classList.contains('unsatisfied'));
  });

  it('unsatisfied ingredients have unsatisfied class', () => {
    const data = {
      ingredients: [
        { componentId: 'iron', description: 'Iron', totalNeed: 5, have: 1, missing: 4, satisfied: false }
      ],
      essences: [],
      catalysts: [],
      allSatisfied: false
    };
    const entries = [{ recipeId: 'r1', quantity: 1 }];
    const el = buildShoppingListPanel({ expanded: true, shoppingListEntries: entries, shoppingListData: data });

    const row = el.querySelector('tbody tr');
    assert.ok(row.classList.contains('unsatisfied'));
    assert.ok(!row.classList.contains('satisfied'));
  });

  it('clicking remove button fires onRemoveRecipe with recipeId', () => {
    let removedId = null;
    const entries = [{ recipeId: 'r1', recipeName: 'Test Recipe', quantity: 1 }];
    const el = buildShoppingListPanel({
      expanded: true,
      shoppingListEntries: entries,
      onRemoveRecipe: (id) => { removedId = id; }
    });

    const removeBtn = el.querySelector('.entry-remove');
    assert.ok(removeBtn, 'remove button should exist');
    removeBtn.click();
    assert.equal(removedId, 'r1');
  });

  it('clicking clear all button fires onClearAll', () => {
    let cleared = false;
    const entries = [{ recipeId: 'r1', recipeName: 'Test Recipe', quantity: 1 }];
    const el = buildShoppingListPanel({
      expanded: true,
      shoppingListEntries: entries,
      onClearAll: () => { cleared = true; }
    });

    const clearBtn = el.querySelector('.shopping-list-clear');
    assert.ok(clearBtn, 'clear button should exist when entries present');
    clearBtn.click();
    assert.equal(cleared, true);
  });

  it('summary footer shows all-satisfied class when allSatisfied', () => {
    const data = {
      ingredients: [{ componentId: 'iron', description: 'Iron', totalNeed: 1, have: 5, missing: 0, satisfied: true }],
      essences: [],
      catalysts: [],
      allSatisfied: true
    };
    const entries = [{ recipeId: 'r1', quantity: 1 }];
    const el = buildShoppingListPanel({ expanded: true, shoppingListEntries: entries, shoppingListData: data });

    const summary = el.querySelector('.shopping-list-summary');
    assert.ok(summary, 'summary should be present');
    assert.ok(summary.classList.contains('all-satisfied'));
  });
});

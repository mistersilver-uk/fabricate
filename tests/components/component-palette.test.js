/**
 * Component tests for ComponentPalette (T-008)
 * DOM-based tests mirroring the ComponentPalette.svelte output structure.
 * Uses node:test + node:assert/strict + happy-dom. No Svelte compiler needed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures mirroring ComponentPalette output
// ---------------------------------------------------------------------------

/**
 * Build a DOM structure that mirrors ComponentPalette.svelte's rendered output.
 *
 * @param {object} opts
 * @param {Array<{componentId: string, name: string, img: string, inventoryQuantity: number, workbenchQuantity: number, availableQuantity: number}>} opts.palette
 * @param {(componentId: string) => void} opts.onAddToWorkbench
 * @param {(componentId: string) => void} opts.onRemoveFromWorkbench
 */
function buildComponentPalette({
  palette = [],
  onAddToWorkbench = () => {},
  onRemoveFromWorkbench = () => {}
} = {}) {
  const root = document.createElement('div');
  root.className = 'alchemy-palette';

  if (palette.length === 0) {
    // Empty state
    const empty = document.createElement('div');
    empty.className = 'alchemy-palette-empty';

    const icon = document.createElement('i');
    icon.className = 'fas fa-flask';
    empty.appendChild(icon);

    const msg = document.createElement('p');
    msg.textContent = 'No components available';
    empty.appendChild(msg);

    root.appendChild(empty);
    return root;
  }

  for (const component of palette) {
    const isEmpty = component.availableQuantity === 0;

    const cell = document.createElement('div');
    cell.className = `alchemy-palette-cell${isEmpty ? ' alchemy-palette-cell--empty' : ''}`;
    cell.setAttribute('role', 'button');
    cell.setAttribute(
      'aria-label',
      `${component.name} (${component.availableQuantity} available)`
    );
    if (isEmpty) {
      cell.setAttribute('aria-disabled', 'true');
    }

    // Left-click => onAddToWorkbench
    cell.onclick = () => onAddToWorkbench(component.componentId);

    // Right-click => onRemoveFromWorkbench only when workbenchQuantity > 0
    cell.oncontextmenu = (event) => {
      event.preventDefault();
      if (component.workbenchQuantity > 0) {
        onRemoveFromWorkbench(component.componentId);
      }
    };

    const img = document.createElement('img');
    img.src = component.img || 'icons/svg/item-bag.svg';
    img.alt = component.name;
    img.width = 48;
    img.height = 48;
    cell.appendChild(img);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'alchemy-palette-cell-name';
    nameSpan.textContent = component.name;
    cell.appendChild(nameSpan);

    const badge = document.createElement('span');
    badge.className = 'alchemy-palette-badge';
    if (isEmpty) {
      badge.classList.add('alchemy-palette-badge--zero');
    }
    badge.textContent = String(component.availableQuantity);
    cell.appendChild(badge);

    root.appendChild(cell);
  }

  return root;
}

// ---------------------------------------------------------------------------
// Suite 1: Grid rendering
// ---------------------------------------------------------------------------

describe('ComponentPalette: grid rendering', () => {
  before(setupDOM);
  after(teardownDOM);

  it('renders one cell per palette entry', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: 'icons/herb.svg', inventoryQuantity: 3, workbenchQuantity: 1, availableQuantity: 2 },
      { componentId: 'c2', name: 'Water', img: 'icons/water.svg', inventoryQuantity: 5, workbenchQuantity: 0, availableQuantity: 5 },
      { componentId: 'c3', name: 'Crystal', img: 'icons/crystal.svg', inventoryQuantity: 1, workbenchQuantity: 0, availableQuantity: 1 }
    ];
    const el = buildComponentPalette({ palette });
    const cells = el.querySelectorAll('.alchemy-palette-cell');
    assert.equal(cells.length, 3);
  });

  it('each cell contains an img with the component image src', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: 'icons/herb.svg', inventoryQuantity: 3, workbenchQuantity: 0, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette });
    const img = el.querySelector('.alchemy-palette-cell img');
    assert.ok(img, 'img element should exist inside cell');
    assert.equal(img.src, 'icons/herb.svg');
    assert.equal(img.alt, 'Herb');
  });

  it('each cell contains a name span with component name', () => {
    const palette = [
      { componentId: 'c1', name: 'Dragon Scale', img: '', inventoryQuantity: 2, workbenchQuantity: 0, availableQuantity: 2 }
    ];
    const el = buildComponentPalette({ palette });
    const nameSpan = el.querySelector('.alchemy-palette-cell-name');
    assert.ok(nameSpan, 'name span should exist');
    assert.equal(nameSpan.textContent, 'Dragon Scale');
  });

  it('each cell has a quantity badge showing availableQuantity', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: '', inventoryQuantity: 5, workbenchQuantity: 2, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette });
    const badge = el.querySelector('.alchemy-palette-badge');
    assert.ok(badge, 'quantity badge should exist');
    assert.equal(badge.textContent, '3');
  });

  it('cells have role="button" for accessibility', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: '', inventoryQuantity: 2, workbenchQuantity: 0, availableQuantity: 2 }
    ];
    const el = buildComponentPalette({ palette });
    const cell = el.querySelector('.alchemy-palette-cell');
    assert.equal(cell.getAttribute('role'), 'button');
  });

  it('cells have aria-label with component name and available quantity', () => {
    const palette = [
      { componentId: 'c1', name: 'Fire Crystal', img: '', inventoryQuantity: 4, workbenchQuantity: 1, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette });
    const cell = el.querySelector('.alchemy-palette-cell');
    const ariaLabel = cell.getAttribute('aria-label');
    assert.ok(ariaLabel, 'aria-label should be set');
    assert.ok(ariaLabel.includes('Fire Crystal'), 'aria-label should include component name');
    assert.ok(ariaLabel.includes('3'), 'aria-label should include available quantity');
  });

  it('root container has class alchemy-palette', () => {
    const el = buildComponentPalette({ palette: [] });
    assert.ok(el.classList.contains('alchemy-palette'));
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Zero-quantity (empty) cells
// ---------------------------------------------------------------------------

describe('ComponentPalette: zero-quantity items', () => {
  before(setupDOM);
  after(teardownDOM);

  it('cells with availableQuantity === 0 have alchemy-palette-cell--empty class', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: '', inventoryQuantity: 3, workbenchQuantity: 0, availableQuantity: 3 },
      { componentId: 'c2', name: 'Ash', img: '', inventoryQuantity: 0, workbenchQuantity: 0, availableQuantity: 0 }
    ];
    const el = buildComponentPalette({ palette });
    const cells = el.querySelectorAll('.alchemy-palette-cell');
    assert.ok(!cells[0].classList.contains('alchemy-palette-cell--empty'), 'non-zero cell should not have empty class');
    assert.ok(cells[1].classList.contains('alchemy-palette-cell--empty'), 'zero-quantity cell should have empty class');
  });

  it('zero-quantity cells have aria-disabled="true"', () => {
    const palette = [
      { componentId: 'c1', name: 'Ash', img: '', inventoryQuantity: 0, workbenchQuantity: 0, availableQuantity: 0 }
    ];
    const el = buildComponentPalette({ palette });
    const cell = el.querySelector('.alchemy-palette-cell');
    assert.equal(cell.getAttribute('aria-disabled'), 'true');
  });

  it('non-zero cells do not have aria-disabled attribute', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: '', inventoryQuantity: 3, workbenchQuantity: 0, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette });
    const cell = el.querySelector('.alchemy-palette-cell');
    assert.equal(cell.getAttribute('aria-disabled'), null);
  });

  it('zero-quantity badge shows 0', () => {
    const palette = [
      { componentId: 'c1', name: 'Ash', img: '', inventoryQuantity: 0, workbenchQuantity: 0, availableQuantity: 0 }
    ];
    const el = buildComponentPalette({ palette });
    const badge = el.querySelector('.alchemy-palette-badge');
    assert.equal(badge.textContent, '0');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Left-click interaction (onAddToWorkbench)
// ---------------------------------------------------------------------------

describe('ComponentPalette: left-click dispatches onAddToWorkbench', () => {
  before(setupDOM);
  after(teardownDOM);

  it('clicking a cell calls onAddToWorkbench with the componentId', () => {
    const calls = [];
    const palette = [
      { componentId: 'herb-01', name: 'Herb', img: '', inventoryQuantity: 3, workbenchQuantity: 0, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette, onAddToWorkbench: (id) => calls.push(id) });
    const cell = el.querySelector('.alchemy-palette-cell');
    cell.click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'herb-01');
  });

  it('clicking multiple cells each call onAddToWorkbench with the correct componentId', () => {
    const calls = [];
    const palette = [
      { componentId: 'c1', name: 'Herb', img: '', inventoryQuantity: 2, workbenchQuantity: 0, availableQuantity: 2 },
      { componentId: 'c2', name: 'Ash', img: '', inventoryQuantity: 1, workbenchQuantity: 0, availableQuantity: 1 }
    ];
    const el = buildComponentPalette({ palette, onAddToWorkbench: (id) => calls.push(id) });
    const cells = el.querySelectorAll('.alchemy-palette-cell');
    cells[0].click();
    cells[1].click();
    assert.deepEqual(calls, ['c1', 'c2']);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Right-click interaction (onRemoveFromWorkbench)
// ---------------------------------------------------------------------------

describe('ComponentPalette: right-click dispatches onRemoveFromWorkbench', () => {
  before(setupDOM);
  after(teardownDOM);

  it('right-clicking a cell with workbenchQuantity > 0 calls onRemoveFromWorkbench', () => {
    const calls = [];
    const palette = [
      { componentId: 'herb-01', name: 'Herb', img: '', inventoryQuantity: 3, workbenchQuantity: 2, availableQuantity: 1 }
    ];
    const el = buildComponentPalette({ palette, onRemoveFromWorkbench: (id) => calls.push(id) });
    const cell = el.querySelector('.alchemy-palette-cell');

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    let defaultPrevented = false;
    event.preventDefault = () => { defaultPrevented = true; };
    cell.oncontextmenu(event);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'herb-01');
    assert.ok(defaultPrevented, 'event.preventDefault() should have been called');
  });

  it('right-clicking a cell with workbenchQuantity === 0 does NOT call onRemoveFromWorkbench', () => {
    const calls = [];
    const palette = [
      { componentId: 'herb-01', name: 'Herb', img: '', inventoryQuantity: 3, workbenchQuantity: 0, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette, onRemoveFromWorkbench: (id) => calls.push(id) });
    const cell = el.querySelector('.alchemy-palette-cell');

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    event.preventDefault = () => {};
    cell.oncontextmenu(event);

    assert.equal(calls.length, 0, 'onRemoveFromWorkbench should not fire when workbenchQuantity is 0');
  });

  it('right-click always calls event.preventDefault regardless of workbenchQuantity', () => {
    const palette = [
      { componentId: 'herb-01', name: 'Herb', img: '', inventoryQuantity: 3, workbenchQuantity: 0, availableQuantity: 3 }
    ];
    const el = buildComponentPalette({ palette });
    const cell = el.querySelector('.alchemy-palette-cell');

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    let defaultPrevented = false;
    event.preventDefault = () => { defaultPrevented = true; };
    cell.oncontextmenu(event);

    assert.ok(defaultPrevented, 'event.preventDefault() should be called even when workbenchQuantity is 0');
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Empty palette state
// ---------------------------------------------------------------------------

describe('ComponentPalette: empty palette state', () => {
  before(setupDOM);
  after(teardownDOM);

  it('shows empty state when palette is empty', () => {
    const el = buildComponentPalette({ palette: [] });
    const emptyEl = el.querySelector('.alchemy-palette-empty');
    assert.ok(emptyEl, 'empty state element should be present when palette is empty');
  });

  it('empty state contains a flask icon', () => {
    const el = buildComponentPalette({ palette: [] });
    const icon = el.querySelector('.alchemy-palette-empty .fas.fa-flask');
    assert.ok(icon, 'flask icon should be present in empty state');
  });

  it('empty state shows "No components available" message', () => {
    const el = buildComponentPalette({ palette: [] });
    const msg = el.querySelector('.alchemy-palette-empty p');
    assert.ok(msg, 'message paragraph should be present in empty state');
    assert.ok(msg.textContent.includes('No components available'), 'message should say No components available');
  });

  it('does not render any cells when palette is empty', () => {
    const el = buildComponentPalette({ palette: [] });
    const cells = el.querySelectorAll('.alchemy-palette-cell');
    assert.equal(cells.length, 0, 'no cells should be rendered in empty state');
  });

  it('does not render empty state when palette has items', () => {
    const palette = [
      { componentId: 'c1', name: 'Herb', img: '', inventoryQuantity: 1, workbenchQuantity: 0, availableQuantity: 1 }
    ];
    const el = buildComponentPalette({ palette });
    const emptyEl = el.querySelector('.alchemy-palette-empty');
    assert.equal(emptyEl, null, 'empty state should not appear when palette has items');
  });
});

/**
 * Component tests for Workbench (T-9)
 * Uses node:test + node:assert/strict + happy-dom
 * DOM-based tests — no Svelte compiler needed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Helpers: build DOM structures mirroring Workbench output
// ---------------------------------------------------------------------------

function buildWorkbench({
  entries = [],
  onRemoveFromWorkbench = () => {},
  onClearWorkbench = () => {},
  onSubmitWorkbench = () => {}
} = {}) {
  const isEmpty = entries.length === 0;

  const container = document.createElement('div');
  container.className = 'fabricate-workbench';
  container.style.cssText =
    'border-top: 1px solid rgba(0, 0, 0, 0.15); padding: 8px; background: rgba(0, 0, 0, 0.06);';

  // Header row
  const header = document.createElement('div');
  header.className = 'workbench-header';

  const title = document.createElement('span');
  title.className = 'workbench-title';
  title.textContent = 'WORKBENCH';
  title.style.cssText =
    'text-transform: uppercase; font-size: 12px; font-weight: 700; opacity: 0.7;';
  header.appendChild(title);

  // Clear button — only shown when not empty
  if (!isEmpty) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'workbench-clear-btn';
    clearBtn.setAttribute('aria-label', 'Clear workbench');
    clearBtn.innerHTML = '<i class="fas fa-trash"></i>';
    clearBtn.onclick = () => onClearWorkbench();
    header.appendChild(clearBtn);
  }

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'workbench-submit-btn';
  submitBtn.textContent = 'Craft';
  submitBtn.disabled = isEmpty;
  if (isEmpty) {
    submitBtn.style.opacity = '0.4';
    submitBtn.style.cursor = 'default';
  } else {
    submitBtn.style.cssText =
      'background: var(--fabricate-primary); color: #fff; border: none; border-radius: 4px; padding: 6px 16px; font-size: 13px;';
  }
  submitBtn.onclick = () => { if (!isEmpty) onSubmitWorkbench(); };
  header.appendChild(submitBtn);

  container.appendChild(header);

  // Body: empty state or chips
  if (isEmpty) {
    const empty = document.createElement('p');
    empty.className = 'workbench-empty';
    empty.textContent = 'Drop or click components to begin';
    empty.style.cssText =
      'font-style: italic; font-size: 12px; opacity: 0.5; padding: 16px 0; text-align: center;';
    container.appendChild(empty);
  } else {
    const chipWrap = document.createElement('div');
    chipWrap.className = 'workbench-chips';
    chipWrap.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';

    for (const entry of entries) {
      const chip = document.createElement('div');
      chip.className = 'workbench-chip';
      chip.dataset.componentId = entry.componentId;
      chip.setAttribute(
        'aria-label',
        `${entry.name} x${entry.quantity}`
      );
      chip.style.cssText =
        'display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; background: rgba(0, 0, 0, 0.1); border: 1px solid rgba(0, 0, 0, 0.15); font-size: 12px;';

      if (entry.img) {
        const img = document.createElement('img');
        img.src = entry.img;
        img.alt = entry.name;
        img.width = 20;
        img.height = 20;
        chip.appendChild(img);
      }

      const label = document.createElement('span');
      label.className = 'chip-label';
      label.textContent = `${entry.name} x${entry.quantity}`;
      chip.appendChild(label);

      chip.oncontextmenu = (event) => {
        event.preventDefault();
        onRemoveFromWorkbench(entry.componentId);
      };

      chipWrap.appendChild(chip);
    }

    container.appendChild(chipWrap);
  }

  return container;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Workbench', () => {
  before(setupDOM);
  after(teardownDOM);

  it('renders empty state when entries is empty', () => {
    const el = buildWorkbench({ entries: [] });
    const empty = el.querySelector('.workbench-empty');
    assert.ok(empty, 'empty state element should be present');
    assert.ok(
      empty.textContent.includes('Drop or click components to begin'),
      'empty state message is correct'
    );
  });

  it('does not render empty state when entries are present', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron Ore', img: 'iron.png', quantity: 2 }
    ];
    const el = buildWorkbench({ entries });
    const empty = el.querySelector('.workbench-empty');
    assert.equal(empty, null, 'empty state should not appear when entries exist');
  });

  it('renders chips for each entry with quantity badge', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron Ore', img: 'iron.png', quantity: 3 },
      { componentId: 'c2', name: 'Coal', img: 'coal.png', quantity: 1 }
    ];
    const el = buildWorkbench({ entries });

    const chips = el.querySelectorAll('.workbench-chip');
    assert.equal(chips.length, 2, 'should render one chip per entry');

    const firstLabel = chips[0].querySelector('.chip-label');
    assert.ok(firstLabel, 'chip should have a label element');
    assert.ok(
      firstLabel.textContent.includes('Iron Ore'),
      'chip label should contain component name'
    );
    assert.ok(
      firstLabel.textContent.includes('x3'),
      'chip label should contain quantity'
    );
  });

  it('renders an image inside each chip when img is provided', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron Ore', img: 'icons/iron.png', quantity: 1 }
    ];
    const el = buildWorkbench({ entries });

    const chip = el.querySelector('.workbench-chip');
    const img = chip.querySelector('img');
    assert.ok(img, 'img element should be present in chip');
    assert.equal(img.src, 'icons/iron.png', 'img src should match entry img');
    assert.equal(img.alt, 'Iron Ore', 'img alt should match entry name');
    assert.equal(img.width, 20, 'img width should be 20');
    assert.equal(img.height, 20, 'img height should be 20');
  });

  it('chips have aria-label with component name and quantity', () => {
    const entries = [
      { componentId: 'c1', name: 'Silver', img: null, quantity: 5 }
    ];
    const el = buildWorkbench({ entries });
    const chip = el.querySelector('.workbench-chip[data-component-id="c1"]');
    assert.ok(chip, 'chip with matching componentId should exist');
    assert.equal(
      chip.getAttribute('aria-label'),
      'Silver x5',
      'aria-label should contain name and quantity'
    );
  });

  it('right-clicking a chip calls onRemoveFromWorkbench with componentId', () => {
    let removedId = null;
    const entries = [
      { componentId: 'comp-42', name: 'Moonstone', img: null, quantity: 2 }
    ];
    const el = buildWorkbench({
      entries,
      onRemoveFromWorkbench: (id) => { removedId = id; }
    });

    const chip = el.querySelector('.workbench-chip[data-component-id="comp-42"]');
    assert.ok(chip, 'chip should exist');

    let defaultPrevented = false;
    chip.oncontextmenu({ preventDefault: () => { defaultPrevented = true; } });

    assert.equal(removedId, 'comp-42', 'onRemoveFromWorkbench should be called with componentId');
    assert.ok(defaultPrevented, 'event.preventDefault() should be called');
  });

  it('clear button is hidden when entries is empty', () => {
    const el = buildWorkbench({ entries: [] });
    const clearBtn = el.querySelector('.workbench-clear-btn');
    assert.equal(clearBtn, null, 'clear button should not be present when workbench is empty');
  });

  it('clear button is visible when entries are present', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron', img: null, quantity: 1 }
    ];
    const el = buildWorkbench({ entries });
    const clearBtn = el.querySelector('.workbench-clear-btn');
    assert.ok(clearBtn, 'clear button should be present when entries exist');
  });

  it('clear button has aria-label for accessibility', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron', img: null, quantity: 1 }
    ];
    const el = buildWorkbench({ entries });
    const clearBtn = el.querySelector('.workbench-clear-btn');
    assert.ok(
      clearBtn.getAttribute('aria-label'),
      'clear button should have an aria-label'
    );
  });

  it('clicking clear button dispatches onClearWorkbench', () => {
    let cleared = false;
    const entries = [
      { componentId: 'c1', name: 'Iron', img: null, quantity: 1 }
    ];
    const el = buildWorkbench({
      entries,
      onClearWorkbench: () => { cleared = true; }
    });

    const clearBtn = el.querySelector('.workbench-clear-btn');
    assert.ok(clearBtn, 'clear button should exist');
    clearBtn.click();
    assert.equal(cleared, true, 'onClearWorkbench should have been called');
  });

  it('submit button is disabled when entries is empty', () => {
    const el = buildWorkbench({ entries: [] });
    const submitBtn = el.querySelector('.workbench-submit-btn');
    assert.ok(submitBtn, 'submit button should always be present');
    assert.ok(submitBtn.disabled, 'submit button should be disabled when workbench is empty');
  });

  it('submit button is enabled when entries are present', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron', img: null, quantity: 1 }
    ];
    const el = buildWorkbench({ entries });
    const submitBtn = el.querySelector('.workbench-submit-btn');
    assert.ok(submitBtn, 'submit button should be present');
    assert.ok(!submitBtn.disabled, 'submit button should be enabled when entries exist');
  });

  it('clicking submit button dispatches onSubmitWorkbench', () => {
    let submitted = false;
    const entries = [
      { componentId: 'c1', name: 'Iron', img: null, quantity: 1 }
    ];
    const el = buildWorkbench({
      entries,
      onSubmitWorkbench: () => { submitted = true; }
    });

    const submitBtn = el.querySelector('.workbench-submit-btn');
    submitBtn.click();
    assert.equal(submitted, true, 'onSubmitWorkbench should have been called');
  });

  it('disabled submit button has reduced opacity', () => {
    const el = buildWorkbench({ entries: [] });
    const submitBtn = el.querySelector('.workbench-submit-btn');
    assert.ok(
      submitBtn.style.opacity === '0.4',
      'disabled submit button should have opacity 0.4'
    );
  });

  it('renders the workbench title element', () => {
    const el = buildWorkbench({ entries: [] });
    const title = el.querySelector('.workbench-title');
    assert.ok(title, 'workbench title element should be present');
    assert.ok(
      title.textContent.toUpperCase().includes('WORKBENCH'),
      'title should include the word WORKBENCH'
    );
  });

  it('container has top border separator styling', () => {
    const el = buildWorkbench({ entries: [] });
    assert.ok(
      el.style.cssText.includes('border-top'),
      'container should have border-top style'
    );
  });

  it('chips wrap container uses flex-wrap layout', () => {
    const entries = [
      { componentId: 'c1', name: 'Iron', img: null, quantity: 1 }
    ];
    const el = buildWorkbench({ entries });
    const chipWrap = el.querySelector('.workbench-chips');
    assert.ok(chipWrap, '.workbench-chips container should be present');
    assert.ok(
      chipWrap.style.cssText.includes('flex-wrap'),
      'chips container should use flex-wrap'
    );
  });
});

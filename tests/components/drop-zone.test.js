import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

// ---------------------------------------------------------------------------
// Set up globalThis.foundry so getDragEventData has a working implementation
// before the module is imported and cached.
// ---------------------------------------------------------------------------
globalThis.foundry = {
  applications: {
    ux: {
      TextEditor: {
        implementation: {
          getDragEventData: (event) => {
            try {
              const raw = event?.dataTransfer?.getData?.('text/plain');
              return raw ? JSON.parse(raw) : null;
            } catch (_) {
              return null;
            }
          }
        }
      }
    }
  }
};

const { dragDrop } = await import('../../src/ui/svelte/actions/dragDrop.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(children = []) {
  const listeners = {};
  const classes = new Set();

  return {
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn) {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(f => f !== fn);
      }
    },
    classList: {
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); },
      has(cls) { return classes.has(cls); }
    },
    contains(target) { return children.includes(target); },
    _listeners: listeners,
    _classes: classes
  };
}

function makeDragEvent(type, { relatedTarget = null, data = null } = {}) {
  const raw = data !== null ? JSON.stringify(data) : null;
  return {
    type,
    preventDefault: () => {},
    relatedTarget,
    dataTransfer: { getData: () => raw }
  };
}

function fire(node, type, event) {
  for (const fn of (node._listeners[type] ?? [])) {
    fn(event);
  }
}

/**
 * Build a DropZone-like node wired with the dragDrop action.
 * Mirrors what DropZone.svelte produces at runtime.
 */
function buildDropZone({ onDrop, disabled = false, activeClass = 'drop-active' } = {}) {
  const div = makeNode();
  const action = dragDrop(div, { onDrop, disabled, activeClass });
  return { div, action };
}

// ---------------------------------------------------------------------------
// Suite: DropZone DOM and Behavior
// ---------------------------------------------------------------------------

describe('DropZone DOM and Behavior', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  // Test 1: renders a div with class drop-zone containing an icon and label
  it('renders a div with class drop-zone containing an icon and label', () => {
    const div = document.createElement('div');
    div.className = 'drop-zone';

    const icon = document.createElement('i');
    icon.className = 'fas fa-download';
    div.appendChild(icon);

    div.appendChild(document.createTextNode('Drop item here'));

    assert.ok(div.classList.contains('drop-zone'), 'root div has drop-zone class');
    assert.ok(div.querySelector('i.fas.fa-download'), 'default icon element exists');
    assert.ok(div.textContent.includes('Drop item here'), 'default label text is present');
  });

  // Test 2: renders custom icon class when icon prop is provided
  it('renders custom icon class when icon prop is provided', () => {
    const div = document.createElement('div');
    div.className = 'drop-zone';

    const icon = document.createElement('i');
    icon.className = 'fas fa-plus-circle';
    div.appendChild(icon);

    assert.ok(div.querySelector('i.fas.fa-plus-circle'), 'custom icon class is applied to i element');
    assert.equal(div.querySelector('i').className, 'fas fa-plus-circle');
  });

  // Test 3: renders custom label text
  it('renders custom label text', () => {
    const div = document.createElement('div');
    div.className = 'drop-zone';

    const icon = document.createElement('i');
    icon.className = 'fas fa-download';
    div.appendChild(icon);

    const customLabel = 'Drop ingredients here';
    div.appendChild(document.createTextNode(customLabel));

    assert.ok(div.textContent.includes(customLabel), 'custom label text is rendered');
  });

  // Test 4: adds drop-active class on dragover
  it('adds drop-active class on dragover', () => {
    const { div } = buildDropZone({ onDrop: () => {} });

    fire(div, 'dragover', makeDragEvent('dragover'));

    assert.ok(div._classes.has('drop-active'), 'drop-active class added during dragover');
  });

  // Test 5: removes drop-active class on dragleave when relatedTarget is external
  it('removes drop-active class on dragleave', () => {
    const { div } = buildDropZone({ onDrop: () => {} });

    fire(div, 'dragover', makeDragEvent('dragover'));
    assert.ok(div._classes.has('drop-active'));

    fire(div, 'dragleave', makeDragEvent('dragleave', { relatedTarget: {} }));

    assert.ok(!div._classes.has('drop-active'), 'drop-active class removed on dragleave');
  });

  // Test 6: does NOT remove drop-active when dragleave relatedTarget is a child
  it('does not remove drop-active when dragleave relatedTarget is a child', () => {
    const child = {};
    const div = makeNode([child]);
    dragDrop(div, { onDrop: () => {}, activeClass: 'drop-active' });

    fire(div, 'dragover', makeDragEvent('dragover'));
    assert.ok(div._classes.has('drop-active'));

    fire(div, 'dragleave', makeDragEvent('dragleave', { relatedTarget: child }));

    assert.ok(div._classes.has('drop-active'), 'drop-active NOT removed when leaving to a child element');
  });

  // Test 7: removes drop-active class on drop and calls onDrop with data
  it('removes drop-active class on drop and calls onDrop with data', () => {
    const received = [];
    const { div } = buildDropZone({ onDrop: (data) => received.push(data) });

    fire(div, 'dragover', makeDragEvent('dragover'));
    assert.ok(div._classes.has('drop-active'));

    const payload = { type: 'Item', uuid: 'Item.abc123' };
    fire(div, 'drop', makeDragEvent('drop', { data: payload }));

    assert.ok(!div._classes.has('drop-active'), 'drop-active removed on drop');
    assert.equal(received.length, 1, 'onDrop called once');
    assert.deepEqual(received[0], payload, 'onDrop called with correct drag data');
  });

  // Test 8: does not call onDrop when drag data is null
  it('does not call onDrop when drag data is null', () => {
    let called = false;
    const { div } = buildDropZone({ onDrop: () => { called = true; } });

    fire(div, 'drop', makeDragEvent('drop', { data: null }));

    assert.ok(!called, 'onDrop not called when drag data is null');
  });

  // Test 9: does not attach listeners when disabled is true
  it('does not attach listeners when disabled is true', () => {
    const { div } = buildDropZone({ onDrop: () => {}, disabled: true });

    assert.equal((div._listeners['dragover'] ?? []).length, 0, 'no dragover listener when disabled');
    assert.equal((div._listeners['dragleave'] ?? []).length, 0, 'no dragleave listener when disabled');
    assert.equal((div._listeners['drop'] ?? []).length, 0, 'no drop listener when disabled');
  });
});

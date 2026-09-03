import test from 'node:test';
import assert from 'node:assert/strict';

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

const { dragDrop } = await import('../src/ui/svelte/actions/dragDrop.js');

// ---------------------------------------------------------------------------
// Mock DOM node factory
// ---------------------------------------------------------------------------

function makeNode(children = []) {
  const listeners = {};
  const classes = new Set();

  const node = {
    // Listener tracking
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn) {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(f => f !== fn);
      }
    },
    // classList mock
    classList: {
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); },
      has(cls) { return classes.has(cls); }
    },
    // contains: returns true if relatedTarget is in children array
    contains(target) { return children.includes(target); },
    // Expose internals for assertions
    _listeners: listeners,
    _classes: classes
  };

  return node;
}

function makeDragEvent(type, { relatedTarget = null, data = null } = {}) {
  const raw = data !== null ? JSON.stringify(data) : null;
  return {
    type,
    preventDefault: () => {},
    relatedTarget,
    dataTransfer: {
      getData: () => raw
    }
  };
}

function fire(node, type, event) {
  for (const fn of (node._listeners[type] ?? [])) {
    fn(event);
  }
}

// ---------------------------------------------------------------------------
// Test 1: Attaches dragover, dragleave, drop listeners on init
// ---------------------------------------------------------------------------
test('attaches dragover, dragleave, and drop listeners on init', () => {
  const node = makeNode();
  dragDrop(node, { onDrop: () => {} });

  assert.equal(node._listeners['dragover']?.length, 1);
  assert.equal(node._listeners['dragleave']?.length, 1);
  assert.equal(node._listeners['drop']?.length, 1);
});

// ---------------------------------------------------------------------------
// Test 2: Dragover adds activeClass to node
// ---------------------------------------------------------------------------
test('dragover adds activeClass to node classList', () => {
  const node = makeNode();
  dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

  fire(node, 'dragover', makeDragEvent('dragover'));

  assert.ok(node._classes.has('drop-active'));
});

// ---------------------------------------------------------------------------
// Test 3: Dragleave removes activeClass when truly leaving node
// ---------------------------------------------------------------------------
test('dragleave removes activeClass when relatedTarget is outside node', () => {
  const node = makeNode(); // no children — contains() always false
  dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

  fire(node, 'dragover', makeDragEvent('dragover'));
  assert.ok(node._classes.has('drop-active'));

  fire(node, 'dragleave', makeDragEvent('dragleave', { relatedTarget: {} }));
  assert.ok(!node._classes.has('drop-active'));
});

// ---------------------------------------------------------------------------
// Test 4: Dragleave does NOT remove class when relatedTarget is a child
// ---------------------------------------------------------------------------
test('dragleave does not remove activeClass when relatedTarget is a child of node', () => {
  const child = {};
  const node = makeNode([child]); // contains(child) === true
  dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

  fire(node, 'dragover', makeDragEvent('dragover'));
  assert.ok(node._classes.has('drop-active'));

  fire(node, 'dragleave', makeDragEvent('dragleave', { relatedTarget: child }));
  // Class should still be present — we're hovering over a child, not leaving.
  assert.ok(node._classes.has('drop-active'));
});

// ---------------------------------------------------------------------------
// Test 5: Drop removes activeClass and calls onDrop with extracted data
// ---------------------------------------------------------------------------
test('drop removes activeClass and calls onDrop with the extracted drag data', () => {
  const node = makeNode();
  const received = [];
  dragDrop(node, { onDrop: (data) => received.push(data), activeClass: 'drop-active' });

  fire(node, 'dragover', makeDragEvent('dragover'));
  assert.ok(node._classes.has('drop-active'));

  const payload = { type: 'Item', uuid: 'Item.abc123' };
  fire(node, 'drop', makeDragEvent('drop', { data: payload }));

  assert.ok(!node._classes.has('drop-active'), 'activeClass removed on drop');
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], payload);
});

// ---------------------------------------------------------------------------
// Test 6: Drop with null drag data does not call onDrop
// ---------------------------------------------------------------------------
test('drop with null drag data does not call onDrop', () => {
  const node = makeNode();
  let called = false;
  dragDrop(node, { onDrop: () => { called = true; } });

  // data: null means getDragEventData returns null
  fire(node, 'drop', makeDragEvent('drop', { data: null }));

  assert.ok(!called);
});

// ---------------------------------------------------------------------------
// Test 7: Drop with no onDrop callback does not throw
// ---------------------------------------------------------------------------
test('drop with no onDrop callback does not throw', () => {
  const node = makeNode();
  dragDrop(node, {}); // no onDrop

  const payload = { type: 'Item' };
  assert.doesNotThrow(() => {
    fire(node, 'drop', makeDragEvent('drop', { data: payload }));
  });
});

// ---------------------------------------------------------------------------
// Test 8: disabled=true prevents listener attachment
// ---------------------------------------------------------------------------
test('disabled=true prevents listener attachment', () => {
  const node = makeNode();
  dragDrop(node, { onDrop: () => {}, disabled: true });

  assert.equal((node._listeners['dragover'] ?? []).length, 0);
  assert.equal((node._listeners['dragleave'] ?? []).length, 0);
  assert.equal((node._listeners['drop'] ?? []).length, 0);
});

// ---------------------------------------------------------------------------
// Test 9: update() toggles listeners when disabled changes
// ---------------------------------------------------------------------------
test('update toggles listeners when disabled changes', () => {
  const node = makeNode();
  const action = dragDrop(node, { onDrop: () => {}, disabled: false });

  // Initially attached
  assert.equal(node._listeners['drop']?.length, 1);

  // Disable — listeners removed
  action.update({ onDrop: () => {}, disabled: true });
  assert.equal((node._listeners['drop'] ?? []).length, 0);

  // Re-enable — listeners re-attached
  action.update({ onDrop: () => {}, disabled: false });
  assert.equal(node._listeners['drop']?.length, 1);
});

// ---------------------------------------------------------------------------
// Test 10: destroy() removes all listeners and clears activeClass
// ---------------------------------------------------------------------------
test('destroy removes all listeners and clears activeClass', () => {
  const node = makeNode();
  const action = dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

  // Add class first
  fire(node, 'dragover', makeDragEvent('dragover'));
  assert.ok(node._classes.has('drop-active'));

  action.destroy();

  assert.equal((node._listeners['dragover'] ?? []).length, 0);
  assert.equal((node._listeners['dragleave'] ?? []).length, 0);
  assert.equal((node._listeners['drop'] ?? []).length, 0);
  assert.ok(!node._classes.has('drop-active'), 'activeClass cleared on destroy');
});

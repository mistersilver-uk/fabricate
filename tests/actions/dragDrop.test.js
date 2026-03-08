/**
 * Unit tests for src/ui/svelte/actions/dragDrop.js
 *
 * The dragDrop export is a plain Svelte action (a function that operates on a
 * DOM element). It can be tested in Node by supplying a mock element and mock
 * drag events — no browser or Svelte compiler is needed.
 *
 * getDragEventData delegates to globalThis.foundry.applications.ux.TextEditor
 * .implementation.getDragEventData, so we install that on globalThis before
 * importing the module.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Install the Foundry global that getDragEventData requires.
// Must be done before the module is imported so the cached import sees it.
// ---------------------------------------------------------------------------
globalThis.foundry = {
  applications: {
    ux: {
      TextEditor: {
        implementation: {
          getDragEventData(event) {
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

/**
 * Creates a minimal mock DOM node.
 *
 * @param {Array} [children=[]] Objects treated as child nodes by contains().
 */
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
      add(cls)           { classes.add(cls); },
      remove(cls)        { classes.delete(cls); },
      contains(cls)      { return classes.has(cls); },
      has(cls)           { return classes.has(cls); }
    },
    contains(target) { return children.includes(target); },
    // Exposed for assertions:
    _listeners: listeners,
    _classes:   classes
  };
}

/**
 * Builds a minimal drag event object.
 *
 * @param {string} type            Event type string (e.g. 'dragover').
 * @param {object} [opts]
 * @param {*}      [opts.relatedTarget=null]  The relatedTarget on the event.
 * @param {*}      [opts.data=null]           JSON-serialisable drag payload,
 *                                            or null to simulate no data.
 */
function makeEvent(type, { relatedTarget = null, data = null } = {}) {
  const raw = data !== null ? JSON.stringify(data) : null;
  return {
    type,
    _prevented: false,
    preventDefault() { this._prevented = true; },
    relatedTarget,
    dataTransfer: { getData: () => raw }
  };
}

/** Dispatch a synthetic event to all registered listeners on the node. */
function fire(node, type, event) {
  for (const fn of (node._listeners[type] ?? [])) {
    fn(event);
  }
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('dragDrop action — attach / detach', () => {
  it('attaches dragover, dragleave and drop listeners on creation', () => {
    const node = makeNode();
    dragDrop(node, { onDrop: () => {} });

    assert.equal(node._listeners['dragover']?.length,  1, 'dragover listener');
    assert.equal(node._listeners['dragleave']?.length, 1, 'dragleave listener');
    assert.equal(node._listeners['drop']?.length,      1, 'drop listener');
  });

  it('destroy() removes all listeners', () => {
    const node   = makeNode();
    const action = dragDrop(node, { onDrop: () => {} });

    action.destroy();

    assert.equal((node._listeners['dragover']  ?? []).length, 0, 'dragover removed');
    assert.equal((node._listeners['dragleave'] ?? []).length, 0, 'dragleave removed');
    assert.equal((node._listeners['drop']      ?? []).length, 0, 'drop removed');
  });

  it('destroy() removes any active CSS class from the node', () => {
    const node   = makeNode();
    const action = dragDrop(node, { onDrop: () => {}, activeClass: 'drag-over' });

    fire(node, 'dragover', makeEvent('dragover'));
    assert.ok(node._classes.has('drag-over'), 'class added before destroy');

    action.destroy();

    assert.ok(!node._classes.has('drag-over'), 'class removed by destroy');
  });

  it('does not attach any listeners when disabled=true', () => {
    const node = makeNode();
    dragDrop(node, { onDrop: () => {}, disabled: true });

    assert.equal((node._listeners['dragover']  ?? []).length, 0);
    assert.equal((node._listeners['dragleave'] ?? []).length, 0);
    assert.equal((node._listeners['drop']      ?? []).length, 0);
  });
});

describe('dragDrop action — dragover', () => {
  it('dragover calls event.preventDefault()', () => {
    const node  = makeNode();
    const event = makeEvent('dragover');
    dragDrop(node, { onDrop: () => {} });

    fire(node, 'dragover', event);

    assert.ok(event._prevented, 'preventDefault() was called');
  });

  it('dragover adds the default activeClass "drop-active" to the node', () => {
    const node = makeNode();
    dragDrop(node, { onDrop: () => {} }); // no activeClass supplied

    fire(node, 'dragover', makeEvent('dragover'));

    assert.ok(node._classes.has('drop-active'));
  });

  it('dragover adds a custom activeClass when one is specified', () => {
    const node = makeNode();
    dragDrop(node, { onDrop: () => {}, activeClass: 'my-drop-class' });

    fire(node, 'dragover', makeEvent('dragover'));

    assert.ok(node._classes.has('my-drop-class'));
  });
});

describe('dragDrop action — dragleave', () => {
  it('dragleave removes activeClass when relatedTarget is outside the node', () => {
    const node = makeNode(); // contains() always false
    dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

    fire(node, 'dragover',  makeEvent('dragover'));
    fire(node, 'dragleave', makeEvent('dragleave', { relatedTarget: {} }));

    assert.ok(!node._classes.has('drop-active'));
  });

  it('dragleave does NOT remove activeClass when relatedTarget is a child of the node', () => {
    const child = {};
    const node  = makeNode([child]); // contains(child) === true
    dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

    fire(node, 'dragover',  makeEvent('dragover'));
    fire(node, 'dragleave', makeEvent('dragleave', { relatedTarget: child }));

    assert.ok(node._classes.has('drop-active'), 'class must remain when hovering a child');
  });

  it('dragleave with null relatedTarget does not throw', () => {
    const node = makeNode();
    dragDrop(node, { onDrop: () => {} });

    assert.doesNotThrow(() => {
      fire(node, 'dragleave', makeEvent('dragleave', { relatedTarget: null }));
    });
  });
});

describe('dragDrop action — drop', () => {
  it('drop calls event.preventDefault()', () => {
    const node  = makeNode();
    const event = makeEvent('drop', { data: { type: 'Item' } });
    dragDrop(node, { onDrop: () => {} });

    fire(node, 'drop', event);

    assert.ok(event._prevented, 'preventDefault() was called');
  });

  it('drop removes activeClass from the node', () => {
    const node = makeNode();
    dragDrop(node, { onDrop: () => {}, activeClass: 'drop-active' });

    fire(node, 'dragover', makeEvent('dragover'));
    assert.ok(node._classes.has('drop-active'), 'class present before drop');

    fire(node, 'drop', makeEvent('drop', { data: { type: 'Item' } }));
    assert.ok(!node._classes.has('drop-active'), 'class removed by drop');
  });

  it('drop calls onDrop with the extracted drag data', () => {
    const node     = makeNode();
    const received = [];
    const payload  = { type: 'Item', uuid: 'Item.abc123' };
    dragDrop(node, { onDrop: (d) => received.push(d) });

    fire(node, 'drop', makeEvent('drop', { data: payload }));

    assert.equal(received.length, 1);
    assert.deepEqual(received[0], payload);
  });

  it('drop with null drag data does not call onDrop', () => {
    const node = makeNode();
    let called = false;
    dragDrop(node, { onDrop: () => { called = true; } });

    // data: null causes getDragEventData to return null
    fire(node, 'drop', makeEvent('drop', { data: null }));

    assert.ok(!called, 'onDrop must not be called when data is null');
  });

  it('drop with no onDrop callback does not throw', () => {
    const node = makeNode();
    dragDrop(node, {}); // no onDrop

    assert.doesNotThrow(() => {
      fire(node, 'drop', makeEvent('drop', { data: { type: 'Item' } }));
    });
  });
});

describe('dragDrop action — update()', () => {
  it('toggling disabled from false to true detaches all listeners', () => {
    const node   = makeNode();
    const action = dragDrop(node, { onDrop: () => {}, disabled: false });

    assert.equal(node._listeners['drop']?.length, 1, 'listener present before update');

    action.update({ onDrop: () => {}, disabled: true });

    assert.equal((node._listeners['drop'] ?? []).length, 0, 'listener removed after disable');
  });

  it('toggling disabled from true to false attaches listeners', () => {
    const node   = makeNode();
    const action = dragDrop(node, { onDrop: () => {}, disabled: true });

    assert.equal((node._listeners['drop'] ?? []).length, 0, 'no listener when initially disabled');

    action.update({ onDrop: () => {}, disabled: false });

    assert.equal(node._listeners['drop']?.length, 1, 'listener added after enable');
  });

  it('changing activeClass removes the old class from the node', () => {
    const node   = makeNode();
    const action = dragDrop(node, { onDrop: () => {}, activeClass: 'old-class' });

    fire(node, 'dragover', makeEvent('dragover'));
    assert.ok(node._classes.has('old-class'), 'old class applied by dragover');

    action.update({ onDrop: () => {}, activeClass: 'new-class' });

    assert.ok(!node._classes.has('old-class'), 'old class stripped by update');
  });

  it('changing activeClass does not add the new class until the next dragover', () => {
    const node   = makeNode();
    const action = dragDrop(node, { onDrop: () => {}, activeClass: 'old-class' });

    action.update({ onDrop: () => {}, activeClass: 'new-class' });

    assert.ok(!node._classes.has('new-class'), 'new class not yet applied before dragover');

    fire(node, 'dragover', makeEvent('dragover'));

    assert.ok(node._classes.has('new-class'), 'new class applied after dragover');
  });

  it('updating onDrop causes subsequent drops to use the new callback', () => {
    const node        = makeNode();
    const firstCalls  = [];
    const secondCalls = [];
    const action      = dragDrop(node, { onDrop: (d) => firstCalls.push(d) });

    // Swap the callback
    action.update({ onDrop: (d) => secondCalls.push(d) });

    const payload = { type: 'Item', uuid: 'Item.xyz' };
    fire(node, 'drop', makeEvent('drop', { data: payload }));

    assert.equal(firstCalls.length,  0, 'old callback must not be invoked');
    assert.equal(secondCalls.length, 1, 'new callback must be invoked');
    assert.deepEqual(secondCalls[0], payload);
  });
});

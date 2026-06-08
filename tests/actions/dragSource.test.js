/**
 * Unit tests for src/ui/svelte/actions/dragSource.js
 *
 * dragSource is the net-new drag SOURCE half (its drop sibling dragDrop.js is
 * covered by tests/actions/dragDrop.test.js). Like that action it is a plain
 * Svelte action — a function operating on a DOM element — so it can be tested in
 * Node with a mock element + mock dragstart/dragend events; no browser or Svelte
 * compiler is needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { dragSource } = await import('../../src/ui/svelte/actions/dragSource.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock DOM node tracking listeners, classes and attributes. */
function makeNode() {
  const listeners = {};
  const classes = new Set();
  const attributes = {};

  return {
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn) {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(f => f !== fn);
      }
    },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    classList: {
      add(cls)      { classes.add(cls); },
      remove(cls)   { classes.delete(cls); },
      contains(cls) { return classes.has(cls); }
    },
    // Exposed for assertions:
    _listeners:  listeners,
    _classes:    classes,
    _attributes: attributes
  };
}

/** Minimal DataTransfer mock recording setData calls + effectAllowed. */
function makeDataTransfer() {
  const store = {};
  return {
    effectAllowed: '',
    _setCalls: [],
    setData(format, value) {
      this._setCalls.push({ format, value });
      store[format] = value;
    },
    getData(format) { return store[format] ?? ''; }
  };
}

/** Build a dragstart/dragend event with a DataTransfer and preventDefault spy. */
function makeEvent(type, { dataTransfer = makeDataTransfer() } = {}) {
  return {
    type,
    _prevented: false,
    preventDefault() { this._prevented = true; },
    dataTransfer
  };
}

/** Dispatch a synthetic event to all listeners registered for that type. */
function fire(node, type, event) {
  for (const fn of (node._listeners[type] ?? [])) {
    fn(event);
  }
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('dragSource action — attach', () => {
  it('marks the node draggable and attaches dragstart + dragend listeners', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => ({ a: 1 }) });

    assert.equal(node.getAttribute('draggable'), 'true', 'node is draggable');
    assert.equal(node._listeners['dragstart']?.length, 1, 'dragstart listener attached');
    assert.equal(node._listeners['dragend']?.length, 1, 'dragend listener attached');
  });
});

describe('dragSource action — dragstart', () => {
  it('serializes the payload to dataTransfer.setData("text/plain", json)', () => {
    const node = makeNode();
    const payload = { interactableType: 'tool', systemId: 's1', referenceId: 't1' };
    dragSource(node, { getPayload: () => payload });

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.equal(event.dataTransfer._setCalls.length, 1, 'setData called once');
    assert.equal(event.dataTransfer._setCalls[0].format, 'text/plain', 'writes to text/plain');
    assert.deepEqual(JSON.parse(event.dataTransfer._setCalls[0].value), payload, 'payload round-trips as JSON');
  });

  it('passes a string payload through unchanged (no double-encoding)', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => '{"already":"json"}' });

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.equal(event.dataTransfer.getData('text/plain'), '{"already":"json"}');
  });

  it('sets effectAllowed to "copy"', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => ({ a: 1 }) });

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.equal(event.dataTransfer.effectAllowed, 'copy');
  });

  it('adds the default activeClass while dragging', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => ({ a: 1 }) });

    fire(node, 'dragstart', makeEvent('dragstart'));

    assert.ok(node._classes.has('fab-dragging'), 'default fab-dragging class applied');
  });

  it('adds a custom activeClass while dragging', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => ({ a: 1 }), activeClass: 'my-drag' });

    fire(node, 'dragstart', makeEvent('dragstart'));

    assert.ok(node._classes.has('my-drag'));
  });
});

describe('dragSource action — empty / absent payload', () => {
  it('calls preventDefault() and does not setData when getPayload returns null', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => null });

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.ok(event._prevented, 'drag cancelled via preventDefault()');
    assert.equal(event.dataTransfer._setCalls.length, 0, 'no data written for an empty payload');
    assert.ok(!node._classes.has('fab-dragging'), 'no active class applied for an empty drag');
  });

  it('calls preventDefault() when no getPayload is supplied', () => {
    const node = makeNode();
    dragSource(node, {});

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.ok(event._prevented, 'drag cancelled when there is no payload provider');
    assert.equal(event.dataTransfer._setCalls.length, 0, 'no data written');
  });
});

describe('dragSource action — dragend', () => {
  it('removes the active class when the drag ends', () => {
    const node = makeNode();
    dragSource(node, { getPayload: () => ({ a: 1 }) });

    fire(node, 'dragstart', makeEvent('dragstart'));
    assert.ok(node._classes.has('fab-dragging'), 'class present mid-drag');

    fire(node, 'dragend', makeEvent('dragend'));
    assert.ok(!node._classes.has('fab-dragging'), 'class removed on dragend');
  });
});

describe('dragSource action — update()', () => {
  it('swaps the payload provider so subsequent drags use the new one', () => {
    const node = makeNode();
    const action = dragSource(node, { getPayload: () => ({ which: 'first' }) });

    action.update({ getPayload: () => ({ which: 'second' }) });

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.deepEqual(JSON.parse(event.dataTransfer.getData('text/plain')), { which: 'second' });
  });

  it('strips the old activeClass when activeClass changes', () => {
    const node = makeNode();
    const action = dragSource(node, { getPayload: () => ({ a: 1 }), activeClass: 'old-drag' });

    fire(node, 'dragstart', makeEvent('dragstart'));
    assert.ok(node._classes.has('old-drag'), 'old class applied by dragstart');

    action.update({ getPayload: () => ({ a: 1 }), activeClass: 'new-drag' });
    assert.ok(!node._classes.has('old-drag'), 'old class stripped by update');
  });
});

describe('dragSource action — destroy()', () => {
  it('removes both listeners and any active class', () => {
    const node = makeNode();
    const action = dragSource(node, { getPayload: () => ({ a: 1 }) });

    fire(node, 'dragstart', makeEvent('dragstart'));
    assert.ok(node._classes.has('fab-dragging'), 'class present before destroy');

    action.destroy();

    assert.equal((node._listeners['dragstart'] ?? []).length, 0, 'dragstart listener removed');
    assert.equal((node._listeners['dragend'] ?? []).length, 0, 'dragend listener removed');
    assert.ok(!node._classes.has('fab-dragging'), 'active class cleared by destroy');
  });

  it('a dragstart after destroy is a no-op (listener detached)', () => {
    const node = makeNode();
    const action = dragSource(node, { getPayload: () => ({ a: 1 }) });

    action.destroy();

    const event = makeEvent('dragstart');
    fire(node, 'dragstart', event);

    assert.equal(event.dataTransfer._setCalls.length, 0, 'detached handler does not write data');
  });
});

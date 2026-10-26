import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { dismissOnOutsideClick } = await import('../../src/ui/svelte/actions/dismissOnOutsideClick.js');

describe('dismissOnOutsideClick action', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('calls onDismiss when clicking outside the node', () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(host, outside);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => { dismissCount += 1; }
    });

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissCount, 1);
    action.destroy();
  });

  it('does not call onDismiss when clicking inside the node', () => {
    const host = document.createElement('div');
    const inside = document.createElement('button');
    host.appendChild(inside);
    document.body.appendChild(host);

    let dismissed = false;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => { dismissed = true; }
    });

    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissed, false);
    action.destroy();
  });

  it('calls onDismiss when Escape is pressed', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => { dismissCount += 1; }
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    assert.equal(dismissCount, 1);
    action.destroy();
  });

  it('does not react while disabled and starts reacting after update enables it', () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(host, outside);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      enabled: false,
      onDismiss: () => { dismissCount += 1; }
    });

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    assert.equal(dismissCount, 0);

    action.update({
      enabled: true,
      onDismiss: () => { dismissCount += 1; }
    });
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissCount, 1);
    action.destroy();
  });

  it('does not dismiss when clicking inside an additional allowed node', () => {
    const host = document.createElement('div');
    const popover = document.createElement('div');
    const popoverButton = document.createElement('button');
    popover.appendChild(popoverButton);
    document.body.append(host, popover);

    let dismissed = false;
    const action = dismissOnOutsideClick(host, {
      additionalNodes: () => [popover],
      onDismiss: () => { dismissed = true; }
    });

    popoverButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissed, false);
    action.destroy();
  });
});

describe('dismissOnOutsideClick onDetached (issue 2671)', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  // happy-dom delivers mutation records from a microtask, and a later task sees them all.
  const settle = () => new Promise((done) => setTimeout(done, 0));

  /** A connected node, the calls its `onDetached` received, and its action under `options`. */
  function watched(options = {}) {
    const node = document.createElement('div');
    document.body.append(node);
    const calls = [];
    const action = dismissOnOutsideClick(node, {
      onDetached: () => {
        calls.push('detached');
      },
      ...options,
    });
    return { node, calls, action };
  }

  it('calls onDetached once when the node is removed, and never for a later mutation', async () => {
    const { node, calls, action } = watched();
    node.remove();
    await settle();
    assert.deepEqual(calls, ['detached']);
    document.body.append(document.createElement('span'));
    document.body.append(node);
    node.remove();
    await settle();
    assert.deepEqual(calls, ['detached'], 'the watch ended with the first call');
    action.destroy();
  });

  it('calls nothing while disabled', async () => {
    const { node, calls, action } = watched({ enabled: false });
    node.remove();
    await settle();
    assert.deepEqual(calls, []);
    action.destroy();
  });

  it('calls nothing for a removal and re-insertion in one run of script', async () => {
    const { node, calls, action } = watched();
    node.remove();
    document.body.append(node);
    await settle();
    assert.deepEqual(calls, []);
    node.remove();
    await settle();
    assert.deepEqual(calls, ['detached'], 'and still watches');
    action.destroy();
  });

  it('calls nothing after destroy', async () => {
    const { node, calls, action } = watched();
    action.destroy();
    node.remove();
    await settle();
    assert.deepEqual(calls, []);
  });

  it('calls nothing for a node attached while disconnected, which it does not watch', async () => {
    const node = document.createElement('div');
    const calls = [];
    const action = dismissOnOutsideClick(node, {
      onDetached: () => {
        calls.push('detached');
      },
    });
    document.body.append(node);
    node.remove();
    await settle();
    assert.deepEqual(calls, []);
    action.destroy();
  });

  it('stops when an update drops onDetached, and calls the one an update swaps in', async () => {
    const dropped = watched();
    dropped.action.update({ onDismiss: () => {} });
    dropped.node.remove();
    await settle();
    assert.deepEqual(dropped.calls, [], 'dropped');
    dropped.action.destroy();

    const swapped = watched();
    const later = [];
    swapped.action.update({
      onDetached: () => {
        later.push('swapped');
      },
    });
    swapped.node.remove();
    await settle();
    assert.deepEqual([...swapped.calls, ...later], ['swapped']);
    swapped.action.destroy();
  });

  it('watches once an update enables it, and stops when one disables it', async () => {
    const onDetached = () => {
      calls.push('detached');
    };
    const calls = [];
    const node = document.createElement('div');
    document.body.append(node);
    const action = dismissOnOutsideClick(node, { enabled: false, onDetached });
    action.update({ enabled: true, onDetached });
    action.update({ enabled: false, onDetached });
    node.remove();
    await settle();
    assert.deepEqual(calls, [], 'disabled again');
    document.body.append(node);
    action.update({ enabled: true, onDetached });
    node.remove();
    await settle();
    assert.deepEqual(calls, ['detached']);
    action.destroy();
  });

  it('keeps one observer across updates, so a removal calls onDetached once', async () => {
    const view = document.defaultView;
    const { MutationObserver } = view;
    let made = 0;
    view.MutationObserver = class extends MutationObserver {
      constructor(callback) {
        super(callback);
        made += 1;
      }
    };
    try {
      const { node, calls, action } = watched();
      for (let i = 0; i < 3; i += 1) {
        action.update({
          onDetached: () => {
            calls.push('detached');
          },
        });
      }
      assert.equal(made, 1, 'one observer for the node, however often it updates');
      node.remove();
      await settle();
      assert.deepEqual(calls, ['detached']);
      action.destroy();
    } finally {
      view.MutationObserver = MutationObserver;
    }
  });

  it('closes a target in a shadow root when the host of that root leaves the document', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    shadow.append(inner);
    const calls = [];
    const action = dismissOnOutsideClick(inner, {
      onDetached: () => {
        calls.push('detached');
      },
    });
    host.remove();
    await settle();
    assert.deepEqual(calls, ['detached']);
    action.destroy();
  });

  it('throws nothing in a window with no MutationObserver, and calls nothing', async () => {
    const view = document.defaultView;
    const { MutationObserver } = view;
    view.MutationObserver = undefined;
    try {
      const { node, calls, action } = watched();
      node.remove();
      await settle();
      assert.deepEqual(calls, []);
      assert.doesNotThrow(() => action.destroy());
    } finally {
      view.MutationObserver = MutationObserver;
    }
  });
});

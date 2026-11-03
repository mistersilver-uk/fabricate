import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pressPointer as press } from '../helpers/pointerPress.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { dismissOnOutsideClick } =
  await import('../../src/ui/svelte/actions/dismissOnOutsideClick.js');

describe('dismissOnOutsideClick action', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  it('calls onDismiss when clicking outside the node', () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(host, outside);

    let dismissCount = 0;
    const action = dismissOnOutsideClick(host, {
      onDismiss: () => {
        dismissCount += 1;
      },
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
      onDismiss: () => {
        dismissed = true;
      },
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
      onDismiss: () => {
        dismissCount += 1;
      },
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
      onDismiss: () => {
        dismissCount += 1;
      },
    });

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    assert.equal(dismissCount, 0);

    action.update({
      enabled: true,
      onDismiss: () => {
        dismissCount += 1;
      },
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
      onDismiss: () => {
        dismissed = true;
      },
    });

    popoverButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    assert.equal(dismissed, false);
    action.destroy();
  });
});

describe('dismissOnOutsideClick onFocusLeave (issue 2598)', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  /** A root holding a field, a panel and an anchor counted inside, an outside button, and calls. */
  function scene(options = {}) {
    const root = document.createElement('div');
    const field = document.createElement('input');
    const panel = document.createElement('div');
    const panelButton = document.createElement('button');
    const anchor = document.createElement('button');
    const outside = document.createElement('button');
    root.append(field);
    panel.append(panelButton);
    document.body.append(root, panel, anchor, outside);
    const calls = [];
    const action = dismissOnOutsideClick(root, {
      additionalNodes: () => [panel, anchor],
      onFocusLeave: (event) => {
        calls.push(event.relatedTarget);
      },
      ...options,
    });
    return { root, field, panel, panelButton, anchor, outside, calls, action };
  }

  const focusOut = (from, relatedTarget) =>
    from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));

  it('calls onFocusLeave when focus moves from inside to a node outside', () => {
    const { field, outside, calls, action } = scene();
    focusOut(field, outside);
    assert.ok(calls.length === 1 && calls[0] === outside);
    action.destroy();
  });

  it('calls nothing when focus moves to the root, the panel or the anchor', () => {
    const { field, panelButton, anchor, root, calls, action } = scene();
    focusOut(field, root);
    focusOut(field, panelButton);
    focusOut(panelButton, anchor);
    focusOut(anchor, field);
    assert.equal(calls.length, 0);
    action.destroy();
  });

  it('calls nothing when focus leaves for no node, as when the window loses focus', () => {
    const { field, calls, action } = scene();
    focusOut(field, null);
    assert.equal(calls.length, 0);
    action.destroy();
  });

  it('calls nothing for a focusout whose target and relatedTarget are both outside', () => {
    const { outside, calls, action } = scene();
    const other = document.createElement('button');
    document.body.append(other);
    focusOut(outside, other);
    assert.equal(calls.length, 0);
    action.destroy();
  });

  it('calls the callback an update swaps in, and nothing while disabled', () => {
    const { field, outside, calls, action } = scene();
    const later = [];
    action.update({
      additionalNodes: () => [],
      onFocusLeave: () => {
        later.push('swapped');
      },
    });
    focusOut(field, outside);
    action.update({
      enabled: false,
      onFocusLeave: () => {
        later.push('disabled');
      },
    });
    focusOut(field, outside);
    assert.deepEqual([calls.length, later], [0, ['swapped']]);
    action.destroy();
  });

  it('removes the focusout listener on destroy', () => {
    const { field, outside, calls, action } = scene();
    action.destroy();
    focusOut(field, outside);
    assert.equal(calls.length, 0);
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

describe('dismissOnOutsideClick with dismissOn: click (issue 2879)', () => {
  before(() => setupDOM());
  after(() => teardownDOM());

  function clickDismissed(options = {}) {
    const dialog = document.createElement('div');
    const field = document.createElement('input');
    const scrim = document.createElement('div');
    const panel = document.createElement('div');
    dialog.append(field);
    document.body.append(scrim, dialog, panel);
    const calls = [];
    const action = dismissOnOutsideClick(dialog, {
      dismissOn: 'click',
      onDismiss: (event) => {
        calls.push(event.type);
      },
      ...options,
    });
    return { dialog, field, scrim, panel, calls, action };
  }

  it('calls onDismiss once, with the click, for a primary press that goes down and up outside', () => {
    const { scrim, calls, action } = clickDismissed();
    press(scrim);
    assert.deepEqual(calls, ['click']);
    action.destroy();
  });

  it('calls nothing at mousedown, so the release decides', () => {
    const { scrim, calls, action } = clickDismissed();
    scrim.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    assert.deepEqual(calls, []);
    action.destroy();
  });

  for (const [name, button] of [
    ['right', 2],
    ['middle', 1],
  ]) {
    it(`calls nothing for a ${name}-button press outside`, () => {
      const { scrim, calls, action } = clickDismissed();
      press(scrim, scrim, { button });
      assert.deepEqual(calls, []);
      action.destroy();
    });
  }

  it('calls nothing for a press outside dragged into the node, nor for one dragged out of it', () => {
    const { scrim, field, calls, action } = clickDismissed();
    press(scrim, field);
    press(field, scrim);
    assert.deepEqual(calls, []);
    action.destroy();
  });

  it('calls nothing for a click with no press, as a keyboard activation outside makes', () => {
    const { panel, calls, action } = clickDismissed();
    panel.click();
    assert.deepEqual(calls, []);
    action.destroy();
  });

  /** `type` on `node` with the primary button and the `detail` of one pointer press. */
  const fire = (node, type) =>
    node.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, detail: 1 }));

  it('calls nothing for a click() after a press that went down and up outside with no click', () => {
    const { scrim, panel, calls, action } = clickDismissed();
    fire(scrim, 'mousedown');
    fire(scrim, 'mouseup');
    panel.click();
    assert.deepEqual(calls, []);
    action.destroy();
  });

  it('forgets a press outside at a key, and when it is disabled and enabled again', () => {
    const { scrim, calls, action } = clickDismissed();
    fire(scrim, 'mousedown');
    fire(scrim, 'mouseup');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fire(scrim, 'click');
    const options = {
      dismissOn: 'click',
      onDismiss: (event) => {
        calls.push(event.type);
      },
    };
    fire(scrim, 'mousedown');
    fire(scrim, 'mouseup');
    action.update({ ...options, enabled: false });
    action.update(options);
    fire(scrim, 'click');
    assert.deepEqual(calls, []);
    action.destroy();
  });

  it('calls onDismiss once for a tap, the touch sequence Chromium ends with mouse events', () => {
    const { scrim, calls, action } = clickDismissed();
    const { TouchEvent = Event } = document.defaultView;
    for (const type of ['touchstart', 'touchend']) {
      scrim.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true }));
    }
    for (const type of ['mousedown', 'mouseup', 'click']) fire(scrim, type);
    assert.deepEqual(calls, ['click']);
    action.destroy();
  });

  it('judges the press and the release against additionalNodes, read at each', () => {
    let extra = [];
    const { scrim, panel, calls, action } = clickDismissed({ additionalNodes: () => extra });
    extra = [panel];
    press(panel, scrim);
    press(scrim, panel);
    assert.deepEqual(calls, []);
    extra = [];
    press(panel, scrim);
    assert.deepEqual(calls, ['click']);
    action.destroy();
  });

  it('still calls onDismiss for Escape, and the default still dismisses at mousedown', () => {
    const { scrim, calls, action } = clickDismissed();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepEqual(calls, ['keydown']);
    action.update({
      onDismiss: (event) => {
        calls.push(event.type);
      },
    });
    scrim.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    assert.deepEqual(calls, ['keydown', 'mousedown']);
    action.destroy();
  });
});

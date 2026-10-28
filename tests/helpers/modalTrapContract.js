/**
 * The `trapFocus` contract a manager dialog adopts (issue 2682), driven on a mounted caller: focus
 * enters on open at `landing`, the dialog is `aria-modal`, Tab and Shift+Tab wrap between its close
 * control and `last`, Escape calls `onClose` once, and closing returns focus to the opener.
 * `open(onClose)` mounts the dialog open; `close()` closes it as its caller does on `onClose`.
 */
import assert from 'node:assert/strict';

function keydown(target, init) {
  const event = new target.ownerDocument.defaultView.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

// A frame, by which the focus a closed dialog restores has landed.
const frame = (view) => new Promise((settle) => view.requestAnimationFrame(settle));

export async function assertTrapsFocus({ open, close, dialog, landing, last }) {
  const doc = globalThis.document;
  await frame(doc.defaultView);
  const opener = doc.createElement('button');
  doc.body.append(opener);
  opener.focus();
  let closes = 0;
  try {
    await open(() => {
      closes += 1;
    });
    await new Promise((settle) => queueMicrotask(settle));
    const root = doc.querySelector(dialog);
    assert.equal(root.getAttribute('aria-modal'), 'true', 'the dialog is announced as modal');
    assert.ok(doc.activeElement?.matches(landing), `focus enters on ${landing}`);
    const closeControl = root.querySelector('[data-manager-modal-close]');
    const lastControl = root.querySelector(last);
    lastControl.focus();
    assert.equal(keydown(lastControl, { key: 'Tab' }).defaultPrevented, true, 'Tab is claimed');
    assert.ok(doc.activeElement === closeControl, 'Tab from the last control wraps to the close');
    keydown(closeControl, { key: 'Tab', shiftKey: true });
    assert.ok(doc.activeElement === lastControl, 'Shift+Tab from the close wraps to the last');
    keydown(lastControl, { key: 'Escape' });
    assert.equal(closes, 1, 'Escape in the dialog calls onClose once');
    await close();
    await frame(doc.defaultView);
    assert.ok(doc.activeElement === opener, 'focus returns to the opener');
  } finally {
    opener.remove();
  }
}

/**
 * The published `ListRow`'s `'accent'` tone and its `trailing` slot holding several controls: the
 * accent class on either form's root and its removal, every value outside the closed set drawing
 * the neutral row's markup byte for byte, and each control in `trailing` after the row's button in
 * document order, its own target, and never calling `onOpen`.
 * Limit: happy-dom lays nothing out, so the gap, the hit-test and the Tab order are
 * `list-row-tone-trailing-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedListRowSeam } from '../helpers/publishedListRowSeam.js';

const NAME = 'Signet of the Ember Court';
const { ui, mountRow } = publishedListRowSeam('fabricate-published-list-row-tone-trailing-', NAME);

const ACCENT = 'is-accent';
const LABELS = Object.freeze(['Claim the signet', 'Rename the signet', 'Remove the signet']);
const FOCUSABLE = 'button, a, input, [tabindex]';

/** Appends one companion button per label to the `trailing` slot element, as its group states it. */
function drawControls(handle, labels = LABELS) {
  const slot = handle.slot('trailing');
  return labels.map((label) => {
    const control = slot.ownerDocument.createElement('button');
    control.type = 'button';
    control.setAttribute('data-keyboard-focus', 'true');
    control.setAttribute('aria-label', label);
    slot.append(control);
    return control;
  });
}

describe('the published ListRow’s accent tone', () => {
  it('keeps tone one optional data key, the widened set beside it', () => {
    assert.deepEqual(ui().describe('ListRow').props.tone, { kind: 'data', required: false });
  });

  for (const [form, props] of [
    ['the read-only row', {}],
    ['the button row', { onOpen() {} }],
  ]) {
    it(`writes ${ACCENT} on ${form}'s root, and an update to another tone removes it`, async () => {
      const { handle, row } = mountRow({ ...props, tone: 'accent' });
      await settle();
      const root = row();
      assert.ok(root.classList.contains(ACCENT));
      for (const other of ['is-positive', 'is-danger']) {
        assert.ok(!root.classList.contains(other), `no ${other} beside it`);
      }
      assert.equal(handle.update({ name: NAME, ...props, tone: 'positive' }), true);
      await settle();
      assert.ok(row() === root, 'the same root');
      assert.deepEqual(
        [root.classList.contains(ACCENT), root.classList.contains('is-positive')],
        [false, true]
      );
      handle.destroy();
    });
  }

  it('draws the neutral row’s markup, byte for byte, for an absent tone and for every value outside its set', async () => {
    const markupOf = async (props) => {
      const { target, handle } = mountRow({ detail: 'Claimed', ...props });
      await settle();
      const markup = target.innerHTML;
      handle.destroy();
      return markup;
    };
    const absent = await markupOf({});
    assert.ok(!absent.includes(ACCENT), 'no accent class is written');
    const accent = await markupOf({ tone: 'accent' });
    assert.notEqual(accent, absent, 'the accent tone draws other markup');
    assert.equal(accent.replace(` ${ACCENT}`, ''), absent, 'and differs by its class alone');
    for (const tone of [
      'neutral',
      'Accent',
      'ACCENT',
      'accent ',
      'info',
      'warning',
      true,
      1,
      null,
    ]) {
      assert.equal(await markupOf({ tone }), absent, `tone ${JSON.stringify(tone)}`);
    }
  });
});

describe('the published ListRow’s trailing slot holding several controls', () => {
  it('draws each control after the row’s button in document order, inside the trailing host', async () => {
    const { target, handle, row, button } = mountRow({ onOpen() {}, trailing: true });
    await settle();
    const controls = drawControls(handle);
    const host = row().querySelector(':scope > .fabricate-list-row-trailing');
    assert.ok(host && host.previousElementSibling === button(), 'the host follows the button');
    assert.ok(
      controls.every((control) => host.contains(control) && !button().contains(control)),
      'every control in the host, none in the button'
    );
    assert.deepEqual(
      [...target.querySelectorAll(FOCUSABLE)].map((node) => node.getAttribute('aria-label')),
      [null, ...LABELS],
      'the row’s button, then each control in the order appended'
    );
    handle.destroy();
  });

  it('draws each control after the name, as the row’s only focusable elements, without onOpen', async () => {
    const { target, handle, row } = mountRow({ trailing: true });
    await settle();
    drawControls(handle);
    assert.ok(!row().querySelector('.fabricate-list-row-trailing'), 'bare, with no host');
    assert.deepEqual(
      [...target.querySelectorAll(FOCUSABLE)].map((node) => node.getAttribute('aria-label')),
      [...LABELS]
    );
    const name = row().querySelector('.fabricate-list-row-name');
    assert.ok(
      name.compareDocumentPosition(handle.slot('trailing')) & 4,
      'the controls follow the name'
    );
    handle.destroy();
  });

  it('runs each control’s own handler for its press, never onOpen', async () => {
    const press = recorder();
    const { handle } = mountRow({ onOpen: press.record, trailing: true });
    await settle();
    const pressed = [];
    for (const [at, control] of drawControls(handle).entries()) {
      control.addEventListener('click', () => {
        pressed.push(at);
      });
      control.click();
    }
    assert.deepEqual(pressed, [0, 1, 2], 'each control’s own handler, once');
    assert.deepEqual(press.calls, [], 'and onOpen never');
    handle.destroy();
  });

  it('keeps every control in place, in order, across an update that adds the accent tone', async () => {
    const { handle, row } = mountRow({ onOpen() {}, trailing: true });
    await settle();
    const controls = drawControls(handle);
    const slot = handle.slot('trailing');
    assert.equal(handle.update({ name: NAME, onOpen() {}, trailing: true, tone: 'accent' }), true);
    await settle();
    assert.ok(row().classList.contains(ACCENT), 'the update drew the accent row');
    assert.ok(handle.slot('trailing') === slot && slot.isConnected, 'the same slot, attached');
    assert.deepEqual([...slot.children], controls, 'the same controls, in order');
    handle.destroy();
  });
});

/**
 * The published `ListRow`'s read-only `selected`, `current` and `busy` (issue 2851): the face a row
 * without `onOpen` draws and the `aria-pressed` it never writes, `aria-current` and `aria-busy` on
 * the button or the root, the spinner in place of the mark or `leading`, and the busy button that
 * keeps its focus and refuses a press; each draws, updates in place and is removed.
 * Limit: happy-dom paints nothing, so the face's fill and the spinner's box are
 * `list-row-state-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedListRowSeam } from '../helpers/publishedListRowSeam.js';

const NAME = 'Second stage: quench the blade';
const { ui, mountRow } = publishedListRowSeam('fabricate-published-list-row-state-', NAME);

const FACE = 'is-selected-face';
const SPINNER = ['fas', 'fa-spinner', 'fa-spin'];
const glyphClasses = (mark) =>
  [...mark.querySelector('i').classList].filter((name) => !name.startsWith('svelte-'));
const focusable = (target) => target.querySelectorAll('button, a, input, [tabindex]').length;

describe('the published ListRow describes its state keys', () => {
  it('lists current and busy as optional data keys', () => {
    const { props } = ui().describe('ListRow');
    for (const key of ['current', 'busy']) {
      assert.deepEqual(props[key], { kind: 'data', required: false }, key);
    }
  });
});

describe('the published ListRow selected without onOpen', () => {
  it('draws the face on the read-only row, writes no aria-pressed, and an update without it removes the face', async () => {
    const { target, handle, row } = mountRow({ selected: true });
    await settle();
    const root = row();
    assert.ok(root.classList.contains(FACE), 'the face');
    assert.ok(!root.classList.contains('is-form'), 'at the dense row’s own inset');
    assert.equal(target.querySelectorAll('[aria-pressed]').length, 0, 'no aria-pressed');
    assert.equal(focusable(target), 0, 'nothing focusable');
    assert.equal(handle.update({ name: NAME }), true);
    await settle();
    assert.ok(row() === root && !root.classList.contains(FACE), 'removed from the same root');
    handle.destroy();
  });

  for (const selected of [false, 'true', null]) {
    it(`draws no face for selected ${JSON.stringify(selected)}`, async () => {
      const { handle, row } = mountRow({ selected });
      await settle();
      assert.ok(!row().classList.contains(FACE));
      handle.destroy();
    });
  }

  it('leaves the pressed face to aria-pressed once onOpen is passed, on the same root', async () => {
    const { handle, row, button } = mountRow({ selected: true });
    await settle();
    const root = row();
    assert.equal(handle.update({ name: NAME, selected: true, onOpen() {} }), true);
    await settle();
    assert.ok(row() === root, 'the same root');
    assert.ok(!root.classList.contains(FACE), 'no read-only face class');
    assert.equal(button().getAttribute('aria-pressed'), 'true');
    handle.destroy();
  });
});

describe('the published ListRow current', () => {
  for (const [current, token] of [
    [true, 'true'],
    ['step', 'step'],
  ]) {
    it(`writes aria-current "${token}" on the root, moves it to the button with onOpen, and removes it`, async () => {
      const { handle, row, button } = mountRow({ current });
      await settle();
      const root = row();
      assert.equal(root.getAttribute('aria-current'), token);
      assert.equal(handle.update({ name: NAME, current, onOpen() {} }), true);
      await settle();
      assert.ok(row() === root, 'the same root');
      assert.ok(!root.hasAttribute('aria-current'), 'off the root');
      assert.equal(button().getAttribute('aria-current'), token, 'on the button');
      const node = button();
      assert.equal(handle.update({ name: NAME, onOpen() {} }), true);
      await settle();
      assert.ok(button() === node && !node.hasAttribute('aria-current'), 'removed in place');
      handle.destroy();
    });
  }

  for (const current of [false, 'page', 'true', 1]) {
    it(`writes no aria-current for ${JSON.stringify(current)}, outside its set`, async () => {
      const { target, handle } = mountRow({ current });
      await settle();
      assert.equal(target.querySelectorAll('[aria-current]').length, 0);
      handle.destroy();
    });
  }

  it('draws no face of its own', async () => {
    const { handle, row } = mountRow({ current: 'step' });
    await settle();
    assert.ok(!row().classList.contains(FACE));
    handle.destroy();
  });
});

describe('the published ListRow busy', () => {
  it('writes aria-busy on the read-only root, swaps the mark for the spinner, and an update without it restores the mark', async () => {
    const { handle, row, mark } = mountRow({
      busy: true,
      art: 'icons/svg/item-bag.svg',
      tint: 'azure',
    });
    await settle();
    const root = row();
    assert.equal(root.getAttribute('aria-busy'), 'true');
    assert.ok(root.classList.contains('is-busy'));
    assert.deepEqual(glyphClasses(mark()), SPINNER, 'the spinner, not the art');
    assert.equal(mark().querySelector('i').getAttribute('aria-hidden'), 'true');
    assert.ok(!mark().hasAttribute('data-medallion-tint'), 'untinted');
    assert.equal(handle.update({ name: NAME, icon: 'fas fa-gem' }), true);
    await settle();
    assert.ok(row() === root, 'the same root');
    assert.ok(!root.hasAttribute('aria-busy') && !root.classList.contains('is-busy'));
    assert.deepEqual(glyphClasses(mark()), ['fas', 'fa-gem']);
    handle.destroy();
  });

  it('keeps the focused button enabled and busy, calls no onOpen on a press, and calls it once the work ends', async () => {
    const press = recorder();
    const { handle, row, button } = mountRow({ onOpen: press.record, markSize: 28 });
    await settle();
    const node = button();
    node.focus();
    assert.equal(
      handle.update({ name: NAME, onOpen: press.record, markSize: 28, busy: true }),
      true
    );
    await settle();
    assert.ok(button() === node && document.activeElement === node, 'the same focused button');
    assert.deepEqual(
      ['aria-busy', 'aria-disabled'].map((name) => node.getAttribute(name)),
      ['true', 'true']
    );
    assert.equal(node.disabled, false, 'never disabled');
    assert.ok(!row().hasAttribute('aria-busy'), 'and not the root');
    assert.equal(
      node.querySelector('.fab-medallion').style.width,
      '28px',
      'the spinner at the rung'
    );
    node.click();
    assert.deepEqual(press.calls, [], 'a press calls nothing');
    assert.equal(handle.update({ name: NAME, onOpen: press.record, markSize: 28 }), true);
    await settle();
    assert.ok(!node.hasAttribute('aria-busy') && !node.hasAttribute('aria-disabled'));
    node.click();
    assert.deepEqual(press.calls, [[]], 'and once it ends, a press calls onOpen');
    handle.destroy();
  });

  it('reads busy by truthiness, so the string false marks the row busy', async () => {
    const { handle, row } = mountRow({ busy: 'false' });
    await settle();
    assert.equal(row().getAttribute('aria-busy'), 'true');
    handle.destroy();
  });

  it('stays natively disabled beside disabled, with no aria-disabled', async () => {
    const { handle, button } = mountRow({ onOpen() {}, busy: true, disabled: true });
    await settle();
    assert.equal(button().disabled, true);
    assert.equal(button().getAttribute('aria-busy'), 'true');
    assert.ok(!button().hasAttribute('aria-disabled'));
    handle.destroy();
  });

  it('detaches leading while busy and attaches the same element again, intact, when it ends', async () => {
    const { handle, row, mark } = mountRow({ onOpen() {}, leading: true, markSize: 34 });
    const slot = handle.slot('leading');
    const portrait = slot.ownerDocument.createElement('span');
    portrait.textContent = 'portrait';
    slot.append(portrait);
    await settle();
    assert.ok(slot.isConnected && !mark(), 'leading in place of the mark');
    const kept = { name: NAME, onOpen() {}, leading: true, markSize: 34 };
    assert.equal(handle.update({ ...kept, busy: true }), true);
    await settle();
    assert.ok(!slot.isConnected, 'detached while busy');
    assert.deepEqual(glyphClasses(mark()), SPINNER, 'the spinner in its place');
    assert.equal(mark().style.width, '34px', 'sized by markSize');
    assert.equal(handle.update(kept), true);
    await settle();
    assert.ok(handle.slot('leading') === slot && slot.isConnected, 'the same element again');
    assert.ok(row().contains(portrait), 'with its content');
    handle.destroy();
  });
});

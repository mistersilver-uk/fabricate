/**
 * The published `ListRow`'s `markSize`, `density`, `layout`, `truncateName` and `detailAlign`
 * (issue 2850): each draws, an update changes or removes it in the same root, and a value outside
 * its set draws the default.
 * Limit: happy-dom lays nothing out, so the drawn sizes, the ellipsis and the card's column are
 * `list-row-geometry-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedListRowSeam } from '../helpers/publishedListRowSeam.js';

const NAME = 'Pattern-welded blade of the deep seam';
const { ui, mountRow } = publishedListRowSeam('fabricate-published-list-row-geometry-', NAME);

const byName = (left, right) => left.localeCompare(right);
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
const edgeOf = (mark) => [mark.style.width, mark.style.height];

/** Runs `body` with `console.warn` recorded, returning what it warned. */
async function warnings(body) {
  const warned = [];
  const warn = console.warn;
  console.warn = (message) => {
    warned.push(String(message));
  };
  try {
    await body();
  } finally {
    console.warn = warn;
  }
  return warned;
}

describe('the published ListRow describes its geometry keys', () => {
  it('lists each as an optional data key', () => {
    const { props } = ui().describe('ListRow');
    for (const key of ['markSize', 'density', 'layout', 'truncateName', 'detailAlign']) {
      assert.deepEqual(props[key], { kind: 'data', required: false }, key);
    }
  });
});

describe('the published ListRow markSize', () => {
  for (const size of [22, 26, 28, 30, 34, 38]) {
    it(`draws a ${size}px mark at ${size}, and an update without it draws 22px in the same root`, async () => {
      const { handle, row, mark } = mountRow({ markSize: size, onOpen() {} });
      await settle();
      const root = row();
      assert.deepEqual(edgeOf(mark()), [`${size}px`, `${size}px`]);
      assert.equal(handle.update({ name: NAME, onOpen() {} }), true);
      await settle();
      assert.ok(row() === root, 'the same root');
      assert.deepEqual(edgeOf(mark()), ['22px', '22px']);
      handle.destroy();
    });
  }

  it('changes the mark in place on an update, keeping its art', async () => {
    const { handle, row, mark } = mountRow({ markSize: 28, art: 'icons/svg/item-bag.svg' });
    await settle();
    const root = row();
    assert.equal(handle.update({ name: NAME, markSize: 34, art: 'icons/svg/item-bag.svg' }), true);
    await settle();
    assert.ok(row() === root, 'the same root');
    assert.deepEqual(edgeOf(mark()), ['34px', '34px']);
    assert.equal(mark().querySelector('img').getAttribute('src'), 'icons/svg/item-bag.svg');
    handle.destroy();
  });

  for (const [claim, markSize] of [
    ['a size off its set', 36],
    ['a numeric string', '28'],
    ['null', null],
  ]) {
    it(`draws the 22px mark for ${claim}, and warns`, async () => {
      let mounted;
      const warned = await warnings(async () => {
        mounted = mountRow({ markSize });
        await settle();
      });
      assert.deepEqual(edgeOf(mounted.mark()), ['22px', '22px']);
      assert.equal(warned.length, 1, warned.join(' | '));
      assert.match(warned[0], /markSize/);
      mounted.handle.destroy();
    });
  }

  it('sizes nothing while leading is requested', async () => {
    const { handle, mark } = mountRow({ markSize: 34, leading: true });
    await settle();
    assert.ok(!mark(), 'no mark is drawn');
    assert.ok(handle.slot('leading').isConnected, 'the leading slot element is');
    handle.destroy();
  });
});

describe('the published ListRow density, layout, truncateName and detailAlign', () => {
  for (const [key, value, classes, hook] of [
    ['density', 'default', ['is-form', 'is-default'], 'default'],
    ['layout', 'card', ['is-form', 'is-card'], 'dense'],
    ['truncateName', true, ['is-truncated'], 'dense'],
    ['detailAlign', 'end', ['is-detail-end'], 'dense'],
  ]) {
    it(`writes ${JSON.stringify(classes)} for ${key} ${JSON.stringify(value)}, and an update without it removes them`, async () => {
      const { handle, row } = mountRow({ [key]: value });
      await settle();
      const root = row();
      assert.deepEqual(
        authoredClasses(root).sort(byName),
        ['fabricate-list-row', ...classes].sort(byName)
      );
      assert.equal(root.getAttribute('data-list-row'), hook);
      assert.equal(handle.update({ name: NAME }), true);
      await settle();
      assert.ok(row() === root, 'the same root');
      assert.deepEqual(authoredClasses(root), ['fabricate-list-row'], 'replace, not merge');
      assert.equal(root.getAttribute('data-list-row'), 'dense');
      handle.destroy();
    });
  }

  for (const [key, value] of [
    ['density', 'compact'],
    ['density', 'Default'],
    ['layout', 'grid'],
    ['detailAlign', 'center'],
  ]) {
    it(`draws the default for ${key} ${JSON.stringify(value)}, outside its set`, async () => {
      const { handle, row } = mountRow({ [key]: value });
      await settle();
      assert.deepEqual(authoredClasses(row()), ['fabricate-list-row']);
      assert.equal(row().getAttribute('data-list-row'), 'dense');
      handle.destroy();
    });
  }

  it('keeps the whole name and detail in the DOM and in a native title when truncated', async () => {
    const detail = 'A gathering task drawn from the northern ridge';
    const { handle, row } = mountRow({ detail, truncateName: true, onOpen() {} });
    await settle();
    const name = row().querySelector('.fabricate-list-row-name');
    const drawn = row().querySelector('.fabricate-list-row-detail');
    assert.deepEqual([name.textContent, name.getAttribute('title')], [NAME, NAME]);
    assert.deepEqual([drawn.textContent, drawn.getAttribute('title')], [detail, detail]);
    assert.equal(handle.update({ name: NAME, detail, onOpen() {} }), true);
    await settle();
    assert.ok(!drawn.hasAttribute('title'), 'an untruncated detail carries no title');
    handle.destroy();
  });

  it('draws a card with onOpen as one button in the card root', async () => {
    const { target, handle, row, button } = mountRow({ layout: 'card', onOpen() {} });
    await settle();
    assert.ok(button().parentElement === row(), 'the button is the card’s child');
    assert.equal(target.querySelectorAll('button').length, 1);
    assert.deepEqual(
      [...button().children].map((child) => authoredClasses(child)[0]),
      ['fab-medallion', 'fabricate-list-row-body'],
      'the mark, then the body'
    );
    handle.destroy();
  });
});

describe('the published ListRow trailing across a density or layout change', () => {
  for (const [key, value] of [
    ['density', 'default'],
    ['layout', 'card'],
  ]) {
    it(`moves the bare trailing slot element into its wrapper for ${key} ${JSON.stringify(value)}, and back`, async () => {
      const { handle, row } = mountRow({ trailing: true });
      const slot = handle.slot('trailing');
      const control = slot.ownerDocument.createElement('button');
      control.type = 'button';
      control.textContent = 'Edit';
      slot.append(control);
      await settle();
      const wrapper = () => slot.closest('.fabricate-list-row-trailing');
      assert.ok(slot.isConnected && !wrapper(), 'bare in the dense row');
      assert.equal(handle.update({ name: NAME, trailing: true, [key]: value }), true);
      await settle();
      assert.ok(
        handle.slot('trailing') === slot && slot.isConnected,
        'the same element, connected'
      );
      assert.ok(wrapper()?.parentElement === row(), 'moved into the form’s trailing wrapper');
      assert.ok(slot.contains(control), 'with its children');
      assert.equal(handle.update({ name: NAME, trailing: true }), true);
      await settle();
      assert.ok(slot.isConnected && !wrapper() && slot.contains(control), 'and moved back, intact');
      handle.destroy();
    });
  }
});

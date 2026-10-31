/**
 * The published `StatBox`'s `children` slot (issue 2841): the band is drawn only while the slot is
 * requested, after the figure and label and before the note in both layouts; a published `FillBar`
 * mounted in it adds no role, name or text, so the box is read once; an update that changes the
 * layout, tone or note keeps the slot and what the companion drew there; and the key refuses what
 * it does not take.
 * Limit: happy-dom lays nothing out, so the band's width and spacing are `stat-box-slot-rendered`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, freshTarget, mountEntry } = publishedEntrySeam('fabricate-published-stat-box-slot-');
const REFUSAL = 'Fabricate | published components: ';
const TILE = Object.freeze({ value: '42%', label: 'Progress', layout: 'start' });

/** The box's element children as the part each is. */
const partsOf = (box) =>
  [...box.children].map((child) => {
    if (child.classList.contains('fab-kicker')) return 'label';
    if (child.classList.contains('fab-stat-box-value')) return 'figure';
    if (child.classList.contains('fab-stat-box-slot')) return 'band';
    if (child.classList.contains('fab-stat-box-note')) return 'note';
    return child.className;
  });

/** The box mounted with `props`, its handle, and its root as drawn now. */
async function mountBox(props) {
  const { target, handle } = mountEntry('StatBox', { ...TILE, ...props });
  await settle();
  return { target, handle, box: () => target.firstElementChild };
}

/** A thin `FillBar` mounted through the seam into a target the companion appends to `slot`. */
function mountTrack(seam, slot, value = 42) {
  const target = document.createElement('div');
  slot.append(target);
  return seam.mount('FillBar', { target, props: { value, density: 'thin', tone: 'accent' } });
}

describe('the published StatBox describes its slot', () => {
  it('lists children as a slot after note', () => {
    const { props } = ui().describe('StatBox');
    assert.deepEqual(Object.keys(props).slice(-2), ['note', 'children']);
    assert.deepEqual(props.children, { kind: 'slot', required: false });
  });
});

describe('the published StatBox band', () => {
  for (const children of [undefined, false]) {
    it(`draws no band for children ${String(children)}, nor any element in its place`, async () => {
      const { handle, box } = await mountBox({ children, note: 'Two to go' });
      assert.deepEqual(partsOf(box()), ['label', 'figure', 'note']);
      assert.ok(!handle.slot('children'), 'no slot element is given');
      handle.destroy();
    });
  }

  for (const [layout, order] of [
    ['start', ['label', 'figure', 'band', 'note']],
    ['default', ['figure', 'label', 'band', 'note']],
  ]) {
    it(`draws the band after the figure and label and before the note at ${layout}`, async () => {
      const { handle, box } = await mountBox({ layout, children: true, note: 'Two to go' });
      assert.deepEqual(partsOf(box()), order);
      const band = box().querySelector(':scope > .fab-stat-box-slot');
      const slot = handle.slot('children');
      assert.equal(slot.localName, 'div');
      assert.ok(band.contains(slot), 'the slot element is in the band');
      handle.destroy();
    });
  }
});

describe('a published FillBar mounted in the band', () => {
  it('draws inside the band and adds no role, no name and no text, so the box is read once', async () => {
    const seam = ui();
    const target = freshTarget();
    const handle = seam.mount('StatBox', { target, props: { ...TILE, children: true } });
    await settle();
    const track = mountTrack(seam, handle.slot('children'));
    await settle();
    const box = target.firstElementChild;
    const bar = box.querySelector(':scope > .fab-stat-box-slot .fab-fill-bar');
    assert.ok(bar, 'the bar is drawn in the band');
    assert.equal(bar.getAttribute('data-fill-bar-tone'), 'accent');
    const named = [box, ...box.querySelectorAll('*')].filter((node) =>
      [...node.attributes].some(
        ({ name }) => name === 'role' || name === 'title' || name.startsWith('aria-')
      )
    );
    assert.deepEqual(
      named.map((node) => node.className),
      [],
      'nothing in the box carries a role or a name'
    );
    assert.equal(box.textContent.replaceAll(/\s+/gu, ' ').trim(), 'Progress 42%');
    track.destroy();
    handle.destroy();
  });

  it('keeps the slot and the bar across updates to layout, tone and note, and ends the bar with the box', async () => {
    const seam = ui();
    const target = freshTarget();
    const handle = seam.mount('StatBox', { target, props: { ...TILE, children: true } });
    await settle();
    const slot = handle.slot('children');
    const track = mountTrack(seam, slot);
    await settle();
    const bar = slot.querySelector('.fab-fill-bar');
    for (const props of [
      { layout: 'default' },
      { tone: 'success', value: '100%' },
      { note: 'Done' },
      { tone: 'danger' },
    ]) {
      assert.equal(handle.update({ ...TILE, ...props, children: true }), true);
      await settle();
      assert.ok(handle.slot('children') === slot && slot.isConnected, JSON.stringify(props));
      assert.ok(slot.querySelector('.fab-fill-bar') === bar, 'the same bar element');
    }
    assert.equal(handle.update({ ...TILE }), true);
    await settle();
    assert.ok(!target.querySelector('.fab-stat-box-slot'), 'dropping children drops the band');
    handle.destroy();
    assert.equal(track.update({ value: 50 }), false, 'the nested bar ended with the box');
  });
});

describe('the published StatBox refuses', () => {
  for (const [props, tail] of [
    [{ children: 'track' }, '"children" is a slot and takes true or false'],
    [{ children: 1 }, '"children" is a slot and takes true or false'],
  ]) {
    it(`${JSON.stringify(props)}: ${tail}`, () => {
      const target = freshTarget();
      assert.throws(() => ui().mount('StatBox', { target, props: { ...TILE, ...props } }), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      assert.equal(target.childNodes.length, 0);
    });
  }
});

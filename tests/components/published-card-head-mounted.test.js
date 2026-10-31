/**
 * The published `InspectorCard`'s `tone`, `title`, `note`, `leading` and `trailing`, and the
 * published `Well`'s `tone` (issue 2854): each tone writes its one class and any other value
 * none; the head is drawn only for a `title`, as a level-3 heading over the note, between the two
 * span slots and before the content slot; an update that drops and restores the title keeps the
 * slot elements and what a companion drew in them; and the keys refuse what they do not take.
 * Limit: happy-dom lays nothing out, so the drawn edges, fills, faces and wrapping are
 * `card-head-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, freshTarget, mountEntry } = publishedEntrySeam('fabricate-published-card-head-');
const REFUSAL = 'Fabricate | published components: ';
const TONES = Object.freeze(['warning', 'success', 'accent', 'info']);
const UNTONED = Object.freeze(['', 'danger', 'neutral', 'Warning', ' info', 1, true, null]);
const HEAD = Object.freeze({
  title: 'Activity limits',
  note: 'How many activities a character may run at once.',
  leading: true,
  trailing: true,
  children: true,
});

const toneClasses = (element) =>
  [...element.classList].filter((name) => name.startsWith('is-tone-'));

/** The card mounted with `props`: its handle and its root as drawn now. */
async function mountCard(props) {
  const { target, handle } = mountEntry('InspectorCard', props);
  await settle();
  return { target, handle, card: () => target.firstElementChild };
}

describe('the published InspectorCard describes its head and tone', () => {
  it('lists tone, title, note, leading and trailing after children', () => {
    assert.deepEqual(ui().describe('InspectorCard').props, {
      children: { kind: 'slot', required: false },
      tone: { kind: 'data', required: false },
      title: { kind: 'text', required: false },
      note: { kind: 'text', required: false },
      leading: { kind: 'slot', required: false },
      trailing: { kind: 'slot', required: false },
    });
    assert.deepEqual(ui().describe('Well').props.tone, { kind: 'data', required: false });
  });
});

describe('the published InspectorCard tone', () => {
  for (const tone of TONES) {
    it(`writes is-tone-${tone} for "${tone}", and an update without it removes it from the same card`, async () => {
      const { handle, card } = await mountCard({ tone, children: true });
      const drawn = card();
      assert.deepEqual(toneClasses(drawn), [`is-tone-${tone}`]);
      assert.equal(handle.update({ children: true }), true);
      await settle();
      assert.ok(card() === drawn, 'the same card');
      assert.deepEqual(toneClasses(card()), []);
      handle.destroy();
    });
  }

  it('writes no tone class for a value outside the four, nothing coerced', async () => {
    for (const tone of UNTONED) {
      const { handle, card } = await mountCard({ tone, children: true });
      assert.deepEqual(toneClasses(card()), [], JSON.stringify(tone));
      handle.destroy();
    }
  });
});

describe('the published InspectorCard head', () => {
  it('draws no head without a title, so the card holds its content slot alone', async () => {
    const { handle, card } = await mountCard({ ...HEAD, title: undefined });
    assert.ok(!card().querySelector('.fab-card-head, h3'), 'no head');
    assert.deepEqual(
      [...card().children].map((child) => child.contains(handle.slot('children'))),
      [true],
      'the content slot alone'
    );
    for (const key of ['leading', 'trailing']) {
      assert.ok(!handle.slot(key).isConnected, `${key} is not drawn`);
    }
    assert.ok(!card().textContent.includes(HEAD.note), 'nor the note');
    handle.destroy();
  });

  it('draws a level-3 heading over the note, between the leading and trailing spans, before the content slot', async () => {
    const { handle, card } = await mountCard(HEAD);
    const head = card().firstElementChild;
    assert.ok(head.classList.contains('fab-card-head'), 'the head comes first');
    const [identity, trailing] = head.children;
    assert.equal(head.children.length, 2, 'the tile and heading together, then the trailing span');
    const [leading, heading] = identity.children;
    assert.equal(identity.children.length, 2);
    assert.ok(leading.contains(handle.slot('leading')), 'the leading slot first');
    assert.ok(trailing.contains(handle.slot('trailing')), 'the trailing slot last');
    assert.deepEqual(
      ['leading', 'trailing'].map((key) => handle.slot(key).localName),
      ['span', 'span']
    );
    const title = heading.querySelector(':scope > h3.fab-card-title');
    assert.equal(title.textContent, HEAD.title);
    const note = heading.querySelector(':scope > p.fab-card-note');
    assert.equal(note.textContent, HEAD.note);
    assert.ok(title.nextElementSibling === note, 'the note under the title');
    assert.ok(card().children[1].contains(handle.slot('children')), 'then the content slot');
    assert.equal(card().querySelectorAll('h3').length, 1);
    handle.destroy();
  });

  it('draws the head with a blank heading for a title of white space alone, as its group states', async () => {
    const blank = ' '.repeat(3);
    const { handle, card } = await mountCard({ title: blank, children: true });
    assert.equal(card().querySelector(':scope .fab-card-head h3')?.textContent, blank);
    handle.destroy();
  });

  it('draws the title as text, never markup, and drops the note for an empty one', async () => {
    const { handle, card } = await mountCard({ title: '<b>Limits</b>', note: '' });
    assert.equal(card().querySelector('h3').textContent, '<b>Limits</b>');
    assert.ok(!card().querySelector('b, .fab-card-note'));
    handle.destroy();
  });

  it('keeps the slot elements and what the companion drew in them across an update that drops and restores the title', async () => {
    const seam = ui();
    const target = freshTarget();
    const handle = seam.mount('InspectorCard', { target, props: HEAD });
    await settle();
    const buttonTarget = document.createElement('span');
    handle.slot('trailing').append(buttonTarget);
    let presses = 0;
    const button = seam.mount('Button', {
      target: buttonTarget,
      props: { children: 'Manage', onclick: () => (presses += 1) },
    });
    await settle();
    const slot = handle.slot('trailing');
    const before = slot.querySelector('button');
    assert.ok(before, 'the companion button is drawn before the drop');
    assert.equal(handle.update({ ...HEAD, title: undefined }), true);
    await settle();
    assert.ok(!slot.isConnected && !target.querySelector('.fab-card-head'), 'head removed');
    assert.equal(handle.update(HEAD), true);
    await settle();
    assert.ok(handle.slot('trailing') === slot && slot.isConnected, 'the same slot, drawn again');
    const drawn = target.querySelector(':scope .fab-card-trailing button');
    assert.ok(drawn === before, 'the same companion button element is back in it');
    drawn.click();
    assert.equal(presses, 1, 'and still answers');
    assert.equal(button.update({ children: 'Manage', onclick: () => {} }), true);
    handle.destroy();
    assert.equal(button.update({ children: 'Manage', onclick: () => {} }), false, 'ended with it');
  });
});

describe('the published InspectorCard head across a title change', () => {
  it('keeps the head, its slot elements and the focused control in place when only the title text changes', async () => {
    const { target, handle, card } = await mountCard(HEAD);
    const head = card().querySelector('.fab-card-head');
    const heading = head.querySelector('h3');
    const control = document.createElement('button');
    handle.slot('trailing').append(control);
    control.focus();
    assert.equal(handle.update({ ...HEAD, title: 'Activity limits for the party' }), true);
    await settle();
    assert.ok(card().querySelector('.fab-card-head') === head, 'the same head');
    assert.ok(head.querySelector('h3') === heading, 'the same heading');
    assert.equal(heading.textContent, 'Activity limits for the party');
    assert.ok(head.contains(handle.slot('trailing')) && head.contains(control), 'slot in place');
    assert.ok(document.activeElement === control, 'focus stays on the control');
    assert.ok(target.contains(control));
    handle.destroy();
  });
});

describe('the published InspectorCard refuses', () => {
  for (const [props, tail] of [
    [{ title: 3 }, '"title" must be a string'],
    [{ note: ['a'] }, '"note" must be a string'],
    [{ leading: 'tile' }, '"leading" is a slot and takes true or false'],
    [{ trailing: 1 }, '"trailing" is a slot and takes true or false'],
    [{ tone: () => 'warning' }, '"tone" must not hold a function'],
    [{ titleLevel: 2 }, '"titleLevel" is not a data attribute'],
  ]) {
    it(`${JSON.stringify(Object.keys(props))}: ${tail}`, () => {
      const target = freshTarget();
      assert.throws(() => ui().mount('InspectorCard', { target, props }), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      assert.equal(target.childNodes.length, 0);
    });
  }
});

describe('the published Well tone', () => {
  for (const tone of TONES) {
    it(`writes is-tone-${tone} beside its label's group naming`, async () => {
      const { target, handle } = mountEntry('Well', { tone, label: 'Reagents', children: true });
      await settle();
      const well = target.firstElementChild;
      assert.deepEqual(toneClasses(well), [`is-tone-${tone}`]);
      assert.equal(well.getAttribute('role'), 'group');
      handle.update({ label: 'Reagents', children: true });
      await settle();
      assert.ok(target.firstElementChild === well && toneClasses(well).length === 0);
      handle.destroy();
    });
  }

  it('writes no tone class for a value outside the four', async () => {
    for (const tone of UNTONED) {
      const { target, handle } = mountEntry('Well', { tone, children: true });
      await settle();
      assert.deepEqual(toneClasses(target.firstElementChild), [], JSON.stringify(tone));
      handle.destroy();
    }
  });
});

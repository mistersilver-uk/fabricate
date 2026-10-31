/**
 * Issue 2858 — the published `Chip`'s `ariaLabel`, its icon-only form and its `dashed` emphasis on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table,
 * into a companion target under no Fabricate ancestor: the glyph drawn alone as a named image with
 * its name as the Foundry tooltip, a labelled chip whose label is hidden from assistive technology
 * beside its name as visually hidden text, the M9 waiver that lets `children` be empty or blank only
 * beside a non-blank `icon` and `ariaLabel`, M22 on a name beside a label, the tones the seam
 * withholds, and the `dashed` class, each across an `update`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PREFIX } from '../helpers/publishedComponentFakes.js';
import { companionTarget, settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui } = publishedEntrySeam('fabricate-published-chip-icon-only-');

const ROOT = 'manager-chip';
const GLYPH = { icon: 'fas fa-hourglass-half', ariaLabel: 'Waiting on your roll' };

/** A chip mounted with `props` into a companion target: its handle and the chip as drawn now. */
function mountChip(props) {
  const shells = [];
  const target = companionTarget(shells);
  const handle = ui().mount('Chip', { target, props });
  return {
    handle,
    chip: () => target.querySelector(`.${ROOT}`),
    remove: () => {
      for (const shell of shells) shell.remove();
    },
  };
}

const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The chip's own name, role, tooltip and focus attributes, as written now. */
const namingOf = (chip) =>
  Object.fromEntries(
    ['role', 'aria-label', 'data-tooltip-text', 'tabindex', 'title'].map((name) => [
      name,
      chip.getAttribute(name),
    ])
  );

/** A labelled chip's two text parts: the label hidden from assistive technology, and the name. */
const spokenOf = (chip) => {
  const [label, name, ...rest] = chip.children;
  return {
    label: [label?.getAttribute('aria-hidden'), label?.textContent],
    name: [classesOf(name ?? chip), name?.textContent],
    rest: rest.length,
  };
};

const UNNAMED = Object.freeze({
  role: null,
  'aria-label': null,
  'data-tooltip-text': null,
  tabindex: null,
  title: null,
});

const fault = (message) => ({ name: 'TypeError', message: `${PREFIX}${message}` });

describe('the published Chip, icon-only', () => {
  for (const children of [undefined, '']) {
    it(`draws the glyph alone as an image named by ariaLabel for children ${JSON.stringify(children)}`, async () => {
      const mounted = mountChip({ ...GLYPH, children, tone: 'warning' });
      await settle();
      const chip = mounted.chip();
      assert.equal(chip.localName, 'span');
      assert.deepEqual(classesOf(chip), [ROOT, 'is-warning', 'is-icon-only']);
      assert.deepEqual(namingOf(chip), {
        role: 'img',
        'aria-label': GLYPH.ariaLabel,
        'data-tooltip-text': GLYPH.ariaLabel,
        tabindex: null,
        title: null,
      });
      const [glyph, ...rest] = chip.children;
      assert.deepEqual(classesOf(glyph), ['fas', 'fa-hourglass-half']);
      assert.equal(glyph.getAttribute('aria-hidden'), 'true');
      assert.deepEqual(rest, []);
      assert.equal(chip.textContent, '', 'no text beside the glyph');
      mounted.handle.destroy();
      mounted.remove();
    });
  }

  it('moves to the labelled form on an update that passes children, and back', async () => {
    const mounted = mountChip(GLYPH);
    await settle();
    const label = 'Waiting';
    assert.equal(mounted.handle.update({ ...GLYPH, children: label }), true);
    await settle();
    assert.deepEqual(classesOf(mounted.chip()), [ROOT]);
    assert.deepEqual(namingOf(mounted.chip()), UNNAMED);
    assert.equal(mounted.chip().querySelector('[aria-hidden="true"]:not(i)').textContent, label);
    assert.equal(mounted.chip().querySelector('.manager-chip-name').textContent, GLYPH.ariaLabel);
    assert.equal(mounted.handle.update(GLYPH), true);
    await settle();
    assert.deepEqual(classesOf(mounted.chip()), [ROOT, 'is-icon-only']);
    assert.equal(mounted.chip().getAttribute('data-tooltip-text'), GLYPH.ariaLabel);
    mounted.handle.destroy();
    mounted.remove();
  });

  it('lets a rest data-tooltip-text replace the tooltip, and keeps the name', async () => {
    const mounted = mountChip({ ...GLYPH, 'data-tooltip-text': 'Roll Wits to continue' });
    await settle();
    assert.equal(mounted.chip().getAttribute('data-tooltip-text'), 'Roll Wits to continue');
    assert.equal(mounted.chip().getAttribute('aria-label'), GLYPH.ariaLabel);
    mounted.handle.destroy();
    mounted.remove();
  });

  for (const children of [' ', '\t\n']) {
    it(`treats children of white space alone, ${JSON.stringify(children)}, as absent beside both keys`, async () => {
      const mounted = mountChip({ ...GLYPH, children });
      await settle();
      assert.deepEqual(classesOf(mounted.chip()), [ROOT, 'is-icon-only']);
      assert.equal(mounted.chip().getAttribute('role'), 'img');
      assert.equal(mounted.chip().textContent, '', 'no blank label beside the glyph');
      mounted.handle.destroy();
      mounted.remove();
    });
  }

  it('still draws children of white space alone without both keys, as before', async () => {
    const mounted = mountChip({ children: ' ', icon: GLYPH.icon });
    await settle();
    assert.deepEqual(classesOf(mounted.chip()), [ROOT]);
    assert.equal(mounted.chip().textContent, ' ');
    mounted.handle.destroy();
    mounted.remove();
  });

  it('draws no label span beside the glyph under truncate', async () => {
    const mounted = mountChip({ ...GLYPH, truncate: true });
    await settle();
    assert.deepEqual(classesOf(mounted.chip()), [ROOT, 'is-truncated', 'is-icon-only']);
    assert.deepEqual(
      [...mounted.chip().children].map((child) => child.localName),
      ['i'],
      'the glyph alone'
    );
    mounted.handle.destroy();
    mounted.remove();
  });

  it('draws the 15px square at the list density', async () => {
    const mounted = mountChip({ ...GLYPH, density: 'list' });
    await settle();
    assert.deepEqual(classesOf(mounted.chip()), [ROOT, 'is-list', 'is-icon-only']);
    mounted.handle.destroy();
    mounted.remove();
  });
});

describe('the published Chip, a name beside a label', () => {
  it('keeps the truncated label wrapper on the hidden label', async () => {
    const mounted = mountChip({ children: '3', ariaLabel: '3 days waiting', truncate: true });
    await settle();
    const label = mounted.chip().querySelector('[aria-hidden="true"]');
    assert.deepEqual(classesOf(label), ['manager-chip-label']);
    mounted.handle.destroy();
    mounted.remove();
  });

  it('hides the label from assistive technology and draws the name beside it, with no role or tooltip', async () => {
    const mounted = mountChip({ children: '3', ariaLabel: '3 days waiting' });
    await settle();
    assert.deepEqual(namingOf(mounted.chip()), UNNAMED);
    assert.deepEqual(spokenOf(mounted.chip()), {
      label: ['true', '3'],
      name: [['manager-chip-name'], '3 days waiting'],
      rest: 0,
    });
    mounted.handle.destroy();
    mounted.remove();
  });

  for (const ariaLabel of ['', ' '.repeat(2), 7, null, false]) {
    it(`draws no name and no role for an ariaLabel of ${JSON.stringify(ariaLabel)} beside a label`, async () => {
      const mounted = mountChip({ children: 'Locked', icon: 'fas fa-lock', ariaLabel });
      await settle();
      assert.deepEqual(classesOf(mounted.chip()), [ROOT]);
      for (const name of ['role', 'aria-label', 'data-tooltip-text']) {
        assert.ok(!mounted.chip().hasAttribute(name), `no ${name}`);
      }
      assert.equal(mounted.chip().querySelectorAll('[aria-hidden="true"]:not(i)').length, 0);
      assert.equal(mounted.chip().querySelectorAll('.manager-chip-name').length, 0);
      mounted.handle.destroy();
      mounted.remove();
    });
  }

  it('M22: refuses a name that does not hold the label, on mount and on update', async () => {
    const target = companionTarget([]);
    assert.throws(
      () => ui().mount('Chip', { target, props: { children: '3', ariaLabel: 'Three days' } }),
      fault('"ariaLabel" must contain the text of "children" ("3" is not in "Three days")')
    );
    target.parentElement.remove();
    const mounted = mountChip({ children: '3', ariaLabel: '3 days waiting' });
    await settle();
    assert.throws(
      () => mounted.handle.update({ children: '4', ariaLabel: '3 days waiting' }),
      fault('"ariaLabel" must contain the text of "children" ("4" is not in "3 days waiting")')
    );
    await settle();
    assert.equal(
      mounted.chip().querySelector('.manager-chip-name').textContent,
      '3 days waiting',
      'the earlier props'
    );
    mounted.handle.destroy();
    mounted.remove();
  });
});

describe('what an empty published Chip label needs', () => {
  for (const [claim, props, message] of [
    ['neither key', {}, 'Chip requires a non-empty "children"'],
    [
      'an icon alone',
      { icon: GLYPH.icon },
      'Chip requires a non-blank "ariaLabel" when "children" is empty',
    ],
    [
      'an ariaLabel alone',
      { ariaLabel: GLYPH.ariaLabel },
      'Chip requires a non-blank "icon" when "children" is empty',
    ],
    [
      'a blank ariaLabel',
      { icon: GLYPH.icon, ariaLabel: '  ' },
      'Chip requires a non-blank "ariaLabel" when "children" is empty',
    ],
    [
      'a blank icon',
      { icon: ' ', ariaLabel: GLYPH.ariaLabel },
      'Chip requires a non-blank "icon" when "children" is empty',
    ],
    [
      'an ariaLabel that is no string',
      { icon: GLYPH.icon, ariaLabel: 7 },
      'Chip requires a non-blank "ariaLabel" when "children" is empty',
    ],
  ]) {
    for (const children of [undefined, '']) {
      it(`refuses ${claim} with children ${JSON.stringify(children)} (M9), naming what is missing`, () => {
        const target = companionTarget([]);
        assert.throws(
          () => ui().mount('Chip', { target, props: { ...props, children } }),
          fault(message)
        );
        assert.equal(target.childNodes.length, 0, 'nothing is drawn');
        target.parentElement.remove();
      });
    }
  }

  it('refuses an update that empties the label without both keys, and leaves the earlier chip drawn', async () => {
    const mounted = mountChip({ children: 'Locked', icon: 'fas fa-lock' });
    await settle();
    assert.throws(
      () => mounted.handle.update({ icon: 'fas fa-lock' }),
      fault('Chip requires a non-blank "ariaLabel" when "children" is empty')
    );
    await settle();
    assert.equal(mounted.chip().textContent, 'Locked');
    mounted.handle.destroy();
    mounted.remove();
  });

  it('still describes children as required text, and ariaLabel as optional data', () => {
    const { props } = ui().describe('Chip');
    assert.deepEqual(props.children, { kind: 'text', required: true });
    assert.deepEqual(props.ariaLabel, { kind: 'data', required: false });
  });
});

describe('the tones the seam withholds from the published Chip', () => {
  for (const tone of ['active', 'disabled', 'negative', 'muted', 'tag', 'secondary', 'subtle']) {
    it(`draws the ${tone} tone as no tone, on the labelled and the icon-only chip`, async () => {
      const labelled = mountChip({ children: 'Locked', tone });
      const glyph = mountChip({ ...GLYPH, tone });
      await settle();
      assert.deepEqual(classesOf(labelled.chip()), [ROOT]);
      assert.deepEqual(classesOf(glyph.chip()), [ROOT, 'is-icon-only']);
      for (const mounted of [labelled, glyph]) {
        mounted.handle.destroy();
        mounted.remove();
      }
    });
  }

  it('passes the six published tones through', async () => {
    for (const tone of ['positive', 'warning', 'danger', 'info', 'neutral', 'accent']) {
      const mounted = mountChip({ ...GLYPH, tone });
      await settle();
      assert.deepEqual(classesOf(mounted.chip()), [ROOT, `is-${tone}`, 'is-icon-only'], tone);
      mounted.handle.destroy();
      mounted.remove();
    }
  });
});

describe('the published Chip, dashed', () => {
  it('writes is-dashed beside the tone, on the labelled and the icon-only chip, and drops it on an update', async () => {
    const labelled = mountChip({ children: 'Locked', tone: 'neutral', emphasis: 'dashed' });
    const glyph = mountChip({ ...GLYPH, emphasis: 'dashed' });
    await settle();
    assert.deepEqual(classesOf(labelled.chip()), [ROOT, 'is-neutral', 'is-dashed']);
    assert.deepEqual(classesOf(glyph.chip()), [ROOT, 'is-dashed', 'is-icon-only']);
    assert.equal(labelled.handle.update({ children: 'Locked', tone: 'neutral' }), true);
    await settle();
    assert.deepEqual(classesOf(labelled.chip()), [ROOT, 'is-neutral']);
    for (const mounted of [labelled, glyph]) {
      mounted.handle.destroy();
      mounted.remove();
    }
  });

  for (const emphasis of ['Dashed', 'dotted', true]) {
    it(`draws the default chip for ${JSON.stringify(emphasis)}`, async () => {
      const mounted = mountChip({ children: 'Locked', emphasis });
      await settle();
      assert.deepEqual(classesOf(mounted.chip()), [ROOT]);
      mounted.handle.destroy();
      mounted.remove();
    });
  }
});

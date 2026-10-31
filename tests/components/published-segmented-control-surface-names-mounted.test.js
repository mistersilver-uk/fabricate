/**
 * Issue 2856 — the published `SegmentedControl`'s `surface` and an option's `ariaLabel` on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table:
 * the `is-panel` class `'panel'` alone writes, beside every density, tone and shape, and its removal
 * on an `update`; the radio named by a non-blank `ariaLabel` and by its label otherwise; and M22,
 * which refuses an option name that does not hold its label, on `mount` and on `update`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PREFIX } from '../helpers/publishedComponentFakes.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, mountEntry } = publishedEntrySeam('fabricate-published-segmented-surface-names-');

const OPTIONS = Object.freeze([
  { value: 'oak', label: 'Oak', ariaLabel: 'Oak, chosen by Mira' },
  { value: 'ash', label: 'Ash' },
  { value: 'yew', label: 'Yew', ariaLabel: 'Yew, not chosen' },
]);

/** A control over `OPTIONS` mounted under a Fabricate window, and readers for its parts. */
function mountControl(props = {}) {
  const { target, handle } = mountEntry('SegmentedControl', {
    options: OPTIONS,
    value: 'oak',
    ariaLabel: 'Reward choice',
    onChange() {},
    ...props,
  });
  return {
    handle,
    group: () => target.querySelector('[role="radiogroup"]'),
    radios: () => [...target.querySelectorAll('input[type="radio"]')],
  };
}

const update = (handle, props) =>
  handle.update({
    options: OPTIONS,
    value: 'oak',
    ariaLabel: 'Reward choice',
    onChange() {},
    ...props,
  });

const nameOf = (radio) => radio.getAttribute('aria-label');

describe('the published SegmentedControl surface', () => {
  it('writes is-panel for surface "panel" beside every density, tone and shape, and drops it on an update', async () => {
    for (const density of ['default', 'compact', 'field', 'inline']) {
      for (const look of [{}, { tone: 'accent' }, { tone: 'info' }, { shape: 'pill' }]) {
        const { handle, group } = mountControl({ surface: 'panel', density, ...look });
        await settle();
        assert.ok(group().classList.contains('is-panel'), `${density} ${JSON.stringify(look)}`);
        assert.equal(update(handle, { density, ...look }), true);
        await settle();
        assert.ok(!group().classList.contains('is-panel'), 'an update without it drops it');
        handle.destroy();
      }
    }
  });

  for (const surface of ['default', 'Panel', 'card', true, 'false', 0, undefined]) {
    it(`draws the default track for surface ${JSON.stringify(surface)}, coercing nothing`, async () => {
      const { handle, group } = mountControl({ surface });
      await settle();
      assert.ok(!group().classList.contains('is-panel'));
      handle.destroy();
    });
  }

  it('describes surface as an optional data key and options as required data, nothing more', () => {
    const { props } = ui().describe('SegmentedControl');
    assert.deepEqual(props.surface, { kind: 'data', required: false });
    assert.deepEqual(props.options, { kind: 'data', required: true });
  });
});

describe('the published SegmentedControl option names', () => {
  it('names a radio by a non-blank ariaLabel on the radio itself, and leaves the others to their label', async () => {
    const { handle, radios } = mountControl();
    await settle();
    assert.deepEqual(radios().map(nameOf), ['Oak, chosen by Mira', null, 'Yew, not chosen']);
    for (const radio of radios()) {
      assert.equal(radio.closest('label').querySelector('.manager-segment-label').tagName, 'SPAN');
    }
    assert.deepEqual(
      radios().map((radio) => radio.closest('label').textContent.trim()),
      ['Oak', 'Ash', 'Yew'],
      'the visible label is unchanged'
    );
    handle.destroy();
  });

  it('moves, rewrites and removes a name across updates on the same radios', async () => {
    const { handle, radios } = mountControl();
    await settle();
    const before = radios();
    const moved = [
      { value: 'oak', label: 'Oak', ariaLabel: 'Oak, not chosen' },
      { value: 'ash', label: 'Ash', ariaLabel: 'Ash, chosen by Mira' },
      { value: 'yew', label: 'Yew' },
    ];
    assert.equal(update(handle, { options: moved, value: 'ash' }), true);
    await settle();
    assert.deepEqual(radios(), before, 'the same radios');
    assert.deepEqual(radios().map(nameOf), ['Oak, not chosen', 'Ash, chosen by Mira', null]);
    handle.destroy();
  });

  for (const ariaLabel of ['', ' '.repeat(3), 7, null, false]) {
    it(`writes no name for an ariaLabel of ${JSON.stringify(ariaLabel)}, so the label names the radio`, async () => {
      const { handle, radios } = mountControl({
        options: [{ value: 'oak', label: 'Oak', ariaLabel }],
      });
      await settle();
      assert.equal(radios()[0].hasAttribute('aria-label'), false);
      handle.destroy();
    });
  }

  it('M22: refuses an option name that does not hold its label, naming the option, on mount', () => {
    const { mount } = ui();
    const options = [
      { value: 'oak', label: 'Oak' },
      { value: 'ash', label: 'Ash', ariaLabel: 'Ashen, chosen by Mira' },
    ];
    assert.throws(
      () =>
        mount('SegmentedControl', {
          target: globalThis.document.createElement('div'),
          props: { options, value: 'oak', ariaLabel: 'Reward choice', onChange() {} },
        }),
      {
        name: 'TypeError',
        message: `${PREFIX}"options[1].ariaLabel" must contain the text of "options[1].label" ("Ash" is not in "Ashen, chosen by Mira")`,
      }
    );
  });

  it('M22: refuses such an update and leaves the earlier names drawn', async () => {
    const { handle, radios } = mountControl();
    await settle();
    const renamed = [{ value: 'oak', label: 'Oak tree', ariaLabel: 'Oak, chosen by Mira' }];
    assert.throws(() => update(handle, { options: renamed }), {
      message: `${PREFIX}"options[0].ariaLabel" must contain the text of "options[0].label" ("Oak tree" is not in "Oak, chosen by Mira")`,
    });
    await settle();
    assert.deepEqual(radios().map(nameOf), ['Oak, chosen by Mira', null, 'Yew, not chosen']);
    handle.destroy();
  });

  it('M22: holds a numeric label as its digits, and takes a name that holds them', async () => {
    const taken = mountControl({ options: [{ value: 10, label: 10, ariaLabel: '10 per page' }] });
    await settle();
    assert.equal(nameOf(taken.radios()[0]), '10 per page');
    taken.handle.destroy();
    const { mount } = ui();
    assert.throws(
      () =>
        mount('SegmentedControl', {
          target: globalThis.document.createElement('div'),
          props: {
            options: [{ value: 10, label: 10, ariaLabel: 'Ten per page' }],
            ariaLabel: 'Page size',
            onChange() {},
          },
        }),
      { message: /"options\[0\]\.ariaLabel" must contain the text of "options\[0\]\.label"/u }
    );
  });
});

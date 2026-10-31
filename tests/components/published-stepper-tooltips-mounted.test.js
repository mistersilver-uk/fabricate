/**
 * The published `Stepper`'s `decrementTooltip` and `incrementTooltip` (issue 2852) on Fabricate's
 * real Svelte runtime, through a fresh seam registered with the adapter's own table, under a
 * Fabricate window root: each written as its button's plain tooltip text, beside the name it does
 * not replace, and opened under keyboard focus through the runtime's facade and closed again.
 * Limit: happy-dom does not tell a keyboard focus from a pointer one, so each focus clause answers
 * `:focus-visible` on the button.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { escapeKey, keyboardFocus, withTooltip } from '../helpers/keyboardTooltipProbe.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { STEPPER_NAMES, base, installStepperSeam } from '../helpers/publishedStepperFixture.js';

const { ui, mountStepper } = installStepperSeam('fabricate-published-stepper-tooltips-');

const TIPS = Object.freeze({
  decrementTooltip: 'One day fewer',
  incrementTooltip: 'One day more',
});

afterEach(() => {
  delete globalThis.game.tooltip;
});

describe('the published Stepper, step button tooltips', () => {
  it('describes both keys as optional data', () => {
    const { props } = ui().describe('Stepper');
    for (const key of Object.keys(TIPS)) {
      assert.deepEqual(props[key], { kind: 'data', required: false }, key);
    }
  });

  it('writes each as its own button’s plain tooltip text, the names unchanged, and drops it on update', async () => {
    const { handle, decrement, increment } = mountStepper(TIPS);
    await settle();
    const [down, up] = [decrement(), increment()];
    assert.deepEqual(
      [down.getAttribute('data-tooltip-text'), up.getAttribute('data-tooltip-text')],
      [TIPS.decrementTooltip, TIPS.incrementTooltip]
    );
    assert.deepEqual(
      [down.getAttribute('aria-label'), up.getAttribute('aria-label')],
      [STEPPER_NAMES.decrementLabel, STEPPER_NAMES.incrementLabel]
    );
    assert.ok(!down.hasAttribute('title') && !down.hasAttribute('data-tooltip'), 'no other path');
    assert.equal(handle.update(base({ incrementTooltip: '  ' })), true);
    await settle();
    assert.ok(decrement() === down && increment() === up, 'the same buttons');
    assert.ok(!down.hasAttribute('data-tooltip-text') && !up.hasAttribute('data-tooltip-text'));
    handle.destroy();
  });

  for (const value of [7, true, '']) {
    it(`writes no tooltip for ${JSON.stringify(value)}`, async () => {
      const { handle, increment } = mountStepper({ incrementTooltip: value });
      await settle();
      assert.ok(!increment().hasAttribute('data-tooltip-text'));
      handle.destroy();
    });
  }

  it('opens each under keyboard focus through the runtime’s facade, and closes it on blur', async () => {
    const tooltip = withTooltip();
    const { handle, decrement, increment } = mountStepper(TIPS);
    await settle();
    for (const [button, text] of [
      [decrement(), TIPS.decrementTooltip],
      [increment(), TIPS.incrementTooltip],
    ]) {
      keyboardFocus(button);
      assert.ok(tooltip.element === button, 'opened on the focused button');
      assert.deepEqual(tooltip.calls.at(-1)[2], { text });
      button.blur();
      assert.ok(!tooltip.element, 'and closed on blur');
    }
    handle.destroy();
  });

  for (const [what, act, closes] of [
    ['a press', ({ increment }) => increment().click(), true],
    ['Escape', ({ increment }) => increment().dispatchEvent(escapeKey(increment())), true],
    [
      'an update that changes it',
      ({ handle }) => handle.update(base({ ...TIPS, incrementTooltip: 'More' })),
      true,
    ],
    [
      'an update that brings the value to max',
      ({ handle }) => handle.update(base({ ...TIPS, max: 2 })),
      true,
    ],
    ['destroy', ({ handle }) => handle.destroy(), true],
    [
      'an update that moves the value inside the bounds and changes neither tooltip',
      ({ handle }) => handle.update(base({ ...TIPS, value: 3, max: 9 })),
      false,
    ],
  ]) {
    it(`${closes ? 'closes' : 'keeps'} the open tooltip on ${what}`, async () => {
      const tooltip = withTooltip();
      const mounted = mountStepper(closes ? TIPS : { ...TIPS, max: 9 });
      await settle();
      keyboardFocus(mounted.increment());
      assert.ok(tooltip.element === mounted.increment(), 'the keyboard focus opened it');
      act(mounted);
      await settle();
      assert.equal(!tooltip.element, closes);
      mounted.handle.destroy();
    });
  }

  it('opens nothing and calls no tooltip without the keys', async () => {
    const tooltip = withTooltip();
    const { handle, increment } = mountStepper();
    await settle();
    keyboardFocus(increment());
    increment().click();
    increment().blur();
    assert.deepEqual(tooltip.calls, []);
    handle.destroy();
  });
});

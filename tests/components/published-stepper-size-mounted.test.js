/**
 * The published `Stepper`'s `size` (issue 2841) on Fabricate's real Svelte runtime, through a fresh
 * seam registered with the adapter's own table, under a Fabricate window root: `26` and `'26'`
 * write the dense rung's one class, any other value writes none and nothing is coerced, the rung
 * outranks `comfortable`, it keeps `fill`, and an update that drops it draws the default again.
 * Limit: happy-dom computes no layout, so the rung's box and targets are `stepper-size-rendered`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { base, installStepperSeam } from '../helpers/publishedStepperFixture.js';

const { ui, mountStepper } = installStepperSeam('fabricate-published-stepper-size-');

/** A node's authored classes, without Svelte's scope hash. */
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published Stepper lists its size', () => {
  it('describes size as optional data at version 1, last', () => {
    const { version, props } = ui().describe('Stepper');
    assert.equal(version, 1);
    assert.equal(Object.keys(props).at(-1), 'size');
    assert.deepEqual(props.size, { kind: 'data', required: false });
  });
});

describe('the published Stepper, size', () => {
  for (const size of [26, '26']) {
    it(`writes is-size-26 for ${JSON.stringify(size)}, and an update without it removes it`, async () => {
      const { handle, root } = mountStepper({ size });
      await settle();
      const drawn = root();
      assert.deepEqual(authoredClasses(drawn), ['fab-stepper', 'is-size-26']);
      assert.equal(handle.update(base()), true);
      await settle();
      assert.ok(root() === drawn, 'the same stepper');
      assert.deepEqual(authoredClasses(root()), ['fab-stepper']);
      handle.destroy();
    });
  }

  for (const size of [24, 28, '27', ' 26', '26px', 26.5, '', true, null, [26], { size: 26 }]) {
    it(`draws the default rung for ${JSON.stringify(size)}`, async () => {
      const { handle, root } = mountStepper({ size });
      await settle();
      assert.deepEqual(authoredClasses(root()), ['fab-stepper']);
      handle.destroy();
    });
  }

  it('outranks comfortable, which an update dropping the rung draws again', async () => {
    const { handle, root } = mountStepper({ size: 26, density: 'comfortable' });
    await settle();
    assert.deepEqual(authoredClasses(root()), ['fab-stepper', 'is-size-26']);
    assert.equal(handle.update(base({ density: 'comfortable' })), true);
    await settle();
    assert.deepEqual(authoredClasses(root()), ['fab-stepper', 'is-comfortable']);
    handle.destroy();
  });

  it('keeps fill and the disabled face beside it', async () => {
    const { handle, root } = mountStepper({ size: '26', fill: true, disabled: true });
    await settle();
    assert.deepEqual(
      authoredClasses(root()).toSorted((a, b) => a.localeCompare(b)),
      ['fab-stepper', 'is-disabled', 'is-fill', 'is-size-26']
    );
    handle.destroy();
  });

  it('keeps the input and both buttons, their names and the stepping, at the rung', async () => {
    const { handle, calls, input, decrement, increment } = mountStepper({ size: 26 });
    await settle();
    assert.equal(input().getAttribute('aria-label'), 'Days to credit');
    assert.equal(decrement().getAttribute('aria-label'), 'Decrease days to credit');
    increment().click();
    await settle();
    assert.deepEqual(calls, [[3]]);
    handle.destroy();
  });
});

/**
 * The published `Stepper`'s `size` (issues 2841 and 2903) on Fabricate's real Svelte runtime, through
 * a fresh seam registered with the adapter's own table, under a Fabricate window root: `26` and
 * `'26'` write the dense rung's one class and `34` and `'34'` the toolbar rung's, any other value
 * writes none and nothing is coerced, each rung outranks `comfortable`, keeps `fill`, and an update
 * that drops or changes it draws that rung.
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
  for (const [size, rung] of [
    [26, 'is-size-26'],
    ['26', 'is-size-26'],
    [34, 'is-size-34'],
    ['34', 'is-size-34'],
  ]) {
    it(`writes ${rung} for ${JSON.stringify(size)}, and an update without it removes it`, async () => {
      const { handle, root } = mountStepper({ size });
      await settle();
      const drawn = root();
      assert.deepEqual(authoredClasses(drawn), ['fab-stepper', rung]);
      assert.equal(handle.update(base()), true);
      await settle();
      assert.ok(root() === drawn, 'the same stepper');
      assert.deepEqual(authoredClasses(root()), ['fab-stepper']);
      handle.destroy();
    });
  }

  for (const size of [
    ...[24, 28, '28', '27', ' 26', '26px', 26.5, '', true, null, [26], { size: 26 }],
    ...[33, 35, 38, '38', ' 34', '34 ', '34px', 34.5, [34], { size: 34 }],
  ]) {
    it(`draws the default rung for ${JSON.stringify(size)}`, async () => {
      const { handle, root } = mountStepper({ size });
      await settle();
      assert.deepEqual(authoredClasses(root()), ['fab-stepper']);
      handle.destroy();
    });
  }

  for (const [size, rung] of [
    [26, 'is-size-26'],
    ['34', 'is-size-34'],
  ]) {
    it(`${rung} outranks comfortable, which an update dropping the rung draws again`, async () => {
      const { handle, root } = mountStepper({ size, density: 'comfortable' });
      await settle();
      assert.deepEqual(authoredClasses(root()), ['fab-stepper', rung]);
      assert.equal(handle.update(base({ density: 'comfortable' })), true);
      await settle();
      assert.deepEqual(authoredClasses(root()), ['fab-stepper', 'is-comfortable']);
      handle.destroy();
    });

    it(`${rung} keeps fill and the disabled face beside it`, async () => {
      const { handle, root } = mountStepper({ size, fill: true, disabled: true });
      await settle();
      assert.deepEqual(
        authoredClasses(root()).toSorted((a, b) => a.localeCompare(b)),
        ['fab-stepper', 'is-disabled', 'is-fill', rung]
      );
      handle.destroy();
    });
  }

  it('moves from the dense rung to the toolbar rung on an update, on the same stepper', async () => {
    const { handle, root } = mountStepper({ size: 26, fill: true });
    await settle();
    const drawn = root();
    assert.equal(handle.update(base({ size: '34', fill: true })), true);
    await settle();
    assert.ok(root() === drawn, 'the same stepper');
    assert.deepEqual(
      authoredClasses(root()).toSorted((a, b) => a.localeCompare(b)),
      ['fab-stepper', 'is-fill', 'is-size-34']
    );
    handle.destroy();
  });

  for (const size of [26, '34']) {
    it(`keeps the input and both buttons, their names and the stepping, at ${size}`, async () => {
      const { handle, calls, input, decrement, increment } = mountStepper({ size });
      await settle();
      assert.equal(input().getAttribute('aria-label'), 'Days to credit');
      assert.equal(decrement().getAttribute('aria-label'), 'Decrease days to credit');
      increment().click();
      await settle();
      assert.deepEqual(calls, [[3]]);
      handle.destroy();
    });
  }

  it('keeps the formatted field, its stops and null endpoint, and an unset field at 34', async () => {
    const formatted = mountStepper({
      size: '34',
      value: null,
      format: 'signed',
      stops: [-2, 0, 2],
      nullLabel: 'Otherwise',
    });
    await settle();
    assert.equal(formatted.input().getAttribute('role'), 'spinbutton');
    assert.equal(formatted.input().value, 'Otherwise');
    assert.equal(formatted.decrement().disabled, true);
    formatted.increment().click();
    await settle();
    assert.deepEqual(formatted.calls, [[-2]]);
    formatted.handle.destroy();
    const unset = mountStepper({ size: 34, value: null, allowUnset: true, placeholder: 'Any' });
    await settle();
    assert.equal(unset.input().value, '');
    assert.equal(unset.input().placeholder, 'Any');
    unset.increment().click();
    await settle();
    assert.deepEqual(unset.calls, [[1]]);
    unset.handle.destroy();
  });
});

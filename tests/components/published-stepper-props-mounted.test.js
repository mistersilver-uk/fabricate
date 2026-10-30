/**
 * The published `Stepper`'s `disabled`, `allowUnset`, `fill` and `density` (issue 2782) on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table,
 * under a Fabricate window root: the disabled input and buttons, the unset field and the `null` it
 * reports, the stretched root, the comfortable density, what a value outside a closed set draws,
 * and the removal of each effect when a later `update` omits its key.
 * Limit: happy-dom computes no layout, so the widths and hit targets are the View Lab's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { base, installStepperSeam, type } from '../helpers/publishedStepperFixture.js';

const { ui, mountStepper } = installStepperSeam('fabricate-published-stepper-props-');

/** A node's authored classes, without Svelte's scope hash. */
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published Stepper lists its four keys', () => {
  it('describes disabled, allowUnset, fill and density as optional data at version 1', () => {
    const description = ui().describe('Stepper');
    assert.equal(description.version, 1);
    for (const key of ['disabled', 'allowUnset', 'fill', 'density']) {
      assert.deepEqual(description.props[key], { kind: 'data', required: false });
    }
  });
});

describe('the published Stepper, disabled', () => {
  it('disables the input and both buttons, dims the root, reports nothing, and lifts it on update', async () => {
    const { handle, calls, record, root, input, decrement, increment } = mountStepper({
      disabled: true,
    });
    await settle();
    assert.ok(input().disabled && decrement().disabled && increment().disabled);
    assert.ok(root().classList.contains('is-disabled'));
    increment().click();
    decrement().click();
    await settle();
    assert.deepEqual(calls, [], 'a disabled press reports nothing');
    assert.equal(handle.update(base({ onChange: record })), true);
    await settle();
    assert.ok(!input().disabled && !decrement().disabled && !increment().disabled);
    assert.ok(!root().classList.contains('is-disabled'));
    increment().click();
    await settle();
    assert.deepEqual(calls, [[3]], 'and the same stepper reports again once enabled');
    handle.destroy();
  });

  it('is off when absent and when false', async () => {
    for (const props of [{}, { disabled: false }]) {
      const { handle, input, decrement, increment } = mountStepper(props);
      await settle();
      assert.ok(!input().disabled && !decrement().disabled && !increment().disabled);
      handle.destroy();
    }
  });

  it('counts the string "false" as true, since a boolean is not coerced', async () => {
    const { handle, input } = mountStepper({ disabled: 'false' });
    await settle();
    assert.ok(input().disabled);
    handle.destroy();
  });
});

describe('the published Stepper, allowUnset', () => {
  it('draws a null value as a blank input with both buttons live even at both bounds', async () => {
    const { handle, input, decrement, increment } = mountStepper({
      value: null,
      allowUnset: true,
      min: 1,
      max: 5,
    });
    await settle();
    assert.equal(input().value, '');
    assert.ok(!decrement().disabled && !increment().disabled);
    handle.destroy();
  });

  it('keeps both buttons live when the unset field sits above max or below min', async () => {
    for (const bounds of [{ max: -1 }, { min: 3, max: 3 }]) {
      const { handle, decrement, increment } = mountStepper({
        value: null,
        allowUnset: true,
        ...bounds,
      });
      await settle();
      assert.ok(!decrement().disabled && !increment().disabled, JSON.stringify(bounds));
      handle.destroy();
    }
  });

  it('counts the string "false" as true, since a boolean is not coerced', async () => {
    const { handle, calls, input } = mountStepper({ allowUnset: 'false' });
    await settle();
    type(input(), '');
    assert.deepEqual(calls, [[null]]);
    handle.destroy();
  });

  it('reports null when the user clears the input, and nothing without the key', async () => {
    const unset = mountStepper({ allowUnset: true });
    const plain = mountStepper();
    await settle();
    type(unset.input(), '');
    type(plain.input(), '');
    assert.deepEqual(unset.calls, [[null]]);
    assert.deepEqual(plain.calls, []);
    unset.handle.destroy();
    plain.handle.destroy();
  });

  it('starts a press from min, or from 0 without one, and clamps it', async () => {
    const bounded = mountStepper({ value: null, allowUnset: true, min: 1, max: 5 });
    const open = mountStepper({ value: null, allowUnset: true, step: 5 });
    await settle();
    bounded.increment().click();
    bounded.decrement().click();
    open.increment().click();
    open.decrement().click();
    await settle();
    assert.deepEqual(bounded.calls, [[2], [1]]);
    assert.deepEqual(open.calls, [[5], [-5]]);
    bounded.handle.destroy();
    open.handle.destroy();
  });

  it('reports a typed number from an unset field, including the one that reads as zero', async () => {
    const { handle, calls, input } = mountStepper({ value: null, allowUnset: true });
    await settle();
    type(input(), '0');
    assert.deepEqual(calls, [[0]]);
    handle.destroy();
  });

  it('draws the number again once an update sets it, and blank again once it passes null', async () => {
    const { handle, input } = mountStepper({ value: null, allowUnset: true });
    await settle();
    assert.equal(handle.update(base({ value: 4, allowUnset: true })), true);
    await settle();
    assert.equal(input().value, '4');
    assert.equal(handle.update(base({ value: null, allowUnset: true })), true);
    await settle();
    assert.equal(input().value, '');
    handle.destroy();
  });

  it('stops reporting null once an update omits the key', async () => {
    const { handle, calls, input } = mountStepper({ allowUnset: true });
    await settle();
    assert.equal(handle.update(base()), true);
    await settle();
    type(input(), '');
    assert.deepEqual(calls, []);
    handle.destroy();
  });
});

describe('the published Stepper, fill', () => {
  it('stretches the root with is-fill, only for the key, and drops it on update', async () => {
    const filled = mountStepper({ fill: true });
    const plain = mountStepper();
    await settle();
    assert.ok(filled.root().classList.contains('is-fill'));
    assert.ok(!plain.root().classList.contains('is-fill'));
    assert.equal(filled.handle.update(base()), true);
    await settle();
    assert.ok(!filled.root().classList.contains('is-fill'));
    filled.handle.destroy();
    plain.handle.destroy();
  });

  it('counts the string "false" as true, since a boolean is not coerced', async () => {
    const { handle, root } = mountStepper({ fill: 'false' });
    await settle();
    assert.ok(root().classList.contains('is-fill'));
    handle.destroy();
  });
});

describe('the published Stepper, density', () => {
  it('writes is-comfortable for "comfortable" and drops it on update', async () => {
    const { handle, root } = mountStepper({ density: 'comfortable' });
    await settle();
    assert.ok(root().classList.contains('is-comfortable'));
    assert.equal(handle.update(base()), true);
    await settle();
    assert.ok(!root().classList.contains('is-comfortable'));
    handle.destroy();
  });

  for (const density of ['default', 'roomy', 'Comfortable', '']) {
    it(`draws the default density for ${JSON.stringify(density)}`, async () => {
      const { handle, root } = mountStepper({ density });
      await settle();
      assert.ok(!root().classList.contains('is-comfortable'));
      assert.deepEqual(authoredClasses(root()), ['fab-stepper']);
      handle.destroy();
    });
  }
});

/**
 * The published `Stepper`'s `format`, `stops`, `nullLabel` and `placeholder` (issue 2787) on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table:
 * the signed and unlimited built-in formatters, the commit-on-Enter-or-blur text field, the stops
 * and the null label, what a value outside a closed set draws, and the removal of each effect when
 * a later `update` omits its key.
 * Limit: happy-dom computes no layout, so the endpoint's width is the View Lab's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { base, installStepperSeam, type } from '../helpers/publishedStepperFixture.js';

const { ui, mountStepper } = installStepperSeam('fabricate-published-stepper-format-');

const NO_LIMIT = 'No limit';

/** Fires `name` on `element` as a key press that can be cancelled, with `init` over it, and returns the event. */
function key(element, name, init = {}) {
  const event = new globalThis.KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  element.dispatchEvent(event);
  return event;
}

const blur = (input) => input.dispatchEvent(new globalThis.Event('blur'));

describe('the published Stepper lists its four keys', () => {
  it('describes placeholder, format, stops and nullLabel as optional data at version 1', () => {
    const description = ui().describe('Stepper');
    assert.equal(description.version, 1);
    for (const key of ['placeholder', 'format', 'stops', 'nullLabel']) {
      assert.deepEqual(description.props[key], { kind: 'data', required: false });
    }
    for (const key of ['formatValue', 'parseValue', 'inputProps', 'orientation']) {
      assert.ok(!(key in description.props), `${key} stays private`);
    }
  });
});

describe('the published Stepper, format signed', () => {
  it('draws a spinbutton text field with a leading plus on positives only, and a plain number field without the key', async () => {
    const cases = [
      [5, '+5'],
      [0, '0'],
      [-3, '-3'],
      [1.5, '+1.5'],
    ];
    for (const [value, shown] of cases) {
      const { handle, input } = mountStepper({ value, format: 'signed' });
      await settle();
      assert.equal(input().type, 'text');
      assert.equal(input().getAttribute('role'), 'spinbutton');
      assert.equal(input().value, shown);
      assert.equal(input().getAttribute('aria-valuetext'), shown);
      handle.destroy();
    }
    const plain = mountStepper({ value: 5 });
    await settle();
    assert.equal(plain.input().type, 'number');
    assert.equal(plain.input().value, '5');
    plain.handle.destroy();
  });

  it('reports a typed number only on Enter or blur, accepting a sign or a true minus', async () => {
    const { handle, calls, input } = mountStepper({ value: 2, format: 'signed' });
    await settle();
    type(input(), '+7');
    assert.deepEqual(calls, [], 'a keystroke reports nothing');
    const enter = key(input(), 'Enter');
    assert.ok(enter.defaultPrevented, 'Enter never submits an enclosing form');
    assert.deepEqual(calls, [[7]]);
    assert.equal(input().value, '+7');
    type(input(), '−4');
    blur(input());
    type(input(), '-9');
    blur(input());
    assert.deepEqual(calls, [[7], [-4], [-9]]);
    handle.destroy();
  });

  it('clamps a typed number to min and max, and restores the display for text that is no number', async () => {
    const { handle, calls, input } = mountStepper({
      value: 2,
      min: -10,
      max: 10,
      format: 'signed',
    });
    await settle();
    type(input(), '+40');
    key(input(), 'Enter');
    assert.deepEqual(calls, [[10]]);
    for (const text of ['abc', '+', '1e3', '5%', '']) {
      type(input(), text);
      key(input(), 'Enter');
      assert.equal(input().value, '+2', `${JSON.stringify(text)} restores the held value`);
    }
    assert.deepEqual(calls, [[10]], 'none of those reported');
    handle.destroy();
  });

  it('steps with the buttons and the arrow keys by step, and stops at min and max', async () => {
    const { handle, calls, input, decrement, increment } = mountStepper({
      value: 4,
      max: 5,
      step: 2,
      format: 'signed',
    });
    await settle();
    increment().click();
    decrement().click();
    key(input(), 'ArrowUp');
    key(input(), 'ArrowDown');
    assert.deepEqual(calls, [[5], [2], [5], [2]]);
    assert.ok(!increment().disabled);
    const atMax = mountStepper({ value: 5, max: 5, format: 'signed' });
    await settle();
    assert.ok(atMax.increment().disabled, 'the bound is held');
    atMax.handle.destroy();
    handle.destroy();
  });

  it('draws the plain number field again once an update omits the key', async () => {
    const { handle, input } = mountStepper({ value: 5, format: 'signed' });
    await settle();
    assert.equal(input().value, '+5');
    assert.equal(handle.update(base({ value: 5 })), true);
    await settle();
    assert.equal(input().type, 'number');
    assert.equal(input().value, '5');
    assert.ok(!input().hasAttribute('role'));
    handle.destroy();
  });
});

describe('the published Stepper, format unlimited', () => {
  const unlimited = (props = {}) =>
    mountStepper({ value: 0, min: 0, format: 'unlimited', nullLabel: NO_LIMIT, ...props });

  it('draws zero as the null label, marked as the endpoint, and any other number as itself', async () => {
    const zero = unlimited();
    const three = unlimited({ value: 3 });
    await settle();
    assert.equal(zero.input().value, NO_LIMIT);
    assert.ok(zero.input().hasAttribute('data-stepper-endpoint'));
    assert.ok(!zero.input().hasAttribute('aria-valuenow'), 'the endpoint names no number');
    assert.equal(zero.input().getAttribute('aria-valuetext'), NO_LIMIT);
    assert.equal(three.input().value, '3');
    assert.ok(!three.input().hasAttribute('data-stepper-endpoint'));
    assert.equal(three.input().getAttribute('aria-valuenow'), '3');
    zero.handle.destroy();
    three.handle.destroy();
  });

  it('reports 0, never null, when stepped or typed to the endpoint', async () => {
    const stepped = unlimited({ value: 1 });
    const typed = unlimited({ value: 4 });
    const named = unlimited({ value: 4 });
    await settle();
    stepped.decrement().click();
    type(typed.input(), '0');
    key(typed.input(), 'Enter');
    type(named.input(), 'no LIMIT');
    blur(named.input());
    assert.deepEqual(stepped.calls, [[0]]);
    assert.deepEqual(typed.calls, [[0]]);
    assert.deepEqual(named.calls, [[0]]);
    await settle();
    assert.equal(named.input().value, '4', 'the held value returns once the field is blurred');
    for (const one of [stepped, typed, named]) one.handle.destroy();
  });

  it('leaves the endpoint upward only, holding the decrement button there', async () => {
    const { handle, calls, input, decrement, increment } = unlimited();
    await settle();
    assert.ok(decrement().disabled && !increment().disabled);
    key(input(), 'ArrowDown');
    increment().click();
    assert.deepEqual(calls, [[1]]);
    type(input(), '6');
    key(input(), 'Enter');
    assert.deepEqual(calls, [[1], [6]]);
    handle.destroy();
  });

  it('steps between stops and falls to the endpoint below the lowest', async () => {
    const { handle, calls, decrement, increment } = unlimited({ value: 5, stops: [5, 1, 3] });
    await settle();
    decrement().click();
    assert.deepEqual(calls, [[3]]);
    const low = unlimited({ value: 1, stops: [1, 3] });
    const zero = unlimited({ value: 0, stops: [1, 3] });
    await settle();
    low.decrement().click();
    zero.increment().click();
    assert.deepEqual(low.calls, [[0]]);
    assert.deepEqual(zero.calls, [[1]]);
    assert.ok(increment().disabled, 'the top stop is held');
    for (const one of [handle, low.handle, zero.handle]) one.destroy();
  });

  it('draws zero as the number without a label, and again once an update omits the label or the key', async () => {
    const bare = unlimited({ nullLabel: undefined });
    await settle();
    assert.equal(bare.input().value, '0');
    assert.ok(!bare.input().hasAttribute('data-stepper-endpoint'));
    bare.handle.destroy();
    const { handle, input } = unlimited();
    await settle();
    assert.equal(handle.update(base({ value: 0, min: 0, format: 'unlimited' })), true);
    await settle();
    assert.equal(input().value, '0');
    assert.equal(handle.update(base({ value: 0 })), true);
    await settle();
    assert.equal(input().type, 'number');
    handle.destroy();
  });
});

describe('the published Stepper, stops and nullLabel', () => {
  const stops = [-5, 0, 5, 10];

  it('steps to the nearest stop above or below, from an off-list value too', async () => {
    const onList = mountStepper({ value: 0, stops, format: 'signed' });
    const off = mountStepper({ value: 3, stops, format: 'signed' });
    await settle();
    onList.increment().click();
    off.increment().click();
    off.decrement().click();
    assert.deepEqual(onList.calls, [[5]]);
    assert.deepEqual(off.calls, [[5], [0]]);
    assert.equal(off.input().value, '+3', 'an off-list value stays exact until stepped');
    onList.handle.destroy();
    off.handle.destroy();
  });

  it('jumps to the lowest and highest stop with Home and End, and names them in aria', async () => {
    const { handle, calls, input } = mountStepper({ value: 0, stops, format: 'signed' });
    await settle();
    key(input(), 'End');
    key(input(), 'Home');
    assert.deepEqual(calls, [[10], [-5]]);
    assert.equal(input().getAttribute('aria-valuemin'), '-5');
    assert.equal(input().getAttribute('aria-valuemax'), '10');
    handle.destroy();
  });

  it('ignores a stop that is no finite number, and a stops that is no list', async () => {
    const mixed = mountStepper({
      value: 0,
      stops: [5, 'x', null, NaN, 2],
      format: 'signed',
    });
    const text = mountStepper({ value: 0, stops: 'x', format: 'signed' });
    await settle();
    mixed.increment().click();
    text.increment().click();
    assert.deepEqual(mixed.calls, [[2]]);
    assert.deepEqual(text.calls, [[1]], 'the step is used instead');
    mixed.handle.destroy();
    text.handle.destroy();
  });

  it('draws a null value as the label below the lowest stop, reports null to reach it, and 0 never', async () => {
    const atEndpoint = mountStepper({
      value: null,
      stops,
      nullLabel: 'Otherwise',
      format: 'signed',
    });
    const atLowest = mountStepper({ value: -5, stops, nullLabel: 'Otherwise', format: 'signed' });
    await settle();
    assert.equal(atEndpoint.input().value, 'Otherwise');
    assert.ok(atEndpoint.input().hasAttribute('data-stepper-endpoint'));
    assert.ok(atEndpoint.decrement().disabled);
    atEndpoint.increment().click();
    atLowest.decrement().click();
    assert.deepEqual(atEndpoint.calls, [[-5]]);
    assert.deepEqual(atLowest.calls, [[null]]);
    atEndpoint.handle.destroy();
    atLowest.handle.destroy();
  });

  it('draws a null value as a blank field without a label, and counts only a string as a label', async () => {
    const blank = mountStepper({ value: null, stops, format: 'signed' });
    await settle();
    assert.equal(blank.input().value, '');
    assert.ok(!blank.input().hasAttribute('data-stepper-endpoint'));
    blank.handle.destroy();
    for (const nullLabel of [5, true, ['x'], {}]) {
      const { handle, input } = mountStepper({ value: null, stops, nullLabel, format: 'signed' });
      await settle();
      assert.equal(input().value, '', JSON.stringify(nullLabel));
      assert.ok(!input().hasAttribute('data-stepper-endpoint'));
      handle.destroy();
    }
  });

  it('stops using the stops and the label once an update omits them', async () => {
    const { handle, calls, record, input, increment } = mountStepper({
      value: null,
      stops,
      nullLabel: 'Otherwise',
      format: 'signed',
    });
    await settle();
    assert.equal(input().value, 'Otherwise');
    assert.equal(handle.update(base({ value: 0, format: 'signed', onChange: record })), true);
    await settle();
    assert.equal(input().value, '0');
    increment().click();
    assert.deepEqual(calls, [[1]], 'by step, not by stop');
    handle.destroy();
  });

  it('does nothing with stops or a label where format is not honoured', async () => {
    const { handle, calls, input, increment } = mountStepper({ value: 2, stops, nullLabel: 'x' });
    await settle();
    assert.equal(input().type, 'number');
    increment().click();
    assert.deepEqual(calls, [[3]]);
    handle.destroy();
  });
});

describe('the published Stepper, format outside its set', () => {
  for (const format of ['Signed', 'plain', 'number', '', 'true', true, 1, null, ['signed']]) {
    it(`draws the plain number field for ${JSON.stringify(format)}`, async () => {
      const { handle, input } = mountStepper({ value: 5, format });
      await settle();
      assert.equal(input().type, 'number');
      assert.equal(input().value, '5');
      assert.ok(!input().hasAttribute('role'));
      handle.destroy();
    });
  }
});

describe('the published Stepper, placeholder', () => {
  it('shows while an unset field is empty, in both modes, and drops on update', async () => {
    const plain = mountStepper({ value: null, allowUnset: true, placeholder: 'Any' });
    const formatted = mountStepper({
      value: null,
      allowUnset: true,
      format: 'signed',
      placeholder: 'Any',
    });
    await settle();
    assert.equal(plain.input().getAttribute('placeholder'), 'Any');
    assert.equal(formatted.input().getAttribute('placeholder'), 'Any');
    assert.equal(plain.handle.update(base({ value: null, allowUnset: true })), true);
    await settle();
    assert.ok(!plain.input().hasAttribute('placeholder'));
    plain.handle.destroy();
    formatted.handle.destroy();
  });

  it('is absent when the key is', async () => {
    const { handle, input } = mountStepper({ value: null, allowUnset: true });
    await settle();
    assert.ok(!input().hasAttribute('placeholder'));
    handle.destroy();
  });
});

describe('the published Stepper, a refused number under format', () => {
  it('keeps the typed text while the field holds focus, then restores the held value on blur', async () => {
    const { handle, calls, target, input } = mountStepper({ value: 4, format: 'signed' });
    await settle();
    input().focus();
    type(input(), '+7');
    key(input(), 'Enter');
    await settle();
    assert.deepEqual(calls, [[7]]);
    assert.equal(input().value, '+7', 'the refused text stays while the field is focused');
    input().blur();
    await settle();
    assert.deepEqual(calls, [[7], [7]], 'a blur reports the refused number again');
    assert.equal(input().value, '+4');
    assert.equal(target.querySelector('input').getAttribute('aria-valuenow'), '4');
    assert.equal(input().getAttribute('aria-valuetext'), '+4');
    handle.destroy();
  });

  it('restores the held value after a refused blur, for the unlimited endpoint too', async () => {
    const { handle, input } = mountStepper({
      value: 0,
      min: 0,
      format: 'unlimited',
      nullLabel: NO_LIMIT,
    });
    await settle();
    input().focus();
    type(input(), '9');
    input().blur();
    await settle();
    assert.equal(input().value, NO_LIMIT);
    handle.destroy();
  });
});

describe('the published Stepper, unlimited with a bound', () => {
  for (const min of [0, 1]) {
    it(`selects the endpoint for a typed 0 at min ${min}, and reports 0`, async () => {
      const { handle, calls, input } = mountStepper({
        value: 4,
        min,
        format: 'unlimited',
        nullLabel: NO_LIMIT,
      });
      await settle();
      type(input(), '0');
      key(input(), 'Enter');
      assert.deepEqual(calls, [[0]]);
      assert.equal(input().value, NO_LIMIT);
      handle.destroy();
    });
  }
});

describe('the published Stepper, the keys of the formatted field', () => {
  it('catches Escape while the draft differs, and lets it through when it does not', async () => {
    const { handle, input, target } = mountStepper({ value: 4, format: 'signed' });
    const seen = [];
    const record = (event) => {
      seen.push(event.key);
    };
    target.ownerDocument.addEventListener('keydown', record);
    await settle();
    type(input(), '9');
    const dirty = key(input(), 'Escape');
    assert.ok(dirty.defaultPrevented, 'a dirty Escape is caught');
    assert.equal(input().value, '+4');
    const clean = key(input(), 'Escape');
    assert.ok(!clean.defaultPrevented, 'a clean Escape is not');
    target.ownerDocument.removeEventListener('keydown', record);
    assert.deepEqual(seen, ['Escape'], 'only the clean Escape reaches the document');
    handle.destroy();
  });

  it('trims white space and refuses a lone sign without reporting', async () => {
    const { handle, calls, input } = mountStepper({ value: 4, format: 'signed' });
    await settle();
    type(input(), '  +7  ');
    key(input(), 'Enter');
    assert.deepEqual(calls, [[7]]);
    for (const text of ['-', '\u{2212}', '+', ' ']) {
      type(input(), text);
      key(input(), 'Enter');
      assert.equal(input().value, '+4', `${JSON.stringify(text)} restores the held value`);
    }
    assert.deepEqual(calls, [[7]], 'none of those reported');
    handle.destroy();
  });

  it('lets Home and End through, keeping the draft, where there is no stop, min or max', async () => {
    const { handle, calls, input } = mountStepper({ value: 4, format: 'signed' });
    await settle();
    type(input(), '9');
    for (const name of ['Home', 'End']) {
      const event = key(input(), name);
      assert.ok(!event.defaultPrevented, `${name} is left to the field`);
    }
    assert.equal(input().value, '9');
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('lets a modified key through, and keeps the draft when an arrow is blocked at a bound', async () => {
    const { handle, calls, input } = mountStepper({
      value: 4,
      stops: [0, 4],
      format: 'signed',
    });
    await settle();
    type(input(), '9');
    for (const init of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ]) {
      assert.ok(!key(input(), 'Home', init).defaultPrevented, JSON.stringify(init));
      assert.ok(!key(input(), 'ArrowUp', init).defaultPrevented, JSON.stringify(init));
    }
    key(input(), 'ArrowUp');
    assert.equal(input().value, '9', 'the blocked arrow kept the draft');
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('ignores Enter during IME composition', async () => {
    const { handle, calls, input } = mountStepper({ value: 4, format: 'signed' });
    await settle();
    type(input(), '9');
    const event = key(input(), 'Enter', { isComposing: true });
    assert.ok(!event.defaultPrevented);
    assert.deepEqual(calls, []);
    handle.destroy();
  });
});

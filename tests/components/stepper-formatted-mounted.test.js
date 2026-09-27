/** `Stepper`'s opt-in formatted mode and its keyboard/ARIA contract (issue 2005). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const STEPPER = 'src/ui/svelte/components/Stepper.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-stepper-formatted-',
  compiledModules: [STEPPER],
  componentPath: STEPPER,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const FRACTIONS = { 0.5: '½', 0.2: '⅕' };
const GLYPHS = { '½': 0.5, '⅕': 0.2 };

/** A stand-in for the caller's multiplier formatter: `×1`, `×½`, `×⅕`, else `×0.7`. */
const formatValue = (value) => `×${FRACTIONS[value] ?? value}`;

/** Its parser, which accepts every display it produces plus the sentinel label. */
function parseValue(text) {
  const body = String(text).trim().replace(/^×/, '');
  if (body === 'Otherwise') return null;
  if (body in GLYPHS) return GLYPHS[body];
  const ratio = /^(\d+)\/(\d+)$/.exec(body);
  if (ratio) return Number(ratio[1]) / Number(ratio[2]);
  return /^\d*\.?\d+$/.test(body) ? Number(body) : Number.NaN;
}

const STOPS = [1, 0.5, 0.2];
const FORMATTED = { formatValue, parseValue, stops: STOPS, ariaLabel: 'Adjustment' };
const OTHERWISE = { ...FORMATTED, nullLabel: 'Otherwise' };

/** Mount a controlled Stepper: every emission is recorded and written back as the new value. */
async function mountStepper(props) {
  const calls = [];
  const root = await harness.mount({
    ...props,
    onChange: (next) => {
      calls.push(next);
      harness.setProps({ value: next });
    },
  });
  return {
    calls,
    root,
    input: root.querySelector('[data-stepper-input]'),
    decrement: root.querySelector('[data-stepper-decrement]'),
    increment: root.querySelector('[data-stepper-increment]'),
  };
}

function key(element, name) {
  const event = new globalThis.KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event;
}

function type(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

const blur = (input) => input.dispatchEvent(new globalThis.Event('blur'));

/** Let the write-back from `onChange` land before reading the DOM again. */
const settle = () => harness.setProps({});

describe('Stepper formatted mode: identity and ARIA', () => {
  it('renders a spinbutton text input with decimal inputmode and the caller’s name', async () => {
    const { input } = await mountStepper({ ...FORMATTED, value: 0.5 });
    assert.equal(input.getAttribute('type'), 'text');
    assert.equal(input.getAttribute('inputmode'), 'decimal');
    assert.equal(input.getAttribute('role'), 'spinbutton');
    assert.equal(input.getAttribute('aria-label'), 'Adjustment');
    assert.equal(input.value, '×½', 'the formatter’s reading is the display');
    assert.equal(input.getAttribute('aria-valuemin'), '0.2', 'the lowest numeric stop');
    assert.equal(input.getAttribute('aria-valuemax'), '1', 'the highest numeric stop');
    assert.equal(input.getAttribute('aria-valuenow'), '0.5');
    assert.equal(input.getAttribute('aria-valuetext'), '×½');
  });

  it('names the null endpoint by its label and exposes no aria-valuenow for it', async () => {
    const { input } = await mountStepper({ ...OTHERWISE, value: null });
    assert.equal(input.value, 'Otherwise');
    assert.equal(input.getAttribute('aria-valuetext'), 'Otherwise');
    assert.ok(!input.hasAttribute('aria-valuenow'), 'the endpoint is not a number');
  });

  it('renders an unset value blank with the placeholder when there is no null endpoint', async () => {
    const { input } = await mountStepper({ ...FORMATTED, value: null, placeholder: 'Default' });
    assert.equal(input.value, '');
    assert.equal(input.getAttribute('placeholder'), 'Default');
    assert.ok(!input.hasAttribute('aria-valuenow'));
    assert.ok(!input.hasAttribute('aria-valuetext'));
  });

  it('renders a finite off-list value exactly, through the formatter', async () => {
    const { input } = await mountStepper({ ...FORMATTED, value: 0.7 });
    assert.equal(input.value, '×0.7', 'not snapped to a stop');
  });
});

describe('Stepper formatted mode: commit on Enter or blur', () => {
  it('commits nothing while typing, then the parsed value on Enter', async () => {
    const { input, calls } = await mountStepper({ ...FORMATTED, value: 1 });
    type(input, '1/2');
    assert.deepEqual(calls, [], 'a formatted edit does not commit on input');
    const event = key(input, 'Enter');
    assert.deepEqual(calls, [0.5]);
    assert.ok(event.defaultPrevented, 'Enter never submits an enclosing form');
    await settle();
    assert.equal(input.value, '×½');
  });

  it('commits on blur as well', async () => {
    const { input, calls } = await mountStepper({ ...FORMATTED, value: 1 });
    type(input, '0.2');
    blur(input);
    assert.deepEqual(calls, [0.2]);
  });

  it('parses every display it renders, so each displayed value round-trips', async () => {
    for (const [text, expected] of [
      ['×½', 0.5],
      ['½', 0.5],
      ['1/2', 0.5],
      ['0.5', 0.5],
      ['×0.7', 0.7],
      ['Otherwise', null],
    ]) {
      const { input, calls } = await mountStepper({ ...OTHERWISE, value: 1 });
      type(input, text);
      key(input, 'Enter');
      assert.deepEqual(calls, [expected], `${text} commits ${expected}`);
      harness.remount();
    }
  });

  it('emits nothing for invalid or partial text and restores the committed display', async () => {
    for (const commitBy of ['Enter', 'blur']) {
      const { input, calls } = await mountStepper({ ...FORMATTED, value: 0.5 });
      type(input, '1/');
      if (commitBy === 'Enter') key(input, 'Enter');
      else blur(input);
      assert.deepEqual(calls, [], `${commitBy} emits nothing for partial text`);
      assert.equal(input.value, '×½', `${commitBy} restores the committed display`);
      harness.remount();
    }
  });

  it('never manufactures the null endpoint from an empty edit', async () => {
    const { input, calls } = await mountStepper({ ...OTHERWISE, value: 0.5, allowUnset: true });
    type(input, '');
    key(input, 'Enter');
    assert.deepEqual(calls, [], 'an empty edit is invalid where a null endpoint exists');
    assert.equal(input.value, '×½');
  });

  it('keeps allowUnset’s empty → null where there is no null endpoint', async () => {
    const { input, calls } = await mountStepper({ ...FORMATTED, value: 0.5, allowUnset: true });
    type(input, '');
    blur(input);
    assert.deepEqual(calls, [null]);
  });

  it('restores rather than clearing when the field does not admit unset', async () => {
    const { input, calls } = await mountStepper({ ...FORMATTED, value: 0.5 });
    type(input, '');
    blur(input);
    assert.deepEqual(calls, []);
    assert.equal(input.value, '×½');
  });
});

describe('Stepper formatted mode: stepping by stops', () => {
  it('steps an off-list value to the nearest strictly greater or smaller stop', async () => {
    const up = await mountStepper({ ...FORMATTED, value: 0.7 });
    up.increment.click();
    assert.deepEqual(up.calls, [1]);
    harness.remount();
    const down = await mountStepper({ ...FORMATTED, value: 0.7 });
    down.decrement.click();
    assert.deepEqual(down.calls, [0.5]);
  });

  it('steps from an on-list value to the NEXT stop rather than staying on it', async () => {
    const { increment, decrement, calls } = await mountStepper({ ...FORMATTED, value: 0.5 });
    increment.click();
    await settle();
    decrement.click();
    await settle();
    decrement.click();
    assert.deepEqual(calls, [1, 0.5, 0.2]);
  });

  it('decrements the minimum stop to the null endpoint, and increments back from it', async () => {
    const { input, increment, decrement, calls } = await mountStepper({
      ...OTHERWISE,
      value: 0.2,
    });
    decrement.click();
    await settle();
    assert.deepEqual(calls, [null]);
    assert.equal(input.value, 'Otherwise');
    assert.ok(decrement.disabled, 'decrement stays put at the endpoint');
    assert.equal(key(input, 'ArrowDown').defaultPrevented, true);
    assert.deepEqual(calls, [null], 'and ArrowDown emits nothing there either');
    increment.click();
    assert.deepEqual(calls, [null, 0.2], 'increment selects the minimum stop');
  });

  it('clamps at both ends when there is no null endpoint', async () => {
    const low = await mountStepper({ ...FORMATTED, value: 0.2 });
    assert.ok(low.decrement.disabled);
    key(low.input, 'ArrowDown');
    assert.deepEqual(low.calls, []);
    harness.remount();
    const high = await mountStepper({ ...FORMATTED, value: 1 });
    assert.ok(high.increment.disabled);
    key(high.input, 'ArrowUp');
    assert.deepEqual(high.calls, []);
  });

  it('selects the lowest stop from unset, with either button', async () => {
    for (const button of ['increment', 'decrement']) {
      const parts = await mountStepper({ ...FORMATTED, value: null, allowUnset: true });
      assert.ok(!parts[button].disabled);
      parts[button].click();
      assert.deepEqual(parts.calls, [0.2], `${button} from unset`);
      harness.remount();
    }
  });

  it('steps by `step` within min/max when no stops are given', async () => {
    const { increment, calls } = await mountStepper({
      formatValue: (value) => (value > 0 ? `+${value}` : String(value)),
      parseValue: Number,
      value: 2,
      max: 3,
    });
    increment.click();
    await settle();
    assert.deepEqual(calls, [3]);
    assert.ok(increment.disabled, 'max is the highest value');
  });
});

describe('Stepper formatted mode: the keyboard', () => {
  it('applies the buttons’ stepping from ArrowUp and ArrowDown', async () => {
    const { input, calls } = await mountStepper({ ...FORMATTED, value: 0.7 });
    assert.ok(key(input, 'ArrowUp').defaultPrevented);
    await settle();
    key(input, 'ArrowDown');
    assert.deepEqual(calls, [1, 0.5]);
  });

  it('selects the lowest and highest numeric stop from Home and End, never the endpoint', async () => {
    const { input, calls } = await mountStepper({ ...OTHERWISE, value: 0.5 });
    assert.ok(key(input, 'Home').defaultPrevented);
    await settle();
    key(input, 'End');
    assert.deepEqual(calls, [0.2, 1]);
  });

  it('restores on Escape during an edit, without blurring and before Foundry sees it', async () => {
    const { input, calls } = await mountStepper({ ...FORMATTED, value: 0.5 });
    const reachedWindow = [];
    const spy = (event) => reachedWindow.push(event.key);
    globalThis.document.defaultView.addEventListener('keydown', spy);
    try {
      input.focus();
      type(input, '0.2');
      const event = key(input, 'Escape');
      assert.ok(event.defaultPrevented);
      assert.deepEqual(reachedWindow, [], 'core.dismiss never sees an Escape that undid an edit');
      assert.equal(input.value, '×½', 'the committed display is back');
      assert.equal(globalThis.document.activeElement, input, 'focus stays in the field');
      blur(input);
      assert.deepEqual(calls, [], 'so a later blur has nothing to commit');
      key(input, 'Escape');
      assert.deepEqual(reachedWindow, ['Escape'], 'with no edit pending, Escape propagates');
    } finally {
      globalThis.document.defaultView.removeEventListener('keydown', spy);
    }
  });
});

describe('Stepper adjuncts declare themselves to Foundry in every mode', () => {
  /** Foundry's `KeyboardManager#hasFocus`, reduced to the branches a Stepper can reach. */
  function foundryHasFocus() {
    const focused = globalThis.document.activeElement;
    if (!focused || focused === globalThis.document.body) return false;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName)) return true;
    if (['', 'true'].includes(focused.dataset?.keyboardFocus)) return true;
    return Boolean(focused.form);
  }

  for (const [mode, props] of [
    ['default', { value: 3 }],
    ['formatted', { ...FORMATTED, value: 0.5 }],
  ]) {
    it(`keeps Space on a focused ${mode} −/+ button away from Foundry's bindings`, async () => {
      const { decrement, increment } = await mountStepper(props);
      const foundryActed = [];
      const spy = (event) => {
        if (!foundryHasFocus()) foundryActed.push(event.key);
      };
      globalThis.document.defaultView.addEventListener('keydown', spy);
      try {
        for (const button of [decrement, increment]) {
          assert.equal(button.getAttribute('data-keyboard-focus'), 'true');
          button.focus();
          key(button, ' ');
        }
        assert.deepEqual(foundryActed, [], 'no formless adjunct hands Space to the canvas');
      } finally {
        globalThis.document.defaultView.removeEventListener('keydown', spy);
      }
    });
  }
});

describe('Stepper without the formatted props keeps its number path', () => {
  it('renders a number input with no spinbutton role and commits on every input', async () => {
    const { input, calls } = await mountStepper({ value: 3, formatValue, stops: STOPS });
    assert.equal(input.getAttribute('type'), 'number', 'a formatter alone does not opt in');
    assert.ok(!input.hasAttribute('role'));
    assert.ok(!input.hasAttribute('aria-valuetext'));
    type(input, '5');
    assert.deepEqual(calls, [5], 'commit-on-input, with no Enter or blur');
  });
});

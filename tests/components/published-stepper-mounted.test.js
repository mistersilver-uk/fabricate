/**
 * The published `Stepper` on Fabricate's real Svelte runtime (issue 2452), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window roots it needs: the number
 * field and its two buttons, a press, a typed edit, the snap-back of a refused value on blur, a
 * bound, every refusal the entry adds, and its required root. The number field is held here
 * because the static gates pin it to the defaults of the unpublished `formatValue` and
 * `parseValue`.
 * Limit: happy-dom steps no number input from a key or the wheel, and computes no accessible name,
 * so the View Lab's stepper case holds the arrow keys and the names.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const NAMES = Object.freeze({
  ariaLabel: 'Days to credit',
  decrementLabel: 'Decrease days to credit',
  incrementLabel: 'Increase days to credit',
});

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-stepper-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** The props of a stepper at 2 with its three names and an `onChange` that keeps nothing, with `overrides` over them. */
const base = (overrides = {}) => ({ value: 2, ...NAMES, onChange() {}, ...overrides });

/**
 * A stepper mounted with `props` over `base`, recording `onChange`, under a shell carrying
 * `under`: its target, its handle, the recorded calls, and its three parts as drawn now.
 */
function mountStepper(props = {}, under = 'fabricate') {
  const change = recorder();
  const target = fabricateTarget(targets, under);
  const handle = ui().mount('Stepper', {
    target,
    props: base({ onChange: change.record, ...props }),
  });
  return {
    target,
    handle,
    calls: change.calls,
    input: () => target.querySelector('input'),
    decrement: () => target.querySelector('button[data-stepper-decrement]'),
    increment: () => target.querySelector('button[data-stepper-increment]'),
  };
}

/** Types `raw` into `input` as a user would, firing the real `input` event. */
function type(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** The refusal `mount` throws for `props` over a named stepper, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(targets)) {
  assert.throws(() => ui().mount('Stepper', { target, props: base(props) }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the default draws the number field', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`draws − input + under a frame classed ${under}, typed, marked and named`, async () => {
      const { target, handle } = mountStepper({ min: 0, max: 10, step: 2 }, under);
      await settle();
      assert.equal(target.children.length, 1, 'one group in target');
      const group = target.firstElementChild;
      assert.ok(group.classList.contains('fab-stepper'), 'the stepper group');
      const [decrement, input, increment] = group.children;
      assert.deepEqual(
        [...group.children].map((child) => child.tagName.toLowerCase()),
        ['button', 'input', 'button']
      );
      for (const [button, name] of [
        [decrement, NAMES.decrementLabel],
        [increment, NAMES.incrementLabel],
      ]) {
        assert.equal(button.getAttribute('type'), 'button');
        assert.equal(button.getAttribute('data-keyboard-focus'), 'true');
        assert.equal(button.getAttribute('aria-label'), name);
        assert.equal(button.textContent.trim(), '', 'a glyph alone');
        assert.ok(!button.hasAttribute('title'), 'no tooltip shows the name');
      }
      assert.ok(decrement.hasAttribute('data-stepper-decrement'), 'the minus first');
      assert.equal(input.getAttribute('type'), 'number');
      assert.equal(input.getAttribute('aria-label'), NAMES.ariaLabel);
      const bounds = ['min', 'max', 'step'].map((name) => input.getAttribute(name));
      assert.deepEqual(bounds, ['0', '10', '2']);
      assert.ok(!input.hasAttribute('role'), 'no role="spinbutton"');
      assert.ok(!input.hasAttribute('name'), 'no name');
      assert.equal(input.value, '2');
      assert.equal(target.querySelectorAll('button, a, input, select, [tabindex]').length, 3);
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }
});

describe('a press on the published Stepper', () => {
  it('calls onChange once with one number, value + step, and shows it only once an update passes it', async () => {
    const { handle, calls, input, increment } = mountStepper({ step: 3 });
    await settle();
    const nodes = [input(), increment()];
    increment().focus();
    increment().click();
    await settle();
    assert.deepEqual(calls, [[5]], 'once, with exactly one argument');
    assert.equal(typeof calls[0][0], 'number');
    assert.equal(input().value, '2', 'unchanged until an update');
    assert.equal(handle.update(base({ value: 5, step: 3 })), true);
    await settle();
    assert.equal(input().value, '5');
    assert.ok(input() === nodes[0] && increment() === nodes[1], 'the same nodes');
    assert.ok(document.activeElement === nodes[1], 'focus stays on the button');
    handle.destroy();
  });

  it('changes nothing for a press the companion refuses', async () => {
    const { handle, calls, input, increment } = mountStepper();
    await settle();
    increment().click();
    await settle();
    assert.deepEqual(calls, [[3]]);
    assert.equal(input().value, '2', 'the held value stays drawn');
    handle.destroy();
  });

  it('reports an onChange that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, decrement } = mountStepper({
      onChange: () => {
        throw failure;
      },
    });
    await settle();
    decrement().click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Stepper', 'onChange', failure]]);
    assert.equal(handle.update(base({ value: 1 })), true);
    handle.destroy();
  });
});

describe('a typed edit on the published Stepper', () => {
  for (const [raw, props, expected] of [
    ['7', {}, [[7]]],
    ['12', { max: 10 }, [[10]]],
    ['2.5', {}, [[2.5]]],
    ['', {}, []],
  ]) {
    it(`reports ${JSON.stringify(raw)} as ${JSON.stringify(expected)}`, async () => {
      const { handle, calls, input } = mountStepper(props);
      await settle();
      type(input(), raw);
      assert.deepEqual(calls, expected);
      handle.destroy();
    });
  }
});

describe('the snap-back on blur', () => {
  it('shows the held value once a refused typed value loses focus', async () => {
    const { handle, calls, input } = mountStepper();
    await settle();
    input().focus();
    type(input(), '7');
    assert.equal(input().value, '7', 'what was typed shows until blur');
    input().blur();
    await settle();
    assert.deepEqual(calls, [[7], [7]], 'the edit, and again on blur');
    assert.equal(input().value, '2');
    handle.destroy();
  });

  it('rewrites nothing while the input still holds focus', async () => {
    const { handle, input } = mountStepper();
    await settle();
    input().focus();
    type(input(), '9');
    input().dispatchEvent(new globalThis.Event('blur'));
    await settle();
    assert.equal(input().value, '9');
    handle.destroy();
  });

  it('ends at a value the companion accepts after a timeout', async () => {
    const accepting = {};
    const { handle, input } = mountStepper({
      onChange: (next) => {
        setTimeout(() => accepting.handle.update(base({ value: next })), 0);
      },
    });
    accepting.handle = handle;
    await settle();
    input().focus();
    type(input(), '7');
    input().blur();
    await new Promise((done) => setTimeout(done, 10));
    assert.equal(input().value, '7');
    handle.destroy();
  });

  it('reports a focused input removed from the document while the mount is live, and writes nothing after', async () => {
    const { target, handle, calls, input } = mountStepper();
    await settle();
    const node = input();
    node.focus();
    type(node, '7');
    target.parentElement.remove();
    // Chromium fires blur as a focused element is removed; happy-dom may not, so send it once.
    if (calls.length === 1) node.dispatchEvent(new globalThis.Event('blur'));
    await settle();
    assert.deepEqual(calls, [[7], [7]], 'the blur reports while the mount is live');
    assert.equal(node.value, '7', 'nothing is written to a removed input');
    handle.destroy();
  });

  it('reports a focused input adopted into another document, and snaps it back there', async () => {
    const { target, handle, calls, input } = mountStepper();
    await settle();
    const node = input();
    node.focus();
    type(node, '7');
    const other = document.implementation.createHTMLDocument('detached');
    other.body.append(other.adoptNode(target.parentElement));
    if (calls.length === 1) node.dispatchEvent(new globalThis.Event('blur'));
    await settle();
    assert.deepEqual(calls, [[7], [7]]);
    assert.ok(node.isConnected, 'still in a document');
    assert.equal(node.value, '2', 'unfocused in its own document, so it snaps back');
    handle.destroy();
  });

  it('rewrites nothing while an adopted input holds focus in its own document', async () => {
    const { target, handle, input } = mountStepper();
    await settle();
    const other = document.implementation.createHTMLDocument('detached');
    other.body.append(other.adoptNode(target.parentElement));
    const node = input();
    node.focus();
    assert.ok(other.activeElement === node && document.activeElement !== node, 'focus is there');
    type(node, '9');
    node.dispatchEvent(new globalThis.Event('blur'));
    await settle();
    assert.equal(node.value, '9', 'its own document still focuses it');
    handle.destroy();
  });

  it('calls nothing for a blur after destroy', async () => {
    const { handle, calls, input } = mountStepper();
    await settle();
    const node = input();
    node.focus();
    handle.destroy();
    node.value = '7';
    node.dispatchEvent(new globalThis.Event('blur'));
    await settle();
    assert.deepEqual(calls, []);
  });
});

describe('a bound on the published Stepper', () => {
  it('disables + at max and − at min, natively', async () => {
    const atMax = mountStepper({ value: 10, max: 10 });
    const atMin = mountStepper({ value: 0, min: 0 });
    await settle();
    assert.ok(atMax.increment().disabled && !atMax.decrement().disabled);
    assert.ok(atMin.decrement().disabled && !atMin.increment().disabled);
    atMax.increment().click();
    await settle();
    assert.deepEqual(atMax.calls, [], 'a disabled button reports nothing');
    assert.equal(atMax.input().value, '10', 'and shows no snap-back');
    atMax.handle.destroy();
    atMin.handle.destroy();
  });
});

describe('what the published Stepper refuses', () => {
  for (const key of ['value', 'ariaLabel', 'decrementLabel', 'incrementLabel', 'onChange']) {
    it(`refuses an absent ${key} (M9)`, () => {
      assertRefused({ [key]: undefined }, `Stepper requires a non-empty "${key}"`);
    });
  }

  it('refuses an empty ariaLabel (M9)', () => {
    assertRefused({ ariaLabel: '' }, 'Stepper requires a non-empty "ariaLabel"');
  });

  for (const key of [
    'disabled',
    'inputProps',
    'formatValue',
    'orientation',
    'class',
    'data-acme-id',
  ]) {
    it(`refuses ${key}, which it does not publish (M8)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a prop of Stepper`);
    });
  }

  it('refuses a function in value (M10)', () => {
    assertRefused({ value: () => 2 }, '"value" must not hold a function');
  });

  it('refuses a string for onChange (M17)', () => {
    assertRefused({ onChange: 'x' }, '"onChange" must be a function');
  });

  it('refuses a companion’s own shell (M16), and renders nothing', () => {
    assertRefused({}, 'Stepper needs a Fabricate window ancestor', companionTarget(targets));
  });
});

/**
 * The published `RadioCardGroup`'s `activation` (issue 2889) on Fabricate's real Svelte runtime,
 * through a fresh seam under a Fabricate window root: under `'manual'` the arrow keys, Home and End
 * move focus among the enabled radios and choose nothing, Space (the platform's check), Enter and a
 * press choose once, a modified key is the platform's, and every value but the exact `'manual'`
 * draws today's automatic group, which consumes no key.
 * Limit: happy-dom runs no radio arrow navigation and no Space check, so a key's default is read
 * from `defaultPrevented` and Space's check is simulated; the rendered suite presses real keys.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const OPTIONS = Object.freeze([
  { value: 'hold', label: 'Hold' },
  { value: 'queue', label: 'Queue' },
  { value: 'limited', label: 'Limited' },
  { value: 'drop', label: 'Drop' },
]);
const SOON = Object.freeze([{ value: 'limited', reason: 'Coming soon' }]);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-radio-card-manual-',
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
  seamParts = { createPublishedComponents, runtime, components, loaders: harnessLoaders(harness) };
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
  assert.deepEqual(reports, []);
});

/** A group mounted under a Fabricate window with `overrides`, its recorded calls and its parts. */
function mountGroup(overrides = {}) {
  const change = recorder();
  const target = fabricateTarget(targets);
  const props = {
    options: OPTIONS,
    value: 'hold',
    legend: 'When a step is pending',
    onChange: change.record,
    disabledOptions: SOON,
    activation: 'manual',
    ...overrides,
  };
  const handle = ui().mount('RadioCardGroup', { target, props });
  return {
    target,
    handle,
    calls: change.calls,
    radio: (value) => target.querySelector(`input[type="radio"][value="${value}"]`),
    checked: () => [...target.querySelectorAll('input[type="radio"]:checked')].map((n) => n.value),
    focused: () => target.ownerDocument.activeElement?.value,
  };
}

/** Presses `key` on the focused element, returning whether the group prevented its default. */
function press(target, key, init = {}) {
  const node = target.ownerDocument.activeElement;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Checks `radio` as the platform does on Space or a press, then fires its `change`. */
function check(radio) {
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('a manual RadioCardGroup', () => {
  it('describes activation as a data key', () => {
    assert.deepEqual(ui().describe('RadioCardGroup').props.activation, {
      kind: 'data',
      required: false,
    });
  });

  it('moves focus on each arrow key, skipping the disabled option and wrapping, and chooses nothing', async () => {
    const { target, handle, calls, radio, checked, focused } = mountGroup();
    await settle();
    radio('hold').focus();
    const walk = [
      ['ArrowRight', 'queue'],
      ['ArrowDown', 'drop'],
      ['ArrowRight', 'hold'],
      ['ArrowLeft', 'drop'],
      ['ArrowUp', 'queue'],
    ];
    for (const [key, reached] of walk) {
      assert.equal(press(target, key), true, `${key} is the group's`);
      assert.equal(focused(), reached, `${key} reaches ${reached}`);
    }
    assert.deepEqual(calls, [], 'no key chose');
    assert.deepEqual(checked(), ['hold'], 'the chosen radio stays checked');
    handle.destroy();
  });

  it('moves focus to the first and last enabled radio on Home and End', async () => {
    const { target, handle, calls, radio, focused } = mountGroup({
      disabledOptions: [{ value: 'drop', reason: 'Coming soon' }],
    });
    await settle();
    radio('queue').focus();
    assert.equal(press(target, 'End'), true);
    assert.equal(focused(), 'limited', 'End skips the disabled last option');
    assert.equal(press(target, 'Home'), true);
    assert.equal(focused(), 'hold');
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('reverses ArrowLeft and ArrowRight under a right-to-left direction', async () => {
    const { target, handle, radio, focused } = mountGroup();
    target.setAttribute('dir', 'rtl');
    target.style.direction = 'rtl';
    await settle();
    radio('hold').focus();
    press(target, 'ArrowLeft');
    assert.equal(focused(), 'queue', 'ArrowLeft moves forward');
    press(target, 'ArrowRight');
    assert.equal(focused(), 'hold', 'ArrowRight moves back');
    press(target, 'ArrowDown');
    assert.equal(focused(), 'queue', 'ArrowDown stays forward');
    handle.destroy();
  });

  it('chooses the focused option once on Enter, and holds Enter from the platform', async () => {
    const { target, handle, calls, radio } = mountGroup();
    await settle();
    radio('hold').focus();
    press(target, 'ArrowRight');
    assert.equal(press(target, 'Enter'), true, 'Enter submits no form');
    assert.deepEqual(calls, [['queue']]);
    handle.destroy();
  });

  it('calls nothing on Enter on the checked radio, as Space calls nothing there', async () => {
    const { target, handle, calls, radio } = mountGroup();
    await settle();
    radio('hold').focus();
    assert.equal(press(target, 'Enter'), true);
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('leaves Space, Tab and a modified arrow key to the platform, and chooses once on its check', async () => {
    const { target, handle, calls, radio } = mountGroup();
    await settle();
    radio('hold').focus();
    press(target, 'ArrowRight');
    for (const [key, init] of [
      [' ', {}],
      ['Tab', {}],
      ['ArrowRight', { altKey: true }],
      ['ArrowRight', { ctrlKey: true }],
      ['ArrowRight', { metaKey: true }],
    ]) {
      assert.equal(press(target, key, init), false, `${key} ${JSON.stringify(init)}`);
    }
    check(radio('queue'));
    assert.deepEqual(calls, [['queue']], 'the platform’s Space check chooses once');
    handle.destroy();
  });

  it('chooses once on a press', async () => {
    const { target, handle, calls } = mountGroup();
    await settle();
    target.querySelector('[data-radio-card-option="drop"]').click();
    assert.deepEqual(calls, [['drop']]);
    handle.destroy();
  });

  it('lets every key bubble to a listener above target', async () => {
    const { target, handle, radio } = mountGroup();
    await settle();
    const heard = [];
    target.addEventListener('keydown', (event) => {
      heard.push(event.key);
    });
    radio('hold').focus();
    for (const key of ['ArrowRight', 'Home', 'End', 'Enter']) press(target, key);
    assert.deepEqual(heard, ['ArrowRight', 'Home', 'End', 'Enter']);
    handle.destroy();
  });

  it('moves no focus and chooses nothing in a disabled group', async () => {
    const { target, handle, calls, radio } = mountGroup({ disabled: true });
    await settle();
    assert.ok(radio('hold').matches(':disabled'));
    radio('hold').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    assert.notEqual(target.ownerDocument.activeElement?.value, 'queue');
    assert.deepEqual(calls, []);
    handle.destroy();
  });
});

describe('the automatic RadioCardGroup', () => {
  for (const activation of [undefined, 'automatic', 'Manual', 'MANUAL', ' manual', true, 1, null]) {
    it(`consumes no key for activation ${String(activation)}`, async () => {
      const { target, handle, calls, radio } = mountGroup({ activation });
      await settle();
      radio('hold').focus();
      for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter']) {
        assert.equal(press(target, key), false, `${key} is the platform's`);
      }
      assert.deepEqual(calls, []);
      handle.destroy();
    });
  }

  it('refuses a key no entry names, as a Fabricate that predates activation refuses it', () => {
    const target = fabricateTarget(targets);
    assert.throws(
      () =>
        ui().mount('RadioCardGroup', {
          target,
          props: { options: OPTIONS, legend: 'L', onChange() {}, activationMode: 'manual' },
        }),
      { name: 'TypeError', message: `${REFUSAL}"activationMode" is not a data attribute` }
    );
  });

  it('refuses a function as activation', () => {
    const target = fabricateTarget(targets);
    assert.throws(
      () =>
        ui().mount('RadioCardGroup', {
          target,
          props: { options: OPTIONS, legend: 'L', onChange() {}, activation: () => 'manual' },
        }),
      { name: 'TypeError', message: `${REFUSAL}"activation" must not hold a function` }
    );
    assert.equal(target.childNodes.length, 0);
  });
});

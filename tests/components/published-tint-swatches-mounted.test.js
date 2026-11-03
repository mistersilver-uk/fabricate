/**
 * The published `TintSwatches` on Fabricate's real Svelte runtime (issue 2901), through a fresh
 * seam registered with the adapter's own table, under a Fabricate window root: the radio group and
 * its radios, the swatches `tints` offers, the names `ariaLabel` and `labels` give them, the
 * checked radio and its one Tab stop, a press, Space and the arrow, Home and End keys and their
 * `onChange`, every refusal the entry adds, and the standalone style root it is drawn under in a
 * companion's shell.
 * Limit: happy-dom computes no accessible name and lays out nothing, so
 * `published-tint-swatches-rendered` reads Chromium's tree and moves focus there.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { MANAGER_COLOR_TOKEN_KEYS } from '../../src/ui/svelte/util/managerColorTokens.js';
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
  standaloneRootIn,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const NAME = 'TintSwatches';
const GROUP = 'Activity colour';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-tint-swatches-',
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

/** The props of a strip with Rose checked and a no-op `onChange`, with `overrides` over them. */
const base = (overrides = {}) => ({ value: 'rose', ariaLabel: GROUP, onChange() {}, ...overrides });

/** A strip mounted with `props` over the base and a recording `onChange`. */
function mountStrip(props = {}, under = 'fabricate') {
  const change = recorder();
  const target = fabricateTarget(targets, under);
  const handle = ui().mount(NAME, { target, props: base({ onChange: change.record, ...props }) });
  return {
    target,
    handle,
    calls: change.calls,
    record: change.record,
    group: () => target.querySelector('[role="radiogroup"]'),
    radios: () => [...target.querySelectorAll('[role="radio"]')],
    radio: (token) => target.querySelector(`[data-manager-color-token="${token}"]`),
  };
}

const tokensOf = (radios) => radios.map((radio) => radio.dataset.managerColorToken);
const checkedOf = (radios) =>
  radios
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((r) => r.dataset.managerColorToken);
const stopsOf = (radios) =>
  radios
    .filter((radio) => radio.getAttribute('tabindex') === '0')
    .map((r) => r.dataset.managerColorToken);

/** A keydown of `key` on `radio`, as the browser dispatches it. */
function press(radio, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  radio.dispatchEvent(event);
  return event;
}

/** The refusal `mount` throws for `props` over the base, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount(NAME, { target, props: base(props) }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published TintSwatches draws', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`one radio group of the ten tints under a frame classed ${under}, Rose checked`, async () => {
      const { target, handle, group, radios } = mountStrip({}, under);
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      assert.ok(group() === target.firstElementChild, 'and it is the radio group');
      assert.ok(group().classList.contains('fabricate-tint-swatches'));
      assert.deepEqual(tokensOf(radios()), [...MANAGER_COLOR_TOKEN_KEYS]);
      for (const radio of radios()) {
        assert.equal(radio.tagName, 'BUTTON');
        assert.equal(radio.getAttribute('type'), 'button', 'never submits a form of yours');
        assert.equal(radio.getAttribute('data-keyboard-focus'), 'true');
        assert.equal(
          radio.querySelector('[aria-hidden="true"]').getAttribute('style'),
          `--manager-color-swatch: var(--fab-tag-${radio.dataset.managerColorToken});`
        );
      }
      assert.deepEqual(checkedOf(radios()), ['rose']);
      assert.ok(radios()[3].classList.contains('is-selected'), 'the ring class on Rose alone');
      assert.deepEqual(stopsOf(radios()), ['rose'], 'the checked radio is the one Tab stop');
      assert.ok(!target.querySelector('[data-manager-color-none]'), 'no No-colour radio');
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  for (const value of [undefined, '', 'Rose', '--fab-tag-rose', 'crimson', 3, null]) {
    it(`checks no radio for the value ${JSON.stringify(value)}, and makes the first the Tab stop`, async () => {
      const { handle, radios } = mountStrip({ value });
      await settle();
      assert.deepEqual(checkedOf(radios()), [], 'only an exact tint key checks a swatch');
      assert.deepEqual(stopsOf(radios()), ['sage']);
      handle.destroy();
    });
  }

  it('draws the tints tints offers, in its order, once each, dropping an unknown key', async () => {
    const { handle, radios } = mountStrip({
      tints: ['azure', 'rose', 'crimson', 'rose', '--fab-tag-sage', 'Mist', 'butter'],
    });
    await settle();
    assert.deepEqual(tokensOf(radios()), ['azure', 'rose', 'butter']);
    assert.deepEqual(checkedOf(radios()), ['rose']);
    handle.destroy();
  });

  for (const tints of [[], ['crimson'], 'rose', { rose: true }, null]) {
    it(`draws all ten for the tints ${JSON.stringify(tints)}`, async () => {
      const { handle, radios } = mountStrip({ tints });
      await settle();
      assert.deepEqual(tokensOf(radios()), [...MANAGER_COLOR_TOKEN_KEYS]);
      handle.destroy();
    });
  }

  it('checks no radio for a value tints does not offer', async () => {
    const { handle, radios } = mountStrip({ tints: ['sage', 'mist'] });
    await settle();
    assert.deepEqual(checkedOf(radios()), []);
    assert.deepEqual(stopsOf(radios()), ['sage']);
    handle.destroy();
  });

  it('moves the check and the Tab stop on an update, on the same radios', async () => {
    const { handle, radios, radio } = mountStrip();
    await settle();
    const before = radios();
    assert.equal(handle.update(base({ value: 'aqua' })), true);
    await settle();
    assert.deepEqual(checkedOf(radios()), ['aqua']);
    assert.deepEqual(stopsOf(radios()), ['aqua']);
    assert.ok(radio('rose') === before[3], 'the same element');
    handle.destroy();
  });
});

describe('the published TintSwatches names', () => {
  it('names the group by ariaLabel and each radio by Fabricate’s own tint name', async () => {
    const { handle, group, radios } = mountStrip();
    await settle();
    assert.equal(group().getAttribute('aria-label'), GROUP);
    assert.deepEqual(
      radios().map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('title')]),
      [
        'Sage',
        'Mist',
        'Lavender',
        'Rose',
        'Peach',
        'Butter',
        'Aqua',
        'Mauve',
        'Verdant',
        'Azure',
      ].map((name) => [name, name])
    );
    handle.destroy();
  });

  it('names a radio by its labels text, and by Fabricate’s name where that is blank or absent', async () => {
    const { handle, radio } = mountStrip({
      labels: { rose: 'Rose (a faction colour)', sage: '  ', mist: 4, crimson: 'Crimson' },
    });
    await settle();
    assert.equal(radio('rose').getAttribute('aria-label'), 'Rose (a faction colour)');
    assert.equal(radio('rose').getAttribute('title'), 'Rose (a faction colour)');
    assert.equal(radio('sage').getAttribute('aria-label'), 'Sage');
    assert.equal(radio('mist').getAttribute('aria-label'), 'Mist');
    handle.destroy();
  });
});

describe('a press on the published TintSwatches', () => {
  it('calls onChange once with the tint key, and holds the check on value until an update', async () => {
    const { handle, calls, radios, radio } = mountStrip();
    await settle();
    radio('aqua').click();
    await settle();
    assert.deepEqual(calls, [['aqua']]);
    assert.deepEqual(checkedOf(radios()), ['rose'], 'the strip draws no state of its own');
    radio('rose').click();
    await settle();
    assert.deepEqual(calls, [['aqua']], 'the checked swatch reports nothing');
    handle.destroy();
    assert.deepEqual(calls, [['aqua']], 'nor do mount, update and destroy');
  });

  it('reports an onChange that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, radios, radio } = mountStrip({
      onChange: () => {
        throw failure;
      },
    });
    await settle();
    radio('mist').click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, NAME, 'onChange', failure]]);
    assert.equal(handle.update(base({ value: 'mist' })), true);
    await settle();
    assert.deepEqual(checkedOf(radios()), ['mist']);
    handle.destroy();
  });
});

describe('the keyboard on the published TintSwatches', () => {
  for (const [key, from, to] of [
    ['ArrowRight', 'rose', 'peach'],
    ['ArrowDown', 'rose', 'peach'],
    ['ArrowLeft', 'rose', 'lavender'],
    ['ArrowUp', 'rose', 'lavender'],
    ['ArrowRight', 'azure', 'sage'],
    ['ArrowLeft', 'sage', 'azure'],
    ['Home', 'rose', 'sage'],
    ['End', 'rose', 'azure'],
  ]) {
    it(`${key} from ${from} focuses and chooses ${to}`, async () => {
      const { handle, calls, radio } = mountStrip({ value: from });
      await settle();
      radio(from).focus();
      const event = press(radio(from), key);
      await settle();
      assert.ok(event.defaultPrevented, 'the key is taken');
      assert.ok(document.activeElement === radio(to), `focus is on ${to}`);
      assert.deepEqual(calls, [[to]]);
      handle.destroy();
    });
  }

  it('wraps among the tints tints offers, in its order', async () => {
    const { handle, calls, radio } = mountStrip({
      value: 'butter',
      tints: ['azure', 'rose', 'butter'],
    });
    await settle();
    press(radio('butter'), 'ArrowRight');
    await settle();
    assert.deepEqual(calls, [['azure']]);
    handle.destroy();
  });

  it('swaps Left and Right under direction rtl, and leaves Up and Down', async () => {
    const { target, handle, calls, radio } = mountStrip();
    target.setAttribute('dir', 'rtl');
    target.style.direction = 'rtl';
    await settle();
    press(radio('rose'), 'ArrowRight');
    press(radio('rose'), 'ArrowLeft');
    press(radio('rose'), 'ArrowDown');
    await settle();
    assert.deepEqual(calls, [['lavender'], ['peach'], ['peach']]);
    handle.destroy();
  });

  it('leaves a modified arrow, Tab and a letter to the browser', async () => {
    const { handle, calls, radio } = mountStrip();
    await settle();
    for (const [key, init] of [
      ['ArrowRight', { altKey: true }],
      ['ArrowRight', { ctrlKey: true }],
      ['ArrowRight', { metaKey: true }],
      ['Tab', {}],
      ['a', {}],
    ]) {
      assert.equal(press(radio('rose'), key, init).defaultPrevented, false, `${key} passes`);
    }
    await settle();
    assert.deepEqual(calls, []);
    handle.destroy();
  });
});

describe('what the published TintSwatches refuses', () => {
  for (const [claim, props, tail] of [
    ['an absent ariaLabel', { ariaLabel: undefined }, `${NAME} requires a non-empty "ariaLabel"`],
    ['an empty ariaLabel', { ariaLabel: '' }, `${NAME} requires a non-empty "ariaLabel"`],
    ['an absent onChange', { onChange: undefined }, `${NAME} requires a non-empty "onChange"`],
    ['a string for onChange', { onChange: 'choose' }, '"onChange" must be a function'],
  ]) {
    it(`refuses ${claim} on mount`, () => {
      assertRefused(props, tail);
    });
  }

  for (const key of ['noneLabel', 'noneChecked', 'onClear', 'class', 'data-x', 'aria-label']) {
    it(`refuses ${key}, which it does not publish, on mount and on update`, async () => {
      const tail = `"${key}" is not a prop of ${NAME}`;
      assertRefused({ [key]: 'x' }, tail);
      const { handle, radios } = mountStrip();
      await settle();
      assert.throws(() => handle.update(base({ [key]: 'x' })), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      await settle();
      assert.deepEqual(checkedOf(radios()), ['rose'], 'the earlier strip stays drawn');
      handle.destroy();
    });
  }
});

describe('the published TintSwatches in a companion’s own shell', () => {
  it('draws its group inside one standalone style root, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const change = recorder();
    const handle = ui().mount(NAME, { target, props: base({ onChange: change.record }) });
    await settle();
    const group = standaloneRootIn(target).firstElementChild;
    assert.ok(group.classList.contains('fabricate-tint-swatches'));
    group.querySelector('[data-manager-color-token="sage"]').click();
    assert.deepEqual(change.calls, [['sage']]);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});

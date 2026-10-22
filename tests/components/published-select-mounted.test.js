/**
 * The published `Select` on Fabricate's real Svelte runtime (issue 2454), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window roots it needs: the trigger
 * drawn alone and named, a choice by pointer and by key reaching `onChange` with the value as
 * passed, Escape and an outside press closing without one, an `update` and a render fault while
 * open, the list hosted by the `overlayHost` option, by the nearest `.fabricate-manager` or
 * `.fabricate-app` and by the standalone layer, `destroy` while open, the keys the trigger keeps,
 * values unique as strings, and every refusal the entry adds. The trigger is held here because the
 * static gates pin it to the defaults of the picker's other trigger forms, its names and its
 * choice because they cross into the picker, which the gates do not follow.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  FAULT_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  assertClipped,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REPOSITORY = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const OPTIONS = Object.freeze([
  { value: 10, label: 'Ten per page' },
  { value: 25, label: 'Twenty-five per page' },
  { value: 'all', label: 'Every row' },
]);
const NAMED = Object.freeze({ options: OPTIONS, ariaLabel: 'Rows per page' });

const harness = createMountedComponentHarness({
  repoRoot: REPOSITORY,
  tmpPrefix: 'fabricate-published-select-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let shells;
let handles;
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
  shells = [];
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its list');
  assert.ok(!document.querySelector('[role="listbox"]'), 'no list outlives its mount');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/**
 * A select mounted with `props` over its two required data keys, recording `onChange`, into
 * `target`: its handle, an `update` that passes those props again beside `next`, the recorded
 * calls, and its trigger as drawn now.
 */
function mountSelect(
  props = {},
  { target = fabricateTarget(shells, 'fabricate fabricate-app'), overlayHost, onFault } = {}
) {
  const change = recorder();
  const base = { ...NAMED, onChange: change.record, ...props };
  const handle = ui().mount('Select', { target, props: base, overlayHost, onFault });
  handles.push(handle);
  flushSync();
  return {
    target,
    handle,
    update: (next = {}) => handle.update({ ...base, ...next }),
    calls: change.calls,
    trigger: () => target.querySelector('button'),
  };
}

const listbox = () => document.querySelector('[role="listbox"]');
const rows = () => [...document.querySelectorAll('[role="option"]')];
const rowText = (row) => row.textContent.replaceAll(/\s+/g, ' ').trim();
const selected = () => rows().map((row) => row.getAttribute('aria-selected'));

/** Opens the list from its trigger, as a press does, and answers the panel. */
async function open(trigger) {
  trigger.click();
  flushSync();
  await settle();
  return document.querySelector('[role="dialog"]');
}

/** A cancelable keydown of `key` on `element`, once it has bubbled. */
function press(element, key) {
  const event = new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

/** A positioned element of the companion's own, attached inside the Fabricate window `shell`. */
function companionHost(shell) {
  const host = document.createElement('section');
  host.style.position = 'relative';
  shell.append(host);
  return host;
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(shells), overlayHost = undefined) {
  assert.throws(() => ui().mount('Select', { target, props, overlayHost }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Select draws its trigger alone', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`draws one picker root and one combobox trigger under a frame classed ${under}`, async () => {
      const { target, handle, trigger } = mountSelect(
        { value: 25 },
        {
          target: fabricateTarget(shells, under),
        }
      );
      await settle();
      assert.equal(target.children.length, 1, 'one root in target');
      const root = target.firstElementChild;
      assert.ok(root.classList.contains('fabricate-picker'), 'the picker root');
      assert.ok(root.classList.contains('fabricate-select'), "the select's own root class");
      assert.ok(!target.querySelector('.fabricate-field'), 'not the labelled form');
      assert.equal(target.querySelectorAll('button, a, input, select, [tabindex]').length, 1);
      const button = trigger();
      assert.equal(button.getAttribute('type'), 'button');
      assert.equal(button.getAttribute('role'), 'combobox');
      assert.equal(button.getAttribute('aria-haspopup'), 'listbox');
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      assert.equal(button.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(button.getAttribute('data-select-size'), 'form', 'the default rung');
      assert.ok(button.classList.contains('fabricate-select-trigger-form'));
      assert.ok(!button.hasAttribute('aria-controls'), 'no list to control while closed');
      assert.equal(button.textContent.trim(), 'Twenty-five per page');
      assert.ok(!document.querySelector('[role="dialog"]'), 'the list is closed');
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  it('shows the placeholder while value is absent or null, and each published size', async () => {
    const { update, trigger } = mountSelect({ placeholder: 'Choose a size' });
    await settle();
    const value = () => trigger().querySelector('.fabricate-select-value');
    assert.equal(value().textContent, 'Choose a size');
    assert.ok(value().classList.contains('fabricate-select-value-placeholder'));
    for (const size of ['inline', 'toolbar', 'form']) {
      assert.equal(update({ value: null, size }), true);
      await settle();
      assert.equal(trigger().getAttribute('data-select-size'), size);
      assert.ok(trigger().classList.contains(`fabricate-select-trigger-${size}`));
    }
    assert.equal(update({ value: 'all' }), true);
    await settle();
    assert.equal(value().textContent, 'Every row');
    assert.ok(!value().classList.contains('fabricate-select-value-placeholder'));
  });

  it('opens an empty list on an empty options, which lists nothing', async () => {
    const { trigger } = mountSelect({ options: [] });
    const panel = await open(trigger());
    assert.ok(Boolean(panel), 'the panel opens');
    assert.ok(!listbox(), 'no listbox for no rows');
    assert.equal(
      panel.querySelector('[role="status"]').textContent.trim(),
      '',
      'no copy of its own'
    );
  });
});

describe('the published Select names', () => {
  it('its trigger, its panel and its list by ariaLabel, and each row by its label', async () => {
    const { trigger } = mountSelect({ value: 10 });
    assert.equal(trigger().getAttribute('aria-label'), NAMED.ariaLabel);
    const panel = await open(trigger());
    assert.equal(panel.getAttribute('aria-label'), NAMED.ariaLabel);
    assert.equal(listbox().getAttribute('aria-label'), NAMED.ariaLabel);
    assert.deepEqual(
      rows().map((row) => rowText(row)),
      OPTIONS.map(({ label }) => label)
    );
    assert.deepEqual(selected(), ['true', 'false', 'false'], 'the row for value is selected');
  });

  it('draws no copy of its own and calls no game.i18n while it mounts and opens', async () => {
    const asked = [];
    const localize = globalThis.game.i18n.localize;
    globalThis.game.i18n.localize = (key) => {
      asked.push(key);
      return localize(key);
    };
    try {
      const { trigger } = mountSelect();
      await open(trigger());
      press(trigger(), 'ArrowDown');
    } finally {
      globalThis.game.i18n.localize = localize;
    }
    assert.deepEqual(asked, []);
  });

  it('clips the panel’s polite live region under a Fabricate window', async () => {
    const sheet = readStylesheet();
    const rule = /\.fabricate \.visually-hidden \{[^}]*\}/.exec(sheet)?.[0];
    assert.ok(rule, 'the module utility was read');
    await underSheet(rule, async () => {
      const { trigger } = mountSelect();
      const panel = await open(trigger());
      assertClipped(panel.querySelector('[data-popover-live]'), 'the live region');
    });
  });
});

describe('a choice in the published Select', () => {
  it('calls onChange once with the value as passed, by pointer, and closes on the trigger', async () => {
    const { update, calls, trigger } = mountSelect({ value: 10 });
    await open(trigger());
    rows()[1].click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [[25]], 'the number, not its string');
    assert.equal(typeof calls[0][0], 'number');
    assert.ok(!listbox(), 'a choice closes the list');
    assert.ok(document.activeElement === trigger(), 'focus returns to the trigger');
    assert.equal(trigger().textContent.trim(), 'Ten per page', 'drawn when the update passes it');
    assert.equal(update({ value: 25 }), true);
    await settle();
    assert.equal(trigger().textContent.trim(), 'Twenty-five per page');
    await open(trigger());
    rows()[2].click();
    flushSync();
    assert.deepEqual(calls, [[25], ['all']], 'a string stays a string');
  });

  it('calls onChange by key, from the trigger, which keeps focus and points at the active row', async () => {
    const { calls, trigger } = mountSelect({ value: 10 });
    trigger().focus();
    press(trigger(), 'ArrowDown');
    await settle();
    assert.ok(Boolean(listbox()), 'ArrowDown opens the list');
    assert.ok(document.activeElement === trigger(), 'focus stays on the trigger');
    const active = () =>
      document.querySelector(`[id="${trigger().getAttribute('aria-activedescendant')}"]`);
    press(trigger(), 'ArrowDown');
    assert.equal(active()?.textContent.trim(), 'Twenty-five per page');
    press(trigger(), 'Enter');
    await settle();
    assert.deepEqual(calls, [[25]]);
    assert.ok(!listbox(), 'Enter closes the list');
  });

  it('closes on Escape and on an outside press without calling onChange', async () => {
    const { calls, trigger } = mountSelect({ value: 10 });
    await open(trigger());
    trigger().focus();
    press(trigger(), 'Escape');
    await settle();
    assert.ok(!listbox(), 'Escape closes');
    await open(trigger());
    document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
    flushSync();
    await settle();
    assert.ok(!listbox(), 'an outside press closes');
    assert.deepEqual(calls, [], 'neither chooses');
  });

  it('calls onChange for a choice of the value already held, and never on mount, update or open', async () => {
    const { update, calls, trigger } = mountSelect({ value: 10 });
    assert.equal(update({ value: 25 }), true);
    await open(trigger());
    assert.deepEqual(calls, []);
    rows()[1].click();
    flushSync();
    assert.deepEqual(calls, [[25]], 'every choice is reported');
  });

  it('reports an onChange that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion refused the size');
    const { update, trigger } = mountSelect({
      onChange() {
        throw failure;
      },
    });
    await open(trigger());
    rows()[0].click();
    flushSync();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Select', 'onChange', failure]]);
    assert.equal(update(), true);
  });
});

describe('the published Select while its list is open', () => {
  it('moves the selection on an update, and redraws new options in place with the list open', async () => {
    const { update, trigger } = mountSelect({ value: 10 });
    const panel = await open(trigger());
    assert.equal(update({ value: 'all' }), true);
    flushSync();
    await settle();
    assert.deepEqual(selected(), ['false', 'false', 'true'], 'the selection follows value');
    const more = [{ value: 5, label: 'Five per page' }, ...OPTIONS];
    assert.equal(update({ value: 5, options: more }), true);
    flushSync();
    await settle();
    assert.ok(document.querySelector('[role="dialog"]') === panel, 'the panel is the same node');
    assert.ok(Boolean(listbox()), 'the list stays open');
    assert.deepEqual(
      rows().map((row) => rowText(row)),
      more.map(({ label }) => label)
    );
    assert.deepEqual(selected(), ['true', 'false', 'false', 'false']);
  });

  for (const under of ['fabricate', 'fabricate fabricate-app']) {
    it(`faults once on a render fault under a frame classed ${under}, and leaves no list`, async () => {
      const faults = [];
      const target = fabricateTarget(shells, under);
      const { update, trigger } = mountSelect(
        {},
        {
          target,
          onFault: (error) => {
            faults.push(error);
          },
        }
      );
      const panel = await open(trigger());
      update({ options: [null] });
      flushSync();
      await settle();
      assert.equal(faults.length, 1, 'onFault is told once');
      assert.deepEqual(
        reports.map(([report, name]) => [report, name]),
        [[FAULT_REPORT, 'Select']],
        'reported once'
      );
      assert.ok(!panel.isConnected, 'no panel');
      assert.ok(!document.querySelector(LAYER), 'no layer');
      assert.ok(!listbox(), 'no listbox');
      assert.equal(target.childNodes.length, 0, 'the target is empty');
    });
  }
});

describe('the published Select hosts its list', () => {
  /** The `display: contents` element the seam portaled the panel into. */
  function containerOf(panel) {
    const container = panel.parentElement;
    assert.equal(container.style.display, 'contents', 'the container is display: contents');
    return container;
  }

  it('in the overlayHost option, and a choice there reaches onChange', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { calls, trigger, handle } = mountSelect({}, { target, overlayHost });
    const panel = await open(trigger());
    assert.ok(containerOf(panel).parentElement === overlayHost, 'the option hosts the container');
    assert.ok(!target.contains(panel), 'the panel is drawn outside target');
    rows()[1].click();
    flushSync();
    assert.deepEqual(calls, [[25]]);
    handle.destroy();
    assert.equal(overlayHost.children.length, 0, 'destroy leaves no container');
  });

  it('in the nearest .fabricate-manager above target, inside an app root', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const manager = document.createElement('div');
    manager.className = 'fabricate-manager';
    target.parentElement.append(manager);
    manager.append(target);
    const { trigger } = mountSelect({}, { target });
    const panel = await open(trigger());
    assert.ok(containerOf(panel).parentElement === manager, 'the Manager root hosts');
    assert.ok(!document.querySelector(LAYER), 'no standalone layer is made');
  });

  it('in the nearest .fabricate-app above target when no overlayHost is passed', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { trigger } = mountSelect({}, { target });
    const panel = await open(trigger());
    assert.ok(containerOf(panel).parentElement === target.parentElement, 'the app root hosts');
    assert.ok(!document.querySelector(LAYER), 'no standalone layer is made');
  });

  it('in the standalone layer under a Fabricate frame with no app root, which goes when it closes', async () => {
    const target = fabricateTarget(shells, 'fabricate');
    const { calls, trigger } = mountSelect({}, { target });
    const panel = await open(trigger());
    const layer = document.querySelector(LAYER);
    assert.ok(layer?.parentElement === document.body, 'a layer on the target’s body');
    assert.ok(containerOf(panel).parentElement === layer);
    rows()[2].click();
    flushSync();
    await settle();
    assert.deepEqual(calls, [['all']]);
    assert.ok(!document.querySelector(LAYER), 'the layer goes with its last list');
  });

  it('leaves no panel, container or layer when destroyed while open', async () => {
    const { handle, trigger } = mountSelect({}, { target: fabricateTarget(shells, 'fabricate') });
    const panel = await open(trigger());
    const container = containerOf(panel);
    handle.destroy();
    await settle();
    assert.ok(!panel.isConnected && !container.isConnected, 'no panel and no container');
    assert.ok(!document.querySelector(LAYER), 'no layer');
    assert.deepEqual(reports, []);
  });
});

describe('the keys the published Select keeps', () => {
  it('stops every keydown on its trigger from bubbling, and Tab leaves the list open', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const heard = [];
    target.parentElement.addEventListener('keydown', (event) => {
      heard.push(event.key);
    });
    const { trigger } = mountSelect({}, { target });
    await open(trigger());
    trigger().focus();
    for (const key of ['ArrowDown', 'a', 'Tab']) press(trigger(), key);
    await settle();
    assert.ok(Boolean(listbox()), 'Tab leaves the list open');
    press(trigger(), 'Escape');
    await settle();
    assert.ok(!listbox(), 'Escape closes the list');
    press(trigger(), 'Escape');
    await settle();
    assert.deepEqual(heard, [], 'no key reached the companion above target, Escape included');
  });
});

describe('the published Select’s values', () => {
  it('draws a row of its own for each value unique as a string, and faults on 1 beside "1"', async () => {
    const { trigger } = mountSelect();
    await open(trigger());
    assert.equal(new Set(rows().map((row) => row.id)).size, OPTIONS.length, 'one id per value');
    handles.pop().destroy();
    const faults = [];
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const options = [
      { value: 1, label: 'One' },
      { value: '1', label: 'One, as text' },
    ];
    const { trigger: shared } = mountSelect(
      { options },
      {
        target,
        onFault: (error) => {
          faults.push(error);
        },
      }
    );
    await open(shared());
    await settle();
    assert.equal(faults.length, 1, 'the list cannot draw two rows that share one string');
    assert.deepEqual(
      reports.map(([report, name]) => [report, name]),
      [[FAULT_REPORT, 'Select']]
    );
    assert.ok(!listbox(), 'no list is left');
    assert.equal(target.childNodes.length, 0, 'the target is empty');
  });
});

describe('the published Select refuses', () => {
  it('a missing options, a missing or empty ariaLabel, and a missing onChange (M9)', () => {
    assertRefused(
      { ariaLabel: 'Rows', onChange: () => {} },
      'Select requires a non-empty "options"'
    );
    assertRefused(
      { options: OPTIONS, onChange: () => {} },
      'Select requires a non-empty "ariaLabel"'
    );
    assertRefused(
      { ...NAMED, ariaLabel: '', onChange: () => {} },
      'Select requires a non-empty "ariaLabel"'
    );
    assertRefused({ ...NAMED }, 'Select requires a non-empty "onChange"');
  });

  it('an onChange that is no function (M17), and a function inside options (M10)', () => {
    assertRefused({ ...NAMED, onChange: 'choose' }, '"onChange" must be a function');
    assertRefused(
      { ...NAMED, options: [{ value: 1, label: 'One', format: () => 'x' }], onChange: () => {} },
      '"options" must not hold a function'
    );
  });

  it('a data-* key, which lands on no element it draws, and every unpublished prop (M8)', () => {
    for (const key of ['data-companion-select', 'label', 'disabled', 'readonly', 'mono', 'class']) {
      assertRefused(
        { ...NAMED, onChange: () => {}, [key]: 'x' },
        `"${key}" is not a prop of Select`
      );
    }
  });

  it('a target outside a Fabricate window (M16), and an overlayHost of another kind (M18)', () => {
    assertRefused(
      { ...NAMED, onChange: () => {} },
      'Select needs a Fabricate window ancestor',
      companionTarget(shells)
    );
    assertRefused(
      { ...NAMED, onChange: () => {} },
      "overlayHost must be an element in the target's document",
      fabricateTarget(shells),
      document.createTextNode('host')
    );
  });
});

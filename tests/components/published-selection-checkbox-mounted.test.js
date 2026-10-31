/**
 * The published `SelectionCheckbox` on Fabricate's real Svelte runtime (issue 2836), through a
 * fresh seam registered with the adapter's own table, under a Fabricate window root: the label
 * wrapper, input, box and visible label it draws, the name `label` and `ariaLabel` give it, its
 * three states and `density`, a press and its `onChange`, the input held on `checked` until an
 * update, `aria-describedby` and the rest keys on the input, every refusal the entry adds, and the
 * standalone style root it is drawn under in a companion's shell.
 * Limit: happy-dom computes no accessible name, so `checkbox-rendered` reads Chromium's tree.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { byCodePoint } from '../helpers/codePointOrder.js';
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
const NAME = 'SelectionCheckbox';
const LABEL = 'Award the recipe’s ingredients first';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-selection-checkbox-',
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

/** The props of an unticked, labelled box with a no-op `onChange`, with `overrides` over them. */
const base = (overrides = {}) => ({ checked: false, label: LABEL, onChange() {}, ...overrides });

/** A box mounted with `props` over an unticked, labelled one and a recording `onChange`. */
function mountBox(props = {}, under = 'fabricate') {
  const change = recorder();
  const target = fabricateTarget(targets, under);
  const handle = ui().mount(NAME, { target, props: base({ onChange: change.record, ...props }) });
  return {
    target,
    handle,
    calls: change.calls,
    record: change.record,
    wrapper: () => target.querySelector('label.fab-selection-checkbox'),
    input: () => target.querySelector('input[type="checkbox"]'),
    box: () => target.querySelector('.fab-selection-check'),
    text: () => target.querySelector('.fab-selection-label'),
  };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
/** The box's state classes and the input's two state properties. */
const stateOf = ({ box, input }) => ({
  classes: authoredClasses(box()).sort(byCodePoint),
  // happy-dom keeps a property as written, where a browser reads it back as a boolean.
  checked: Boolean(input().checked),
  indeterminate: Boolean(input().indeterminate),
});

/** The refusal `mount` throws for `props` over a labelled box, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount(NAME, { target, props: base(props) }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published SelectionCheckbox draws', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`one labelled box under a frame classed ${under}: the input, the box, then the label`, async () => {
      const { target, handle, wrapper, input, box, text } = mountBox({}, under);
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      assert.ok(wrapper() === target.firstElementChild, 'and it is the label wrapper');
      assert.deepEqual(authoredClasses(wrapper()), ['fab-selection-checkbox', 'has-label']);
      assert.deepEqual(
        [...wrapper().children].map((node) => node.tagName.toLowerCase()),
        ['input', 'span', 'span'],
        'the input and the box, then the visible label, all inside the click target'
      );
      assert.equal(text().textContent, LABEL);
      assert.equal(box().getAttribute('aria-hidden'), 'true');
      assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
      assert.ok(!input().hasAttribute('aria-label'), 'the wrapping label names the input');
      assert.ok(!input().hasAttribute('data-keyboard-focus'), 'an input needs no mark');
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  it('draws unticked, ticked and mixed, a mixed box reading as mixed when checked too, and reports none of it', async () => {
    const held = mountBox();
    await settle();
    assert.deepEqual(stateOf(held), {
      classes: ['fab-selection-check', 'is-md'],
      checked: false,
      indeterminate: false,
    });
    assert.ok(held.box().querySelector('i.fa-check'), 'the tick glyph, drawn clear at rest');
    for (const [props, classes, checked, indeterminate, glyph] of [
      [{ checked: true }, ['is-md', 'is-checked'], true, false, 'fa-check'],
      [{ indeterminate: true }, ['is-md', 'is-indeterminate'], false, true, 'fa-minus'],
      [
        { checked: true, indeterminate: true },
        ['is-md', 'is-checked', 'is-indeterminate'],
        true,
        true,
        'fa-minus',
      ],
    ]) {
      assert.equal(held.handle.update(base({ onChange: held.record, ...props })), true);
      await settle();
      assert.deepEqual(stateOf(held), {
        classes: ['fab-selection-check', ...classes].sort(byCodePoint),
        checked,
        indeterminate,
      });
      assert.ok(held.box().querySelector(`i.${glyph}`), `${JSON.stringify(props)} draws ${glyph}`);
    }
    assert.equal(held.handle.update(base({ onChange: held.record })), true);
    await settle();
    assert.equal(held.input().indeterminate, false, 'the property is cleared, not only set');
    assert.deepEqual(held.calls, [], 'mount and update call no onChange');
    held.handle.destroy();
    assert.deepEqual(held.calls, [], 'nor does destroy');
  });

  it('reads indeterminate as true alone and checked as any truthy value, coercing nothing', async () => {
    const held = mountBox({ checked: 'false', indeterminate: 'true' });
    await settle();
    assert.deepEqual(stateOf(held), {
      classes: ['fab-selection-check', 'is-checked', 'is-md'],
      checked: true,
      indeterminate: false,
    });
    held.handle.destroy();
  });

  for (const checked of [0, null]) {
    it(`draws the box empty for checked ${JSON.stringify(checked)}, which it does not refuse`, async () => {
      const held = mountBox({ checked });
      await settle();
      assert.deepEqual(stateOf(held), {
        classes: ['fab-selection-check', 'is-md'],
        checked: false,
        indeterminate: false,
      });
      held.handle.destroy();
    });
  }

  for (const [density, size] of [
    ['compact', 'is-sm'],
    ['default', 'is-md'],
    ['comfortable', 'is-lg'],
    ['huge', 'is-md'],
    [16, 'is-md'],
  ]) {
    it(`draws the ${size} box for density ${JSON.stringify(density)}`, async () => {
      const { handle, box } = mountBox({ density });
      await settle();
      assert.deepEqual(authoredClasses(box()), ['fab-selection-check', size]);
      handle.destroy();
    });
  }

  for (const disabled of [true, 'false']) {
    it(`disables the input and classes the wrapper for disabled ${JSON.stringify(disabled)}, keeping the drawn state`, async () => {
      const { handle, wrapper, input, box, calls } = mountBox({ disabled, checked: true });
      await settle();
      assert.equal(input().disabled, true, 'a truthy value disables, coercing nothing');
      assert.deepEqual(authoredClasses(wrapper()), [
        'fab-selection-checkbox',
        'is-disabled',
        'has-label',
      ]);
      assert.ok(box().classList.contains('is-checked'), 'the tick stays drawn');
      input().click();
      assert.deepEqual(calls, [], 'a disabled input reports nothing');
      handle.destroy();
    });
  }

  it('lands aria-describedby and a rest data key on the input, the control', async () => {
    const { handle, input } = mountBox({
      'aria-describedby': 'acme-spend-hint',
      'data-acme-flag': 'grant',
    });
    await settle();
    assert.equal(input().getAttribute('aria-describedby'), 'acme-spend-hint');
    assert.equal(input().getAttribute('data-acme-flag'), 'grant');
    assert.equal(handle.update(base()), true);
    await settle();
    assert.ok(!input().hasAttribute('aria-describedby'), 'an update that omits it removes it');
    handle.destroy();
  });
});

describe('the published SelectionCheckbox names', () => {
  it('names the input by ariaLabel beside the visible label, which still draws', async () => {
    const ariaLabel = `Spent: spend Ember salt when this stage begins`;
    const { handle, input, text } = mountBox({ label: 'Spent', ariaLabel });
    await settle();
    assert.equal(input().getAttribute('aria-label'), ariaLabel);
    assert.equal(text().textContent, 'Spent');
    handle.destroy();
  });

  for (const label of [undefined, '', ' '.repeat(3)]) {
    it(`draws the box alone, named by ariaLabel, for the label ${JSON.stringify(label)}`, async () => {
      const { target, handle, wrapper, input, text } = mountBox({
        label,
        ariaLabel: 'Select Iron ore',
      });
      await settle();
      assert.equal(input().getAttribute('aria-label'), 'Select Iron ore');
      assert.ok(!text(), 'no label span');
      assert.deepEqual(authoredClasses(wrapper()), ['fab-selection-checkbox']);
      assert.equal(target.querySelectorAll('input').length, 1);
      handle.destroy();
    });
  }
});

describe('a press on the published SelectionCheckbox', () => {
  it('calls onChange once with the asked-for state, and holds the input on checked until an update', async () => {
    const { handle, calls, input, box } = mountBox();
    await settle();
    input().click();
    await settle();
    assert.deepEqual(calls, [[true]]);
    assert.equal(input().checked, false, 'the input still shows the checked it was passed');
    assert.ok(!box().classList.contains('is-checked'));
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('draws the new state on the same focused input when onChange updates it, both ways', async () => {
    let checked = false;
    const props = () =>
      base({
        checked,
        onChange: (next) => {
          checked = next;
          held.handle.update(props());
        },
      });
    const held = mountBox(props());
    await settle();
    const node = held.input();
    node.focus();
    node.click();
    await settle();
    assert.ok(held.input() === node && document.activeElement === node, 'same node, focus kept');
    assert.equal(node.checked, true);
    assert.ok(held.box().classList.contains('is-checked'));
    node.click();
    await settle();
    assert.equal(node.checked, false, 'and back');
    held.handle.destroy();
  });

  it('asks for checked from a mixed, unticked box and keeps it mixed until an update', async () => {
    const { handle, calls, input } = mountBox({ indeterminate: true });
    await settle();
    input().click();
    await settle();
    assert.deepEqual(calls, [[true]]);
    assert.equal(input().indeterminate, true, 'still mixed');
    assert.equal(input().checked, false);
    handle.destroy();
  });

  it('presses from a click on the visible label, which is part of the target', async () => {
    const { handle, calls, text } = mountBox();
    await settle();
    text().click();
    await settle();
    assert.deepEqual(calls, [[true]]);
    handle.destroy();
  });

  it('reports an onChange that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, input } = mountBox({
      onChange: () => {
        throw failure;
      },
    });
    await settle();
    input().click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, NAME, 'onChange', failure]]);
    assert.equal(handle.update(base({ checked: true })), true);
    await settle();
    assert.equal(input().checked, true);
    handle.destroy();
  });
});

describe('what the published SelectionCheckbox refuses', () => {
  for (const [claim, props, tail] of [
    ['an absent checked', { checked: undefined }, `${NAME} requires a non-empty "checked"`],
    ['an empty checked', { checked: '' }, `${NAME} requires a non-empty "checked"`],
    [
      'an absent label beside no ariaLabel',
      { label: undefined },
      `${NAME} requires a non-empty "label"`,
    ],
    [
      'an empty label beside a blank ariaLabel',
      { label: '', ariaLabel: '  ' },
      `${NAME} requires a non-empty "label"`,
    ],
    ['an absent onChange', { onChange: undefined }, `${NAME} requires a non-empty "onChange"`],
    ['a string for onChange', { onChange: 'toggle' }, '"onChange" must be a function'],
    ['a number as its label', { label: 3 }, '"label" must be a string'],
    [
      'an ariaLabel that does not hold the label',
      { label: 'Spent', ariaLabel: 'Spend Ember salt when this stage begins' },
      '"ariaLabel" must contain the text of "label" ("Spent" is not in "Spend Ember salt when this stage begins")',
    ],
    [
      'an object for aria-describedby',
      { 'aria-describedby': {} },
      '"aria-describedby" must be a string, number or boolean',
    ],
  ]) {
    it(`refuses ${claim} on mount`, () => {
      assertRefused(props, tail);
    });
  }

  for (const key of [
    'data-keyboard-focus',
    'data-action',
    'data-cursor',
    'data-tooltip',
    'data-tooltip-direction',
  ]) {
    it(`refuses the rest key ${key}, reserved on the input`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is reserved on ${NAME}`);
    });
  }

  for (const key of ['decorative', 'wrapper', 'input', 'class', 'value', 'name', 'aria-label']) {
    it(`refuses ${key}, which it does not publish, on mount and on update`, async () => {
      const tail = `"${key}" is not a data attribute`;
      assertRefused({ [key]: 'x' }, tail);
      const { handle, text } = mountBox();
      await settle();
      assert.throws(() => handle.update(base({ [key]: 'x' })), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      await settle();
      assert.equal(text().textContent, LABEL, 'the earlier box stays drawn');
      handle.destroy();
    });
  }
});

describe('the published SelectionCheckbox in a companion’s own shell', () => {
  it('draws its box inside one standalone style root, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const change = recorder();
    const handle = ui().mount(NAME, { target, props: base({ onChange: change.record }) });
    await settle();
    const wrapper = standaloneRootIn(target).firstElementChild;
    assert.ok(wrapper.classList.contains('fab-selection-checkbox'));
    wrapper.querySelector('input').click();
    assert.deepEqual(change.calls, [[true]]);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});

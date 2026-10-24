/**
 * The published `SegmentedControl` on Fabricate's real Svelte runtime (issue 2644), through a fresh
 * seam registered with the adapter's own table, under the Fabricate window root it needs: the named
 * radiogroup and its native radios, each named by its option's `label` and sharing one name unique
 * to the mount, a press and a key with the one `value` its `onChange` takes, a declined change put
 * back and an accepted one drawn, numeric values, what an enclosing form reads, the disabled option,
 * the clipped radio, every refusal the entry adds, an empty `options`, and the View Lab specimen.
 * Limit: happy-dom runs no radio arrow navigation, so the key clause asserts the keys pass the
 * control unhandled and simulates the platform's check; the View Lab case presses the real key.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { fixtureLiteral } from '../helpers/labFixtureLiterals.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  assertClipped,
  companionTarget,
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
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned', icon: 'fas fa-check' },
  { value: 'missing', label: 'Missing', icon: 'fas fa-xmark' },
]);
const SIZES = Object.freeze([
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 100, label: '100', disabled: true },
]);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-segmented-control-',
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
});

/** The control's required props over `OPTIONS`, with `onChange` given, and `overrides`. */
const controlProps = (onChange, overrides = {}) => ({
  options: OPTIONS,
  value: 'all',
  ariaLabel: 'Ingredient filter',
  onChange,
  ...overrides,
});

/** A target inside a `<form>` under a Fabricate window, and that form. */
function formTarget() {
  const target = fabricateTarget(targets);
  const form = document.createElement('form');
  target.replaceWith(form);
  form.append(target);
  return { target, form };
}

/** A control mounted under a Fabricate window: its target, handle, recorded calls and its parts. */
function mountControl(overrides = {}, onChange = undefined, target = fabricateTarget(targets)) {
  const change = recorder();
  const props = controlProps(onChange ?? change.record, overrides);
  const handle = ui().mount('SegmentedControl', { target, props });
  return {
    target,
    handle,
    props,
    calls: change.calls,
    group: () => target.querySelector('[role="radiogroup"]'),
    radio: (value) => target.querySelector(`input[type="radio"][value="${value}"]`),
    radios: () => [...target.querySelectorAll('input[type="radio"]')],
    segment: (value) =>
      target.querySelector(`input[type="radio"][value="${value}"]`).closest('label'),
  };
}

/** A control whose `onChange` passes the reached value back in its own `update`, before it returns. */
function mountAccepting(overrides = {}, target = undefined) {
  const companion = { calls: [] };
  const onChange = (value) => {
    companion.calls.push([value]);
    companion.handle.update(controlProps(onChange, { ...overrides, value }));
  };
  const mounted = mountControl(overrides, onChange, target);
  companion.handle = mounted.handle;
  return { ...mounted, calls: companion.calls };
}

/** Focuses and checks `radio` as the platform does on a key, then fires its `change`. */
function reach(radio) {
  radio.focus();
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

const checkedValues = (radios) => radios.filter((node) => node.checked).map((node) => node.value);
const drawnSelected = (segment) => segment.classList.contains('is-active');

/** The refusal `mount` throws for the control's props with `overrides`, with nothing rendered. */
function assertRefused(overrides, tail) {
  const target = fabricateTarget(targets);
  assert.throws(
    () => ui().mount('SegmentedControl', { target, props: controlProps(() => {}, overrides) }),
    { name: 'TypeError', message: REFUSAL + tail }
  );
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published SegmentedControl', () => {
  it('describes the six keys its manifest entry publishes, at the fabricate root', () => {
    const described = ui().describe('SegmentedControl');
    assert.deepEqual(Object.keys(described.props), [
      'options',
      'value',
      'onChange',
      'ariaLabel',
      'fill',
      'density',
    ]);
    assert.deepEqual(described.props.onChange, { kind: 'callback', required: true });
    assert.equal(described.root, 'fabricate');
    assert.equal(described.overlays, false);
  });

  it('draws one named radiogroup holding a native radio for each option, then leaves target empty on destroy', async () => {
    const { target, handle, group, radios } = mountControl();
    await settle();
    assert.equal(target.children.length, 1, 'the radiogroup is the only element in target');
    assert.ok(target.firstElementChild === group());
    assert.equal(group().getAttribute('aria-label'), 'Ingredient filter');
    assert.deepEqual(
      radios().map((node) => node.value),
      OPTIONS.map(({ value }) => value)
    );
    assert.deepEqual(checkedValues(radios()), ['all']);
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('updates the one radiogroup in place: a new name, a new value and fill on the same root', async () => {
    const { handle, props, group, radios, segment } = mountControl();
    await settle();
    const root = group();
    const next = { ...props, ariaLabel: 'Ingredient view', value: 'missing', fill: true };
    assert.equal(handle.update(next), true);
    await settle();
    assert.ok(group() === root, 'the same radiogroup node');
    assert.equal(root.getAttribute('aria-label'), 'Ingredient view');
    assert.ok(root.classList.contains('is-fill'));
    assert.deepEqual(checkedValues(radios()), ['missing']);
    assert.ok(drawnSelected(segment('missing')));
    handle.destroy();
  });

  it('lands rest data attributes, data-keyboard-focus included, on the radiogroup, never on a segment or a radio', async () => {
    const { target, handle, group } = mountControl({
      'data-acme-filter': 'ingredients',
      'data-keyboard-focus': 'true',
    });
    await settle();
    assert.equal(group().dataset.acmeFilter, 'ingredients');
    assert.equal(group().dataset.keyboardFocus, 'true');
    assert.equal(target.querySelectorAll('[data-acme-filter], [data-keyboard-focus]').length, 1);
    handle.destroy();
  });

  it('draws the inline density as its own track class', async () => {
    const { handle, group } = mountControl({ density: 'inline' });
    await settle();
    assert.ok(group().classList.contains('is-inline'));
    handle.destroy();
  });

  it('draws the named radiogroup with no segment and no radio for an empty options', async () => {
    const { target, handle, group, radios } = mountControl({ options: [], value: '' });
    await settle();
    assert.equal(group().getAttribute('aria-label'), 'Ingredient filter');
    assert.equal(radios().length, 0, 'no radio');
    assert.ok(!target.querySelector('label'), 'no segment');
    handle.destroy();
  });

  it('writes distinct names for two mounts in one form, each shared within its mount', async () => {
    const { target, form } = formTarget();
    const second = document.createElement('div');
    form.append(second);
    const one = mountControl({}, undefined, target);
    const two = mountControl({}, undefined, second);
    await settle();
    const names = (mounted) => [...new Set(mounted.radios().map((node) => node.name))];
    assert.equal(names(one).length, 1, 'one name per mount');
    assert.notEqual(names(one)[0], '', 'and never empty');
    assert.equal(names(two).length, 1);
    assert.notEqual(names(one)[0], names(two)[0], 'two mounts are two radio groups');
    one.handle.destroy();
    two.handle.destroy();
  });

  it('disables a disabled option’s radio natively, dims its segment, and calls nothing for its press', async () => {
    const { handle, calls, radio, segment } = mountControl({ options: SIZES, value: 10 });
    await settle();
    assert.ok(radio(100).disabled);
    assert.ok(segment(100).classList.contains('is-disabled'));
    radio(100).click();
    segment(100).click();
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('draws the radio clipped, under its own scoped style', async () => {
    const { handle, radio } = mountControl();
    await settle();
    assertClipped(radio('all'), 'the radio');
    handle.destroy();
  });
});

describe('the published SegmentedControl names', () => {
  it('names each radio by its option’s label through the wrapping label, with no aria-label of its own', async () => {
    const { handle, radios } = mountControl();
    await settle();
    for (const [index, node] of radios().entries()) {
      assert.equal(node.closest('label')?.textContent.trim(), OPTIONS[index].label);
      assert.ok(!node.hasAttribute('aria-label'), node.value);
      assert.ok(!node.hasAttribute('aria-labelledby'), node.value);
    }
    handle.destroy();
  });

  it('draws a label of markup as text, and its glyph hidden from assistive technology', async () => {
    const { target, handle, segment } = mountControl({
      options: [{ value: 'a', label: '<b>Bold</b>', icon: 'fas fa-bold' }],
      value: 'a',
    });
    await settle();
    assert.equal(segment('a').textContent.trim(), '<b>Bold</b>');
    assert.ok(!target.querySelector('b'), 'no markup is parsed');
    assert.equal(segment('a').querySelector('i').getAttribute('aria-hidden'), 'true');
    handle.destroy();
  });
});

describe('the keyboard on the published SegmentedControl', () => {
  it('consumes none of the arrow keys or Space, which bubble to the companion, and calls onChange with the radio the platform checks', async () => {
    const { target, handle, calls, radio } = mountControl();
    await settle();
    const heard = [];
    const hear = (event) => {
      heard.push([event.type, event.key]);
    };
    target.addEventListener('keydown', hear);
    target.addEventListener('keyup', hear);
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' '];
    radio('all').focus();
    for (const key of keys) {
      for (const type of ['keydown', 'keyup']) {
        const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
        radio('all').dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, `${type} ${key} is the platform's`);
      }
    }
    assert.deepEqual(
      heard,
      keys.flatMap((key) => [
        ['keydown', key],
        ['keyup', key],
      ])
    );
    assert.deepEqual(calls, [], 'a key alone calls nothing');
    reach(radio('owned'));
    assert.deepEqual(calls, [['owned']], 'one call, with the checked radio’s value');
    handle.destroy();
  });
});

describe('a choice on the published SegmentedControl', () => {
  it('puts the check on the reached radio when onChange updates options as well as value', async () => {
    const { target, form } = formTarget();
    let handle;
    const onChange = (next) => {
      handle.update(controlProps(onChange, { options: [...OPTIONS].reverse(), value: next }));
    };
    const mounted = mountControl({}, onChange, target);
    handle = mounted.handle;
    await settle();
    const heard = [];
    form.addEventListener('change', () => {
      heard.push(checkedValues(mounted.radios()));
    });
    reach(mounted.radio('missing'));
    assert.deepEqual(heard, [['missing']], 'the form reads the reached radio inside the change');
    await settle();
    assert.deepEqual(checkedValues(mounted.radios()), ['missing']);
    handle.destroy();
  });

  it('checks no radio for a string value over numeric options, even after a declined press', async () => {
    const declined = mountControl({ options: SIZES, value: '10' });
    await settle();
    reach(declined.radio(25));
    assert.deepEqual(checkedValues(declined.radios()), []);
    await settle();
    assert.deepEqual(checkedValues(declined.radios()), []);
    declined.handle.destroy();
  });

  it('calls onChange once with the pressed segment’s value, and draws it selected only after the companion’s update', async () => {
    const { handle, props, calls, segment } = mountControl();
    await settle();
    segment('owned').click();
    assert.deepEqual(calls, [['owned']]);
    await settle();
    assert.ok(!drawnSelected(segment('owned')), 'not before the update');
    handle.update({ ...props, value: 'owned' });
    await settle();
    assert.ok(drawnSelected(segment('owned')), 'drawn selected after it');
    handle.destroy();
  });

  it('calls nothing for a press on the selected segment', async () => {
    const { handle, calls, segment } = mountControl();
    await settle();
    segment('all').click();
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('puts the previous radio back and leaves focus on the reached one when the companion declines', async () => {
    const { handle, calls, radio, radios, segment } = mountControl();
    await settle();
    reach(radio('owned'));
    assert.deepEqual(calls, [['owned']]);
    assert.deepEqual(checkedValues(radios()), ['all'], 'the radio is put back at once');
    assert.ok(document.activeElement === radio('owned'), 'focus stays on the reached radio');
    assert.ok(!radio('owned').checked, 'drawn unchecked');
    await settle();
    assert.ok(drawnSelected(segment('all')));
    assert.ok(!drawnSelected(segment('owned')));
    handle.destroy();
  });

  it('keeps the reached radio checked when the companion passes it from inside onChange', async () => {
    const { handle, calls, radio, radios, segment } = mountAccepting();
    await settle();
    reach(radio('owned'));
    assert.deepEqual(calls, [['owned']]);
    assert.deepEqual(checkedValues(radios()), ['owned']);
    await settle();
    assert.deepEqual(checkedValues(radios()), ['owned']);
    assert.ok(drawnSelected(segment('owned')));
    handle.destroy();
  });

  it('compares numeric values by option: an accept keeps the new radio, a decline the previous one', async () => {
    const accepted = mountAccepting({ options: SIZES, value: 10 });
    await settle();
    reach(accepted.radio(25));
    assert.deepEqual(accepted.calls, [[25]], 'the option’s own number, not the radio’s string');
    await settle();
    assert.deepEqual(checkedValues(accepted.radios()), ['25']);
    const declined = mountControl({ options: SIZES, value: 10 });
    await settle();
    reach(declined.radio(25));
    assert.deepEqual(checkedValues(declined.radios()), ['10']);
    accepted.handle.destroy();
    declined.handle.destroy();
  });

  it('lets an enclosing form’s change listener read the radio of value: the reached one on accept, the previous one on decline', async () => {
    for (const [accepts, read] of [
      [true, 'owned'],
      [false, 'all'],
    ]) {
      const { target, form } = formTarget();
      const mounted = accepts ? mountAccepting({}, target) : mountControl({}, undefined, target);
      await settle();
      const heard = [];
      form.addEventListener('change', () => {
        heard.push(form.querySelector('input[type="radio"]:checked')?.value);
      });
      reach(mounted.radio('owned'));
      assert.deepEqual(heard, [read], accepts ? 'on accept' : 'on decline');
      mounted.handle.destroy();
    }
  });

  it('reports an onChange that throws once, and stays drawn and live with the check put back', async () => {
    const failure = new Error('the companion write failed');
    const { handle, props, radio, radios } = mountControl({}, () => {
      throw failure;
    });
    await settle();
    reach(radio('owned'));
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'SegmentedControl', 'onChange', failure]]);
    assert.deepEqual(checkedValues(radios()), ['all'], 'the previous radio is put back');
    assert.equal(handle.update({ ...props, onChange() {} }), true);
    handle.destroy();
  });
});

describe('what the published SegmentedControl refuses', () => {
  for (const key of [
    'groupName',
    'optionDataAttr',
    'iconOnly',
    'tone',
    'shape',
    'class',
    'aria-labelledby',
  ]) {
    it(`refuses ${key}, which it does not publish (M13)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a data attribute`);
    });
  }

  for (const [claim, overrides, tail] of [
    [
      'an absent options (M9)',
      { options: undefined },
      'SegmentedControl requires a non-empty "options"',
    ],
    ['an empty options (M9)', { options: '' }, 'SegmentedControl requires a non-empty "options"'],
    [
      'an absent ariaLabel (M9)',
      { ariaLabel: undefined },
      'SegmentedControl requires a non-empty "ariaLabel"',
    ],
    [
      'an empty ariaLabel (M9)',
      { ariaLabel: '' },
      'SegmentedControl requires a non-empty "ariaLabel"',
    ],
    [
      'an absent onChange (M9)',
      { onChange: undefined },
      'SegmentedControl requires a non-empty "onChange"',
    ],
    ['an empty onChange (M17)', { onChange: '' }, '"onChange" must be a function'],
    ['a string for onChange (M17)', { onChange: 'x' }, '"onChange" must be a function'],
    [
      'a function in an option (M10)',
      { options: [{ value: 'a', label: 'A', onPick: () => {} }] },
      '"options" must not hold a function',
    ],
  ]) {
    it(`refuses ${claim}, and renders nothing`, () => {
      assertRefused(overrides, tail);
    });
  }

  it('refuses a companion’s own shell (M16), and renders nothing', () => {
    const shell = companionTarget(targets);
    assert.throws(
      () => ui().mount('SegmentedControl', { target: shell, props: controlProps(() => {}) }),
      { name: 'TypeError', message: `${REFUSAL}SegmentedControl needs a Fabricate window ancestor` }
    );
    assert.equal(shell.childNodes.length, 0);
  });
});

describe('the segmented View Lab specimen case against the DOM the fixture draws', () => {
  const FIXTURE = 'tests/view-lab/fixtures/PublishedSegmented.svelte';
  const viewCase = getCaseById('manager-published-segmented-specimen');
  const count = (selector) => document.querySelectorAll(selector).length;

  /**
   * The fixture's filter ground: its control mounted into the target, and the echo its `onChange`
   * writes; `update` false is a companion whose `onChange` passes no `value` back.
   */
  function drawFixture({ update = true } = {}) {
    const { filter } = fixtureLiteral(FIXTURE, 'CONTROLS');
    const ground = document.createElement('div');
    ground.setAttribute('data-lab-segmented-ground', 'filter');
    const slot = document.createElement('div');
    slot.setAttribute('data-lab-segmented', 'filter');
    ground.append(slot);
    fabricateTarget(targets).append(ground);
    let value = filter.value;
    const props = () => ({
      ...filter,
      value,
      onChange: (next) => {
        if (update) {
          value = next;
          handle.update(props());
        }
        ground.setAttribute('data-lab-segmented-chosen', next);
      },
    });
    const handle = ui().mount('SegmentedControl', { target: slot, props: props() });
    const owned = () => slot.querySelector('input[value="owned"]');
    return { handle, owned };
  }

  /** Presses the case's one step on the one element it names, then does what the platform does. */
  function runStep(owned) {
    const [step] = viewCase.steps;
    assert.equal(count(step.selector), 1, 'the step names one radio');
    const node = document.querySelector(step.selector);
    node.focus();
    const key = new KeyboardEvent('keydown', { key: step.press, bubbles: true, cancelable: true });
    node.dispatchEvent(key);
    assert.equal(key.defaultPrevented, false, 'the key is the platform’s');
    reach(owned());
  }

  it('waits on exactly one element, the reached segment, once the step and the update have run', async () => {
    const { handle, owned } = drawFixture();
    await settle();
    assert.equal(count(viewCase.expectSelector), 0, 'not before the step');
    runStep(owned);
    await settle();
    assert.equal(count(viewCase.expectSelector), 1, 'one element after it');
    assert.ok(
      document.querySelector(viewCase.expectSelector) === owned().closest('label'),
      'the Owned segment'
    );
    for (const selector of [
      viewCase.expectCenterHit,
      ...viewCase.expectLayout.controls.map((control) => control.selector),
    ]) {
      assert.equal(count(selector), 1, `${selector} names one element`);
    }
    handle.destroy();
  });

  it('waits on nothing when the companion’s onChange passes no update', async () => {
    const { handle, owned } = drawFixture({ update: false });
    await settle();
    runStep(owned);
    await settle();
    assert.ok(document.activeElement === owned(), 'focus moved to Owned');
    assert.equal(count(viewCase.expectSelector), 0, 'its choice was never drawn');
    handle.destroy();
  });
});

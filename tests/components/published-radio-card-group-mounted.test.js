/**
 * The published `RadioCardGroup` on Fabricate's real Svelte runtime (issue 2601), through a fresh
 * seam registered with the adapter's own table, under a Fabricate window root and the standalone
 * style root it is drawn under in a companion's own shell (issue 2679): the named fieldset and its
 * native radios, each named by its option's `label` and sharing one name unique to the mount, a
 * press and a key with the one `value` its `onChange` takes, a declined change put back and an
 * accepted one drawn, the disabled forms, the reason, the `columns` coercion, the hidden legend,
 * every refusal the entry adds, and an empty `options`.
 * Limit: happy-dom runs no radio arrow navigation, so the key clause asserts the keys pass the
 * group unhandled and simulates the platform's check; the View Lab case presses the real key.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
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
  standaloneRootIn,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const OPTIONS = Object.freeze([
  {
    value: 'breakable',
    label: 'Breakable',
    description: 'The check may break it.',
    icon: 'fas fa-hammer',
  },
  { value: 'immune', label: 'Immune', description: 'It never breaks.', icon: 'fas fa-lock' },
  { value: 'limited', label: 'Limited uses', icon: 'fas fa-hourglass-half' },
]);
const SOON = Object.freeze([{ value: 'limited', reason: 'Coming soon' }]);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-radio-card-group-',
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

/** The group's required props over `OPTIONS`, with `onChange` given, and `overrides`. */
const groupProps = (onChange, overrides = {}) => ({
  options: OPTIONS,
  value: 'breakable',
  legend: 'When the tool breaks',
  onChange,
  disabledOptions: SOON,
  ...overrides,
});

/** A group mounted under a Fabricate window: its target, handle, recorded calls and its parts. */
function mountGroup(overrides = {}, onChange = undefined) {
  const change = recorder();
  const target = fabricateTarget(targets);
  const props = groupProps(onChange ?? change.record, overrides);
  const handle = ui().mount('RadioCardGroup', { target, props });
  return {
    target,
    handle,
    props,
    calls: change.calls,
    fieldset: () => target.querySelector('fieldset'),
    radio: (value) => target.querySelector(`input[type="radio"][value="${value}"]`),
    radios: () => [...target.querySelectorAll('input[type="radio"]')],
    card: (value) => target.querySelector(`[data-radio-card-option="${value}"]`),
  };
}

/** Checks `radio` as the platform does on a press or a key, then fires its `change`. */
function choose(radio) {
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

const checkedValues = (radios) => radios.filter((node) => node.checked).map((node) => node.value);

/** The refusal `mount` throws for the group's props with `overrides`, with nothing rendered. */
function assertRefused(overrides, tail) {
  const target = fabricateTarget(targets);
  assert.throws(
    () => ui().mount('RadioCardGroup', { target, props: groupProps(() => {}, overrides) }),
    { name: 'TypeError', message: REFUSAL + tail }
  );
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published RadioCardGroup', () => {
  it('describes the eight keys its manifest entry publishes, at the fabricate root', () => {
    const described = ui().describe('RadioCardGroup');
    assert.deepEqual(Object.keys(described.props), [
      'options',
      'value',
      'onChange',
      'legend',
      'layout',
      'columns',
      'disabled',
      'disabledOptions',
    ]);
    assert.deepEqual(described.props.onChange, { kind: 'callback', required: true });
    assert.equal(described.root, 'any');
    assert.equal(described.overlays, false);
  });

  it('draws one fieldset holding a native radio for each option, then leaves target empty on destroy', async () => {
    const { target, handle, fieldset, radios } = mountGroup();
    await settle();
    assert.equal(target.children.length, 1, 'the fieldset is the only element in target');
    assert.ok(target.firstElementChild === fieldset());
    assert.deepEqual(
      radios().map((node) => node.value),
      OPTIONS.map(({ value }) => value)
    );
    assert.deepEqual(checkedValues(radios()), ['breakable']);
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('updates the one fieldset in place: a new legend and a new value on the same root', async () => {
    const { handle, props, fieldset, radios, card } = mountGroup();
    await settle();
    const root = fieldset();
    assert.equal(handle.update({ ...props, legend: 'Breakage', value: 'immune' }), true);
    await settle();
    assert.ok(fieldset() === root, 'the same fieldset node');
    assert.equal(root.querySelector('legend').textContent, 'Breakage');
    assert.deepEqual(checkedValues(radios()), ['immune']);
    assert.ok(card('immune').classList.contains('is-active'));
    handle.destroy();
  });

  it('shares one non-empty name across one mount’s radios, and a second mount writes another', async () => {
    const first = mountGroup();
    const second = mountGroup();
    await settle();
    const names = (mounted) => [...new Set(mounted.radios().map((node) => node.name))];
    assert.equal(names(first).length, 1, 'one name per mount');
    assert.notEqual(names(first)[0], '', 'and never empty');
    assert.equal(names(second).length, 1);
    assert.notEqual(names(first)[0], names(second)[0], 'two mounts are two radio groups');
    first.handle.destroy();
    second.handle.destroy();
  });

  it('lands a rest data attribute on the fieldset, never on a card or a radio', async () => {
    const { target, handle, fieldset } = mountGroup({ 'data-acme-breakage': 'tool' });
    await settle();
    assert.equal(fieldset().dataset.acmeBreakage, 'tool');
    assert.equal(target.querySelectorAll('[data-acme-breakage]').length, 1);
    handle.destroy();
  });

  it('draws the reason beneath its option, undimmed, and adds it to the radio’s description', async () => {
    const { handle, radio, card } = mountGroup();
    await settle();
    const reason = card('limited').querySelector('[data-radio-card-reason]');
    assert.equal(reason.textContent, 'Coming soon');
    assert.ok(radio('limited').disabled, 'the reason disables its radio natively');
    assert.ok(radio('limited').getAttribute('aria-describedby').split(' ').includes(reason.id));
    assert.ok(!radio('immune').disabled);
    handle.destroy();
  });

  it('draws the named fieldset with no card and no radio for an empty options', async () => {
    const { target, handle, fieldset, radios } = mountGroup({ options: [], value: '' });
    await settle();
    assert.equal(fieldset().querySelector('legend').textContent, 'When the tool breaks');
    assert.equal(radios().length, 0, 'no radio');
    assert.ok(!target.querySelector('[data-radio-card-option]'), 'no card');
    handle.destroy();
  });

  for (const [columns, written] of [
    ['2; background:red', 2],
    [0, 2],
    [-1, 2],
    [1.5, 2],
    ['x', 2],
    [3, 3],
    [1, 1],
  ]) {
    it(`writes ${written} tracks for columns ${JSON.stringify(columns)}, and nothing else into the style`, async () => {
      const { target, handle } = mountGroup({ columns });
      await settle();
      const options = target.querySelector('.manager-resolution-mode-options');
      assert.equal(options.getAttribute('style'), `--manager-radio-card-columns: ${written};`);
      handle.destroy();
    });
  }

  it('draws the legend visually hidden, clipped under the module sheet', async () => {
    const sheet = readStylesheet();
    const rule =
      /\.fabricate-option-cards\.manager-resolution-mode-card \.manager-resolution-mode-legend \{[^}]*\}/.exec(
        sheet
      )?.[0];
    assert.ok(rule, 'the module rule that hides the legend was read');
    await underSheet(rule, async () => {
      const { handle, fieldset } = mountGroup();
      await settle();
      assertClipped(fieldset().querySelector('legend'), 'the legend');
      handle.destroy();
    });
  });
});

describe('the published RadioCardGroup names', () => {
  it('names each radio by its option’s label through aria-labelledby, with no aria-label of its own', async () => {
    const { target, handle, radios } = mountGroup();
    await settle();
    for (const [index, node] of radios().entries()) {
      const named = target.querySelector(`[id="${node.getAttribute('aria-labelledby')}"]`);
      assert.equal(named?.textContent, OPTIONS[index].label);
      assert.ok(!node.hasAttribute('aria-label'), node.value);
    }
    handle.destroy();
  });

  it('describes a radio by its description, and draws a label of markup as text', async () => {
    const { target, handle, radio } = mountGroup({
      options: [{ value: 'a', label: '<b>Bold</b>', description: 'Said once.' }],
      value: 'a',
      disabledOptions: [],
    });
    await settle();
    const described = target.querySelector(`[id="${radio('a').getAttribute('aria-describedby')}"]`);
    assert.equal(described?.textContent, 'Said once.');
    assert.ok(!target.querySelector('b'), 'no markup is parsed');
    handle.destroy();
  });
});

describe('the keyboard on the published RadioCardGroup', () => {
  it('consumes none of the arrow keys or Space, which bubble to the companion, and calls onChange with the radio the platform checks', async () => {
    const { target, handle, calls, radio } = mountGroup();
    await settle();
    const heard = [];
    const hear = (event) => {
      heard.push([event.type, event.key]);
    };
    target.addEventListener('keydown', hear);
    target.addEventListener('keyup', hear);
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' '];
    radio('breakable').focus();
    for (const key of keys) {
      for (const type of ['keydown', 'keyup']) {
        const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
        radio('breakable').dispatchEvent(event);
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
    radio('immune').focus();
    choose(radio('immune'));
    assert.deepEqual(calls, [['immune']], 'one call, with the checked radio’s value');
    handle.destroy();
  });
});

describe('a choice on the published RadioCardGroup', () => {
  it('calls onChange once with the pressed card’s value', async () => {
    const { handle, calls, card } = mountGroup();
    await settle();
    card('immune').click();
    assert.deepEqual(calls, [['immune']]);
    handle.destroy();
  });

  it('puts the previous radio back when the companion declines the change', async () => {
    const { handle, calls, radio, radios, card } = mountGroup();
    await settle();
    choose(radio('immune'));
    assert.deepEqual(calls, [['immune']]);
    assert.deepEqual(checkedValues(radios()), ['breakable'], 'the radio is put back at once');
    await settle();
    assert.ok(card('breakable').classList.contains('is-active'));
    assert.ok(!card('immune').classList.contains('is-active'));
    handle.destroy();
  });

  it('draws the new choice when the companion passes it from inside onChange, before any await', async () => {
    const companion = {};
    const onChange = (value) => {
      companion.handle.update(groupProps(onChange, { value }));
    };
    const mounted = mountGroup({}, onChange);
    companion.handle = mounted.handle;
    await settle();
    choose(mounted.radio('immune'));
    assert.deepEqual(checkedValues(mounted.radios()), ['immune']);
    await settle();
    assert.ok(mounted.card('immune').classList.contains('is-active'));
    mounted.handle.destroy();
  });

  it('calls nothing for a disabled option, or for a disabled group', async () => {
    const one = mountGroup();
    await settle();
    choose(one.radio('limited'));
    assert.deepEqual(one.calls, [], 'a disabled option');
    assert.deepEqual(checkedValues(one.radios()), ['breakable'], 'and its radio is put back');
    const all = mountGroup({ disabled: true });
    await settle();
    assert.ok(
      all.radios().every((node) => node.matches(':disabled')),
      'the fieldset disables every radio'
    );
    assert.ok(all.fieldset().disabled, 'the fieldset itself is disabled');
    choose(all.radio('immune'));
    assert.deepEqual(all.calls, [], 'a disabled group');
    one.handle.destroy();
    all.handle.destroy();
  });

  it('reports an onChange that throws once, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, props, radio, radios } = mountGroup({}, () => {
      throw failure;
    });
    await settle();
    choose(radio('immune'));
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'RadioCardGroup', 'onChange', failure]]);
    assert.deepEqual(checkedValues(radios()), ['breakable'], 'the previous radio is put back');
    assert.equal(handle.update({ ...props, onChange() {} }), true);
    handle.destroy();
  });
});

describe('what the published RadioCardGroup refuses', () => {
  for (const key of [
    'groupName',
    'cardId',
    'hint',
    'legendVisible',
    'optionDataAttr',
    'class',
    'optionBody',
  ]) {
    it(`refuses ${key}, which it does not publish (M13)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a data attribute`);
    });
  }

  for (const [claim, overrides, tail] of [
    [
      'an absent options (M9)',
      { options: undefined },
      'RadioCardGroup requires a non-empty "options"',
    ],
    [
      'an absent legend (M9)',
      { legend: undefined },
      'RadioCardGroup requires a non-empty "legend"',
    ],
    ['an empty legend (M9)', { legend: '' }, 'RadioCardGroup requires a non-empty "legend"'],
    [
      'an absent onChange (M9)',
      { onChange: undefined },
      'RadioCardGroup requires a non-empty "onChange"',
    ],
    ['a string for onChange (M17)', { onChange: 'x' }, '"onChange" must be a function'],
    [
      'a function for optionBody (M10)',
      { optionBody: () => 'x' },
      '"optionBody" must not hold a function',
    ],
  ]) {
    it(`refuses ${claim}, and renders nothing`, () => {
      assertRefused(overrides, tail);
    });
  }
});

describe('the published RadioCardGroup in a companion’s own shell', () => {
  it('draws its fieldset inside one standalone style root, the checked radio is reached, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const handle = ui().mount('RadioCardGroup', { target, props: groupProps(() => {}) });
    await settle();
    const fieldset = standaloneRootIn(target).firstElementChild;
    assert.equal(fieldset.localName, 'fieldset');
    const checked = target.querySelector('input[type="radio"]:checked');
    assert.ok(fieldset.contains(checked), 'target’s checked radio is the group’s');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});

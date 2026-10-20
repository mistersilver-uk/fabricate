/**
 * The published `SearchField` on Fabricate's real Svelte runtime (issue 2453), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window roots it needs: the label
 * root and its one input, a typed query and the browser's clear reported through `onValueChange`,
 * an `update` drawn without a call back, the Enter guard inside a `<form>`, and every refusal the
 * entry adds. The label root is held here because the static gates pin the rest landing to the
 * default of the unpublished `label`.
 * Limit: happy-dom draws no cancel button, clears nothing on Escape and submits no form on Enter,
 * so a clear is the `input` event the browser fires, and the guard is read off `defaultPrevented`.
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
const NAMED = Object.freeze({ ariaLabel: 'Search recipes', placeholder: 'Name or tag' });

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-search-',
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

/**
 * A search field mounted with `props` over its two names, recording `onValueChange`, into
 * `target`: its handle, the recorded calls, and its input as drawn now.
 */
function mountSearch(props = {}, target = fabricateTarget(targets)) {
  const change = recorder();
  const handle = ui().mount('SearchField', {
    target,
    props: { ...NAMED, onValueChange: change.record, ...props },
  });
  return { target, handle, calls: change.calls, input: () => target.querySelector('input') };
}

/** Sets `input` to `raw` and fires the `input` event, as typing and the browser's clear both do. */
function fill(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** A cancelable Enter `keydown` dispatched on `input`, composing or not, once it has bubbled. */
function pressEnter(input, isComposing = false) {
  const event = new globalThis.KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    isComposing,
  });
  input.dispatchEvent(event);
  return event;
}

/** A target inside a `<form>` inside a Fabricate window frame, beside the form's submit count. */
function targetInForm() {
  const shell = document.createElement('section');
  shell.className = 'fabricate';
  const form = document.createElement('form');
  const target = document.createElement('div');
  const submits = { count: 0 };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submits.count += 1;
  });
  form.append(target);
  shell.append(form);
  document.body.append(shell);
  targets.push(shell);
  return { target, submits };
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(targets)) {
  assert.throws(() => ui().mount('SearchField', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the default draws the label root alone', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`draws the label, its glyph and one named input under a frame classed ${under}`, async () => {
      const target = fabricateTarget(targets, under);
      const { handle } = mountSearch({ 'data-companion-search': 'recipes' }, target);
      await settle();
      assert.equal(target.children.length, 1, 'one root in target');
      const root = target.firstElementChild;
      assert.equal(root.tagName.toLowerCase(), 'label');
      assert.ok(root.classList.contains('fabricate-search'), 'the search root');
      assert.ok(!target.querySelector('.fabricate-field'), 'not the caption form');
      assert.equal(root.getAttribute('data-companion-search'), 'recipes', 'rest on the root');
      const [glyph, input] = root.children;
      assert.equal(glyph.getAttribute('aria-hidden'), 'true');
      assert.equal(input.getAttribute('type'), 'search');
      assert.equal(input.getAttribute('aria-label'), NAMED.ariaLabel);
      assert.equal(input.getAttribute('placeholder'), NAMED.placeholder);
      assert.ok(!input.hasAttribute('name'), 'no name, so nothing joins the form data');
      assert.ok(!input.hasAttribute('data-companion-search'), 'the input takes no rest key');
      assert.equal(input.value, '', 'the initial');
      assert.equal(handle.value('value'), '');
      assert.equal(target.querySelectorAll('button, a, input, select, [tabindex]').length, 1);
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }
});

describe('a query typed into the published SearchField', () => {
  it('calls onValueChange once per change with (next, previous), and handle.value tracks it', async () => {
    const { handle, calls, input } = mountSearch({ value: 'ir' });
    await settle();
    assert.equal(input().value, 'ir');
    fill(input(), 'iro');
    fill(input(), 'iron');
    assert.deepEqual(calls, [
      ['iro', 'ir'],
      ['iron', 'iro'],
    ]);
    assert.equal(handle.value('value'), 'iron');
    handle.destroy();
  });

  it('reports the browser’s clear, from the cancel button or Escape, as a call with the empty string', async () => {
    const { handle, calls, input } = mountSearch();
    await settle();
    fill(input(), 'iron');
    fill(input(), '');
    assert.deepEqual(calls, [
      ['iron', ''],
      ['', 'iron'],
    ]);
    assert.equal(handle.value('value'), '');
    handle.destroy();
  });

  it('draws an update without a call back, and keeps the value an update omits', async () => {
    const { handle, calls, input } = mountSearch();
    await settle();
    const node = input();
    assert.equal(handle.update({ ...NAMED, value: 'salt', placeholder: 'Any word' }), true);
    await settle();
    assert.equal(input().value, 'salt');
    assert.equal(input().getAttribute('placeholder'), 'Any word');
    assert.equal(handle.update({ ...NAMED }), true);
    await settle();
    assert.equal(input().value, 'salt', 'an omitted value keeps its current value');
    assert.ok(input() === node, 'the same input, so focus and caret survive');
    assert.deepEqual(calls, [], 'mount and update never call back');
    handle.destroy();
  });

  it('draws a transform the companion makes inside the call by the time the event returns, with one call', async () => {
    const calls = [];
    const mounted = mountSearch({
      onValueChange(...args) {
        calls.push(args);
        mounted.handle.update({ ...NAMED, value: args[0].trim().toLowerCase() });
      },
    });
    await settle();
    const seen = [];
    const ancestor = mounted.target.parentElement;
    const read = () => {
      seen.push(mounted.input().value);
    };
    ancestor.addEventListener('input', read);
    fill(mounted.input(), ' IRON');
    ancestor.removeEventListener('input', read);
    assert.deepEqual(seen, ['iron'], 'drawn before the event finished dispatching to an ancestor');
    assert.equal(mounted.input().value, 'iron', 'drawn before the event returned');
    assert.deepEqual(calls, [[' IRON', '']], 'no second call for the transform');
    assert.equal(mounted.handle.value('value'), 'iron');
    mounted.handle.destroy();
  });

  it('reports an onValueChange that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion filter failed');
    const { handle, input } = mountSearch({
      onValueChange() {
        throw failure;
      },
    });
    await settle();
    fill(input(), 'iron');
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'SearchField', 'onValueChange', failure]]);
    assert.equal(handle.value('value'), 'iron');
    assert.equal(handle.update({ ...NAMED }), true);
    handle.destroy();
  });
});

describe('Enter in the published SearchField', () => {
  it('cancels the implicit submission of the form it is in, and submits nothing', async () => {
    const { target, submits } = targetInForm();
    const { handle, calls, input } = mountSearch({}, target);
    await settle();
    fill(input(), 'iron');
    assert.equal(
      pressEnter(input()).defaultPrevented,
      true,
      'the implicit submission is cancelled'
    );
    await settle();
    assert.equal(submits.count, 0);
    assert.deepEqual(calls, [['iron', '']], 'Enter reports nothing');
    handle.destroy();
  });

  it('leaves Enter alone while an IME composition is in progress', async () => {
    const { target } = targetInForm();
    const { handle, input } = mountSearch({}, target);
    await settle();
    assert.equal(pressEnter(input(), true).defaultPrevented, false);
    handle.destroy();
  });

  it('leaves Enter alone outside a form, and lets every key bubble to the companion', async () => {
    const target = fabricateTarget(targets);
    const heard = [];
    target.parentElement.addEventListener('keydown', (event) => {
      heard.push(event.key);
    });
    const { handle, input } = mountSearch({}, target);
    await settle();
    assert.equal(pressEnter(input()).defaultPrevented, false);
    assert.deepEqual(heard, ['Enter'], 'the key reached the companion above target');
    handle.destroy();
  });
});

describe('the published SearchField refuses', () => {
  it('a missing or empty ariaLabel (M9)', () => {
    assertRefused({ placeholder: 'x' }, 'SearchField requires a non-empty "ariaLabel"');
    assertRefused({ ariaLabel: '' }, 'SearchField requires a non-empty "ariaLabel"');
  });

  it('a value that is no primitive (M20), and a change callback that is no function (M17)', () => {
    assertRefused(
      { ...NAMED, value: ['iron'] },
      '"value" must be a string, number, boolean or null'
    );
    assertRefused({ ...NAMED, onValueChange: 'filter' }, '"onValueChange" must be a function');
  });

  it('a target outside a Fabricate window (M16)', () => {
    assertRefused(
      { ...NAMED },
      'SearchField needs a Fabricate window ancestor',
      companionTarget(targets)
    );
  });
});

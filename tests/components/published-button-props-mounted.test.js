/**
 * The published `Button`'s `size`, `icon`, `busy` and `type` (issue 2773) on Fabricate's real
 * Svelte runtime, through a fresh seam registered with the adapter's own table, under a Fabricate
 * window root: the class each size writes, the glyph before the label, the busy face's ARIA and its
 * swallowed press, the type each value writes and the submit it makes, and what a value outside a
 * closed set draws.
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
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const LABEL = 'Clear filters';
const FAMILY = ['fabricate-button'];

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-button-props-',
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
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** A button mounted with `props` over a label and a recording `onclick`. */
function mountButton(props = {}) {
  const press = recorder();
  const target = fabricateTarget(targets, 'fabricate');
  const given = { children: LABEL, onclick: press.record, ...props };
  const handle = ui().mount('Button', { target, props: given });
  return { target, handle, calls: press.calls, button: () => target.querySelector('button') };
}

/** A node's authored classes, without Svelte's scope hash. */
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published Button, size, icon, busy and type', () => {
  for (const [size, classes] of [
    ['28', ['is-size-28']],
    ['38', ['is-size-38']],
    ['40', []],
  ]) {
    it(`writes size ${JSON.stringify(size)} as ${classes.join('') || 'no size class'}, and replaces it on update`, async () => {
      const { handle, button } = mountButton({ size });
      await settle();
      assert.deepEqual(authoredClasses(button()), [...FAMILY, ...classes]);
      assert.equal(handle.update({ children: LABEL, onclick() {} }), true);
      await settle();
      assert.deepEqual(authoredClasses(button()), FAMILY);
      handle.destroy();
    });
  }

  it('draws a hidden glyph before the label, which stays the whole name, and removes it with the key', async () => {
    const { handle, button } = mountButton({ icon: 'fas fa-plus' });
    await settle();
    const [glyph, label] = button().children;
    assert.deepEqual([glyph.localName, glyph.getAttribute('aria-hidden')], ['i', 'true']);
    assert.deepEqual(authoredClasses(glyph), ['fas', 'fa-plus']);
    assert.deepEqual([label.textContent, button().textContent], [LABEL, LABEL]);
    assert.equal(handle.update({ children: LABEL, onclick() {} }), true);
    await settle();
    assert.equal(button().querySelectorAll('i').length, 0);
    handle.destroy();
  });

  for (const [type, written] of [
    [undefined, 'button'],
    ['submit', 'submit'],
    ['reset', 'reset'],
    ['bogus', 'button'],
    [true, 'button'],
  ]) {
    it(`writes type ${JSON.stringify(type)} as ${written}`, async () => {
      const { handle, button } = mountButton({ type });
      await settle();
      assert.equal(button().getAttribute('type'), written);
      handle.destroy();
    });
  }

  /** `mountButton(props)` inside a form, with the `submit` events recorded. */
  function mountInForm(props) {
    const mounted = mountButton(props);
    const doc = mounted.target.ownerDocument;
    const form = doc.createElement('form');
    mounted.target.before(form);
    form.append(mounted.target);
    const submitted = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted.push(mounted.calls.length);
    });
    return { ...mounted, submitted };
  }

  it('submits the form around a submit button after onclick, and not once type is omitted', async () => {
    const { handle, calls, submitted, button } = mountInForm({ type: 'submit' });
    await settle();
    button().click();
    assert.deepEqual([calls.length, submitted], [1, [1]], 'onclick first, then the submit');
    assert.equal(handle.update({ children: LABEL, onclick() {} }), true);
    await settle();
    button().click();
    assert.deepEqual(submitted, [1], 'omitted, type is button again and submits nothing');
    handle.destroy();
  });

  it('swallows the press of a busy submit button, onclick and the submit alike', async () => {
    const { handle, calls, submitted, button } = mountInForm({ type: 'submit', busy: true });
    await settle();
    button().click();
    assert.deepEqual([calls, submitted], [[], []]);
    handle.destroy();
  });

  it('marks a busy button aria-busy and aria-disabled, never disabled, and swallows the press', async () => {
    const { handle, calls, button } = mountButton({ busy: true });
    await settle();
    const node = button();
    assert.equal(node.getAttribute('aria-busy'), 'true');
    assert.equal(node.getAttribute('aria-disabled'), 'true');
    assert.ok(!node.disabled && !node.hasAttribute('disabled'), 'it keeps its tab stop');
    node.click();
    assert.deepEqual(calls, [], 'a busy press calls nothing');
    const next = recorder();
    assert.equal(handle.update({ children: LABEL, onclick: next.record }), true);
    await settle();
    assert.ok(button() === node, 'the same button node');
    assert.ok(!node.hasAttribute('aria-busy') && !node.hasAttribute('aria-disabled'));
    node.click();
    assert.deepEqual(next.calls, [[]], 'idle again, the press reaches onclick');
    handle.destroy();
  });

  it('draws busy beside disabled as disabled, and busy false as neither attribute', async () => {
    const both = mountButton({ busy: true, disabled: true });
    const idle = mountButton({ busy: false });
    await settle();
    assert.ok(both.button().disabled && both.button().getAttribute('aria-busy') === 'true');
    assert.deepEqual(
      idle
        .button()
        .getAttributeNames()
        .filter((n) => n.startsWith('aria-')),
      []
    );
    both.handle.destroy();
    idle.handle.destroy();
  });
});

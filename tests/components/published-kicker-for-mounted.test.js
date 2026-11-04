/**
 * The published `Kicker`'s `for` (issue 2933) on Fabricate's real Svelte runtime, through a fresh
 * seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: a non-blank string draws a `<label>` carrying `for`, whatever `as` says, a value
 * outside that draws the `as` host with no attribute, an `update` moves the host and the
 * reference in the same mount, and the kicker draws no `id` of its own.
 * Limit: happy-dom computes no accessible name, so the name a label gives its control is
 * `kicker-for-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const LABEL = 'Recipe name';
const ROOT = 'fab-kicker';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-kicker-for-',
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

/** A kicker mounted with `props` over a label: its target, handle and the kicker as drawn now. */
function mountKicker(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('Kicker', { target, props: { children: LABEL, ...props } });
  return { target, handle, kicker: () => target.querySelector(`.${ROOT}`) };
}

const attributeNames = (node) => [...node.attributes].map(({ name }) => name);

describe('the published Kicker describes for', () => {
  it('lists it as an optional data key, after size and before children', () => {
    const { props } = ui().describe('Kicker');
    assert.deepEqual(Object.keys(props), ['as', 'tone', 'size', 'for', 'children']);
    assert.deepEqual(props.for, { kind: 'data', required: false });
  });
});

describe('the published Kicker, for', () => {
  it('draws a label carrying for, with its text and the kicker class and no id', async () => {
    const { handle, kicker } = mountKicker({ for: 'acme-recipe-name' });
    await settle();
    assert.equal(kicker().localName, 'label');
    assert.equal(kicker().getAttribute('for'), 'acme-recipe-name');
    assert.equal(kicker().textContent, LABEL);
    assert.equal(kicker().hasAttribute('id'), false, 'the kicker draws no id');
    handle.destroy();
  });

  for (const as of ['p', 'span', 'h3', 'button', undefined]) {
    it(`draws a label for ${JSON.stringify(as)}, since for decides the host`, async () => {
      const { handle, kicker } = mountKicker({ as, for: 'acme-recipe-name' });
      await settle();
      assert.equal(kicker().localName, 'label');
      handle.destroy();
    });
  }

  it('keeps the tone and size classes on the label', async () => {
    const { handle, kicker } = mountKicker({ for: 'x', tone: 'accent', size: '8' });
    await settle();
    const classes = [...kicker().classList].filter((name) => !name.startsWith('svelte-'));
    assert.deepEqual(classes, [ROOT, 'is-accent', 'is-size-8']);
    handle.destroy();
  });

  for (const value of ['', ' ', '  \n', 5, true, false, null, {}, ['x']]) {
    it(`draws the as host with no for attribute for ${JSON.stringify(value)}`, async () => {
      const { handle, kicker } = mountKicker({ as: 'span', for: value });
      await settle();
      assert.equal(kicker().localName, 'span');
      assert.equal(kicker().hasAttribute('for'), false);
      handle.destroy();
    });
  }

  for (const as of ['button', 'a', 'input', 'h1']) {
    it(`draws a <p> for an as of ${JSON.stringify(as)} with no for, so neither key draws a control`, async () => {
      const { handle, kicker } = mountKicker({ as });
      await settle();
      assert.equal(kicker().localName, 'p');
      handle.destroy();
    });
  }

  it('draws a kicker without the key as it did, one class attribute and no for', async () => {
    const { handle, kicker } = mountKicker({ as: 'span' });
    await settle();
    assert.deepEqual(attributeNames(kicker()), ['class']);
    handle.destroy();
    const withNull = mountKicker({ as: 'span', for: null });
    await settle();
    assert.deepEqual(attributeNames(withNull.kicker()), ['class']);
    withNull.handle.destroy();
  });

  it('moves the host and the reference in the same mount on update, and back again', async () => {
    const { target, handle, kicker } = mountKicker({ as: 'span', for: 'acme-first' });
    await settle();
    assert.equal(kicker().getAttribute('for'), 'acme-first');
    assert.equal(handle.update({ children: LABEL, as: 'span', for: 'acme-second' }), true);
    await settle();
    assert.equal(kicker().localName, 'label');
    assert.equal(kicker().getAttribute('for'), 'acme-second');
    assert.equal(handle.update({ children: LABEL, as: 'span' }), true);
    await settle();
    assert.equal(kicker().localName, 'span');
    assert.equal(kicker().hasAttribute('for'), false);
    assert.equal(target.children.length, 1, 'one root throughout');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('gives two mounts a label each for its own reference and draws no id in either', async () => {
    const first = mountKicker({ for: 'acme-name' });
    const second = mountKicker({ for: 'acme-reward' });
    await settle();
    assert.deepEqual(
      [first.kicker().getAttribute('for'), second.kicker().getAttribute('for')],
      ['acme-name', 'acme-reward']
    );
    for (const { target } of [first, second]) {
      assert.deepEqual(
        [...target.querySelectorAll('[id]')],
        [],
        'the kicker and its content draw no id'
      );
    }
    first.handle.destroy();
    second.handle.destroy();
  });
});

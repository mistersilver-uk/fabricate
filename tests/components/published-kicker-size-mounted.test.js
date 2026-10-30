/**
 * The published `Kicker`'s `size` (issue 2815) on Fabricate's real Svelte runtime, through a fresh
 * seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: the class each rung writes beside the root, the type each rung draws, what a value
 * outside the closed set draws, and an `update` that removes the rung.
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

const LABEL = 'Required for this stage';
const ROOT = 'fab-kicker';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-kicker-size-',
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

/** A kicker mounted with `props` over a label: its handle and the kicker as drawn now. */
function mountKicker(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('Kicker', { target, props: { children: LABEL, ...props } });
  return { handle, kicker: () => target.querySelector(`.${ROOT}`) };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published Kicker, size', () => {
  for (const [size, written] of [
    ['8', 'is-size-8'],
    ['9', 'is-size-9'],
  ]) {
    it(`writes ${written} beside the root and the tone for size ${JSON.stringify(size)}, and removes it when an update omits it`, async () => {
      const { handle, kicker } = mountKicker({ size, tone: 'accent' });
      await settle();
      assert.deepEqual(classesOf(kicker()), [ROOT, 'is-accent', written]);
      assert.equal(handle.update({ children: LABEL, tone: 'accent' }), true);
      await settle();
      assert.deepEqual(classesOf(kicker()), [ROOT, 'is-accent']);
      handle.destroy();
    });
  }

  it('moves from one rung to the other on update, never holding both', async () => {
    const { handle, kicker } = mountKicker({ size: '8' });
    await settle();
    assert.deepEqual(classesOf(kicker()), [ROOT, 'is-size-8']);
    assert.equal(handle.update({ children: LABEL, size: '9' }), true);
    await settle();
    assert.deepEqual(classesOf(kicker()), [ROOT, 'is-size-9']);
    handle.destroy();
  });

  for (const [size, written] of [
    [8, 'is-size-8'],
    [9, 'is-size-9'],
  ]) {
    it(`reads the number ${size} as its rung, as Button reads its size`, async () => {
      const { handle, kicker } = mountKicker({ size });
      await settle();
      assert.deepEqual(classesOf(kicker()), [ROOT, written]);
      handle.destroy();
    });
  }

  for (const value of ['', '8.5', 8.5, '10', 10, 'large', ' 8', '08', true, null]) {
    it(`draws the default kicker for ${JSON.stringify(value)}, a value outside the closed set`, async () => {
      const { handle, kicker } = mountKicker({ size: value });
      await settle();
      assert.deepEqual(classesOf(kicker()), [ROOT]);
      handle.destroy();
    });
  }

  it('draws 8px, 8.5px and 9px upper case at their own tracking, with the face and ink unchanged', async () => {
    const drawn = {};
    for (const size of ['8', undefined, '9']) {
      const { handle, kicker } = mountKicker({ size });
      await settle();
      const style = getComputedStyle(kicker());
      drawn[size ?? 'default'] = [style.fontSize, style.letterSpacing, style.textTransform];
      assert.equal(style.fontFamily, 'sans-serif');
      assert.equal(style.fontWeight, '700');
      handle.destroy();
    }
    assert.deepEqual(drawn, {
      8: ['8px', '0.88px', 'uppercase'],
      default: ['8.5px', '0.935px', 'uppercase'],
      9: ['9px', '1.08px', 'uppercase'],
    });
  });

  it('keeps the host element and the ink across a size change', async () => {
    const { handle, kicker } = mountKicker({ as: 'h3', size: '9' });
    await settle();
    const before = kicker();
    const ink = getComputedStyle(before).color;
    assert.equal(before.localName, 'h3');
    assert.equal(handle.update({ children: LABEL, as: 'h3', size: '8' }), true);
    await settle();
    assert.ok(kicker() === before, 'the same root, restyled in place');
    assert.equal(getComputedStyle(kicker()).color, ink, 'the ink is the same at both rungs');
    handle.destroy();
  });
});

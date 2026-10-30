/**
 * The published `FillBar`'s `origin` (issue 2821) on Fabricate's real Svelte runtime, through a
 * fresh seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: `center` grows the fill from the midpoint by the signed value, the sign picks the
 * half and its ink, an `origin` outside the set draws the ordinary fill, and an `update` rewrites
 * and removes it.
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

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-fill-bar-origin-',
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

/** The authored classes of a node, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** A bar mounted with `props`: its handle and the elements as drawn now. */
function mountBar(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('FillBar', { target, props });
  return {
    handle,
    track: () => target.querySelector('.fab-fill-bar'),
    fill: () => target.querySelector('.fab-fill-bar-fill'),
    box: () => {
      const { left, width } = target.querySelector('.fab-fill-bar-fill').style;
      return [left, width];
    },
  };
}

describe('the published FillBar, origin', () => {
  for (const [value, box, classes] of [
    [60, ['50%', '30%'], ['fab-fill-bar-fill', 'is-positive']],
    [100, ['50%', '50%'], ['fab-fill-bar-fill', 'is-positive']],
    [-60, ['20%', '30%'], ['fab-fill-bar-fill', 'is-negative']],
    [-100, ['0%', '50%'], ['fab-fill-bar-fill', 'is-negative']],
    [0, ['50%', '0%'], ['fab-fill-bar-fill']],
    [400, ['50%', '50%'], ['fab-fill-bar-fill', 'is-positive']],
    [-400, ['0%', '50%'], ['fab-fill-bar-fill', 'is-negative']],
    [Infinity, ['50%', '50%'], ['fab-fill-bar-fill', 'is-positive']],
    [-Infinity, ['0%', '50%'], ['fab-fill-bar-fill', 'is-negative']],
    [NaN, ['50%', '0%'], ['fab-fill-bar-fill']],
    ['abc', ['50%', '0%'], ['fab-fill-bar-fill']],
    ['-40', ['30%', '20%'], ['fab-fill-bar-fill', 'is-negative']],
    [undefined, ['50%', '0%'], ['fab-fill-bar-fill']],
  ]) {
    it(`draws ${String(value)} from the midpoint as ${box.join(' ')}`, async () => {
      const bar = mountBar({ value, origin: 'center' });
      await settle();
      assert.deepEqual(bar.box(), box);
      assert.deepEqual(classesOf(bar.fill()), classes);
      bar.handle.destroy();
    });
  }

  it('does not read tone, color or shares, and carries no tone attribute', async () => {
    const bar = mountBar({
      value: -50,
      origin: 'center',
      tone: 'accent',
      color: 'var(--fab-tag-rose)',
      shares: [{ weight: 1 }, { weight: 1 }],
    });
    await settle();
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-negative']);
    assert.equal(bar.fill().style.background, '');
    assert.equal(bar.track().hasAttribute('data-fill-bar-tone'), false);
    bar.handle.destroy();
  });

  it('flips the half on update and removes the origin when it is omitted', async () => {
    const bar = mountBar({ value: 40, origin: 'center' });
    await settle();
    assert.deepEqual(bar.box(), ['50%', '20%']);
    assert.equal(bar.handle.update({ value: -40, origin: 'center' }), true);
    await settle();
    assert.deepEqual(bar.box(), ['30%', '20%']);
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-negative']);
    assert.equal(bar.handle.update({ value: 40, tone: 'info' }), true);
    await settle();
    assert.equal(bar.fill().style.left, '');
    assert.equal(bar.fill().style.width, '40%');
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-info']);
    assert.equal(bar.track().getAttribute('data-fill-bar-tone'), 'info');
    bar.handle.destroy();
  });

  for (const origin of ['start', '', 'Center', 'centre', 'middle', 'CENTER', 1, true, null]) {
    it(`draws the ordinary fill for ${JSON.stringify(origin)}, a value that is not center`, async () => {
      const bar = mountBar({ value: 70, origin, tone: 'accent' });
      await settle();
      assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-accent']);
      assert.equal(bar.fill().style.width, '70%');
      assert.equal(bar.fill().style.left, '');
      bar.handle.destroy();
    });
  }

  it('clamps a negative value to nothing on the ordinary fill', async () => {
    const bar = mountBar({ value: -30, tone: 'accent' });
    await settle();
    assert.equal(bar.fill().style.width, '0%');
    bar.handle.destroy();
  });
});

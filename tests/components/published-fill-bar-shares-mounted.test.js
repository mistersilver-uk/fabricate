/**
 * The published `FillBar`'s `shares` (issue 2783) on Fabricate's real Svelte runtime, through a
 * fresh seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: the shares drawn in proportion inside the value-wide fill, the closed tone set a share
 * takes, the weights read as 0, the entries that draw the one fill, and an `update` that rewrites
 * and removes them.
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
  tmpPrefix: 'fabricate-published-fill-bar-shares-',
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

/** A bar mounted with `props`: its handle and the elements as drawn now. */
function mountBar(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('FillBar', { target, props });
  return {
    handle,
    track: () => target.querySelector('.fab-fill-bar'),
    fill: () => target.querySelector('.fab-fill-bar-fill'),
    shares: () => [...target.querySelectorAll('.fab-fill-bar-share')],
  };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
const tonesOf = (shares) => shares.map((share) => classesOf(share)[1]);
const growsOf = (shares) => shares.map((share) => Number(share.style.flexGrow));

describe('the published FillBar, shares', () => {
  it('draws two shares in proportion inside the value-wide fill, and removes them on update', async () => {
    const bar = mountBar({
      value: 40,
      shares: [
        { weight: 1, tone: 'accent' },
        { weight: 3, tone: 'info' },
      ],
    });
    await settle();
    assert.equal(bar.fill().style.width, '40%');
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-stacked']);
    assert.deepEqual(growsOf(bar.shares()), [25, 75]);
    assert.deepEqual(tonesOf(bar.shares()), ['is-accent', 'is-info']);
    assert.equal(bar.track().hasAttribute('data-fill-bar-tone'), false);
    assert.equal(bar.handle.update({ value: 40, tone: 'danger' }), true);
    await settle();
    assert.equal(bar.shares().length, 0, 'an update that omits shares draws the one fill');
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-danger']);
    assert.equal(bar.track().getAttribute('data-fill-bar-tone'), 'danger');
    bar.handle.destroy();
  });

  it('rewrites the shares on update', async () => {
    const bar = mountBar({ value: 50, shares: [{ weight: 1 }, { weight: 1 }] });
    await settle();
    assert.deepEqual(growsOf(bar.shares()), [50, 50]);
    assert.equal(
      bar.handle.update({
        value: 50,
        shares: [{ weight: 1, tone: 'warning' }, { weight: 1 }, { weight: 2, tone: 'danger' }],
      }),
      true
    );
    await settle();
    assert.deepEqual(growsOf(bar.shares()), [25, 25, 50]);
    assert.deepEqual(tonesOf(bar.shares()), ['is-warning', 'is-success', 'is-danger']);
    bar.handle.destroy();
  });

  for (const tone of ['success', 'warning', 'danger', 'info', 'accent', 'neutral']) {
    it(`paints a ${tone} share through its tone class`, async () => {
      const bar = mountBar({ value: 50, shares: [{ weight: 1, tone }, { weight: 1 }] });
      await settle();
      assert.equal(tonesOf(bar.shares())[0], `is-${tone}`);
      bar.handle.destroy();
    });
  }

  for (const tone of ['chartreuse', 'Accent', 7, true, null]) {
    it(`paints ${JSON.stringify(tone)}, a tone outside the closed set, neutral`, async () => {
      const bar = mountBar({ value: 50, shares: [{ weight: 1, tone }, { weight: 1 }] });
      await settle();
      assert.deepEqual(tonesOf(bar.shares()), ['is-neutral', 'is-success']);
      bar.handle.destroy();
    });
  }

  it('reads a weight that is not a finite number above zero as 0, a numeric string included', async () => {
    const bar = mountBar({
      value: 60,
      shares: [
        { weight: -2 },
        { weight: NaN },
        { weight: Infinity },
        { weight: '3' },
        { weight: 2 },
        { weight: 2 },
      ],
    });
    await settle();
    assert.deepEqual(growsOf(bar.shares()), [0, 0, 0, 0, 50, 50]);
    bar.handle.destroy();
  });

  it('draws shares that all read 0 as a grow of 0 each', async () => {
    const bar = mountBar({ value: 60, shares: [{ weight: 0 }, { weight: 'x' }] });
    await settle();
    assert.deepEqual(
      bar.shares().map((share) => share.style.flexGrow),
      ['0', '0']
    );
    bar.handle.destroy();
  });

  it('reads a null entry as an empty share', async () => {
    const bar = mountBar({ value: 60, shares: [null, { weight: 1 }, { weight: 1 }] });
    await settle();
    assert.deepEqual(growsOf(bar.shares()), [0, 50, 50]);
    assert.deepEqual(tonesOf(bar.shares()), ['is-success', 'is-success', 'is-success']);
    bar.handle.destroy();
  });

  for (const [claim, shares] of [
    ['none', []],
    ['one entry', [{ weight: 1, tone: 'danger' }]],
    ['a null', null],
    ['an object', { length: 3 }],
    ['a string', 'abc'],
    ['a number', 5],
  ]) {
    it(`draws the one fill from tone for ${claim}`, async () => {
      const bar = mountBar({ value: 50, tone: 'accent', shares });
      await settle();
      assert.equal(bar.shares().length, 0);
      assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-accent']);
      assert.equal(bar.track().getAttribute('data-fill-bar-tone'), 'accent');
      bar.handle.destroy();
    });
  }

  it('does not read tone or color once stacked', async () => {
    const bar = mountBar({
      value: 50,
      tone: 'danger',
      color: 'var(--fab-tag-rose)',
      shares: [{ weight: 1 }, { weight: 1 }],
    });
    await settle();
    assert.deepEqual(classesOf(bar.fill()), ['fab-fill-bar-fill', 'is-stacked']);
    assert.equal(bar.fill().style.background, '');
    assert.equal(bar.track().hasAttribute('data-fill-bar-tone'), false);
    bar.handle.destroy();
  });

  it('clamps the stack to the value like the one fill', async () => {
    const bar = mountBar({ value: 400, shares: [{ weight: 1 }, { weight: 1 }] });
    await settle();
    assert.equal(bar.fill().style.width, '100%');
    bar.handle.destroy();
  });

  it('refuses a function in shares, as it does anywhere in a data value', () => {
    const target = companionTarget(targets);
    assert.throws(
      () => ui().mount('FillBar', { target, props: { shares: [{ weight: () => 1 }] } }),
      { name: 'TypeError', message: /"shares" must not hold a function/u }
    );
  });
});

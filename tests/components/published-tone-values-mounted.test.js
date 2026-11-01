/**
 * Issue 2847's added values on Fabricate's real Svelte runtime, through a fresh seam registered
 * with the adapter's own table, into a companion target under no Fabricate ancestor: `Medallion`'s
 * `warning` and `info` tones and inks, `StatBox`'s `success` tone and `Notice`'s `accent` tone each
 * draw their family's class and ink, a value outside each set draws as unset, an `update` moves
 * between them in place, and each entry stays at `version` 1 with its keys unchanged.
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
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-tone-values-',
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

/** `name` mounted with `props`: its handle and its root, found by `root`, as drawn now. */
async function mounted(name, root, props) {
  const target = companionTarget(targets);
  const handle = ui().mount(name, { target, props });
  await settle();
  return { handle, node: () => target.querySelector(root) };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** Each family's `-text` ink, and the warning and info grounds, as distinct probe colours. */
const PROBE = `:root[data-fabricate-theme] {
  --fab-warning-text: rgb(1, 2, 3); --fab-warning-soft: rgb(4, 5, 6);
  --fab-warning-border: rgb(7, 8, 9); --fab-info-text: rgb(10, 11, 12);
  --fab-info-soft: rgb(13, 14, 15); --fab-info-border: rgb(16, 17, 18);
  --fab-success-text: rgb(19, 20, 21); --fab-accent-text: rgb(22, 23, 24);
  --fab-accent-soft: rgb(25, 26, 27);
}`;
const INK = Object.freeze({
  warning: 'rgb(1, 2, 3)',
  info: 'rgb(10, 11, 12)',
  success: 'rgb(19, 20, 21)',
  accent: 'rgb(22, 23, 24)',
});

describe('the published Medallion, tones and inks warning and info', () => {
  const TILE = { size: 30, icon: 'fas fa-coins' };
  const tile = (props) => mounted('Medallion', '.fab-medallion', { ...TILE, ...props });
  const glyphOf = (node) => getComputedStyle(node.querySelector('i')).color;

  it('paints each added tone on the edge, ground and glyph', async () => {
    await underSheet(PROBE, async () => {
      for (const [tone, ground, edge] of [
        ['warning', 'rgb(4, 5, 6)', 'rgb(7, 8, 9)'],
        ['info', 'rgb(13, 14, 15)', 'rgb(16, 17, 18)'],
      ]) {
        const { handle, node } = await tile({ tone });
        assert.deepEqual(classesOf(node()), ['fab-medallion', 'is-corner-7', `is-tone-${tone}`]);
        assert.equal(getComputedStyle(node()).backgroundColor, ground, tone);
        assert.equal(getComputedStyle(node()).borderTopColor, edge, tone);
        assert.equal(glyphOf(node()), INK[tone], tone);
        handle.destroy();
      }
    });
  });

  it('inks the glyph alone for each added ink, outranking a tone', async () => {
    await underSheet(PROBE, async () => {
      for (const ink of ['warning', 'info']) {
        const { handle, node } = await tile({ ink });
        assert.deepEqual(classesOf(node()), ['fab-medallion', 'is-corner-7', `is-ink-${ink}`]);
        assert.equal(glyphOf(node()), INK[ink], ink);
        handle.destroy();
      }
      const { handle, node } = await tile({ tone: 'warning', ink: 'info' });
      assert.equal(getComputedStyle(node()).backgroundColor, 'rgb(4, 5, 6)', 'the tone ground');
      assert.equal(glyphOf(node()), INK.info, 'the ink on the glyph');
      handle.destroy();
    });
  });

  it('draws a value outside each set byte-identical to unset, and updates in place', async () => {
    const unset = await tile({});
    const drawn = unset.node().outerHTML;
    unset.handle.destroy();
    for (const props of [{ tone: 'Warning' }, { ink: 'information' }, { tone: 'neutral' }]) {
      const { handle, node } = await tile(props);
      assert.equal(node().outerHTML, drawn, JSON.stringify(props));
      handle.destroy();
    }
    const { handle, node } = await tile({ tone: 'info' });
    const first = node();
    assert.equal(handle.update({ ...TILE, tone: 'warning' }), true);
    await settle();
    assert.ok(node() === first, 'the same tile');
    assert.deepEqual(classesOf(first), ['fab-medallion', 'is-corner-7', 'is-tone-warning']);
    handle.destroy();
  });
});

describe('the published StatBox, tone success', () => {
  const BASE = { value: '5 of 5', label: 'Stages done' };
  const box = (props) => mounted('StatBox', '.fab-stat-box', { ...BASE, ...props });

  it('inks the figure alone in --fab-success-text and writes the tone', async () => {
    await underSheet(PROBE, async () => {
      const { handle, node } = await box({ tone: 'success' });
      assert.deepEqual(classesOf(node()), ['fab-stat-box', 'is-success']);
      assert.equal(node().getAttribute('data-stat-tone'), 'success');
      const figure = node().querySelector('.fab-stat-box-value');
      assert.equal(getComputedStyle(figure).color, INK.success);
      const plain = await box({});
      for (const property of ['borderTopColor', 'backgroundColor']) {
        assert.equal(
          getComputedStyle(node())[property],
          getComputedStyle(plain.node())[property],
          `${property} stays the default's`
        );
      }
      plain.handle.destroy();
      handle.destroy();
    });
  });

  it('draws a tone outside the set as default', async () => {
    for (const tone of ['Success', 'positive', 'warning']) {
      const { handle, node } = await box({ tone });
      assert.deepEqual(classesOf(node()), ['fab-stat-box'], tone);
      assert.equal(node().getAttribute('data-stat-tone'), 'default', tone);
      handle.destroy();
    }
  });
});

describe('the published Notice, tone accent', () => {
  const notice = (props) => mounted('Notice', '.fab-notice', { title: 'Caravan due', ...props });

  it('paints the accent tone with the info glyph and the accent ink', async () => {
    await underSheet(PROBE, async () => {
      const { handle, node } = await notice({ tone: 'accent' });
      assert.deepEqual(classesOf(node()), ['fab-notice', 'is-accent']);
      assert.equal(node().getAttribute('data-notice-tone'), 'accent');
      assert.equal(getComputedStyle(node()).backgroundColor, 'rgb(25, 26, 27)');
      const title = node().querySelector('.fab-notice-title');
      assert.equal(getComputedStyle(title).color, INK.accent);
      assert.ok(
        Boolean(node().querySelector('i.fa-circle-info[aria-hidden="true"]')),
        'info glyph'
      );
      handle.destroy();
    });
  });

  it('draws a tone outside the set as danger', async () => {
    const { handle, node } = await notice({ tone: 'Accent' });
    assert.deepEqual(classesOf(node()), ['fab-notice', 'is-danger']);
    handle.destroy();
  });
});

describe('the entries the added values widen', () => {
  it('each stays at version 1, and describe lists the same keys', () => {
    const seam = ui();
    const keys = (name) => Object.keys(seam.describe(name).props);
    assert.deepEqual(
      ['Medallion', 'StatBox', 'Notice'].map((name) => seam.describe(name).version),
      [1, 1, 1]
    );
    assert.deepEqual(keys('Medallion'), [
      'art',
      'icon',
      'size',
      'alt',
      'tint',
      'glyph',
      'variant',
      'tone',
      'ink',
    ]);
    assert.deepEqual(keys('StatBox'), [
      'value',
      'label',
      'icon',
      'tone',
      'layout',
      'note',
      'children',
    ]);
    assert.ok(keys('Notice').includes('tone'));
  });
});

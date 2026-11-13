/**
 * The published `Medallion`'s `text` and `ink: accent` on Fabricate's real Svelte runtime, through
 * a fresh seam registered with the adapter's own table, into a companion target under no Fabricate
 * ancestor: the numeral a mount draws and an update moves in place, the tile a value outside the
 * set leaves as unset, the entry staying at `version` 1 with `text` described, and the refusal of
 * a key the entry does not publish.
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
  tmpPrefix: 'fabricate-published-medallion-text-',
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

const TILE = { size: 26, glyph: 11, icon: 'fas fa-coins' };

async function mounted(props) {
  const target = companionTarget(targets);
  const seam = ui();
  const handle = seam.mount('Medallion', { target, props: { ...TILE, ...props } });
  await settle();
  return { seam, handle, tile: () => target.querySelector('.fab-medallion') };
}

describe('the published Medallion, text', () => {
  it('draws the numeral in place of the glyph and moves it in place on update', async () => {
    const { handle, tile } = await mounted({ text: '3' });
    const node = tile();
    assert.equal(node.getAttribute('data-medallion'), 'text');
    assert.equal(node.querySelector('.fab-medallion-text').textContent, '3');
    assert.ok(node.querySelector('i') === null);
    assert.equal(handle.update({ ...TILE, text: 12 }), true);
    await settle();
    assert.ok(tile() === node, 'the same tile');
    assert.equal(node.querySelector('.fab-medallion-text').textContent, '12');
    assert.equal(handle.update({ ...TILE }), true);
    await settle();
    assert.equal(node.getAttribute('data-medallion'), 'glyph');
    assert.ok(node.querySelector('.fab-medallion-text') === null);
    assert.ok(node.querySelector('i'));
    handle.destroy();
  });

  it('leaves the tile as unset for a data value outside the set', async () => {
    const unset = (await mounted({})).tile().outerHTML;
    for (const text of ['1234', '', ' ', 'a b', NaN, true, ['1'], null]) {
      const { handle, tile } = await mounted({ text });
      assert.equal(tile().outerHTML, unset, JSON.stringify(text));
      handle.destroy();
    }
  });

  it('refuses a function and a value that is not plain data, as it does for every data key', async () => {
    const seam = ui();
    for (const [text, message] of [
      [() => '1', /"text" must not hold a function/u],
      [new Date(0), /"text" must be data/u],
      [{ toString: () => '1' }, /"text" must not hold a function/u],
      [new (class Numeral {})(), /"text" must be data/u],
    ]) {
      const target = companionTarget(targets);
      assert.throws(() => seam.mount('Medallion', { target, props: { ...TILE, text } }), message);
      assert.ok(target.querySelector('.fab-medallion') === null, 'nothing is drawn');
    }
  });

  it('draws a plain data value outside the set as unset', async () => {
    const unset = (await mounted({})).tile().outerHTML;
    for (const text of [{}, { value: '1' }, [], ['1']]) {
      const { handle, tile } = await mounted({ text });
      assert.equal(tile().outerHTML, unset, JSON.stringify(text));
      handle.destroy();
    }
  });

  it('draws the accent ink on the glyph through the seam', async () => {
    await underSheet(
      ':root[data-fabricate-theme] { --fab-accent-text: rgb(22, 23, 24); }',
      async () => {
        const { handle, tile } = await mounted({ ink: 'accent' });
        assert.ok(tile().classList.contains('is-ink-accent'));
        assert.equal(getComputedStyle(tile().querySelector('i')).color, 'rgb(22, 23, 24)');
        handle.destroy();
      }
    );
  });

  it('stays at version 1 with text described, and refuses a key it does not publish', async () => {
    const { seam, handle } = await mounted({});
    handle.destroy();
    assert.equal(seam.describe('Medallion').version, 1);
    assert.equal(seam.describe('Medallion').props.text.kind, 'data');
    assert.throws(
      () =>
        seam.mount('Medallion', {
          target: companionTarget(targets),
          props: { size: 26, src: 'x' },
        }),
      /"src" is not a prop of Medallion/u
    );
    assert.throws(
      () =>
        seam.mount('Medallion', {
          target: companionTarget(targets),
          props: { size: 26, numeral: 3 },
        }),
      /"numeral" is not a prop of Medallion/u
    );
  });
});

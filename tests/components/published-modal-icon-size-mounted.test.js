/**
 * The published `Modal`'s `icon` and `size` (issue 2818) on Fabricate's real Svelte runtime,
 * through a fresh seam registered with the adapter's own table: the hidden glyph before the title
 * and its removal on an update, the width rung's class, what a value outside the set draws, that no
 * inline style is written, and that the unpublished `width` is still refused.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  recordEscapes,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const DIALOG_HOOK = '[data-manager-modal]';
const REQUIRED = Object.freeze({ title: 'Add a requirement', closeLabel: 'Close' });

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-modal-icon-size-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let shells;
let handles;
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
  shells = [];
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  assert.ok(!document.querySelector(DIALOG_HOOK), 'no dialog outlives its mount');
  assert.deepEqual(reports, [], 'nothing was reported');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** An open dialog over `REQUIRED` and `props`; `update(next)` replaces every prop beside them. */
function openModal(props = {}) {
  const base = { ...REQUIRED, open: true, onClose: recorder().record };
  const target = fabricateTarget(shells, 'fabricate fabricate-app');
  const handle = ui().mount('Modal', { target, props: { ...base, ...props } });
  handles.push(handle);
  flushSync();
  return {
    update(next = {}) {
      handle.update({ ...base, ...next });
      flushSync();
    },
  };
}

const dialog = () => document.querySelector(DIALOG_HOOK);
const glyphs = () => [...dialog().querySelectorAll(':scope .manager-modal-header > i')];
const classesOf = (element) => [...element.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published Modal icon', () => {
  it('lists icon and size beside the earlier keys in describe', () => {
    const { props } = ui().describe('Modal');
    assert.deepEqual(
      [props.icon, props.size],
      [
        { kind: 'data', required: false },
        { kind: 'data', required: false },
      ]
    );
  });

  it('draws a hidden glyph in the given classes before the heading, and none without one', () => {
    openModal({ icon: 'fas fa-plus' });
    const [glyph, ...rest] = glyphs();
    assert.deepEqual(rest, []);
    assert.deepEqual(classesOf(glyph), ['manager-modal-icon', 'fas', 'fa-plus']);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.nextElementSibling.className.includes('manager-modal-heading'), true);
    assert.equal(dialog().getAttribute('aria-label'), REQUIRED.title, 'the name is the title');
  });

  it('draws no glyph for an empty icon, and removes it on an update that omits it', () => {
    const modal = openModal({ icon: '' });
    assert.equal(glyphs().length, 0);
    modal.update({ icon: 'fas fa-user-plus' });
    assert.equal(glyphs().length, 1);
    modal.update({});
    assert.equal(glyphs().length, 0);
  });
});

describe('the published Modal size', () => {
  const sizeOf = () => classesOf(dialog()).filter((name) => name.startsWith('is-size-'));

  it('draws the rung class for sm and lg, and none for md or no size', () => {
    const modal = openModal({ size: 'sm' });
    assert.deepEqual(sizeOf(), ['is-size-sm']);
    modal.update({ size: 'lg' });
    assert.deepEqual(sizeOf(), ['is-size-lg']);
    modal.update({ size: 'md' });
    assert.deepEqual(sizeOf(), []);
    modal.update({});
    assert.deepEqual(sizeOf(), []);
  });

  it('draws the default rung for a value outside the set, and honours none of it', () => {
    const modal = openModal({ size: '720px' });
    for (const size of ['720px', 'SM', 'xl', '', 'constructor', '__proto__', 7]) {
      modal.update({ size });
      assert.deepEqual(sizeOf(), [], `${String(size)} draws the default width`);
    }
    assert.equal(dialog().style.length, 0, 'no inline style is written');
  });

  it('writes no inline style for a rung, and refuses the unpublished width', () => {
    openModal({ size: 'lg', icon: 'fas fa-plus' });
    assert.equal(dialog().style.length, 0, 'no inline style is written');
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    assert.throws(
      () => ui().mount('Modal', { target, props: { ...REQUIRED, open: true, width: '720px' } }),
      { message: /"width" is not a prop of Modal/u }
    );
  });
});

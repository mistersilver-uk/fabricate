/**
 * The published `Chip`'s `emphasis`, `icon`, `mono` and `struck` (issue 2772) on Fabricate's real
 * Svelte runtime, through a fresh seam registered with the adapter's own table, into a companion
 * target under no Fabricate ancestor: the class each key writes beside the root, the glyph drawn
 * before the label, what a value outside a closed set draws, and an `update` that rewrites them.
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

const LABEL = 'Locked';
const ROOT = 'manager-chip';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-chip-',
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

/** A chip mounted with `props` over a label: its handle and the chip as drawn now. */
function mountChip(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('Chip', { target, props: { children: LABEL, ...props } });
  return { handle, chip: () => target.querySelector(`.${ROOT}`) };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published Chip, emphasis', () => {
  for (const emphasis of ['outlined', 'bare', 'solid']) {
    it(`writes is-${emphasis} beside the root and the tone, and removes it when an update omits it`, async () => {
      const { handle, chip } = mountChip({ tone: 'warning', emphasis });
      await settle();
      assert.deepEqual(classesOf(chip()), [ROOT, 'is-warning', `is-${emphasis}`]);
      assert.equal(handle.update({ children: LABEL, tone: 'warning' }), true);
      await settle();
      assert.deepEqual(classesOf(chip()), [ROOT, 'is-warning']);
      handle.destroy();
      assert.deepEqual(reports, []);
    });
  }

  for (const value of ['sparkly', 'Solid', 7, true]) {
    it(`draws the default chip for ${JSON.stringify(value)}, a value outside the closed set`, async () => {
      const { handle, chip } = mountChip({ emphasis: value });
      await settle();
      assert.deepEqual(classesOf(chip()), [ROOT]);
      handle.destroy();
      assert.deepEqual(reports, []);
    });
  }
});

describe('the published Chip, mono and struck', () => {
  for (const [key, written] of [
    ['mono', 'is-mono'],
    ['struck', 'is-struck'],
  ]) {
    it(`writes ${written} for ${key}: true alone, and toggles it across updates`, async () => {
      const on = mountChip({ [key]: true });
      const off = mountChip({ [key]: false });
      await settle();
      assert.deepEqual(classesOf(on.chip()), [ROOT, written]);
      assert.deepEqual(classesOf(off.chip()), [ROOT]);
      assert.equal(on.handle.update({ children: LABEL }), true);
      assert.equal(off.handle.update({ children: LABEL, [key]: true }), true);
      await settle();
      assert.deepEqual(classesOf(on.chip()), [ROOT]);
      assert.deepEqual(classesOf(off.chip()), [ROOT, written]);
      on.handle.destroy();
      off.handle.destroy();
      assert.deepEqual(reports, []);
    });
  }

  it('composes with a tone, an emphasis and a density, in the order the component writes them', async () => {
    const { handle, chip } = mountChip({
      tone: 'danger',
      emphasis: 'outlined',
      mono: true,
      struck: true,
      density: 'list',
    });
    await settle();
    assert.deepEqual(classesOf(chip()), [
      ROOT,
      'is-danger',
      'is-outlined',
      'is-mono',
      'is-struck',
      'is-list',
    ]);
    handle.destroy();
  });

  it('does not coerce a string, so the string "false" draws the class', async () => {
    const { handle, chip } = mountChip({ mono: 'false' });
    await settle();
    assert.deepEqual(classesOf(chip()), [ROOT, 'is-mono']);
    handle.destroy();
  });
});

describe('the published Chip, icon', () => {
  it('draws a hidden glyph before the label, which stays the chip’s whole text', async () => {
    const { handle, chip } = mountChip({ icon: 'fas fa-lock' });
    await settle();
    const [glyph, label, ...rest] = chip().children;
    assert.equal(glyph.localName, 'i');
    assert.deepEqual(classesOf(glyph), ['fas', 'fa-lock']);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(label.textContent, LABEL);
    assert.equal(chip().textContent, LABEL, 'the glyph adds no text');
    assert.deepEqual(rest, []);
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('draws no glyph when icon is absent or empty, and swaps or removes it across updates', async () => {
    const bare = mountChip();
    const empty = mountChip({ icon: '' });
    const lit = mountChip({ icon: 'fas fa-lock' });
    await settle();
    assert.equal(bare.chip().querySelectorAll('i').length, 0);
    assert.equal(empty.chip().querySelectorAll('i').length, 0);
    assert.equal(lit.handle.update({ children: LABEL, icon: 'fas fa-unlock' }), true);
    assert.equal(bare.handle.update({ children: LABEL, icon: 'fas fa-lock' }), true);
    await settle();
    assert.deepEqual(classesOf(lit.chip().querySelector('i')), ['fas', 'fa-unlock']);
    assert.deepEqual(classesOf(bare.chip().querySelector('i')), ['fas', 'fa-lock']);
    assert.equal(lit.handle.update({ children: LABEL }), true);
    await settle();
    assert.equal(lit.chip().querySelectorAll('i').length, 0);
    for (const mounted of [bare, empty, lit]) mounted.handle.destroy();
  });

  it('stays a statement: no role, no focus, whatever the four keys', async () => {
    const { handle, chip } = mountChip({
      icon: 'fas fa-lock',
      emphasis: 'solid',
      mono: true,
      struck: true,
    });
    await settle();
    assert.equal(chip().localName, 'span');
    assert.ok(
      !chip().hasAttribute('role') && !chip().hasAttribute('tabindex'),
      'no role, no focus'
    );
    assert.equal(chip().querySelectorAll('button, a, input, [tabindex]').length, 0);
    handle.destroy();
  });
});

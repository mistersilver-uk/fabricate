/** CHARACTERIZATION suite for `TintPicker` (issue 1036); its naming and pressed state (issue 2257). */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-color-popover-characterization-',
  // The shared colour-token constant (issue 1036). The popover localizes its eight preset
  // labels through it, so it is a static import of the component under test; the harness's
  // own closure validator reports the omission by name rather than hanging on it.
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/managerColorTokens.js',
  ],
  compiledModules: ['src/ui/svelte/components/TintPicker.svelte'],
  componentPath: 'src/ui/svelte/components/TintPicker.svelte',
});

/** The shipped palette, in its shipped order, with its shipped English labels. */
const PRESETS = [
  ['sage', 'Sage'],
  ['mist', 'Mist'],
  ['lavender', 'Lavender'],
  ['rose', 'Rose'],
  ['peach', 'Peach'],
  ['butter', 'Butter'],
  ['aqua', 'Aqua'],
  ['mauve', 'Mauve'],
];

function presetCells(target) {
  return [...target.querySelectorAll('[data-manager-color-token]')];
}

/** Every cell's `aria-pressed`, the No-colour cell first under `none` when it renders. */
function pressedStates(target) {
  const none = target.querySelector('[data-manager-color-none]');
  return Object.fromEntries([
    ...(none ? [['none', none.getAttribute('aria-pressed')]] : []),
    ...presetCells(target).map((cell) => [
      cell.dataset.managerColorToken,
      cell.getAttribute('aria-pressed'),
    ]),
  ]);
}

/** `pressedStates` with only `pressed` true, over the eight presets and, when `none`, the ninth. */
function onlyPressed(pressed, { none = false } = {}) {
  return Object.fromEntries([
    ...(none ? [['none', String(pressed === 'none')]] : []),
    ...PRESETS.map(([token]) => [token, String(pressed === token)]),
  ]);
}

describe('1036 TintPicker — characterization', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  it('renders exactly the eight shipped presets, in order, as real buttons', async () => {
    const target = await harness.mount({ colorToken: 'sage' });
    const cells = presetCells(target);

    assert.deepEqual(
      cells.map((cell) => cell.dataset.managerColorToken),
      PRESETS.map(([token]) => token),
      'eight cells, in the shipped palette order'
    );
    for (const cell of cells) {
      assert.equal(cell.tagName, 'BUTTON', 'each cell is keyboard-operable');
      assert.equal(cell.getAttribute('type'), 'button', 'and never submits a host form');
    }
    harness.remount();
  });

  it('gives each cell the same accessible name through aria-label AND title', async () => {
    const target = await harness.mount({ colorToken: 'sage' });
    for (const [token, label] of PRESETS) {
      const cell = target.querySelector(`[data-manager-color-token="${token}"]`);
      assert.equal(cell.getAttribute('aria-label'), label, `${token} names itself`);
      assert.equal(cell.getAttribute('title'), label, `${token} names itself on hover too`);
    }
    harness.remount();
  });

  it('marks the selected token, and marks NOTHING when the caller is unset', async () => {
    const target = await harness.mount({ colorToken: 'rose' });
    assert.deepEqual(
      presetCells(target)
        .filter((cell) => cell.classList.contains('is-selected'))
        .map((cell) => cell.dataset.managerColorToken),
      ['rose'],
      'exactly one cell is marked'
    );

    await harness.setProps({ colorToken: 'rose', unset: true });
    assert.deepEqual(
      presetCells(target).filter((cell) => cell.classList.contains('is-selected')),
      [],
      '`unset` suppresses the Sage-by-default marking a bare fold would produce'
    );

    await harness.setProps({ colorToken: '', unset: false });
    assert.deepEqual(
      presetCells(target)
        .filter((cell) => cell.classList.contains('is-selected'))
        .map((cell) => cell.dataset.managerColorToken),
      ['sage'],
      'and WITHOUT `unset` an absent value still folds onto sage — the trap `unset` exists for'
    );
    harness.remount();
  });

  it('presses the selected cell alone, across every selection state (issue 2257)', async () => {
    const onClear = () => {};
    const target = await harness.mount({ colorToken: 'rose' });
    assert.deepEqual(pressedStates(target), onlyPressed('rose'), 'a token presses its cell');

    await harness.setProps({ colorToken: 'rose', unset: true });
    assert.deepEqual(pressedStates(target), onlyPressed(null), 'unset presses no preset');

    await harness.setProps({ colorToken: '', unset: true, allowNone: true, onClear });
    assert.deepEqual(
      pressedStates(target),
      onlyPressed('none', { none: true }),
      'with the No-colour cell offered, unset presses that cell'
    );

    await harness.setProps({ noneSelected: false });
    assert.deepEqual(
      pressedStates(target),
      onlyPressed(null, { none: true }),
      'a bulk stage left unchanged presses nothing at all'
    );
    harness.remount();
  });

  it('groups the cells under the palette label (issue 2257)', async () => {
    const target = await harness.mount({ colorToken: 'sage', presetGridLabel: 'Biome colours' });
    const group = target.querySelector('[role="group"]');
    assert.ok(Boolean(group), 'the cells sit in a group');
    assert.equal(group.getAttribute('aria-label'), 'Biome colours', 'named by its label');
    assert.equal(group.querySelectorAll('[data-manager-color-token]').length, 8);
    harness.remount();
  });

  it('names the palette in localized English when a caller passes no label (issue 2257)', async () => {
    const restore = installLangBackedI18n(repoRoot);
    try {
      const target = await harness.mount({ colorToken: 'sage', allowNone: true, onClear: () => {} });
      const group = target.querySelector('[role="group"]');
      assert.equal(group.getAttribute('aria-label'), 'Colour presets');
      assert.equal(target.querySelector('.manager-color-custom').textContent.trim(), 'Custom hex');
      assert.equal(
        target.querySelector('[data-manager-color-none]').getAttribute('aria-label'),
        'No colour'
      );
    } finally {
      restore();
      harness.remount();
    }
  });

  it('emits both axes on a preset click, carrying the current custom colour through', async () => {
    const emitted = [];
    const target = await harness.mount({
      colorToken: 'sage',
      customColor: '#AABBCC',
      onChange: (next) => emitted.push(next),
    });

    target.querySelector('[data-manager-color-token="aqua"]').click();

    assert.equal(emitted.length, 1);
    assert.deepEqual(
      emitted[0],
      { colorToken: 'aqua', customColor: '#AABBCC' },
      'the payload is always the whole pair, never a partial patch'
    );
    harness.remount();
  });

  it('offers the free-hex entry only while `allowCustom` is on', async () => {
    const target = await harness.mount({ colorToken: 'sage', allowCustom: true });
    assert.ok(
      Boolean(target.querySelector('[data-manager-custom-color]')),
      'the default caller keeps the hex field'
    );

    await harness.setProps({ allowCustom: false });
    assert.ok(
      !target.querySelector('[data-manager-custom-color]'),
      'the per-essence colour caller (issue 917) has the palette as its whole vocabulary'
    );
    assert.equal(presetCells(target).length, 8, 'and still exactly eight cells');
    harness.remount();
  });

  it('paints each cell from its own token through the `--manager-color-swatch` vehicle', async () => {
    const target = await harness.mount({ colorToken: 'sage', customColor: '#AABBCC' });
    const cell = target.querySelector('[data-manager-color-token="mauve"]');
    assert.match(
      cell.getAttribute('style'),
      /--manager-color-swatch:\s*var\(--fab-tag-mauve\)/,
      'a preset cell shows its OWN token, never the caller custom hex'
    );
    harness.remount();
  });

  it('keeps the popover root hook every consumer positions and dismisses against', async () => {
    const target = await harness.mount({ colorToken: 'sage' });
    const root = target.querySelector('[data-manager-color-picker-popover]');
    assert.ok(Boolean(root), 'the root hook is present');
    assert.ok(
      root.classList.contains('manager-color-picker-popover'),
      'and carries the shipped class the global sheet positions'
    );
    harness.remount();
  });
});

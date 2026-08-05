/**
 * CHARACTERIZATION suite for `ManagerColorPopover` (issue 1036).
 *
 * Landed BEFORE the inline layout mode and the `allowNone` No-colour cell are added, and
 * it must pass UNCHANGED afterwards. Both additions are GATED — inline mode behind a
 * layout prop, the ninth cell behind `allowNone` (default `false`) — precisely because
 * `EnvironmentsBrowserView`'s two call sites render this popover into a `repeat(4, 1fr)`
 * preset grid and would otherwise gain a ninth cell and a clear-to-unset route they do not
 * have. This file is what proves the gate holds.
 *
 * The character being pinned:
 *
 * - exactly EIGHT preset cells, in the shipped palette order, each addressable by
 *   `data-manager-color-token`;
 * - the accessible name of each cell, which is both its `aria-label` and its `title` and
 *   is therefore the popover's whole screen-reader surface;
 * - selection marking, including the `unset` case — `normalizedToken` folds an absent
 *   value onto `sage`, so without `unset` the palette would mark Sage selected for a model
 *   that has chosen nothing;
 * - the `onChange` payload shape, which carries BOTH axes on every emission;
 * - `allowCustom`, which is what the per-essence colour (issue 917) already turns off.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-color-popover-characterization-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES],
  compiledModules: ['src/ui/svelte/components/ManagerColorPopover.svelte'],
  componentPath: 'src/ui/svelte/components/ManagerColorPopover.svelte',
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

describe('1036 ManagerColorPopover — characterization', () => {
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

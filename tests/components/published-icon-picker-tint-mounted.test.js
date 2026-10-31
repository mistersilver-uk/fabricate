/**
 * The published `IconPicker`'s `tint` (issue 2841) on Fabricate's real Svelte runtime, through a
 * fresh seam registered with the adapter's own table, under a Fabricate window root: each of
 * `--fab-tag-*` key the palettes declare, `Avatar`'s thirteen tint keys, tints the trigger's glyph alone, through one class and the
 * `--fab-tag-*` colour it names, any other value tints nothing and nothing is coerced, an update
 * that drops it untints the same glyph, and the trigger's name and the list's rows are unchanged.
 * Limit: happy-dom resolves no custom property, so the drawn colour is `companion-forms`' frame's
 * and the contrast is `icon-picker-tint-contrast`'s.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { tagTintKeys, themePalettes } from '../helpers/themePaletteContrast.js';

const { ui, mountEntry } = publishedEntrySeam('fabricate-published-icon-picker-tint-');
const BASE = Object.freeze({
  value: 'fas fa-leaf',
  onChange() {},
  ariaLabel: 'Activity icon',
  listLabel: 'Activity icons',
  searchLabel: 'Search activity icons',
  noMatchesText: 'No icon matches.',
});
/** One key per `--fab-tag-*` token the palettes declare, so a fourteenth tag fails here until published. */
const TINTS = tagTintKeys(themePalettes(rulesIn(collectStyleCorpus()['styles/fabricate.css'])));

/** A picker mounted with `props` over `BASE`: its handle, trigger and the trigger's glyph tile. */
async function mountPicker(props = {}) {
  const { target, handle } = mountEntry('IconPicker', { ...BASE, ...props });
  await settle();
  const trigger = () => target.querySelector('button.essence-icon-picker-trigger');
  return {
    target,
    handle,
    trigger,
    tile: () => trigger().querySelector('.essence-icon-picker-preview'),
  };
}

/** The tile's authored classes and the tint property it sets, if any. */
const tintOf = (tile) => [
  [...tile.classList].filter((name) => !name.startsWith('svelte-')),
  tile.style.getPropertyValue('--fab-icon-picker-tint'),
];

describe('the published IconPicker describes its tint', () => {
  it('lists tint as optional data, last', () => {
    const { props } = ui().describe('IconPicker');
    assert.equal(Object.keys(props).at(-1), 'tint');
    assert.deepEqual(props.tint, { kind: 'data', required: false });
  });
});

describe('the published IconPicker tint', () => {
  for (const tint of TINTS) {
    it(`tints the trigger’s glyph in --fab-tag-${tint} for "${tint}"`, async () => {
      const { handle, tile, trigger } = await mountPicker({ tint });
      assert.deepEqual(tintOf(tile()), [
        ['essence-icon-picker-preview', 'is-tinted'],
        `var(--fab-tag-${tint})`,
      ]);
      assert.equal(trigger().getAttribute('aria-label'), 'Activity icon', 'the name is unchanged');
      handle.destroy();
    });
  }

  for (const tint of ['', '--fab-tag-rose', 'Rose', ' rose', 'crimson', 'accent', 3, true, null]) {
    it(`tints nothing for ${JSON.stringify(tint)}`, async () => {
      const { handle, tile } = await mountPicker({ tint });
      assert.deepEqual(tintOf(tile()), [['essence-icon-picker-preview'], '']);
      handle.destroy();
    });
  }

  it('untints the same glyph on an update that drops it', async () => {
    const { handle, tile } = await mountPicker({ tint: 'ember' });
    const drawn = tile();
    assert.equal(handle.update({ ...BASE }), true);
    await settle();
    assert.ok(tile() === drawn, 'the same tile');
    assert.deepEqual(tintOf(drawn), [['essence-icon-picker-preview'], '']);
    handle.destroy();
  });

  it('leaves the list’s rows untinted', async () => {
    const { target, handle, trigger } = await mountPicker({ tint: 'azure' });
    trigger().click();
    await settle();
    const rows = target.ownerDocument.body.querySelectorAll(
      ':scope .fabricate-icon-picker-popover .essence-icon-picker-preview'
    );
    assert.ok(rows.length > 1, 'the list is open');
    assert.deepEqual(
      [...rows].filter((row) => row.classList.contains('is-tinted')).length,
      0,
      'no row is tinted'
    );
    handle.destroy();
  });
});

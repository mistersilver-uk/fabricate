/**
 * Issue 2841 — the published `IconPicker`'s `tint` in Chromium, on the trigger markup the seam
 * draws, under the module sheet: a tinted trigger's glyph resolves to the `--fab-tag-*` colour its
 * key names in the real cascade, over the accent the untinted trigger keeps, and its tile, label and
 * caret are drawn as the untinted trigger's are.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-icon-picker-tint-rendered-');
const BASE = Object.freeze({
  value: 'fas fa-leaf',
  onChange() {},
  ariaLabel: 'Activity icon',
  listLabel: 'Activity icons',
  searchLabel: 'Search activity icons',
  noMatchesText: 'No icon matches.',
});
const CASES = Object.freeze([
  ['plain', {}],
  ['ember', { tint: 'ember' }],
  ['slate', { tint: 'slate' }],
  ['unknown', { tint: 'crimson' }],
]);

describe('the published IconPicker tint, rendered (issue 2841)', () => {
  let browser;
  let tab;

  before(async () => {
    const cells = [];
    for (const [id, props] of CASES) {
      const { target, handle } = mountEntry('IconPicker', { ...BASE, ...props });
      await settle();
      cells.push(`<div data-case="${id}" style="width:240px">${target.innerHTML}</div>`);
      handle.destroy();
    }
    const probes = ['--fab-accent', '--fab-tag-ember', '--fab-tag-slate']
      .map((name) => `<i data-token="${name}" style="color:var(${name})"></i>`)
      .join('');
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 480, height: 400 } });
    await tab.setContent(
      `${renderedPageHead([])}<body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="foundry-native">` +
        `${cells.join('')}<div>${probes}</div></div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  const token = (name) =>
    tab.evaluate(
      (key) => getComputedStyle(document.querySelector(`[data-token="${key}"]`)).color,
      name
    );

  /** The case's glyph colour, and its tile's and trigger's boxes and fills. */
  const drawn = (id) =>
    tab.evaluate((hook) => {
      const trigger = document.querySelector(`[data-case="${hook}"] button`);
      const tile = trigger.querySelector('.essence-icon-picker-preview');
      const box = (node) => {
        const { width, height } = node.getBoundingClientRect();
        return `${width}x${height}`;
      };
      return {
        glyph: getComputedStyle(tile.querySelector('i')).color,
        tile: [box(tile), getComputedStyle(tile).backgroundColor],
        trigger: [box(trigger), getComputedStyle(trigger).backgroundColor],
      };
    }, id);

  it('draws a tinted glyph in the tag colour and an untinted one in the accent', async () => {
    assert.equal((await drawn('plain')).glyph, await token('--fab-accent'));
    assert.equal((await drawn('unknown')).glyph, await token('--fab-accent'));
    assert.equal((await drawn('ember')).glyph, await token('--fab-tag-ember'));
    assert.equal((await drawn('slate')).glyph, await token('--fab-tag-slate'));
    assert.notEqual(await token('--fab-tag-ember'), await token('--fab-accent'));
  });

  it('draws the tile and the trigger as the untinted trigger does', async () => {
    const plain = await drawn('plain');
    for (const id of ['ember', 'slate']) {
      const tinted = await drawn(id);
      assert.deepEqual([tinted.tile, tinted.trigger], [plain.tile, plain.trigger], id);
    }
  });
});

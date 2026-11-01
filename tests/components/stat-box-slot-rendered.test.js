/**
 * Issue 2841 — the published `StatBox`'s `children` band in Chromium, on the markup the seam draws
 * with a published thin `FillBar` mounted in it, as a companion's progress tile does: the band and
 * the bar span the box's content width in both layouts, `--fab-space-2` below the figure and label
 * and above the note, the bar draws its 4px track, a second child sits `--fab-space-1` below the
 * first, and the accessibility tree reads the box's text once with nothing for the bar.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { ui, freshTarget } = publishedEntrySeam('fab-stat-box-slot-rendered-');
const TILE = Object.freeze({ value: '42%', label: 'Progress', children: true });

/** Each case's props and how many thin bars the companion mounts in the band. */
const CASES = Object.freeze({
  start: [{ ...TILE, layout: 'start' }, 1],
  default: [TILE, 1],
  noted: [{ ...TILE, layout: 'start', note: 'Two stages to go' }, 1],
  danger: [{ ...TILE, layout: 'start', tone: 'danger' }, 1],
  pair: [{ ...TILE, layout: 'start' }, 2],
  bare: [{ value: '42%', label: 'Progress', layout: 'start' }, 0],
});

/** The seam's markup for a box mounted with `props`, `bars` thin bars mounted in its band. */
async function drawn(props, bars) {
  const seam = ui();
  const target = freshTarget();
  const handle = seam.mount('StatBox', { target, props });
  await settle();
  const tracks = Array.from({ length: bars }, (_, index) => {
    const own = document.createElement('div');
    handle.slot('children').append(own);
    const value = 42 + index * 30;
    return seam.mount('FillBar', {
      target: own,
      props: { value, density: 'thin', tone: 'accent' },
    });
  });
  await settle();
  const markup = target.innerHTML;
  for (const track of tracks) track.destroy();
  handle.destroy();
  return markup;
}

describe('the published StatBox band, rendered (issue 2841)', () => {
  let browser;
  let tab;

  before(async () => {
    const hosts = [];
    for (const [id, [props, bars]] of Object.entries(CASES)) {
      hosts.push(`<div data-case="${id}" style="width:180px">${await drawn(props, bars)}</div>`);
    }
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 480, height: 900 } });
    await tab.setContent(
      `${renderedPageHead(['Kicker', 'StatBox', 'FillBar'])}<body class="game">` +
        `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif;padding:8px">` +
        `${hosts.join('')}</div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  /** The case's box content box, band, bars, figure, label and note, as rounded rectangles. */
  const measure = (id) =>
    tab.locator(`[data-case="${id}"] .fab-stat-box`).evaluate((box) => {
      const rect = (node) => {
        if (!node) return null;
        const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
        return Object.fromEntries(
          Object.entries({ left, top, right, bottom, width, height }).map(([k, v]) => [
            k,
            Math.round(v * 100) / 100,
          ])
        );
      };
      const style = getComputedStyle(box);
      const outer = box.getBoundingClientRect();
      const inset = (side) =>
        Number.parseFloat(style[`padding${side}`]) + Number.parseFloat(style[`border${side}Width`]);
      return {
        content: { left: outer.left + inset('Left'), right: outer.right - inset('Right') },
        band: rect(box.querySelector(':scope > .fab-stat-box-slot')),
        bars: [...box.querySelectorAll('.fab-fill-bar')].map(rect),
        fills: [...box.querySelectorAll('.fab-fill-bar-fill')].map(rect),
        figure: rect(box.querySelector('.fab-stat-box-value')),
        label: rect(box.querySelector(':scope > .fab-kicker')),
        note: rect(box.querySelector('.fab-stat-box-note')),
      };
    });

  // At `default` the label is an inline kicker, whose 11px line box ends 1px below its glyph box.
  for (const [id, gap] of [
    ['start', 8],
    ['default', 9],
    ['noted', 8],
    ['danger', 8],
  ]) {
    it(`at ${id} the band and its bar span the content width 8px below the figure and label, the bar 4px tall`, async () => {
      const { content, band, bars, fills, figure, label } = await measure(id);
      assert.deepEqual([band.left, band.right], [content.left, content.right], 'the band');
      assert.equal(bars.length, 1);
      assert.deepEqual([bars[0].left, bars[0].right], [content.left, content.right], 'the bar');
      assert.equal(bars[0].height, 4);
      assert.ok(Math.abs(fills[0].width - bars[0].width * 0.42) < 0.5, 'the fill is 42%');
      assert.equal(Math.round(band.top - Math.max(figure.bottom, label.bottom)), gap);
    });
  }

  it('draws the note 4px below the band, as below the figure without one', async () => {
    const { band, note } = await measure('noted');
    assert.ok(note.top >= band.bottom, 'the note follows the band');
    assert.equal(Math.round(note.top - band.bottom), 4);
  });

  it('spaces a second child 4px below the first, each at the full width', async () => {
    const { content, bars } = await measure('pair');
    assert.equal(bars.length, 2);
    assert.equal(Math.round(bars[1].top - bars[0].bottom), 4);
    for (const bar of bars) assert.deepEqual([bar.left, bar.right], [content.left, content.right]);
  });

  it('draws no band, and no space for one, without the slot', async () => {
    const { band, bars } = await measure('bare');
    assert.ok(!band && bars.length === 0);
    const heights = await Promise.all(
      ['bare', 'start'].map((id) =>
        tab.locator(`[data-case="${id}"] .fab-stat-box`).evaluate((box) => box.offsetHeight)
      )
    );
    assert.equal(heights[1] - heights[0], 12, 'the band adds its 8px gap and the 4px bar alone');
  });

  it('reads the box once in the accessibility tree, with nothing for the bar', async () => {
    for (const [id, text] of [
      ['start', 'Progress 42%'],
      ['default', '42% Progress'],
    ]) {
      const tree = String(await tab.locator(`[data-case="${id}"]`).ariaSnapshot());
      assert.equal(
        tree
          .replaceAll(/^- text: /gmu, '')
          .replaceAll('\n', ' ')
          .trim(),
        text,
        id
      );
    }
  });
});

/**
 * Issue 2855 — the published `Callout`'s `actionsPlacement`, measured in Chromium on the markup the
 * seam draws, a published full-width `Button` in its actions slot: at `'below'` the actions host is
 * a column beneath the glyph and body, as wide as the strip's content box, at 320px and at 180px,
 * the button filling it and nothing leaving the strip; at the default `'inline'` the host stays
 * beside the body on its row.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { ui, freshTarget } = publishedEntrySeam('fabricate-callout-actions-below-rendered-');
const NOTE = Object.freeze({
  tone: 'accent',
  title: 'Begin an activity',
  text: 'Pick one from the list to start it on your next downtime day.',
  actions: true,
});

/** Each case's callout props and width, keyed by `data-case`. */
const CASES = Object.freeze({
  'below-320': [{ ...NOTE, actionsPlacement: 'below' }, 320, true],
  'below-180': [{ ...NOTE, actionsPlacement: 'below' }, 180, true],
  'inline-320': [{ ...NOTE, text: 'Pick one to start.' }, 320, false],
});

/** The seam's markup for a callout holding one published button, full width or not. */
async function drawn(props, fullWidth) {
  const seam = ui();
  const target = freshTarget();
  const callout = seam.mount('Callout', { target, props });
  await settle();
  const place = target.ownerDocument.createElement('span');
  callout.slot('actions').append(place);
  seam.mount('Button', {
    target: place,
    props: { children: 'Begin activity', fullWidth, role: 'primary', onclick: () => {} },
  });
  await settle();
  const markup = target.innerHTML;
  callout.destroy();
  return markup;
}

describe('Callout actionsPlacement, rendered (issue 2855)', () => {
  let browser;
  let tab;

  before(async () => {
    const hosts = [];
    for (const [id, [props, width, fullWidth]] of Object.entries(CASES)) {
      hosts.push(
        `<div data-case="${id}" style="width:${width}px">${await drawn(props, fullWidth)}</div>`
      );
    }
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 640, height: 900 } });
    await tab.setContent(
      `${renderedPageHead(['Callout'])}<body class="game">` +
        `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif;padding:8px">` +
        `${hosts.join('')}</div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  /** The case's strip, glyph, body, actions host and button: each box, and the host's axis. */
  const measure = (id) =>
    tab.$eval(`[data-case="${id}"] > .manager-callout`, (strip) => {
      const box = (element) => {
        const { left, right, top, bottom, width } = element.getBoundingClientRect();
        return { left, right, top, bottom, width };
      };
      const style = getComputedStyle(strip);
      const inset = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
      const host = strip.querySelector(':scope > .manager-callout-actions');
      return {
        strip: box(strip),
        inset,
        rowGap: Number.parseFloat(style.rowGap),
        glyph: box(strip.querySelector(':scope > i')),
        body: box(strip.querySelector(':scope > .manager-callout-body')),
        host: box(host),
        axis: getComputedStyle(host).flexDirection,
        button: box(host.querySelector('.fabricate-button')),
        overflow: strip.scrollWidth - strip.clientWidth,
      };
    });

  for (const id of ['below-320', 'below-180']) {
    it(`stacks the actions beneath the glyph and body, as wide as the content box, at ${id.slice(6)}px`, async () => {
      const parts = await measure(id);
      const left = parts.strip.left + parts.inset;
      const right = parts.strip.right - parts.inset;
      assert.equal(parts.axis, 'column');
      assert.equal(parts.host.top, Math.max(parts.glyph.bottom, parts.body.bottom) + parts.rowGap);
      assert.deepEqual([parts.host.left, parts.host.right], [left, right], 'the content box');
      assert.deepEqual(
        [parts.button.left, parts.button.right],
        [left, right],
        'the button fills it'
      );
      assert.equal(parts.glyph.left, left, 'the glyph keeps its column');
      assert.equal(parts.body.right, right, 'the body keeps the rest of the row');
      assert.equal(parts.overflow, 0, 'nothing leaves the strip');
    });
  }

  it('keeps the default inline host beside the body, on its row', async () => {
    const parts = await measure('inline-320');
    assert.equal(parts.axis, 'row');
    assert.ok(parts.host.top < parts.body.bottom, 'on the body’s row');
    assert.ok(parts.host.left >= parts.body.right, 'after the body');
    assert.equal(parts.host.right, parts.strip.right - parts.inset);
    assert.equal(parts.overflow, 0);
  });
});

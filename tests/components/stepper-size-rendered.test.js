/**
 * Issue 2841 — the published `Stepper`'s dense `size` `26` in Chromium, on the markup the seam
 * draws: the rung is 26px tall and as wide as the default, each button fills a 24 by 24 cell and
 * the input a 24px-tall one to the stepper's inner edge, a pointer at a button's outermost pixel
 * lands on it and one pixel further lands on the stepper, the rung outranks `comfortable` and pins `fill` at 26px, the
 * keyboard ring straddles the cell's edge inside the stepper's outer edge, and the default and
 * comfortable rungs keep their 28px and 30px.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { STEPPER_NAMES } from '../helpers/publishedStepperFixture.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-stepper-size-rendered-');
const BASE = Object.freeze({ value: 2, min: 0, max: 9, ...STEPPER_NAMES, onChange() {} });

/** Each case's props and the width of its target. */
const CASES = Object.freeze({
  default: [{}, 200],
  comfortable: [{ density: 'comfortable' }, 200],
  dense: [{ size: 26 }, 200],
  'dense-string': [{ size: '26' }, 200],
  'dense-comfortable': [{ size: 26, density: 'comfortable' }, 200],
  'dense-fill': [{ size: 26, fill: true }, 200],
  'dense-disabled': [{ size: 26, disabled: true }, 200],
});

describe('the published Stepper dense rung, rendered (issue 2841)', () => {
  let browser;
  let tab;

  before(async () => {
    const hosts = [];
    for (const [id, [props, width]] of Object.entries(CASES)) {
      const { target, handle } = mountEntry('Stepper', { ...BASE, ...props });
      await settle();
      hosts.push(`<div data-case="${id}" style="width:${width}px">${target.innerHTML}</div>`);
      handle.destroy();
    }
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 480, height: 600 } });
    await tab.setContent(
      `${renderedPageHead(['Stepper'])}<body class="game">` +
        `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif;padding:8px;display:grid;gap:8px">` +
        `${hosts.join('')}</div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  /** The case's stepper, buttons and input as rectangles, and the root's border width. */
  const measure = (id) =>
    tab.locator(`[data-case="${id}"] .fab-stepper`).evaluate((root) => {
      const rect = (node) => {
        const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      return {
        root: rect(root),
        border: Number.parseFloat(getComputedStyle(root).borderTopWidth),
        decrement: rect(root.querySelector('[data-stepper-decrement]')),
        increment: rect(root.querySelector('[data-stepper-increment]')),
        input: rect(root.querySelector('input')),
      };
    });

  for (const [id, height, width = 102] of [
    ['default', 28],
    ['comfortable', 30, 106],
    ['dense', 26],
    ['dense-string', 26],
    ['dense-comfortable', 26],
    ['dense-disabled', 26],
  ]) {
    it(`draws ${id} ${height}px tall and ${width}px wide, every target at least 24 by 24`, async () => {
      const { root, decrement, increment, input } = await measure(id);
      assert.deepEqual([root.height, root.width], [height, width]);
      for (const part of [decrement, increment, input]) {
        assert.ok(part.width >= 24 && part.height >= 24, `${id}: ${part.width}x${part.height}`);
      }
    });
  }

  for (const id of ['dense', 'dense-fill']) {
    it(`fills ${id}'s row with 24px cells to the stepper's inner edge`, async () => {
      const { root, border, decrement, increment, input } = await measure(id);
      const inner = { top: root.top + border, bottom: root.bottom - border };
      for (const part of [decrement, increment, input]) {
        assert.deepEqual([part.top, part.bottom, part.height], [inner.top, inner.bottom, 24]);
      }
      assert.deepEqual(
        [decrement.left, increment.right],
        [root.left + border, root.right - border]
      );
      assert.deepEqual([decrement.width, increment.width], [24, 24]);
    });
  }

  it('pins a filled dense stepper at 26px across its target, the input taking the room', async () => {
    const { root, decrement, increment, input } = await measure('dense-fill');
    assert.deepEqual([root.height, root.width], [26, 200]);
    assert.equal(input.width, 200 - 2 - decrement.width - increment.width - 4);
  });

  it('lands a pointer at each button’s outermost pixel on it, and one pixel further on the stepper', async () => {
    const { root, decrement, increment } = await measure('dense');
    const hit = (x, y) =>
      tab.evaluate(
        ([px, py]) => {
          const node = document.elementFromPoint(px, py);
          if (node?.closest('[data-stepper-decrement]')) return 'decrement';
          if (node?.closest('[data-stepper-increment]')) return 'increment';
          return node?.classList.contains('fab-stepper') ? 'stepper' : String(node?.className);
        },
        [x, y]
      );
    // Chromium hit-tests a fractional point as the next pixel, so each probe is a whole pixel.
    const [first, last] = [(edge) => edge, (edge) => edge - 1];
    const middle = root.top + root.height / 2;
    assert.equal(await hit(first(decrement.left), middle), 'decrement');
    assert.equal(await hit(first(decrement.left - 1), middle), 'stepper');
    assert.equal(await hit(last(increment.right), middle), 'increment');
    assert.equal(await hit(last(increment.right + 1), middle), 'stepper');
    assert.equal(await hit(decrement.left + 12, first(decrement.top)), 'decrement');
    assert.equal(await hit(decrement.left + 12, first(decrement.top - 1)), 'stepper');
    assert.equal(await hit(decrement.left + 12, last(decrement.bottom)), 'decrement');
    assert.equal(await hit(decrement.left + 12, last(decrement.bottom + 1)), 'stepper');
  });

  it('draws the keyboard ring 1px over the cell’s edge, inside the stepper’s outer edge', async () => {
    const button = tab.locator('[data-case="dense"] [data-stepper-decrement]');
    await tab.locator('[data-case="dense"] input').focus();
    await tab.keyboard.press('Shift+Tab');
    const ring = await button.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        focused: node.matches(':focus-visible'),
        outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset],
      };
    });
    assert.deepEqual(ring, { focused: true, outline: ['solid', '2px', '-1px'] });
    const input = tab.locator('[data-case="dense"] input');
    await input.focus();
    assert.equal(await input.evaluate((node) => getComputedStyle(node).outlineOffset), '-1px');
    // The ring's outer edge, from the computed outline of each focused part, against the stepper's.
    for (const part of ['[data-stepper-decrement]', 'input', '[data-stepper-increment]']) {
      const locator = tab.locator(`[data-case="dense"] ${part}`);
      await locator.focus();
      const [ring, outer] = await locator.evaluate((node) => {
        const style = getComputedStyle(node);
        const reach =
          Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
        const box = node.getBoundingClientRect();
        const edge = node.closest('.fab-stepper').getBoundingClientRect();
        return [
          [box.left - reach, box.top - reach, box.right + reach, box.bottom + reach],
          [edge.left, edge.top, edge.right, edge.bottom],
        ];
      });
      assert.ok(ring[0] >= outer[0] && ring[1] >= outer[1], `${part}: ${ring} in ${outer}`);
      assert.ok(ring[2] <= outer[2] && ring[3] <= outer[3], `${part}: ${ring} in ${outer}`);
    }
  });

  it('keeps the default rung’s ring at the part’s edge, so the rung alone moves it', async () => {
    const input = tab.locator('[data-case="default"] input');
    await input.focus();
    assert.equal(await input.evaluate((node) => getComputedStyle(node).outlineOffset), '0px');
  });
});

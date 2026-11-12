/**
 * Issues 2841 and 2903 — the published `Stepper`'s `size` rungs in Chromium, on the markup the seam
 * draws: the dense `26` is 26px tall and as wide as the default, each button filling a 24 by 24
 * cell and the input a 24px-tall one to the stepper's inner edge; the toolbar `34` is 34px tall and
 * as wide as the default, its input filling the 28px row inside the 2px padding and its buttons
 * centred 24 by 24 targets; a pointer at a button's outermost pixel lands on it and one pixel
 * further on the stepper; each rung outranks `comfortable`, and `fill` takes the rung's height or
 * 38px without one; the keyboard ring stays inside the stepper's outer edge, and the toolbar rung
 * keeps its edge and ring under forced colours; the toolbar rung draws the 34px band's 9px corner
 * where every other group draws 7px; the default and comfortable rungs keep their 28px and 30px; and a filled stepper's input holds no column wider
 * than its buttons' row.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from '../helpers/playwrightChromium.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { STEPPER_NAMES } from '../helpers/publishedStepperFixture.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-stepper-size-rendered-');
const BASE = Object.freeze({ value: 2, min: 0, max: 9, ...STEPPER_NAMES, onChange() {} });

const FORMATTED = Object.freeze({ value: null, format: 'signed', stops: [-2, 0, 2] });

/** Each case's props, the width of its target and, for a case in a column, the column's host. */
const CASES = Object.freeze({
  default: [{}, 200],
  comfortable: [{ density: 'comfortable' }, 200],
  dense: [{ size: 26 }, 200],
  'dense-string': [{ size: '26' }, 200],
  'dense-comfortable': [{ size: 26, density: 'comfortable' }, 200],
  'dense-fill': [{ size: 26, fill: true }, 200],
  'dense-disabled': [{ size: 26, disabled: true }, 200],
  toolbar: [{ size: 34 }, 200],
  'toolbar-string': [{ size: '34' }, 200],
  'toolbar-comfortable': [{ size: '34', density: 'comfortable' }, 200],
  'toolbar-fill': [{ size: '34', fill: true }, 200],
  'toolbar-disabled': [{ size: 34, disabled: true }, 200],
  'toolbar-unset': [{ size: '34', value: null, allowUnset: true, placeholder: 'Any' }, 200],
  'toolbar-formatted': [{ size: '34', ...FORMATTED }, 200],
  'toolbar-endpoint': [{ size: '34', ...FORMATTED, nullLabel: 'Otherwise' }, 200],
  'toolbar-rtl': [{ size: '34' }, 200, 'dir="rtl"'],
  fill: [{ fill: true }, 200],
  'fill-28': [{ size: '28', fill: true }, 200],
  'fill-comfortable': [{ fill: true, density: 'comfortable' }, 200],
});

/**
 * A filled stepper at the narrow end of a 94px card, beside a 24px label, so the column leaves it
 * 64px: room for its buttons' row and narrower than that row plus any input's own width, whatever
 * the font; in a flex row and a grid column.
 */
const COLUMNS = Object.freeze({
  'fill-flex-row': 'display:flex;gap:6px;align-items:center',
  'fill-grid-column': 'display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center',
});

describe('the published Stepper size rungs, rendered (issues 2841 and 2903)', () => {
  let browser;
  let tab;

  before(async () => {
    const hosts = [];
    for (const [id, [props, width, attributes = '']] of Object.entries(CASES)) {
      const { target, handle } = mountEntry('Stepper', { ...BASE, ...props });
      await settle();
      hosts.push(
        `<div data-case="${id}" ${attributes} style="width:${width}px">${target.innerHTML}</div>`
      );
      handle.destroy();
    }
    const { target, handle } = mountEntry('Stepper', { ...BASE, fill: true });
    await settle();
    for (const [id, layout] of Object.entries(COLUMNS)) {
      hosts.push(
        `<div data-column="${id}" style="width:94px;${layout}">` +
          `<span style="width:24px;overflow:hidden">Qty</span>` +
          `<div data-case="${id}">${target.innerHTML}</div></div>`
      );
    }
    hosts.push(
      `<div style="width:100px"><div data-case="fill-max-content" style="width:max-content">` +
        `${target.innerHTML}</div></div>`
    );
    handle.destroy();
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 480, height: 1200 } });
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
    ['toolbar', 34],
    ['toolbar-string', 34],
    ['toolbar-comfortable', 34],
    ['toolbar-disabled', 34],
    ['toolbar-unset', 34],
    ['toolbar-formatted', 34],
    ['toolbar-rtl', 34],
    ['fill', 38, 200],
    ['fill-28', 38, 200],
    ['fill-comfortable', 38, 200],
    ['dense-fill', 26, 200],
    ['toolbar-fill', 34, 200],
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

  for (const id of ['toolbar', 'toolbar-fill', 'toolbar-rtl', 'toolbar-endpoint']) {
    it(`fills ${id}'s 28px row with the input, its buttons centred 24 by 24 targets`, async () => {
      const { root, border, decrement, increment, input } = await measure(id);
      const inner = { top: root.top + border + 2, bottom: root.bottom - border - 2 };
      assert.equal(root.height, 34);
      assert.deepEqual([input.top, input.bottom, input.height], [inner.top, inner.bottom, 28]);
      for (const part of [decrement, increment]) {
        assert.deepEqual([part.width, part.height], [24, 24]);
        assert.equal(part.top + part.height / 2, root.top + root.height / 2);
      }
    });
  }

  it('fills a toolbar stepper across its target, the input taking the room', async () => {
    const { root, input } = await measure('toolbar-fill');
    assert.deepEqual([root.height, root.width], [34, 200]);
    assert.equal(input.width, 200 - 2 - 4 - 22 - 22 - 4);
  });

  it('draws the toolbar rung on the 34px band’s 9px corner, filled or not, and 7px elsewhere', async () => {
    const radii = await tab.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-case] > .fab-stepper')].map((root) => [
          root.parentElement.dataset.case,
          getComputedStyle(root).borderTopLeftRadius,
        ])
      )
    );
    for (const [id, radius] of Object.entries(radii)) {
      const expected = id.startsWith('toolbar') ? '9px' : '7px';
      assert.equal(radius, expected, `${id}'s corner`);
    }
  });

  it('keeps the toolbar rung’s edge and keyboard ring under forced colours', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const forced = await tab.locator('[data-case="toolbar"] .fab-stepper').evaluate((root) => {
        const button = root.querySelector('[data-stepper-decrement]');
        button.focus();
        const [edge, ring] = [getComputedStyle(root), getComputedStyle(button)];
        return [
          [edge.borderTopStyle, edge.borderTopWidth],
          [button.matches(':focus-visible'), ring.outlineStyle, ring.outlineWidth],
          root.getBoundingClientRect().height,
        ];
      });
      assert.deepEqual(forced, [['solid', '1px'], [true, 'solid', '2px'], 34]);
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });

  it('mirrors the toolbar row right to left, decrement at the right', async () => {
    const { decrement, increment, input } = await measure('toolbar-rtl');
    assert.ok(increment.right <= input.left && input.right <= decrement.left);
  });

  for (const id of ['fill-flex-row', 'fill-grid-column']) {
    it(`narrows a filled stepper in a ${id.slice(5)} with its column, inside the card`, async () => {
      const [card, stepper] = await tab
        .locator(`[data-column="${id}"]`)
        .evaluate((column) =>
          [column, column.querySelector('.fab-stepper')].map(
            (node) => node.getBoundingClientRect().right
          )
        );
      assert.ok(stepper <= card, `${id}: the stepper ends at ${stepper}, the card at ${card}`);
    });
  }

  it('keeps a filled stepper’s input at its own width in a max-content box', async () => {
    // Against the same input's natural width, read on this page, so no font's figure is pinned.
    const [filled, natural, padding] = await tab
      .locator('[data-case="fill-max-content"] input')
      .evaluate((input) => {
        const style = getComputedStyle(input);
        const filledWidth = input.getBoundingClientRect().width;
        input.style.setProperty('flex', 'none');
        input.style.setProperty('width', 'auto');
        const naturalWidth = input.getBoundingClientRect().width;
        input.style.removeProperty('flex');
        input.style.removeProperty('width');
        return [
          filledWidth,
          naturalWidth,
          Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight),
        ];
      });
    assert.ok(natural > padding, `the input draws ${natural}px of its own`);
    assert.equal(filled, natural, 'the filled input keeps its natural width');
    const { root } = await measure('fill-max-content');
    assert.equal(root.width, filled + 2 + 4 + 22 + 22 + 4);
  });

  for (const id of ['dense', 'toolbar']) {
    it(`lands a pointer at ${id}'s outermost button pixel on it, and one pixel further on the stepper`, async () => {
      const { root, decrement, increment } = await measure(id);
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
  }

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

  /** Each part of a case focused in turn: its ring, and whether the ring stays inside the stepper's outer edge. */
  const ringsOf = (id) =>
    tab.locator(`[data-case="${id}"] .fab-stepper`).evaluate((root) =>
      ['[data-stepper-decrement]', 'input', '[data-stepper-increment]'].map((part) => {
        const node = root.querySelector(part);
        node.focus();
        const style = getComputedStyle(node);
        const reach =
          Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
        const box = node.getBoundingClientRect();
        const edge = root.getBoundingClientRect();
        const inside =
          box.left - reach >= edge.left &&
          box.top - reach >= edge.top &&
          box.right + reach <= edge.right &&
          box.bottom + reach <= edge.bottom;
        return [node.matches(':focus-visible'), style.outlineStyle, style.outlineOffset, inside];
      })
    );

  for (const [id, inputOffset] of [
    ['toolbar', '0px'],
    ['toolbar-fill', '1px'],
  ]) {
    it(`draws ${id}'s ring at each button's edge, the input's ${inputOffset} out, inside the stepper`, async () => {
      assert.deepEqual(await ringsOf(id), [
        [true, 'solid', '0px', true],
        [true, 'solid', inputOffset, true],
        [true, 'solid', '0px', true],
      ]);
    });
  }

  it('keeps the default rung’s ring at the part’s edge, so the rung alone moves it', async () => {
    const input = tab.locator('[data-case="default"] input');
    await input.focus();
    assert.equal(await input.evaluate((node) => getComputedStyle(node).outlineOffset), '0px');
  });
});

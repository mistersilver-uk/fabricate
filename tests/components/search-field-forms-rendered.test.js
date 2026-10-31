/**
 * Issue 2849 — the published `SearchField`'s `density` rungs and trailing count, measured in Chromium
 * on the markup the seam draws: each rung's shell height and corner, the input stretched to it, the
 * lit border at each rung while the input holds focus, and the count beside the input inside the
 * shell's inset, on one line in the muted ink, the input yielding the width.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fabricate-search-field-forms-rendered-');
const RUNGS = Object.freeze([
  ['default', 38, 9],
  ['toolbar', 34, 9],
  ['inline', 30, 7],
]);
const NAMED = Object.freeze({ ariaLabel: 'Search components', placeholder: 'Name or tag' });

/** Each case's props, keyed by `data-case`: each rung bare and with a count, and two long counts. */
const CASES = Object.freeze({
  ...Object.fromEntries(
    RUNGS.flatMap(([density]) => [
      [density, { density }],
      [`${density}-count`, { density, countLabel: '12 found' }],
    ])
  ),
  'long-count': { density: 'inline', countLabel: '1,204 components found' },
  'narrow-long-count': { density: 'inline', countLabel: '1,204 Komponenten gefunden' },
});
/** The narrow case's shell is the field's own 180px floor. */
const WIDTHS = Object.freeze({ 'narrow-long-count': 180 });

// The seam's own `before` hook loads the runtime, so the page is built in the suite's.
describe('SearchField forms, rendered (issue 2849)', () => {
  let browser;
  let tab;

  before(async () => {
    const hosts = [];
    for (const [id, props] of Object.entries(CASES)) {
      const { target, handle } = mountEntry('SearchField', { ...NAMED, ...props });
      await settle();
      hosts.push(
        `<div data-case="${id}" style="display:flex;width:${WIDTHS[id] ?? 240}px">${target.innerHTML}</div>`
      );
      handle.destroy();
    }
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 640, height: 900 } });
    await tab.setContent(
      `${renderedPageHead([])}<body class="game">` +
        `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif;padding:8px">` +
        `<i data-token="accent" style="color:var(--fab-accent)"></i>` +
        `<i data-token="muted" style="color:var(--fab-text-muted)"></i>` +
        `${hosts.join('')}</div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  /** A case's shell, input and count: each box, and the figures the rungs and the count change. */
  const measure = (id) =>
    tab.$eval(`[data-case="${id}"] .fabricate-search`, (shell) => {
      const box = (element) => {
        if (!element) return null;
        const { left, right, top, bottom, height, width } = element.getBoundingClientRect();
        return { left, right, top, bottom, height, width };
      };
      const style = getComputedStyle(shell);
      const count = shell.querySelector('.fabricate-search-count');
      return {
        shell: box(shell),
        corner: style.borderTopLeftRadius,
        edge: style.borderTopColor,
        padding: Number.parseFloat(style.paddingRight),
        input: box(shell.querySelector('input')),
        count: box(count),
        countInk: count ? getComputedStyle(count).color : null,
        countCut: count ? count.scrollWidth > count.clientWidth : null,
        countText: count?.textContent ?? null,
      };
    });

  const token = (name) =>
    tab.$eval(`[data-token="${name}"]`, (probe) => getComputedStyle(probe).color);

  describe('SearchField density, rendered (issue 2849)', () => {
    for (const [density, height, corner] of RUNGS) {
      it(`draws the ${density} shell ${height}px at radius ${corner}, its input stretched to it`, async () => {
        const figures = await measure(density);
        assert.equal(figures.shell.height, height);
        assert.equal(figures.corner, `${corner}px`);
        assert.equal(figures.input.height, height - 2, 'the input fills the shell inside its edge');
      });

      it(`lights the ${density} shell's border with the accent while its input holds focus`, async () => {
        const rest = await measure(density);
        await tab.focus(`[data-case="${density}"] input`);
        const focused = await measure(density);
        await tab.$eval(`[data-case="${density}"] input`, (input) => input.blur());
        assert.notEqual(rest.edge, focused.edge, 'the border changes');
        assert.equal(focused.shell.height, height, 'focus moves nothing');
        const outline = await tab.$eval(`[data-case="${density}"] input`, (input) => {
          input.focus();
          const drawn = getComputedStyle(input).outlineStyle;
          input.blur();
          return drawn;
        });
        assert.equal(outline, 'none', 'the input draws no ring of its own');
      });
    }

    it('lights the border in the accent', async () => {
      await tab.focus('[data-case="inline"] input');
      await tab.waitForFunction(
        ([accent]) =>
          getComputedStyle(document.querySelector('[data-case="inline"] .fabricate-search'))
            .borderTopColor === accent,
        [await token('accent')]
      );
      await tab.$eval('[data-case="inline"] input', (input) => input.blur());
    });
  });

  describe('SearchField countLabel, rendered (issue 2849)', () => {
    for (const [density, height] of RUNGS) {
      it(`draws the count after the input inside the ${density} shell's inset, centred, in the muted ink`, async () => {
        const { shell, input, count, countInk, padding } = await measure(`${density}-count`);
        assert.equal(shell.height, height, 'the count keeps the rung');
        assert.ok(count.left >= input.right, 'after the input');
        assert.ok(count.right <= shell.right - 1 - padding + 0.01, 'inside the shell’s inset');
        const middle = (box) => (box.top + box.bottom) / 2;
        assert.ok(Math.abs(middle(count) - middle(shell)) < 1, 'centred on the shell');
        assert.equal(countInk, await token('muted'));
      });
    }

    it('keeps a long count on one line, the input yielding the width', async () => {
      const short = await measure('inline-count');
      const long = await measure('long-count');
      assert.equal(long.shell.height, 30);
      assert.equal(long.count.height, short.count.height, 'on one line, as the short count');
      assert.ok(long.input.width < short.input.width, 'the input narrows');
      assert.ok(long.count.right <= long.shell.right - 1 - long.padding + 0.01, 'inside the inset');
    });

    it('cuts a count past half a 180px shell with an ellipsis, the input keeping a usable width', async () => {
      const { shell, input, count, padding, countCut, countText } =
        await measure('narrow-long-count');
      const inner = shell.width - 2 - 2 * padding;
      assert.equal(shell.width, 180);
      assert.ok(count.width <= inner / 2 + 0.01, `the count is ${count.width}px of ${inner}px`);
      assert.ok(countCut, 'its text overflows into the ellipsis');
      assert.equal(
        countText,
        '1,204 Komponenten gefunden',
        'the region still holds the whole text'
      );
      assert.ok(input.width >= 45, `the input keeps ${input.width}px`);
      assert.ok(count.right <= shell.right - 1 - padding + 0.01, 'inside the inset');
    });

    it('gives back the gap of the empty region, so the input reaches the inset as before', async () => {
      for (const [density] of RUNGS) {
        const { shell, input, count, padding } = await measure(density);
        assert.equal(count.width, 0, `${density}: the empty region draws nothing`);
        assert.ok(
          Math.abs(input.right - (shell.right - 1 - padding)) < 0.01,
          `${density}: the input ends at the inset`
        );
      }
    });
  });
});

/**
 * The routing overview's skinned select and blocked row, measured in a real browser (issue 2513):
 * the tone skin yields the accent border to keyboard focus, and a blocked row's words wrap to at
 * most two lines without truncating.
 * The hand-written DOM mirrors the classes `RoutingOverview` and `Select` emit, as
 * `manager-layout-select.js` does, so a class renamed there is renamed here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { openLayoutContext } from '../helpers/layout-harness.js';

import { css } from './manager-layout-shared.js';

/** One row as `RoutingOverview` draws it: badge, summary, connector, then `slot`. */
const row = (key, slot, kind = 'source') => `
  <li class="fabricate-routing-overview-row" data-routing-overview-row="${key}"
    data-routing-overview-kind="${kind}">
    <span class="manager-chip fabricate-routing-overview-source">${key}</span>
    <span class="fabricate-routing-overview-summary">12–14</span>
    <span class="fabricate-routing-overview-connector">produces</span>
    ${slot}
  </li>`;

const target = (tone) => `
  <div class="fabricate-routing-overview-target">
    <div class="fabricate-picker manager-travel-picker fabricate-select">
      <button type="button" class="fabricate-select-trigger fabricate-select-trigger-inline"
        data-select-size="inline" data-routing-overview-tone="${tone}" data-probe="${tone}"
        role="combobox" aria-haspopup="listbox" aria-expanded="false"
      ><span class="fabricate-select-value">Standard Blade</span></button>
    </div>
  </div>
  <span class="fabricate-routing-overview-markers"></span>`;

const BLOCKED =
  'below this recipe’s minimum success tier, held there by the minimum the recipe sets on its ' +
  'Overview';

test('the routing select yields its tone border to the accent under keyboard focus', async () => {
  const context = await openLayoutContext({ viewport: { width: 900, height: 400 } });
  const page = await context.newPage();
  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><style>@layer modules { ${css} } body { margin: 0; }</style></head>
        <body>
          <div class="fabricate"><main class="fabricate-manager">
            <button type="button" data-probe="anchor">anchor</button>
            <div class="fabricate-routing-overview" style="width: 640px">
              <ul class="fabricate-routing-overview-list">
                ${row('Fine', target('success'))}
                ${row('Rough', target('warning'))}
              </ul>
            </div>
            <div data-probe="accent-border" style="background: var(--fab-accent-border)"></div>
            <div data-probe="success-border" style="background: var(--fab-success-border)"></div>
          </main></div>
        </body>
      </html>`);
    const colour = (probe, property) =>
      page.evaluate(
        ([name, key]) => getComputedStyle(document.querySelector(`[data-probe="${name}"]`))[key],
        [probe, property]
      );
    const accent = await colour('accent-border', 'backgroundColor');
    assert.equal(
      await colour('success', 'borderTopColor'),
      await colour('success-border', 'backgroundColor'),
      'at rest a chosen target wears the success skin'
    );
    const widths = await page.evaluate(() =>
      ['.fabricate-routing-overview-target', '.fabricate-select-trigger'].map(
        (selector) => document.querySelector(selector).getBoundingClientRect().width
      )
    );
    assert.deepEqual(widths, [170, 170], 'the select fills its fixed slot');
    await page.focus('[data-probe="anchor"]');
    for (const tone of ['success', 'warning']) {
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.probe),
        tone,
        `Tab reaches the ${tone} select`
      );
      assert.equal(
        await colour(tone, 'borderTopColor'),
        accent,
        `${tone}: the border is the accent`
      );
    }
  } finally {
    await context.close();
  }
});

test('a blocked row’s words wrap to at most two lines and never truncate', async () => {
  const context = await openLayoutContext({ viewport: { width: 900, height: 400 } });
  const page = await context.newPage();
  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><style>@layer modules { ${css} } body { margin: 0; }</style></head>
        <body>
          <div class="fabricate"><main class="fabricate-manager">
            <div class="fabricate-routing-overview" style="width: 640px">
              <ul class="fabricate-routing-overview-list">
                ${row('Rough', `<span class="fabricate-routing-overview-blocked">${BLOCKED}</span>`, 'blocked')}
              </ul>
            </div>
          </main></div>
        </body>
      </html>`);
    const measured = await page.evaluate(() => {
      const blocked = document.querySelector('.fabricate-routing-overview-blocked');
      const style = getComputedStyle(blocked);
      return {
        lines: Math.round(
          blocked.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)
        ),
        overflow: blocked.scrollWidth - blocked.clientWidth,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    });
    assert.ok(measured.lines >= 1 && measured.lines <= 2, `wraps to ${measured.lines} lines`);
    assert.ok(measured.lines === 2, 'this sentence is long enough to need the second line');
    assert.ok(measured.overflow <= 0, 'and nothing is clipped');
    assert.notEqual(measured.textOverflow, 'ellipsis');
    assert.notEqual(measured.whiteSpace, 'nowrap');
  } finally {
    await context.close();
  }
});

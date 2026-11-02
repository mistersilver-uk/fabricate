/**
 * The published `IconPicker`'s icon-only trigger and its captioned trigger's name (issues 2899,
 * 2905) in Chromium, mounted through the real seam in a Fabricate window under the module sheet:
 * Chromium's own accessibility tree names a captioned trigger by `ariaLabel` and the caption it
 * draws, once, so its name holds its visible label (WCAG 2.5.3), and an icon-only trigger by
 * `ariaLabel` alone; a caption a narrow column cuts keeps its whole text in the name and the
 * tooltip, where the icon-only trigger fits whole; the icon-only trigger is its glyph's tile alone,
 * a square target of at least 24 by 24 (WCAG 2.5.8) that draws the module ring under keyboard
 * focus, keeps its edge, glyph, tile and ring under forced colours, and opens, closes and returns focus as
 * the captioned one does, with `aria-haspopup` and `aria-expanded` unchanged.
 * Limit: Chromium only; Font Awesome's webfont is not loaded, so a glyph's own box is unmeasured,
 * and screen-reader speech is not observed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromiumAxState } from '../helpers/chromiumAxNode.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const server = createViteFixtureServer({ styleMountPrefix: '/@icon-picker-styles/' });
const VIEWPORT = Object.freeze({ width: 1000, height: 700 });
const trigger = (id) => `[data-case="${id}"] button.essence-icon-picker-trigger`;

before(() => server.start());
after(() => server.stop());

const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

/** Runs `body(page)` on the fixture opened with `query`, then closes the page. */
async function inFixture(query, body, options = {}) {
  const page = await server.newPage({ viewport: VIEWPORT, ...options });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  try {
    await page.goto(server.url(`/tests/fixtures/icon-picker/index.html?${query}`));
    await page.waitForFunction(() => globalThis.__iconPickerReady === true);
    await twoFrames(page);
    const answer = await body(page);
    assert.deepEqual(errors, [], 'no page error');
    return answer;
  } finally {
    await page.close();
  }
}

/** The trigger's box, caption and whether the caption is cut, and its tooltip. */
const triggerBox = (page, id) =>
  page.evaluate((selector) => {
    const button = document.querySelector(selector);
    const target = button.closest('[data-case]');
    const caption = button.querySelector('.essence-icon-picker-trigger-label');
    const { width, height } = button.getBoundingClientRect();
    return {
      width,
      height,
      targetWidth: target.getBoundingClientRect().width,
      caret: button.querySelector('.essence-icon-picker-trigger-caret').checkVisibility(),
      overflows: button.scrollWidth > button.clientWidth,
      caption: caption?.textContent.trim() ?? null,
      cut: caption ? caption.scrollWidth > caption.clientWidth : null,
      title: button.title,
    };
  }, trigger(id));

/** The trigger's border, ring and glyph-tile paint. */
const paint = (page, id) =>
  page.evaluate((selector) => {
    const button = document.querySelector(selector);
    const style = getComputedStyle(button);
    const tile = getComputedStyle(button.querySelector('.essence-icon-picker-preview'));
    return {
      border: `${style.borderTopStyle} ${style.borderTopWidth}`,
      borderColor: style.borderTopColor,
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`,
      outlineColor: style.outlineColor,
      glyph: getComputedStyle(button.querySelector(':scope .essence-icon-picker-preview i')).color,
      tile: `${tile.width}x${tile.height}`,
      background: style.backgroundColor,
    };
  }, trigger(id));

/** Focuses the trigger as a keyboard does: from the case before it, by Tab. */
async function tabTo(page, id) {
  await page.focus(trigger(id));
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  return page.evaluate((selector) => {
    const button = document.querySelector(selector);
    return document.activeElement === button && button.matches(':focus-visible');
  }, trigger(id));
}

describe('the published IconPicker trigger’s name in Chromium’s tree (issue 2899)', () => {
  it('names a captioned trigger by ariaLabel and its caption, once, and an icon-only one by ariaLabel alone', () =>
    inFixture('', async (page) => {
      const named = {};
      for (const id of ['captioned', 'holds', 'unlisted', 'narrow', 'icon-only']) {
        const { role, name, hasPopup, expanded } = await chromiumAxState(page, trigger(id));
        named[id] = { role, name, hasPopup, expanded };
      }
      const button = { role: 'button', hasPopup: 'dialog', expanded: false };
      assert.deepEqual(named, {
        captioned: { ...button, name: 'Reagent icon, Flask' },
        holds: { ...button, name: 'Reagent icon: Flask' },
        unlisted: { ...button, name: 'Icon, Premium Sigil Glyph' },
        narrow: { ...button, name: 'Faction icon, Wand Magic Sparkles' },
        'icon-only': { ...button, name: 'Reagent icon' },
      });
    }));

  it('holds each captioned trigger’s visible label in its name (WCAG 2.5.3)', () =>
    inFixture('', async (page) => {
      for (const id of ['captioned', 'holds', 'unlisted', 'narrow']) {
        const { name } = await chromiumAxState(page, trigger(id));
        // ratchet-exempt(lint): the rendered text is the visible label WCAG 2.5.3 compares
        const shown = await page.locator(trigger(id)).innerText();
        assert.ok(shown.trim().length > 0, `${id} draws a caption`);
        assert.ok(name.toLowerCase().includes(shown.trim().toLowerCase()), `${id}: "${shown}"`);
      }
      // ratchet-exempt(lint): as above, an icon-only trigger renders no text
      assert.equal((await page.locator(trigger('icon-only')).innerText()).trim(), '');
    }));
});

describe('the published IconPicker icon-only trigger, rendered (issue 2905)', () => {
  it('fits a narrow column whole, where the captioned trigger cuts its caption but names it whole', () =>
    inFixture('', async (page) => {
      const narrow = await triggerBox(page, 'narrow');
      assert.equal(narrow.cut, true, 'the caption is cut');
      assert.equal(narrow.title, 'Faction icon, Wand Magic Sparkles', 'and its tooltip is whole');
      const glyph = await triggerBox(page, 'icon-only-narrow');
      assert.equal(glyph.caption, null);
      assert.equal(glyph.overflows, false);
      assert.ok(glyph.width <= glyph.targetWidth, `${glyph.width}px in ${glyph.targetWidth}px`);
      assert.equal(glyph.title, 'Faction icon');
    }));

  it('is a square sized to its glyph’s tile, with no caret, a target of at least 24 by 24', () =>
    inFixture('', async (page) => {
      const glyph = await triggerBox(page, 'icon-only');
      const captioned = await triggerBox(page, 'captioned');
      assert.ok(glyph.width >= 24 && glyph.height >= 24, `${glyph.width}x${glyph.height}`);
      assert.equal(glyph.width, glyph.height, 'a square');
      assert.deepEqual(
        [glyph.caret, captioned.caret],
        [false, true],
        'a caret on the captioned one'
      );
      assert.equal(glyph.height, captioned.height, 'at the captioned trigger’s height');
      assert.equal(captioned.width, captioned.targetWidth, 'the captioned trigger fills target');
    }));

  it('draws the module ring under keyboard focus, on the captioned trigger’s fill and tile', () =>
    inFixture('', async (page) => {
      const rest = await paint(page, 'icon-only');
      assert.deepEqual(
        [rest.background, rest.tile, rest.glyph],
        [
          (await paint(page, 'captioned')).background,
          '28pxx28px',
          (await paint(page, 'captioned')).glyph,
        ]
      );
      assert.equal(await tabTo(page, 'icon-only'), true, 'keyboard focus');
      const focused = await paint(page, 'icon-only');
      assert.equal(focused.outline, 'solid 2px 2px');
      assert.equal(await tabTo(page, 'captioned'), true);
      assert.equal((await paint(page, 'captioned')).outlineColor, focused.outlineColor);
    }));

  it('keeps its edge, tile and ring under forced colours', () =>
    inFixture(
      '',
      async (page) => {
        const rest = await paint(page, 'icon-only');
        assert.equal(rest.border, 'solid 1px');
        assert.notEqual(rest.borderColor, rest.background, 'its edge is painted');
        assert.notEqual(rest.glyph, rest.background, 'its glyph is painted');
        assert.equal(rest.tile, '28pxx28px');
        assert.equal(await tabTo(page, 'icon-only'), true);
        const focused = await paint(page, 'icon-only');
        assert.equal(focused.outline, 'solid 2px 2px');
        assert.notEqual(focused.outlineColor, focused.background, 'its ring is painted');
      },
      { forcedColors: 'active' }
    ));

  it('opens, closes and returns focus as the captioned trigger does, its popup state unchanged', () =>
    inFixture('', async (page) => {
      const button = trigger('icon-only');
      await tabTo(page, 'icon-only');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.fabricate-icon-picker-popover input:focus');
      assert.deepEqual(
        [
          (await chromiumAxState(page, button)).expanded,
          await page.getAttribute(button, 'aria-haspopup'),
        ],
        [true, 'dialog']
      );
      await page.keyboard.press('Escape');
      await twoFrames(page);
      assert.equal(
        await page.evaluate((s) => document.activeElement === document.querySelector(s), button),
        true
      );
      assert.equal((await chromiumAxState(page, button)).expanded, false);

      await page.keyboard.press('Enter');
      await page.waitForSelector('.fabricate-icon-picker-popover input:focus');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await twoFrames(page);
      const after = await page.evaluate((s) => {
        const node = document.querySelector(s);
        return {
          focused: document.activeElement === node,
          glyph: node.querySelector(':scope .essence-icon-picker-preview i').className,
        };
      }, button);
      assert.equal(after.focused, true, 'a choice returns focus to the trigger');
      assert.notEqual(after.glyph, 'fas fa-flask', 'and the update draws the chosen glyph');
      const { name, expanded } = await chromiumAxState(page, button);
      assert.deepEqual([name, expanded], ['Reagent icon', false]);
    }));
});

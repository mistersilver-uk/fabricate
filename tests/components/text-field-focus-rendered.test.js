/*
 * The focused text field's four rendered contracts, measured in Chromium against core's own
 * input chrome: the caret box, the inset ring, the yielding placeholder and the lit wrapper.
 * Canonical text: `design-system/spec.md`, "Every interactive primitive declares its full state
 * set", the sentences beginning "A TEXT FIELD".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';

import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const rollPrompt = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/crafting/RollPrompt.svelte')
);

/** Core first, the module sheet in `layer(modules)`, a component's injected styles unlayered. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>${read('tests/fixtures/foundry-core-input-min.css')}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${rollPrompt.css}</style>
<style>:root{--font-primary:Arial,sans-serif}</style></head>
<body class="game"><div class="application theme-dark"><section class="window-content">
  <div class="fabricate fabricate-manager" data-fabricate-theme="dark" style="width:1040px">
    <i data-token="accent" style="color:var(--fab-accent)"></i>
    <i data-token="accent-border" style="color:var(--fab-accent-border)"></i>
    <span class="manager-recipe-option-search" data-case="option">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input type="text" placeholder="Search components" />
    </span>
    <span class="manager-recipe-option-search is-typing" data-case="typing">
      <input type="text" value="iron" />
    </span>
    <div class="manager-checks-formula-input" data-case="formula">
      <i class="fas fa-dice" aria-hidden="true"></i>
      <input placeholder="1d20 + @abilities.int.mod" />
    </div>
    <div data-case="scroller" style="overflow:auto;width:320px">
      <input type="text" placeholder="Bonus" style="display:block;width:100%;box-sizing:border-box" />
      <input type="checkbox" />
    </div>
    <div class="fabricate-roll-prompt ${rollPrompt.hashClass}" data-case="prompt">
      <label class="fabricate-field manager-field prompt-field bonus-field">
        <input type="text" name="situationalBonus" placeholder="+0" />
      </label>
    </div>
  </div>
</section></div></body></html>`;

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(PAGE, { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/**
 * Focus `selector` from the keyboard's side of the heuristic, measure, then blur and measure the
 * placeholder again.
 *
 * @param {string} selector the control to focus
 * @returns {Promise<object>} the computed figures of the control and its parent
 */
async function measureFocused(selector) {
  await page.keyboard.press('Tab');
  await page.focus(selector);
  const focused = await page.evaluate((target) => {
    const alphaOf = (colour) => {
      const parts = colour.match(/[\d.]+/g) ?? [];
      return /^rgba\(|\//.test(colour) ? Number(parts.at(-1)) : 1;
    };
    const px = (value) => Number.parseFloat(value) || 0;
    const input = document.querySelector(target);
    const wrapper = input.parentElement;
    const style = getComputedStyle(input);
    const wrapperStyle = getComputedStyle(wrapper);
    return {
      focusVisible: input.matches(':focus-visible'),
      inputHeight: input.getBoundingClientRect().height,
      lineHeight: px(style.lineHeight) || px(style.fontSize),
      wrapperContentHeight:
        wrapper.clientHeight - px(wrapperStyle.paddingTop) - px(wrapperStyle.paddingBottom),
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
      placeholderAlpha: alphaOf(getComputedStyle(input, '::placeholder').color),
      wrapperBorder: wrapperStyle.borderTopColor,
    };
  }, selector);
  const rested = await page.evaluate((target) => {
    const input = document.querySelector(target);
    input.blur();
    const colour = getComputedStyle(input, '::placeholder').color;
    const parts = colour.match(/[\d.]+/g) ?? [];
    return {
      placeholderAlpha: /^rgba\(|\//.test(colour) ? Number(parts.at(-1)) : 1,
      wrapperBorder: getComputedStyle(input.parentElement).borderTopColor,
    };
  }, selector);
  assert.equal(focused.focusVisible, true, `${selector} did not take keyboard focus`);
  return { focused, rested };
}

const token = (name) =>
  page.evaluate(
    (id) => getComputedStyle(document.querySelector(`[data-token="${id}"]`)).color,
    name
  );

for (const wrapper of ['option', 'formula']) {
  test(`the ${wrapper} field's empty caret box fills its wrapper and lights it`, async () => {
    const { focused, rested } = await measureFocused(`[data-case="${wrapper}"] input`);
    const accent = await token('accent');

    assert.ok(focused.wrapperContentHeight > 0, 'the wrapper computed no content box');
    assert.equal(
      focused.inputHeight,
      focused.wrapperContentHeight,
      'an input shorter than its wrapper clips the empty-field caret to a sliver'
    );
    assert.ok(
      focused.inputHeight >= focused.lineHeight,
      `the input is ${focused.inputHeight}px against a ${focused.lineHeight}px line`
    );

    assert.equal(focused.wrapperBorder, accent, 'the wrapper takes the accent on focus-within');
    assert.notEqual(rested.wrapperBorder, accent, 'the wrapper rests on the accent already');
    assert.equal(focused.outlineStyle, 'none', 'the input draws a second ring inside the wrapper');

    assert.equal(focused.placeholderAlpha, 0, 'the placeholder stays under the caret');
    assert.ok(rested.placeholderAlpha > 0, 'the placeholder does not return on blur');
  });
}

test('a typed-in option field rests on the partial accent, not the focus colour', async () => {
  const border = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-case="typing"]')).borderTopColor
  );
  assert.equal(border, await token('accent-border'));
  assert.notEqual(border, await token('accent'));
});

test('a text field rings inside its own box, and a checkbox keeps the outset ring', async () => {
  const text = await measureFocused('[data-case="scroller"] input[type="text"]');
  assert.deepEqual(
    [text.focused.outlineStyle, text.focused.outlineWidth, text.focused.outlineOffset],
    ['solid', '1px', '-1px']
  );
  assert.equal(text.focused.placeholderAlpha, 0, 'the placeholder stays under the caret');
  assert.ok(text.rested.placeholderAlpha > 0, 'the placeholder does not return on blur');

  const box = await measureFocused('[data-case="scroller"] input[type="checkbox"]');
  assert.deepEqual(
    [box.focused.outlineStyle, box.focused.outlineWidth, box.focused.outlineOffset],
    ['solid', '2px', '2px']
  );
});

test("the roll prompt's bonus field hides its own placeholder colour while focused", async () => {
  // The component's rule is injected unlayered, so it outranks the module's transparent
  // placeholder whatever its specificity; only its own selector can stand it down.
  const { focused, rested } = await measureFocused('[data-case="prompt"] input');
  assert.equal(focused.placeholderAlpha, 0, 'the caret sits on the placeholder');
  assert.ok(rested.placeholderAlpha > 0, 'the placeholder does not return on blur');
});

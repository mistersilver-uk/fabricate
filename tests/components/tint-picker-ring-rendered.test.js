/** Issue 2257 D3: the selected tint cell wears the inset ring, apart from the focus outline, in a browser. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PICKER = 'src/ui/svelte/components/TintPicker.svelte';
const sheet = readStylesheet();
const scoped = scopedComponentCss(resolve(repoRoot, PICKER));

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tint-picker-ring-rendered-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/managerColorTokens.js',
  ],
  compiledModules: [PICKER],
  componentPath: PICKER,
});

let browser;

/** The mounted palette's own DOM, under a themed root, with the sheet layered as Foundry loads it. */
async function open(props) {
  const target = await harness.mount(props);
  const markup = target.innerHTML;
  harness.remount();
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8">' +
      `<style>@layer modules { ${sheet} }</style><style>${scoped.css}</style></head>` +
      `<body><div class="fabricate" data-fabricate-theme="fabricate" style="position:relative">${markup}</div></body></html>`
  );
  return page;
}

/** Each cell's swatch `box-shadow` and button `outline-style`, keyed by token (`none` for the ninth). */
const paint = () =>
  Object.fromEntries(
    [...globalThis.document.querySelectorAll('.manager-color-preset')].map((cell) => [
      cell.dataset.managerColorToken ?? 'none',
      {
        ring: globalThis.getComputedStyle(cell.querySelector('.manager-color-swatch') ?? cell)
          .boxShadow,
        outline: globalThis.getComputedStyle(cell).outlineStyle,
      },
    ])
  );

describe('2257 TintPicker — the selected ring, rendered', () => {
  before(async () => {
    await harness.setup();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    harness.teardown();
  });

  it('only the pressed swatch draws the inset ring, and no cell is outlined at rest', async () => {
    const page = await open({ colorToken: 'rose', allowNone: true, onClear: () => {} });
    try {
      const cells = await page.evaluate(paint);
      assert.equal(Object.keys(cells).length, 9, 'eight presets and the No-colour cell rendered');
      const ringed = Object.entries(cells).filter(([, { ring }]) => ring !== 'none');
      assert.deepEqual(
        ringed.map(([token]) => token),
        ['rose'],
        'the pressed cell alone is ringed'
      );
      assert.match(cells.rose.ring, /^rgb\(32, 33, 36\) 0px 0px 0px 2px inset$/u);
      for (const [token, { outline }] of Object.entries(cells)) {
        assert.equal(outline, 'none', `${token} shows no focus outline at rest`);
      }
    } finally {
      await page.close();
    }
  });

  it('focus outlines the button outside the swatch and leaves the inset ring in place', async () => {
    const page = await open({ colorToken: 'rose' });
    try {
      await page.focus('[data-manager-color-token="rose"]');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const cell = globalThis.document.activeElement;
        const style = globalThis.getComputedStyle(cell);
        return {
          token: cell.dataset.managerColorToken,
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          ring: globalThis.getComputedStyle(cell.querySelector('.manager-color-swatch')).boxShadow,
        };
      });
      assert.equal(focused.token, 'rose');
      assert.equal(focused.outline, 'solid 2px', 'keyboard focus draws the outset outline');
      assert.match(focused.ring, /inset$/u, 'and the selected ring stays drawn inside the swatch');
    } finally {
      await page.close();
    }
  });

  it('the No-colour cell, when pressed, rings in the text ink', async () => {
    const page = await open({ colorToken: '', unset: true, allowNone: true, onClear: () => {} });
    try {
      const cells = await page.evaluate(paint);
      const ringed = Object.entries(cells).filter(([, { ring }]) => ring !== 'none');
      assert.deepEqual(
        ringed.map(([token]) => token),
        ['none']
      );
      assert.match(cells.none.ring, /^rgb\(241, 209, 181\) 0px 0px 0px 2px inset$/u);
    } finally {
      await page.close();
    }
  });
});

const BUTTON = 'src/ui/svelte/components/TintPickerButton.svelte';
const buttonHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tint-picker-button-rendered-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/managerColorTokens.js',
  ],
  compiledModules: [PICKER, BUTTON],
  componentPath: BUTTON,
});

/** A core-like `button` rule in a layer below the sheet's, as Foundry orders them. */
const CORE_BUTTON = '@layer core, modules; @layer core { button { transition: 0.5s; } }';

describe('the tint trigger and swatches, over a core button transition', () => {
  let chrome;
  let page;

  before(async () => {
    await buttonHarness.setup();
    chrome = await chromium.launch();
    const root = await buttonHarness.mount({ colorToken: 'rose' });
    root.querySelector('.manager-color-picker-trigger').click();
    await buttonHarness.setProps({});
    const markup = globalThis.document.body.innerHTML;
    page = await chrome.newPage({ viewport: { width: 400, height: 400 } });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${CORE_BUTTON}</style>` +
        `<style>@layer modules { ${sheet} }</style><style>${scoped.css}</style></head>` +
        `<body><div class="fabricate" data-fabricate-theme="fabricate">${markup}</div></body></html>`
    );
  });

  after(async () => {
    await chrome?.close();
    buttonHarness.teardown();
  });

  it('declares no transition on the trigger or any swatch cell', async () => {
    const durations = await page.evaluate(() =>
      [
        ...globalThis.document.querySelectorAll(
          '.manager-color-picker-trigger, .manager-color-preset'
        ),
      ].map((cell) => globalThis.getComputedStyle(cell).transitionDuration)
    );
    assert.ok(
      durations.length >= 9,
      `the trigger and eight swatches rendered: ${durations.length}`
    );
    assert.deepEqual(new Set(durations), new Set(['0s']));
  });
});

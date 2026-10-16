/** Issues 2257 D3 and 2416: the tint cell's selected ring, keyboard cursor and hover outline, in a browser. */
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

const cell = (token) => `[data-manager-color-picker-popover] [data-manager-color-token="${token}"]`;

/** One control's pseudo-class state and computed paint, read in the page. */
const stateOf = (selector) => {
  const control = globalThis.document.querySelector(selector);
  const style = globalThis.getComputedStyle(control);
  const swatch = control.querySelector('.manager-color-swatch');
  const fill = swatch ? globalThis.getComputedStyle(swatch) : null;
  const outer = control.getBoundingClientRect();
  const inner = swatch?.getBoundingClientRect() ?? outer;
  return {
    focusVisible: control.matches(':focus-visible'),
    hover: control.matches(':hover'),
    outline: `${style.outlineStyle} ${style.outlineWidth}`,
    offset: style.outlineOffset,
    ink: style.outlineColor,
    cellFill: style.backgroundColor,
    swatchFill: fill?.backgroundColor,
    ring: fill?.boxShadow,
    inset: [
      inner.top - outer.top,
      inner.left - outer.left,
      outer.right - inner.right,
      outer.bottom - inner.bottom,
    ],
  };
};

/** Moves keyboard focus one stop on from `from`, so `:focus-visible` is the browser's own. */
async function tabFrom(page, from) {
  await page.focus(from);
  await page.keyboard.press('Tab');
}

/** The control is under keyboard focus and draws the 2px outline at `offset`. */
function assertFocusOutline(state, offset, message) {
  assert.ok(state.focusVisible, 'the control is not under keyboard focus');
  assert.equal(state.outline, 'solid 2px');
  assert.equal(state.offset, offset, message);
}

const INSET = "the keyboard cursor is the picker's inset outline";

describe('TintPicker — the selected ring and the keyboard cursor, rendered', () => {
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

  it('draws the keyboard cursor inset on a cell that is not selected, and no ring', async () => {
    const page = await open({ colorToken: 'rose' });
    try {
      await tabFrom(page, cell('sage'));
      const mist = await page.evaluate(stateOf, cell('mist'));
      assertFocusOutline(mist, '-2px', INSET);
      assert.equal(mist.ring, 'none', 'a cell that is not selected draws no ring');
    } finally {
      await page.close();
    }
  });

  it('draws the cursor and the selected ring whole on one cell, in two inks', async () => {
    const page = await open({ colorToken: 'rose' });
    try {
      await tabFrom(page, cell('lavender'));
      const rose = await page.evaluate(stateOf, cell('rose'));
      assertFocusOutline(rose, '-2px', INSET);
      const ring = rose.ring.match(/^(rgb\([^)]+\)) 0px 0px 0px 2px inset$/u);
      assert.ok(ring, `the selected ring is not a 2px inset ring: ${rose.ring}`);
      assert.notEqual(rose.ink, ring[1], 'the cursor and the selected ring share one ink');
      assert.ok(
        Math.min(...rose.inset) >= 3,
        `the swatch sits ${rose.inset.join(', ')}px inside its cell, so the 2px cursor reaches its ring`
      );
    } finally {
      await page.close();
    }
  });

  it('draws the same inset cursor on the inline strip', async () => {
    const page = await open({ colorToken: 'rose', layout: 'inline' });
    try {
      assert.ok(await page.locator('[data-manager-color-layout="inline"].is-inline').count());
      await tabFrom(page, cell('sage'));
      const mist = await page.evaluate(stateOf, cell('mist'));
      assertFocusOutline(mist, '-2px', INSET);
      assert.equal(mist.ring, 'none');
      assert.ok(
        Math.min(...mist.inset) >= 3,
        `the inline swatch sits ${mist.inset.join(', ')}px inside its cell, so the 2px cursor reaches it`
      );
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

/** Core-like `button` rules in a layer below the sheet's, as Foundry orders them. */
const CORE_BUTTON =
  '@layer core, modules; @layer core { button { transition: 0.5s; } ' +
  'button:hover { background: rgb(1, 2, 3); } }';

/** The host clips its overflow, so it stands at a window's height rather than the trigger's. */
const HOST_HEIGHT = '.fabricate-manager { height: 360px; }';

const TRIGGER = '.fabricate-color-picker .manager-color-picker-trigger';

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
      `<!doctype html><html><head><meta charset="utf-8"><style>${CORE_BUTTON}${HOST_HEIGHT}</style>` +
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

  /** Parks the pointer off the grid and drops focus, so a case starts from rest on this page. */
  async function settle() {
    await page.mouse.move(399, 399);
    await page.evaluate(() => globalThis.document.activeElement?.blur());
  }

  async function pointAt(selector) {
    const box = await page.locator(selector).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }

  it('hovers a swatch with its outset outline alone, never a fill (ruling 2026-10-11)', async () => {
    await settle();
    const rest = await page.evaluate(stateOf, cell('sage'));
    assert.deepEqual([rest.hover, rest.focusVisible], [false, false], 'sage starts at rest');
    assert.match(rest.outline, /^none /u);
    await pointAt(cell('sage'));
    const hovered = await page.evaluate(stateOf, cell('sage'));
    assert.deepEqual([hovered.hover, hovered.focusVisible], [true, false], 'sage is hovered alone');
    assert.equal(hovered.outline, 'solid 2px');
    assert.equal(hovered.offset, '1px', 'pointer hover keeps the outset ring');
    assert.deepEqual(
      [hovered.cellFill, hovered.swatchFill],
      [rest.cellFill, rest.swatchFill],
      'hover changed a fill'
    );
  });

  it('keeps the inset cursor on a keyboard-focused swatch under the pointer', async () => {
    await settle();
    await tabFrom(page, cell('sage'));
    await pointAt(cell('mist'));
    const mist = await page.evaluate(stateOf, cell('mist'));
    assert.ok(mist.hover, 'the pointer is not over the focused cell');
    assertFocusOutline(mist, '-2px', 'the cursor outranks hover');
  });

  it('leaves the trigger its outset ring under keyboard focus', async () => {
    await settle();
    await page.focus(TRIGGER);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const trigger = await page.evaluate(stateOf, TRIGGER);
    assert.ok(!trigger.hover, 'the pointer is over the trigger, so hover could draw its ring');
    assertFocusOutline(trigger, '1px', 'the trigger opens a panel and is not a cell in the grid');
  });
});

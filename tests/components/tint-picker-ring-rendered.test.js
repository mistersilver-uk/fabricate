/**
 * Issues 2257 D3, 2416 and 2459: the tint swatch's selected ring, keyboard cursor and hover
 * outline, in a browser — on the popover's square tiles and on the inline strip's cells.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PICKER = 'src/ui/svelte/components/TintPicker.svelte';
const sheet = readStylesheet();
// `SearchablePopover` itself has no scoped block; its panel's is the one the tiles sit under.
const scoped = [PICKER, 'src/ui/svelte/components/SearchablePopoverPanel.svelte']
  .map((path) => scopedComponentCss(resolve(repoRoot, path)).css)
  .join('\n');

const RAW_MODULES = [
  ...SEARCHABLE_POPOVER_RAW_MODULES,
  ...LOCALIZE_OR_RAW_MODULES,
  'src/ui/svelte/util/managerColorTokens.js',
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tint-picker-ring-rendered-',
  rawModules: RAW_MODULES,
  compiledModules: [...SEARCHABLE_POPOVER_COMPILED_MODULES, PICKER],
  componentPath: PICKER,
});

let browser;

const PANEL = '.fabricate-color-picker-popover.fabricate-picker-popover';

/** Core-like `button` rules in a layer below the sheet's, as Foundry orders them. */
const CORE_BUTTON =
  '@layer core, modules; @layer core { button { transition: 0.5s; } ' +
  'button:hover { background: rgb(1, 2, 3); } }';

/** Presses `keys` on the open panel's query, in happy-dom, so the cursor is serialized with it. */
async function pressOnQuery(keys) {
  for (const key of keys) {
    globalThis.document
      .querySelector(`${PANEL} input[role="combobox"]`)
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await harness.setProps({});
  }
}

/**
 * The mounted palette's own DOM, under a themed root, with the sheet layered as Foundry loads it.
 * A popover mount opens from an anchor inside its own application root and is serialized from it.
 */
async function open(props, keys = [], coreCss = '') {
  let markup;
  if (props.layout === 'inline') {
    markup = (await harness.mount(props)).innerHTML;
  } else {
    const host = globalThis.document.createElement('div');
    host.className = 'fabricate-manager';
    const anchor = globalThis.document.createElement('button');
    host.append(anchor);
    globalThis.document.body.append(host);
    await harness.mount({ anchor: () => anchor, open: true, ...props });
    await pressOnQuery(keys);
    markup = host.innerHTML;
    host.remove();
  }
  harness.remount();
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${coreCss}</style>` +
      `<style>@layer modules { ${sheet} }</style><style>${scoped}</style></head>` +
      `<body><div class="fabricate" data-fabricate-theme="fabricate" style="position:relative">${markup}</div></body></html>`
  );
  await placePanel(page);
  return page;
}

/** Stands the serialized panel below its anchor at a 16px inset, as `anchoredPopover` would. */
async function placePanel(page) {
  await page.evaluate((panel) => {
    globalThis.document
      .querySelector(panel)
      ?.setAttribute('style', 'left: 16px; right: auto; top: 44px; bottom: auto;');
  }, PANEL);
}

/** Each swatch's `box-shadow` and its cell's `outline-style`, keyed by token (`none` for the ninth). */
const paint = (cells) =>
  Object.fromEntries(
    [...globalThis.document.querySelectorAll(cells)].map((cell) => [
      cell.dataset.managerColorToken ?? 'none',
      {
        ring: globalThis.getComputedStyle(cell.querySelector('.manager-color-swatch') ?? cell)
          .boxShadow,
        outline: globalThis.getComputedStyle(cell).outlineStyle,
      },
    ])
  );

const TILES = `${PANEL} [role="option"]`;
const STRIP_CELLS = '[data-manager-color-layout="inline"] .manager-color-preset';
const tile = (token) => `${PANEL} [data-manager-color-token="${token}"]`;
const stripCell = (token) =>
  `[data-manager-color-layout="inline"] [data-manager-color-token="${token}"]`;

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
    active: control.dataset.activeOption === 'true',
    outline: `${style.outlineStyle} ${style.outlineWidth}`,
    offset: style.outlineOffset,
    ink: style.outlineColor,
    cellFill: style.backgroundColor,
    swatchFill: fill?.backgroundColor,
    ring: fill?.boxShadow,
    swatchSize: [inner.width, inner.height],
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

/** The tile carries the picker's cursor and draws it as the 2px inset outline. */
function assertCursor(state, message) {
  assert.ok(state.active, 'the tile is not the active option');
  assert.equal(state.outline, 'solid 2px');
  assert.equal(state.offset, '-2px', message);
}

const INSET = "the keyboard cursor is the picker's inset outline";

async function pointAt(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

describe('TintPicker — the selected ring and the keyboard cursor, rendered', () => {
  before(async () => {
    await harness.setup();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    harness.teardown();
  });

  it('only the selected tile draws the inset ring, and no tile is outlined at rest', async () => {
    const page = await open({ colorToken: 'rose' });
    try {
      const tiles = await page.evaluate(paint, TILES);
      assert.equal(Object.keys(tiles).length, 8, 'the eight presets rendered as tiles');
      const ringed = Object.entries(tiles).filter(([, { ring }]) => ring !== 'none');
      assert.deepEqual(
        ringed.map(([token]) => token),
        ['rose'],
        'the selected tile alone is ringed'
      );
      assert.match(tiles.rose.ring, /^rgb\(32, 33, 36\) 0px 0px 0px 2px inset$/u);
      for (const [token, { outline }] of Object.entries(tiles)) {
        assert.equal(outline, 'none', `${token} shows no outline at rest`);
      }
    } finally {
      await page.close();
    }
  });

  it('draws the cursor inset on a tile that is not selected, and no ring', async () => {
    const page = await open({ colorToken: 'rose' }, ['ArrowDown', 'ArrowRight']);
    try {
      const mist = await page.evaluate(stateOf, tile('mist'));
      assertCursor(mist, INSET);
      assert.equal(mist.ring, 'none', 'a tile that is not selected draws no ring');
    } finally {
      await page.close();
    }
  });

  it('draws the cursor and the selected ring whole on one tile, in two inks', async () => {
    const page = await open({ colorToken: 'mist' }, ['ArrowDown', 'ArrowRight']);
    try {
      const mist = await page.evaluate(stateOf, tile('mist'));
      assertCursor(mist, INSET);
      const ring = mist.ring.match(/^(rgb\([^)]+\)) 0px 0px 0px 2px inset$/u);
      assert.ok(ring, `the selected ring is not a 2px inset ring: ${mist.ring}`);
      assert.notEqual(mist.ink, ring[1], 'the cursor and the selected ring share one ink');
      assert.ok(
        Math.min(...mist.inset) >= 3,
        `the swatch sits ${mist.inset.join(', ')}px inside its tile, so the 2px cursor reaches its ring`
      );
      assert.ok(Math.min(...mist.swatchSize) > 30, `the swatch fills its tile: ${mist.swatchSize}`);
    } finally {
      await page.close();
    }
  });

  it('keeps the selected tile on the soft ground, at rest and under hover', async () => {
    const page = await open({ colorToken: 'rose' });
    try {
      const sage = await page.evaluate(stateOf, tile('sage'));
      const rest = await page.evaluate(stateOf, tile('rose'));
      assert.equal(rest.cellFill, sage.cellFill, 'the selected tile keeps the tile ground');
      await pointAt(page, tile('rose'));
      const hovered = await page.evaluate(stateOf, tile('rose'));
      assert.ok(hovered.hover, 'the pointer is over the selected tile');
      assert.equal(hovered.cellFill, sage.cellFill, 'hover leaves the selected tile on soft');
      assert.deepEqual([hovered.outline, hovered.offset], ['solid 2px', '1px'], 'hover rings');
    } finally {
      await page.close();
    }
  });

  it('draws the same inset cursor on the inline strip', async () => {
    const page = await open({ colorToken: 'rose', layout: 'inline' });
    try {
      assert.ok(await page.locator('[data-manager-color-layout="inline"].is-inline').count());
      await tabFrom(page, stripCell('sage'));
      const mist = await page.evaluate(stateOf, stripCell('mist'));
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

  it("declares no transition on the strip's cells over a core button transition", async () => {
    const page = await open({ colorToken: 'rose', layout: 'inline' }, [], CORE_BUTTON);
    try {
      const durations = await page.evaluate(
        (cells) =>
          [...globalThis.document.querySelectorAll(cells)].map(
            (cell) => globalThis.getComputedStyle(cell).transitionDuration
          ),
        STRIP_CELLS
      );
      assert.equal(durations.length, 8, 'eight strip cells rendered');
      assert.deepEqual(new Set(durations), new Set(['0s']));
    } finally {
      await page.close();
    }
  });

  it("keeps the strip's inset cursor on a keyboard-focused cell under the pointer", async () => {
    const page = await open({ colorToken: 'rose', layout: 'inline' }, [], CORE_BUTTON);
    try {
      await tabFrom(page, stripCell('sage'));
      await pointAt(page, stripCell('mist'));
      const mist = await page.evaluate(stateOf, stripCell('mist'));
      assert.ok(mist.hover, 'the pointer is not over the focused cell');
      assertFocusOutline(mist, '-2px', 'the cursor outranks hover');
    } finally {
      await page.close();
    }
  });

  it("the strip's pressed cell alone rings, and no cell is outlined at rest", async () => {
    const page = await open({
      colorToken: 'rose',
      layout: 'inline',
      allowNone: true,
      onClear: () => {},
    });
    try {
      const cells = await page.evaluate(paint, STRIP_CELLS);
      assert.equal(Object.keys(cells).length, 9, 'eight presets and the No-colour cell rendered');
      const ringed = Object.entries(cells).filter(([, { ring }]) => ring !== 'none');
      assert.deepEqual(
        ringed.map(([token]) => token),
        ['rose']
      );
      for (const [token, { outline }] of Object.entries(cells)) {
        assert.equal(outline, 'none', `${token} shows no focus outline at rest`);
      }
    } finally {
      await page.close();
    }
  });

  it("the strip's No-colour cell, when pressed, rings in the text ink", async () => {
    const page = await open({
      colorToken: '',
      layout: 'inline',
      unset: true,
      allowNone: true,
      onClear: () => {},
    });
    try {
      const cells = await page.evaluate(paint, STRIP_CELLS);
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
  rawModules: RAW_MODULES,
  compiledModules: [...SEARCHABLE_POPOVER_COMPILED_MODULES, PICKER, BUTTON],
  componentPath: BUTTON,
});

/** The host clips its overflow, so it stands at a window's height rather than the trigger's. */
const HOST_HEIGHT = '.fabricate-manager { height: 360px; }';

const TRIGGER = '.fabricate-color-picker .manager-color-picker-trigger';

describe('the tint trigger and tiles, over a core button transition', () => {
  let chrome;
  let page;

  before(async () => {
    await buttonHarness.setup();
    chrome = await chromium.launch();
    const root = await buttonHarness.mount({ colorToken: 'rose', ariaLabel: 'New biome colour' });
    root.querySelector('.manager-color-picker-trigger').click();
    await buttonHarness.setProps({});
    // The cursor on Mist, by the keys a GM presses in the query.
    for (const key of ['ArrowDown', 'ArrowRight']) {
      globalThis.document
        .querySelector(`${PANEL} input[role="combobox"]`)
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await buttonHarness.setProps({});
    }
    const markup = globalThis.document.body.innerHTML;
    page = await chrome.newPage({ viewport: { width: 400, height: 400 } });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${CORE_BUTTON}${HOST_HEIGHT}</style>` +
        `<style>@layer modules { ${sheet} }</style><style>${scoped}</style></head>` +
        `<body><div class="fabricate" data-fabricate-theme="fabricate">${markup}</div></body></html>`
    );
    await placePanel(page);
  });

  after(async () => {
    await chrome?.close();
    buttonHarness.teardown();
  });

  it('declares no transition on the trigger or any tile', async () => {
    const durations = await page.evaluate(
      (tiles) =>
        [...globalThis.document.querySelectorAll(`.manager-color-picker-trigger, ${tiles}`)].map(
          (cell) => globalThis.getComputedStyle(cell).transitionDuration
        ),
      TILES
    );
    assert.equal(durations.length, 9, 'the trigger and eight tiles rendered');
    assert.deepEqual(new Set(durations), new Set(['0s']));
  });

  /** Parks the pointer off the grid and drops focus, so a case starts from rest on this page. */
  async function settle() {
    await page.mouse.move(399, 399);
    await page.evaluate(() => globalThis.document.activeElement?.blur());
  }

  it('hovers a tile with its outset outline alone, never a fill (ruling 2026-10-11)', async () => {
    await settle();
    const rest = await page.evaluate(stateOf, tile('sage'));
    assert.deepEqual([rest.hover, rest.active], [false, false], 'sage starts at rest');
    assert.match(rest.outline, /^none /u);
    await pointAt(page, tile('sage'));
    const hovered = await page.evaluate(stateOf, tile('sage'));
    assert.ok(hovered.hover, 'sage is hovered');
    assert.equal(hovered.outline, 'solid 2px');
    assert.equal(hovered.offset, '1px', 'pointer hover keeps the outset ring');
    assert.deepEqual(
      [hovered.cellFill, hovered.swatchFill],
      [rest.cellFill, rest.swatchFill],
      'hover changed a fill'
    );
  });

  it('keeps the inset cursor on the active tile under the pointer', async () => {
    await settle();
    await pointAt(page, tile('mist'));
    const mist = await page.evaluate(stateOf, tile('mist'));
    assert.ok(mist.hover, 'the pointer is not over the active tile');
    assertCursor(mist, 'the cursor outranks hover');
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

/**
 * Issue 2893: the published `Select` trigger marks keyboard focus with the accent ring every
 * published control draws, 2px wide and 2px clear in the accent, beside the accent edge it already
 * took, at all three sizes and in the read-only and invalid shapes, in all seven palettes. The ring
 * reaches 4px past the trigger, so a container with 4px of padding shows it whole and one with
 * 2px of padding clips all of it, because the ring starts 2px out. A pointer press draws none, and
 * forced colours keep a ring in a system colour apart from the ground. The ring's contrast against
 * the four grounds and each rung's and the invalid shape's own fill is read off the sheet, because
 * a frame shows one palette only.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { defineAccentRingContrast } from '../helpers/accentRingContrast.js';
import { pixelAt } from '../helpers/pagePixels.js';
import { chromium } from '../helpers/playwrightChromium.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { declaredToken } from '../helpers/themePaletteContrast.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-select-focus-ring-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

const OPTIONS = [{ value: 'a', label: 'Alpha' }];
const SIZES = ['form', 'inline', 'toolbar'];
/** The shapes that draw the same trigger as the form size, set on it by attribute. */
const SHAPES = Object.freeze({
  readonly: 'aria-disabled',
  invalid: 'aria-invalid',
});
const THEMES = Object.freeze([
  'fabricate',
  'mythwright',
  'ironblood-forge',
  'hearth-herb',
  'starglass-arcana',
  'foundry-native',
  'sovereign',
]);
const SHEET = 'styles/fabricate.css';
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
/** The selector of each fill the trigger paints: a rung's own, and the invalid shape's. */
const FILL_RULES = Object.freeze({
  form: '.fabricate-select .fabricate-select-trigger-form',
  inline: '.fabricate-select .fabricate-select-trigger-inline',
  toolbar: '.fabricate-select .fabricate-select-trigger-toolbar',
  invalid: ".fabricate-select-trigger[aria-invalid='true']",
});

let browser;
let tab;

before(async () => {
  const shells = [];
  const cells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const size of SIZES) {
      const target = companionTarget(shells);
      const handle = ui.mount('Select', {
        target,
        props: { options: OPTIONS, ariaLabel: `${size} select`, size, onChange() {} },
      });
      await settle();
      cells.push([size, target.innerHTML]);
      if (size === 'form') {
        for (const [shape, attribute] of Object.entries(SHAPES)) {
          cells.push([shape, target.innerHTML.replace('<button', `<button ${attribute}="true"`)]);
        }
      }
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 500, height: 900 } });
  const clip = (padding) =>
    `<div data-clip="${padding}" style="overflow:hidden;width:max-content;padding:${padding}px;` +
    `background:var(--fab-bg-1)">${cells[0][1]}</div>`;
  await tab.setContent(
    `${renderedPageHead([])}<body class="game">` +
      '<div id="stage" class="fabricate fabricate-app" data-fabricate-theme="fabricate" ' +
      'style="background:var(--fab-bg-1);padding:12px">' +
      '<button data-before>Before</button>' +
      cells
        .map(
          ([id, html]) => `<div data-case="${id}" style="width:240px;margin:12px 0">${html}</div>`
        )
        .join('') +
      `${clip(4)}${clip(2)}` +
      '<i data-system style="color:CanvasText;background:Canvas"></i></div></body></html>',
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const triggerOf = (id) => `[data-case="${id}"] .fabricate-select-trigger`;
const CLIPPED = (padding) => `[data-clip="${padding}"] .fabricate-select-trigger`;

/** Tab from the first button until `selector` holds focus, so it has it by keyboard. */
async function keyFocusOn(selector) {
  await tab.focus('[data-before]');
  for (let press = 0; press < 12; press += 1) {
    await tab.keyboard.press('Tab');
    if (await tab.evaluate((css) => document.activeElement?.matches(css), selector)) return;
  }
  assert.fail(`Tab never reached ${selector}`);
}

const keyFocus = (id) => keyFocusOn(triggerOf(id));

/** The pixel 3px out from each side of `selector`'s box, mid-edge: the centre of a 2px-clear 2px ring. */
async function ringPixels(selector) {
  const { x, y, width, height } = await tab.$eval(selector, (node) => {
    const { left, top, width, height } = node.getBoundingClientRect();
    return { x: Math.round(left), y: Math.round(top), width, height };
  });
  const [midX, midY] = [Math.round(x + width / 2), Math.round(y + height / 2)];
  return {
    top: await pixelAt(tab, midX, y - 3),
    left: await pixelAt(tab, x - 3, midY),
    right: await pixelAt(tab, Math.round(x + width) + 2, midY),
    bottom: await pixelAt(tab, midX, Math.round(y + height) + 2),
  };
}

const ringOf = (id) =>
  tab.$eval(triggerOf(id), (trigger) => {
    const style = getComputedStyle(trigger);
    return {
      outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
      edge: style.borderTopColor,
    };
  });

/** The computed colour a probe resolves `value` to under the stage's current palette. */
const resolved = (property, value) =>
  tab.evaluate(
    ([name, given]) => {
      const probe = document.createElement('span');
      probe.style.setProperty(name, given);
      document.querySelector('#stage').append(probe);
      const computed = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return computed;
    },
    [property, value]
  );

describe('the published Select trigger in Chromium', () => {
  for (const theme of THEMES) {
    it(`rings a keyboard-focused trigger in the accent at every size and shape, in ${theme}`, async () => {
      await tab.evaluate((name) => {
        document.querySelector('#stage').dataset.fabricateTheme = name;
      }, theme);
      const accent = await resolved('color', 'var(--fab-accent)');
      const accentEdge = await resolved('color', 'var(--fab-accent-border)');
      for (const id of [...SIZES, ...Object.keys(SHAPES)]) {
        assert.equal((await ringOf(id)).outline[0], 'none', `${id}: no ring without focus`);
        await keyFocus(id);
        const { outline, edge } = await ringOf(id);
        assert.deepEqual(outline, ['solid', '2px', '2px', accent], `${id} ring`);
        assert.equal(edge, accentEdge, `${id}: the accent edge is kept beside the ring`);
      }
    });
  }

  it('draws no ring for a pointer press', async () => {
    await tab.evaluate(() => document.activeElement?.blur());
    await tab.click(triggerOf('form'));
    assert.equal(
      await tab.evaluate(() => document.activeElement?.closest('[data-case]')?.dataset.case),
      'form'
    );
    assert.equal((await ringOf('form')).outline[0], 'none');
  });

  it('shows the whole ring inside 4px of padding and none of it inside 2px', async () => {
    const accent = (await resolved('color', 'var(--fab-accent)')).match(/\d+/gu).map(Number);
    await keyFocusOn(CLIPPED(4));
    for (const [side, value] of Object.entries(await ringPixels(CLIPPED(4)))) {
      assert.deepEqual(value, accent, `${side}: the ring is whole inside 4px of padding`);
    }
    await keyFocusOn(CLIPPED(2));
    const cut = await ringPixels(CLIPPED(2));
    for (const [side, value] of Object.entries(cut)) {
      assert.notDeepEqual(value, accent, `${side}: 2px of padding clips the whole ring`);
    }
  });

  it('keeps a ring in a colour apart from the ground under forced colours', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const canvas = await tab.$eval('[data-system]', (probe) =>
        [...getComputedStyle(probe).backgroundColor.matchAll(/\d+/gu)].map((digits) => +digits[0])
      );
      for (const id of [...SIZES, ...Object.keys(SHAPES)]) {
        await keyFocus(id);
        assert.deepEqual((await ringOf(id)).outline.slice(0, 3), ['solid', '2px', '2px'], id);
        for (const [side, value] of Object.entries(await ringPixels(triggerOf(id)))) {
          assert.notDeepEqual(value, canvas, `${id} ${side}: the ring is not the ground`);
        }
      }
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});

describe('the Select trigger ring’s contrast, read off the sheet', () => {
  const selectRules = rulesIn(collectStyleCorpus()[SHEET]);
  const fills = Object.values(FILL_RULES).map((selector) =>
    declaredToken(selectRules, selector, 'background', SHEET)
  );

  defineAccentRingContrast('.fabricate-select .fabricate-select-trigger:focus-visible', {
    stacks: [...new Set(fills)].flatMap((fill) => GROUNDS.map((ground) => [fill, ground])),
  });
});

/**
 * Issue 2836 — the published `SelectionCheckbox`, measured in Chromium on the markup the seam
 * draws, under the component's scoped styles: the 16, 20 and 22px boxes, a 16px label line whose
 * first line the box centres on, a label that keeps its words in a min-content cell, the 24px
 * pointer target and the label inside it, the hover edge, the dimmed disabled box, the keyboard
 * ring, the role and name Chromium's own tree gives the input, and under forced colours, in the
 * dark and the light palette, a tick, a dash and an empty box that differ pixel for pixel,
 * enabled and disabled, the `contents` form's disabled box included.
 * Limit: the page writes `checked` and `indeterminate` itself, so the tree's state is the native
 * input's mapping and the controlled press is not exercised here.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chromiumAxState } from '../helpers/chromiumAxNode.js';
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
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-selection-checkbox-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SelectionCheckbox.svelte',
});

const LABEL = 'Award the recipe’s ingredients first';
const LONG =
  'Add the duration of the recipe’s every stage to this activity, so the downtime it asks for grows with the recipe';
/** Each case's id and the props its box takes, `onChange` aside. */
const CASES = Object.freeze([
  ['off', { checked: false, label: LABEL }],
  ['on', { checked: true, label: LABEL }],
  ['on-twin', { checked: true, label: LABEL }],
  ['mixed', { checked: false, indeterminate: true, label: LABEL }],
  ['compact', { checked: true, density: 'compact', label: 'Spent' }],
  ['comfortable', { checked: false, density: 'comfortable', label: 'Spent' }],
  ['disabled', { checked: true, disabled: true, label: 'Advance to step' }],
  [
    'disabled-mixed',
    { indeterminate: true, checked: false, disabled: true, label: 'Advance to step' },
  ],
  ['disabled-off', { checked: false, disabled: true, label: 'Advance to step' }],
  ['long', { checked: false, density: 'compact', label: LONG }],
  ['named', { checked: true, ariaLabel: 'Select Iron ore' }],
  [
    'renamed',
    { checked: false, label: 'Spent', ariaLabel: 'Ember salt spent when this stage begins' },
  ],
]);

/** A labelled box in a table cell and a min-content grid column, where a long word sets the width. */
const MIN_CONTENT = (html) =>
  `<table data-host="table"><tr><td>${html}</td><td>A neighbouring column</td></tr></table>` +
  `<div data-host="grid" style="display:grid;grid-template-columns:min-content 1fr">${html}<span>x</span></div>`;

let browser;
let tab;

before(async () => {
  const shells = [];
  const cells = [];
  const widths = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const [id, props] of CASES) {
      const target = companionTarget(shells);
      const handle = ui.mount('SelectionCheckbox', {
        target,
        props: { ...props, onChange() {} },
      });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      if (id === 'off') widths.push(MIN_CONTENT(target.innerHTML));
      handle.destroy();
    }
    // The bare form is not published; an in-app caller's own `<label>` hosts it.
    const bare = await harness.mount({
      wrapper: 'contents',
      density: 'compact',
      checked: true,
      disabled: true,
      ariaLabel: 'Use the modifier',
    });
    cells.push(`<label data-case="contents">${bare.innerHTML}</label>`, ...widths);
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 700 } });
  // `checked` and `indeterminate` are properties, which `innerHTML` does not carry, so the page
  // sets each from the box the seam drew beside its input.
  await tab.setContent(
    `${renderedPageHead(['SelectionCheckbox'])}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1);padding:8px">' +
      // Font Awesome is not loaded, so a check mark and a dash stand in for the glyphs.
      String.raw`<style>[data-case]{display:flex;width:260px;margin-bottom:12px} .fa-check::before{content:"\2713"} .fa-minus::before{content:"\2212"}</style>` +
      `<button data-before>Before</button>${cells.join('')}` +
      '<i data-system style="color:CanvasText;background:Highlight;border:1px solid GrayText;outline:1px solid HighlightText"></i></div>' +
      `<script>for (const box of document.querySelectorAll('.fab-selection-check')) {
        const input = box.parentElement.querySelector('input');
        input.checked = box.classList.contains('is-checked');
        input.indeterminate = box.classList.contains('is-indeterminate');
      }</script></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const boxOf = (id) => `[data-case="${id}"] .fab-selection-check`;
const inputOf = (id) => `[data-case="${id}"] input`;

/** A case's box, label and wrapper boxes, and the box's computed paint. */
const drawn = (id) =>
  tab.$eval(boxOf(id), (box) => {
    const rect = (node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    const style = getComputedStyle(box);
    const label = box.parentElement.querySelector('.fab-selection-label');
    return {
      box: rect(box),
      label: label ? rect(label) : null,
      wrapper: rect(box.parentElement),
      lineHeight: label ? parseFloat(getComputedStyle(label).lineHeight) : null,
      ink: label ? getComputedStyle(label).color : null,
      fill: style.backgroundColor,
      edge: style.borderTopColor,
      glyph: getComputedStyle(box.querySelector('i')).visibility,
      glyphInk: getComputedStyle(box.querySelector('i')).color,
      glyphAdjust: getComputedStyle(box.querySelector('i')).forcedColorAdjust,
      opacity: style.opacity,
      padTop: label ? parseFloat(getComputedStyle(label).paddingTop) : null,
      outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
    };
  });

/** The computed colour of `property` on a probe span styled `value` inside the themed root. */
const resolved = (property, value) =>
  tab.evaluate(
    ([name, given]) => {
      const probe = document.createElement('span');
      probe.style.setProperty(name, given);
      document.querySelector('.fabricate').append(probe);
      const computed = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return computed;
    },
    [property, value]
  );

describe('the published SelectionCheckbox in Chromium', () => {
  it('draws the 16, 20 and 22px boxes, each centred on its label’s first line of 16 or 18px', async () => {
    for (const [id, side, line] of [
      ['compact', 16, 16],
      ['off', 20, 16],
      ['comfortable', 22, 18],
    ]) {
      const { box, label, lineHeight, padTop } = await drawn(id);
      assert.deepEqual([box.width, box.height], [side, side], id);
      assert.equal(lineHeight, line, `${id} label line`);
      const firstLine = label.y + padTop + line / 2;
      assert.ok(Math.abs(box.y + side / 2 - firstLine) <= 0.5, `${id} box centred on line one`);
    }
  });

  it('wraps a long label beside the box, which stays on its first line inside the target', async () => {
    const { box, label, wrapper, lineHeight } = await drawn('long');
    assert.ok(label.height >= 3 * lineHeight, `three lines or more: ${label.height}`);
    assert.equal(label.y, box.y, 'the compact box sits on the first line, which is its height');
    assert.ok(label.x >= box.x + box.width + 8, 'the label starts past the box and its gap');
    const target = await tab.$eval(
      '[data-case="long"]',
      (cell) => cell.getBoundingClientRect().right
    );
    assert.ok(wrapper.x + wrapper.width <= target + 0.5, 'the wrapper stays inside its target');
  });

  it('keeps whole words in a table cell and a min-content grid column', async () => {
    for (const host of ['table', 'grid']) {
      const width = await tab.$eval(
        `[data-host="${host}"] .fab-selection-label`,
        (label) => label.getBoundingClientRect().width
      );
      const word = await tab.evaluate(() => {
        const probe = document.createElement('span');
        probe.className = document.querySelector('.fab-selection-label').className;
        probe.textContent = 'ingredients';
        probe.style.cssText = 'position:absolute;white-space:nowrap';
        document.querySelector('.fabricate').append(probe);
        const { width: wide } = probe.getBoundingClientRect();
        probe.remove();
        return wide;
      });
      assert.ok(width >= word - 0.5, `${host}: ${width}px holds the word ingredients, ${word}px`);
    }
  });

  it('raises the empty edge under the pointer, and leaves a ticked edge alone', async () => {
    const centreOf = (id) =>
      tab.$eval(boxOf(id), (box) => {
        const { x, y, width, height } = box.getBoundingClientRect();
        return [x + width / 2, y + height / 2];
      });
    const rest = (await drawn('off')).edge;
    await tab.mouse.move(...(await centreOf('off')));
    const hovered = (await drawn('off')).edge;
    await tab.mouse.move(...(await centreOf('on')));
    const ticked = (await drawn('on')).edge;
    await tab.mouse.move(590, 690);
    assert.equal(rest, await resolved('color', 'var(--fab-control-outline)'));
    assert.equal(hovered, await resolved('color', 'var(--fab-text-muted)'));
    assert.equal(ticked, await resolved('color', 'var(--fab-accent)'));
  });

  it('gives the compact box a 24px pointer target, its label part of it', async () => {
    const hits = await tab.$eval(boxOf('compact'), (box) => {
      const { x, y, width, height } = box.getBoundingClientRect();
      const cx = x + width / 2;
      const cy = y + height / 2;
      const owner = (px, py) =>
        document.elementFromPoint(px, py)?.closest('label') === box.parentElement;
      return [owner(cx, cy - 11), owner(cx, cy + 11), owner(cx, cy - 13), owner(cx, cy + 13)];
    });
    assert.deepEqual(
      hits,
      [true, true, false, false],
      '12px each way from the centre, and not a pixel past it'
    );
    // The wrapper's `::before` lies over the label text, so a press there lands on the wrapper.
    const text = await tab.$eval('[data-case="off"] .fab-selection-label', (label) => {
      const { x, y, width, height } = label.getBoundingClientRect();
      const hit = document.elementFromPoint(x + width - 4, y + height / 2);
      return { x: x + width - 4, y: y + height / 2, wrapper: hit === label.parentElement };
    });
    assert.ok(text.wrapper, 'the label text is inside the wrapper’s target');
    const selected = await tab.$eval('[data-case="long"] .fab-selection-label', async (label) => {
      const { x, y, width } = label.getBoundingClientRect();
      return { from: [x + 2, y + 8], to: [x + width - 2, y + 8] };
    });
    await tab.mouse.move(...selected.from);
    await tab.mouse.down();
    await tab.mouse.move(...selected.to, { steps: 4 });
    await tab.mouse.up();
    const selection = await tab.evaluate(() => globalThis.getSelection().toString());
    await tab.$eval(inputOf('long'), (input) => {
      input.checked = false;
    });
    assert.equal(selection, '', 'a drag over the label selects none of its text');
    await tab.mouse.click(text.x, text.y);
    assert.equal(await tab.$eval(inputOf('off'), (input) => input.checked), true);
    await tab.$eval(inputOf('off'), (input) => {
      input.checked = false;
    });
  });

  it('rings a focused ticked box 2px wide and 2px clear in the accent, apart from its edge', async () => {
    await tab.focus('[data-before]');
    await tab.keyboard.press('Tab');
    await tab.keyboard.press('Tab');
    const focused = await tab.evaluate(
      () => document.activeElement?.closest('[data-case]')?.dataset.case
    );
    assert.equal(focused, 'on', 'Tab reaches the inputs in order, past the first');
    const { outline, edge } = await drawn('on');
    const accent = await resolved('color', 'var(--fab-accent)');
    assert.deepEqual(outline, ['solid', '2px', '2px', accent]);
    assert.equal(edge, accent, 'the ring is the edge’s colour, 2px clear of it');
    assert.equal((await drawn('off')).outline[0], 'none', 'no ring without focus');
  });

  it('names the input as a checkbox with its state in Chromium’s own accessibility tree', async () => {
    const read = async (id) => {
      const { role, name, checked, disabled } = await chromiumAxState(tab, inputOf(id));
      return { role, name, checked, disabled };
    };
    assert.deepEqual(await read('off'), {
      role: 'checkbox',
      name: LABEL,
      checked: 'false',
      disabled: undefined,
    });
    assert.deepEqual(await read('on'), {
      role: 'checkbox',
      name: LABEL,
      checked: 'true',
      disabled: undefined,
    });
    assert.deepEqual(await read('mixed'), {
      role: 'checkbox',
      name: LABEL,
      checked: 'mixed',
      disabled: undefined,
    });
    assert.deepEqual(await read('disabled'), {
      role: 'checkbox',
      name: 'Advance to step',
      checked: 'true',
      disabled: true,
    });
    assert.equal((await read('named')).name, 'Select Iron ore');
    assert.equal((await read('renamed')).name, 'Ember salt spent when this stage begins');
  });

  it('inks the label in the secondary ink, and dims a disabled box to half with its label in the muted ink', async () => {
    const enabled = await drawn('off');
    assert.equal(enabled.ink, await resolved('color', 'var(--fab-text-secondary)'));
    assert.equal(enabled.opacity, '1');
    const disabled = await drawn('disabled');
    assert.equal(disabled.ink, await resolved('color', 'var(--fab-text-muted)'));
    assert.equal(disabled.fill, await resolved('background-color', 'var(--fab-accent)'));
    assert.deepEqual([disabled.glyph, disabled.opacity], ['visible', '0.5']);
  });
});

/** The box's pixels, as Chromium paints them. */
const pixels = (id) => tab.locator(boxOf(id)).screenshot();

/**
 * The glyph's footprint inside a box's painted pixels: the pixels 3px in from the edge that stand
 * apart from the fill, past the edge and its rounded corners, and the bounds they span. A forced-colours backplate paints a
 * solid block there, which a tick's sparse footprint and a dash's thin one are not.
 */
async function footprintOf(id) {
  const png = await pixels(id);
  return tab.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
      const at = (x, y) => data.slice((y * width + x) * 4, (y * width + x) * 4 + 3);
      const fill = at(3, 3);
      const xs = [];
      const ys = [];
      for (let y = 3; y < height - 3; y += 1) {
        for (let x = 3; x < width - 3; x += 1) {
          const apart = at(x, y).reduce(
            (sum, value, index) => sum + Math.abs(value - fill[index]),
            0
          );
          if (apart > 90) {
            xs.push(x);
            ys.push(y);
          }
        }
      }
      const span = (values) =>
        values.length > 0 ? Math.max(...values) - Math.min(...values) + 1 : 0;
      return { count: xs.length, width: span(xs), height: span(ys) };
    },
    [...png]
  );
}

/** Whether a footprint is a tick: tall enough to be no dash, and too sparse to be a block. */
const isTick = ({ count, width, height }) => height >= 5 && count / (width * height) <= 0.6;
/** Whether a footprint is a dash: a thin bar, no taller than 3px. */
const isDash = ({ count, width, height }) => count > 0 && height <= 3 && width >= 4;

describe('the published SelectionCheckbox under forced colours', () => {
  for (const colorScheme of ['dark', 'light']) {
    it(`draws a tick, a dash and an empty box, each its own shape and no backplate block, enabled and disabled, on the ${colorScheme} palette`, async () => {
      await tab.emulateMedia({ forcedColors: 'active', colorScheme });
      await tab.evaluate(() => document.activeElement?.blur());
      try {
        const system = await tab.$eval('[data-system]', (probe) => {
          const style = getComputedStyle(probe);
          return {
            text: style.color,
            highlight: style.backgroundColor,
            gray: style.borderTopColor,
            highlightText: style.outlineColor,
          };
        });
        const off = await drawn('off');
        assert.equal(off.glyph, 'hidden', 'an unticked box draws no tick');
        assert.notEqual(off.edge, off.fill, 'and keeps its edge');
        for (const id of ['on', 'mixed', 'compact']) {
          const { fill, glyph, glyphInk, glyphAdjust } = await drawn(id);
          assert.deepEqual(
            [fill, glyph, glyphInk, glyphAdjust],
            [system.highlight, 'visible', system.highlightText, 'none'],
            `${id}: the glyph opts out of the forced backplate`
          );
        }
        assert.ok((await pixels('on')).equals(await pixels('on-twin')), 'two ticks paint alike');
        for (const id of ['on', 'disabled']) {
          const footprint = await footprintOf(id);
          assert.ok(
            isTick(footprint),
            `${id} draws a tick, not a block: ${JSON.stringify(footprint)}`
          );
        }
        for (const id of ['mixed', 'disabled-mixed']) {
          const footprint = await footprintOf(id);
          assert.ok(
            isDash(footprint),
            `${id} draws a dash, not a block: ${JSON.stringify(footprint)}`
          );
        }
        assert.equal((await footprintOf('off')).count, 0, 'an empty box draws nothing inside');
        for (const [a, b] of [
          ['on', 'mixed'],
          ['on', 'off'],
          ['mixed', 'off'],
          ['disabled', 'disabled-mixed'],
          ['disabled', 'disabled-off'],
          ['disabled-mixed', 'disabled-off'],
        ]) {
          assert.ok(!(await pixels(a)).equals(await pixels(b)), `${a} and ${b} paint apart`);
        }
        for (const id of ['disabled', 'disabled-mixed', 'contents']) {
          const { fill, edge, glyph, opacity } = await drawn(id);
          assert.deepEqual(
            [fill, edge, glyph, opacity],
            [system.gray, system.gray, 'visible', '1'],
            id
          );
        }
        const empty = await drawn('disabled-off');
        assert.deepEqual([empty.edge, empty.glyph, empty.opacity], [system.gray, 'hidden', '1']);
        assert.notEqual(
          empty.fill,
          system.gray,
          'a disabled empty box takes GrayText at its edge alone'
        );
        await tab.focus(inputOf('on'));
        await tab.keyboard.press('Shift+Tab');
        await tab.keyboard.press('Tab');
        const { outline } = await drawn('on');
        assert.deepEqual(outline, ['solid', '2px', '2px', system.text]);
        assert.notEqual(system.text, system.highlight, 'the ring differs from the ticked fill');
      } finally {
        await tab.emulateMedia({ forcedColors: 'none', colorScheme: 'no-preference' });
      }
    });
  }
});

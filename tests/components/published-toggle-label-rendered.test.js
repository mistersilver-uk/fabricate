/**
 * The published `StatusToggle`'s `label` (issues 2902, 2795) in Chromium, on the markup the seam
 * draws under the core and module sheets: a press at the label's words lands on the button, the
 * tree names the button by the label and keeps its pressed or checked state, `aria-labelledby`
 * beside a label names the button by the companion's element instead, the label sits whole inside
 * the button past the 78px cap and wraps at its spaces in a narrow target, the keyboard ring
 * surrounds the label 4px out, and forced colours draw the label in a system colour.
 * Limit: the page wires its own click counter on each button in place of the seam's `onclick`,
 * which `published-toggle-label-mounted.test.js` holds.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromiumAxState } from '../helpers/chromiumAxNode.js';
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
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-toggle-label-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

const BUTTON_SHEET = readFileSync(
  resolve(import.meta.dirname, '../fixtures/foundry-core-button-min.css'),
  'utf8'
);
const LONG = 'Spend the stage’s requirements when the activity begins';
/** Each case's id, its target's width, its props, `onclick` aside, and any font size of its own. */
const CASES = Object.freeze([
  ['required', 280, { on: false, label: 'Required' }],
  ['hidden', 280, { on: true, label: 'Hidden' }],
  ['switch', 280, { on: true, semantics: 'switch', label: 'Spent' }],
  ['named', 280, { on: false, label: 'Required', ariaLabel: 'Required ingredients' }],
  ['labelled', 280, { on: false, label: 'Required', 'aria-labelledby': 'acme-elsewhere' }],
  ['long', 160, { on: false, label: LONG }],
  ['track', 280, { on: false, ariaLabel: 'Group by category' }],
  ['small', 280, { on: false, label: 'Required' }, 11],
  ['small-track', 280, { on: false, ariaLabel: 'Group by category' }, 11],
]);
const LABELLED_CASES = CASES.filter((row) => row[2].label).map(([id]) => id);

const button = (id) => `[data-case="${id}"] button`;
const nameOf = (id) => `${button(id)} .manager-status-toggle-name`;

let browser;
let tab;

/** One case's target, button and label boxes, and the label's overflow and ink. */
const readCase = (id) => {
  const target = globalThis.document.querySelector(`[data-case="${id}"]`);
  const host = target.querySelector('button');
  const name = host.querySelector('.manager-status-toggle-name');
  const box = (node) => node.getBoundingClientRect().toJSON();
  const style = (node) => globalThis.getComputedStyle(node);
  return {
    target: box(target),
    button: box(host),
    name: name && {
      ...box(name),
      scrollWidth: name.scrollWidth,
      clientWidth: name.clientWidth,
      textOverflow: style(name).textOverflow,
      whiteSpace: style(name).whiteSpace,
      color: style(name).color,
      fontSize: style(name).fontSize,
      lineHeight: Number.parseFloat(style(name).lineHeight),
    },
    ring: {
      style: style(host).outlineStyle,
      width: style(host).outlineWidth,
      offset: style(host).outlineOffset,
      corner: style(host).borderTopRightRadius,
    },
  };
};

before(async () => {
  const shells = [];
  const cells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const [id, width, props, font] of CASES) {
      const target = companionTarget(shells);
      const handle = ui.mount('StatusToggle', { target, props: { ...props, onclick() {} } });
      await settle();
      cells.push(
        `<div data-case="${id}" style="display:flex;align-items:center;width:${width}px;margin-bottom:12px${font ? `;font-size:${font}px` : ''}">${target.innerHTML}</div>`
      );
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 700 } });
  await tab.setContent(
    `${renderedPageHead([]).replace('<meta charset="utf-8">', () => `<meta charset="utf-8"><style>${BUTTON_SHEET}</style>`)}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1);padding:8px;font-size:14px">' +
      '<style>*,*::before,*::after{transition:none !important}</style>' +
      '<span id="acme-elsewhere">Ingredients the recipe needs</span>' +
      `<button data-before>Before</button>${cells.join('')}` +
      '<i data-system style="color:CanvasText"></i><i data-button-text style="color:ButtonText"></i></div>' +
      `<script>globalThis.presses = {};
        for (const cell of document.querySelectorAll('[data-case]')) {
          presses[cell.dataset.case] = 0;
          cell.querySelector('button').addEventListener('click', () => presses[cell.dataset.case]++);
        }</script></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

describe('the published StatusToggle’s label in Chromium', () => {
  it('lands a press at the label’s words on the switch’s own button', async () => {
    for (const id of LABELLED_CASES) {
      const before = await tab.evaluate((key) => globalThis.presses[key], id);
      const hit = await tab.evaluate((selector) => {
        const name = globalThis.document.querySelector(selector);
        const { left, top, width, height } = name.getBoundingClientRect();
        const point = globalThis.document.elementFromPoint(left + width / 2, top + height / 2);
        return point?.closest('button') === name.closest('button');
      }, nameOf(id));
      assert.ok(hit, `${id}: the label’s centre hit-tests to the button`);
      await tab.click(nameOf(id));
      const after = await tab.evaluate((key) => globalThis.presses[key], id);
      assert.equal(after - before, 1, `${id}: a click on the words pressed the switch once`);
    }
  });

  it('names the button by the label, keeping its pressed or checked state on the same node', async () => {
    const required = await chromiumAxState(tab, button('required'));
    assert.deepEqual(
      [required.role, required.name, required.pressed],
      ['button', 'Required', 'false']
    );
    const hidden = await chromiumAxState(tab, button('hidden'));
    assert.deepEqual([hidden.name, hidden.pressed], ['Hidden', 'true']);
    const spent = await chromiumAxState(tab, button('switch'));
    assert.deepEqual([spent.role, spent.name, spent.checked], ['switch', 'Spent', 'true']);
    const named = await chromiumAxState(tab, button('named'));
    assert.equal(named.name, 'Required ingredients', 'an ariaLabel holding the words names it');
    const long = await chromiumAxState(tab, button('long'));
    assert.equal(long.name, LONG);
  });

  it('names the button by the companion’s element, not the label, where aria-labelledby is passed beside it', async () => {
    const labelled = await chromiumAxState(tab, button('labelled'));
    assert.equal(
      labelled.name,
      'Ingredients the recipe needs',
      'why the two are never passed together'
    );
  });

  it('draws a short label whole inside the button, past the 78px cap', async () => {
    for (const id of ['required', 'hidden', 'switch']) {
      const { button: host, name } = await tab.evaluate(readCase, id);
      assert.ok(name.scrollWidth <= name.clientWidth, `${id}: the label is not clipped`);
      assert.notEqual(name.textOverflow, 'ellipsis', `${id}: nor ellipsised`);
      assert.ok(
        name.left >= host.left && name.right <= host.right + 0.5,
        `${id}: inside the button`
      );
    }
    const { button: host } = await tab.evaluate(readCase, 'required');
    assert.ok(host.width > 78, `the labelled button is not held at 78px: ${host.width}`);
  });

  it('wraps a long label at its spaces inside a narrow target, the button growing to hold it', async () => {
    const { target, button: host, name } = await tab.evaluate(readCase, 'long');
    assert.ok(
      host.right <= target.right + 0.5,
      `the button keeps inside its target: ${host.right}`
    );
    assert.ok(name.height >= name.lineHeight * 2, `the label wraps: ${name.height}`);
    assert.ok(name.scrollWidth <= name.clientWidth, 'no line overflows the label');
    assert.ok(
      name.top >= host.top && name.bottom <= host.bottom + 0.5,
      'the button holds every line'
    );
    assert.equal(name.whiteSpace, 'normal');
  });

  it('draws the label in the target’s size', async () => {
    const { name } = await tab.evaluate(readCase, 'required');
    assert.equal(name.fontSize, '14px');
  });

  it('keeps the track-only button 38px wide with no label', async () => {
    const { button: host, name } = await tab.evaluate(readCase, 'track');
    assert.equal(name, null);
    assert.equal(host.width, 38);
  });

  it('keeps a one-line labelled button at the track-only button’s height under Foundry’s button floor', async () => {
    const { button: track } = await tab.evaluate(readCase, 'track');
    assert.equal(track.height, 28, 'core’s 2em floor at the 14px the target sets');
    for (const id of ['required', 'hidden', 'switch']) {
      const { button: host } = await tab.evaluate(readCase, id);
      assert.equal(host.height, track.height, `${id}: the same height as the track alone`);
    }
  });

  it('keeps a one-line labelled button 24px tall where Foundry’s floor falls below it', async () => {
    const { button: track } = await tab.evaluate(readCase, 'small-track');
    const { button: host } = await tab.evaluate(readCase, 'small');
    assert.deepEqual([track.height, host.height], [24, 24], 'the 24px floor, not core’s 22px');
  });

  it('rings the whole labelled button, 2px wide and 2px clear, reaching 4px beyond the label', async () => {
    await tab.focus('[data-before]');
    await tab.keyboard.press('Tab');
    const { button: host, name, ring } = await tab.evaluate(readCase, 'required');
    const focused = await tab.evaluate(
      () => globalThis.document.activeElement.closest('[data-case]')?.dataset.case
    );
    assert.equal(focused, 'required', 'Tab reached the first labelled switch');
    assert.deepEqual(ring, { style: 'solid', width: '2px', offset: '2px', corner: '6px' });
    assert.ok(
      name.left >= host.left && name.right <= host.right + 0.5,
      'the label is inside the ring'
    );
  });

  it('rounds the ring around a wrapped label at the 24px rung’s corner, clear of its lines', async () => {
    await tab.focus(button('long'));
    const { button: host, name, ring } = await tab.evaluate(readCase, 'long');
    assert.equal(ring.corner, '6px', 'not the track’s pill, whose ends would cross the lines');
    assert.ok(host.height > 50, `the wrapped button is several lines tall: ${host.height}`);
    assert.ok(name.top >= host.top && name.right <= host.right + 0.5, 'its lines sit inside it');
  });

  it('draws the label in a system colour under forced colours', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const { name } = await tab.evaluate(readCase, 'required');
      const system = await tab.evaluate(() =>
        ['[data-system]', '[data-button-text]'].map(
          (selector) =>
            globalThis.getComputedStyle(globalThis.document.querySelector(selector)).color
        )
      );
      assert.ok(system.includes(name.color), `${name.color} is CanvasText or ButtonText`);
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});

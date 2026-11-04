/**
 * Issue 2933 — the published `Kicker`'s `for`, measured in Chromium on the markup the seam draws
 * under the kicker's scoped styles: the accessible name Chromium's own accessibility tree, read
 * over CDP, gives a control the kicker names, the name `aria-label` and `aria-labelledby` take
 * instead, that a click on the caption focuses its control, two mounts naming their own controls
 * with no id from the kicker, the caption drawn in the kicker's type as a label, and the same
 * name and type under forced colours.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chromiumAxDescribed } from '../helpers/chromiumAxNode.js';
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
  tmpPrefix: 'fabricate-kicker-for-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

/** Each case: the kicker's props and the companion's control, drawn after the caption's target. */
const CASES = Object.freeze([
  ['text', { children: 'Recipe name', for: 'c-text' }, '<input id="c-text" type="text">'],
  ['textarea', { children: 'Description', for: 'c-area' }, '<textarea id="c-area"></textarea>'],
  ['number', { children: 'Uses', for: 'c-number' }, '<input id="c-number" type="number">'],
  [
    'select',
    { children: 'Category', for: 'c-select' },
    '<select id="c-select"><option>Ash</option></select>',
  ],
  [
    'aria-label',
    { children: 'Reward', for: 'c-label' },
    '<input id="c-label" type="text" aria-label="Reward amount">',
  ],
  [
    'labelledby',
    { children: 'Reward', for: 'c-by' },
    '<input id="c-by" type="text" aria-labelledby="c-other"><span id="c-other">Payout</span>',
  ],
  ['checkbox', { children: 'Remember', for: 'c-check' }, '<input id="c-check" type="checkbox">'],
  [
    'button',
    { children: 'Remove', for: 'c-button' },
    '<button id="c-button" type="button">Remove</button>',
  ],
  ['second', { children: 'Check formula', for: 'c-second' }, '<input id="c-second" type="text">'],
  ['dangling', { children: 'Nothing', for: 'c-nowhere' }, '<input id="c-dangling" type="text">'],
  ['blank', { children: 'Blank', for: ' ', as: 'span' }, '<input id="c-blank" type="text">'],
  ['plain', { children: 'Plain', as: 'span' }, '<input id="c-plain" type="text">'],
  [
    'accent-8',
    { children: 'Accent', for: 'c-accent', tone: 'accent', size: '8' },
    '<input id="c-accent">',
  ],
  ['span-reference', { children: 'Span', as: 'span' }, '<input id="c-span">'],
]);

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
    for (const [id, props, control] of CASES) {
      const target = companionTarget(shells);
      const handle = ui.mount('Kicker', { target, props });
      await settle();
      cells.push(
        `<div data-case="${id}"><div class="caption">${target.innerHTML}</div>${control}</div>`
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
    `${renderedPageHead(['Kicker'])}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1)">' +
      `<style>.caption{display:flex}</style>${cells.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const controlOf = (id) => `[data-case="${id}"] :is(input, textarea, select, button)`;
const captionOf = (id) => `[data-case="${id}"] .fab-kicker`;

describe('the published Kicker, for, in Chromium', () => {
  describe('the accessibility tree', () => {
    for (const [id, role, name] of [
      ['text', 'textbox', 'RECIPE NAME'],
      ['textarea', 'textbox', 'DESCRIPTION'],
      ['number', 'spinbutton', 'USES'],
      ['select', 'combobox', 'CATEGORY'],
      ['second', 'textbox', 'CHECK FORMULA'],
    ]) {
      it(`names the ${id} control by its caption, in the upper case Chromium reads off the drawn text`, async () => {
        const node = await chromiumAxDescribed(tab, controlOf(id));
        assert.equal(node.role, role);
        assert.equal(node.name, name);
        assert.equal(node.description, '');
      });
    }

    it('names a control no caption points at by nothing, and the caption’s label draws no error', async () => {
      assert.equal((await chromiumAxDescribed(tab, controlOf('dangling'))).name, '');
      assert.equal((await chromiumAxDescribed(tab, controlOf('blank'))).name, '');
      assert.equal((await chromiumAxDescribed(tab, controlOf('plain'))).name, '');
    });

    it('lets the control’s own aria-label and aria-labelledby name it instead of the caption', async () => {
      const named = (await chromiumAxDescribed(tab, controlOf('aria-label'))).name;
      assert.equal(named, 'Reward amount');
      const caption = await tab.$eval(captionOf('aria-label'), (node) => node.textContent);
      assert.ok(named.toLowerCase().includes(caption.toLowerCase()), 'label in name');
      assert.equal((await chromiumAxDescribed(tab, controlOf('labelledby'))).name, 'Payout');
    });

    it('names two controls each by its own caption, so one name is not the other', async () => {
      const names = [
        (await chromiumAxDescribed(tab, controlOf('text'))).name,
        (await chromiumAxDescribed(tab, controlOf('second'))).name,
      ];
      assert.deepEqual(names, ['RECIPE NAME', 'CHECK FORMULA']);
    });

    it('draws the caption itself as a label of the kicker’s type', async () => {
      const [localName, forId] = await tab.$eval(captionOf('text'), (node) => [
        node.localName,
        node.getAttribute('for'),
      ]);
      assert.deepEqual([localName, forId], ['label', 'c-text']);
    });
  });

  describe('the pointer and the ids', () => {
    it('focuses the control when the caption is clicked', async () => {
      await tab.click(captionOf('text'));
      assert.equal(await tab.evaluate(() => document.activeElement.id), 'c-text');
      await tab.click(captionOf('textarea'));
      assert.equal(await tab.evaluate(() => document.activeElement.id), 'c-area');
    });

    it('activates a checkbox and presses a button from their captions, as any label does', async () => {
      await tab.$eval('#c-button', (button) => {
        button.dataset.pressed = '0';
        button.addEventListener('click', () => {
          button.dataset.pressed = String(Number(button.dataset.pressed) + 1);
        });
      });
      await tab.click(captionOf('checkbox'));
      assert.equal(await tab.$eval('#c-check', (node) => node.checked), true, 'toggled');
      await tab.click(captionOf('checkbox'));
      assert.equal(await tab.$eval('#c-check', (node) => node.checked), false, 'toggled back');
      await tab.click(captionOf('button'));
      assert.equal(
        await tab.$eval('#c-button', (button) => button.dataset.pressed),
        '1',
        'the button was pressed once'
      );
    });

    it('focuses nothing from a caption with a blank for, or no for', async () => {
      await tab.evaluate(() => document.activeElement.blur());
      await tab.click(captionOf('blank'));
      assert.equal(await tab.evaluate(() => document.activeElement.localName), 'body');
      await tab.click(captionOf('plain'));
      assert.equal(await tab.evaluate(() => document.activeElement.localName), 'body');
    });

    it('draws no id of its own: every id on the page is the companion’s', async () => {
      const ids = await tab.$$eval('[id]', (nodes) => nodes.map((node) => node.id));
      assert.deepEqual(
        ids.filter((id) => !id.startsWith('c-')),
        [],
        'no id the kicker or its host drew'
      );
      assert.equal(new Set(ids).size, ids.length, 'every id is unique');
    });
  });

  describe('the type', () => {
    it('draws a label in the span kicker’s size, weight, case and ink, at either size and tone', async () => {
      const read = (selector) =>
        tab.$eval(selector, (node) => {
          const style = getComputedStyle(node);
          return {
            size: style.fontSize,
            weight: style.fontWeight,
            transform: style.textTransform,
            spacing: style.letterSpacing,
            ink: style.color,
            margin: style.margin,
          };
        });
      const label = await read(captionOf('text'));
      const span = await read(captionOf('plain'));
      assert.deepEqual(label, span);
      assert.equal(label.transform, 'uppercase');
      assert.equal((await read(captionOf('accent-8'))).size, '8px');
    });

    it('keeps the name and the type under forced colours, in a system ink', async () => {
      const read = (selector) =>
        tab.$eval(selector, (node) => {
          const style = getComputedStyle(node);
          return [style.fontSize, style.textTransform, style.color];
        });
      const normal = await read(captionOf('text'));
      await tab.emulateMedia({ forcedColors: 'active' });
      try {
        const forced = await read(captionOf('text'));
        assert.deepEqual(forced.slice(0, 2), normal.slice(0, 2));
        assert.equal((await chromiumAxDescribed(tab, controlOf('text'))).name, 'RECIPE NAME');
        await tab.click(captionOf('text'));
        assert.equal(await tab.evaluate(() => document.activeElement.id), 'c-text');
      } finally {
        await tab.emulateMedia({ forcedColors: 'none' });
      }
    });
  });
});

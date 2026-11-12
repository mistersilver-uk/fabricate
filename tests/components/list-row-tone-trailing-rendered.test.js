/**
 * The published `ListRow`'s `trailing` slot holding several published controls, each mounted in a
 * plain `<span>` appended to the slot element, and its tinted rows, in Chromium on the markup the
 * seam draws under the core and module sheets: the controls sit on one line at the row's gap, 8px
 * dense, in a card and on the bare row and 12px at the default density, never shrinking while the
 * name narrows and wraps down to no width, and beneath a card's content; controls wider than a selectable row take a line of their own beneath it
 * and run past its edge, and on a bare row the name keeps no width and they run past it too; Tab
 * reaches the row's button and then each control in order; each control is named by its own label
 * and the row's button holds none of them; a press between two controls presses nothing and one on
 * the inset beyond the last presses the row; a disabled row dims its enabled controls; the accent,
 * positive and danger rows paint their wash and edge, forced colours draw each wash in Canvas at
 * its own alpha and the edge in CanvasText, the state word kept; `selected` draws the selected face
 * over an accent row with the accent row's own edge, and the pointer the raised wash.
 * Limit: the page wires its own click counters in place of the seam's callbacks, which
 * `published-list-row-tone-trailing-mounted.test.js` holds.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromiumAxNode } from '../helpers/chromiumAxNode.js';
import { chromium } from '../helpers/playwrightChromium.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-list-row-tone-trailing-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

const BUTTON_SHEET = readFileSync(
  resolve(import.meta.dirname, '../fixtures/foundry-core-button-min.css'),
  'utf8'
);
const noop = () => {};
const icon = (glyph, ariaLabel) => ['IconButton', { icon: glyph, ariaLabel, size: '24' }];
const STEPS = Object.freeze([
  icon('fas fa-minus', 'Lower Ember Court standing'),
  icon('fas fa-plus', 'Raise Ember Court standing'),
  icon('fas fa-trash', 'Remove Ember Court'),
]);
const LABELS = STEPS.map(([, props]) => props.ariaLabel);
const text = (children) => ['Button', { children, size: '24' }];
/** Three text buttons, 212px with their gaps, wider than a 200px row's inner width. */
const WORDS = Object.freeze([text('Edit'), text('Duplicate'), text('Remove')]);
const NAME = 'Ember Court';
const LONG = 'The Ember Court of the Deep Seam, sworn to the forge-wardens';
/** Each case's id, its target's width, the row's props and the controls drawn in `trailing`. */
const CASES = Object.freeze([
  ['open', 360, { name: NAME, detail: 'Trusted', onOpen: noop }, STEPS],
  ['default', 360, { name: NAME, density: 'default', onOpen: noop }, STEPS.slice(0, 2)],
  ['card', 200, { name: NAME, layout: 'card', onOpen: noop }, STEPS.slice(0, 2)],
  ['bare', 360, { name: NAME }, STEPS.slice(0, 2)],
  ['narrow', 200, { name: LONG, onOpen: noop }, STEPS],
  ['mixed', 240, { name: LONG, onOpen: noop }, [text('Claim'), STEPS[2]]],
  ['words', 200, { name: LONG, onOpen: noop }, WORDS],
  ['words-wide', 260, { name: LONG, onOpen: noop }, WORDS],
  ['bare-words', 200, { name: LONG }, WORDS],
  ['disabled', 360, { name: NAME, onOpen: noop, disabled: true }, STEPS.slice(0, 2)],
  [
    'accent',
    360,
    { name: 'Signet of the Ember Court', detail: 'Ready to claim', tone: 'accent', onOpen: noop },
    [['Button', { children: 'Claim', role: 'accent', size: '24' }]],
  ],
  ['positive', 360, { name: 'Writ of passage', detail: 'Claimed', tone: 'positive' }, []],
  ['danger', 360, { name: 'Writ of passage', detail: 'Turned down', tone: 'danger' }, []],
  [
    'selected',
    360,
    { name: 'Writ of passage', detail: 'Chosen', tone: 'accent', selected: true },
    [],
  ],
]);
/** Each tinted case's wash and edge tokens, and its state word. */
const TINTS = Object.freeze({
  accent: ['--fab-accent-soft', '--fab-accent-border', 'Ready to claim'],
  positive: ['--fab-success-soft', '--fab-success-border', 'Claimed'],
  danger: ['--fab-danger-soft', '--fab-danger-border', 'Turned down'],
});
const GAPS = Object.freeze({ open: 8, default: 12, card: 8, bare: 8, narrow: 8, mixed: 8 });

const ROW = (id) => `[data-case="${id}"] .fabricate-list-row`;
const ROW_BUTTON = (id) => `${ROW(id)} > button.fabricate-list-row-open`;
const CONTROL = (id, at) => `[data-case="${id}"] [data-control="${at}"] button`;

let browser;
let tab;

/** The red, green and blue channels of a computed `rgb()` or `rgba()`, its alpha dropped. */
const alphaOf = (value) => Number(value.match(/[\d.]+/gu)[3] ?? 1);
const rgbOf = (value) =>
  value
    .match(/[\d.]+/gu)
    .slice(0, 3)
    .map(Number);

/** A case's row, its name, and each control's box, in the order the companion appended them. */
const readCase = (id) => {
  const row = globalThis.document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
  const box = (node) => node.getBoundingClientRect().toJSON();
  return {
    row: box(row),
    name: box(row.querySelector('.fabricate-list-row-name')),
    controls: [...row.querySelectorAll(':scope [data-control] button')].map(box),
    opacity: globalThis.getComputedStyle(row).opacity,
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
    for (const [id, width, props, controls] of CASES) {
      const target = fabricateTarget(shells);
      const row = ui.mount('ListRow', { target, props: { ...props, trailing: true } });
      const nested = controls.map(([name, control], at) => {
        const slot = row.slot('trailing');
        const host = slot.ownerDocument.createElement('span');
        host.dataset.control = String(at);
        slot.append(host);
        return ui.mount(name, { target: host, props: { ...control, onclick: noop } });
      });
      await settle();
      cells.push(
        `<div data-case="${id}" style="width:${width}px;margin-bottom:12px">${target.innerHTML}</div>`
      );
      for (const handle of [...nested, row]) handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 900 } });
  await tab.setContent(
    `${renderedPageHead(['Medallion']).replace('<meta charset="utf-8">', () => `<meta charset="utf-8"><style>${BUTTON_SHEET}</style>`)}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1);padding:8px;font-size:14px">' +
      `<button data-before>Before</button>${cells.join('')}` +
      '<i data-system style="color:CanvasText"></i><i data-canvas style="color:Canvas"></i></div>' +
      `<script>globalThis.presses = [];
        for (const button of document.querySelectorAll('[data-case] button')) {
          button.addEventListener('click', () => presses.push(button.getAttribute('aria-label') ?? 'row'));
        }</script></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

describe('the published ListRow’s trailing controls in Chromium', () => {
  for (const [id, gap] of Object.entries(GAPS)) {
    it(`sets the ${id} row’s controls on one line, ${gap}px apart, inside the row`, async () => {
      const { row, controls } = await tab.evaluate(readCase, id);
      assert.ok(controls.length >= 2, 'several controls drawn');
      for (const [at, control] of controls.entries()) {
        assert.equal(control.top, controls[0].top, `control ${at} on the first one’s line`);
        assert.ok(control.right <= row.right + 0.5, `control ${at} inside the row`);
        assert.ok(control.width >= 24 && control.height >= 24, `control ${at} at least 24px`);
        if (at > 0) assert.equal(control.left - controls[at - 1].right, gap, `gap before ${at}`);
      }
    });
  }

  it('keeps the controls whole and narrows the name first in a narrow row', async () => {
    const wide = await tab.evaluate(readCase, 'open');
    const narrow = await tab.evaluate(readCase, 'narrow');
    assert.deepEqual(
      narrow.controls.map(({ width }) => width),
      wide.controls.map(({ width }) => width),
      'each control at its own width'
    );
    assert.ok(narrow.name.right <= narrow.controls[0].left, 'the name ends before the controls');
    assert.ok(narrow.name.height > wide.name.height, 'the long name wraps instead');
  });

  it('gives the name up to no width, a letter to a line, before a control shrinks', async () => {
    const { name, controls } = await tab.evaluate(readCase, 'words-wide');
    const open = await tab.evaluate(readCase, 'open');
    assert.ok(name.width < 1, `the name keeps no width: ${name.width}`);
    assert.ok(name.height > 20 * open.name.height, `a letter to a line: ${name.height}`);
    assert.deepEqual(
      controls.map(({ width }) => width),
      (await tab.evaluate(readCase, 'words')).controls.map(({ width }) => width),
      'each control at its own width'
    );
  });

  it('draws a card’s controls on a line of their own beneath its content', async () => {
    const { name, controls } = await tab.evaluate(readCase, 'card');
    assert.ok(controls[0].top >= name.bottom, 'beneath the name');
  });

  it('moves controls wider than a selectable row to a line of their own, past the row’s edge', async () => {
    const { row, name, controls } = await tab.evaluate(readCase, 'words');
    assert.ok(
      controls.every(({ top }) => top === controls[0].top),
      'still one line'
    );
    assert.ok(controls[0].top >= name.bottom, 'beneath the name');
    assert.ok(controls.at(-1).right > row.right, `past the row’s edge: ${controls.at(-1).right}`);
  });

  it('collapses the name to no width and runs the controls past the edge of a bare row too narrow for them', async () => {
    const { row, name, controls } = await tab.evaluate(readCase, 'bare-words');
    assert.ok(name.width < 1, `the name keeps no width: ${name.width}`);
    assert.ok(
      controls.every(({ top }) => top === controls[0].top),
      'one line'
    );
    assert.ok(controls.at(-1).right > row.right, `past the row’s edge: ${controls.at(-1).right}`);
  });

  it('dims the disabled row and the enabled controls in it together', async () => {
    const { opacity } = await tab.evaluate(readCase, 'disabled');
    assert.equal(opacity, '0.62');
    const enabled = await tab.evaluate(
      (selector) =>
        [...globalThis.document.querySelectorAll(selector)].map((node) => node.disabled),
      `[data-case="disabled"] [data-control] button`
    );
    assert.deepEqual(enabled, [false, false]);
  });

  it('reaches the row’s button with Tab, then each control in the order appended', async () => {
    await tab.focus('[data-before]');
    const reached = [];
    for (let press = 0; press < 4; press += 1) {
      await tab.keyboard.press('Tab');
      reached.push(
        await tab.evaluate(() => {
          const active = globalThis.document.activeElement;
          return active.closest('[data-case]')?.dataset.case === 'open'
            ? (active.getAttribute('aria-label') ?? 'row')
            : null;
        })
      );
    }
    assert.deepEqual(reached, ['row', ...LABELS]);
  });

  it('names each control by its own label, and the row’s button by the row’s text alone', async () => {
    for (const [at, label] of LABELS.entries()) {
      const node = await chromiumAxNode(tab, CONTROL('open', at));
      assert.deepEqual([node.role, node.name], ['button', label]);
    }
    const row = await chromiumAxNode(tab, ROW_BUTTON('open'));
    assert.equal(row.role, 'button');
    assert.ok(row.name.startsWith(NAME), row.name);
    for (const label of LABELS) assert.ok(!row.name.includes(label), `no ${label} in it`);
  });

  it('lands a press on each control on that control, and one between two controls on neither it nor the row', async () => {
    const hits = await tab.evaluate((id) => {
      const row = globalThis.document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
      const controls = [...row.querySelectorAll(':scope [data-control] button')];
      const at = (x, y) => globalThis.document.elementFromPoint(x, y);
      const centre = (node) => {
        const { left, top, width, height } = node.getBoundingClientRect();
        return [left + width / 2, top + height / 2];
      };
      const [first, second] = controls.map((node) => node.getBoundingClientRect());
      const between = at((first.right + second.left) / 2, first.top + first.height / 2);
      return {
        own: controls.map((node) => at(...centre(node))?.closest('button') === node),
        between: {
          host: Boolean(between?.closest('.fabricate-list-row-trailing')),
          button: Boolean(between?.closest('button')),
        },
        name:
          at(...centre(row.querySelector('.fabricate-list-row-name')))?.closest('button') ===
          row.querySelector(':scope > button'),
      };
    }, 'open');
    assert.deepEqual(hits.own, [true, true, true], 'each control’s centre is its own');
    assert.deepEqual(hits.between, { host: true, button: false }, 'the gap is the trailing host');
    assert.ok(hits.name, 'the name still presses the row');
    await tab.evaluate(() => {
      globalThis.presses.length = 0;
    });
    const first = await tab.locator(CONTROL('open', 0)).boundingBox();
    const second = await tab.locator(CONTROL('open', 1)).boundingBox();
    await tab.mouse.click((first.x + first.width + second.x) / 2, first.y + first.height / 2);
    await tab.click(CONTROL('open', 2));
    assert.deepEqual(await tab.evaluate(() => [...globalThis.presses]), [LABELS[2]]);
  });

  it('presses the row for a press on its inset beyond the last control', async () => {
    await tab.evaluate(() => {
      globalThis.presses.length = 0;
    });
    const last = await tab.locator(CONTROL('open', 2)).boundingBox();
    await tab.mouse.click(last.x + last.width + 4, last.y + last.height / 2);
    assert.deepEqual(await tab.evaluate(() => [...globalThis.presses]), ['row']);
  });
});

describe('the published ListRow’s tinted rows in Chromium', () => {
  const paintOf = (id, tokens) =>
    tab.evaluate(
      ([selector, names]) => {
        const row = globalThis.document.querySelector(selector);
        const detail = row.querySelector('.fabricate-list-row-detail');
        const style = globalThis.getComputedStyle(row);
        const probe = (token) => {
          const node = globalThis.document.createElement('i');
          node.style.color = `var(${token})`;
          row.parentElement.append(node);
          const value = globalThis.getComputedStyle(node).color;
          node.remove();
          return value;
        };
        return {
          accent: row.classList.contains('is-accent'),
          fill: style.backgroundColor,
          edge: style.borderTopColor,
          detail: globalThis.getComputedStyle(detail).color,
          text: detail.textContent,
          tokens: names.map(probe),
          system: ['[data-system]', '[data-canvas]'].map(
            (each) => globalThis.getComputedStyle(globalThis.document.querySelector(each)).color
          ),
        };
      },
      [ROW(id), [...tokens, '--fab-text-secondary']]
    );

  for (const [id, [wash, edge, word]] of Object.entries(TINTS)) {
    it(`paints the ${id} wash and edge, its detail in the row ink`, async () => {
      const paint = await paintOf(id, [wash, edge]);
      assert.deepEqual([paint.fill, paint.edge, paint.detail], paint.tokens);
    });

    it(`draws the ${id} wash in Canvas and the edge and text in system colours under forced colours`, async () => {
      const rest = await paintOf(id, [wash, edge]);
      await tab.emulateMedia({ forcedColors: 'active' });
      try {
        const forced = await paintOf(id, [wash, edge]);
        assert.deepEqual(
          rgbOf(forced.fill),
          rgbOf(forced.system[1]),
          `the wash is Canvas: ${forced.fill}`
        );
        assert.equal(alphaOf(forced.fill), alphaOf(rest.fill), 'at the wash’s own alpha');
        assert.ok(alphaOf(rest.fill) < 1, 'which is translucent');
        assert.equal(forced.edge, forced.system[0], 'the edge in CanvasText, not the ground');
        assert.ok(forced.system.includes(forced.detail), `the detail to ${forced.detail}`);
        assert.notEqual(forced.fill, rest.fill, 'the tinted wash is not drawn');
        assert.notEqual(forced.edge, rest.edge, 'nor the tinted edge');
        assert.equal(forced.text, word, 'the state word carries the meaning');
      } finally {
        await tab.emulateMedia({ forcedColors: 'none' });
      }
    });
  }

  it('draws the selected face over an accent row, its edge the accent row’s own', async () => {
    const paint = await paintOf('selected', ['--fab-surface-active', '--fab-accent-border']);
    assert.ok(paint.accent, 'the selected row is an accent row');
    assert.deepEqual([paint.fill, paint.edge, paint.detail], paint.tokens);
    const accent = await paintOf('accent', [TINTS.accent[0], TINTS.accent[1]]);
    assert.equal(paint.edge, accent.edge, 'the same edge as an unselected accent row');
  });

  it('draws the raised wash on a pressable accent row under the pointer', async () => {
    await tab.hover(`${ROW('accent')} .fabricate-list-row-name`);
    try {
      const paint = await paintOf('accent', ['--fab-surface-raised', TINTS.accent[1]]);
      assert.deepEqual([paint.fill, paint.edge, paint.detail], paint.tokens);
    } finally {
      await tab.mouse.move(0, 0);
    }
  });
});

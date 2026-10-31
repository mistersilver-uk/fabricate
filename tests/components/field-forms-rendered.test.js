/**
 * Issue 2848 — the forms `Field` publishes, measured in Chromium on columns `Field.svelte` draws:
 * each `size` rung's input height and corner, its inset keyboard ring and its error state; the
 * serif and mono faces on the control alone; and the number input `type` draws with no step
 * buttons, read off its pixels against a text input's and against a number input's without it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-field-forms-rendered-',
  compiledModules: ['src/ui/svelte/components/Field.svelte'],
  componentPath: 'src/ui/svelte/components/Field.svelte',
});

const RUNGS = Object.freeze([26, 28, 30, 34, 38]);
/** Each rung's corner, the radius ladder's band for its height. */
const CORNERS = Object.freeze({ 26: 7, 28: 7, 30: 7, 34: 9, 38: 9 });
const CAPTION = '<span>Check formula</span>';

/** Each case's `Field` props and the content a companion draws in its slot, keyed by `data-case`. */
const CASES = Object.freeze({
  'number-typed': [{ type: 'number', size: 30 }, '<input type="number" value="12">'],
  'number-twin': [{ size: 30 }, '<input type="text" value="12">'],
  'number-untyped': [{ size: 30 }, '<input type="number" value="12">'],
  ...Object.fromEntries(
    RUNGS.flatMap((size) => [
      [`rung-${size}`, [{ size }, `${CAPTION}<input type="text" value="1d20 + 4">`]],
      [
        `invalid-${size}`,
        [
          { size, invalid: true },
          `${CAPTION}<input type="text" value="1d20 +" aria-invalid="true">`,
        ],
      ],
    ])
  ),
  'textarea-26': [{ size: 26 }, `${CAPTION}<textarea>Notes</textarea>`],
  // The key without the control's own `aria-invalid`, and the attribute without the key.
  'invalid-key-only': [{ size: 30, invalid: true }, `${CAPTION}<input type="text" value="1d20 +">`],
  'invalid-aria-only': [
    { size: 30 },
    `${CAPTION}<input type="text" value="1d20 +" aria-invalid="true">`,
  ],
  serif: [{ face: 'serif' }, `${CAPTION}<input type="text" value="Moonlit Glade">`],
  mono: [{ face: 'mono' }, `${CAPTION}<input type="text" value="1d20 + 4">`],
});

let browser;
let tab;

before(async () => {
  const hosts = [];
  await harness.setup();
  try {
    for (const [id, [props, content]] of Object.entries(CASES)) {
      const column = (await harness.mount({ as: 'div', ...props })).firstElementChild;
      column.innerHTML = `<div>${content}</div>`;
      hosts.push(
        `<div data-case="${id}" style="width:240px;padding:8px">${column.outerHTML}</div>`
      );
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 640, height: 1600 } });
  await tab.setContent(
    `${renderedPageHead([])}<body class="game">` +
      `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif">` +
      `<i data-token="danger-border" style="color:var(--fab-danger-border)"></i>` +
      `<i data-token="danger-soft" style="color:var(--fab-danger-soft)"></i>` +
      `<i data-token="border" style="color:var(--fab-border)"></i>` +
      `${hosts.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const control = (id) => `[data-case="${id}"] :is(input, textarea)`;

/** The control's box and the computed figures the forms change. */
const measure = (id) =>
  tab.$eval(control(id), (element) => {
    const style = getComputedStyle(element);
    const caption = element.parentElement.querySelector('span');
    return {
      height: element.getBoundingClientRect().height,
      corner: style.borderTopLeftRadius,
      edge: style.borderTopColor,
      fill: style.backgroundColor,
      family: style.fontFamily,
      size: style.fontSize,
      captionFamily: caption ? getComputedStyle(caption).fontFamily : null,
      ring: [style.outlineStyle, style.outlineWidth, style.outlineOffset],
    };
  });

const token = (name) =>
  tab.$eval(`[data-token="${name}"]`, (probe) => getComputedStyle(probe).color);

/** Focuses the case's control, which a text-like input matches `:focus-visible` for, and measures it. */
async function focusedMeasure(id) {
  await tab.focus(control(id));
  const figures = await measure(id);
  await tab.$eval(control(id), (element) => element.blur());
  return figures;
}

describe('Field size, rendered (issue 2848)', () => {
  for (const size of RUNGS) {
    it(`draws a ${size}px input at radius ${CORNERS[size]}, and its inset ring at that height`, async () => {
      const rest = await measure(`rung-${size}`);
      assert.equal(rest.height, size);
      assert.equal(rest.corner, `${CORNERS[size]}px`);
      const focused = await focusedMeasure(`rung-${size}`);
      assert.deepEqual(focused.ring, ['solid', '1px', '-1px'], 'the 1px ring, inset over the edge');
      assert.equal(focused.height, size, 'focus moves nothing');
    });

    it(`draws the error state at ${size}px on the danger edge and fill, its ring over the edge`, async () => {
      const rest = await measure(`invalid-${size}`);
      assert.deepEqual(
        [rest.height, rest.corner, rest.edge, rest.fill],
        [size, `${CORNERS[size]}px`, await token('danger-border'), await token('danger-soft')]
      );
      assert.notEqual((await measure(`rung-${size}`)).edge, rest.edge, 'the valid edge differs');
      const focused = await focusedMeasure(`invalid-${size}`);
      assert.deepEqual(focused.ring, ['solid', '1px', '-1px'], 'the ring is drawn over the edge');
      assert.equal(focused.height, size, 'focus moves nothing');
    });
  }

  it('draws no error face unless the key and the control’s aria-invalid both say so', async () => {
    const valid = await measure('rung-30');
    for (const id of ['invalid-key-only', 'invalid-aria-only']) {
      const figures = await measure(id);
      assert.deepEqual([figures.edge, figures.fill], [valid.edge, valid.fill], id);
    }
  });

  it('keeps a textarea at its own height under the 26 rung', async () => {
    assert.ok((await measure('textarea-26')).height >= 92);
  });

  it('draws the valid edge in --fab-border, so the error edge is the change', async () => {
    assert.equal((await measure('rung-38')).edge, await token('border'));
  });
});

describe('Field face, rendered (issue 2848)', () => {
  for (const [id, family] of [
    ['serif', 'Spectral'],
    ['mono', 'JetBrains Mono'],
  ]) {
    it(`draws the ${id} face on the control alone, at the column's 12.5px`, async () => {
      const figures = await measure(id);
      assert.ok(figures.family.includes(family), figures.family);
      assert.equal(figures.size, '12.5px');
      assert.ok(!figures.captionFamily.includes(family), 'the caption keeps the column face');
    });
  }

  it('leaves the sans field in the face the column inherits', async () => {
    assert.ok((await measure('rung-38')).family.startsWith('Arial'));
  });
});

describe('Field type number, rendered (issue 2848)', () => {
  /**
   * The pixels of the trailing 24px inside a case's control, where Chromium draws step buttons, while
   * the pointer is over it; the text, which a number input lays out a subpixel apart, is left out.
   */
  async function hoveredShot(id) {
    await tab.hover(control(id));
    const box = await tab.locator(control(id)).boundingBox();
    const clip = { x: box.x + box.width - 25, y: box.y + 1, width: 24, height: box.height - 2 };
    const shot = await tab.screenshot({ clip });
    await tab.mouse.move(0, 0);
    return shot;
  }

  it('draws a number input with no step buttons: its trailing edge is a text input’s', async () => {
    const typed = await hoveredShot('number-typed');
    assert.ok(typed.equals(await hoveredShot('number-twin')), 'no step button is drawn');
    assert.ok(
      !typed.equals(await hoveredShot('number-untyped')),
      'without the type, the same input draws its step buttons'
    );
    assert.equal((await measure('number-typed')).height, 30, 'at the field’s rung');
  });

  it('keeps the arrow keys stepping it', async () => {
    await tab.focus(control('number-typed'));
    await tab.keyboard.press('ArrowUp');
    assert.equal(await tab.$eval(control('number-typed'), (input) => input.value), '13');
  });
});

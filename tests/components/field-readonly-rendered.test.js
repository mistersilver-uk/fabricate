/**
 * Issue 2938 — the published `Field`'s `readOnly`, measured in Chromium on columns `Field.svelte`
 * draws: the role, name and `readonly` state Chromium's own accessibility tree gives the control,
 * that it stays focusable and selectable and refuses typing, the dashed, unfilled face it draws
 * beside the editable one, the same ring, box and ink, the face under the error state, `size`,
 * `face`, `align` and the number `type`, and under forced colours; and that a value outside the
 * key's set, a control without the attribute and a column without the key draw the editable face.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromiumAxState } from '../helpers/chromiumAxNode.js';
import { chromium } from '../helpers/playwrightChromium.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-field-readonly-rendered-',
  compiledModules: ['src/ui/svelte/components/Field.svelte'],
  componentPath: 'src/ui/svelte/components/Field.svelte',
});

const CAPTION = '<span id="standing-caption">Standing</span>';
const NAMED = 'aria-labelledby="standing-caption"';
/** Each case's `Field` props and the control it draws; `ID` is replaced by the case id. */
const CASES = Object.freeze({
  editable: [{}, `<input type="text" value="Honoured" ${NAMED}>`],
  readonly: [{ readOnly: true }, `<input type="text" value="Honoured" readonly ${NAMED}>`],
  'readonly-textarea': [{ readOnly: true }, `<textarea readonly ${NAMED}>Honoured</textarea>`],
  'editable-textarea': [{}, `<textarea ${NAMED}>Honoured</textarea>`],
  'readonly-number': [
    { readOnly: true, type: 'number' },
    `<input type="number" value="12" readonly ${NAMED}>`,
  ],
  'editable-number': [{ type: 'number' }, `<input type="number" value="12" ${NAMED}>`],
  'attribute-only': [{}, `<input type="text" value="Honoured" readonly ${NAMED}>`],
  'key-only': [{ readOnly: true }, `<input type="text" value="Honoured" ${NAMED}>`],
  ...Object.fromEntries(
    ['true', 1, 'readonly', false, null, 'false'].map((value) => [
      `unknown-${typeof value}-${value}`,
      [{ readOnly: value }, `<input type="text" value="Honoured" readonly ${NAMED}>`],
    ])
  ),
  'readonly-invalid': [
    { readOnly: true, invalid: true },
    `<input type="text" value="Honoured" readonly aria-invalid="true" ${NAMED}>`,
  ],
  'invalid-only': [
    { invalid: true },
    `<input type="text" value="Honoured" aria-invalid="true" ${NAMED}>`,
  ],
  'readonly-26': [{ readOnly: true, size: 26 }, `<input type="text" value="Honoured" readonly>`],
  'editable-26': [{ size: 26 }, `<input type="text" value="Honoured">`],
  'readonly-mono-end': [
    { readOnly: true, face: 'mono', align: 'end' },
    `<input type="text" value="Honoured" readonly>`,
  ],
  'editable-mono-end': [{ face: 'mono', align: 'end' }, `<input type="text" value="Honoured">`],
  'readonly-select': [{ readOnly: true }, `<select ${NAMED}><option>Ash</option></select>`],
  'editable-select': [{}, `<select ${NAMED}><option>Ash</option></select>`],
  'readonly-search': [{ readOnly: true }, `<input type="search" value="ash" readonly>`],
  'editable-search': [{}, `<input type="search" value="ash">`],
});

const UNKNOWN = Object.keys(CASES).filter((each) => each.startsWith('unknown-'));

let browser;
let tab;

before(async () => {
  const hosts = [];
  await harness.setup();
  try {
    for (const [id, [props, content]] of Object.entries(CASES)) {
      const column = (await harness.mount({ as: 'div', ...props })).firstElementChild;
      column.innerHTML = `<div>${CAPTION}${content}</div>`;
      hosts.push(
        `<div data-case="${id}" style="display:inline-block;vertical-align:top;width:200px;padding:8px">${column.outerHTML}</div>`
      );
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 2400 } });
  // The same caption id repeats across cases, so each case names its own control instead.
  await tab.setContent(
    `${renderedPageHead([])}<body class="game">` +
      `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif">` +
      `<input id="scratch" aria-label="scratch">` +
      '<i data-system style="color:CanvasText"></i><i data-system style="color:ButtonText"></i>' +
      '<i data-system style="color:ButtonBorder"></i><i data-system style="color:FieldText"></i>' +
      '<i data-system style="color:GrayText"></i><i data-system-ground style="color:Canvas"></i>' +
      `${hosts.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
  await tab.evaluate(() => {
    for (const host of document.querySelectorAll('[data-case]')) {
      const id = `standing-caption-${host.dataset.case}`;
      const caption = host.querySelector('#standing-caption');
      if (caption) caption.id = id;
      for (const control of host.querySelectorAll('[aria-labelledby]')) {
        control.setAttribute('aria-labelledby', id);
      }
    }
  });
});

after(async () => {
  await browser?.close();
});

const control = (id) => `[data-case="${id}"] :is(input, textarea, select)`;
const column = (id) => `[data-case="${id}"] .fabricate-field`;

/** The figures the face is read from: edge, fill, ink, box and ring. */
const measure = (id) =>
  tab.$eval(control(id), (element) => {
    const style = getComputedStyle(element);
    const { width, height } = element.getBoundingClientRect();
    return {
      edge: [style.borderTopStyle, style.borderTopWidth, style.borderTopColor],
      fill: style.backgroundColor,
      ink: style.color,
      box: [width, height],
      padding: [style.paddingInlineStart, style.paddingInlineEnd],
      corner: style.borderTopLeftRadius,
      family: style.fontFamily,
      textAlign: style.textAlign,
      cursor: style.cursor,
    };
  });

/** Copies the focused control's selection, then pastes it into a scratch input and reads it back. */
async function pastedAfterCopy() {
  await tab.keyboard.press('Control+C');
  await tab.fill('#scratch', '');
  await tab.focus('#scratch');
  await tab.keyboard.press('Control+V');
  return tab.$eval('#scratch', (element) => element.value);
}

/** The figures a read-only face leaves alone: the edge's width and colour, ink, box and face. */
const restOf = ({ edge, fill: _fill, ...rest }) => ({ width: edge[1], color: edge[2], ...rest });

const DASHED_UNFILLED = (figures) =>
  figures.edge[0] === 'dashed' && figures.fill === 'rgba(0, 0, 0, 0)';

describe('Field readOnly, rendered (issue 2938)', () => {
  it('draws the column with its class and nothing else changed on the host', async () => {
    assert.equal(
      await tab.getAttribute(column('readonly'), 'class'),
      'fabricate-field is-readonly'
    );
    assert.equal(await tab.getAttribute(column('editable'), 'class'), 'fabricate-field');
  });

  describe('the accessibility tree', () => {
    for (const [id, role, editable] of [
      ['readonly', 'textbox', 'editable'],
      ['readonly-textarea', 'textbox', 'editable-textarea'],
    ]) {
      it(`announces the ${id} control as a read-only ${role} named by its caption`, async () => {
        const node = await chromiumAxState(tab, control(id));
        assert.equal(node.role, role);
        assert.equal(node.name, 'Standing');
        assert.equal(node.readonly, true, 'the read-only state');
        assert.equal(node.focusable, true, 'a read-only control is a tab stop');
        assert.equal(node.settable, undefined, 'its value cannot be set');
        assert.equal(node.disabled, undefined, 'not disabled');
        assert.equal(node.invalid, 'false', 'no error is announced');
        const open = await chromiumAxState(tab, control(editable));
        assert.deepEqual([open.readonly, open.settable], [false, true], 'the editable control');
      });
    }

    it('states a read-only number input as a spin button that cannot be set, with no read-only property', async () => {
      const node = await chromiumAxState(tab, control('readonly-number'));
      const open = await chromiumAxState(tab, control('editable-number'));
      assert.equal(node.role, 'spinbutton');
      assert.equal(node.name, 'Standing');
      assert.equal(node.focusable, true);
      assert.equal(node.settable, undefined, 'its value cannot be set');
      assert.equal(open.settable, true, 'the editable one can');
      assert.equal(node.readonly, undefined, 'Chromium states no read-only on a spin button');
    });

    it('states no read-only on the key alone, and states it on the attribute alone', async () => {
      assert.equal((await chromiumAxState(tab, control('key-only'))).readonly, false);
      assert.equal((await chromiumAxState(tab, control('attribute-only'))).readonly, true);
    });

    it('announces the read-only control as invalid when it also carries aria-invalid', async () => {
      const node = await chromiumAxState(tab, control('readonly-invalid'));
      assert.equal(node.readonly, true);
      assert.equal(node.invalid, 'true');
    });
  });

  describe('focus, selection and copy', () => {
    it('is reached by Tab and takes focus', async () => {
      await tab.focus(control('editable'));
      await tab.keyboard.press('Tab');
      assert.equal(
        await tab.evaluate(() => document.activeElement.closest('[data-case]').dataset.case),
        'readonly'
      );
      assert.equal(await tab.evaluate(() => document.activeElement.matches(':read-only')), true);
    });

    it('refuses typing and deletion on the input, the textarea and the number input', async () => {
      for (const id of ['readonly', 'readonly-textarea', 'readonly-number']) {
        await tab.focus(control(id));
        const before = await tab.$eval(control(id), (element) => element.value);
        await tab.keyboard.type('x9');
        await tab.keyboard.press('Backspace');
        await tab.keyboard.press('ArrowUp');
        assert.equal(await tab.$eval(control(id), (element) => element.value), before, id);
      }
    });

    it('selects its whole value and copies it', async () => {
      await tab.focus(control('readonly'));
      await tab.keyboard.press('Control+A');
      assert.equal(await tab.evaluate(() => getSelection().toString()), 'Honoured');
      assert.deepEqual(
        await tab.$eval(control('readonly'), (element) => [
          element.selectionStart,
          element.selectionEnd,
        ]),
        [0, 8]
      );
      assert.equal(await pastedAfterCopy(), 'Honoured');
    });

    it('selects a textarea’s value and a number input’s value', async () => {
      await tab.focus(control('readonly-textarea'));
      await tab.keyboard.press('Control+A');
      assert.equal(await tab.evaluate(() => getSelection().toString()), 'Honoured');
      await tab.focus(control('readonly-number'));
      await tab.keyboard.press('Control+A');
      assert.equal(await pastedAfterCopy(), '12');
    });
  });

  describe('the face', () => {
    it('draws a dashed edge on no fill, where the editable control draws a solid one on a fill', async () => {
      const [read, edit] = [await measure('readonly'), await measure('editable')];
      assert.ok(DASHED_UNFILLED(read), JSON.stringify(read));
      assert.equal(edit.edge[0], 'solid');
      assert.notEqual(edit.fill, 'rgba(0, 0, 0, 0)');
    });

    it('keeps the editable control’s edge width and colour, ink, box, corner and face', async () => {
      for (const [read, edit] of [
        ['readonly', 'editable'],
        ['readonly-number', 'editable-number'],
        ['readonly-26', 'editable-26'],
        ['readonly-mono-end', 'editable-mono-end'],
      ]) {
        const [readFigures, editFigures] = [await measure(read), await measure(edit)];
        assert.deepEqual(restOf(readFigures), restOf(editFigures), read);
        assert.notEqual(readFigures.fill, editFigures.fill, `${read}: the fill is what changes`);
      }
    });

    it('draws a textarea the same way, and keeps its height', async () => {
      const [read, edit] = [await measure('readonly-textarea'), await measure('editable-textarea')];
      assert.ok(DASHED_UNFILLED(read));
      assert.deepEqual(read.box, edit.box);
    });

    it('draws the number input dashed too, with no step buttons', async () => {
      assert.ok(DASHED_UNFILLED(await measure('readonly-number')));
      assert.equal(
        await tab.$eval(
          control('readonly-number'),
          (element) => getComputedStyle(element).appearance
        ),
        'textfield'
      );
    });

    it('keeps the rung, the face and the alignment the other keys write', async () => {
      assert.ok(DASHED_UNFILLED(await measure('readonly-26')));
      assert.deepEqual((await measure('readonly-26')).box, (await measure('editable-26')).box);
      const mono = await measure('readonly-mono-end');
      assert.ok(DASHED_UNFILLED(mono));
      assert.ok(mono.family.includes('JetBrains Mono'));
      assert.equal(mono.textAlign, 'end');
    });

    it('draws the same keyboard ring as the editable control, at rest and focused', async () => {
      const ringOf = async (id) => {
        await tab.focus(control(id));
        await tab.keyboard.press('Tab');
        await tab.keyboard.press('Shift+Tab');
        const ring = await tab.$eval(control(id), (element) => {
          const style = getComputedStyle(element);
          return [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor];
        });
        return ring;
      };
      const read = await ringOf('readonly');
      assert.deepEqual(read, await ringOf('editable'));
      assert.equal(read[0], 'solid');
      assert.equal(read[1], '1px');
    });

    it('keeps the danger edge colour and fill under the error state, dashed', async () => {
      const [both, only] = [await measure('readonly-invalid'), await measure('invalid-only')];
      assert.equal(both.edge[0], 'dashed');
      assert.equal(only.edge[0], 'solid');
      assert.equal(both.edge[2], only.edge[2], 'the danger edge colour');
      assert.equal(both.fill, only.fill, 'the danger fill');
      assert.notEqual(both.fill, 'rgba(0, 0, 0, 0)');
    });

    it('reaches no select and no search input in the slot', async () => {
      assert.deepEqual(await measure('readonly-select'), await measure('editable-select'));
      assert.deepEqual(await measure('readonly-search'), await measure('editable-search'));
    });
  });

  describe('a key or attribute missing, or a value outside the set', () => {
    it('draws the editable face for the attribute alone and for the key alone', async () => {
      const editable = await measure('editable');
      assert.deepEqual(await measure('attribute-only'), editable);
      assert.deepEqual(await measure('key-only'), editable);
    });

    for (const id of UNKNOWN) {
      it(`${id} draws the editable face, with no class on the column`, async () => {
        assert.deepEqual(await measure(id), await measure('attribute-only'));
        assert.equal(await tab.getAttribute(column(id), 'class'), 'fabricate-field');
      });
    }
  });

  describe('forced colours', () => {
    it('keeps the dashed edge and its width, in a system colour that is not the ground, apart from the solid one', async () => {
      await tab.emulateMedia({ forcedColors: 'active' });
      try {
        const [read, edit, both] = [
          await measure('readonly'),
          await measure('editable'),
          await measure('readonly-invalid'),
        ];
        assert.equal(read.edge[0], 'dashed');
        assert.equal(read.edge[1], '1px');
        const system = await tab.$$eval('[data-system]', (probes) =>
          probes.map((probe) => getComputedStyle(probe).color)
        );
        const ground = await tab.$eval(
          '[data-system-ground]',
          (probe) => getComputedStyle(probe).color
        );
        assert.ok(
          system.includes(read.edge[2]),
          `a system colour, not ${read.edge[2]} in ${system}`
        );
        assert.notEqual(read.edge[2], ground, 'not the ground it sits on');
        assert.equal(edit.edge[0], 'solid');
        assert.equal(both.edge[0], 'dashed', 'the error state keeps the dash');
        const node = await chromiumAxState(tab, control('readonly'));
        assert.equal(node.readonly, true, 'the announcement does not depend on colour');
      } finally {
        await tab.emulateMedia({ forcedColors: 'none' });
      }
    });
  });
});

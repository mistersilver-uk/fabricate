/**
 * Issue 2900 — the published `Field`'s `align`, measured in Chromium on columns `Field.svelte`
 * draws: the computed `text-align` of a text input, a number input under `type` `'number'` and a
 * textarea, and where the typed text and the placeholder are drawn inside the control, read off its
 * pixels, in left-to-right and right-to-left documents, under each face and a small rung; and that
 * the key moves no box, ring or colour and reaches no select, search or stepper input.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-field-align-rendered-',
  compiledModules: ['src/ui/svelte/components/Field.svelte'],
  componentPath: 'src/ui/svelte/components/Field.svelte',
});

const CAPTION = '<span>Threshold</span>';
/** Each control a case draws, the `Field` props it needs beyond `align`, and its markup. */
const CONTROLS = Object.freeze({
  text: [{}, '<input type="text" value="1250">'],
  placeholder: [{}, '<input type="text" placeholder="1250">'],
  number: [{ type: 'number' }, '<input type="number" value="1250">'],
  textarea: [{}, '<textarea>1250</textarea>'],
});
/** Each `align` a case passes, and the edge it draws on in a left-to-right document. */
const ALIGNS = Object.freeze([
  [undefined, 'start'],
  ['start', 'start'],
  ['center', 'center'],
  ['end', 'end'],
  ['Center', 'start'],
  ['right', 'start'],
]);
const DIRS = Object.freeze(['ltr', 'rtl']);
const caseId = (control, align, dir) => `${control}-${align ?? 'omitted'}-${dir}`;

/** Each case's `Field` props, its slot content and its document direction, keyed by `data-case`. */
const CASES = Object.freeze({
  ...Object.fromEntries(
    DIRS.flatMap((dir) =>
      Object.entries(CONTROLS).flatMap(([control, [props, markup]]) =>
        ALIGNS.map(([align]) => [
          caseId(control, align, dir),
          [align === undefined ? props : { ...props, align }, markup, dir],
        ])
      )
    )
  ),
  ...Object.fromEntries(
    ['serif', 'mono'].flatMap((face) =>
      ['center', 'end'].map((align) => [
        `${face}-${align}`,
        [{ face, align }, '<input type="text" value="1250">', 'ltr'],
      ])
    )
  ),
  'rung-26-center': [{ size: 26, align: 'center' }, '<input type="text" value="1250">', 'ltr'],
  'rung-26': [{ size: 26 }, '<input type="text" value="1250">', 'ltr'],
  'invalid-center': [
    { invalid: true, align: 'center' },
    '<input type="text" value="1250" aria-invalid="true">',
    'ltr',
  ],
  'select-center': [{ align: 'center' }, '<select><option>Ash</option></select>', 'ltr'],
  'search-center': [{ align: 'center' }, '<input type="search" value="ash">', 'ltr'],
  'stepper-center': [{ align: 'center' }, '<input class="fab-stepper-input" value="3">', 'ltr'],
});

let browser;
let tab;

before(async () => {
  const hosts = [];
  await harness.setup();
  try {
    for (const [id, [props, content, dir]] of Object.entries(CASES)) {
      const column = (await harness.mount({ as: 'div', ...props })).firstElementChild;
      column.innerHTML = `<div>${CAPTION}${content}</div>`;
      hosts.push(
        `<div data-case="${id}" dir="${dir}" style="display:inline-block;vertical-align:top;width:200px;padding:8px">${column.outerHTML}</div>`
      );
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 2400 } });
  await tab.setContent(
    `${renderedPageHead([])}<body class="game">` +
      `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif">` +
      `${hosts.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const control = (id) => `[data-case="${id}"] :is(input, textarea, select)`;

/** The control's box, its computed alignment and the figures `align` must leave alone. */
const measure = (id) =>
  tab.$eval(control(id), (element) => {
    const style = getComputedStyle(element);
    const { width, height } = element.getBoundingClientRect();
    return {
      textAlign: style.textAlign,
      box: [width, height],
      padding: [style.paddingInlineStart, style.paddingInlineEnd],
      corner: style.borderTopLeftRadius,
      ink: [style.color, style.backgroundColor, style.borderTopColor],
      family: style.fontFamily,
      ring: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
    };
  });

/**
 * The drawn text's horizontal insets inside the control's border box, in CSS pixels: the columns
 * from each side to the first one where a pixel in the text's rows departs from that row's fill.
 */
async function textInsets(id) {
  const shot = [...(await tab.locator(control(id)).screenshot())];
  const { height } = await tab.$eval(control(id), (element) => element.getBoundingClientRect());
  // A textarea's first line sits at its top padding; an input's text is centred in its height.
  const rows = id.startsWith('textarea') ? [8, 22] : [height * 0.25, height * 0.75];
  return tab.evaluate(
    async ([bytes, [top, bottom]]) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data, width } = context.getImageData(0, 0, image.width, image.height);
      const inked = [];
      for (let y = Math.round(top); y < Math.round(bottom); y += 1) {
        const at = (x) => (y * width + x) * 4;
        const fill = at(3);
        for (let x = 3; x < width - 3; x += 1) {
          const diff =
            Math.abs(data[at(x)] - data[fill]) +
            Math.abs(data[at(x) + 1] - data[fill + 1]) +
            Math.abs(data[at(x) + 2] - data[fill + 2]);
          if (diff > 60) inked.push(x);
        }
      }
      if (inked.length === 0) return null;
      return { left: Math.min(...inked), right: width - 1 - Math.max(...inked) };
    },
    [shot, rows]
  );
}

/** The edge `drawn` (`start`, `center` or `end`) lands on in a document of `dir`. */
const physical = (drawn, dir) =>
  drawn === 'center' ? 'center' : (drawn === 'start') === (dir === 'ltr') ? 'left' : 'right';

/** Asserts the text sits at `edge`: within the padding and a glyph's bearing of it, or centred. */
function assertDrawnAt(insets, edge, message) {
  assert.ok(insets, `${message}: the text is drawn`);
  const { left, right } = insets;
  if (edge === 'center') {
    assert.ok(Math.abs(left - right) <= 2, `${message}: centred, ${left} | ${right}`);
  } else {
    const [near, far] = edge === 'left' ? [left, right] : [right, left];
    assert.ok(near <= 12, `${message}: at the ${edge} padding, ${near}px in`);
    assert.ok(far > near + 40, `${message}: away from the other edge, ${far}px in`);
  }
}

describe('Field align, rendered (issue 2900)', () => {
  for (const dir of DIRS) {
    for (const controlName of Object.keys(CONTROLS)) {
      for (const [align, drawn] of ALIGNS) {
        const id = caseId(controlName, align, dir);
        it(`draws the ${controlName} ${drawn}-aligned for ${JSON.stringify(align)} in ${dir}`, async () => {
          assert.equal((await measure(id)).textAlign, drawn);
          assertDrawnAt(await textInsets(id), physical(drawn, dir), id);
        });
      }
    }
  }

  for (const id of ['serif-center', 'serif-end', 'mono-center', 'mono-end', 'rung-26-center']) {
    it(`keeps the alignment under ${id}`, async () => {
      const drawn = id.endsWith('end') ? 'end' : 'center';
      assert.equal((await measure(id)).textAlign, drawn);
      assertDrawnAt(await textInsets(id), physical(drawn, 'ltr'), id);
    });
  }

  it('keeps the face it is drawn with', async () => {
    assert.ok((await measure('serif-center')).family.includes('Spectral'));
    assert.ok((await measure('mono-end')).family.includes('JetBrains Mono'));
  });

  it('moves no box, corner, padding or colour, at rest or with the keyboard ring', async () => {
    for (const [plain, aligned] of [
      ['text-omitted-ltr', 'text-center-ltr'],
      ['text-omitted-ltr', 'text-end-ltr'],
      ['number-omitted-rtl', 'number-end-rtl'],
      ['textarea-omitted-ltr', 'textarea-center-ltr'],
      ['rung-26', 'rung-26-center'],
    ]) {
      const strip = (figures) => ({ ...figures, textAlign: undefined });
      assert.deepEqual(strip(await measure(aligned)), strip(await measure(plain)), aligned);
      await tab.focus(control(aligned));
      const focused = await measure(aligned);
      await tab.$eval(control(aligned), (element) => element.blur());
      await tab.focus(control(plain));
      const plainFocused = await measure(plain);
      await tab.$eval(control(plain), (element) => element.blur());
      assert.deepEqual(focused.ring, plainFocused.ring, `${aligned}: the same ring`);
      assert.deepEqual(focused.box, plainFocused.box, `${aligned}: focus moves nothing`);
    }
  });

  it('draws the error state centred, on the same box', async () => {
    assert.equal((await measure('invalid-center')).textAlign, 'center');
    assertDrawnAt(await textInsets('invalid-center'), 'center', 'invalid-center');
  });

  it('reaches no select, search input or stepper input in the slot', async () => {
    for (const id of ['select-center', 'search-center', 'stepper-center']) {
      assert.notEqual((await measure(id)).textAlign, 'center', id);
    }
  });

  it('keeps the alignment in forced-colors mode', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      for (const [id, edge] of [
        ['text-center-ltr', 'center'],
        ['placeholder-end-ltr', 'right'],
        ['textarea-end-rtl', 'left'],
      ]) {
        assertDrawnAt(await textInsets(id), edge, `${id}, forced colours`);
      }
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});

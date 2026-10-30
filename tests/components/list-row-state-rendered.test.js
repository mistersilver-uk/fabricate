/**
 * Issue 2851 — a read-only `ListRow`'s selected face and a busy row, measured in Chromium: the face
 * paints the active wash and the accent edge on each of the four grounds a published row is
 * mounted on without moving the row's box, and the spinner takes the mark's box exactly, with the
 * busy button under the progress cursor and refusing the hover wash.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-list-row-state-rendered-',
  compiledModules: ['Medallion', 'ListRow'].map(component),
  componentPath: component('ListRow'),
});

const open = () => {};
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const ROW = { name: 'Second stage: quench the blade', markSize: 28, detail: 'Stage 2 of 3' };

/** Each case's row and the ground its host paints. */
const CASES = Object.freeze({
  plain: [ROW, '--fab-bg-2'],
  ...Object.fromEntries(
    GROUNDS.map((ground) => [
      `face${ground}`,
      [{ ...ROW, selected: true, current: 'step' }, ground],
    ])
  ),
  busy: [{ ...ROW, busy: true, art: 'icons/svg/item-bag.svg' }, '--fab-bg-2'],
  open: [{ ...ROW, onOpen: open }, '--fab-bg-2'],
  busyOpen: [{ ...ROW, onOpen: open, busy: true }, '--fab-bg-2'],
});

let browser;
let tab;

before(async () => {
  const hosts = [];
  await harness.setup();
  try {
    for (const [id, [props, ground]] of Object.entries(CASES)) {
      const markup = (await harness.mount(props)).innerHTML;
      harness.remount();
      hosts.push(
        `<div data-case="${id}" style="width:320px;padding:8px;background:var(${ground})">${markup}</div>`
      );
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  await tab.setContent(
    `${renderedPageHead(['Medallion'])}<body class="game">` +
      `<div class="fabricate fabricate-app">${hosts.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** A case's row: its box, fill, edge and inset, its mark's box against the row, and its control's cursor. */
const rowOf = (caseId) =>
  tab.evaluate((id) => {
    const row = document.querySelector(`[data-case="${id}"] .fabricate-list-row`);
    const style = getComputedStyle(row);
    const box = row.getBoundingClientRect();
    const mark = row.querySelector('.fab-medallion').getBoundingClientRect();
    const control = row.querySelector('.fabricate-list-row-open');
    return {
      height: box.height,
      padding: [style.paddingTop, style.paddingLeft],
      fill: style.backgroundColor,
      edge: style.borderTopColor,
      mark: [mark.left - box.left, mark.top - box.top, mark.width, mark.height],
      glyph: [...row.querySelectorAll(':scope .fab-medallion i')].map((i) => i.className),
      images: row.querySelectorAll(':scope .fab-medallion img').length,
      cursor: control ? getComputedStyle(control).cursor : null,
    };
  }, caseId);

/** What a `--fab-*` token computes to as `property` under the Fabricate root. */
const tokenAs = (token, property) =>
  tab.evaluate(
    ([name, prop]) => {
      const probe = document.createElement('i');
      probe.style.setProperty(prop, `var(${name})`);
      document.querySelector('.fabricate-app').append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [token, property]
  );

describe('ListRow selected without onOpen, rendered (issue 2851)', () => {
  for (const ground of GROUNDS) {
    it(`paints the active wash and the accent edge on ${ground}, at the plain row's box`, async () => {
      const plain = await rowOf('plain');
      const face = await rowOf(`face${ground}`);
      assert.equal(face.fill, await tokenAs('--fab-surface-active', 'background-color'));
      assert.equal(face.edge, await tokenAs('--fab-accent-border', 'border-top-color'));
      assert.notEqual(face.fill, plain.fill, 'not the plain row’s fill');
      assert.deepEqual(
        [face.height, face.padding, face.mark],
        [plain.height, plain.padding, plain.mark],
        'the same box, inset and mark'
      );
    });
  }
});

describe('ListRow busy, rendered (issue 2851)', () => {
  it('draws the spinner in the mark’s box, in place of the art, and the row keeps its height', async () => {
    const plain = await rowOf('plain');
    const busy = await rowOf('busy');
    assert.deepEqual([busy.mark, busy.height], [plain.mark, plain.height]);
    assert.equal(busy.images, 0, 'no art');
    assert.equal(busy.glyph.length, 1);
    assert.match(busy.glyph[0], /\bfa-spinner\b.*\bfa-spin\b/u);
  });

  it('shows the progress cursor on a busy button, where an idle one shows the pointer', async () => {
    assert.equal((await rowOf('open')).cursor, 'pointer');
    assert.equal((await rowOf('busyOpen')).cursor, 'progress');
  });

  it('lights an idle button’s row on hover and leaves a busy one on the plain fill', async () => {
    const plain = await rowOf('plain');
    const hovered = async (caseId) => {
      await tab.hover(`[data-case="${caseId}"] .fabricate-list-row-open`);
      const { fill } = await rowOf(caseId);
      await tab.mouse.move(0, 0);
      return fill;
    };
    assert.notEqual(await hovered('open'), plain.fill, 'an idle row takes the hover wash');
    assert.equal(await hovered('busyOpen'), plain.fill, 'a busy row refuses it');
  });
});

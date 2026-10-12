/**
 * Issue 2463 — the Stepper computes the type its library entry states: the value at 11.5px with
 * tabular figures, the adjunct glyph at 9px and a disabled group at opacity .45, at every density
 * and in the formatted mode, under the layered module sheet and a host that restyles bare inputs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const COUNT = Object.freeze({ value: 3, min: 0, max: 9, ariaLabel: 'Count' });

/** Each mount: its props, the host class around it and the slot width it is laid out in. */
const MOUNTS = Object.freeze({
  default: { props: COUNT },
  comfortable: { props: { ...COUNT, density: 'comfortable' } },
  fill: { props: { ...COUNT, fill: true } },
  disabled: { props: { ...COUNT, disabled: true } },
  endpoint: {
    props: { value: null, nullLabel: 'Otherwise', formatValue: String, parseValue: Number },
  },
  // The gathering task editor restyles every bare input it holds; the bare control proves it is live.
  hosted: { props: COUNT, host: 'manager-gathering-task-edit-view', bare: true },
  vertical: { props: { ...COUNT, orientation: 'vertical' }, width: 48 },
});
const HORIZONTAL = Object.keys(MOUNTS).filter((key) => key !== 'vertical');

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, STEPPER)).css}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${Object.entries(MOUNTS)
  .map(([key, { host = '', width, bare }]) => {
    const slot = width ? ` style="width:${width}px"` : '';
    const beside = bare ? '<input type="number" data-bare>' : '';
    return `<div data-case="${key}" class="${host}"${slot}>${markup[key]}${beside}</div>`;
  })
  .join('\n')}
</div></body></html>`;

/** Each mounted case's computed type, group opacity and box, read in the browser. */
function readMounted() {
  const read = (host) => {
    const root = host.querySelector('.fab-stepper');
    const input = getComputedStyle(root.querySelector('[data-stepper-input]'));
    const box = root.getBoundingClientRect();
    const bare = host.querySelector('[data-bare]');
    return {
      value: `${input.fontSize} ${input.fontVariantNumeric}`,
      glyphs: [...root.querySelectorAll(':scope > .fab-stepper-adjunct > i')].map(
        (glyph) => getComputedStyle(glyph).fontSize
      ),
      opacity: Number(getComputedStyle(root).opacity),
      box: `${box.width}x${box.height}`,
      bareMinHeight: bare ? getComputedStyle(bare).minHeight : null,
    };
  };
  return {
    rootPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    cases: Object.fromEntries(
      [...document.querySelectorAll('[data-case]')].map((host) => [host.dataset.case, read(host)])
    ),
  };
}

let browser;
let live;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-stepper-type-',
    compiledModules: [STEPPER],
    componentPath: STEPPER,
  });
  await harness.setup();
  const markup = {};
  try {
    for (const [key, { props }] of Object.entries(MOUNTS)) {
      markup[key] = (await harness.mount(props)).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
  live = await tab.evaluate(readMounted);
});

after(async () => {
  await browser?.close();
});

it('anchors every figure below on a 16px root', () => {
  assert.equal(live.rootPx, 16);
  assert.deepEqual(Object.keys(live.cases), Object.keys(MOUNTS), 'every mount is drawn');
});

it('draws a horizontal value at 11.5px tabular and its glyphs at 9px', () => {
  for (const key of HORIZONTAL) {
    assert.equal(live.cases[key].value, '11.5px tabular-nums', `${key} value`);
    assert.deepEqual(live.cases[key].glyphs, ['9px', '9px'], `${key} glyphs`);
  }
});

it('draws the vertical value at 1.05rem tabular and its glyphs at 11px', () => {
  assert.equal(live.cases.vertical.value, '16.8px tabular-nums');
  assert.deepEqual(live.cases.vertical.glyphs, ['11px', '11px']);
});

it('dims a disabled group to .45 and no other', () => {
  for (const [key, { opacity }] of Object.entries(live.cases)) {
    assert.equal(opacity, key === 'disabled' ? 0.45 : 1, `${key} opacity`);
  }
});

it('keeps its type inside a host whose input rule is live', () => {
  assert.equal(live.cases.hosted.bareMinHeight, '34px', 'the host rule reaches a bare input');
  assert.equal(live.cases.hosted.value, '11.5px tabular-nums');
});

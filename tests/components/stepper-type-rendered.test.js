/**
 * Issue 2463 — the Stepper computes the type its library entry states: the value at 11.5px with
 * tabular figures, the adjunct glyph at 9px and a disabled group at opacity .45, at every density
 * and in the formatted mode, under the layered module sheet and a host that restyles bare inputs.
 * The library's `.k-step` drawings measure the boxes it ships.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { readDesignLibrary } from '../helpers/designLibrary.js';
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
  'disabled-comfortable': { props: { ...COUNT, disabled: true, density: 'comfortable' } },
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
      inputMinWidth: input.minWidth,
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

/** The `<Stepper>` entry's drawn units, and the box of every horizontal `.k-step` on the page. */
function readDrawn() {
  const size = (element) => {
    const box = element.getBoundingClientRect();
    return `${box.width}x${box.height}`;
  };
  const entry = [...document.querySelectorAll('.spec')].find(
    (spec) => spec.querySelector(':scope > .spec-head > h4')?.textContent === '<Stepper>'
  );
  const units = [...entry.querySelectorAll(':scope .unit')].map((unit) => {
    const step = unit.querySelector(':scope .k-step');
    return [
      unit.querySelector(':scope > .cap').textContent,
      { box: size(step), opacity: Number(getComputedStyle(step).opacity) },
    ];
  });
  return {
    units: Object.fromEntries(units),
    horizontal: [...document.querySelectorAll('.k-step:not(.vert)')]
      .filter((step) => !step.closest('.k-stepset'))
      .map((step) => ({
        entry: step.closest('.spec')?.querySelector(':scope > .spec-head > h4')?.textContent ?? '',
        box: size(step),
      })),
  };
}

let browser;
let live;
let drawn;

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
  await tab.route(/^https?:/u, (route) => route.abort());
  await tab.setContent(readDesignLibrary());
  drawn = await tab.evaluate(readDrawn);
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

it('dims a disabled group to .45 at either density, and no other', () => {
  for (const [key, { opacity }] of Object.entries(live.cases)) {
    assert.equal(opacity, key.startsWith('disabled') ? 0.45 : 1, `${key} opacity`);
  }
});

it('keeps its type inside a host whose input rule is live', () => {
  assert.equal(live.cases.hosted.bareMinHeight, '34px', 'the host rule reaches a bare input');
  assert.notEqual(live.cases.default.inputMinWidth, '0px', 'no other rule zeroes the input');
  assert.equal(live.cases.hosted.inputMinWidth, '0px', 'the host font rule reaches the stepper');
  assert.equal(live.cases.hosted.value, '11.5px tabular-nums');
});

it('draws each library unit at the box and opacity its mount ships', () => {
  const pairs = {
    integer: 'default',
    comfortable: 'comfortable',
    'vertical · in a 48px slot': 'vertical',
  };
  const boxes = Object.entries(pairs).map(([cap, key]) => [
    drawn.units[cap].box,
    live.cases[key].box,
  ]);
  assert.deepEqual(boxes, [
    ['102x28', '102x28'],
    ['106x30', '106x30'],
    ['48x86', '48x86'],
  ]);
  assert.equal(drawn.units.disabled.opacity, live.cases.disabled.opacity);
});

it('draws every horizontal library stepper at a shipped box', () => {
  const endpoint = drawn.units['formatted · null endpoint'].box;
  assert.equal(endpoint, '118x28', 'the endpoint draws its 64px floor');
  const boxes = drawn.horizontal.map(({ box }) => box);
  assert.equal(boxes.filter((box) => box === endpoint).length, 1);
  assert.deepEqual(
    new Set(boxes),
    new Set(['102x28', '106x30', '84x28', endpoint]),
    'the default, the comfortable, the 30px-input and the endpoint groups, and no other'
  );
});

it('draws the narrow and the comfortable group only in the entries that ship them', () => {
  const entriesAt = (size) =>
    [...new Set(drawn.horizontal.filter(({ box }) => box === size).map(({ entry }) => entry))].sort(
      byCodePoint
    );
  const narrow = entriesAt('84x28');
  assert.deepEqual(narrow, [
    '<BulkStagingInset>',
    'Routed by check',
    'Routed by ingredients',
    'The two sets',
  ]);
  assert.deepEqual(
    drawn.horizontal.filter(({ entry, box }) => narrow.includes(entry) && box !== '84x28'),
    [],
    'an entry whose component caps the input at 30px draws no wider stepper'
  );
  assert.deepEqual(entriesAt('106x30'), [
    '<EssencePool>',
    '<ExprInput> <RequirementChooser>',
    '<Stepper>',
  ]);
});

/**
 * Issue 2365 — every drawn `.k-seg` in the design library paints its form as `SegmentedControl`
 * ships it. Each `--fab-*` token is pinned to a unique sentinel colour on both pages, so a computed
 * colour reads back as the token it came from, and the only differing pairs are the named D1 inks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const COMPONENT = 'src/ui/svelte/components/SegmentedControl.svelte';
const library = readFileSync(
  resolve(repoRoot, 'openspec/specs/design-system/library.html'),
  'utf8'
);
const shipped = scopedComponentCss(resolve(repoRoot, COMPONENT));

/** Each form: the props its callers pass, the drawn well that draws it, and how many uses draw it. */
const FORMS = Object.freeze({
  default: { props: {}, drawn: '.k-seg:not(.tag, .inline, .field)', uses: 10 },
  tag: { props: { tone: 'tag' }, drawn: '.k-seg.tag:not(.inline, .field)', uses: 4 },
  inline: { props: { density: 'inline' }, drawn: '.k-seg.inline:not(.tag)', uses: 30 },
  field: { props: { density: 'field' }, drawn: '.k-seg.field:not(.tag)', uses: 1 },
  // The tag track on the 30 and 34 rungs: one specimen each, and no caller yet.
  tagInline: { props: { tone: 'tag', density: 'inline' }, drawn: '.k-seg.tag.inline', uses: 1 },
  tagField: { props: { tone: 'tag', density: 'field' }, drawn: '.k-seg.tag.field', uses: 1 },
});

/** D1: the shipped idle ink measures under 4.5:1 at these sizes, so the drawing passes (#2368). */
const D1 = Object.freeze(
  ['tag', 'inline', 'field', 'tagInline', 'tagField'].map((form) => ({
    pair: `${form} idle color`,
    drawn: '--fab-text-muted',
    shipped: '--fab-text-subtle',
  }))
);

const tokens = [
  ...new Set([...`${library}\n${shipped.css}`.matchAll(/--fab-[a-z0-9-]+/g)].map(([t]) => t)),
];
const sentinel = (index) => `rgb(251, ${Math.floor(index / 250) + 1}, ${(index % 250) + 1})`;
const SENTINEL_STYLE = `<style>*{${tokens.map((t, i) => `${t}:${sentinel(i)} !important`).join(';')}}</style>`;

let browser;
let paints;

/** Reads a well's paint and its idle and chosen segments' paint, in the browser. */
function readPaint({ wells, segment, chosen, tokenNames }) {
  const name = (value) => {
    const index = value.match(/^rgb\(251, (\d+), (\d+)\)$/);
    if (index) return tokenNames[(Number(index[1]) - 1) * 250 + Number(index[2]) - 1];
    return value === 'rgba(0, 0, 0, 0)' ? 'transparent' : value;
  };
  const edge = (style) =>
    style.borderTopStyle === 'none' || style.borderTopWidth === '0px'
      ? 'none'
      : name(style.borderTopColor);
  const paint = (element, withInk) => {
    const style = getComputedStyle(element);
    const read = { background: name(style.backgroundColor), 'border-color': edge(style) };
    return withInk ? { ...read, color: name(style.color), 'font-weight': style.fontWeight } : read;
  };
  return [...document.querySelectorAll(wells)].map((well) => {
    const segments = [...well.querySelectorAll(segment)];
    return {
      well: paint(well, false),
      idle: segments.filter((el) => !el.matches(chosen)).map((el) => paint(el, true)),
      chosen: segments.filter((el) => el.matches(chosen)).map((el) => paint(el, true)),
    };
  });
}

async function shippedMarkup() {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-segmented-parity-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
    compiledModules: [COMPONENT],
    componentPath: COMPONENT,
  });
  await harness.setup();
  const options = [
    { value: 'a', fallback: 'A' },
    { value: 'b', fallback: 'B' },
  ];
  const markup = {};
  try {
    for (const [form, { props }] of Object.entries(FORMS)) {
      const root = await harness.mount({ options, value: 'b', groupName: form, ...props });
      markup[form] = `<div data-form="${form}">${root.innerHTML}</div>`;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  return markup;
}

before(async () => {
  const markup = await shippedMarkup();
  browser = await chromium.launch();
  const tab = await browser.newPage();
  await tab.route(/^https?:/, (route) => route.abort());
  await tab.setContent(library.replace('</head>', `${SENTINEL_STYLE}</head>`));
  const drawn = {};
  for (const [form, { drawn: wells }] of Object.entries(FORMS)) {
    drawn[form] = await tab.evaluate(readPaint, {
      wells,
      segment: ':scope > button',
      chosen: '.sel',
      tokenNames: tokens,
    });
  }
  await tab.setContent(
    `<!doctype html><html><head><style>${shipped.css}</style>${SENTINEL_STYLE}</head><body>${Object.values(markup).join('')}</body></html>`
  );
  const live = {};
  for (const form of Object.keys(FORMS)) {
    live[form] = await tab.evaluate(readPaint, {
      wells: `[data-form="${form}"] > .manager-segmented`,
      segment: ':scope > .manager-segment',
      chosen: '.is-active',
      tokenNames: tokens,
    });
  }
  paints = { drawn, live };
});

after(async () => {
  await browser?.close();
});

/** One paint per part for a form, failing when two drawn uses of that form paint differently. */
function onePaint(side, form) {
  const wells = paints[side][form];
  assert.ok(wells.length > 0, `${side} draws no ${form} well`);
  const parts = {};
  for (const part of ['well', 'idle', 'chosen']) {
    const distinct = [
      ...new Set(
        wells.flatMap((w) => (part === 'well' ? [w.well] : w[part])).map((p) => JSON.stringify(p))
      ),
    ];
    assert.equal(
      distinct.length,
      1,
      `${side} ${form} ${part} paints ${distinct.length} ways: ${distinct.join(' | ')}`
    );
    parts[part] = JSON.parse(distinct[0]);
  }
  return parts;
}

it('draws each form at the uses its callers assign it', () => {
  for (const [form, { uses }] of Object.entries(FORMS)) {
    assert.equal(
      paints.drawn[form].length,
      uses,
      `the library draws ${form} at the wrong number of uses`
    );
  }
});

it('reads a non-empty paint from every drawn and shipped form', () => {
  for (const side of ['drawn', 'live']) {
    for (const form of Object.keys(FORMS)) {
      for (const [part, paint] of Object.entries(onePaint(side, form))) {
        for (const [property, value] of Object.entries(paint)) {
          assert.ok(value, `${side} ${form} ${part} ${property} is empty`);
        }
      }
    }
  }
});

it('draws each form in the shipped tokens, except the named D1 inks', () => {
  const differing = [];
  for (const form of Object.keys(FORMS)) {
    const drawn = onePaint('drawn', form);
    const live = onePaint('live', form);
    for (const [part, paint] of Object.entries(live)) {
      for (const [property, value] of Object.entries(paint)) {
        if (drawn[part][property] !== value) {
          differing.push({
            pair: `${form} ${part} ${property}`,
            drawn: drawn[part][property],
            shipped: value,
          });
        }
      }
    }
  }
  assert.deepEqual(differing, D1);
});

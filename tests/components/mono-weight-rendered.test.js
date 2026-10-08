/**
 * Issue 1523 — text computes a weight on the 400-700 ramp, and the mono face, which ships 400 and
 * 500 only, nothing above 500. The debt gate joins a weight to its family by selector, so it cannot
 * see a weight reaching text from another rule, a host or the user agent's `bolder`; these are the
 * cases the rendered audit found, measured in Chromium.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const label = (html) => createRawSnippet(() => ({ render: () => `<span>${html}</span>` }));

const chip = (density) => ({ name: 'Chip', props: { mono: true, density, children: label('12') } });

/**
 * Each case: a primitive whose text took its weight from a rule that does not set the face, or
 * from a host. `bold` cases sit in a 700 host, as the ones measured inside a `Field` caption do.
 */
const MOUNTS = Object.freeze({
  'chip-default': chip(undefined),
  'chip-row': chip('row'),
  'chip-list': chip('list'),
  'chip-tag-run': chip('tag-run'),
  'chip-inspector': chip('inspector'),
  'stepper-vertical': {
    name: 'Stepper',
    props: { value: 3, min: 0, max: 9, ariaLabel: 'Count', orientation: 'vertical' },
  },
  'editor-tab-badge': {
    name: 'EditorTabs',
    props: {
      tabs: [{ id: 'overview', labelKey: 'x.Overview', label: 'Overview' }],
      activeTab: 'overview',
      badges: { overview: 3 },
    },
  },
  'duration-pill': {
    name: 'Chip',
    props: { class: 'manager-recipe-duration-pill', children: label('2h 30m') },
  },
  'drop-modifier-pill': {
    name: 'Chip',
    props: { class: 'manager-drop-modifier-pill', children: label('Rain <strong>+2</strong>') },
  },
  'drop-zone': {
    name: 'ItemDropZone',
    bold: true,
    props: { item: { name: 'Read Momentum' }, uuid: 'Macro.abc123', title: 'Drop a macro here' },
  },
});

/** The modules each mounted primitive needs beside itself. */
const HARNESS = Object.freeze({
  Chip: { compiled: [], raw: [] },
  Stepper: { compiled: [], raw: [] },
  EditorTabs: {
    compiled: [component('Chip')],
    raw: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  },
  ItemDropZone: {
    compiled: [component('IconButton')],
    raw: [
      ...FOUNDRY_BRIDGE_RAW_MODULES,
      'src/ui/svelte/actions/dragDrop.js',
      'src/ui/svelte/util/dropUtils.js',
    ],
  },
});

/** The weights a text element may compute: the published ramp. */
const RAMP = Object.freeze([400, 500, 600, 700]);

/** A sheet rule that sets the face on a child of a bold caption, so the weight is inherited. */
const PREREQUISITE_AT =
  '<label class="fabricate-field"><span class="manager-prerequisite-at">@</span></label>';

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
${Object.keys(HARNESS)
  .map((name) => `<style>${scopedComponentCss(resolve(repoRoot, component(name))).css}</style>`)
  .join('\n')}
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${Object.entries(markup)
  .map(([key, html]) => {
    const host = MOUNTS[key].bold ? ' style="font-weight:700"' : '';
    return `<div data-case="${key}"${host}>${html}</div>`;
  })
  .join('\n')}
<div data-case="prerequisite-at">${PREREQUISITE_AT}</div>
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const markup = {};
  for (const [name, { compiled, raw }] of Object.entries(HARNESS)) {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: `fabricate-mono-weight-${name}-`,
      rawModules: raw,
      compiledModules: [...compiled, component(name)],
      componentPath: component(name),
    });
    await harness.setup();
    try {
      for (const [key, mount] of Object.entries(MOUNTS)) {
        if (mount.name !== name) continue;
        markup[key] = (await harness.mount(mount.props)).innerHTML;
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** Each case's text elements, with their face and computed weight. */
const drawnText = () =>
  tab.evaluate(() =>
    [...document.querySelectorAll('[data-case]')].map((root) => ({
      key: root.dataset.case,
      text: [...root.querySelectorAll('*')]
        .filter(
          (node) =>
            node.tagName === 'INPUT' || [...node.childNodes].some((child) => child.nodeType === 3)
        )
        .map((node) => getComputedStyle(node))
        .map((style) => ({
          mono: /^"?JetBrains Mono/u.test(style.fontFamily),
          weight: Number(style.fontWeight),
        })),
    }))
  );

it('draws every mono element at a weight the face ships', async () => {
  const drawn = await drawnText();
  const monoCases = drawn.filter(({ text }) => text.some(({ mono }) => mono));
  assert.ok(monoCases.length >= 10, `only ${monoCases.length} cases draw a mono element`);
  assert.deepEqual(
    monoCases
      .filter(({ text }) => text.some(({ mono, weight }) => mono && weight > 500))
      .map(({ key }) => key),
    [],
    'these draw the mono face above 500, which it does not ship, so the browser synthesises bold'
  );
});

it('draws no text at a weight off the ramp', async () => {
  const drawn = await drawnText();
  assert.deepEqual(
    drawn.filter(({ text }) => text.length === 0).map(({ key }) => key),
    [],
    'each case draws text, or it proves nothing'
  );
  assert.deepEqual(
    drawn
      .filter(({ text }) => text.some(({ weight }) => !RAMP.includes(weight)))
      .map(({ key }) => key),
    [],
    'a `<strong>` in a 700 host computes `bolder` to 900, which no face ships'
  );
});

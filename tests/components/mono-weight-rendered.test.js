/**
 * Issue 1523 — the mono face ships 400 and 500 only, so nothing drawn in it may compute above 500.
 * The debt gate joins a weight to its family by selector, so it cannot see a weight that reaches a
 * mono element from another rule or by inheritance; these are those cases, measured in Chromium.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const label = (text) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

const chip = (density) => ({ name: 'Chip', props: { mono: true, density, children: label('12') } });

/** Each case: a primitive whose mono element took a weight from a rule that does not set the face. */
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
});

/** The modules each mounted primitive needs beside itself. */
const HARNESS = Object.freeze({
  Chip: { compiled: [], raw: [] },
  Stepper: { compiled: [], raw: [] },
  EditorTabs: {
    compiled: [component('Chip')],
    raw: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  },
});

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
  .map(([key, html]) => `<div data-case="${key}">${html}</div>`)
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

it('draws every mono element at a weight the face ships', async () => {
  const drawn = await tab.evaluate(() =>
    [...document.querySelectorAll('[data-case]')].map((root) => ({
      key: root.dataset.case,
      mono: [root, ...root.querySelectorAll('*')]
        .map((node) => getComputedStyle(node))
        .filter((style) => /^"?JetBrains Mono/u.test(style.fontFamily))
        .map((style) => Number(style.fontWeight)),
    }))
  );
  assert.deepEqual(
    drawn.filter(({ mono }) => mono.length === 0).map(({ key }) => key),
    [],
    'each case draws a mono element, or it proves nothing'
  );
  assert.deepEqual(
    drawn.filter(({ mono }) => mono.some((weight) => weight > 500)).map(({ key }) => key),
    [],
    'these draw the mono face above 500, which it does not ship, so the browser synthesises bold'
  );
});

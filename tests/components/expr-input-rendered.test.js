/**
 * Issue 2465 — the face `<ExprInput>` states for itself, computed in Chromium from its mounted
 * markup: mono at 11.5px / 500, whether it stands bare in the manager or inside a field shell.
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
const RDE = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';

/** Each host the field ships in, around the mounted markup. */
const HOSTS = Object.freeze({
  bare: (field) => `<div data-case="bare">${field}</div>`,
  shell: (field) =>
    `<label class="fabricate-field" data-case="shell"><span>Expression</span>${field}</label>`,
});

const page = (field) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, RDE)).css}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${Object.values(HOSTS)
  .map((host) => host(field))
  .join('\n')}
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-expr-input-rendered-',
    rawModules: [],
    compiledModules: [RDE],
    componentPath: RDE,
  });
  await harness.setup();
  let field;
  try {
    field = (await harness.mount({ value: '1d4 + @prof' })).innerHTML;
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(field), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

it('computes the mono face at 11.5px / 500 in every host', async () => {
  const drawn = await tab.evaluate(() =>
    [...document.querySelectorAll('[data-case]')].map((host) => {
      const style = getComputedStyle(host.querySelector('input'));
      return {
        host: host.dataset.case,
        mono: /^"?JetBrains Mono/u.test(style.fontFamily),
        size: style.fontSize,
        weight: style.fontWeight,
      };
    })
  );
  assert.deepEqual(
    drawn,
    Object.keys(HOSTS).map((host) => ({ host, mono: true, size: '11.5px', weight: '500' }))
  );
});

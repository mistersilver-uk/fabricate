/**
 * With `--font-primary` undefined, as in every Fabricate window (issue 2312), the module roots, the
 * headings under them and a component that restates the UI face compute `--font-body`'s face
 * whatever face an ancestor sets, and with neither variable defined they compute the literal
 * fallback. Each root sits in a monospace ancestor and each heading and component in a monospace
 * parent, so a read that falls back to inheritance computes monospace.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const memberRow = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/PartyMemberRow.svelte')
);
const BODY_FACE = '"Probe Body", sans-serif';

/** Core's layered sheet, the module sheet in `layer(modules)`, the scoped block unlayered. */
const pageFor = (bodyStyle) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${memberRow.css}</style>
<style>body { ${bodyStyle} }</style></head>
<body class="game"><div style="font-family: monospace">
  <div class="application fabricate fabricate-app" data-case="app"><section class="window-content">
    <div style="font-family: monospace"><h2 data-case="app-heading">Title</h2></div>
  </section></div>
  <div class="application fabricate crafting-system-manager" data-case="manager"><section class="window-content">
    <div style="font-family: monospace"><h3 data-case="manager-heading">Title</h3>
      <span class="manager-party-member-name ${memberRow.hashClass}" data-case="member">Ada</span>
    </div>
  </section></div></div></body></html>`;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/** The computed `font-family` of each case in a page whose body states `bodyStyle`. */
async function facesOf(bodyStyle) {
  const page = await browser.newPage();
  await page.setContent(pageFor(bodyStyle), { waitUntil: 'load' });
  const faces = await page.$$eval('[data-case]', (nodes) =>
    Object.fromEntries(nodes.map((node) => [node.dataset.case, getComputedStyle(node).fontFamily]))
  );
  await page.close();
  return faces;
}

describe('the UI face with --font-primary undefined', () => {
  it('is the body face on both module roots, their headings and a restating component, under monospace ancestors', async () => {
    const faces = await facesOf(`--font-body: ${BODY_FACE}; font-family: var(--font-body);`);
    for (const [name, face] of Object.entries(faces)) assert.equal(face, BODY_FACE, name);
  });

  it('is the literal fallback when --font-body is undefined too', async () => {
    const faces = await facesOf('font-family: serif;');
    for (const [name, face] of Object.entries(faces)) assert.equal(face, 'sans-serif', name);
  });

  it('is --font-primary where only that variable is defined, as under an ApplicationV1 root', async () => {
    const faces = await facesOf('--font-primary: Arial, sans-serif;');
    for (const [name, face] of Object.entries(faces)) assert.equal(face, 'Arial, sans-serif', name);
  });
});

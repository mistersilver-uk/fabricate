/** Issue 1782 — the library `<Rail>`'s rhythm and kicker type, measured in a real browser. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

/** The components whose compiled scoped CSS decides the rail: the primitive and one caller. */
const SCOPED_COMPONENTS = [
  'src/ui/svelte/components/Rail.svelte',
  'src/ui/svelte/apps/manager/RecipeItemEditor.svelte',
].map((path) => scopedComponentCss(resolve(repoRoot, path)));
const ALL_HASHES = SCOPED_COMPONENTS.map((component) => component.hashClass).join(' ');

/** Stamp every component's real scoping hash onto EVERY element, as the parity suites do. */
function stamped(markup) {
  return markup.replaceAll(/<([a-z][a-z0-9]*)((?:"[^"]*"|[^>"])*)>/gi, (whole, tag, attributes) => {
    if (/\sclass="/.test(attributes)) {
      return `<${tag}${attributes.replace(/class="([^"]*)"/, `class="$1 ${ALL_HASHES}"`)}>`;
    }
    return `<${tag} class="${ALL_HASHES}"${attributes}>`;
  });
}

const documentFor = (body) => `<!doctype html>
<html lang="en" style="font-size: 16px">
  <head>
    <meta charset="utf-8">
    <style>@layer variables, modules;</style>
    <style>@layer modules { ${sheet} }</style>
    <style>${SCOPED_COMPONENTS.map((component) => component.css).join('\n')}</style>
    <style>body { margin: 0; }</style>
  </head>
  <body class="game">
    <div class="application theme-dark"><div class="fabricate fabricate-manager" data-fabricate-theme="dark">${stamped(body)}</div></div>
  </body>
</html>`;

const BARE = `<section class="fab-rail" role="group" aria-labelledby="bare" data-probe="bare">
  <p class="fab-rail-label" id="bare" data-probe="bare-kicker">Source</p>
  <p data-probe="bare-body">Body</p>
</section>`;

const RECIPE_ITEM = `<aside class="manager-recipe-item-editor-rail">
  <section class="fab-rail" role="group" aria-labelledby="ri" data-probe="ri">
    <p class="fab-rail-label" id="ri" data-probe="ri-kicker">How players see it</p>
  </section>
</aside>`;

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

/** Render markup and read the named computed properties of each probe. */
async function measure(body, reads) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.setContent(documentFor(body));
    return await page.evaluate((specs) => {
      const out = {};
      for (const [probe, properties] of Object.entries(specs)) {
        const style = getComputedStyle(document.querySelector(`[data-probe="${probe}"]`));
        out[probe] = Object.fromEntries(properties.map((name) => [name, style[name]]));
      }
      return out;
    }, reads);
  } finally {
    await context.close();
  }
}

test('a bare rail is a flex column at 8px, shrinkable, with a 2px kicker foot', async () => {
  const read = await measure(BARE, {
    bare: ['display', 'flexDirection', 'rowGap', 'minWidth'],
    'bare-kicker': ['marginTop', 'marginBottom', 'fontSize', 'letterSpacing', 'textTransform'],
  });
  assert.equal(read.bare.display, 'flex');
  assert.equal(read.bare.flexDirection, 'column');
  assert.equal(read.bare.rowGap, '8px', 'the rail gap is --fab-space-2');
  assert.equal(read.bare.minWidth, '0px', 'the rail may shrink inside its grid track');
  assert.equal(read['bare-kicker'].marginTop, '0px');
  assert.equal(read['bare-kicker'].marginBottom, '2px', 'the kicker foot is --fab-space-2xs');
  assert.equal(read['bare-kicker'].fontSize, '8.5px');
  assert.equal(read['bare-kicker'].letterSpacing, '0.935px', '0.11em at 8.5px');
  assert.equal(read['bare-kicker'].textTransform, 'uppercase');
});

test('the recipe-item rail label keeps its own size, tracking and flush foot', async () => {
  const read = await measure(RECIPE_ITEM, {
    'ri-kicker': ['fontSize', 'letterSpacing', 'marginTop', 'marginBottom'],
  });
  assert.equal(read['ri-kicker'].fontSize, '9.92px', '0.62rem');
  assert.equal(read['ri-kicker'].letterSpacing, '1.1904px', '0.12em at 9.92px');
  assert.equal(read['ri-kicker'].marginTop, '0px');
  assert.equal(read['ri-kicker'].marginBottom, '0px', 'flush, unlike the bare rail');
});

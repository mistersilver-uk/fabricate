/**
 * The manager shell a RENDERED (real-Chromium) suite ships product markup into (issue 1371 r18-list).
 *
 * Two of the manager's rendered geometry suites — the rules list's and the rules editor's — mount a
 * shipped view through the shared harness, collect every scoped `<style>` block in that view's
 * tree, and lay the rendered `innerHTML` out in Chromium under `styles/fabricate.css` inside the
 * `.fabricate-manager > .manager-body` grid it renders in. Both halves are properties of the SHELL,
 * not of either suite, so they live here once: a second copy is the duplication SonarCloud's
 * new-code gate refuses, and a copy that drifts is a suite measuring a shell the product no longer
 * draws.
 *
 * `tests/components/world-component-catalogue-rendered.test.js` carries the arrangement this was
 * lifted from and is deliberately NOT retargeted here: it belongs to the catalogue lane, and a
 * helper that changed its page under it would be a change to a suite this lane does not own.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { compile } from 'svelte/compiler';

/**
 * Every scoped `<style>` block in a harness's compiled tree, in manifest order.
 *
 * READ OFF THE HARNESS MANIFEST rather than a second hand-written list, so a component added to
 * the screen cannot arrive styled in the browser and unstyled here. A module with no block at all
 * is skipped, and the count is returned so a suite can assert the skip never became "all of them".
 *
 * @param {{repoRoot: string, compiledModules: readonly string[]}} options
 * @returns {{css: string, hashes: string[], blocks: number}}
 */
export function collectScopedCss({ repoRoot, compiledModules }) {
  const parts = [];
  const hashes = [];
  for (const modulePath of compiledModules) {
    const filename = resolve(repoRoot, modulePath);
    const { css } = compile(readFileSync(filename, 'utf8'), { filename, css: 'external' });
    if (!css?.code) continue;
    parts.push(css.code);
    const hash = css.code.match(/\.(svelte-[a-z0-9]+)\b/)?.[1];
    if (hash) hashes.push(hash);
  }
  return { css: parts.join('\n'), hashes, blocks: parts.length };
}

/**
 * The rendered markup inside the manager shell it ships in.
 *
 * Every mounted view's own root IS `main.manager-main`, so the wrappers here are only what sits
 * above it: the themed area root carrying the route attribute every `[data-manager-view=…]` rule
 * reads, `.manager-body`'s column grid, and the rail occupying its first track. `chrome` is a rule
 * set laid BEFORE the module sheet — the place Foundry's own stylesheet sits in the document — and
 * `control` one laid AFTER it, for a suite's reddening arrangement.
 *
 * @param {object} options
 * @param {string} options.fabricateCss the module sheet's text.
 * @param {string} options.view the `data-manager-view` route.
 * @param {string} options.productMarkup the mounted tree's `innerHTML`.
 * @param {string} options.scopedCss the tree's scoped blocks, from `collectScopedCss`.
 * @param {string} [options.chrome] rules laid before the module sheet; `''` for none.
 * @param {string} [options.control] rules laid after every sheet; `''` for the honest page.
 * @param {number} [options.hostWidth]
 * @param {number} [options.hostHeight]
 * @returns {string}
 */
export function managerShellPage({
  fabricateCss,
  view,
  productMarkup,
  scopedCss,
  chrome = '',
  control = '',
  hostWidth = 1280,
  hostHeight = 720,
}) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${chrome}</style>
    <style>${fabricateCss}</style>
    <style>${scopedCss}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${hostWidth}px; height: ${hostHeight}px; }
    </style>
    <style>${control}</style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="${view}">
          <div class="manager-body">
            <nav class="manager-rail"></nav>
            ${productMarkup}
          </div>
        </div>
      </div>
    </body></html>`;
}

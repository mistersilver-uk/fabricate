/** A static page for a computed-CSS gate over a component's mounted markup (issue 2465). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

import { scopedComponentCss } from './scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * Foundry's core sheet, the module sheet in its layer, and each component's scoped CSS unlayered,
 * as the product injects it, around `hosts` in a manager root.
 *
 * @param {string[]} components Repository-relative `.svelte` paths whose scoped CSS the page carries.
 * @param {string[]} hosts The markup of each case.
 */
export function staticComponentPage(components, hosts) {
  const scoped = components
    .map((path) => `<style>${scopedComponentCss(resolve(repoRoot, path)).css}</style>`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
${scoped}
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${hosts.join('\n')}
</div></body></html>`;
}

/** What a `--fab-*` colour token computes to under the page's manager root. */
export function colourOf(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    document.querySelector('.fabricate-manager').append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  }, token);
}

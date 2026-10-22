import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

import { scopedComponentCss } from './scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = (name) => resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`);
const scopedStyleOf = (name) => `<style>${scopedComponentCss(componentPath(name)).css}</style>`;

/**
 * A Chromium page's doctype through `</head>`: core's layered sheet with its reset's border-box
 * sizing, the module sheet in `layer(modules)`, each named component's scoped styles unlayered,
 * and Arial as `--font-primary`.
 */
export const renderedPageHead = (names) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}
@layer reset{*,*::before,*::after{box-sizing:border-box}}</style>
<style>@layer modules {${readStylesheet()}}</style>
${names.map(scopedStyleOf).join('\n')}
<style>:root{--font-primary:Arial,sans-serif}</style>
</head>`;

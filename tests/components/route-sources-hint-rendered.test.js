/**
 * Issue 2751: a source chip's hint keeps the chip's gap from the name before it, truncating chip
 * or not, removable or not. Measured in Chromium on `RouteSources` under the module stylesheet.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ROUTE_SOURCES = 'src/ui/svelte/components/RouteSources.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-route-sources-hint-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [...SEARCHABLE_POPOVER_COMPILED_MODULES, ROUTE_SOURCES],
  componentPath: ROUTE_SOURCES,
});

const SOURCES = [
  { id: 'fixed', label: 'Silver', removable: false, hint: 'default' },
  { id: 'chosen', label: 'Gold', removable: true, hint: 'chosen' },
];

let browser;
let page;

before(async () => {
  await harness.setup();
  let markup;
  let injected;
  try {
    markup = (await harness.mount({ sources: SOURCES })).innerHTML;
    injected = [...document.head.querySelectorAll('style')]
      .map((node) => node.textContent)
      .join('\n');
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 300 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>@layer modules {${readStylesheet()}}</style>` +
      `<style>${injected}</style></head><body><div class="fabricate fabricate-manager" ` +
      `data-fabricate-theme="fabricate" style="width:700px">${markup}</div></body></html>`
  );
});

after(async () => {
  await browser?.close();
});

/** The chip's gap, and how far the hint's left edge stands from the name's right edge. */
const separation = (id) =>
  page.evaluate((key) => {
    const chip = document.querySelector(`[data-route-sources-chip="${key}"]`);
    const hint = chip.querySelector('.fabricate-route-sources-hint');
    const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    range.selectNodeContents(walker.nextNode());
    return {
      gap: Number.parseFloat(getComputedStyle(chip).columnGap),
      apart: hint.getBoundingClientRect().left - range.getBoundingClientRect().right,
    };
  }, id);

describe('a route source hint, rendered (issue 2751)', () => {
  for (const [id, shape] of [
    ['fixed', 'a fixed source'],
    ['chosen', 'a removable source'],
  ]) {
    it(`keeps the chip gap between the name and the hint of ${shape}`, async () => {
      const { gap, apart } = await separation(id);
      assert.ok(gap > 0, 'the chip states a gap');
      assert.ok(
        apart >= gap - 0.01,
        `the hint stands ${apart}px from the name, under the ${gap}px gap`
      );
    });
  }
});

/**
 * Issue 2422 - the manager's title band holds one height whether or not the PREMIUM mark and the
 * status line are drawn. Mounted through the real `AppTitleBar` and measured in
 * Chromium under the manager sheet.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { borrowBrowser } from '../helpers/layout-harness.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const APP_TITLE_BAR = 'src/ui/svelte/components/AppTitleBar.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-app-title-bar-rendered-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [APP_TITLE_BAR],
  componentPath: APP_TITLE_BAR,
});

const STATES = Object.freeze({
  empty: {},
  statusOnly: { statusLabel: 'Routed by check · 3 outcome tiers' },
  markOnly: { premiumInstalled: true },
  markAndStatus: { premiumInstalled: true, statusLabel: 'Routed by check · 3 outcome tiers' },
});

describe('2422 the manager title band keeps its height', () => {
  const markup = {};
  const heights = {};

  before(async () => {
    await harness.setup();
    globalThis.game.i18n.localize = (key) => key;
    try {
      for (const [state, props] of Object.entries(STATES)) {
        markup[state] = (await harness.mount(props)).innerHTML;
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
    const browser = await borrowBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
      const probes = Object.entries(markup)
        .map(([state, html]) => `<div data-probe="${state}">${html}</div>`)
        .join('');
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">' +
          `<style>@layer modules { ${readStylesheet()} }</style>` +
          '<style>body { margin: 0; }</style></head>' +
          `<body><div class="fabricate fabricate-manager" data-fabricate-theme="dark">${probes}</div></body></html>`,
        { waitUntil: 'load' }
      );
      Object.assign(
        heights,
        await page.evaluate(() =>
          Object.fromEntries(
            [...document.querySelectorAll('[data-probe]')].map((probe) => [
              probe.dataset.probe,
              Math.round(
                probe.querySelector('.manager-titlebar').getBoundingClientRect().height * 10
              ) / 10,
            ])
          )
        )
      );
    } finally {
      await browser.close();
    }
  });

  after(() => {
    for (const key of Object.keys(markup)) delete markup[key];
    for (const key of Object.keys(heights)) delete heights[key];
  });

  it('draws the empty, status-only, mark-only and mark-and-status bands at one height', () => {
    const distinct = new Set(Object.values(heights));
    assert.equal(
      distinct.size,
      1,
      `the band's height moves with its content: ${JSON.stringify(heights)}`
    );
  });
});

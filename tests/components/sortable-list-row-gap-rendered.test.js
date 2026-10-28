/**
 * Issue 2404: the rows of a `SortableList` sit on the list's own `gap`, measured in Chromium
 * beneath Foundry core's `ul li { margin-bottom: 0.25rem }`, which the row must reset.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-sortable-list-gap-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/appLocalizer.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/SortableList.svelte',
  ],
  componentPath: 'src/ui/svelte/components/SortableList.svelte',
});

const ITEMS = ['a', 'b', 'c'].map((id) => ({ id, name: `Step ${id}` }));

let browser;
let tab;

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await harness.setup();
  let markup;
  try {
    const target = await harness.mount({
      items: ITEMS,
      itemLabel: (item) => item.name,
      numbered: true,
    });
    markup = target.innerHTML;
  } finally {
    harness.teardown();
  }
  const core = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
  await tab.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${core}</style>
<style>@layer modules {${readStylesheet()}}</style></head>
<body class="game"><div class="fabricate fabricate-app" style="padding:16px">${markup}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

describe('SortableList row spacing, rendered (issue 2404)', () => {
  it('resets the user-agent and Foundry margin on every row', async () => {
    const margins = await tab.evaluate(() =>
      [...document.querySelectorAll('.fabricate-sortable-list-row')].map(
        (row) => getComputedStyle(row).marginBottom
      )
    );
    assert.deepEqual(margins, ['0px', '0px', '0px']);
  });

  it('parts consecutive rows by the list gap alone', async () => {
    const { gap, spacing } = await tab.evaluate(() => {
      const list = document.querySelector('.fabricate-sortable-list');
      const rows = [...list.querySelectorAll(':scope > .fabricate-sortable-list-row')].map((row) =>
        row.getBoundingClientRect()
      );
      return {
        gap: Number.parseFloat(getComputedStyle(list).rowGap),
        spacing: rows.slice(1).map((rect, index) => rect.top - rows[index].bottom),
      };
    });
    assert.ok(gap > 0, 'the list declares a row gap');
    assert.deepEqual(spacing, [gap, gap], 'each pair of rows is one list gap apart');
  });
});

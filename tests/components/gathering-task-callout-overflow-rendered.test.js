/**
 * Issue 2559: a long blocked-reason callout stays inside its chip, and so inside a narrow task row.
 * An unmapped code falls back to the reason's own message, which a provider or a translation can
 * make far longer than the chip. Measured in Chromium on the text itself, not the chip's box.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { GATHERING_TASK_ROW_HARNESS } from '../helpers/gatheringTaskRowHarness.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const LONG_LABEL =
  'The provider supplied a blocking reason that runs on far longer than any shipped callout label would';
const ROW_WIDTH = 220;

const harness = createMountedComponentHarness({
  ...GATHERING_TASK_ROW_HARNESS,
  tmpPrefix: 'fabricate-callout-overflow-',
});

let browser;
let tab;

before(async () => {
  await harness.setup();
  let markup;
  let injected;
  try {
    markup = (
      await harness.mount({
        task: {
          id: 'task-long',
          name: 'Vein',
          attemptable: false,
          blockedReasons: [{ code: 'SOMETHING_UNMAPPED', message: LONG_LABEL }],
        },
      })
    ).innerHTML;
    injected = [...document.head.querySelectorAll('style')]
      .map((node) => node.textContent)
      .join('\n');
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.setContent(
    `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${injected}</style>
<style>:root{--font-primary:Arial,sans-serif}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="width:1000px">
  <div data-case="row" style="width:${ROW_WIDTH}px">${markup}</div>
</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** The callout's text, as the player sees it: its box clipped by every clipping ancestor. */
const measure = () =>
  tab.evaluate(() => {
    const row = document.querySelector('[data-case="row"] .gathering-task-row');
    const chip = row.querySelector(':scope [data-gathering-callouts] > *');
    const label = [...chip.childNodes].findLast(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
    );
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    let seen = { left: text.left, right: text.right };
    for (let node = chip; node && node !== row; node = node.parentElement) {
      if (getComputedStyle(node).overflowX === 'visible') continue;
      const box = node.getBoundingClientRect();
      seen = { left: Math.max(seen.left, box.left), right: Math.min(seen.right, box.right) };
    }
    const bounds = row.getBoundingClientRect();
    return {
      title: chip.getAttribute('title'),
      text: chip.textContent.trim(),
      overflowX: getComputedStyle(chip).overflowX,
      textScrollWidth: chip.scrollWidth,
      textClientWidth: chip.clientWidth,
      seen,
      row: { left: bounds.left, right: bounds.right },
    };
  });

describe('gathering task row callout overflow, rendered (issue 2559)', () => {
  it('clips a long callout inside its chip and the row, never past either edge', async () => {
    const found = await measure();
    assert.ok(
      found.seen.left >= found.row.left - 0.01 && found.seen.right <= found.row.right + 0.01,
      `the visible text ${JSON.stringify(found.seen)} leaves the ${ROW_WIDTH}px row ${JSON.stringify(found.row)}`
    );
    assert.equal(found.overflowX, 'hidden', 'the chip clips what does not fit');
    assert.ok(
      found.textScrollWidth > found.textClientWidth,
      'the label is longer than the chip, so the probe exercises the overflow'
    );
  });

  it('keeps the full label in the title and the text, whatever is clipped', async () => {
    const found = await measure();
    assert.equal(found.title, LONG_LABEL);
    assert.equal(found.text, LONG_LABEL);
  });
});

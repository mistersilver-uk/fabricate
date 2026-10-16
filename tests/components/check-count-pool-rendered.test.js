/**
 * Issue 2465 — where the counting pool's Base pool row stands its source control in Chromium,
 * computed from the component's mounted markup: level with the top of the field beside it, whatever
 * the field draws beneath itself.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { COUNT_POOL_COMPILED_MODULES } from '../helpers/countPoolHarnessModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { staticComponentPage } from '../helpers/staticComponentPage.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const POOL = 'src/ui/svelte/apps/manager/checks/CheckCountPoolFields.svelte';

const IDRIN = Object.freeze({
  name: 'Idrin',
  rollData: { abilities: { int: { value: 6 } }, skills: { repair: { value: 4 } } },
});

/** A counting pool whose base is `base`, read against Idrin. */
const poolOver = (base) => ({
  thresholdMode: 'meet',
  character: IDRIN,
  evaluation: normalizeCheckEvaluation({
    product: 'count',
    direction: 'over',
    pool: { die: 10, base, threshold: '8', required: 3 },
  }),
});

/** Each case: the base expression, the reading it draws, and whether a line stands beneath it. */
const CASES = Object.freeze({
  resolved: ['@abilities.int.value + @skills.repair.value', '= 10', false],
  unresolved: ['@skills.lore.value', 'Unresolved', true],
});

/** Whether the component states scoped CSS: `scopedComponentCss` throws for one that states none. */
function statesScopedCss(path) {
  try {
    return Boolean(scopedComponentCss(resolve(repoRoot, path)).css);
  } catch {
    return false;
  }
}

describe("the counting pool's Base pool row, drawn (issue 2465)", () => {
  let browser;
  let page;

  before(async () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-check-count-pool-rendered-',
      rawModules: CHECK_EDITOR_RAW_MODULES,
      compiledModules: CHECK_EDITOR_COMPILED_MODULES,
      componentPath: POOL,
    });
    await harness.setup();
    const hosts = [];
    try {
      for (const [name, [base]] of Object.entries(CASES)) {
        const target = await harness.mount(poolOver(base));
        hosts.push(`<div data-case="${name}" style="width:760px">${target.innerHTML}</div>`);
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
    // The pool's own closure, each component's scoped CSS carried as the product injects it.
    const styled = COUNT_POOL_COMPILED_MODULES.filter((path) => statesScopedCss(path));
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(staticComponentPage(styled, hosts), { waitUntil: 'load' });
  });

  after(async () => {
    await browser?.close();
  });

  for (const [name, [, reading, line]] of Object.entries(CASES)) {
    it(`stands the source control level with the top of its field, ${name}`, async () => {
      const drawn = await page.evaluate((host) => {
        const row = document.querySelector(`[data-case="${host}"] [data-check-count-row-base]`);
        const box = (selector) => row.querySelector(selector).getBoundingClientRect();
        const control = box('[data-check-count-base-mode]');
        const field = box('[data-check-count-base-expression]');
        return {
          control: control.top,
          field: field.top,
          beside: control.left >= field.right || control.right <= field.left,
          fieldHeight: field.height,
          reading: row.querySelector('[data-expr-input-reading]')?.textContent ?? '',
          line: Boolean(row.querySelector('[data-check-count-base-resolution]')),
        };
      }, name);
      assert.deepEqual([drawn.reading, drawn.line], [reading, line]);
      assert.ok(drawn.fieldHeight > 0 && drawn.beside, 'the control and the field share one line');
      assert.ok(
        Math.abs(drawn.control - drawn.field) <= 0.5,
        `the source control stands ${drawn.control - drawn.field}px off the field's top`
      );
    });
  }
});

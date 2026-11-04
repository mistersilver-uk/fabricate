/**
 * The `manager-published-list-row-tones-specimen` case against the markup its fixture draws, in
 * Chromium: the fixture's own `ROWS`, `OPENS` and `FILLS`, read from its source, are mounted
 * through the shipped seam as its effect mounts them, under the ground and section hooks its
 * template writes, and the case's wait selector, every contained target and every measured control
 * must each name an element there, so a selector that leans on markup the seam does not draw fails
 * here rather than in the lab's capture.
 * Limit: the page holds the seam's markup without Foundry's window chrome, which the capture adds.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { fixtureLiteral } from '../helpers/labFixtureLiterals.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const FIXTURE = 'tests/view-lab/fixtures/PublishedListRowTones.svelte';
const CASE_ID = 'manager-published-list-row-tones-specimen';
const PRESSABLE = new Set(['Button', 'IconButton']);
const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-list-row-tones-specimen-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let browser;
let tab;

before(async () => {
  const shells = [];
  const sections = [];
  const reports = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({
      createPublishedComponents,
      runtime,
      components,
      report: (...args) => {
        reports.push(args);
      },
    });
    const opens = fixtureLiteral(FIXTURE, 'OPENS');
    const rows = new Map(
      fixtureLiteral(FIXTURE, 'ROWS').map(([key, props]) => {
        const target = fabricateTarget(shells);
        const row = opens.includes(key) ? { ...props, onOpen() {} } : props;
        return [key, { target, handle: ui.mount('ListRow', { target, props: row }) }];
      })
    );
    const fills = fixtureLiteral(FIXTURE, 'FILLS').map(([key, slot, hook, name, props]) => {
      const host = rows.get(key).handle.slot(slot);
      const target = host.ownerDocument.createElement('span');
      target.style.display = 'flex';
      target.setAttribute('data-lab-list-row-fill', hook);
      host.append(target);
      return ui.mount(name, {
        target,
        props: PRESSABLE.has(name) ? { ...props, onclick() {} } : props,
      });
    });
    await settle();
    assert.deepEqual(reports, [], 'the seam reported nothing');
    for (const [key, { target }] of rows) {
      sections.push(
        `<section data-lab-list-row-tone="${key}"><div>${target.innerHTML}</div></section>`
      );
    }
    for (const handle of [...fills, ...[...rows.values()].map((row) => row.handle)]) {
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 480, height: 360 } });
  await tab.setContent(
    `${renderedPageHead(['Medallion'])}<body class="game">` +
      '<div class="fabricate fabricate-app"><div class="window-content">' +
      `<div data-lab-list-row-tones style="width:360px">${sections.join('')}</div>` +
      '</div></div></body></html>',
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const countOf = (selector) =>
  tab.evaluate((each) => globalThis.document.querySelectorAll(each).length, selector);

describe('the list row tones specimen case on the markup its fixture draws', () => {
  const viewCase = getCaseById(CASE_ID);

  it('finds the element its wait selector names: the three controls, the chip and the accent row’s claim', async () => {
    assert.equal(await countOf(viewCase.expectSelector), 1);
  });

  it('finds every contained target inside its container', async () => {
    for (const { container, target } of viewCase.expectContained) {
      assert.ok((await countOf(container)) >= 1, `container ${container}`);
      assert.ok((await countOf(target)) >= 1, `target ${target}`);
    }
  });

  it('names exactly one element for each measured control', async () => {
    for (const { selector } of viewCase.expectLayout.controls) {
      assert.equal(await countOf(selector), 1, selector);
    }
  });
});

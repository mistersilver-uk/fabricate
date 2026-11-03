/**
 * The published `SegmentedControl` option `title` as an accessible description, read from
 * Chromium's own accessibility tree on the markup the seam draws under the module sheet: each
 * hinted radio's description is its hint, its name stays its label or `ariaLabel`, an unhinted
 * radio has no description, two mounts of one option list keep separate descriptions, and the
 * hidden description node takes no room in the track.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chromiumAxDescribed } from '../helpers/chromiumAxNode.js';
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

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-segmented-option-hint-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

const HINTED = Object.freeze([
  { value: 'warn', label: 'Warn', title: 'Keep the item and warn the player' },
  {
    value: 'fail',
    label: 'Fail',
    ariaLabel: 'Fail, chosen by Mira',
    title: 'Fail the craft and consume the ingredients',
  },
  { value: 'skip', label: 'Skip' },
]);
const BARE = Object.freeze(
  HINTED.map(({ value, label, ariaLabel }) => ({ value, label, ariaLabel }))
);
const CASES = Object.freeze([
  ['first', HINTED, {}],
  ['second', HINTED, {}],
  ['bare', BARE, {}],
  ['compact', HINTED, { density: 'compact', fill: true }],
  ['compact-bare', BARE, { density: 'compact', fill: true }],
]);

let browser;
let tab;

before(async () => {
  const shells = [];
  const cells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const [id, options, props] of CASES) {
      const target = fabricateTarget(shells);
      const handle = ui.mount('SegmentedControl', {
        target,
        props: { options, value: 'warn', ariaLabel: 'On failure', onChange() {}, ...props },
      });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 900, height: 400 } });
  await tab.setContent(
    `${renderedPageHead(['SegmentedControl'])}<body class="game">` +
      '<div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="background:var(--fab-bg-1)">' +
      `<style>[data-case]{display:flex;padding:8px}</style>${cells.join('')}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const radioOf = (id, value) => `[data-case="${id}"] input[value="${value}"]`;

describe('an option hint in Chromium’s accessibility tree', () => {
  for (const id of ['first', 'second', 'compact']) {
    it(`describes each hinted radio of the ${id} control by its hint and leaves its name`, async () => {
      const read = await Promise.all(
        HINTED.map(({ value }) => chromiumAxDescribed(tab, radioOf(id, value)))
      );
      assert.deepEqual(read, [
        { role: 'radio', name: 'Warn', description: HINTED[0].title },
        { role: 'radio', name: 'Fail, chosen by Mira', description: HINTED[1].title },
        { role: 'radio', name: 'Skip', description: '' },
      ]);
    });
  }

  it('names the same radios the same with no hint, and describes none', async () => {
    for (const id of ['bare', 'compact-bare']) {
      const read = await Promise.all(
        BARE.map(({ value }) => chromiumAxDescribed(tab, radioOf(id, value)))
      );
      assert.deepEqual(read, [
        { role: 'radio', name: 'Warn', description: '' },
        { role: 'radio', name: 'Fail, chosen by Mira', description: '' },
        { role: 'radio', name: 'Skip', description: '' },
      ]);
    }
  });

  it('keeps every description id unique on the page', async () => {
    const ids = await tab.$$eval('input[aria-describedby]', (radios) =>
      radios.map((radio) => radio.getAttribute('aria-describedby'))
    );
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, 6, ids.join(' '));
  });

  it('draws the description node nowhere and leaves the segments where they were', async () => {
    const hidden = await tab.$$eval('[data-case="first"] [hidden]', (nodes) =>
      nodes.map((node) => getComputedStyle(node).display)
    );
    assert.deepEqual(hidden, ['none', 'none']);
    const boxes = (id) =>
      tab.$$eval(`[data-case="${id}"] .manager-segment`, (segments) => {
        const row = segments[0].closest('[data-case]').getBoundingClientRect();
        return segments.map((segment) => {
          const { x, y, width, height } = segment.getBoundingClientRect();
          return [x - row.x, y - row.y, width, height];
        });
      });
    assert.deepEqual(await boxes('first'), await boxes('bare'));
    assert.deepEqual(await boxes('compact'), await boxes('compact-bare'));
  });
});

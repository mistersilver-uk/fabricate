/**
 * Issue 2445 — the `player` and `authoring` complication rows, measured in Chromium. The GM
 * read-only variant loses its shell and tile; these two must not move, and no player frame claims
 * `ComplicationSummaryRow.svelte`, so this characterization is the only evidence they did not.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ROW_PATH = 'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-complication-row-variants-',
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    ROW_PATH,
  ],
  componentPath: ROW_PATH,
});

const SHARED = Object.freeze({
  name: 'Choking dust',
  severity: 'severe',
  severityLabel: 'Severe',
  visibility: 'visible',
  playerLabel: 'Player',
});

/** Each variant, the area root it ships under, and its typed body. */
const VARIANTS = Object.freeze({
  player: {
    area: 'fabricate-app',
    props: { ...SHARED, variant: 'player', description: 'The reagent goes up in a bitter cloud.' },
  },
  authoring: {
    area: 'fabricate-manager',
    props: { ...SHARED, variant: 'authoring', triggerSentence: 'When the award is missed' },
  },
});

/** The computed values frozen at origin/main `eb735ecf4`, per variant. */
const FROZEN = Object.freeze({
  player: {
    root: ['1px', 'solid', 'rgba(0, 0, 0, 0)', '9px', 'rgba(0, 0, 0, 0)'],
    line: ['8px', '0px', 'flex-start'],
    tile: ['30px', '30px', '7px', 'rgba(185, 124, 120, 0.54)'],
    copy: '2px',
    headline: ['flex', '6px'],
    name: ['Spectral, Georgia, "Times New Roman", serif', '12.5px'],
  },
  authoring: {
    root: ['1px', 'solid', 'rgba(217, 184, 156, 0.18)', '11px', 'rgb(21, 33, 43)'],
    line: ['12px', '12px', 'center'],
    tile: ['30px', '30px', '7px', 'rgba(185, 124, 120, 0.54)'],
    copy: '2px',
    headline: ['contents', 'normal'],
    name: ['Spectral, Georgia, "Times New Roman", serif', '12.5px'],
  },
});

const stripHash = (markup) => markup.replaceAll(/\s*svelte-[a-z0-9]+/g, '');

/** Runs IN THE PAGE: the frozen properties of one variant's row. */
function measure(variant) {
  const root = document.querySelector(`[data-probe="${variant}"] .fab-complication-row`);
  const css = (element) => getComputedStyle(element);
  const rootStyle = css(root);
  const line = css(root.querySelector('.fab-complication-row-line'));
  const tile = css(root.querySelector('.fab-complication-severity'));
  const headline = css(root.querySelector('.fab-complication-row-headline'));
  const name = css(root.querySelector('.fab-complication-row-name'));
  return {
    root: [
      rootStyle.borderTopWidth,
      rootStyle.borderTopStyle,
      rootStyle.borderTopColor,
      rootStyle.borderTopLeftRadius,
      rootStyle.backgroundColor,
    ],
    line: [line.gap, line.padding, line.alignItems],
    tile: [tile.width, tile.height, tile.borderTopLeftRadius, tile.borderTopColor],
    copy: css(root.querySelector('.fab-complication-row-copy')).gap,
    headline: [headline.display, headline.gap],
    name: [name.fontFamily, name.fontSize],
  };
}

const markup = {};
const measured = {};

describe('2445 the player and authoring complication rows do not move', () => {
  before(async () => {
    await harness.setup();
    try {
      for (const [variant, { props }] of Object.entries(VARIANTS)) {
        markup[variant] = (await harness.mount(props)).innerHTML;
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
    const scoped = scopedComponentCss(resolve(repoRoot, ROW_PATH)).css;
    const areas = Object.entries(VARIANTS)
      .map(
        ([variant, { area }]) =>
          `<div class="fabricate ${area}" data-fabricate-theme="fabricate">` +
          `<div data-probe="${variant}" style="width:420px">${markup[variant]}</div></div>`
      )
      .join('');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">' +
          `<style>@layer modules { ${readStylesheet()} }</style><style>${scoped}</style>` +
          `</head><body>${areas}</body></html>`
      );
      for (const variant of Object.keys(VARIANTS)) {
        measured[variant] = await page.evaluate(measure, variant);
      }
    } finally {
      await browser.close();
    }
  });

  after(() => {
    for (const key of Object.keys(measured)) delete measured[key];
  });

  for (const variant of Object.keys(VARIANTS)) {
    // GUARD: green before and after; red when the split-out `is-player` rule loses its radius.
    it(`GUARD: ${variant} keeps its shell, line, tile and type`, () => {
      assert.deepEqual(measured[variant], FROZEN[variant], `${variant} moved`);
    });

    // GUARD: the tile stays for both, so the read-only variant's removal is scoped to it alone.
    it(`GUARD: ${variant} still draws the severity tile`, () => {
      assert.match(
        stripHash(markup[variant]),
        /<span aria-hidden="true" class="fab-complication-severity is-danger"><i class="fas fa-skull"><\/i><\/span>/,
        `${variant} renders the tile`
      );
    });
  }
});

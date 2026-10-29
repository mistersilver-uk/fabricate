/**
 * Issue 2445 — the complication row variants, measured in Chromium. The GM read-only variant loses
 * its shell and tile and must not regain them; `player` and `authoring` must not move, and no
 * player frame claims `ComplicationSummaryRow.svelte`, so this is the only evidence they did not.
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
  rawModules: ['src/ui/svelte/util/appLocalizer.js'],
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
  'readonly-gm': {
    area: 'fabricate-manager',
    props: { ...SHARED, variant: 'readonly-gm', triggerSentence: 'When the award is missed' },
  },
});

/**
 * The computed values, player and authoring frozen before issue 2445, readonly-gm at its
 * shell-less row.
 */
const FROZEN = Object.freeze({
  player: {
    root: ['1px', 'solid', 'rgba(0, 0, 0, 0)', '9px', 'rgba(0, 0, 0, 0)'],
    flex: ['0', '0px'],
    line: ['8px', '0px', 'flex-start'],
    tile: ['30px', '30px', '7px', 'rgba(185, 124, 120, 0.54)'],
    copy: '2px',
    headline: ['flex', '6px'],
    name: ['Spectral, Georgia, "Times New Roman", serif', '12.5px'],
  },
  authoring: {
    root: ['1px', 'solid', 'rgba(217, 184, 156, 0.18)', '11px', 'rgb(21, 33, 43)'],
    flex: ['0', '0px'],
    line: ['12px', '12px', 'center'],
    tile: ['30px', '30px', '7px', 'rgba(185, 124, 120, 0.54)'],
    copy: '2px',
    headline: ['contents', 'normal'],
    name: ['Spectral, Georgia, "Times New Roman", serif', '12.5px'],
  },
  'readonly-gm': {
    root: ['0px', 'none', 'rgb(241, 209, 181)', '0px', 'rgba(0, 0, 0, 0)'],
    flex: ['1', '0px'],
    line: ['8px', '0px', 'center'],
    tile: null,
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
  const tileElement = root.querySelector('.fab-complication-severity');
  const tile = tileElement && css(tileElement);
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
    flex: [rootStyle.flexGrow, rootStyle.minWidth],
    line: [line.gap, line.padding, line.alignItems],
    tile: tile && [tile.width, tile.height, tile.borderTopLeftRadius, tile.borderTopColor],
    copy: css(root.querySelector('.fab-complication-row-copy')).gap,
    headline: [headline.display, headline.gap],
    name: [name.fontFamily, name.fontSize],
  };
}

const markup = {};
const measured = {};

/** The authoring row with a delete handler, whose remove control is the app's one ghost-danger. */
const REMOVABLE = Object.freeze({
  area: 'fabricate-manager',
  props: {
    ...VARIANTS.authoring.props,
    onDelete() {},
    deleteLabel: 'Remove Choking dust',
  },
});

/** Runs IN THE PAGE: the remove control at rest, its edge, ink and fill, and its box. */
function measureRemove() {
  const button = document.querySelector('[data-probe="removable"] [data-complication-remove]');
  const style = getComputedStyle(button);
  const box = button.getBoundingClientRect();
  return {
    border: style.borderTopColor,
    ink: style.color,
    ground: style.backgroundColor,
    box: [box.width, box.height],
  };
}

describe('2445 the complication row variants keep their frozen geometry', () => {
  before(async () => {
    await harness.setup();
    try {
      for (const [variant, { props }] of Object.entries(VARIANTS)) {
        markup[variant] = (await harness.mount(props)).innerHTML;
        harness.remount();
      }
      markup.removable = (await harness.mount(REMOVABLE.props)).innerHTML;
    } finally {
      harness.teardown();
    }
    const scoped = scopedComponentCss(resolve(repoRoot, ROW_PATH)).css;
    const probes = [
      ...Object.entries(VARIANTS).map(([variant, { area }]) => [variant, area]),
      ['removable', REMOVABLE.area],
    ];
    const areas = probes
      .map(
        ([probe, area]) =>
          `<div class="fabricate ${area}" data-fabricate-theme="fabricate">` +
          `<div data-probe="${probe}" style="width:420px">${markup[probe]}</div></div>`
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
      measured.remove = await page.evaluate(measureRemove);
    } finally {
      await browser.close();
    }
  });

  after(() => {
    for (const key of Object.keys(measured)) delete measured[key];
  });

  for (const variant of Object.keys(VARIANTS)) {
    // GUARD: red when the split-out `is-player` rule loses its radius. RED (readonly-gm): red
    // when its root's border, radius and fill or its line padding come back.
    it(`${variant === 'readonly-gm' ? 'RED' : 'GUARD'}: ${variant} keeps its shell, line, tile and type`, () => {
      assert.deepEqual(measured[variant], FROZEN[variant], `${variant} moved`);
    });
  }

  for (const variant of ['player', 'authoring']) {
    // GUARD: the tile stays for both, so the read-only variant's removal is scoped to it alone.
    it(`GUARD: ${variant} still draws the severity tile`, () => {
      assert.match(
        stripHash(markup[variant]),
        /<span aria-hidden="true" class="fab-complication-severity is-danger"><i class="fas fa-skull"><\/i><\/span>/,
        `${variant} renders the tile`
      );
    });
  }

  // RED (issue 2632): the remove control drew the danger edge and ink at rest.
  it("RED: the authoring row's remove control rests quiet, with no edge or fill", () => {
    assert.deepEqual(measured.remove, {
      border: 'rgba(0, 0, 0, 0)',
      ink: 'rgba(217, 184, 156, 0.56)',
      ground: 'rgba(0, 0, 0, 0)',
      box: [28, 28],
    });
  });
});

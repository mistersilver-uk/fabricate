/**
 * The toned status cards Fabricate's own editors draw, in Chromium under the whole module sheet, in
 * all seven palettes: each caller's card computes the fill and the sub-line ink the contrast
 * measurement covers. The On failure screen's flag cards and the recipe, results and salvage cards
 * wear their tone's soft fill and the secondary sub ink, the Tool editor's system-enabled card
 * keeps the neutral fill its own rule repaints and the resting card's muted sub ink, and an
 * untoned card in a break-tools trigger keeps the muted ink on the accent wash its caller paints.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../src/ui/theme.js';
import { chromium } from '../helpers/playwrightChromium.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

/** Each caller's id, the ancestor classes it draws under, its tone class, and its expected paint. */
const ROWS = Object.freeze([
  [
    'checks-flag',
    'manager-checks-flag-list',
    'is-info',
    'info-soft',
    'info-border',
    'text-secondary',
  ],
  ['results-tab', '', 'is-info', 'info-soft', 'info-border', 'text-secondary'],
  ['salvage-card', '', 'is-info', 'info-soft', 'info-border', 'text-secondary'],
  [
    'overview-enabled',
    'manager-recipe-overview-status',
    'is-enabled',
    'success-soft',
    'success-border',
    'text-secondary',
  ],
  [
    'overview-locked',
    'manager-recipe-overview-status',
    'is-locked',
    'accent-soft',
    'accent-border',
    'text-secondary',
  ],
  [
    'tool-system',
    'manager-tool-system-enabled',
    'is-enabled',
    'surface-soft',
    'border',
    'text-muted',
  ],
  [
    'break-tools',
    'manager-checks-breakage-trigger',
    '',
    'accent-soft',
    'accent-border',
    'text-muted',
  ],
]);
const CALLERS = ROWS.map(([id, wrapper, tone, fill, edge, sub]) => ({
  id,
  wrapper,
  tone,
  fill,
  edge,
  sub,
}));

const card = (id, wrapper, tone) => {
  const body = `<div class="fabricate-toggle-card manager-recipe-status-card ${tone} is-on" data-caller="${id}"><p class="manager-recipe-status-title">T</p><p class="manager-recipe-status-sub">S</p></div>`;
  return wrapper ? `<div class="${wrapper}">${body}</div>` : body;
};

const probe = (property, token) =>
  `<i data-probe="${token}" style="${property}:var(--fab-${token})"></i>`;
const PROBES = [
  ...['info-soft', 'success-soft', 'accent-soft', 'surface-soft'].map((t) =>
    probe('background', t)
  ),
  ...[
    'info-border',
    'success-border',
    'accent-border',
    'border',
    'text-secondary',
    'text-muted',
  ].map((t) => probe('color', t)),
].join('');

let browser;
let tab;

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 600, height: 800 } });
  const cards = CALLERS.map(({ id, wrapper, tone }) => card(id, wrapper, tone)).join('');
  await tab.setContent(
    `${renderedPageHead([])}<body class="game"><div class="fabricate fabricate-app fabricate-manager" data-fabricate-theme="fabricate">${PROBES}${cards}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

const measure = () =>
  tab.evaluate(() => {
    const read = (node, property) => getComputedStyle(node)[property];
    const probes = Object.fromEntries(
      [...document.querySelectorAll('[data-probe]')].map((node) => [
        node.dataset.probe,
        node.style.background ? read(node, 'backgroundColor') : read(node, 'color'),
      ])
    );
    const cards = Object.fromEntries(
      [...document.querySelectorAll('[data-caller]')].map((node) => [
        node.dataset.caller,
        {
          fill: read(node, 'backgroundColor'),
          edge: read(node, 'borderTopColor'),
          sub: read(node.querySelector('.manager-recipe-status-sub'), 'color'),
        },
      ])
    );
    return { probes, cards };
  });

describe('the toned status cards the editors draw', () => {
  for (const theme of Object.values(FABRICATE_THEME_IDS)) {
    it(`draw the fill and sub ink the measurement covers, in ${theme}`, async () => {
      await tab.evaluate(
        ([attribute, value]) => document.querySelector('.fabricate').setAttribute(attribute, value),
        [FABRICATE_THEME_ATTRIBUTE, theme]
      );
      const { probes, cards } = await measure();
      for (const { id, fill, edge, sub } of CALLERS) {
        assert.equal(cards[id].fill, probes[fill], `${id} fill`);
        assert.equal(cards[id].edge, probes[edge], `${id} edge`);
        assert.equal(cards[id].sub, probes[sub], `${id} sub ink`);
      }
      assert.notEqual(probes['text-secondary'], probes['text-muted'], 'the two inks differ');
    });
  }
});

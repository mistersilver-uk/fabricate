/**
 * Issue 2841 — the published `StatBox`'s danger label in Chromium, on the markup the seam draws:
 * the composed `Kicker` resolves to `--fab-text-secondary` in the `danger` tone, at both layouts and
 * in the palettes where the muted ink falls short on the danger fill, and keeps `--fab-text-muted`
 * in every other tone, so the scoped override wins the real cascade over the kicker's own rule.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-stat-box-danger-label-rendered-');
const THEMES = Object.freeze(['fabricate', 'hearth-herb', 'starglass-arcana', 'foundry-native']);
const CASES = Object.freeze([
  ['danger', { tone: 'danger' }],
  ['danger-start', { tone: 'danger', layout: 'start' }],
  ['default', {}],
  ['info', { tone: 'info' }],
  ['success', { tone: 'success' }],
]);

describe('the published StatBox danger label, rendered (issue 2841)', () => {
  let browser;
  let tab;

  before(async () => {
    const cells = [];
    for (const [id, props] of CASES) {
      const { target, handle } = mountEntry('StatBox', { value: '2', label: 'Missing', ...props });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      handle.destroy();
    }
    const probes = ['--fab-text-secondary', '--fab-text-muted']
      .map((name) => `<i data-token="${name}" style="color:var(${name})"></i>`)
      .join('');
    const themes = THEMES.map(
      (theme) =>
        `<div class="fabricate fabricate-app" data-fabricate-theme="${theme}" data-theme="${theme}">` +
        `${cells.join('')}${probes}</div>`
    ).join('');
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 480, height: 900 } });
    await tab.setContent(
      `${renderedPageHead(['Kicker', 'StatBox'])}<body class="game">${themes}</body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  /** In each theme, the case's label colour and the two tokens' colours. */
  const read = (id) =>
    tab.evaluate((hook) => {
      const colour = (node) => getComputedStyle(node).color;
      return [...document.querySelectorAll('[data-theme]')].map((root) => ({
        label: colour(root.querySelector(`[data-case="${hook}"] .fab-stat-box > .fab-kicker`)),
        secondary: colour(root.querySelector('[data-token="--fab-text-secondary"]')),
        muted: colour(root.querySelector('[data-token="--fab-text-muted"]')),
      }));
    }, id);

  for (const id of ['danger', 'danger-start']) {
    it(`inks the ${id} label secondary in every palette it is read in`, async () => {
      for (const { label, secondary, muted } of await read(id)) {
        assert.notEqual(secondary, muted);
        assert.equal(label, secondary);
      }
    });
  }

  for (const id of ['default', 'info', 'success']) {
    it(`keeps the ${id} label muted`, async () => {
      for (const { label, muted } of await read(id)) assert.equal(label, muted);
    });
  }
});

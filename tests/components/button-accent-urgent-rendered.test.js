/**
 * Issue 2841 — the published `Button`'s `accent` and `urgent` roles in Chromium, on the markup the
 * seam draws, under the module sheet: each face at rest and under the pointer as the cascade
 * resolves it, beside the neutral baseline; the disabled face both take; the busy dimming; the
 * keyboard ring 2px clear of the urgent tile; and forced colours, in a light and a dark scheme,
 * where the pressed face is the reader's Highlight, the urgent and accent roles are repainted as a
 * neutral button is, and the ring of a focused urgent or pressed button is CanvasText.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-button-accent-urgent-rendered-');

/** Each case's id and the props its button takes beside its label and `onclick`. */
const CASES = Object.freeze([
  ['neutral', {}],
  ['accent', { role: 'accent' }],
  ['urgent', { role: 'urgent' }],
  ['pressed', { pressed: true }],
  ['neutral-disabled', { disabled: true }],
  ['accent-disabled', { role: 'accent', disabled: true }],
  ['urgent-disabled', { role: 'urgent', disabled: true }],
  ['urgent-busy', { role: 'urgent', busy: true }],
]);
const TOKENS = Object.freeze([
  '--fab-accent',
  '--fab-accent-hover',
  '--fab-accent-text',
  '--fab-accent-soft',
  '--fab-accent-border',
  '--fab-on-accent',
]);

describe('the published Button accent and urgent roles, rendered (issue 2841)', () => {
  let browser;
  let tab;

  before(async () => {
    const cells = [];
    for (const [id, props] of CASES) {
      const { target, handle } = mountEntry('Button', {
        children: 'Advance',
        onclick() {},
        ...props,
      });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      handle.destroy();
    }
    const probes = TOKENS.map(
      (name) => `<i data-token="${name}" style="color:var(${name})"></i>`
    ).join('');
    const system = ['highlight', 'highlighttext', 'canvastext']
      .map((name) => `<i data-system="${name}" style="color:${name}"></i>`)
      .join('');
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 600, height: 700 } });
    await tab.setContent(
      `${renderedPageHead([])}<body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">` +
        '<style>[data-case]{display:flex;padding:8px}</style>' +
        `${cells.join('')}<div>${probes}${system}</div></div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  const resolved = (attribute, name) =>
    tab.evaluate(
      ([key, value]) => getComputedStyle(document.querySelector(`[${key}="${value}"]`)).color,
      [attribute, name]
    );
  const tokenColour = (name) => resolved('data-token', name);
  const systemColour = (name) => resolved('data-system', name);

  /** The case's button face as Chromium computes it now. */
  const faceOf = (id) =>
    tab.evaluate((hook) => {
      const style = getComputedStyle(document.querySelector(`[data-case="${hook}"] button`));
      return {
        ink: style.color,
        fill: style.backgroundColor,
        edge: style.borderTopColor,
        opacity: style.opacity,
        outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
      };
    }, id);

  const rest = async () => {
    await tab.mouse.move(590, 690);
    await tab.evaluate(() => document.activeElement?.blur());
  };

  it('draws the accent role outlined at rest and on the soft accent fill under the pointer', async () => {
    await rest();
    const face = await faceOf('accent');
    assert.deepEqual(
      [face.ink, face.fill, face.edge],
      [
        await tokenColour('--fab-accent-text'),
        'rgba(0, 0, 0, 0)',
        await tokenColour('--fab-accent'),
      ]
    );
    await tab.hover('[data-case="accent"] button');
    const hovered = await faceOf('accent');
    assert.deepEqual(
      [hovered.ink, hovered.fill, hovered.edge],
      [
        await tokenColour('--fab-accent-text'),
        await tokenColour('--fab-accent-soft'),
        await tokenColour('--fab-accent'),
      ]
    );
  });

  it('draws the urgent role as the solid accent tile at rest and the hover accent under the pointer', async () => {
    await rest();
    const face = await faceOf('urgent');
    const accent = await tokenColour('--fab-accent');
    assert.deepEqual(
      [face.ink, face.fill, face.edge],
      [await tokenColour('--fab-on-accent'), accent, accent]
    );
    await tab.hover('[data-case="urgent"] button');
    const hovered = await faceOf('urgent');
    const deeper = await tokenColour('--fab-accent-hover');
    assert.deepEqual(
      [hovered.ink, hovered.fill, hovered.edge],
      [await tokenColour('--fab-on-accent'), deeper, deeper]
    );
  });

  it('differs from the neutral baseline in ink, fill and edge, and matches the pressed tile', async () => {
    await rest();
    const [neutral, accent, urgent, pressed] = await Promise.all(
      ['neutral', 'accent', 'urgent', 'pressed'].map((id) => faceOf(id))
    );
    for (const face of [accent, urgent]) {
      assert.notDeepEqual(
        [face.ink, face.fill, face.edge],
        [neutral.ink, neutral.fill, neutral.edge]
      );
    }
    assert.deepEqual(
      [urgent.ink, urgent.fill, urgent.edge],
      [pressed.ink, pressed.fill, pressed.edge]
    );
  });

  it('draws the disabled face for either role, the neutral one’s', async () => {
    await rest();
    const neutral = await faceOf('neutral-disabled');
    for (const id of ['accent-disabled', 'urgent-disabled']) {
      assert.deepEqual(await faceOf(id), neutral, id);
    }
    assert.equal(neutral.opacity, '0.62');
  });

  it('dims a busy urgent tile and keeps its colours', async () => {
    await rest();
    const busy = await faceOf('urgent-busy');
    assert.equal(busy.opacity, '0.7');
    assert.equal(busy.fill, await tokenColour('--fab-accent'));
  });

  it('draws the accent keyboard ring 2px clear of the urgent tile', async () => {
    await rest();
    await tab.focus('[data-case="accent"] button');
    await tab.keyboard.press('Tab');
    const face = await faceOf('urgent');
    assert.deepEqual(face.outline, ['solid', '2px', '2px', await tokenColour('--fab-accent')]);
  });

  /** Moves keyboard focus onto the case after `before`, as Tab does. */
  const tabTo = async (before) => {
    await tab.focus(`[data-case="${before}"] button`);
    await tab.keyboard.press('Tab');
  };

  for (const colorScheme of ['light', 'dark']) {
    it(`repaints urgent as a plain button under forced colours in a ${colorScheme} scheme, and keeps pressed the Highlight tile`, async () => {
      await rest();
      await tab.emulateMedia({ forcedColors: 'active', colorScheme });
      try {
        const highlight = await systemColour('highlight');
        const [neutral, accent, urgent, pressed] = await Promise.all(
          ['neutral', 'accent', 'urgent', 'pressed'].map((id) => faceOf(id))
        );
        // The repaint keeps a fill's alpha, so a translucent neutral fill differs from an opaque one there alone.
        const opaque = (colour) =>
          colour.replace(/^rgba\((\d+), (\d+), (\d+), [\d.]+\)$/u, 'rgb($1, $2, $3)');
        const plain = [neutral.ink, opaque(neutral.fill), neutral.edge];
        assert.deepEqual([urgent.ink, opaque(urgent.fill), urgent.edge], plain, 'urgent');
        assert.deepEqual([accent.ink, opaque(accent.fill), accent.edge], plain, 'accent');
        assert.deepEqual([pressed.fill, pressed.edge], [highlight, highlight]);
        assert.notEqual(pressed.fill, neutral.fill);
      } finally {
        await tab.emulateMedia({ forcedColors: 'none', colorScheme: 'light' });
      }
    });

    it(`draws the ring of a focused urgent or pressed button in CanvasText under forced colours in a ${colorScheme} scheme`, async () => {
      await rest();
      const themeAccent = await tokenColour('--fab-accent');
      await tab.emulateMedia({ forcedColors: 'active', colorScheme });
      try {
        const canvasText = await systemColour('canvastext');
        for (const [id, before] of [
          ['urgent', 'accent'],
          ['pressed', 'urgent'],
        ]) {
          await tabTo(before);
          const { outline } = await faceOf(id);
          assert.deepEqual(outline, ['solid', '2px', '2px', canvasText], id);
          assert.notEqual(outline[3], themeAccent, `${id} is not the theme accent`);
        }
      } finally {
        await tab.emulateMedia({ forcedColors: 'none', colorScheme: 'light' });
      }
    });
  }
});

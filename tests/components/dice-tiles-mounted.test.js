/** Issue 2006 — the shared die tiles, MOUNTED, and laid out at chat-sidebar width (N28). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { projectCountResults } from '../../src/systems/countEvaluation.js';
import { renderDiceTilesHtml, tileModel } from '../../src/ui/presenters/countDiceTiles.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { renderWithCascade } from '../helpers/layout-harness.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const DICE_TILES = 'src/ui/svelte/components/DiceTiles.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-dice-tiles-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/presenters/countDiceTiles.js',
    'src/ui/presenters/htmlEscape.js',
    'src/utils/fillPlaceholders.js',
    'src/utils/localizeWithFallback.js',
  ],
  compiledModules: [DICE_TILES],
  componentPath: DICE_TILES,
});

/** Six d10s at 8 or better, tens exploding and ones cancelling: 8 10 1 3 9 2, then 10 and 1. */
function smithing() {
  return tileModel(projectedSmithing());
}

function projectedSmithing() {
  const policy = {
    dice: 6,
    die: 10,
    threshold: 8,
    direction: 'over',
    comparison: 'meet',
    explode: { kind: 'best', once: false },
    cancel: { kind: 'worst' },
  };
  const faces = [8, 10, 1, 3, 9, 2, 10, 1];
  const results = faces.map((result, index) => ({ result, exploded: result === 10 && index < 7 }));
  return projectCountResults({ policy, results, number: 6 });
}

const tilesOf = (root) => [...root.querySelectorAll('.fabricate-dice-tiles__tile')];
const authored = (node) =>
  [...node.classList].filter((name) => !name.startsWith('svelte-')).join(' ');

/** Element, attributes and own text, without Svelte's scope hash or its anchors. */
function canonical(node) {
  if (node.nodeType === 3) return node.textContent.trim() || null;
  if (node.nodeType !== 1) return null;
  const attributes = [...node.attributes]
    .map(({ name, value }) =>
      name === 'class'
        ? [name, value.split(/\s+/).filter((token) => token && !token.startsWith('svelte-')).join(' ')]
        : [name, value]
    )
    .sort(([a], [b]) => a.localeCompare(b));
  const children = [...node.childNodes].map(canonical).filter((child) => child !== null);
  return { tag: node.tagName.toLowerCase(), attributes, children };
}

function parsed(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return canonical(host.firstElementChild);
}

describe('2006 DiceTiles', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('renders one list item per die with every mark, and each explosion die after its parent', async () => {
    const root = await harness.mount({ model: smithing() });
    const tiles = tilesOf(root);
    assert.equal(root.querySelector('.fabricate-dice-tiles__list').tagName, 'UL');
    assert.ok(tiles.every((tile) => tile.tagName === 'LI'));
    assert.deepEqual(
      tiles.map((tile) => [
        tile.dataset.diceTileFace,
        tile.dataset.diceTileMarks,
        tile.hasAttribute('data-dice-tile-generated'),
      ]),
      [
        ['8', 'qualified', false],
        ['10', 'qualified exploded', false],
        ['10', 'qualified exploded', true],
        ['1', 'cancelled', true],
        ['1', 'cancelled', false],
        ['3', '', false],
        ['9', 'qualified', false],
        ['2', '', false],
      ]
    );
    const glyphs = [...tiles[1].querySelectorAll('i')];
    assert.deepEqual(
      glyphs.map((glyph) => authored(glyph)),
      ['fa-solid fa-check', 'fa-solid fa-rotate'],
      'both marks draw on the one tile'
    );
    assert.ok(glyphs.every((glyph) => glyph.getAttribute('aria-hidden') === 'true'));
    assert.equal(tiles[1].getAttribute('aria-label'), '10, qualified and exploded');
    assert.equal(tiles[2].getAttribute('aria-label'), '10, qualified, exploded and rolled by an explosion');
    assert.equal(tiles[5].getAttribute('aria-label'), '3');
    assert.ok(!tiles[5].querySelector('.fabricate-dice-tiles__marks'), 'a plain die draws no marks');
    assert.ok(tiles[1].classList.contains('fabricate-dice-tiles__tile--success'));
    assert.ok(tiles[4].classList.contains('fabricate-dice-tiles__tile--danger'));
    assert.ok(!root.querySelector('.fabricate-dice-tiles__legend'), 'no legend unless asked');
  });

  it('renders the markup the chat renderer writes, tile for tile', async () => {
    const model = smithing();
    const root = await harness.mount({ model, legend: true });
    assert.deepEqual(
      canonical(root.querySelector('.fabricate-dice-tiles')),
      parsed(renderDiceTilesHtml(model, (key) => key, { legend: true }))
    );
  });

  it('draws the legend and a host’s own hooks, and follows a new model', async () => {
    const root = await harness.mount({
      model: smithing(),
      legend: true,
      faceDataAttr: 'data-checks-simulator-face',
      marksDataAttr: 'data-checks-simulator-face-marks',
      legendDataAttr: 'data-checks-simulator-legend',
    });
    assert.equal(
      root.querySelector('[data-checks-simulator-legend]').textContent.trim(),
      '✓ qualified · ✕ cancelled · ↻ exploded'
    );
    assert.equal(root.querySelectorAll('[data-checks-simulator-face]').length, 8);
    assert.equal(root.querySelectorAll('[data-dice-tile-face], [data-dice-tiles-legend]').length, 0);
    await harness.setProps({ model: { tiles: [{ face: 4, marks: [], generated: false }], more: 0 } });
    assert.deepEqual(
      tilesOf(root).map((tile) => tile.dataset.checksSimulatorFace),
      ['4']
    );
    await harness.setProps({ model: tileModel(null) });
    assert.ok(!root.querySelector('.fabricate-dice-tiles'), 'no tiles, no list and no legend');
  });

  it('states the dice the cap left out as one more item', async () => {
    const results = Array.from({ length: 52 }, (_, index) => ({ index, face: 6, qualified: true }));
    const root = await harness.mount({ model: tileModel({ results }) });
    assert.equal(tilesOf(root).length, 40);
    const more = root.querySelector('[data-dice-tiles-more]');
    assert.equal(more.tagName, 'LI');
    assert.equal(more.dataset.diceTilesMore, '12');
    assert.equal(more.textContent.trim(), '+12 more');
  });

  it('marks the bought die, says so in its label and the legend, as the chat renderer does', async () => {
    const model = tileModel({ ...projectedSmithing(), bought: 1 });
    const root = await harness.mount({ model, legend: true });
    const tiles = tilesOf(root);
    const bought = tiles.filter((tile) => tile.classList.contains('fabricate-dice-tiles__tile--bought'));
    assert.deepEqual(
      bought.map((tile) => [tile.dataset.diceTileFace, tile.dataset.diceTileMarks]),
      [['2', 'bought']],
      'the last original die, after the explosions earlier dice rolled'
    );
    assert.equal(bought[0].getAttribute('aria-label'), '2, bought');
    assert.equal(
      root.querySelector('[data-dice-tiles-legend]').textContent.trim(),
      '✓ qualified · ✕ cancelled · ↻ exploded · dashed = bought'
    );
    assert.deepEqual(
      canonical(root.querySelector('.fabricate-dice-tiles')),
      parsed(renderDiceTilesHtml(model, (key) => key, { legend: true }))
    );
  });

  it('dashes a bought tile’s border and keeps the colour its tone gives it', async () => {
    const tile = (face, marks, bought = false) => ({ face, marks, generated: false, ...(bought && { bought }) });
    const model = {
      tiles: [tile(9, ['qualified']), tile(9, ['qualified'], true), tile(1, ['cancelled'], true), tile(3, [], true)],
      more: 0,
      bought: 3,
    };
    const tokens = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
    for (const host of ['', 'fabricate-craft-chat']) {
      const view = await renderWithCascade(
        `<div class="${host}">${renderDiceTilesHtml(model)}</div>`,
        [tokens],
        { viewport: { width: 400, height: 300 } }
      );
      try {
        const borders = await view.page.evaluate(() =>
          [...document.querySelectorAll('.fabricate-dice-tiles__tile')].map((node) => {
            const style = getComputedStyle(node);
            return [style.borderTopStyle, style.borderTopColor, style.borderTopWidth];
          })
        );
        const plain = await view.page.evaluate(() => {
          const probe = document.createElement('li');
          probe.className = 'fabricate-dice-tiles__tile';
          document.querySelector('.fabricate-dice-tiles__list').append(probe);
          const danger = probe.cloneNode();
          danger.classList.add('fabricate-dice-tiles__tile--danger');
          probe.after(danger);
          return [probe, danger].map((node) => getComputedStyle(node).borderTopColor);
        });
        assert.deepEqual(borders.map(([style]) => style), ['solid', 'dashed', 'dashed', 'dashed'], host);
        assert.equal(new Set([borders[0][1], ...plain]).size, 3, `${host} the three tones differ`);
        assert.equal(borders[1][1], borders[0][1], `${host} a bought success tile keeps the success border`);
        assert.equal(borders[2][1], plain[1], `${host} a bought cancel keeps the danger border`);
        assert.equal(borders[3][1], plain[0], `${host} a bought plain die keeps the hairline`);
        assert.ok(borders.every((border) => border[2] === '1px'), `${host} only the style changes`);
      } finally {
        await view.close();
      }
    }
  });

  it('wraps inside a 280px chat column with no horizontal scroll', async () => {
    const results = Array.from({ length: 40 }, (_, index) => ({
      index,
      face: 10 + (index % 90),
      qualified: index % 3 === 0,
      cancelled: index % 5 === 0,
      exploded: index % 7 === 0,
    }));
    const root = await harness.mount({ model: { ...tileModel({ results }), more: 959 }, legend: true });
    const componentCss = [...document.head.querySelectorAll('style')].map((node) => node.textContent);
    const tokens = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
    // Styled once, globally: a chat card draws these tiles outside every Fabricate window.
    assert.ok(tokens.includes('.fabricate-dice-tiles__list {'), 'the family is in the sheet');
    assert.ok(!componentCss.some((sheet) => sheet.includes('fabricate-dice-tiles__list')));
    const view = await renderWithCascade(
      `<div id="host" style="width:280px">${root.innerHTML}</div>`,
      [tokens, ...componentCss],
      { viewport: { width: 400, height: 900 } }
    );
    try {
      const layout = await view.page.evaluate(() => {
        const host = document.getElementById('host');
        const bounds = host.getBoundingClientRect();
        const boxes = [...host.querySelectorAll('li')].map((node) => node.getBoundingClientRect());
        return {
          overflow: host.scrollWidth - host.clientWidth,
          outside: boxes.filter((box) => box.right > bounds.right + 0.5).length,
          rows: new Set(boxes.map((box) => Math.round(box.top))).size,
          tile: [...host.querySelectorAll('.fabricate-dice-tiles__tile')].map((node) => {
            const box = node.getBoundingClientRect();
            return [Math.round(box.width), Math.round(box.height)];
          })[0],
        };
      });
      assert.equal(layout.overflow, 0, 'nothing scrolls sideways');
      assert.equal(layout.outside, 0, 'every tile and the overflow item stay inside the column');
      assert.ok(layout.rows >= 6, `forty tiles wrap onto several rows, measured ${layout.rows}`);
      assert.deepEqual(layout.tile, [38, 44], 'frame 39’s tile');
    } finally {
      await view.close();
    }
  });
});

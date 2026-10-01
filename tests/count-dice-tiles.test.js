/** Issue 2006 — the shared die-tile model and its escaped chat renderer (N28). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { projectCountResults } from '../src/systems/countEvaluation.js';
import {
  DICE_TILE_BOUGHT,
  DICE_TILE_LIMIT,
  legendText,
  renderDiceTilesHtml,
  tileLabel,
  tileMarkTokens,
  tileModel,
  tileTone,
} from '../src/ui/presenters/countDiceTiles.js';
import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';

/** Six d10s at 8 or better, tens exploding and ones cancelling (the lab's smithing pool). */
const POLICY = Object.freeze({
  dice: 6,
  die: 10,
  threshold: 8,
  direction: 'over',
  comparison: 'meet',
  explode: { kind: 'best', once: false },
  cancel: { kind: 'worst' },
});

/** 8 10 1 3 9 2; the 10 explodes into a 10, which explodes into a 1. */
function smithing() {
  const faces = [8, 10, 1, 3, 9, 2, 10, 1];
  const results = faces.map((result, index) => ({ result, exploded: result === 10 && index < 7 }));
  return projectCountResults({ policy: POLICY, results, number: 6 });
}

const summary = (model) =>
  model.tiles.map((tile) => [tile.face, tile.marks.join(' '), tile.generated]);

/** Parse the renderer's tiles into what a reader and a harness see. */
function renderedTiles(html) {
  return [...html.matchAll(/<li class="([^"]*)"([^>]*)>/g)].map(([, classes, attributes]) => ({
    classes: classes.split(' '),
    face: /data-dice-tile-face="([^"]*)"/.exec(attributes)?.[1] ?? null,
    marks: /data-dice-tile-marks="([^"]*)"/.exec(attributes)?.[1] ?? null,
    generated: attributes.includes('data-dice-tile-generated=""'),
    label: /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? null,
  }));
}

describe('tileModel', () => {
  it('puts each explosion die straight after the die that rolled it, chained explosions too', () => {
    assert.deepEqual(summary(tileModel(smithing())), [
      [8, 'qualified', false],
      [10, 'qualified exploded', false],
      [10, 'qualified exploded', true],
      [1, 'cancelled', true],
      [1, 'cancelled', false],
      [3, '', false],
      [9, 'qualified', false],
      [2, '', false],
    ]);
  });

  it('keeps every mark a die earned on its one tile', () => {
    const projection = projectCountResults({
      policy: { ...POLICY, dice: 2, die: 6, threshold: 1, explode: null },
      results: [{ result: 1 }, { result: 4 }],
      number: 2,
    });
    assert.deepEqual(tileModel(projection).tiles[0], {
      face: 1,
      marks: ['qualified', 'cancelled'],
      generated: false,
    });
  });

  it('orders by provenance, not by index, when two originals explode', () => {
    const results = [
      { index: 0, face: 10, qualified: true, exploded: true, explodedFrom: null },
      { index: 1, face: 10, qualified: true, exploded: true, explodedFrom: null },
      { index: 2, face: 4, explodedFrom: 0 },
      { index: 3, face: 9, qualified: true, explodedFrom: 1 },
    ];
    assert.deepEqual(
      tileModel({ results }).tiles.map((tile) => tile.face),
      [10, 4, 10, 9]
    );
  });

  it('draws active dice only, and a generated die under an inactive parent still shows', () => {
    const results = [
      { index: 0, face: 10, active: false, exploded: true, explodedFrom: null },
      { index: 1, face: 3, explodedFrom: 0 },
    ];
    assert.deepEqual(summary(tileModel({ results })), [[3, '', true]]);
  });

  it('caps the tiles at 40 and counts the rest as more', () => {
    const results = Array.from({ length: 45 }, (_, index) => ({ index, face: 5, qualified: true }));
    const model = tileModel({ results });
    assert.equal(DICE_TILE_LIMIT, 40);
    assert.equal(model.tiles.length, 40);
    assert.equal(model.more, 5);
    assert.equal(tileModel({ results: results.slice(0, 40) }).more, 0);
  });

  it('is empty for no projection', () => {
    assert.deepEqual(tileModel(null), { tiles: [], more: 0 });
  });
});

describe('tile labels and tones', () => {
  it('names the face and every mark, and a die an explosion rolled', () => {
    const localize = shippedLocalize;
    assert.equal(tileLabel({ face: 3, marks: [], generated: false }, localize), '3');
    assert.equal(
      tileLabel({ face: 10, marks: ['qualified', 'exploded'], generated: false }, localize),
      '10, qualified and exploded'
    );
    assert.equal(
      tileLabel({ face: 10, marks: ['qualified', 'exploded'], generated: true }, localize),
      '10, qualified, exploded and rolled by an explosion'
    );
    assert.equal(
      tileLabel({ face: 1, marks: [], generated: true }, localize),
      '1, rolled by an explosion'
    );
  });

  it('reads the translated copy, and English when a key is untranslated', () => {
    const tile = { face: 7, marks: ['qualified'], generated: true };
    assert.equal(tileLabel(tile, (key) => key), '7, qualified and rolled by an explosion');
    const french = (key) => (key.endsWith('.Generated') ? 'lancé par une explosion' : key);
    assert.equal(tileLabel(tile, french), '7, qualified and lancé par une explosion');
  });

  it('tones a cancel danger, a qualifying or exploding die success, and nothing else', () => {
    assert.equal(tileTone(['qualified', 'cancelled']), 'danger');
    assert.equal(tileTone(['exploded']), 'success');
    assert.equal(tileTone(['qualified']), 'success');
    assert.equal(tileTone([]), '');
  });
});

describe('renderDiceTilesHtml', () => {
  it('renders one list item per tile, with every mark, its hooks and its accessible name', () => {
    const html = renderDiceTilesHtml(tileModel(smithing()), shippedLocalize);
    const tiles = renderedTiles(html);
    assert.equal(tiles.length, 8);
    assert.deepEqual(tiles[2], {
      classes: ['fabricate-dice-tiles__tile', 'fabricate-dice-tiles__tile--success'],
      face: '10',
      marks: 'qualified exploded',
      generated: true,
      label: '10, qualified, exploded and rolled by an explosion',
    });
    assert.deepEqual(tiles[4].classes, [
      'fabricate-dice-tiles__tile',
      'fabricate-dice-tiles__tile--danger',
    ]);
    assert.deepEqual(tiles[5].classes, ['fabricate-dice-tiles__tile']);
    const second = html.split('<li ')[2];
    assert.match(second, /<i class="fa-solid fa-check" aria-hidden="true"><\/i><i class="fa-solid fa-rotate" aria-hidden="true"><\/i>/);
    assert.match(second, /<span class="fabricate-dice-tiles__face" aria-hidden="true">10<\/span>/);
  });

  it('adds the legend only when asked, and the overflow as its own item', () => {
    const results = Array.from({ length: 43 }, (_, index) => ({ index, face: 2 }));
    const html = renderDiceTilesHtml(tileModel({ results }), shippedLocalize);
    assert.match(html, /<li class="fabricate-dice-tiles__more" data-dice-tiles-more="3">\+3 more<\/li>/);
    assert.doesNotMatch(html, /legend/);
    const legend = renderDiceTilesHtml(tileModel(smithing()), shippedLocalize, { legend: true });
    assert.match(
      legend,
      /<p class="fabricate-dice-tiles__legend" data-dice-tiles-legend="">✓ qualified · ✕ cancelled · ↻ exploded<\/p><\/div>$/
    );
  });

  it('escapes the face and the translated copy it writes', () => {
    const model = { tiles: [{ face: '<b>', marks: ['qualified'], generated: false }], more: 0 };
    const hostile = (key) => (key.endsWith('.MarkQualified') ? '"q" & <i>' : key);
    const html = renderDiceTilesHtml(model, hostile);
    assert.ok(!html.includes('<b>'));
    assert.match(html, /aria-label="&lt;b&gt;, &quot;q&quot; &amp; &lt;i&gt;"/);
  });

  it('never borrows Foundry core dice or result classes', () => {
    const html = renderDiceTilesHtml(tileModel(smithing()), shippedLocalize, { legend: true });
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => value.split(' '));
    const core = ['dice-tooltip', 'dice-rolls', 'roll', 'die', 'd10', 'dice-total', 'success', 'failure'];
    assert.deepEqual(classes.filter((name) => core.includes(name) || /^(min|max)$/.test(name)), []);
  });

  it('renders nothing for a model with no tile', () => {
    assert.equal(renderDiceTilesHtml(tileModel(null)), '');
    assert.equal(renderDiceTilesHtml(null), '');
  });
});

/** Three d6s at 4 or better, sixes exploding: 2 4 6, the 6 rolling a 3; `bought` dice marked. */
function boughtPool(bought) {
  const policy = { ...POLICY, dice: 3, die: 6, threshold: 4, cancel: null };
  const results = [{ result: 2 }, { result: 4 }, { result: 6, exploded: true }, { result: 3 }];
  return { ...projectCountResults({ policy, results, number: 3 }), bought };
}

const boughtSummary = (model) =>
  model.tiles.map((tile) => [tile.face, tileMarkTokens(tile), tile.generated]);

describe('bought dice (issue 2008)', () => {
  it('marks the last original dice in roll order, never the dice their explosions rolled', () => {
    assert.deepEqual(boughtSummary(tileModel(boughtPool(1))), [
      [2, '', false],
      [4, 'qualified', false],
      [6, 'qualified exploded bought', false],
      [3, '', true],
    ]);
    const twice = tileModel({ ...smithing(), bought: 2 });
    assert.deepEqual(
      twice.tiles.filter((tile) => tile.bought).map((tile) => tile.face),
      [9, 2],
      'the last two of six originals, past the explosions the 10 rolled'
    );
    assert.equal(twice.bought, 2);
  });

  it('keeps the shape of a roll that bought nothing', () => {
    for (const bought of [0, undefined, null, 1.5, -1, '1']) {
      const model = tileModel(boughtPool(bought));
      assert.ok(!Object.hasOwn(model, 'bought'), `bought ${bought}`);
      assert.ok(model.tiles.every((tile) => !Object.hasOwn(tile, 'bought')), `bought ${bought}`);
    }
  });

  it('names a bought die after its marks, and the legend gains the dashed key only for one', () => {
    const tile = { face: 11, marks: ['qualified'], generated: false, bought: true };
    assert.equal(tileLabel(tile, shippedLocalize), '11, qualified, bought');
    assert.equal(tileLabel({ ...tile, marks: [] }, shippedLocalize), '11, bought');
    assert.equal(tileLabel(tile, (key) => key), '11, qualified, bought', 'English fallback');
    assert.equal(DICE_TILE_BOUGHT, 'bought');
    assert.equal(legendText(shippedLocalize, 1), '✓ qualified · ✕ cancelled · ↻ exploded · dashed = bought');
    assert.equal(legendText(shippedLocalize, 0), '✓ qualified · ✕ cancelled · ↻ exploded');
    assert.equal(legendText(shippedLocalize), '✓ qualified · ✕ cancelled · ↻ exploded');
  });

  it('renders the bought tile dashed by class, its token and its label, and the legend key', () => {
    const html = renderDiceTilesHtml(tileModel(boughtPool(1)), shippedLocalize, { legend: true });
    const tiles = renderedTiles(html);
    assert.deepEqual(tiles[2], {
      classes: [
        'fabricate-dice-tiles__tile',
        'fabricate-dice-tiles__tile--success',
        'fabricate-dice-tiles__tile--bought',
      ],
      face: '6',
      marks: 'qualified exploded bought',
      generated: false,
      label: '6, qualified and exploded, bought',
    });
    assert.ok(
      tiles.filter((_, index) => index !== 2).every((tile) => !tile.classes.includes('fabricate-dice-tiles__tile--bought'))
    );
    assert.match(html, /data-dice-tiles-legend="">✓ qualified · ✕ cancelled · ↻ exploded · dashed = bought<\/p>/);
    const glyphs = html.split('<li ', 4)[3].match(/<i class="[^"]*"/g);
    assert.deepEqual(glyphs, ['<i class="fa-solid fa-check"', '<i class="fa-solid fa-rotate"'], 'no glyph for bought');
    assert.doesNotMatch(
      renderDiceTilesHtml(tileModel(boughtPool(0)), shippedLocalize, { legend: true }),
      /bought/
    );
  });
});

/**
 * The published `Medallion`'s `text` and `ink: accent` in Chromium, on the markup the seam draws
 * under the module sheet, in all seven palettes: the numeral fits inside every rung of the art
 * ladder at the ladder's glyph size, inks `--fab-text` on the slate tile and its tone's `-text` on
 * a toned one at 4.5:1 or more, and the accent ink reaches the glyph alone. The numeral is hidden
 * from the accessibility tree, so the name a companion writes beside the tile is all the tree
 * holds. Under forced colours the numeral takes the system text colour on the system ground, and
 * the tile declares no motion, so reduced motion changes nothing.
 * Limit: a font is the host's monospace here, since the headless browser carries no Foundry fonts,
 * so a fit read is of that face; the glyph size is the same one the ladder gives every face.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../src/ui/theme.js';
import { publishedAxPage } from '../helpers/publishedAxPage.js';
import { contrast } from '../helpers/themePaletteContrast.js';

const LADDER = Object.freeze([
  [22, 10],
  [24, 10],
  [26, 11],
  [28, 11],
  [30, 12],
  [32, 13],
  [34, 14],
  [36, 14],
  [38, 15],
  [44, 18],
]);
const TONES = Object.freeze(['success', 'danger', 'accent', 'warning', 'info']);
const CASES = [
  ...LADDER.map(([size, glyph]) => [`rung-${size}`, 'Medallion', { size, glyph, text: '888' }]),
  ...LADDER.map(([size, glyph]) => [
    `chip-${size}`,
    'Medallion',
    { size, glyph, text: '888', variant: 'glyph-chip' },
  ]),
  ['plain', 'Medallion', { size: 30, glyph: 12, text: '3' }],
  ['glyph', 'Medallion', { size: 30, glyph: 12, icon: 'fas fa-coins' }],
  ['ink-accent', 'Medallion', { size: 30, glyph: 12, icon: 'fas fa-coins', ink: 'accent' }],
  ['text-ink', 'Medallion', { size: 30, glyph: 12, text: '3', ink: 'danger', tint: 'rose' }],
  ...TONES.map((tone) => [`tone-${tone}`, 'Medallion', { size: 30, glyph: 12, text: '3', tone }]),
  ['named', 'Medallion', { size: 30, glyph: 12, text: '3' }],
];
const PROBES = [
  ...['text', 'accent-text', ...TONES.map((tone) => `${tone}-text`)].map(
    (token) => `<i data-probe="${token}" style="color:var(--fab-${token})"></i>`
  ),
  ...['bg-0', 'bg-3'].map(
    (token) => `<i data-probe="${token}" style="background:var(--fab-${token})"></i>`
  ),
  '<i data-probe="canvastext" style="forced-color-adjust:none;color:canvastext"></i>',
  '<i data-probe="canvas" style="forced-color-adjust:none;background:canvas"></i>',
].join('');
const NAME = 'Stage 3';

let page;

before(async () => {
  page = await publishedAxPage({
    tmpPrefix: 'fabricate-medallion-text-rendered-',
    cases: CASES,
    components: ['Medallion'],
    before: PROBES,
  });
  await page.tab.evaluate((name) => {
    const cell = document.querySelector('[data-case="named"]');
    cell.insertAdjacentHTML('beforeend', `<span data-companion-name>${name}</span>`);
  }, NAME);
});

after(async () => {
  await page?.close();
});

/** A computed `rgb()` or `rgba()` as the `rgb(r g b / a%)` form the contrast helper reads. */
const palette = (value) => {
  const [r, g, b, a = 1] = value.match(/[\d.]+/gu).map(Number);
  return `rgb(${r} ${g} ${b} / ${a * 100}%)`;
};

/** Every probe, and each tile's text ink, ground, glyph ink and fit, as computed now. */
const measure = () =>
  page.tab.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
    const style = (node) => getComputedStyle(node);
    const probes = Object.fromEntries(
      [...document.querySelectorAll('[data-probe]')].map((node) => [
        node.dataset.probe,
        /^(text|[a-z]+-text|canvastext)$/u.test(node.dataset.probe)
          ? style(node).color
          : style(node).backgroundColor,
      ])
    );
    const page = style(document.querySelector('.fabricate-app')).backgroundColor;
    const tiles = Object.fromEntries(
      [...document.querySelectorAll('[data-case]')].map((cell) => {
        const tile = cell.querySelector('.fab-medallion');
        const text = tile.querySelector('.fab-medallion-text');
        const glyph = tile.querySelector('i');
        const box = tile.getBoundingClientRect();
        const inner = text?.getBoundingClientRect();
        return [
          cell.dataset.case,
          {
            ground: style(tile).backgroundColor,
            edge: style(tile).borderTopColor,
            textInk: text ? style(text).color : null,
            glyphInk: glyph ? style(glyph).color : null,
            fits: text
              ? inner.left >= box.left &&
                inner.right <= box.right &&
                inner.top >= box.top &&
                inner.bottom <= box.bottom &&
                tile.scrollWidth <= tile.clientWidth
              : null,
            centre: text
              ? [
                  inner.left + inner.width / 2 - (box.left + box.width / 2),
                  inner.top + inner.height / 2 - (box.top + box.height / 2),
                ]
              : null,
            transition: [
              style(tile).transitionDuration,
              text ? style(text).transitionDuration : '',
            ],
            animation: [style(tile).animationName, text ? style(text).animationName : ''],
          },
        ];
      })
    );
    return { probes, page, tiles };
  });

const themed = async (theme) => {
  await page.tab.evaluate(
    ([attribute, value]) => document.querySelector('.fabricate').setAttribute(attribute, value),
    [FABRICATE_THEME_ATTRIBUTE, theme]
  );
  return measure();
};

/** A computed colour's red, green and blue, which forced colours keep opaque and may give an alpha. */
const channelsOf = (value) =>
  value
    .match(/[\d.]+/gu)
    .slice(0, 3)
    .map(Number);

/** WCAG contrast of `ink` over `ground` as drawn, the ground composited over `page`. */
const ratio = (ink, ground, page) => {
  const [r, g, b, a] = palette(ground)
    .match(/[\d.]+/gu)
    .map(Number);
  const under = palette(page)
    .match(/[\d.]+/gu)
    .map(Number);
  const flat = [r, g, b].map((value, index) => value * a + under[index] * (1 - a));
  return contrast(palette(ink), `rgb(${flat.join(' ')})`);
};

describe('the published Medallion’s text and accent ink in Chromium', () => {
  for (const theme of Object.values(FABRICATE_THEME_IDS)) {
    it(`inks the numeral --fab-text on the slate tile and its tone’s -text on a toned one, at 4.5:1 or more, in ${theme}`, async () => {
      const { probes, page: pageGround, tiles } = await themed(theme);
      assert.equal(tiles.plain.textInk, probes.text);
      assert.equal(tiles.plain.ground, probes['bg-3']);
      assert.ok(ratio(tiles.plain.textInk, tiles.plain.ground, pageGround) >= 4.5, 'plain');
      assert.equal(tiles['text-ink'].textInk, probes.text, 'neither ink nor tint reaches it');
      for (const tone of TONES) {
        const tile = tiles[`tone-${tone}`];
        assert.equal(tile.textInk, probes[`${tone}-text`], tone);
        assert.notEqual(tile.ground, tiles.plain.ground, tone);
        const read = ratio(tile.textInk, tile.ground, pageGround);
        assert.ok(read >= 4.5, `${tone} reads ${read.toFixed(2)}:1 over the page ground`);
      }
    });

    it(`inks the glyph alone in --fab-accent-text for ink accent, and leaves the ground alone, in ${theme}`, async () => {
      const { probes, page: pageGround, tiles } = await themed(theme);
      assert.equal(tiles['ink-accent'].glyphInk, probes['accent-text']);
      assert.equal(tiles['ink-accent'].ground, tiles.glyph.ground);
      assert.equal(tiles['ink-accent'].edge, tiles.glyph.edge);
      const read = ratio(tiles['ink-accent'].glyphInk, tiles['ink-accent'].ground, pageGround);
      assert.ok(read >= 3, `the accent glyph reads ${read.toFixed(2)}:1 on the slate tile`);
    });
  }

  it('fits a three-character numeral inside every rung, bordered or not, centred in the tile', async () => {
    const { tiles } = await themed(FABRICATE_THEME_IDS.FABRICATE);
    for (const [size] of LADDER) {
      for (const id of [`rung-${size}`, `chip-${size}`]) {
        assert.equal(tiles[id].fits, true, id);
        assert.ok(
          tiles[id].centre.every((offset) => Math.abs(offset) <= 1),
          `${id} is centred`
        );
      }
    }
  });

  it('hides the numeral from the accessibility tree, so the companion’s name is all it holds', async () => {
    const cell = page.tab.locator('[data-case="named"]');
    assert.equal(await cell.ariaSnapshot(), `- text: ${NAME}`);
    const session = await page.tab.context().newCDPSession(page.tab);
    try {
      const { nodes } = await session.send('Accessibility.getFullAXTree');
      const numeral = nodes.filter((node) => node.name?.value === '3' || node.value?.value === '3');
      assert.deepEqual(
        numeral.filter((node) => !node.ignored),
        [],
        'no exposed node carries the numeral'
      );
      const named = nodes.filter((node) => node.name?.value === NAME && !node.ignored);
      assert.notEqual(named.length, 0, 'the companion’s name is exposed');
    } finally {
      await session.detach();
    }
    assert.equal(
      await page.tab.locator('[data-case="plain"]').ariaSnapshot(),
      '',
      'a numbered tile alone holds nothing'
    );
    assert.equal(await page.tab.locator('[data-case="glyph"]').ariaSnapshot(), '', 'as the glyph');
  });

  it('draws the numeral in the system text colour on the system ground’s colour under forced colours', async () => {
    await themed(FABRICATE_THEME_IDS.FABRICATE);
    await page.tab.emulateMedia({ forcedColors: 'active' });
    try {
      const { probes, tiles } = await measure();
      for (const id of ['plain', ...TONES.map((tone) => `tone-${tone}`)]) {
        assert.equal(tiles[id].textInk, probes.canvastext, id);
        assert.deepEqual(channelsOf(tiles[id].ground), channelsOf(probes.canvas), id);
        assert.equal(tiles[id].fits, true, id);
      }
      assert.notEqual(probes.canvastext, probes.canvas);
    } finally {
      await page.tab.emulateMedia({ forcedColors: 'none' });
    }
  });

  it('declares no transition or animation, so reduced motion changes nothing', async () => {
    const before = (await measure()).tiles;
    await page.tab.emulateMedia({ reducedMotion: 'reduce' });
    try {
      const after = (await measure()).tiles;
      for (const id of ['plain', 'glyph', 'ink-accent', ...TONES.map((tone) => `tone-${tone}`)]) {
        assert.deepEqual(after[id], before[id], id);
        assert.deepEqual(after[id].animation, [
          'none',
          id.startsWith('tone-') || id === 'plain' ? 'none' : '',
        ]);
        assert.ok(
          after[id].transition.every((duration) => duration === '0s' || duration === ''),
          id
        );
      }
    } finally {
      await page.tab.emulateMedia({ reducedMotion: 'no-preference' });
    }
  });
});

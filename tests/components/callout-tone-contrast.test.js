/**
 * Issue 2601: the published `Callout`'s inks over each tone's translucent fill, in all seven
 * themes, on the four grounds its group names. The title, an item's lead and the glyphs clear their
 * floors at every tone on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and the title
 * not on `--fab-bg-3`; the muted body clears 4.5:1 there at `neutral`, at `danger` off
 * `--fab-bg-2`, and falls short in the default palette at the other four tones. Every ink and fill
 * is read off the component's own rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_FABRICATE_THEME } from '../../src/ui/theme.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const CALLOUT = 'src/ui/svelte/components/Callout.svelte';
const corpus = collectStyleCorpus();
const rules = rulesIn(corpus[CALLOUT]);
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const TINTED = ['info', 'accent', 'warning', 'success', 'danger'];
const token = (selector, property) => declaredToken(rules, selector, property, CALLOUT);

/** Each tone's fill and its title, leading glyph and item glyph inks. */
const TONES = Object.freeze({
  neutral: {
    fill: token('.manager-callout', 'background'),
    title: token('.manager-callout-title', 'color'),
    glyph: token('.manager-callout > i', 'color'),
    itemGlyph: token('.manager-callout-item > i', 'color'),
  },
  ...Object.fromEntries(
    TINTED.map((tone) => [
      tone,
      {
        fill: token(`.manager-callout.is-${tone}`, 'background'),
        title: token(`.manager-callout.is-${tone} .manager-callout-title`, 'color'),
        glyph: token(`.manager-callout.is-${tone} > i`, 'color'),
        itemGlyph: token(`.manager-callout.is-${tone} .manager-callout-item > i`, 'color'),
      },
    ])
  ),
});
const BODY = token('.manager-callout', 'color');
const LEAD = token('.manager-callout-item-lead', 'color');

/** The palettes where `ink` reads under `floor` on `tone`'s fill over `ground`. */
const shortOn = (ink, tone, ground, floor = 4.5) =>
  shortfalls(themes, ink, [TONES[tone].fill, ground], floor).map((line) => line.split(':', 1)[0]);

test('the body inks --fab-text-muted at every tone, which its text and items inherit', () => {
  assert.equal(BODY, '--fab-text-muted');
  const inked = rules.flatMap((rule) =>
    propertiesOf(rule).has('color') ? splitSelectorList(rule.selector) : []
  );
  assert.deepEqual(
    inked.filter((selector) => !/(?:> i|-title|-item-lead)$/u.test(selector)),
    ['.manager-callout'],
    'no rule but the root inks the body, the text or an item’s text'
  );
});

test('each tone paints its own fill, and inks its title and glyphs alike', () => {
  assert.deepEqual(TONES.neutral, {
    fill: '--fab-surface-soft',
    title: '--fab-text',
    glyph: '--fab-text-subtle',
    itemGlyph: '--fab-text-subtle',
  });
  for (const tone of TINTED) {
    const text = `--fab-${tone}-text`;
    assert.deepEqual(TONES[tone], {
      fill: `--fab-${tone}-soft`,
      title: text,
      glyph: text,
      itemGlyph: text,
    });
  }
  assert.equal(LEAD, '--fab-text', 'an item’s lead at every tone');
});

for (const tone of Object.keys(TONES)) {
  for (const ground of GROUNDS) {
    test(`at ${tone} on ${ground}, the title and lead clear 4.5:1 and the glyphs 3:1 in every theme`, () => {
      assert.deepEqual(shortOn(TONES[tone].title, tone, ground), [], 'the title');
      assert.deepEqual(shortOn(LEAD, tone, ground), [], 'an item’s lead');
      assert.deepEqual(shortOn(TONES[tone].glyph, tone, ground, 3), [], 'the leading glyph');
      assert.deepEqual(shortOn(TONES[tone].itemGlyph, tone, ground, 3), [], 'an item’s glyph');
    });
  }

  test(`at ${tone} the title falls short of 4.5:1 on --fab-bg-3 in some theme`, () => {
    assert.ok(shortOn(TONES[tone].title, tone, '--fab-bg-3').length > 0);
  });
}

test('the body clears 4.5:1 in every theme at neutral on the four grounds, and at danger off --fab-bg-2', () => {
  for (const ground of GROUNDS) assert.deepEqual(shortOn(BODY, 'neutral', ground), [], ground);
  for (const ground of GROUNDS.slice(0, 3)) {
    assert.deepEqual(shortOn(BODY, 'danger', ground), [], ground);
  }
});

test('the body falls short on --fab-bg-1 in the default palette alone at the other four tones, and on --fab-bg-2 at every tinted tone', () => {
  for (const tone of ['info', 'accent', 'warning', 'success']) {
    assert.deepEqual(shortOn(BODY, tone, '--fab-bg-1'), [DEFAULT_FABRICATE_THEME], tone);
  }
  for (const tone of TINTED) {
    assert.ok(shortOn(BODY, tone, '--fab-bg-2').includes(DEFAULT_FABRICATE_THEME), tone);
  }
});

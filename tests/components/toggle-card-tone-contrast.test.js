/**
 * The published `ToggleCard`'s tones, read off the shipped rules over the seven palettes on the four
 * grounds a card is mounted on: the title clears 4.5:1 on every toned fill, the sub line too in the
 * secondary ink a toned card takes (the muted ink falls short on a toned fill, where pinned), the
 * switch's accent track clears 3:1 against every toned fill and the knob 3:1 on the track, and a
 * toned glyph clears 3:1. Every tone's edge falls short of 3:1 against the ground in some palette,
 * which is why the switch and its words carry the state rather than the card's edge or fill.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const corpus = collectStyleCorpus();
const sheet = rulesIn(corpus[SHEET]);
const themes = themePalettes(sheet);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

/** Each tone the card publishes, its class and the family whose tokens it wears. */
const TONES = Object.freeze([
  ['enabled', 'is-enabled', 'success'],
  ['locked', 'is-locked', 'accent'],
  ['info', 'is-info', 'info'],
]);

const CARD = '.fabricate-toggle-card.manager-recipe-status-card';
const ON = (cls) => `${CARD}.${cls}.is-on`;
const token = (selector, property) => declaredToken(sheet, selector, property, SHEET);

/** The palettes where `ink` reads under `floor` on `family`'s soft fill over `ground`. */
const shortOn = (ink, family, ground, floor = 4.5) =>
  shortfalls(themes, ink, [`--fab-${family}-soft`, ground], floor);

test('each tone draws its family’s edge on its soft fill, only while on', () => {
  for (const [, cls, family] of TONES) {
    assert.equal(token(ON(cls), 'background'), `--fab-${family}-soft`, cls);
    assert.equal(token(ON(cls), 'border-color'), `--fab-${family}-border`, cls);
  }
});

test('the title inks the window’s body ink and clears 4.5:1 on every tone’s fill over the four grounds', () => {
  const body = token('.fabricate.fabricate-app', 'color');
  assert.equal(body, '--fab-text');
  for (const [tone, , family] of TONES) {
    for (const ground of GROUNDS) assert.deepEqual(shortOn(body, family, ground), [], tone);
  }
});

test('a toned, on card draws its sub line in the secondary ink, which clears 4.5:1 on every fill where the muted ink does not', () => {
  const resting = token(
    `${CARD.replace('.manager-recipe-status-card', '')} .manager-recipe-status-sub`,
    'color'
  );
  assert.equal(resting, '--fab-text-muted');
  assert.deepEqual(shortfalls(themes, resting, ['--fab-surface-soft', '--fab-bg-2']), []);
  for (const [tone, cls, family] of TONES) {
    const ink = token(`${ON(cls)} .manager-recipe-status-sub`, 'color');
    assert.equal(ink, '--fab-text-secondary', tone);
    for (const ground of GROUNDS) assert.deepEqual(shortOn(ink, family, ground), [], tone);
    assert.ok(
      GROUNDS.some((ground) => shortOn(resting, family, ground).length > 0),
      `${tone}: the muted ink falls short somewhere, which is why the secondary one is drawn`
    );
  }
});

test('the switch’s accent track clears 3:1 against every tone’s fill, and its knob clears 3:1 on the track', () => {
  for (const [tone, , family] of TONES) {
    for (const ground of GROUNDS)
      assert.deepEqual(shortOn('--fab-accent', family, ground, 3), [], tone);
  }
  const knob = declaredToken(
    sheet.filter((rule) => !rule.context),
    '.fabricate-toggle.fabricate-toggle.is-on',
    '--fab-toggle-knob',
    SHEET
  );
  assert.equal(knob, '--fab-bg-1');
  assert.deepEqual(shortfalls(themes, knob, ['--fab-accent'], 3), []);
});

test('a toned glyph clears 3:1 on its fill over the four grounds', () => {
  const glyph = (cls) => {
    const selector = `${ON(cls)} .manager-recipe-status-icon`;
    const toned = sheet.some((rule) => splitSelectorList(rule.selector).includes(selector));
    return token(toned ? selector : '.fabricate-toggle-card .manager-recipe-status-icon', 'color');
  };
  for (const [tone, cls, family] of TONES) {
    for (const ground of GROUNDS)
      assert.deepEqual(shortOn(glyph(cls), family, ground, 3), [], tone);
  }
});

test('every tone’s edge falls short of 3:1 against the ground in some palette, so the edge never carries the state', () => {
  for (const [tone, , family] of TONES) {
    const short = GROUNDS.map(
      (ground) => shortfalls(themes, `--fab-${family}-border`, [ground], 3).length
    );
    assert.ok(Math.max(...short) > 0, tone);
  }
});

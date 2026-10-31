/**
 * Issue 2854: the published `InspectorCard`'s and `Well`'s tones over the seven themes, on the four
 * grounds their groups name, read off the shipped rules. The card's title and its toned note clear
 * 4.5:1 on every tone's fill, a toned well's label too, and a published `Button`'s ring 3:1; the
 * muted ink a companion's own small text takes falls short where pinned, and so does every tone's
 * edge, which is why the state is said in words.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_FABRICATE_THEME } from '../../src/ui/theme.js';
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const WELL = 'src/ui/svelte/components/Well.svelte';
const KICKER = 'src/ui/svelte/components/Kicker.svelte';
const corpus = collectStyleCorpus();
const sheet = rulesIn(corpus[SHEET]);
const themes = themePalettes(sheet);
const TONES = ['warning', 'success', 'accent', 'info'];
const FOUR = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const CARD = (tone) => `.fabricate-card.fabricate-card.is-tone-${tone}`;
const WELL_TONE = (tone) => `.fab-well.fab-well.is-tone-${tone}`;
const card = (selector, property) => declaredToken(sheet, selector, property, SHEET);
const well = (selector, property) => declaredToken(rulesIn(corpus[WELL]), selector, property, WELL);

const fillOf = (tone) => card(CARD(tone), 'background');
const TITLE = card('.fabricate-card .fab-card-heading > .fab-card-title', 'color');
const NOTE = card('.fabricate-card .fab-card-heading > .fab-card-note', 'color');
const TONED_NOTE = card(`${CARD('warning')} .fab-card-note`, 'color');
const LABEL = declaredToken(rulesIn(corpus[KICKER]), '.fab-kicker', 'color', KICKER);

/** The number of themes where `ink` reads under `floor` on `tone`'s fill over `ground`. */
const shortOn = (ink, tone, ground, floor = 4.5) =>
  shortfalls(themes, ink, [fillOf(tone), ground], floor).length;

test('each tone draws its own -border edge on its -soft fill, on the card and on the well alike', () => {
  for (const tone of TONES) {
    assert.equal(fillOf(tone), `--fab-${tone}-soft`, tone);
    assert.equal(card(CARD(tone), 'border-color'), `--fab-${tone}-border`, tone);
    assert.equal(well(WELL_TONE(tone), 'background'), fillOf(tone), `the well at ${tone}`);
    assert.equal(well(WELL_TONE(tone), 'border-color'), `--fab-${tone}-border`, tone);
  }
});

test('the title inks --fab-text and clears 4.5:1 on every tone’s fill over the four grounds, and not over --fab-bg-3', () => {
  assert.equal(TITLE, '--fab-text');
  for (const tone of TONES) {
    for (const ground of FOUR) assert.equal(shortOn(TITLE, tone, ground), 0, `${tone} ${ground}`);
    assert.ok(shortOn(TITLE, tone, '--fab-bg-3') > 0, `${tone} over --fab-bg-3`);
  }
});

test('the note inks --fab-text-muted on the untoned card and --fab-text-secondary on a toned one, each clearing 4.5:1', () => {
  assert.deepEqual([NOTE, TONED_NOTE], ['--fab-text-muted', '--fab-text-secondary']);
  assert.deepEqual(shortfalls(themes, NOTE, ['--fab-bg-2']), [], 'on the card’s own --fab-bg-2');
  for (const tone of TONES) {
    const note = card(`${CARD(tone)} .fab-card-note`, 'color');
    assert.equal(note, TONED_NOTE, tone);
    for (const ground of FOUR) assert.equal(shortOn(note, tone, ground), 0, `${tone} ${ground}`);
  }
});

test('the muted ink an untoned label and a companion’s small text take falls short on a toned fill, theme for theme as stated', () => {
  assert.equal(LABEL, '--fab-text-muted', 'the label is a Kicker');
  const counts = Object.fromEntries(
    TONES.map((tone) => [tone, FOUR.map((ground) => shortOn(LABEL, tone, ground))])
  );
  assert.deepEqual(counts, {
    warning: [1, 1, 1, 6],
    success: [0, 1, 1, 6],
    accent: [1, 1, 1, 6],
    info: [1, 1, 1, 5],
  });
  for (const tone of TONES) {
    const onBg1 = shortfalls(themes, LABEL, [fillOf(tone), '--fab-bg-1']);
    assert.deepEqual(
      onBg1.map((line) => line.split(':', 1)[0]),
      [DEFAULT_FABRICATE_THEME],
      `${tone}: the default palette alone on --fab-bg-1`
    );
  }
});

test('a toned well’s label inks --fab-text-secondary and clears 4.5:1 on every tone’s fill over the four grounds', () => {
  for (const tone of TONES) {
    const label = well(`${WELL_TONE(tone)} > .fab-well-label > :global(.fab-kicker)`, 'color');
    assert.equal(label, '--fab-text-secondary', tone);
    for (const ground of FOUR) assert.equal(shortOn(label, tone, ground), 0, `${tone} ${ground}`);
  }
});

test('every tone’s edge falls short of 3:1 against the ground beyond it in some theme on each of the four grounds', () => {
  const counts = Object.fromEntries(
    TONES.map((tone) => [
      tone,
      FOUR.map((ground) => shortfalls(themes, `--fab-${tone}-border`, [ground], 3).length),
    ])
  );
  assert.deepEqual(counts, {
    warning: [1, 1, 1, 2],
    success: [1, 3, 3, 4],
    accent: [3, 3, 3, 4],
    info: [6, 6, 6, 6],
  });
});

test('a published Button’s ring clears 3:1 on every tone’s fill over the four grounds', () => {
  const ring = sheet
    .filter((rule) => rule.selector === '.fabricate-button:focus-visible')
    .map((rule) => rule.body.match(/outline:\s*([^;]+)/u)?.[1]?.trim());
  assert.deepEqual(ring, ['2px solid var(--fab-accent)']);
  for (const tone of TONES) {
    for (const ground of FOUR) assert.equal(shortOn('--fab-accent', tone, ground, 3), 0, tone);
  }
});

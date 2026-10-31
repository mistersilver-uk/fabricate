/**
 * Issue 2847: each `Medallion` `tone` and `ink` inks its glyph with its family's token, and the
 * glyph's contrast in all seven themes is what the ui-extension-points "Medallion" group states:
 * a tone's glyph and an ink over a tone clear 4.5:1 over the four page grounds, and an ink on the
 * slate tile clears 3:1 with the named 4.5:1 shortfalls.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const MEDALLION = 'src/ui/svelte/components/Medallion.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[MEDALLION]);
const token = (selector, property) => declaredToken(rules, selector, property, MEDALLION);

const PAGE_GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const TONES = ['success', 'danger', 'accent', 'warning', 'info'];
const INKS = Object.freeze({
  success: '--fab-success-text',
  danger: '--fab-danger-text',
  neutral: '--fab-text-secondary',
  warning: '--fab-warning-text',
  info: '--fab-info-text',
});

/** Every reading of `ink` over a tone's ground under 4.5:1, across the page grounds. */
const toneShortfalls = (ink, tone, grounds = PAGE_GROUNDS) =>
  grounds.flatMap((ground) =>
    shortfalls(themes, ink, [token(`.fab-medallion.is-tone-${tone}`, 'background'), ground])
  );

test('each tone paints its own family on the edge, the ground and the glyph', () => {
  for (const tone of TONES) {
    const selector = `.fab-medallion.is-tone-${tone}`;
    assert.deepEqual(
      ['border-color', 'background', 'color'].map((property) => token(selector, property)),
      [`--fab-${tone}-border`, `--fab-${tone}-soft`, `--fab-${tone}-text`],
      tone
    );
  }
});

test('each ink inks the glyph alone with its declared token', () => {
  for (const [ink, inkToken] of Object.entries(INKS)) {
    assert.equal(token(`.fab-medallion.is-ink-${ink}`, 'color'), inkToken, ink);
  }
  assert.equal(token('.fab-medallion', 'background'), '--fab-bg-3', 'the untoned ground');
});

test("a tone's glyph clears 4.5:1 over every page ground in every theme, and not over --fab-bg-3", () => {
  for (const tone of TONES) {
    assert.deepEqual(toneShortfalls(`--fab-${tone}-text`, tone), [], tone);
  }
  for (const tone of TONES) {
    const overBg3 = toneShortfalls(`--fab-${tone}-text`, tone, ['--fab-bg-3']);
    assert.notDeepEqual(overBg3, [], `${tone} falls under 4.5:1 over --fab-bg-3 somewhere`);
  }
});

test("an ink over any tone's ground clears 4.5:1 over every page ground in every theme", () => {
  for (const ink of Object.values(INKS)) {
    for (const tone of TONES) {
      assert.deepEqual(toneShortfalls(ink, tone), [], `${ink} over ${tone}`);
    }
  }
});

test('an ink on the slate tile clears 3:1 in every theme, and 4.5:1 but for the named readings', () => {
  for (const ink of Object.values(INKS)) {
    assert.deepEqual(shortfalls(themes, ink, ['--fab-bg-3'], 3), [], ink);
  }
  const under = Object.entries(INKS).flatMap(([name, ink]) =>
    shortfalls(themes, ink, ['--fab-bg-3']).map((line) => `${line.split(':', 1)[0]} ${name}`)
  );
  assert.deepEqual(
    under.toSorted((a, b) => a.localeCompare(b)),
    [
      'hearth-herb danger',
      'hearth-herb info',
      'hearth-herb neutral',
      'hearth-herb success',
      'ironblood-forge danger',
      'ironblood-forge neutral',
    ]
  );
  const weakest = Math.min(
    ...[...themes.values()].flatMap((tokens) =>
      Object.values(INKS).map((ink) => contrast(tokens.get(ink), tokens.get('--fab-bg-3')))
    )
  );
  assert.equal(weakest.toFixed(2), '3.50', 'the weakest, danger in hearth-herb');
});

/**
 * Each `Medallion` `tone` and `ink` inks its glyph with its family's token, and the glyph's
 * contrast in all seven themes is what the ui-extension-points "Medallion" group states: a tone's
 * glyph and an ink over a tone clear 4.5:1 over the four page grounds, and an ink on the slate tile
 * clears 3:1 with the named 4.5:1 shortfalls. A drawn `text` is small text, so it inks
 * `--fab-text` on the slate tile and its tone's `-text` on a toned one, and clears 4.5:1 on both.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  propertiesOf,
  shortfalls,
  stackGround,
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
  accent: '--fab-accent-text',
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
      'hearth-herb accent',
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

test("a drawn text inks --fab-text on the slate tile and its tone's -text on a toned one", () => {
  const text = '.fab-medallion-text';
  assert.equal(token(text, 'color'), '--fab-text');
  for (const tone of TONES) {
    assert.equal(token(`.fab-medallion.is-tone-${tone} ${text}`, 'color'), `--fab-${tone}-text`);
  }
  for (const ink of Object.keys(INKS)) {
    const rule = rules.filter((candidate) => candidate.selector.includes(`.is-ink-${ink} ${text}`));
    assert.deepEqual(rule, [], `${ink} inks the glyph alone, so it reaches no text rule`);
  }
});

test('a drawn text clears 4.5:1 on the slate tile and on every tone over the four page grounds in every theme', () => {
  assert.deepEqual(shortfalls(themes, '--fab-text', ['--fab-bg-3']), []);
  for (const tone of TONES) {
    assert.deepEqual(toneShortfalls(`--fab-${tone}-text`, tone), [], tone);
  }
  const weakest = Math.min(
    ...[...themes.values()].map((tokens) =>
      contrast(tokens.get('--fab-text'), tokens.get('--fab-bg-3'))
    )
  );
  assert.equal(weakest.toFixed(2), '4.90', 'the weakest, --fab-text on slate in hearth-herb');
});

test('the accent ink clears 3:1 on the slate tile and falls under 4.5:1 only in hearth-herb', () => {
  assert.deepEqual(shortfalls(themes, '--fab-accent-text', ['--fab-bg-3'], 3), []);
  assert.deepEqual(shortfalls(themes, '--fab-accent-text', ['--fab-bg-3']), [
    'hearth-herb: --fab-accent-text on --fab-bg-3 4.15:1',
  ]);
});

test('a drawn text on a tone reads 5.85:1 at the weakest, danger in hearth-herb, over the four page grounds', () => {
  const readings = TONES.flatMap((tone) =>
    PAGE_GROUNDS.flatMap((ground) =>
      [...themes].map(([theme, tokens]) => ({
        name: `${theme} ${tone}`,
        ratio: contrast(
          tokens.get(`--fab-${tone}-text`),
          stackGround(tokens, [`--fab-${tone}-soft`, ground])
        ),
      }))
    )
  );
  const weakest = readings.reduce((low, next) => (next.ratio < low.ratio ? next : low));
  assert.equal(weakest.name, 'hearth-herb danger');
  assert.equal(weakest.ratio.toFixed(2), '5.85');
});

test("a tone's -text over a list row's selected or hovered fill clears 4.5:1 but for danger in hearth-herb on --fab-bg-2 under the selected fill", () => {
  const under = (rowGround) =>
    TONES.flatMap((tone) =>
      PAGE_GROUNDS.flatMap((ground) =>
        shortfalls(themes, `--fab-${tone}-text`, [`--fab-${tone}-soft`, rowGround, ground])
      )
    );
  assert.deepEqual(under('--fab-surface-raised'), []);
  assert.deepEqual(under('--fab-surface-active'), [
    'hearth-herb: --fab-danger-text on --fab-danger-soft over --fab-surface-active over --fab-bg-2 4.39:1',
  ]);
});

test('the tile declares no transition, no animation and no forced-colour opt-out', () => {
  const declared = rules.flatMap((rule) => [...propertiesOf(rule).keys()]);
  assert.deepEqual(
    declared.filter((property) => /^(transition|animation|forced-color-adjust)/u.test(property)),
    []
  );
});
